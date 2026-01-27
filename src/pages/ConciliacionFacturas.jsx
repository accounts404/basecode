import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Schedule } from '@/entities/Schedule';
import { Client } from '@/entities/Client';
import { DailyReconciliation } from '@/entities/DailyReconciliation';
import { User } from '@/entities/User';
import ReconciliationModal from '../components/conciliacion/ReconciliationModal';
import ClientSummaryReportTab from '../components/conciliacion/ClientSummaryReportTab';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, startOfDay, endOfDay, isEqual, parseISO, addDays, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, Edit, CheckCircle, Clock, DollarSign, FileCheck, Circle, Send, Landmark, Loader2, ChevronLeft, ChevronRight, AlertTriangle, FileSignature, Eye, X, Trash2, AlertCircle, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { processScheduleForWorkEntries } from '@/functions/processScheduleForWorkEntries';
import { isDateInRange } from '@/components/utils/priceCalculations';

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
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [schedules, setSchedules] = useState([]);
    const [monthlySchedules, setMonthlySchedules] = useState([]);
    const [clients, setClients] = useState(new Map());
    const [users, setUsers] = useState([]);
    const [dailyReconciliation, setDailyReconciliation] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [editingService, setEditingService] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [serviceToDelete, setServiceToDelete] = useState(null);

    const usersMap = useMemo(() => {
        return new Map(users.map(u => [u.id, u]));
    }, [users]);

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
                schedule.status !== 'cancelled'
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

    useEffect(() => {
        if (clients.size > 0) {
            fetchMonthlyData(selectedMonth);
        }
    }, [selectedMonth, clients]);

    const fetchMonthlyData = useCallback(async (date) => {
        try {
            console.log('[ConciliacionFacturas] 🔍 Cargando TODOS los servicios desde abril 2025...');
            
            // Cargar todos los servicios desde abril 2025 hasta hoy
            const startOfRange = new Date(Date.UTC(2025, 3, 1, 0, 0, 0, 0)); // Abril 2025
            const endOfRange = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 23, 59, 59, 999));

            const BATCH_SIZE = 5000;
            let allSchedules = [];
            let skip = 0;
            let hasMore = true;

            // Cargar todos los registros en lotes
            while (hasMore) {
                const batch = await Schedule.list('-start_time', BATCH_SIZE, skip);
                const batchArray = Array.isArray(batch) ? batch : [];
                
                allSchedules = [...allSchedules, ...batchArray];
                
                if (batchArray.length < BATCH_SIZE) {
                    hasMore = false;
                } else {
                    skip += BATCH_SIZE;
                }
            }

            // Filtrar servicios activos en el rango de fechas
            const activeSchedules = allSchedules.filter(schedule => {
                if (schedule.status === 'cancelled') return false;
                
                const serviceDate = new Date(schedule.start_time);
                return serviceDate >= startOfRange && serviceDate <= endOfRange;
            }).sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

            console.log(`[ConciliacionFacturas] ✅ Total de servicios cargados: ${activeSchedules.length}`);
            setMonthlySchedules(activeSchedules);
        } catch (err) {
            console.error("Error fetching monthly data:", err);
        }
    }, []);

    const handleSaveReconciliation = async (serviceId, items, paymentMethod, gstType) => {
        try {
            await Schedule.update(serviceId, { 
                reconciliation_items: items,
                billed_payment_method_snapshot: paymentMethod,
                billed_gst_type_snapshot: gstType
            });
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
            
            // CRÍTICO: Tomar "fotografía" del precio, GST y payment_method en el momento de facturación
            const priceSnapshot = getPriceForDate(client, service.start_time);
            
            // CRÍTICO: Si ya existen snapshots (guardados desde el modal), MANTENERLOS
            // Solo usar los valores del cliente si NO existen snapshots previos
            const finalPaymentMethod = service.billed_payment_method_snapshot || client.payment_method || 'bank_transfer';
            const finalGstType = service.billed_gst_type_snapshot || priceSnapshot.gstType;
            
            await Schedule.update(serviceId, { 
                xero_invoiced: true,
                billed_price_snapshot: priceSnapshot.price,
                billed_gst_type_snapshot: finalGstType,
                billed_payment_method_snapshot: finalPaymentMethod,
                billed_at: new Date().toISOString()
            });

            const updatedSchedules = schedules.map(s =>
                s.id === serviceId ? {
                    ...s, 
                    xero_invoiced: true,
                    billed_price_snapshot: priceSnapshot.price,
                    billed_gst_type_snapshot: finalGstType,
                    billed_payment_method_snapshot: finalPaymentMethod,
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
        return schedules.reduce((total, service) => {
            let amount = 0;
            let gstType = 'inclusive';
            
            if (service.reconciliation_items && service.reconciliation_items.length > 0) {
                amount = service.reconciliation_items.reduce((itemTotal, item) => {
                    const itemAmount = parseFloat(item.amount) || 0;
                    return item.type === 'discount' ? itemTotal - itemAmount : itemTotal + itemAmount;
                }, 0);
                
                if (service.xero_invoiced && service.billed_gst_type_snapshot) {
                    gstType = service.billed_gst_type_snapshot;
                } else {
                    const client = clients.get(service.client_id);
                    const priceForDate = getPriceForDate(client, service.start_time);
                    gstType = priceForDate.gstType;
                }
            } else {
                if (service.xero_invoiced && service.billed_price_snapshot !== undefined && service.billed_price_snapshot !== null) {
                    amount = service.billed_price_snapshot;
                    gstType = service.billed_gst_type_snapshot || 'inclusive';
                } else {
                    const client = clients.get(service.client_id);
                    const priceForDate = getPriceForDate(client, service.start_time);
                    amount = priceForDate.price;
                    gstType = priceForDate.gstType;
                }
            }
            
            let baseAmount = amount;
            if (gstType === 'inclusive') {
                baseAmount = amount / 1.1;
            }
            
            return total + baseAmount;
        }, 0);
    }, [schedules, clients]);

    // Filtrar servicios del mes seleccionado
    const filteredMonthlySchedules = useMemo(() => {
        const monthStart = startOfMonth(selectedMonth);
        const monthEnd = endOfMonth(selectedMonth);
        
        return monthlySchedules.filter(service => 
            isDateInRange(service.start_time, monthStart, monthEnd)
        );
    }, [monthlySchedules, selectedMonth]);

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

    const getCleanerNamesWithTimes = (service) => {
        if (!service.cleaner_ids || !Array.isArray(service.cleaner_ids) || service.cleaner_ids.length === 0) {
            return [];
        }

        // Si tiene cleaner_schedules, usarlos para mostrar horarios individuales
        if (service.cleaner_schedules && Array.isArray(service.cleaner_schedules) && service.cleaner_schedules.length > 0) {
            return service.cleaner_schedules.map(cs => {
                const user = usersMap.get(cs.cleaner_id);
                const name = user?.display_name || user?.full_name || 'Desconocido';
                
                // Calcular horas trabajadas (sin aproximar)
                const start = new Date(cs.start_time.endsWith('Z') ? cs.start_time : `${cs.start_time}Z`);
                const end = new Date(cs.end_time.endsWith('Z') ? cs.end_time : `${cs.end_time}Z`);
                const hours = (end - start) / (1000 * 60 * 60);
                
                return { name, hours };
            }).filter(Boolean);
        }

        // Si no tiene cleaner_schedules, calcular horas del servicio general
        const start = new Date(service.start_time.endsWith('Z') ? service.start_time : `${service.start_time}Z`);
        const end = new Date(service.end_time.endsWith('Z') ? service.end_time : `${service.end_time}Z`);
        const totalHours = (end - start) / (1000 * 60 * 60);
        
        return service.cleaner_ids.map(id => {
            const user = usersMap.get(id);
            const name = user?.display_name || user?.full_name || 'Desconocido';
            return { name, hours: totalHours };
        }).filter(Boolean);
    };

    // Separar servicios cash y no-cash del mes filtrado
    const { cashSchedules, nonCashSchedules } = useMemo(() => {
        const cash = [];
        const nonCash = [];
        
        filteredMonthlySchedules.forEach(service => {
            const client = clients.get(service.client_id);
            // CRÍTICO: Usar snapshot de payment_method si existe, sino usar el actual del cliente
            const effectivePaymentMethod = service.billed_payment_method_snapshot || client?.payment_method;
            
            if (effectivePaymentMethod === 'cash') {
                cash.push(service);
            } else {
                nonCash.push(service);
            }
        });
        
        return { cashSchedules: cash, nonCashSchedules: nonCash };
    }, [filteredMonthlySchedules, clients]);

    // Calcular totales del mes separando cash y no-cash (solo del mes filtrado)
    const monthlyStats = useMemo(() => {
        const invoiced = filteredMonthlySchedules.filter(s => s.xero_invoiced === true);
        const pending = filteredMonthlySchedules.filter(s => s.xero_invoiced !== true);

        const calculateTotals = (schedulesList) => {
            const totals = { base: 0, gst: 0, total: 0, cashBase: 0, nonCashBase: 0 };
            
            schedulesList.forEach(service => {
                const client = clients.get(service.client_id);
                // CRÍTICO: Usar snapshot de payment_method si existe, sino usar el actual del cliente
                const effectivePaymentMethod = service.billed_payment_method_snapshot || client?.payment_method;
                const isCash = effectivePaymentMethod === 'cash';
                
                let amount = 0;
                let gstType = 'inclusive';

                if (service.reconciliation_items && service.reconciliation_items.length > 0) {
                    amount = service.reconciliation_items.reduce((itemTotal, item) => {
                        const itemAmount = parseFloat(item.amount) || 0;
                        return item.type === 'discount' ? itemTotal - itemAmount : itemTotal + itemAmount;
                    }, 0);

                    if (service.xero_invoiced && service.billed_gst_type_snapshot) {
                        gstType = service.billed_gst_type_snapshot;
                    } else {
                        const priceForDate = getPriceForDate(client, service.start_time);
                        gstType = priceForDate.gstType;
                    }
                } else {
                    if (service.xero_invoiced && service.billed_price_snapshot !== undefined && service.billed_price_snapshot !== null) {
                        amount = service.billed_price_snapshot;
                        gstType = service.billed_gst_type_snapshot || 'inclusive';
                    } else {
                        const priceForDate = getPriceForDate(client, service.start_time);
                        amount = priceForDate.price;
                        gstType = priceForDate.gstType;
                    }
                }

                let baseAmount = amount;
                let gstAmount = 0;
                let totalAmount = amount;

                if (gstType === 'inclusive') {
                    baseAmount = amount / 1.1;
                    gstAmount = amount - baseAmount;
                } else if (gstType === 'exclusive') {
                    gstAmount = amount * 0.1;
                    totalAmount = amount + gstAmount;
                }

                totals.base += baseAmount;
                totals.gst += gstAmount;
                totals.total += totalAmount;
                
                if (isCash) {
                    totals.cashBase += baseAmount;
                } else {
                    totals.nonCashBase += baseAmount;
                }
            });
            
            return totals;
        };

        return {
            invoiced: calculateTotals(invoiced),
            pending: calculateTotals(pending),
            invoicedCount: invoiced.length,
            pendingCount: pending.length
        };
    }, [filteredMonthlySchedules, clients]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 md:p-8">
            <div className="max-w-[1800px] mx-auto space-y-6">
                {/* Header */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                            <Landmark className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">Conciliación para Facturación</h1>
                            <p className="text-slate-600 mt-1">Gestiona y verifica los servicios antes de facturar</p>
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

                <Tabs defaultValue="daily" className="space-y-6">
                    <TabsList className="grid w-full max-w-md grid-cols-3">
                        <TabsTrigger value="daily">Vista Diaria</TabsTrigger>
                        <TabsTrigger value="monthly">Resumen Mensual</TabsTrigger>
                        <TabsTrigger value="by-client">Por Cliente</TabsTrigger>
                    </TabsList>

                    <TabsContent value="daily" className="space-y-6">
                        {/* Date Selector */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                            <div className="flex items-center justify-center gap-2">
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

                                        const cleanerNamesWithTimes = getCleanerNamesWithTimes(service);

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
                                                    {cleanerNamesWithTimes.length > 0 ? (
                                                        <div className="flex flex-col gap-0.5 mt-1">
                                                            {cleanerNamesWithTimes.map((cleaner, idx) => (
                                                                <span key={idx} className="text-xs text-slate-600">
                                                                    • {cleaner.name}
                                                                    <span className="text-[10px] text-blue-600 ml-1.5 font-bold">
                                                                        {cleaner.hours}h
                                                                    </span>
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
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="text-lg text-blue-900">Total del Día (Base sin GST):</span>
                                                <span className="text-xs text-blue-600 font-normal">* Monto base excl. impuestos</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="space-y-2">
                                                <div className="font-bold text-2xl text-blue-700">
                                                    ${totalDelDia.toFixed(2)}
                                                </div>
                                                <span className="text-xs text-blue-600 font-semibold">
                                                    {schedules.length} servicio{schedules.length !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell colSpan="4"></TableCell>
                                    </TableRow>
                                </tfoot>
                            )}
                        </Table>
                    </div>
                </div>
                    </TabsContent>

                    <TabsContent value="monthly" className="space-y-6">
                        {/* Month Selector */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                            <div className="flex items-center justify-center gap-2">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-[280px] justify-start text-left font-medium hover:bg-white">
                                            <CalendarIcon className="mr-2 h-4 w-4 text-blue-600" />
                                            {format(selectedMonth, "MMMM yyyy", { locale: es })}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar 
                                            mode="single" 
                                            selected={selectedMonth} 
                                            onSelect={setSelectedMonth}
                                            disabled={(date) => date > new Date()}
                                            initialFocus 
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <Card className="shadow-lg border border-green-200 bg-gradient-to-br from-green-50 to-white">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-semibold text-green-700 uppercase tracking-wide flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4" />
                                        Facturado Base
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-3xl font-bold text-green-900">${monthlyStats.invoiced.base.toFixed(2)}</p>
                                    <div className="mt-3 space-y-1 pt-3 border-t border-green-200">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs text-green-700 font-medium">💵 Cash:</span>
                                            <span className="text-sm font-bold text-green-800">${monthlyStats.invoiced.cashBase.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs text-green-700 font-medium">📄 Factura:</span>
                                            <span className="text-sm font-bold text-green-800">${monthlyStats.invoiced.nonCashBase.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-green-600 mt-2">{monthlyStats.invoicedCount} servicios</p>
                                </CardContent>
                            </Card>

                            <Card className="shadow-lg border border-green-200 bg-gradient-to-br from-green-50 to-white">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-semibold text-green-700 uppercase tracking-wide flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4" />
                                        Facturado con GST
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-3xl font-bold text-green-900">${monthlyStats.invoiced.total.toFixed(2)}</p>
                                    <p className="text-xs text-green-600 mt-1">GST: ${monthlyStats.invoiced.gst.toFixed(2)}</p>
                                </CardContent>
                            </Card>

                            <Card className="shadow-lg border border-orange-200 bg-gradient-to-br from-orange-50 to-white">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-semibold text-orange-700 uppercase tracking-wide flex items-center gap-2">
                                        <Clock className="w-4 h-4" />
                                        Pendiente Base
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-3xl font-bold text-orange-900">${monthlyStats.pending.base.toFixed(2)}</p>
                                    <p className="text-xs text-orange-600 mt-1">{monthlyStats.pendingCount} servicios</p>
                                </CardContent>
                            </Card>

                            <Card className="shadow-lg border border-orange-200 bg-gradient-to-br from-orange-50 to-white">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-semibold text-orange-700 uppercase tracking-wide flex items-center gap-2">
                                        <Clock className="w-4 h-4" />
                                        Pendiente con GST
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-3xl font-bold text-orange-900">${monthlyStats.pending.total.toFixed(2)}</p>
                                    <p className="text-xs text-orange-600 mt-1">GST: ${monthlyStats.pending.gst.toFixed(2)}</p>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Monthly Services Table - Non-Cash */}
                        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                            <div className="p-6 border-b border-slate-200">
                                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                                    <FileText className="w-6 h-6 text-blue-600" />
                                    Servicios con Factura
                                </h2>
                                <p className="text-sm text-slate-600 mt-1">Servicios con pago por transferencia, tarjeta u otros métodos</p>
                            </div>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-slate-100">
                                        <TableRow>
                                            <TableHead className="font-bold text-slate-700">Fecha</TableHead>
                                            <TableHead className="font-bold text-slate-700">Cliente</TableHead>
                                            <TableHead className="text-right font-bold text-slate-700">Base</TableHead>
                                            <TableHead className="text-right font-bold text-slate-700">GST</TableHead>
                                            <TableHead className="text-right font-bold text-slate-700">Total</TableHead>
                                            <TableHead className="text-center font-bold text-slate-700">GST Type</TableHead>
                                            <TableHead className="text-center font-bold text-slate-700">Estado</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {nonCashSchedules.map((service) => {
                                            const client = clients.get(service.client_id);
                                            let amount = 0;
                                            let gstType = 'inclusive';

                                            if (service.reconciliation_items && service.reconciliation_items.length > 0) {
                                                amount = service.reconciliation_items.reduce((itemTotal, item) => {
                                                    const itemAmount = parseFloat(item.amount) || 0;
                                                    return item.type === 'discount' ? itemTotal - itemAmount : itemTotal + itemAmount;
                                                }, 0);

                                                if (service.xero_invoiced && service.billed_gst_type_snapshot) {
                                                    gstType = service.billed_gst_type_snapshot;
                                                } else {
                                                    const priceForDate = getPriceForDate(client, service.start_time);
                                                    gstType = priceForDate.gstType;
                                                }
                                            } else {
                                                if (service.xero_invoiced && service.billed_price_snapshot !== undefined && service.billed_price_snapshot !== null) {
                                                    amount = service.billed_price_snapshot;
                                                    gstType = service.billed_gst_type_snapshot || 'inclusive';
                                                } else {
                                                    const priceForDate = getPriceForDate(client, service.start_time);
                                                    amount = priceForDate.price;
                                                    gstType = priceForDate.gstType;
                                                }
                                            }

                                            let baseAmount = amount;
                                            let gstAmount = 0;
                                            let totalAmount = amount;

                                            if (gstType === 'inclusive') {
                                                baseAmount = amount / 1.1;
                                                gstAmount = amount - baseAmount;
                                            } else if (gstType === 'exclusive') {
                                                gstAmount = amount * 0.1;
                                                totalAmount = amount + gstAmount;
                                            }

                                            // Extraer fecha directamente de los primeros 10 caracteres (YYYY-MM-DD)
                                            const serviceDateStr = service.start_time ? service.start_time.slice(0, 10) : '';
                                            const [serviceYear, serviceMonth, serviceDay] = serviceDateStr.split('-').map(Number);
                                            const serviceDate = new Date(serviceYear, serviceMonth - 1, serviceDay);
                                            
                                            return (
                                                <TableRow key={service.id} className={service.xero_invoiced ? 'bg-green-50/50' : 'hover:bg-slate-50'}>
                                                    <TableCell className="font-medium">
                                                        {format(serviceDate, "d MMM", { locale: es })}
                                                    </TableCell>
                                                    <TableCell className="font-semibold text-slate-900">
                                                        {client?.name || 'Desconocido'}
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">
                                                        ${baseAmount.toFixed(2)}
                                                    </TableCell>
                                                    <TableCell className="text-right text-slate-600">
                                                        ${gstAmount.toFixed(2)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold text-slate-900">
                                                        ${totalAmount.toFixed(2)}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge className={gstTypeBadgeColors[gstType] || gstTypeBadgeColors.inclusive}>
                                                            {gstTypeLabels[gstType] || 'Incluido'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {service.xero_invoiced ? (
                                                            <Badge className="bg-green-500 text-white">
                                                                <CheckCircle className="w-3 h-3 mr-1" />
                                                                Facturado
                                                            </Badge>
                                                        ) : (
                                                            <Badge className="bg-orange-500 text-white">
                                                                <Clock className="w-3 h-3 mr-1" />
                                                                Pendiente
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        {/* Monthly Services Table - Cash */}
                        {cashSchedules.length > 0 && (
                            <div className="bg-white rounded-xl shadow-lg border border-green-200 overflow-hidden">
                                <div className="p-6 border-b border-green-200 bg-green-50">
                                    <h2 className="text-2xl font-bold text-green-900 flex items-center gap-2">
                                        <DollarSign className="w-6 h-6 text-green-600" />
                                        Servicios Cash
                                    </h2>
                                    <p className="text-sm text-green-700 mt-1">Servicios con pago en efectivo</p>
                                </div>
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-green-100">
                                            <TableRow>
                                                <TableHead className="font-bold text-green-800">Fecha</TableHead>
                                                <TableHead className="font-bold text-green-800">Cliente</TableHead>
                                                <TableHead className="text-right font-bold text-green-800">Base</TableHead>
                                                <TableHead className="text-right font-bold text-green-800">GST</TableHead>
                                                <TableHead className="text-right font-bold text-green-800">Total</TableHead>
                                                <TableHead className="text-center font-bold text-green-800">GST Type</TableHead>
                                                <TableHead className="text-center font-bold text-green-800">Estado</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {cashSchedules.map((service) => {
                                                const client = clients.get(service.client_id);
                                                let amount = 0;
                                                let gstType = 'inclusive';

                                                if (service.reconciliation_items && service.reconciliation_items.length > 0) {
                                                    amount = service.reconciliation_items.reduce((itemTotal, item) => {
                                                        const itemAmount = parseFloat(item.amount) || 0;
                                                        return item.type === 'discount' ? itemTotal - itemAmount : itemTotal + itemAmount;
                                                    }, 0);

                                                    if (service.xero_invoiced && service.billed_gst_type_snapshot) {
                                                        gstType = service.billed_gst_type_snapshot;
                                                    } else {
                                                        const priceForDate = getPriceForDate(client, service.start_time);
                                                        gstType = priceForDate.gstType;
                                                    }
                                                } else {
                                                    if (service.xero_invoiced && service.billed_price_snapshot !== undefined && service.billed_price_snapshot !== null) {
                                                        amount = service.billed_price_snapshot;
                                                        gstType = service.billed_gst_type_snapshot || 'inclusive';
                                                    } else {
                                                        const priceForDate = getPriceForDate(client, service.start_time);
                                                        amount = priceForDate.price;
                                                        gstType = priceForDate.gstType;
                                                    }
                                                }

                                                let baseAmount = amount;
                                                let gstAmount = 0;
                                                let totalAmount = amount;

                                                if (gstType === 'inclusive') {
                                                    baseAmount = amount / 1.1;
                                                    gstAmount = amount - baseAmount;
                                                } else if (gstType === 'exclusive') {
                                                    gstAmount = amount * 0.1;
                                                    totalAmount = amount + gstAmount;
                                                }

                                                const serviceDateStr = service.start_time ? service.start_time.slice(0, 10) : '';
                                                const [serviceYear, serviceMonth, serviceDay] = serviceDateStr.split('-').map(Number);
                                                const serviceDate = new Date(serviceYear, serviceMonth - 1, serviceDay);

                                                return (
                                                    <TableRow key={service.id} className={service.xero_invoiced ? 'bg-green-100/50' : 'hover:bg-green-50'}>
                                                        <TableCell className="font-medium">
                                                            {format(serviceDate, "d MMM", { locale: es })}
                                                        </TableCell>
                                                        <TableCell className="font-semibold text-slate-900">
                                                            {client?.name || 'Desconocido'}
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium">
                                                            ${baseAmount.toFixed(2)}
                                                        </TableCell>
                                                        <TableCell className="text-right text-slate-600">
                                                            ${gstAmount.toFixed(2)}
                                                        </TableCell>
                                                        <TableCell className="text-right font-bold text-slate-900">
                                                            ${totalAmount.toFixed(2)}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge className={gstTypeBadgeColors[gstType] || gstTypeBadgeColors.inclusive}>
                                                                {gstTypeLabels[gstType] || 'Incluido'}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {service.xero_invoiced ? (
                                                                <Badge className="bg-green-500 text-white">
                                                                    <CheckCircle className="w-3 h-3 mr-1" />
                                                                    Facturado
                                                                </Badge>
                                                            ) : (
                                                                <Badge className="bg-orange-500 text-white">
                                                                    <Clock className="w-3 h-3 mr-1" />
                                                                    Pendiente
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="by-client" className="space-y-6">
                        <ClientSummaryReportTab 
                            monthlySchedules={monthlySchedules} 
                            clients={clients}
                            usersMap={usersMap}
                        />
                    </TabsContent>
                </Tabs>
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