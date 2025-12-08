import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Schedule } from '@/entities/Schedule';
import { Client } from '@/entities/Client';
import { DailyReconciliation } from '@/entities/DailyReconciliation';
import { User } from '@/entities/User';
import ReconciliationModal from '../components/conciliacion/ReconciliationModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format, startOfDay, endOfDay, isEqual, parseISO, addDays, subDays, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, Edit, CheckCircle, Clock, DollarSign, FileCheck, Circle, Send, Landmark, Loader2, ChevronLeft, ChevronRight, AlertTriangle, FileSignature, Eye, X, Trash2, AlertCircle, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { processScheduleForWorkEntries } from '@/functions/processScheduleForWorkEntries';

// Función para extraer hora UTC
const formatTimeUTC = (isoString) => {
    if (!isoString) return '';
    const correctedIsoString = isoString.endsWith('Z') ? isoString : `${isoString}Z`;
    const date = new Date(correctedIsoString);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
};

const statusConfig = {
    pending: {
        color: 'bg-red-500',
        textColor: 'text-red-700',
        bgColor: 'bg-gradient-to-r from-red-50 to-red-100',
        borderColor: 'border-red-300',
        text: 'Pendiente de Revisión (Horario)',
        icon: <Circle className="w-6 h-6 text-red-500" />,
    },
    horario_reviewed: {
        color: 'bg-blue-500',
        textColor: 'text-blue-700',
        bgColor: 'bg-gradient-to-r from-blue-50 to-blue-100',
        borderColor: 'border-blue-300',
        text: 'Revisado / Listo para Facturar',
        icon: <FileCheck className="w-6 h-6 text-blue-500" />,
    },
    completed: {
        color: 'bg-green-500',
        textColor: 'text-green-700',
        bgColor: 'bg-gradient-to-r from-green-50 to-green-100',
        borderColor: 'border-green-300',
        text: 'Día Facturado Completamente',
        icon: <CheckCircle className="w-6 h-6 text-green-500" />,
    }
};

const gstTypeLabels = {
    inclusive: 'GST Incluido',
    exclusive: 'GST Exclusivo',
    no_tax: 'Sin Impuestos'
};

const gstTypeBadgeColors = {
    inclusive: 'bg-blue-50 text-blue-700 border border-blue-200',
    exclusive: 'bg-purple-50 text-purple-700 border border-purple-200',
    no_tax: 'bg-slate-50 text-slate-700 border border-slate-200'
};

// NUEVA FUNCIÓN: Obtiene el precio correcto para mostrar, consultando price_history si es necesario
const getPriceForDate = (client, serviceDate) => {
    if (!client || !serviceDate) return { price: 0, gstType: 'inclusive' };
    
    // Si el cliente no tiene historial de precios, usar el precio actual
    if (!client.price_history || client.price_history.length === 0) {
        return {
            price: client.current_service_price || 0,
            gstType: client.gst_type || 'inclusive'
        };
    }
    
    // Convertir la fecha del servicio a formato comparable (YYYY-MM-DD)
    const serviceDateStr = format(parseISO(serviceDate), 'yyyy-MM-dd');
    
    // Ordenar el historial por fecha efectiva (más reciente primero)
    const sortedHistory = [...client.price_history].sort((a, b) => {
        return new Date(b.effective_date) - new Date(a.effective_date);
    });
    
    // Buscar el precio que estaba vigente en la fecha del servicio
    // (la entrada más reciente cuya effective_date sea <= serviceDate)
    for (const historyEntry of sortedHistory) {
        if (historyEntry.effective_date <= serviceDateStr) {
            return {
                price: historyEntry.new_price || client.current_service_price || 0,
                gstType: historyEntry.gst_type || client.gst_type || 'inclusive'
            };
        }
    }
    
    // Si no encontramos ninguna entrada en el historial que aplique,
    // usar el precio más antiguo del historial o el actual como fallback
    const oldestEntry = sortedHistory[sortedHistory.length - 1];
    if (oldestEntry) {
        return {
            price: oldestEntry.previous_price || oldestEntry.new_price || client.current_service_price || 0,
            gstType: oldestEntry.gst_type || client.gst_type || 'inclusive'
        };
    }
    
    // Fallback final: precio actual del cliente
    return {
        price: client.current_service_price || 0,
        gstType: client.gst_type || 'inclusive'
    };
};

export default function ConciliacionFacturasPage() {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [schedules, setSchedules] = useState([]);
    const [clients, setClients] = useState(new Map());
    const [users, setUsers] = useState([]);
    const [dailyReconciliation, setDailyReconciliation] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [editingService, setEditingService] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [serviceToDelete, setServiceToDelete] = useState(null);
    const [monthlyViewDate, setMonthlyViewDate] = useState(new Date());
    const [monthlyData, setMonthlyData] = useState([]);
    const [loadingMonthly, setLoadingMonthly] = useState(false);
    const [trainingClientId, setTrainingClientId] = useState(null);

    const usersMap = useMemo(() => {
        return new Map(users.map(u => [u.id, u]));
    }, [users]);

    const calculateDayTotals = useCallback((schedulesForDay) => {
        let totalBase = 0;
        let totalGST = 0;
        let totalConGST = 0;
        
        schedulesForDay.forEach(service => {
            const client = clients.get(service.client_id);
            let gstType, rawAmount;
            
            if (service.xero_invoiced && service.billed_gst_type_snapshot) {
                gstType = service.billed_gst_type_snapshot;
            } else {
                const priceForDate = getPriceForDate(client, service.start_time);
                gstType = priceForDate.gstType;
            }
            
            if (service.reconciliation_items && service.reconciliation_items.length > 0) {
                rawAmount = service.reconciliation_items.reduce((itemTotal, item) => {
                    const itemAmount = parseFloat(item.amount) || 0;
                    return item.type === 'discount' ? itemTotal - itemAmount : itemTotal + itemAmount;
                }, 0);
            } else {
                if (service.xero_invoiced && service.billed_price_snapshot !== undefined && service.billed_price_snapshot !== null) {
                    rawAmount = service.billed_price_snapshot;
                } else {
                    const priceForDate = getPriceForDate(client, service.start_time);
                    rawAmount = priceForDate.price;
                }
            }
            
            let base, gst;
            switch (gstType) {
                case 'inclusive':
                    base = rawAmount / 1.1;
                    gst = rawAmount - base;
                    break;
                case 'exclusive':
                    base = rawAmount;
                    gst = rawAmount * 0.1;
                    break;
                case 'no_tax':
                    base = rawAmount;
                    gst = 0;
                    break;
                default:
                    base = rawAmount;
                    gst = 0;
            }
            
            totalBase += base;
            totalGST += gst;
            totalConGST += (base + gst);
        });
        
        return { totalBase, totalGST, totalConGST };
    }, [clients]);

    const loadMonthlyData = useCallback(async (date) => {
        if (clients.size === 0) return;
        
        setLoadingMonthly(true);
        try {
            const monthStart = startOfMonth(date);
            const monthEnd = endOfMonth(date);
            const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
            
            const monthStartUTC = new Date(Date.UTC(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate(), 0, 0, 0, 0));
            const monthEndUTC = new Date(Date.UTC(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate(), 23, 59, 59, 999));
            
            const [schedulesData, reconciliationData] = await Promise.all([
                Schedule.filter({
                    start_time: {
                        $gte: monthStartUTC.toISOString(),
                        $lte: monthEndUTC.toISOString()
                    }
                }, '-start_time'),
                DailyReconciliation.filter({
                    date: {
                        $gte: format(monthStart, 'yyyy-MM-dd'),
                        $lte: format(monthEnd, 'yyyy-MM-dd')
                    }
                })
            ]);
            
            const reconMap = new Map(reconciliationData.map(r => [r.date, r]));
            
            const dailyData = days.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const daySchedules = schedulesData.filter(s => {
                    const scheduleDate = format(parseISO(s.start_time), 'yyyy-MM-dd');
                    return scheduleDate === dateStr && 
                           s.status !== 'cancelled' && 
                           s.xero_invoiced === true &&
                           s.client_id !== trainingClientId;
                });
                
                const totals = calculateDayTotals(daySchedules);
                const reconciliation = reconMap.get(dateStr);
                
                return {
                    date: day,
                    dateStr,
                    serviceCount: daySchedules.length,
                    totalBase: totals.totalBase,
                    totalGST: totals.totalGST,
                    totalConGST: totals.totalConGST,
                    status: reconciliation?.status || 'pending',
                    hasServices: daySchedules.length > 0
                };
            });
            
            setMonthlyData(dailyData);
            
            // DEBUG: Total del mes
            if (format(monthStart, 'yyyy-MM') === '2025-10') {
                const totalBase = dailyData.reduce((sum, day) => sum + day.totalBase, 0);
                const totalServices = dailyData.reduce((sum, day) => sum + day.serviceCount, 0);
                console.log(`[Conciliación] Total Base octubre 2025: $${totalBase.toFixed(2)}`);
                console.log(`[Conciliación] Total servicios octubre 2025: ${totalServices}`);
                console.log(`[Conciliación] Schedules facturados encontrados (sin TRAINING): ${schedulesData.filter(s => {
                    const dateStr = format(parseISO(s.start_time), 'yyyy-MM-dd');
                    return dateStr.startsWith('2025-10') && s.xero_invoiced === true && s.client_id !== trainingClientId;
                }).length}`);
            }
        } catch (err) {
            console.error("Error loading monthly data:", err);
        } finally {
            setLoadingMonthly(false);
        }
    }, [clients, calculateDayTotals]);

    useEffect(() => {
        if (clients.size > 0) {
            loadMonthlyData(monthlyViewDate);
        }
    }, [monthlyViewDate, clients, loadMonthlyData]);

    const loadAllRecords = async (entity, sortField = '-created_date') => {
        const BATCH_SIZE = 5000;
        let allRecords = [];
        let skip = 0;
        let hasMore = true;

        while (hasMore) {
            const batch = await entity.list(sortField, BATCH_SIZE, skip);
            const batchArray = Array.isArray(batch) ? batch : [];
            
            allRecords = [...allRecords, ...batchArray];
            
            if (batchArray.length < BATCH_SIZE) {
                hasMore = false;
            } else {
                skip += BATCH_SIZE;
            }
        }

        return allRecords;
    };

    const fetchClients = useCallback(async () => {
        try {
            const clientList = await loadAllRecords(Client, '-created_date');
            const clientMap = new Map();
            clientList.forEach(c => clientMap.set(c.id, c));
            setClients(clientMap);
            
            // Identificar cliente TRAINING
            const trainingClient = clientList.find(c => c.name === 'TRAINING' || c.client_type === 'training');
            if (trainingClient) {
                setTrainingClientId(trainingClient.id);
                console.log('[Conciliación] 🎓 Cliente TRAINING identificado:', trainingClient.id);
            }
        } catch (e) {
            console.error("Failed to fetch clients", e);
            setError("No se pudieron cargar los clientes.");
        }
    }, []);

    const fetchUsers = useCallback(async () => {
        try {
            const userList = await loadAllRecords(User, '-created_date');
            setUsers(Array.isArray(userList) ? userList : []);
        } catch (e) {
            console.error("Failed to fetch users", e);
        }
    }, []);

    const fetchDataForDate = useCallback(async (date) => {
        setLoading(true);
        setError(null);
        try {
            const year = date.getFullYear();
            const month = date.getMonth();
            const day = date.getDate();

            const startUTC = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
            const endUTC = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

            const dateStr = format(startUTC, 'yyyy-MM-dd');

            const [schedulesData, reconciliationData] = await Promise.all([
                Schedule.filter({
                    start_time: {
                        $gte: startUTC.toISOString(),
                        $lte: endUTC.toISOString()
                    }
                }, '-start_time'),
                DailyReconciliation.filter({ date: dateStr })
            ]);

            const activeSchedules = schedulesData.filter(schedule =>
                schedule.status !== 'cancelled' &&
                schedule.client_id !== trainingClientId
            );

            const sortedSchedules = activeSchedules.sort((a, b) => {
                if (a.xero_invoiced !== b.xero_invoiced) {
                    return a.xero_invoiced ? 1 : -1;
                }
                return new Date(a.start_time) - new Date(b.start_time);
            });

            setSchedules(sortedSchedules);

            if (reconciliationData.length > 0) {
                setDailyReconciliation(reconciliationData[0]);
            } else {
                setDailyReconciliation({ date: dateStr, status: 'pending' });
            }
        } catch (err) {
            console.error("Error fetching data for date:", err);
            setError("Hubo un error al cargar los datos para la fecha seleccionada.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            await fetchClients();
            await fetchUsers();
            const user = await User.me();
            setCurrentUser(user);
        };
        init();
    }, [fetchClients, fetchUsers]);

    useEffect(() => {
        if (clients.size > 0 && users.length > 0) {
            fetchDataForDate(selectedDate);
        }
    }, [selectedDate, clients, users, fetchDataForDate]);

    const handleSaveReconciliation = async (serviceId, items) => {
        try {
            await Schedule.update(serviceId, { reconciliation_items: items });
            setEditingService(null);
            fetchDataForDate(selectedDate);
        } catch (err) {
            console.error("Error saving reconciliation:", err);
            setError("No se pudo guardar los cambios en el servicio.");
        }
    };

    const handleMarkDayAsReviewed = async () => {
        setLoading(true);
        setError(null);
        try {
            const servicesToComplete = schedules.filter(s =>
                s.status !== 'completed' && s.status !== 'cancelled'
            );

            for (const service of servicesToComplete) {
                try {
                    await Schedule.update(service.id, { status: 'completed' });
                    
                    const result = await processScheduleForWorkEntries({
                        scheduleId: service.id,
                        mode: 'create'
                    });
                    console.log(`WorkEntries generadas para servicio ${service.id}:`, result);
                } catch (serviceErr) {
                    console.error(`Error procesando servicio ${service.id}:`, serviceErr);
                }
            }

            const updateData = {
                status: 'horario_reviewed',
                reviewed_by_user_id: currentUser.id,
                reviewed_at: new Date().toISOString()
            };
            if (dailyReconciliation.id) {
                await DailyReconciliation.update(dailyReconciliation.id, updateData);
            } else {
                await DailyReconciliation.create({ date: format(selectedDate, 'yyyy-MM-dd'), ...updateData });
            }

            fetchDataForDate(selectedDate);
        } catch (err) {
            console.error("Error marking day as reviewed:", err);
            setError("No se pudo marcar el día como revisado: " + (err.message || ""));
        } finally {
            setLoading(false);
        }
    };

    const handleReopenDay = async () => {
        setLoading(true);
        try {
            if (dailyReconciliation && dailyReconciliation.id) {
                await DailyReconciliation.update(dailyReconciliation.id, {
                    status: 'pending',
                    reviewed_by_user_id: null,
                    reviewed_at: null,
                    completed_at: null
                });
                fetchDataForDate(selectedDate);
            }
        } catch (err) {
            console.error("Error reopening day:", err);
            setError("No se pudo reabrir el día para revisión.");
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAsInvoiced = async (serviceId) => {
        setLoading(true);
        try {
            const service = schedules.find(s => s.id === serviceId);
            const client = clients.get(service.client_id);
            
            // CRÍTICO: Tomar "fotografía" del precio y GST en el momento de facturación
            const priceSnapshot = getPriceForDate(client, service.start_time);
            
            await Schedule.update(serviceId, { 
                xero_invoiced: true,
                billed_price_snapshot: priceSnapshot.price,
                billed_gst_type_snapshot: priceSnapshot.gstType,
                billed_at: new Date().toISOString()
            });

            const updatedSchedules = schedules.map(s =>
                s.id === serviceId ? {
                    ...s, 
                    xero_invoiced: true,
                    billed_price_snapshot: priceSnapshot.price,
                    billed_gst_type_snapshot: priceSnapshot.gstType,
                    billed_at: new Date().toISOString()
                } : s
            ).sort((a, b) => {
                if (a.xero_invoiced !== b.xero_invoiced) {
                    return a.xero_invoiced ? 1 : -1;
                }
                return new Date(a.start_time) - new Date(b.start_time);
            });

            setSchedules(updatedSchedules);

            const allInvoiced = updatedSchedules.every(s => s.xero_invoiced);
            if (allInvoiced && dailyReconciliation?.status !== 'completed') {
                const updateData = { status: 'completed', completed_at: new Date().toISOString() };
                if (dailyReconciliation.id) {
                    await DailyReconciliation.update(dailyReconciliation.id, updateData);
                } else {
                    await DailyReconciliation.create({ date: format(selectedDate, 'yyyy-MM-dd'), ...updateData });
                }
                fetchDataForDate(selectedDate);
            }
        } catch (err) {
            console.error("Error marking as invoiced:", err);
            setError("No se pudo marcar el servicio como facturado.");
        } finally {
            setLoading(false);
        }
    };

    const handleUnmarkAsInvoiced = async (serviceId) => {
        setLoading(true);
        try {
            // CRÍTICO: Al desmarcar, NO eliminar los snapshots por si se vuelve a facturar
            // Los snapshots solo se actualizan cuando se vuelve a marcar como facturado
            await Schedule.update(serviceId, { xero_invoiced: false });

            const updatedSchedules = schedules.map(s =>
                s.id === serviceId ? {...s, xero_invoiced: false} : s
            ).sort((a, b) => {
                if (a.xero_invoiced !== b.xero_invoiced) {
                    return a.xero_invoiced ? 1 : -1;
                }
                return new Date(a.start_time) - new Date(b.start_time);
            });

            setSchedules(updatedSchedules);

            if (dailyReconciliation?.status === 'completed') {
                const updateData = {
                    status: 'horario_reviewed',
                    completed_at: null
                };
                if (dailyReconciliation.id) {
                    await DailyReconciliation.update(dailyReconciliation.id, updateData);
                    fetchDataForDate(selectedDate);
                }
            }
        } catch (err) {
            console.error("Error unmarking as invoiced:", err);
            setError("No se pudo quitar el estado de facturado.");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (service) => {
        setServiceToDelete(service);
        setDeleteConfirmOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!serviceToDelete) return;

        setLoading(true);
        setError(null);
        try {
            await Schedule.delete(serviceToDelete.id);

            const updatedSchedules = schedules.filter(s => s.id !== serviceToDelete.id);
            setSchedules(updatedSchedules);

            setDeleteConfirmOpen(false);
            setServiceToDelete(null);

            if (updatedSchedules.length === 0 && dailyReconciliation?.id) {
                await DailyReconciliation.update(dailyReconciliation.id, {
                    status: 'pending',
                    reviewed_by_user_id: null,
                    reviewed_at: null,
                    completed_at: null
                });
            } else if (updatedSchedules.length === 0 && !dailyReconciliation?.id) {
                 setDailyReconciliation({ date: format(selectedDate, 'yyyy-MM-dd'), status: 'pending' });
            }

            fetchDataForDate(selectedDate);
        } catch (err) {
            console.error("Error deleting service:", err);
            setError("No se pudo eliminar el servicio. " + (err.message || ""));
        } finally {
            setLoading(false);
        }
    };

    const handleCancelDelete = () => {
        setDeleteConfirmOpen(false);
        setServiceToDelete(null);
    };

    const currentStatus = dailyReconciliation?.status || 'pending';
    const config = statusConfig[currentStatus];
    const isScheduler = currentUser?.role === 'admin';
    const isAccountant = currentUser?.role === 'admin';

    // MODIFICADO: Función que respeta el snapshot si está facturado
    const getReconciledAmount = (service) => {
        if (service.reconciliation_items && service.reconciliation_items.length > 0) {
            return service.reconciliation_items.reduce((total, item) => {
                const amount = parseFloat(item.amount) || 0;
                return item.type === 'discount' ? total - amount : total + amount;
            }, 0);
        }
        
        // CRÍTICO: Si está facturado, usar el snapshot
        if (service.xero_invoiced && service.billed_price_snapshot !== undefined && service.billed_price_snapshot !== null) {
            return service.billed_price_snapshot;
        }
        
        // Si no está facturado, calcular el precio vigente en la fecha del servicio
        const client = clients.get(service.client_id);
        const priceForDate = getPriceForDate(client, service.start_time);
        return priceForDate.price;
    };

    const totalDelDia = useMemo(() => {
        let totalBase = 0;
        let totalConGST = 0;
        
        schedules.filter(s => s.client_id !== trainingClientId).forEach(service => {
            const client = clients.get(service.client_id);
            let gstType, rawAmount;
            
            // Determinar el tipo de GST y monto bruto
            if (service.xero_invoiced && service.billed_gst_type_snapshot) {
                gstType = service.billed_gst_type_snapshot;
            } else {
                const priceForDate = getPriceForDate(client, service.start_time);
                gstType = priceForDate.gstType;
            }
            
            // Calcular el monto bruto (con GST si aplica)
            if (service.reconciliation_items && service.reconciliation_items.length > 0) {
                rawAmount = service.reconciliation_items.reduce((itemTotal, item) => {
                    const itemAmount = parseFloat(item.amount) || 0;
                    return item.type === 'discount' ? itemTotal - itemAmount : itemTotal + itemAmount;
                }, 0);
            } else {
                if (service.xero_invoiced && service.billed_price_snapshot !== undefined && service.billed_price_snapshot !== null) {
                    rawAmount = service.billed_price_snapshot;
                } else {
                    const priceForDate = getPriceForDate(client, service.start_time);
                    rawAmount = priceForDate.price;
                }
            }
            
            // Calcular base y total con GST según el tipo
            let base, withGST;
            switch (gstType) {
                case 'inclusive':
                    base = rawAmount / 1.1;
                    withGST = rawAmount;
                    break;
                case 'exclusive':
                    base = rawAmount;
                    withGST = rawAmount * 1.1;
                    break;
                case 'no_tax':
                    base = rawAmount;
                    withGST = rawAmount;
                    break;
                default:
                    base = rawAmount;
                    withGST = rawAmount;
            }
            
            totalBase += base;
            totalConGST += withGST;
        });
        
        return { totalBase, totalConGST };
    }, [schedules, clients]);

    const renderReconciledAmountBreakdown = (service) => {
        const client = clients.get(service.client_id);
        
        // CRÍTICO: Determinar qué precio y GST usar
        let displayPrice, displayGstType;
        
        if (service.xero_invoiced && service.billed_price_snapshot !== undefined && service.billed_price_snapshot !== null) {
            // Servicio facturado: usar snapshot inmutable
            displayPrice = service.billed_price_snapshot;
            displayGstType = service.billed_gst_type_snapshot || 'inclusive';
        } else {
            // Servicio NO facturado: usar precio vigente en la fecha del servicio
            const priceForDate = getPriceForDate(client, service.start_time);
            displayPrice = priceForDate.price;
            displayGstType = priceForDate.gstType;
        }

        if (!service.reconciliation_items || service.reconciliation_items.length === 0) {
            return (
                <div className="space-y-2">
                    <div className="font-bold text-lg text-blue-700">
                        ${displayPrice.toFixed(2)}
                    </div>
                    <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold ${gstTypeBadgeColors[displayGstType]}`}>
                        {gstTypeLabels[displayGstType]}
                    </span>
                    {service.xero_invoiced && (
                        <div className="text-xs text-green-600 font-medium flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Precio Facturado
                        </div>
                    )}
                </div>
            );
        }

        if (service.reconciliation_items.length === 1 &&
            service.reconciliation_items[0].type === 'base_service' &&
            parseFloat(service.reconciliation_items[0].amount) === displayPrice) {
            return (
                <div className="space-y-2">
                    <div className="font-bold text-lg text-blue-700">
                        ${displayPrice.toFixed(2)}
                    </div>
                    <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold ${gstTypeBadgeColors[displayGstType]}`}>
                        {gstTypeLabels[displayGstType]}
                    </span>
                    {service.xero_invoiced && (
                        <div className="text-xs text-green-600 font-medium flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Precio Facturado
                        </div>
                    )}
                </div>
            );
        }

        const total = getReconciledAmount(service);
        const itemLabels = {
            base_service: 'Servicio Base',
            windows_cleaning: 'Ventanas',
            steam_vacuum: 'Vapor',
            other_extra: 'Extra',
            discount: 'Descuento'
        };

        return (
            <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                {service.reconciliation_items.map((item, index) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                        <span className={`${item.type === 'discount' ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
                            {itemLabels[item.type] || item.type}
                        </span>
                        <span className={`font-semibold ${item.type === 'discount' ? 'text-red-600' : 'text-slate-800'}`}>
                            {item.type === 'discount' ? '-' : ''}${parseFloat(item.amount || 0).toFixed(2)}
                        </span>
                    </div>
                ))}
                <div className="border-t border-slate-300 pt-2 mt-2 flex justify-between items-center">
                    <span className="text-sm font-bold text-blue-700">Total:</span>
                    <span className="font-bold text-lg text-blue-700">${total.toFixed(2)}</span>
                </div>
                <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold ${gstTypeBadgeColors[displayGstType]}`}>
                    {gstTypeLabels[displayGstType]}
                </span>
                {service.xero_invoiced && (
                    <div className="text-xs text-green-600 font-medium flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Precio Facturado
                    </div>
                )}
            </div>
        );
    };

    const renderNotesBreakdown = (service) => {
        if (!service.reconciliation_items || service.reconciliation_items.length === 0) {
            return <span className="text-slate-400 italic">Sin notas</span>;
        }

        const notesWithDescription = service.reconciliation_items.filter(item => item.description && item.description.trim() !== '');

        if (notesWithDescription.length === 0) {
            return <span className="text-slate-400 italic">Sin notas</span>;
        }

        const itemLabels = {
            base_service: 'Servicio Base',
            windows_cleaning: 'Ventanas',
            steam_vacuum: 'Vapor',
            other_extra: 'Extra',
            discount: 'Descuento'
        };

        return (
            <div className="space-y-2 max-w-xs">
                {notesWithDescription.map((item, index) => (
                    <div key={index} className="bg-blue-50 p-2 rounded-md border border-blue-200">
                        <span className="font-semibold text-blue-900 text-xs block mb-1">
                            {itemLabels[item.type] || item.type}
                        </span>
                        <p className="text-slate-700 text-xs break-words">{item.description}</p>
                    </div>
                ))}
            </div>
        );
    };

    const getCleanerNames = (cleanerIds) => {
        if (!cleanerIds || !Array.isArray(cleanerIds) || cleanerIds.length === 0) {
            return [];
        }

        return cleanerIds
            .map(id => {
                const user = usersMap.get(id);
                return user?.display_name || user?.full_name || 'Desconocido';
            })
            .filter(Boolean);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 md:p-8">
            <div className="max-w-[1800px] mx-auto space-y-6">
                {/* Header */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                                <Landmark className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900">Conciliación para Facturación</h1>
                                <p className="text-slate-600 mt-1">Gestiona y verifica los servicios antes de facturar</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                            <Button variant="outline" size="icon" onClick={() => setSelectedDate(subDays(selectedDate, 1))} className="hover:bg-white">
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-[280px] justify-start text-left font-medium hover:bg-white">
                                        <CalendarIcon className="mr-2 h-4 w-4 text-blue-600" />
                                        {format(selectedDate, "PPP", { locale: es })}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus />
                                </PopoverContent>
                            </Popover>
                            <Button variant="outline" size="icon" onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="hover:bg-white">
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {error && (
                    <Alert variant="destructive" className="shadow-sm">
                        <AlertTriangle className="h-5 w-5" />
                        <AlertTitle className="font-bold">Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {/* Vista Mensual */}
                <Accordion type="single" collapsible className="bg-white rounded-xl shadow-lg border border-slate-200">
                    <AccordionItem value="monthly-view" className="border-0">
                        <AccordionTrigger className="px-6 py-4 hover:no-underline">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg">
                                    <BarChart3 className="w-5 h-5 text-white" />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-lg font-bold text-slate-900">Vista Mensual - Totales por Día</h3>
                                    <p className="text-sm text-slate-600">Ver resumen de facturación del mes completo</p>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                            <div className="space-y-4">
                                {/* Selector de Mes */}
                                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-200">
                                    <Button 
                                        variant="outline" 
                                        size="icon" 
                                        onClick={() => setMonthlyViewDate(subDays(startOfMonth(monthlyViewDate), 1))}
                                        className="hover:bg-white"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <h4 className="text-xl font-bold text-slate-900">
                                        {format(monthlyViewDate, "MMMM yyyy", { locale: es })}
                                    </h4>
                                    <Button 
                                        variant="outline" 
                                        size="icon" 
                                        onClick={() => setMonthlyViewDate(addDays(endOfMonth(monthlyViewDate), 1))}
                                        className="hover:bg-white"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>

                                {/* Tabla de Totales Mensuales */}
                                {loadingMonthly ? (
                                    <div className="flex justify-center py-8">
                                        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Resumen del Mes */}
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 rounded-lg border border-emerald-200">
                                                <p className="text-sm font-semibold text-emerald-700 mb-1">Total Base (sin GST)</p>
                                                <p className="text-3xl font-bold text-emerald-900">
                                                    ${monthlyData.reduce((sum, day) => sum + day.totalBase, 0).toFixed(2)}
                                                </p>
                                            </div>
                                            <div className="bg-gradient-to-br from-amber-50 to-amber-100 p-4 rounded-lg border border-amber-200">
                                                <p className="text-sm font-semibold text-amber-700 mb-1">Total GST</p>
                                                <p className="text-3xl font-bold text-amber-900">
                                                    ${monthlyData.reduce((sum, day) => sum + day.totalGST, 0).toFixed(2)}
                                                </p>
                                            </div>
                                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                                                <p className="text-sm font-semibold text-blue-700 mb-1">Total con GST</p>
                                                <p className="text-3xl font-bold text-blue-900">
                                                    ${monthlyData.reduce((sum, day) => sum + day.totalConGST, 0).toFixed(2)}
                                                </p>
                                            </div>
                                            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
                                                <p className="text-sm font-semibold text-purple-700 mb-1">Total Servicios</p>
                                                <p className="text-3xl font-bold text-purple-900">
                                                    {monthlyData.reduce((sum, day) => sum + day.serviceCount, 0)}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Tabla Detallada */}
                                        <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[600px] overflow-y-auto">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-slate-100">
                                                        <TableHead className="font-bold">Fecha</TableHead>
                                                        <TableHead className="font-bold text-center">Servicios</TableHead>
                                                        <TableHead className="font-bold text-right">Base (sin GST)</TableHead>
                                                        <TableHead className="font-bold text-right">GST</TableHead>
                                                        <TableHead className="font-bold text-right">Total con GST</TableHead>
                                                        <TableHead className="font-bold text-center">Estado</TableHead>
                                                        <TableHead className="text-center">Acción</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {monthlyData.filter(day => day.hasServices).map((day) => (
                                                        <TableRow key={day.dateStr} className="hover:bg-slate-50">
                                                            <TableCell className="font-medium">
                                                                {format(day.date, "EEEE, d 'de' MMMM", { locale: es })}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <Badge variant="outline">{day.serviceCount}</Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right font-semibold text-emerald-700">
                                                                ${day.totalBase.toFixed(2)}
                                                            </TableCell>
                                                            <TableCell className="text-right font-semibold text-amber-700">
                                                                ${day.totalGST.toFixed(2)}
                                                            </TableCell>
                                                            <TableCell className="text-right font-semibold text-blue-700">
                                                                ${day.totalConGST.toFixed(2)}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                {day.status === 'completed' && (
                                                                    <Badge className="bg-green-500">Facturado</Badge>
                                                                )}
                                                                {day.status === 'horario_reviewed' && (
                                                                    <Badge className="bg-blue-500">Revisado</Badge>
                                                                )}
                                                                {day.status === 'pending' && (
                                                                    <Badge variant="outline" className="border-red-500 text-red-700">Pendiente</Badge>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => setSelectedDate(day.date)}
                                                                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                                                >
                                                                    <Eye className="w-4 h-4 mr-1" />
                                                                    Ver Día
                                                                </Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                    {monthlyData.filter(day => day.hasServices).length === 0 && (
                                                        <TableRow>
                                                            <TableCell colSpan="7" className="text-center py-8 text-slate-500">
                                                                No hay servicios registrados en este mes
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Status Card */}
                <div className={`rounded-xl shadow-lg border-2 ${config.borderColor} ${config.bgColor} overflow-hidden`}>
                    <div className="p-6">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-white rounded-xl shadow-md">
                                    {config.icon}
                                </div>
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <h2 className={`font-bold text-xl ${config.textColor}`}>Estado del Día</h2>
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${config.color} text-white shadow-sm`}>
                                            {config.text}
                                        </span>
                                    </div>
                                    <p className="text-slate-700 font-medium">
                                        {format(selectedDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                {isScheduler && (currentStatus === 'horario_reviewed' || currentStatus === 'completed') && (
                                    <Button
                                        onClick={handleReopenDay}
                                        disabled={loading}
                                        variant="outline"
                                        className="border-orange-600 text-orange-700 hover:bg-orange-50 shadow-lg hover:shadow-xl transition-all"
                                        size="lg"
                                    >
                                        <X className="w-5 h-5 mr-2" />
                                        Volver a Revisar
                                    </Button>
                                )}
                                {isScheduler && currentStatus === 'pending' && (
                                    <Button
                                        onClick={handleMarkDayAsReviewed}
                                        disabled={loading}
                                        className="bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl transition-all"
                                        size="lg"
                                    >
                                        <Send className="w-5 h-5 mr-2" />
                                        Marcar Día como Revisado
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Services Table */}
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200">
                                    <TableHead className="font-bold text-slate-700 py-4 min-w-[180px]">Horario</TableHead>
                                    <TableHead className="font-bold text-slate-700 min-w-[250px]">Cliente</TableHead>
                                    <TableHead className="font-bold text-slate-700 min-w-[140px]">Monto Original</TableHead>
                                    <TableHead className="font-bold text-slate-700 w-56">Monto a Facturar</TableHead>
                                    <TableHead className="font-bold text-slate-700 w-64">Notas Completas</TableHead>
                                    <TableHead className="font-bold text-slate-700 w-80">Notas Especiales</TableHead>
                                    <TableHead className="font-bold text-slate-700 text-center min-w-[130px]">Facturado</TableHead>
                                    <TableHead className="font-bold text-slate-700 text-right min-w-[280px]">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan="8" className="text-center py-12">
                                            <div className="flex flex-col items-center gap-3">
                                                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                                                <span className="text-slate-600 font-medium">Cargando servicios...</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : schedules.length > 0 ? (
                                    schedules.map((service, index) => {
                                        const client = clients.get(service.client_id);
                                        const isUnassigned = !service.cleaner_ids || service.cleaner_ids.length === 0;
                                        const hasSpecialBillingInstructions = client?.has_special_billing_instructions && client?.special_billing_instructions;
                                        
                                        // CRÍTICO: Determinar precio y GST a mostrar en "Monto Original"
                                        let originalPrice, originalGstType;
                                        if (service.xero_invoiced && service.billed_price_snapshot !== undefined && service.billed_price_snapshot !== null) {
                                            originalPrice = service.billed_price_snapshot;
                                            originalGstType = service.billed_gst_type_snapshot || 'inclusive';
                                        } else {
                                            const priceForDate = getPriceForDate(client, service.start_time);
                                            originalPrice = priceForDate.price;
                                            originalGstType = priceForDate.gstType;
                                        }

                                        const cleanerNames = getCleanerNames(service.cleaner_ids);

                                        return (
                                        <TableRow
                                            key={service.id}
                                            className={`
                                                ${service.xero_invoiced ? 'bg-green-50/50' : 'hover:bg-slate-50'}
                                                ${index % 2 === 0 && !service.xero_invoiced ? 'bg-white' : ''}
                                                transition-colors border-b border-slate-100
                                            `}
                                        >
                                            <TableCell className="font-medium text-slate-900 py-4 min-w-[180px]">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-sm font-bold">
                                                        {formatTimeUTC(service.start_time)} - {formatTimeUTC(service.end_time)}
                                                    </span>
                                                    {cleanerNames.length > 0 ? (
                                                        <div className="flex flex-col gap-0.5 mt-1">
                                                            {cleanerNames.map((name, idx) => (
                                                                <span key={idx} className="text-xs text-slate-600">
                                                                    • {name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-500 mt-1">
                                                            Sin asignar
                                                        </span>
                                                    )}
                                                    {isUnassigned && (
                                                        <Badge variant="destructive" className="text-xs w-fit mt-1">
                                                            SIN ASIGNAR
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="min-w-[250px] py-4">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-slate-900 text-base">{client?.name || 'Cliente no encontrado'}</span>
                                                        {hasSpecialBillingInstructions && (
                                                            <FileSignature className="w-4 h-4 text-orange-500 flex-shrink-0" title="Instrucciones especiales de facturación" />
                                                        )}
                                                    </div>
                                                    {client?.email && (
                                                        <div className="text-xs text-slate-600">
                                                            📧 {client.email}
                                                        </div>
                                                    )}
                                                    {client?.mobile_number && (
                                                        <div className="text-xs text-slate-600">
                                                            📱 {client.mobile_number}
                                                        </div>
                                                    )}
                                                    {client?.address && (
                                                        <div className="text-xs text-slate-600">
                                                            📍 {client.address}
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="min-w-[140px]">
                                                <div className="space-y-2">
                                                    <div className="font-bold text-lg text-slate-900">
                                                        ${originalPrice.toFixed(2)}
                                                    </div>
                                                    <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold ${gstTypeBadgeColors[originalGstType]}`}>
                                                        {gstTypeLabels[originalGstType]}
                                                    </span>
                                                    {service.xero_invoiced && (
                                                        <div className="text-xs text-green-600 font-medium flex items-center gap-1">
                                                            <CheckCircle className="w-3 h-3" />
                                                            Precio Facturado
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="min-w-[220px]">
                                                {renderReconciledAmountBreakdown(service)}
                                            </TableCell>
                                            <TableCell className="max-w-xs">
                                                {renderNotesBreakdown(service)}
                                            </TableCell>
                                            <TableCell className="max-w-sm">
                                                {hasSpecialBillingInstructions ? (
                                                    <div className="bg-gradient-to-br from-orange-50 to-amber-50 border-l-4 border-orange-400 rounded-lg p-3 shadow-sm">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <FileSignature className="w-4 h-4 text-orange-600" />
                                                            <span className="text-xs font-bold text-orange-900 uppercase">Instrucciones Especiales</span>
                                                        </div>
                                                        <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                                                            {client.special_billing_instructions}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400 text-sm italic">Sin notas especiales</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center min-w-[130px]">
                                                {service.xero_invoiced ? (
                                                    <div className="inline-flex items-center gap-2 bg-green-100 px-3 py-2 rounded-lg border border-green-200">
                                                        <CheckCircle className="w-5 h-5 text-green-600" />
                                                        <span className="text-green-700 font-semibold text-sm">Facturado</span>
                                                    </div>
                                                ) : (
                                                    <div className="inline-flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-lg border border-slate-200">
                                                        <Circle className="w-5 h-5 text-slate-400" />
                                                        <span className="text-slate-600 text-sm">Pendiente</span>
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right min-w-[280px]">
                                                <div className="flex items-center justify-end gap-2">
                                                    {isScheduler && currentStatus === 'pending' && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => setEditingService(service)}
                                                            className="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-colors"
                                                        >
                                                            <Edit className="w-4 h-4 mr-2" />
                                                            Revisar
                                                        </Button>
                                                    )}

                                                    {isAccountant && currentStatus === 'horario_reviewed' && !service.xero_invoiced && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => setEditingService(service)}
                                                            className="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-colors"
                                                        >
                                                            <Edit className="w-4 h-4 mr-2" />
                                                            Editar
                                                        </Button>
                                                    )}

                                                    {isAccountant && (currentStatus === 'completed' || service.xero_invoiced) && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setEditingService(service)}
                                                            className="hover:bg-slate-100"
                                                        >
                                                            <Eye className="w-4 h-4 mr-2" />
                                                            Ver
                                                        </Button>
                                                    )}

                                                    {isAccountant && currentStatus === 'horario_reviewed' && !service.xero_invoiced && (
                                                        <Button
                                                            variant="default"
                                                            size="sm"
                                                            onClick={() => handleMarkAsInvoiced(service.id)}
                                                            className="bg-green-600 hover:bg-green-700 shadow-sm hover:shadow-md transition-all"
                                                        >
                                                            <DollarSign className="w-4 h-4 mr-2" />
                                                            Facturado
                                                        </Button>
                                                    )}

                                                    {isAccountant && service.xero_invoiced && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleUnmarkAsInvoiced(service.id)}
                                                            className="border-orange-600 text-orange-700 hover:bg-orange-50 shadow-sm hover:shadow-md transition-all"
                                                        >
                                                            <X className="w-4 h-4 mr-2" />
                                                            Quitar Facturado
                                                        </Button>
                                                    )}

                                                    {isScheduler && !service.xero_invoiced && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleDeleteClick(service)}
                                                            className="border-red-600 text-red-700 hover:bg-red-50 shadow-sm hover:shadow-md transition-all"
                                                        >
                                                            <Trash2 className="w-4 h-4 mr-2" />
                                                            Eliminar
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )})
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan="8" className="text-center py-12">
                                            <div className="flex flex-col items-center gap-3">
                                                <Calendar className="w-12 h-12 text-slate-300" />
                                                <div>
                                                    <p className="text-slate-600 font-medium">No hay servicios programados para esta fecha</p>
                                                    <p className="text-slate-400 text-sm mt-1">Selecciona otra fecha para ver los servicios</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>

                            {!loading && schedules.length > 0 && (
                                <tfoot>
                                    <TableRow className="bg-gradient-to-r from-blue-50 to-indigo-50 border-t-2 border-blue-200 font-bold">
                                        <TableCell colSpan="3" className="text-right py-4">
                                            <span className="text-lg text-blue-900">Total del Día:</span>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="space-y-2">
                                                <div className="space-y-1">
                                                    <div className="font-bold text-2xl text-emerald-700">
                                                        ${totalDelDia.totalBase.toFixed(2)}
                                                    </div>
                                                    <div className="text-xs text-emerald-600 font-semibold">
                                                        Base (sin GST)
                                                    </div>
                                                </div>
                                                <div className="border-t border-blue-200 pt-2 space-y-1">
                                                    <div className="font-bold text-xl text-blue-700">
                                                        ${totalDelDia.totalConGST.toFixed(2)}
                                                    </div>
                                                    <div className="text-xs text-blue-600 font-semibold">
                                                        Total con GST
                                                    </div>
                                                </div>
                                                <div className="border-t border-blue-200 pt-2">
                                                    <span className="text-xs text-slate-600 font-semibold">
                                                        {schedules.length} servicio{schedules.length !== 1 ? 's' : ''}
                                                    </span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell colSpan="4"></TableCell>
                                    </TableRow>
                                </tfoot>
                            )}
                        </Table>
                    </div>
                </div>
            </div>

            {editingService && (
                <ReconciliationModal
                    service={editingService}
                    client={clients.get(editingService.client_id)}
                    onSave={handleSaveReconciliation}
                    onCancel={() => setEditingService(null)}
                    userRole={currentUser?.role}
                    isReadOnly={editingService.xero_invoiced === true || dailyReconciliation?.status === 'completed'}
                />
            )}

            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-700">
                            <AlertTriangle className="w-5 h-5" />
                            Confirmar Eliminación
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <Alert variant="destructive" className="bg-red-50 border-red-200">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription className="text-red-800">
                                ¿Estás seguro de que deseas eliminar este servicio?
                                <br /><br />
                                Esta acción <strong>no se puede deshacer</strong> y el servicio se eliminará permanentemente del sistema.
                            </AlertDescription>
                        </Alert>

                        {serviceToDelete && (
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2">
                                <h4 className="font-semibold text-slate-900">Detalles del servicio a eliminar:</h4>
                                <div className="text-sm text-slate-700 space-y-1">
                                    <p><strong>Cliente:</strong> {clients.get(serviceToDelete.client_id)?.name || 'Desconocido'}</p>
                                    <p><strong>Fecha:</strong> {format(parseISO(serviceToDelete.start_time), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}</p>
                                    <p><strong>Horario:</strong> {format(parseISO(serviceToDelete.start_time), 'HH:mm')} - {format(parseISO(serviceToDelete.end_time), 'HH:mm')}</p>
                                    {serviceToDelete.cleaner_ids && serviceToDelete.cleaner_ids.length > 0 && (
                                        <p><strong>Limpiadores asignados:</strong> {serviceToDelete.cleaner_ids.length}</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={handleCancelDelete}
                            disabled={loading}
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirmDelete}
                            disabled={loading}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Eliminando...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Sí, eliminar servicio
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}