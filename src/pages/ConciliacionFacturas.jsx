import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import ReconciliationModal from '../components/conciliacion/ReconciliationModal';
import ClientSummaryReportTab from '../components/conciliacion/ClientSummaryReportTab';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, isSameDay, addDays, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    CalendarIcon, Edit, CheckCircle, Clock, DollarSign, FileCheck, Circle,
    Send, Landmark, Loader2, ChevronLeft, ChevronRight, AlertTriangle,
    FileSignature, Eye, X, Trash2, AlertCircle, FileText
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { processScheduleForWorkEntries } from '@/functions/processScheduleForWorkEntries';
import { isDateInRange } from '@/components/utils/priceCalculations';
import { useAuth } from '@/lib/AuthContext';

// ─── Helpers ────────────────────────────────────────────────────────────────
const formatTimeUTC = (iso) => (iso ? iso.slice(11, 16) : '');

const getPriceForDate = (client, serviceDate) => {
    if (!client || !serviceDate) return { price: 0, gstType: 'inclusive' };
    if (!client.price_history || client.price_history.length === 0) {
        return { price: client.current_service_price || 0, gstType: client.gst_type || 'inclusive' };
    }
    const serviceDateStr = serviceDate.slice(0, 10);
    const sorted = [...client.price_history].sort((a, b) =>
        new Date(b.effective_date) - new Date(a.effective_date)
    );
    for (const entry of sorted) {
        if (entry.effective_date <= serviceDateStr) {
            return { price: entry.new_price || client.current_service_price || 0, gstType: entry.gst_type || client.gst_type || 'inclusive' };
        }
    }
    const oldest = sorted[sorted.length - 1];
    return {
        price: oldest?.previous_price || oldest?.new_price || client.current_service_price || 0,
        gstType: oldest?.gst_type || client.gst_type || 'inclusive',
    };
};

const calcGst = (amount, gstType) => {
    if (gstType === 'inclusive') {
        const base = amount / 1.1;
        return { base, gst: amount - base, total: amount };
    }
    if (gstType === 'exclusive') {
        const gst = amount * 0.1;
        return { base: amount, gst, total: amount + gst };
    }
    return { base: amount, gst: 0, total: amount };
};

const getServiceAmount = (service, client) => {
    if (service.reconciliation_items?.length > 0) {
        return service.reconciliation_items.reduce((sum, item) => {
            const v = parseFloat(item.amount) || 0;
            return item.type === 'discount' ? sum - v : sum + v;
        }, 0);
    }
    if (service.xero_invoiced && service.billed_price_snapshot != null) return service.billed_price_snapshot;
    return getPriceForDate(client, service.start_time).price;
};

const getServiceGstType = (service, client) => {
    if (service.xero_invoiced && service.billed_gst_type_snapshot) return service.billed_gst_type_snapshot;
    if (service.reconciliation_items?.length > 0) return getPriceForDate(client, service.start_time).gstType;
    return getPriceForDate(client, service.start_time).gstType;
};

// ─── Config ─────────────────────────────────────────────────────────────────
const statusConfig = {
    pending: {
        color: 'bg-red-500', textColor: 'text-red-700',
        bgColor: 'bg-gradient-to-r from-red-50 to-red-100', borderColor: 'border-red-300',
        text: 'Pendiente de Revisión (Horario)',
        icon: <Circle className="w-6 h-6 text-red-500" />,
    },
    horario_reviewed: {
        color: 'bg-blue-500', textColor: 'text-blue-700',
        bgColor: 'bg-gradient-to-r from-blue-50 to-blue-100', borderColor: 'border-blue-300',
        text: 'Revisado / Listo para Facturar',
        icon: <FileCheck className="w-6 h-6 text-blue-500" />,
    },
    completed: {
        color: 'bg-green-500', textColor: 'text-green-700',
        bgColor: 'bg-gradient-to-r from-green-50 to-green-100', borderColor: 'border-green-300',
        text: 'Día Facturado Completamente',
        icon: <CheckCircle className="w-6 h-6 text-green-500" />,
    },
};

const gstTypeLabels = { inclusive: 'GST Incluido', exclusive: 'GST Exclusivo', no_tax: 'Sin Impuestos' };
const gstTypeBadgeColors = {
    inclusive: 'bg-blue-50 text-blue-700 border border-blue-200',
    exclusive: 'bg-purple-50 text-purple-700 border border-purple-200',
    no_tax: 'bg-slate-50 text-slate-700 border border-slate-200',
};
const itemLabels = {
    base_service: 'Servicio Base', windows_cleaning: 'Ventanas',
    steam_vacuum: 'Vapor', other_extra: 'Extra', discount: 'Descuento',
};

// ─── Batch loader ────────────────────────────────────────────────────────────
const loadAll = async (entity, sort = '-created_date', batchSize = 2000) => {
    let all = [], skip = 0;
    while (true) {
        const batch = await entity.list(sort, batchSize, skip);
        const arr = Array.isArray(batch) ? batch : [];
        all = all.concat(arr);
        if (arr.length < batchSize) break;
        skip += batchSize;
    }
    return all;
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function ConciliacionFacturasPage() {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [schedules, setSchedules] = useState([]);
    const [monthlySchedules, setMonthlySchedules] = useState([]);
    const [allWorkEntries, setAllWorkEntries] = useState([]);
    const [clients, setClients] = useState(new Map());
    const [users, setUsers] = useState([]);
    const [dailyReconciliation, setDailyReconciliation] = useState(null);
    const { user: currentUser } = useAuth();
    const [editingService, setEditingService] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dayLoading, setDayLoading] = useState(false);
    const [error, setError] = useState(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [serviceToDelete, setServiceToDelete] = useState(null);

    // Track if monthly data already loaded to avoid redundant fetches
    const monthlyLoadedRef = useRef(false);

    const usersMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

    // ── Initial load: clients, users, recent workEntries — all in parallel
    useEffect(() => {
        const init = async () => {
            setLoading(true);
            try {
                // OPTIMIZACIÓN CRÍTICA: Solo cargar WorkEntries de los últimos 3 meses
                const threeMonthsAgo = new Date();
                threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
                const minDateStr = format(threeMonthsAgo, 'yyyy-MM-dd');

                const [clientList, userList, workList] = await Promise.all([
                    loadAll(base44.entities.Client),
                    loadAll(base44.entities.User),
                    base44.entities.WorkEntry.filter({ work_date: { $gte: minDateStr } }, '-work_date', 5000),
                ]);

                const clientMap = new Map(clientList.map(c => [c.id, c]));
                setClients(clientMap);
                setUsers(Array.isArray(userList) ? userList : []);
                setAllWorkEntries(Array.isArray(workList) ? workList : []);
            } catch (e) {
                console.error('Error en carga inicial:', e);
                setError('Error al cargar datos iniciales.');
            } finally {
                setLoading(false);
            }
        };

        if (currentUser) {
            init();
        }
    }, [currentUser]);

    // ── Fetch daily schedules — filtered on server by date string
    const fetchDataForDate = useCallback(async (date) => {
        setDayLoading(true);
        setError(null);
        try {
            const dateStr = format(date, 'yyyy-MM-dd');
            const startLocal = `${dateStr}T00:00:00.000`;
            const endLocal = `${dateStr}T23:59:59.999`;

            const [schedulesData, reconciliationData] = await Promise.all([
                base44.entities.Schedule.filter({ start_time: { $gte: startLocal, $lte: endLocal } }, '-start_time'),
                base44.entities.DailyReconciliation.filter({ date: dateStr }),
            ]);

            const active = schedulesData
                .filter(s => s.status !== 'cancelled')
                .sort((a, b) => {
                    if (a.xero_invoiced !== b.xero_invoiced) return a.xero_invoiced ? 1 : -1;
                    return new Date(a.start_time) - new Date(b.start_time);
                });

            setSchedules(active);
            setDailyReconciliation(
                reconciliationData.length > 0
                    ? reconciliationData[0]
                    : { date: dateStr, status: 'pending' }
            );
        } catch (err) {
            console.error('Error cargando datos del día:', err);
            setError('Error al cargar los datos para la fecha seleccionada.');
        } finally {
            setDayLoading(false);
        }
    }, []);

    // ── Fetch monthly schedules — filtered on server with date range
    const fetchMonthlyData = useCallback(async (date) => {
        try {
            const monthStart = format(startOfMonth(date), 'yyyy-MM-dd');
            const monthEnd = format(endOfMonth(date), 'yyyy-MM-dd');
            // Use date-range filter instead of loading everything
            const data = await base44.entities.Schedule.filter({
                start_time: {
                    $gte: `${monthStart}T00:00:00.000`,
                    $lte: `${monthEnd}T23:59:59.999`,
                }
            }, '-start_time', 2000);
            const active = (Array.isArray(data) ? data : []).filter(s => s.status !== 'cancelled');
            setMonthlySchedules(active);
        } catch (err) {
            console.error('Error cargando datos mensuales:', err);
        }
    }, []);

    // Trigger daily fetch once clients+users loaded, and when date changes
    useEffect(() => {
        if (clients.size > 0) fetchDataForDate(selectedDate);
    }, [selectedDate, clients, fetchDataForDate]);

    // Trigger monthly fetch when month changes (or clients first load)
    useEffect(() => {
        if (clients.size > 0) fetchMonthlyData(selectedMonth);
    }, [selectedMonth, clients, fetchMonthlyData]);

    // ── Actions ──────────────────────────────────────────────────────────────
    const handleSaveReconciliation = async (serviceId, items, paymentMethod, gstType) => {
        await base44.entities.Schedule.update(serviceId, {
            reconciliation_items: items,
            billed_payment_method_snapshot: paymentMethod,
            billed_gst_type_snapshot: gstType,
        });
        setEditingService(null);
        fetchDataForDate(selectedDate);
    };

    const handleMarkDayAsReviewed = async () => {
        setDayLoading(true);
        setError(null);
        try {
            const toComplete = schedules.filter(s => s.status !== 'completed' && s.status !== 'cancelled');
            await Promise.all(toComplete.map(async (service) => {
                await base44.entities.Schedule.update(service.id, { status: 'completed' });
                await processScheduleForWorkEntries({ scheduleId: service.id, mode: 'create' });
            }));
            const ts = new Date().toISOString().slice(0, 16) + ':00.000';
            const updateData = { status: 'horario_reviewed', reviewed_by_user_id: currentUser.id, reviewed_at: ts };
            if (dailyReconciliation.id) {
                await base44.entities.DailyReconciliation.update(dailyReconciliation.id, updateData);
            } else {
                await base44.entities.DailyReconciliation.create({ date: format(selectedDate, 'yyyy-MM-dd'), ...updateData });
            }
            fetchDataForDate(selectedDate);
        } catch (err) {
            console.error('Error marcando día como revisado:', err);
            setError('No se pudo marcar el día como revisado: ' + (err.message || ''));
        } finally {
            setDayLoading(false);
        }
    };

    const handleReopenDay = async () => {
        setDayLoading(true);
        try {
            if (dailyReconciliation?.id) {
                await base44.entities.DailyReconciliation.update(dailyReconciliation.id, {
                    status: 'pending', reviewed_by_user_id: null, reviewed_at: null, completed_at: null,
                });
                fetchDataForDate(selectedDate);
            }
        } catch (err) {
            setError('No se pudo reabrir el día.');
        } finally {
            setDayLoading(false);
        }
    };

    const handleMarkAsInvoiced = async (serviceId) => {
        setDayLoading(true);
        const ts = new Date().toISOString().slice(0, 16) + ':00.000';
        try {
            const service = schedules.find(s => s.id === serviceId);
            const client = clients.get(service.client_id);
            const priceSnapshot = getPriceForDate(client, service.start_time);
            const finalPaymentMethod = service.billed_payment_method_snapshot || client?.payment_method || 'bank_transfer';
            const finalGstType = service.billed_gst_type_snapshot || priceSnapshot.gstType;
            await base44.entities.Schedule.update(serviceId, {
                xero_invoiced: true,
                billed_price_snapshot: priceSnapshot.price,
                billed_gst_type_snapshot: finalGstType,
                billed_payment_method_snapshot: finalPaymentMethod,
                billed_at: ts,
            });
            const updated = schedules.map(s =>
                s.id === serviceId ? { ...s, xero_invoiced: true, billed_price_snapshot: priceSnapshot.price, billed_gst_type_snapshot: finalGstType, billed_payment_method_snapshot: finalPaymentMethod, billed_at: ts } : s
            ).sort((a, b) => {
                if (a.xero_invoiced !== b.xero_invoiced) return a.xero_invoiced ? 1 : -1;
                return new Date(a.start_time) - new Date(b.start_time);
            });
            setSchedules(updated);
            if (updated.every(s => s.xero_invoiced) && dailyReconciliation?.status !== 'completed') {
                const completedTs = new Date().toISOString().slice(0, 16) + ':00.000';
                const updateData = { status: 'completed', completed_at: completedTs };
                if (dailyReconciliation.id) {
                    await base44.entities.DailyReconciliation.update(dailyReconciliation.id, updateData);
                } else {
                    await base44.entities.DailyReconciliation.create({ date: format(selectedDate, 'yyyy-MM-dd'), ...updateData });
                }
                fetchDataForDate(selectedDate);
            }
        } catch (err) {
            setError('No se pudo marcar el servicio como facturado.');
        } finally {
            setDayLoading(false);
        }
    };

    const handleUnmarkAsInvoiced = async (serviceId) => {
        setDayLoading(true);
        try {
            await base44.entities.Schedule.update(serviceId, { xero_invoiced: false });
            const updated = schedules.map(s => s.id === serviceId ? { ...s, xero_invoiced: false } : s)
                .sort((a, b) => {
                    if (a.xero_invoiced !== b.xero_invoiced) return a.xero_invoiced ? 1 : -1;
                    return new Date(a.start_time) - new Date(b.start_time);
                });
            setSchedules(updated);
            if (dailyReconciliation?.status === 'completed' && dailyReconciliation.id) {
                await base44.entities.DailyReconciliation.update(dailyReconciliation.id, { status: 'horario_reviewed', completed_at: null });
                fetchDataForDate(selectedDate);
            }
        } catch (err) {
            setError('No se pudo quitar el estado de facturado.');
        } finally {
            setDayLoading(false);
        }
    };

    const handleDeleteClick = (service) => { setServiceToDelete(service); setDeleteConfirmOpen(true); };
    const handleCancelDelete = () => { setDeleteConfirmOpen(false); setServiceToDelete(null); };

    const handleConfirmDelete = async () => {
        if (!serviceToDelete) return;
        setDayLoading(true);
        setError(null);
        try {
            await base44.entities.Schedule.delete(serviceToDelete.id);
            const updated = schedules.filter(s => s.id !== serviceToDelete.id);
            setSchedules(updated);
            setDeleteConfirmOpen(false);
            setServiceToDelete(null);
            if (updated.length === 0) {
                if (dailyReconciliation?.id) {
                    await base44.entities.DailyReconciliation.update(dailyReconciliation.id, {
                        status: 'pending', reviewed_by_user_id: null, reviewed_at: null, completed_at: null,
                    });
                }
                setDailyReconciliation({ date: format(selectedDate, 'yyyy-MM-dd'), status: 'pending' });
            }
        } catch (err) {
            setError('No se pudo eliminar el servicio.');
        } finally {
            setDayLoading(false);
        }
    };

    // ── Derived ──────────────────────────────────────────────────────────────
    const currentStatus = dailyReconciliation?.status || 'pending';
    const config = statusConfig[currentStatus];
    const isAdmin = currentUser?.role === 'admin';

    const totalDelDia = useMemo(() => {
        return schedules.reduce((sum, s) => {
            const client = clients.get(s.client_id);
            const amount = getServiceAmount(s, client);
            const gstType = getServiceGstType(s, client);
            return sum + calcGst(amount, gstType).base;
        }, 0);
    }, [schedules, clients]);

    const filteredMonthlySchedules = useMemo(() => {
        const ms = startOfMonth(selectedMonth);
        const me = endOfMonth(selectedMonth);
        return monthlySchedules.filter(s => isDateInRange(s.start_time, ms, me));
    }, [monthlySchedules, selectedMonth]);

    const { cashSchedules, nonCashSchedules } = useMemo(() => {
        const cash = [], nonCash = [];
        filteredMonthlySchedules.forEach(s => {
            const client = clients.get(s.client_id);
            const pm = s.billed_payment_method_snapshot || client?.payment_method;
            (pm === 'cash' ? cash : nonCash).push(s);
        });
        return { cashSchedules: cash, nonCashSchedules: nonCash };
    }, [filteredMonthlySchedules, clients]);

    const monthlyStats = useMemo(() => {
        const invoiced = filteredMonthlySchedules.filter(s => s.xero_invoiced);
        const pending = filteredMonthlySchedules.filter(s => !s.xero_invoiced);
        const calcTotals = (list) => {
            const t = { base: 0, gst: 0, total: 0, cashBase: 0, nonCashBase: 0 };
            list.forEach(s => {
                const client = clients.get(s.client_id);
                const amount = getServiceAmount(s, client);
                const gstType = getServiceGstType(s, client);
                const { base, gst, total } = calcGst(amount, gstType);
                t.base += base; t.gst += gst; t.total += total;
                const pm = s.billed_payment_method_snapshot || client?.payment_method;
                if (pm === 'cash') t.cashBase += base; else t.nonCashBase += base;
            });
            return t;
        };
        return {
            invoiced: calcTotals(invoiced), pending: calcTotals(pending),
            invoicedCount: invoiced.length, pendingCount: pending.length,
        };
    }, [filteredMonthlySchedules, clients]);

    const getCleanerNamesWithTimes = (service) => {
        const calcHours = (s, e) => (!s || !e ? 0 : (new Date(e) - new Date(s)) / 3600000);
        if (service.cleaner_schedules?.length > 0) {
            return service.cleaner_schedules.map(cs => {
                const user = usersMap.get(cs.cleaner_id);
                return { name: user?.full_name || 'Desconocido', hours: calcHours(cs.start_time, cs.end_time) };
            });
        }
        const totalHours = calcHours(service.start_time, service.end_time);
        return (service.cleaner_ids || []).map(id => {
            const user = usersMap.get(id);
            return { name: user?.full_name || 'Desconocido', hours: totalHours };
        });
    };

    const renderAmountBreakdown = (service) => {
        const client = clients.get(service.client_id);
        let displayPrice, displayGstType;
        if (service.xero_invoiced && service.billed_price_snapshot != null && !service.reconciliation_items?.length) {
            displayPrice = service.billed_price_snapshot;
            displayGstType = service.billed_gst_type_snapshot || 'inclusive';
        } else {
            const pfd = getPriceForDate(client, service.start_time);
            displayPrice = pfd.price;
            displayGstType = pfd.gstType;
        }

        if (!service.reconciliation_items?.length) {
            return <AmountCell price={displayPrice} gstType={displayGstType} invoiced={service.xero_invoiced} />;
        }

        const total = getServiceAmount(service, client);
        const isTrivial = service.reconciliation_items.length === 1 &&
            service.reconciliation_items[0].type === 'base_service' &&
            parseFloat(service.reconciliation_items[0].amount) === displayPrice;

        if (isTrivial) return <AmountCell price={displayPrice} gstType={displayGstType} invoiced={service.xero_invoiced} />;

        return (
            <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                {service.reconciliation_items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                        <span className={item.type === 'discount' ? 'text-red-600 font-medium' : 'text-slate-600'}>
                            {itemLabels[item.type] || item.type}
                        </span>
                        <span className={`font-semibold ${item.type === 'discount' ? 'text-red-600' : 'text-slate-800'}`}>
                            {item.type === 'discount' ? '-' : ''}${parseFloat(item.amount || 0).toFixed(2)}
                        </span>
                    </div>
                ))}
                <div className="border-t pt-2 flex justify-between">
                    <span className="text-sm font-bold text-blue-700">Total:</span>
                    <span className="font-bold text-lg text-blue-700">${total.toFixed(2)}</span>
                </div>
                <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold ${gstTypeBadgeColors[displayGstType]}`}>
                    {gstTypeLabels[displayGstType]}
                </span>
                {service.xero_invoiced && <InvoicedBadge />}
            </div>
        );
    };

    const renderNotes = (service) => {
        const notes = service.reconciliation_items?.filter(i => i.description?.trim());
        if (!notes?.length) return <span className="text-slate-400 italic text-sm">Sin notas</span>;
        return (
            <div className="space-y-2 max-w-xs">
                {notes.map((item, i) => (
                    <div key={i} className="bg-blue-50 p-2 rounded-md border border-blue-200">
                        <span className="font-semibold text-blue-900 text-xs block mb-1">{itemLabels[item.type] || item.type}</span>
                        <p className="text-slate-700 text-xs break-words">{item.description}</p>
                    </div>
                ))}
            </div>
        );
    };

    // ── Early loading state ──────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center space-y-3">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
                    <p className="text-slate-600 font-medium">Cargando datos...</p>
                </div>
            </div>
        );
    }

    // ── Render ───────────────────────────────────────────────────────────────
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
                    <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-700">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <div>
                            <p className="font-bold">Error</p>
                            <p className="text-sm">{error}</p>
                        </div>
                        <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                <Tabs defaultValue="daily" className="space-y-6">
                    <TabsList className="grid w-full max-w-md grid-cols-3">
                        <TabsTrigger value="daily">Vista Diaria</TabsTrigger>
                        <TabsTrigger value="monthly">Resumen Mensual</TabsTrigger>
                        <TabsTrigger value="by-client">Por Cliente</TabsTrigger>
                    </TabsList>

                    {/* ── DAILY TAB ─────────────────────────────────────────── */}
                    <TabsContent value="daily" className="space-y-6">
                        {/* Date nav */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                            <div className="flex items-center justify-center gap-2">
                                <Button variant="outline" size="icon" onClick={() => setSelectedDate(d => subDays(d, 1))}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-[280px] justify-start font-medium">
                                            <CalendarIcon className="mr-2 h-4 w-4 text-blue-600" />
                                            {format(selectedDate, "PPP", { locale: es })}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus />
                                    </PopoverContent>
                                </Popover>
                                <Button variant="outline" size="icon" onClick={() => setSelectedDate(d => addDays(d, 1))}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                {!isSameDay(selectedDate, new Date()) && (
                                    <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())} className="text-xs font-semibold">
                                        Hoy
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Status card */}
                        <div className={`rounded-xl shadow-lg border-2 ${config.borderColor} ${config.bgColor} p-6`}>
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-white rounded-xl shadow-md">{config.icon}</div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h2 className={`font-bold text-xl ${config.textColor}`}>Estado del Día</h2>
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${config.color} text-white`}>{config.text}</span>
                                        </div>
                                        <p className="text-slate-700 font-medium capitalize">
                                            {format(selectedDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    {isAdmin && (currentStatus === 'horario_reviewed' || currentStatus === 'completed') && (
                                        <Button onClick={handleReopenDay} disabled={dayLoading} variant="outline"
                                            className="border-orange-600 text-orange-700 hover:bg-orange-50" size="lg">
                                            <X className="w-5 h-5 mr-2" />Volver a Revisar
                                        </Button>
                                    )}
                                    {isAdmin && currentStatus === 'pending' && (
                                        <Button onClick={handleMarkDayAsReviewed} disabled={dayLoading}
                                            className="bg-blue-600 hover:bg-blue-700" size="lg">
                                            {dayLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Send className="w-5 h-5 mr-2" />}
                                            Marcar Día como Revisado
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Services table */}
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
                                        {dayLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center py-12">
                                                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
                                                    <span className="text-slate-500 text-sm">Cargando servicios...</span>
                                                </TableCell>
                                            </TableRow>
                                        ) : schedules.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                                                    <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                                    <p className="font-medium">No hay servicios para esta fecha</p>
                                                    <p className="text-sm mt-1">Selecciona otra fecha para ver los servicios</p>
                                                </TableCell>
                                            </TableRow>
                                        ) : schedules.map((service, index) => {
                                            const client = clients.get(service.client_id);
                                            const isUnassigned = !service.cleaner_ids?.length;
                                            const hasSpecialBilling = client?.has_special_billing_instructions && client?.special_billing_instructions;
                                            let originalPrice, originalGstType;
                                            if (service.xero_invoiced && service.billed_price_snapshot != null) {
                                                originalPrice = service.billed_price_snapshot;
                                                originalGstType = service.billed_gst_type_snapshot || 'inclusive';
                                            } else {
                                                const pfd = getPriceForDate(client, service.start_time);
                                                originalPrice = pfd.price;
                                                originalGstType = pfd.gstType;
                                            }
                                            const cleaners = getCleanerNamesWithTimes(service);
                                            return (
                                                <TableRow key={service.id}
                                                    className={`border-b border-slate-100 transition-colors ${service.xero_invoiced ? 'bg-green-50/50' : index % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100'}`}>
                                                    <TableCell className="py-4 min-w-[180px]">
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-sm font-bold">
                                                                {formatTimeUTC(service.start_time)} - {formatTimeUTC(service.end_time)}
                                                            </span>
                                                            {cleaners.map((c, i) => (
                                                                <span key={i} className="text-xs text-slate-600">
                                                                    • {c.name}<span className="text-[10px] text-blue-600 ml-1 font-bold">{c.hours}h</span>
                                                                </span>
                                                            ))}
                                                            {isUnassigned && <Badge variant="destructive" className="text-xs w-fit mt-1">SIN ASIGNAR</Badge>}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="min-w-[250px] py-4">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-medium text-slate-900">{client?.name || 'Cliente no encontrado'}</span>
                                                                {hasSpecialBilling && <FileSignature className="w-4 h-4 text-orange-500 flex-shrink-0" title="Instrucciones especiales" />}
                                                            </div>
                                                            {client?.email && <p className="text-xs text-slate-500">📧 {client.email}</p>}
                                                            {client?.mobile_number && <p className="text-xs text-slate-500">📱 {client.mobile_number}</p>}
                                                            {client?.address && <p className="text-xs text-slate-500">📍 {client.address}</p>}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="min-w-[140px]">
                                                        <AmountCell price={originalPrice} gstType={originalGstType} invoiced={service.xero_invoiced} />
                                                    </TableCell>
                                                    <TableCell className="min-w-[220px]">{renderAmountBreakdown(service)}</TableCell>
                                                    <TableCell className="max-w-xs">{renderNotes(service)}</TableCell>
                                                    <TableCell className="max-w-sm">
                                                        {hasSpecialBilling ? (
                                                            <div className="bg-gradient-to-br from-orange-50 to-amber-50 border-l-4 border-orange-400 rounded-lg p-3">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <FileSignature className="w-4 h-4 text-orange-600" />
                                                                    <span className="text-xs font-bold text-orange-900 uppercase">Instrucciones Especiales</span>
                                                                </div>
                                                                <p className="text-sm text-slate-800 whitespace-pre-wrap">{client.special_billing_instructions}</p>
                                                            </div>
                                                        ) : <span className="text-slate-400 text-sm italic">Sin notas especiales</span>}
                                                    </TableCell>
                                                    <TableCell className="text-center">
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
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-2 flex-wrap">
                                                            {isAdmin && currentStatus === 'pending' && (
                                                                <Button variant="outline" size="sm" onClick={() => setEditingService(service)} className="hover:bg-blue-50 hover:text-blue-700">
                                                                    <Edit className="w-4 h-4 mr-1" />Revisar
                                                                </Button>
                                                            )}
                                                            {isAdmin && currentStatus === 'horario_reviewed' && !service.xero_invoiced && (
                                                                <>
                                                                    <Button variant="outline" size="sm" onClick={() => setEditingService(service)} className="hover:bg-blue-50 hover:text-blue-700">
                                                                        <Edit className="w-4 h-4 mr-1" />Editar
                                                                    </Button>
                                                                    <Button variant="default" size="sm" onClick={() => handleMarkAsInvoiced(service.id)} disabled={dayLoading} className="bg-green-600 hover:bg-green-700">
                                                                        <DollarSign className="w-4 h-4 mr-1" />Facturado
                                                                    </Button>
                                                                </>
                                                            )}
                                                            {isAdmin && (currentStatus === 'completed' || service.xero_invoiced) && (
                                                                <Button variant="ghost" size="sm" onClick={() => setEditingService(service)}>
                                                                    <Eye className="w-4 h-4 mr-1" />Ver
                                                                </Button>
                                                            )}
                                                            {isAdmin && service.xero_invoiced && (
                                                                <Button variant="outline" size="sm" onClick={() => handleUnmarkAsInvoiced(service.id)} disabled={dayLoading} className="border-orange-600 text-orange-700 hover:bg-orange-50">
                                                                    <X className="w-4 h-4 mr-1" />Quitar
                                                                </Button>
                                                            )}
                                                            {isAdmin && !service.xero_invoiced && (
                                                                <Button variant="outline" size="sm" onClick={() => handleDeleteClick(service)} className="border-red-600 text-red-700 hover:bg-red-50">
                                                                    <Trash2 className="w-4 h-4 mr-1" />Eliminar
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                    {!dayLoading && schedules.length > 0 && (
                                        <tfoot>
                                            <TableRow className="bg-gradient-to-r from-blue-50 to-indigo-50 border-t-2 border-blue-200 font-bold">
                                                <TableCell colSpan={3} className="text-right py-4">
                                                    <span className="text-lg text-blue-900">Total del Día (Base sin GST):</span>
                                                </TableCell>
                                                <TableCell className="py-4">
                                                    <div className="font-bold text-2xl text-blue-700">${totalDelDia.toFixed(2)}</div>
                                                    <span className="text-xs text-blue-600">{schedules.length} servicio{schedules.length !== 1 ? 's' : ''}</span>
                                                </TableCell>
                                                <TableCell colSpan={4} />
                                            </TableRow>
                                        </tfoot>
                                    )}
                                </Table>
                            </div>
                        </div>
                    </TabsContent>

                    {/* ── MONTHLY TAB ───────────────────────────────────────── */}
                    <TabsContent value="monthly" className="space-y-6">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                            <div className="flex items-center justify-center gap-2">
                                <Button variant="outline" size="icon" onClick={() => setSelectedMonth(d => subDays(startOfMonth(d), 1))}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-[280px] justify-start font-medium">
                                            <CalendarIcon className="mr-2 h-4 w-4 text-blue-600" />
                                            {format(selectedMonth, "MMMM yyyy", { locale: es })}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar mode="single" selected={selectedMonth} onSelect={setSelectedMonth} disabled={d => d > new Date()} initialFocus />
                                    </PopoverContent>
                                </Popover>
                                <Button variant="outline" size="icon" onClick={() => setSelectedMonth(d => addDays(endOfMonth(d), 1))}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {[
                                { label: 'Facturado Base', icon: <CheckCircle className="w-4 h-4" />, color: 'green', value: monthlyStats.invoiced.base, sub: `${monthlyStats.invoicedCount} servicios`, extra: [{ label: '💵 Cash', val: monthlyStats.invoiced.cashBase }, { label: '📄 Factura', val: monthlyStats.invoiced.nonCashBase }] },
                                { label: 'Facturado con GST', icon: <CheckCircle className="w-4 h-4" />, color: 'green', value: monthlyStats.invoiced.total, sub: `GST: $${monthlyStats.invoiced.gst.toFixed(2)}` },
                                { label: 'Pendiente Base', icon: <Clock className="w-4 h-4" />, color: 'orange', value: monthlyStats.pending.base, sub: `${monthlyStats.pendingCount} servicios` },
                                { label: 'Pendiente con GST', icon: <Clock className="w-4 h-4" />, color: 'orange', value: monthlyStats.pending.total, sub: `GST: $${monthlyStats.pending.gst.toFixed(2)}` },
                            ].map((card, i) => (
                                <Card key={i} className={`shadow-lg border border-${card.color}-200 bg-gradient-to-br from-${card.color}-50 to-white`}>
                                    <CardHeader className="pb-3">
                                        <CardTitle className={`text-sm font-semibold text-${card.color}-700 uppercase tracking-wide flex items-center gap-2`}>
                                            {card.icon}{card.label}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className={`text-3xl font-bold text-${card.color}-900`}>${card.value.toFixed(2)}</p>
                                        {card.extra && (
                                            <div className={`mt-3 space-y-1 pt-3 border-t border-${card.color}-200`}>
                                                {card.extra.map((e, j) => (
                                                    <div key={j} className="flex justify-between">
                                                        <span className={`text-xs text-${card.color}-700 font-medium`}>{e.label}:</span>
                                                        <span className={`text-sm font-bold text-${card.color}-800`}>${e.val.toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <p className={`text-xs text-${card.color}-600 mt-2`}>{card.sub}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        <MonthlyTable title="Servicios con Factura" schedules={nonCashSchedules} clients={clients} gstTypeLabels={gstTypeLabels} gstTypeBadgeColors={gstTypeBadgeColors} getServiceAmount={getServiceAmount} getServiceGstType={getServiceGstType} calcGst={calcGst} headerColor="slate" />
                        {cashSchedules.length > 0 && <MonthlyTable title="Servicios Cash" schedules={cashSchedules} clients={clients} gstTypeLabels={gstTypeLabels} gstTypeBadgeColors={gstTypeBadgeColors} getServiceAmount={getServiceAmount} getServiceGstType={getServiceGstType} calcGst={calcGst} headerColor="green" icon={<DollarSign className="w-6 h-6 text-green-600" />} />}
                    </TabsContent>

                    {/* ── BY CLIENT TAB ─────────────────────────────────────── */}
                    <TabsContent value="by-client">
                        <ClientSummaryReportTab
                            monthlySchedules={monthlySchedules}
                            clients={clients}
                            usersMap={usersMap}
                            allWorkEntries={allWorkEntries}
                            onRefresh={() => fetchMonthlyData(selectedMonth)}
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
                            <AlertTriangle className="w-5 h-5" />Confirmar Eliminación
                        </DialogTitle>
                    </DialogHeader>
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-800 text-sm">
                        ¿Estás seguro? Esta acción <strong>no se puede deshacer</strong>.
                    </div>
                    {serviceToDelete && (
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm space-y-1">
                            <p><strong>Cliente:</strong> {clients.get(serviceToDelete.client_id)?.name || 'Desconocido'}</p>
                            <p><strong>Horario:</strong> {formatTimeUTC(serviceToDelete.start_time)} - {formatTimeUTC(serviceToDelete.end_time)}</p>
                        </div>
                    )}
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={handleCancelDelete} disabled={dayLoading}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleConfirmDelete} disabled={dayLoading}>
                            {dayLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                            Sí, eliminar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function AmountCell({ price, gstType, invoiced }) {
    return (
        <div className="space-y-1.5">
            <div className="font-bold text-lg text-blue-700">${(price || 0).toFixed(2)}</div>
            <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold ${gstTypeBadgeColors[gstType] || gstTypeBadgeColors.inclusive}`}>
                {gstTypeLabels[gstType] || 'GST Incluido'}
            </span>
            {invoiced && <InvoicedBadge />}
        </div>
    );
}

function InvoicedBadge() {
    return (
        <div className="text-xs text-green-600 font-medium flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />Precio Facturado
        </div>
    );
}

function MonthlyTable({ title, schedules, clients, gstTypeLabels, gstTypeBadgeColors, getServiceAmount, getServiceGstType, calcGst, headerColor = 'slate', icon }) {
    return (
        <div className={`bg-white rounded-xl shadow-lg border border-${headerColor}-200 overflow-hidden`}>
            <div className={`p-6 border-b border-${headerColor}-200 ${headerColor === 'green' ? 'bg-green-50' : ''}`}>
                <h2 className={`text-2xl font-bold text-${headerColor}-900 flex items-center gap-2`}>
                    {icon || <FileText className="w-6 h-6 text-blue-600" />}{title}
                </h2>
            </div>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader className={`bg-${headerColor}-100`}>
                        <TableRow>
                            <TableHead className="font-bold">Fecha</TableHead>
                            <TableHead className="font-bold">Cliente</TableHead>
                            <TableHead className="text-right font-bold">Base</TableHead>
                            <TableHead className="text-right font-bold">GST</TableHead>
                            <TableHead className="text-right font-bold">Total</TableHead>
                            <TableHead className="text-center font-bold">GST Type</TableHead>
                            <TableHead className="text-center font-bold">Estado</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {schedules.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">Sin servicios</TableCell></TableRow>
                        ) : schedules.map(service => {
                            const client = clients.get(service.client_id);
                            const amount = getServiceAmount(service, client);
                            const gstType = getServiceGstType(service, client);
                            const { base, gst, total } = calcGst(amount, gstType);
                            const dateStr = service.start_time?.slice(0, 10) || '';
                            const [y, m, d] = dateStr.split('-').map(Number);
                            const dt = new Date(y, m - 1, d);
                            return (
                                <TableRow key={service.id} className={service.xero_invoiced ? 'bg-green-50/50' : 'hover:bg-slate-50'}>
                                    <TableCell className="font-medium">{format(dt, "d MMM", { locale: es })}</TableCell>
                                    <TableCell className="font-semibold text-slate-900">{client?.name || 'Desconocido'}</TableCell>
                                    <TableCell className="text-right font-medium">${base.toFixed(2)}</TableCell>
                                    <TableCell className="text-right text-slate-600">${gst.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-bold">${total.toFixed(2)}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge className={gstTypeBadgeColors[gstType] || gstTypeBadgeColors.inclusive}>
                                            {gstTypeLabels[gstType] || 'Incluido'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge className={service.xero_invoiced ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'}>
                                            {service.xero_invoiced ? <><CheckCircle className="w-3 h-3 mr-1" />Facturado</> : <><Clock className="w-3 h-3 mr-1" />Pendiente</>}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}