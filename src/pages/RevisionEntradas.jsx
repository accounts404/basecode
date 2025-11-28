import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    FileSearch,
    Users,
    Calendar,
    Clock,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Plus,
    RefreshCw,
    DollarSign,
    ArrowRight,
    ChevronLeft,
    ChevronRight,
    AlertCircle,
    Edit,
    Trash2
} from "lucide-react";
import { format, startOfMonth, endOfMonth, parseISO, isSameDay } from "date-fns";
import { es } from "date-fns/locale";

// Helper para parsear fechas ISO en hora local
const parseISOAsLocal = (isoString) => {
    if (!isoString) return null;
    const cleanString = isoString.endsWith('Z') ? isoString.slice(0, -1) : isoString;
    return new Date(cleanString);
};

// Calcular horas entre dos fechas
const calculateHours = (startTime, endTime) => {
    if (!startTime || !endTime) return 0;
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end - start;
    return Math.round((diffMs / (1000 * 60 * 60)) * 4) / 4; // Redondear a cuartos de hora
};

// Obtener quincenas del año
const getQuincenas = (year) => {
    const quincenas = [];
    for (let month = 0; month < 12; month++) {
        const monthName = format(new Date(year, month, 1), 'MMMM', { locale: es });
        
        // Primera quincena (1-15)
        quincenas.push({
            label: `${monthName} 1-15`,
            value: `${year}-${String(month + 1).padStart(2, '0')}-1`,
            startDate: new Date(year, month, 1),
            endDate: new Date(year, month, 15, 23, 59, 59)
        });
        
        // Segunda quincena (16-fin de mes)
        const lastDay = new Date(year, month + 1, 0).getDate();
        quincenas.push({
            label: `${monthName} 16-${lastDay}`,
            value: `${year}-${String(month + 1).padStart(2, '0')}-2`,
            startDate: new Date(year, month, 16),
            endDate: new Date(year, month, lastDay, 23, 59, 59)
        });
    }
    return quincenas;
};

// Determinar la quincena actual
const getCurrentQuincena = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const half = day <= 15 ? 1 : 2;
    return `${year}-${String(month).padStart(2, '0')}-${half}`;
};

export default function RevisionEntradas() {
    const [user, setUser] = useState(null);
    const [cleaners, setCleaners] = useState([]);
    const [selectedCleanerId, setSelectedCleanerId] = useState(null);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedQuincena, setSelectedQuincena] = useState(getCurrentQuincena());
    
    const [workEntries, setWorkEntries] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [clients, setClients] = useState([]);
    
    const [loading, setLoading] = useState(true);
    const [loadingData, setLoadingData] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [scheduleToCreateEntry, setScheduleToCreateEntry] = useState(null);
    const [newEntryData, setNewEntryData] = useState({
        hours: 0,
        hourly_rate: 30,
        activity: 'domestic',
        notes: ''
    });
    const [saving, setSaving] = useState(false);

    // Obtener quincenas disponibles
    const quincenas = useMemo(() => getQuincenas(selectedYear), [selectedYear]);
    
    // Obtener la quincena seleccionada
    const currentQuincenaData = useMemo(() => {
        return quincenas.find(q => q.value === selectedQuincena);
    }, [quincenas, selectedQuincena]);

    // Cargar datos iniciales
    useEffect(() => {
        loadInitialData();
    }, []);

    // Cargar datos cuando cambia el limpiador o la quincena
    useEffect(() => {
        if (selectedCleanerId && currentQuincenaData) {
            loadCleanerData();
        }
    }, [selectedCleanerId, selectedQuincena]);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            const [currentUser, allUsers, allClients] = await Promise.all([
                base44.auth.me(),
                base44.entities.User.list(),
                base44.entities.Client.list()
            ]);
            
            setUser(currentUser);
            
            // Filtrar solo limpiadores activos
            const cleanersList = allUsers.filter(u => 
                u.role !== 'admin' && u.active !== false
            ).sort((a, b) => {
                const nameA = a.invoice_name || a.full_name || '';
                const nameB = b.invoice_name || b.full_name || '';
                return nameA.localeCompare(nameB);
            });
            
            setCleaners(cleanersList);
            setClients(allClients);
            
            // Seleccionar el primer limpiador por defecto
            if (cleanersList.length > 0) {
                setSelectedCleanerId(cleanersList[0].id);
            }
            
        } catch (err) {
            console.error('Error cargando datos iniciales:', err);
            setError('Error al cargar datos iniciales');
        } finally {
            setLoading(false);
        }
    };

    const loadCleanerData = async () => {
        if (!selectedCleanerId || !currentQuincenaData) return;
        
        setLoadingData(true);
        setError('');
        
        try {
            const startDateStr = format(currentQuincenaData.startDate, 'yyyy-MM-dd');
            const endDateStr = format(currentQuincenaData.endDate, 'yyyy-MM-dd');
            
            console.log(`[RevisionEntradas] Cargando datos para ${selectedCleanerId} del ${startDateStr} al ${endDateStr}`);
            
            // Cargar WorkEntries del limpiador en el período
            const entriesPromise = base44.entities.WorkEntry.filter({
                cleaner_id: selectedCleanerId
            });
            
            // Cargar Schedules del limpiador en el período
            const schedulesPromise = base44.entities.Schedule.filter({
                cleaner_ids: { $contains: selectedCleanerId }
            });
            
            const [allEntries, allSchedules] = await Promise.all([entriesPromise, schedulesPromise]);
            
            // Filtrar por fechas en el cliente
            const filteredEntries = (allEntries || []).filter(entry => {
                if (!entry.work_date) return false;
                const entryDate = new Date(entry.work_date);
                return entryDate >= currentQuincenaData.startDate && entryDate <= currentQuincenaData.endDate;
            });
            
            const filteredSchedules = (allSchedules || []).filter(schedule => {
                if (!schedule.start_time) return false;
                const scheduleDate = parseISOAsLocal(schedule.start_time);
                return scheduleDate >= currentQuincenaData.startDate && scheduleDate <= currentQuincenaData.endDate;
            });
            
            console.log(`[RevisionEntradas] Encontradas ${filteredEntries.length} entradas y ${filteredSchedules.length} servicios`);
            
            setWorkEntries(filteredEntries);
            setSchedules(filteredSchedules);
            
        } catch (err) {
            console.error('Error cargando datos del limpiador:', err);
            setError('Error al cargar datos del limpiador');
        } finally {
            setLoadingData(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadCleanerData();
        setRefreshing(false);
    };

    // Obtener el nombre del cliente
    const getClientName = (clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client?.name || clientId || 'Sin cliente';
    };

    // Obtener datos de clock-in/out del limpiador para un schedule
    const getClockData = (schedule) => {
        if (!schedule.clock_in_data || !Array.isArray(schedule.clock_in_data)) return null;
        return schedule.clock_in_data.find(c => c.cleaner_id === selectedCleanerId);
    };

    // Calcular horas trabajadas según clock-in/out
    const getWorkedHoursFromSchedule = (schedule) => {
        const clockData = getClockData(schedule);
        if (!clockData?.clock_in_time || !clockData?.clock_out_time) return 0;
        return calculateHours(clockData.clock_in_time, clockData.clock_out_time);
    };

    // Agrupar datos por fecha
    const groupedData = useMemo(() => {
        const dateMap = new Map();
        
        // Procesar schedules
        schedules.forEach(schedule => {
            const dateStr = schedule.start_time.slice(0, 10);
            if (!dateMap.has(dateStr)) {
                dateMap.set(dateStr, { date: dateStr, schedules: [], entries: [] });
            }
            dateMap.get(dateStr).schedules.push(schedule);
        });
        
        // Procesar work entries
        workEntries.forEach(entry => {
            const dateStr = entry.work_date;
            if (!dateMap.has(dateStr)) {
                dateMap.set(dateStr, { date: dateStr, schedules: [], entries: [] });
            }
            dateMap.get(dateStr).entries.push(entry);
        });
        
        // Ordenar por fecha
        return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    }, [schedules, workEntries]);

    // Analizar discrepancias
    const discrepancies = useMemo(() => {
        const issues = [];
        
        groupedData.forEach(dayData => {
            // Revisar cada schedule completado
            dayData.schedules.forEach(schedule => {
                const clockData = getClockData(schedule);
                const hasClockIn = clockData?.clock_in_time;
                const hasClockOut = clockData?.clock_out_time;
                const isCompleted = schedule.status === 'completed';
                
                // Buscar WorkEntry vinculada a este schedule
                const linkedEntry = dayData.entries.find(e => e.schedule_id === schedule.id);
                
                // Si está completado y tiene clock-in/out pero no tiene WorkEntry
                if (isCompleted && hasClockIn && hasClockOut && !linkedEntry) {
                    issues.push({
                        type: 'missing_entry',
                        date: dayData.date,
                        schedule: schedule,
                        message: `Servicio completado sin entrada de trabajo`,
                        severity: 'high'
                    });
                }
                
                // Si tiene clock-in pero no clock-out (servicio en progreso olvidado)
                if (hasClockIn && !hasClockOut && schedule.status !== 'in_progress') {
                    issues.push({
                        type: 'incomplete_clock',
                        date: dayData.date,
                        schedule: schedule,
                        message: `Clock-in sin clock-out`,
                        severity: 'medium'
                    });
                }
                
                // Si hay entrada vinculada, comparar horas
                if (linkedEntry && hasClockIn && hasClockOut) {
                    const workedHours = getWorkedHoursFromSchedule(schedule);
                    const entryHours = linkedEntry.hours || 0;
                    const hoursDiff = Math.abs(workedHours - entryHours);
                    
                    if (hoursDiff >= 0.5) { // Diferencia de 30 minutos o más
                        issues.push({
                            type: 'hours_mismatch',
                            date: dayData.date,
                            schedule: schedule,
                            entry: linkedEntry,
                            workedHours: workedHours,
                            entryHours: entryHours,
                            message: `Diferencia de ${hoursDiff.toFixed(2)} horas`,
                            severity: 'low'
                        });
                    }
                }
            });
            
            // Revisar entradas sin schedule vinculado (puede ser normal para actividades manuales)
            dayData.entries.forEach(entry => {
                if (!entry.schedule_id) {
                    // Solo marcar si no es una actividad manual conocida
                    const manualActivities = ['entrenamiento', 'gasolina', 'inspecciones', 'otros'];
                    if (!manualActivities.includes(entry.activity)) {
                        issues.push({
                            type: 'orphan_entry',
                            date: dayData.date,
                            entry: entry,
                            message: `Entrada sin servicio vinculado`,
                            severity: 'info'
                        });
                    }
                }
            });
        });
        
        return issues;
    }, [groupedData, selectedCleanerId]);

    // Resumen de totales
    const summary = useMemo(() => {
        const totalScheduledHours = schedules.reduce((sum, s) => {
            return sum + getWorkedHoursFromSchedule(s);
        }, 0);
        
        const totalEntryHours = workEntries.reduce((sum, e) => sum + (e.hours || 0), 0);
        const totalEntryAmount = workEntries.reduce((sum, e) => sum + (e.total_amount || 0), 0);
        
        const completedServices = schedules.filter(s => s.status === 'completed').length;
        const totalServices = schedules.length;
        
        return {
            totalScheduledHours,
            totalEntryHours,
            totalEntryAmount,
            completedServices,
            totalServices,
            entriesCount: workEntries.length,
            discrepanciesCount: discrepancies.filter(d => d.severity === 'high').length
        };
    }, [schedules, workEntries, discrepancies]);

    // Obtener limpiador seleccionado
    const selectedCleaner = useMemo(() => {
        return cleaners.find(c => c.id === selectedCleanerId);
    }, [cleaners, selectedCleanerId]);

    // Abrir diálogo para crear WorkEntry
    const openCreateEntryDialog = (schedule) => {
        const clockData = getClockData(schedule);
        const workedHours = getWorkedHoursFromSchedule(schedule);
        
        // Obtener tarifa del limpiador
        const cleaner = cleaners.find(c => c.id === selectedCleanerId);
        let hourlyRate = 30; // Default
        
        if (cleaner?.rate_history && cleaner.rate_history.length > 0) {
            // Obtener la tarifa más reciente
            const sortedRates = [...cleaner.rate_history].sort((a, b) => 
                new Date(b.effective_date) - new Date(a.effective_date)
            );
            hourlyRate = sortedRates[0].hourly_rate || 30;
        }
        
        // Determinar tipo de actividad según el cliente
        const client = clients.find(c => c.id === schedule.client_id);
        let activity = 'domestic';
        if (client?.client_type === 'commercial') activity = 'commercial';
        if (client?.client_type === 'training') activity = 'training';
        
        setScheduleToCreateEntry(schedule);
        setNewEntryData({
            hours: workedHours,
            hourly_rate: hourlyRate,
            activity: activity,
            notes: ''
        });
        setShowCreateDialog(true);
    };

    // Crear WorkEntry
    const handleCreateEntry = async () => {
        if (!scheduleToCreateEntry || !selectedCleanerId) return;
        
        setSaving(true);
        try {
            const schedule = scheduleToCreateEntry;
            const cleaner = cleaners.find(c => c.id === selectedCleanerId);
            const client = clients.find(c => c.id === schedule.client_id);
            
            const workDate = schedule.start_time.slice(0, 10);
            const totalAmount = newEntryData.hours * newEntryData.hourly_rate;
            
            // Calcular período de facturación
            const dateObj = new Date(workDate);
            const day = dateObj.getDate();
            const month = dateObj.getMonth() + 1;
            const year = dateObj.getFullYear();
            const periodHalf = day <= 15 ? '1st' : '2nd';
            const period = `${year}-${String(month).padStart(2, '0')}-${periodHalf}`;
            
            const entryData = {
                cleaner_id: selectedCleanerId,
                cleaner_name: cleaner?.invoice_name || cleaner?.full_name || 'Desconocido',
                client_id: schedule.client_id,
                client_name: client?.name || schedule.client_name || 'Sin cliente',
                work_date: workDate,
                hours: newEntryData.hours,
                activity: newEntryData.activity,
                hourly_rate: newEntryData.hourly_rate,
                total_amount: totalAmount,
                period: period,
                schedule_id: schedule.id,
                invoiced: false
            };
            
            await base44.entities.WorkEntry.create(entryData);
            
            console.log('[RevisionEntradas] WorkEntry creada exitosamente');
            
            setShowCreateDialog(false);
            setScheduleToCreateEntry(null);
            
            // Recargar datos
            await loadCleanerData();
            
        } catch (err) {
            console.error('Error creando WorkEntry:', err);
            setError('Error al crear la entrada de trabajo');
        } finally {
            setSaving(false);
        }
    };

    // Renderizar badge de estado
    const getStatusBadge = (status) => {
        const statusConfig = {
            completed: { label: 'Completado', className: 'bg-green-100 text-green-800' },
            cancelled: { label: 'Cancelado', className: 'bg-red-100 text-red-800' },
            scheduled: { label: 'Programado', className: 'bg-blue-100 text-blue-800' },
            in_progress: { label: 'En Progreso', className: 'bg-orange-100 text-orange-800' }
        };
        const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-800' };
        return <Badge className={config.className}>{config.label}</Badge>;
    };

    // Renderizar badge de severidad
    const getSeverityBadge = (severity) => {
        const config = {
            high: { label: 'Alta', className: 'bg-red-100 text-red-800', icon: AlertTriangle },
            medium: { label: 'Media', className: 'bg-orange-100 text-orange-800', icon: AlertCircle },
            low: { label: 'Baja', className: 'bg-yellow-100 text-yellow-800', icon: AlertCircle },
            info: { label: 'Info', className: 'bg-blue-100 text-blue-800', icon: AlertCircle }
        };
        const conf = config[severity] || config.info;
        const Icon = conf.icon;
        return (
            <Badge className={`${conf.className} flex items-center gap-1`}>
                <Icon className="w-3 h-3" />
                {conf.label}
            </Badge>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-slate-600">Cargando...</p>
                </div>
            </div>
        );
    }

    if (user?.role !== 'admin') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
                <Card className="max-w-md">
                    <CardContent className="pt-6 text-center">
                        <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-slate-900 mb-2">Acceso Restringido</h2>
                        <p className="text-slate-600">Esta página es solo para administradores.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-100 rounded-lg">
                            <FileSearch className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Revisión de Entradas</h1>
                            <p className="text-slate-600">Compara entradas de trabajo con servicios programados</p>
                        </div>
                    </div>
                    
                    <Button
                        variant="outline"
                        onClick={handleRefresh}
                        disabled={refreshing || loadingData}
                        className="flex items-center gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Actualizar
                    </Button>
                </div>

                {error && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {/* Filtros */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {/* Selector de Limpiador */}
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <Users className="w-4 h-4 text-slate-500" />
                                    Limpiador
                                </Label>
                                <Select value={selectedCleanerId || ''} onValueChange={setSelectedCleanerId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar limpiador" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {cleaners.map(cleaner => (
                                            <SelectItem key={cleaner.id} value={cleaner.id}>
                                                {cleaner.invoice_name || cleaner.full_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Selector de Año */}
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-slate-500" />
                                    Año
                                </Label>
                                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[2023, 2024, 2025, 2026].map(year => (
                                            <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Selector de Quincena */}
                            <div className="space-y-2 md:col-span-2">
                                <Label className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-slate-500" />
                                    Quincena
                                </Label>
                                <Select value={selectedQuincena} onValueChange={setSelectedQuincena}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {quincenas.map(q => (
                                            <SelectItem key={q.value} value={q.value}>
                                                {q.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Resumen */}
                {selectedCleanerId && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        <Card className="bg-white">
                            <CardContent className="pt-4 text-center">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Servicios</p>
                                <p className="text-2xl font-bold text-slate-900">{summary.completedServices}/{summary.totalServices}</p>
                                <p className="text-xs text-slate-500">Completados</p>
                            </CardContent>
                        </Card>
                        
                        <Card className="bg-white">
                            <CardContent className="pt-4 text-center">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Horas Clock</p>
                                <p className="text-2xl font-bold text-blue-600">{summary.totalScheduledHours.toFixed(2)}</p>
                                <p className="text-xs text-slate-500">Registradas</p>
                            </CardContent>
                        </Card>
                        
                        <Card className="bg-white">
                            <CardContent className="pt-4 text-center">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Entradas</p>
                                <p className="text-2xl font-bold text-slate-900">{summary.entriesCount}</p>
                                <p className="text-xs text-slate-500">WorkEntries</p>
                            </CardContent>
                        </Card>
                        
                        <Card className="bg-white">
                            <CardContent className="pt-4 text-center">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Horas Entradas</p>
                                <p className="text-2xl font-bold text-green-600">{summary.totalEntryHours.toFixed(2)}</p>
                                <p className="text-xs text-slate-500">En WorkEntries</p>
                            </CardContent>
                        </Card>
                        
                        <Card className="bg-white">
                            <CardContent className="pt-4 text-center">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Total</p>
                                <p className="text-2xl font-bold text-emerald-600">${summary.totalEntryAmount.toFixed(2)}</p>
                                <p className="text-xs text-slate-500">A Pagar</p>
                            </CardContent>
                        </Card>
                        
                        <Card className={summary.discrepanciesCount > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}>
                            <CardContent className="pt-4 text-center">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Discrepancias</p>
                                <p className={`text-2xl font-bold ${summary.discrepanciesCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {summary.discrepanciesCount}
                                </p>
                                <p className="text-xs text-slate-500">Críticas</p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Alertas de Discrepancias */}
                {discrepancies.length > 0 && (
                    <Card className="border-orange-200 bg-orange-50">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center gap-2 text-orange-900">
                                <AlertTriangle className="w-5 h-5" />
                                Discrepancias Encontradas ({discrepancies.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {discrepancies.map((disc, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                                        <div className="flex items-center gap-3">
                                            {getSeverityBadge(disc.severity)}
                                            <div>
                                                <p className="font-medium text-slate-900">
                                                    {format(new Date(disc.date), 'd MMM yyyy', { locale: es })}
                                                    {disc.schedule && ` - ${getClientName(disc.schedule.client_id)}`}
                                                </p>
                                                <p className="text-sm text-slate-600">{disc.message}</p>
                                            </div>
                                        </div>
                                        {disc.type === 'missing_entry' && disc.schedule && (
                                            <Button
                                                size="sm"
                                                onClick={() => openCreateEntryDialog(disc.schedule)}
                                                className="bg-green-600 hover:bg-green-700"
                                            >
                                                <Plus className="w-4 h-4 mr-1" />
                                                Crear Entrada
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Comparación lado a lado */}
                {loadingData ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
                            <p className="text-slate-600">Cargando datos del limpiador...</p>
                        </CardContent>
                    </Card>
                ) : selectedCleanerId && groupedData.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Panel de Servicios (Schedules) */}
                        <Card>
                            <CardHeader className="bg-blue-50 border-b">
                                <CardTitle className="flex items-center gap-2 text-blue-900">
                                    <Calendar className="w-5 h-5" />
                                    Servicios Programados ({schedules.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="max-h-[600px] overflow-y-auto">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-white">
                                            <TableRow>
                                                <TableHead>Fecha</TableHead>
                                                <TableHead>Cliente</TableHead>
                                                <TableHead>Clock In/Out</TableHead>
                                                <TableHead>Horas</TableHead>
                                                <TableHead>Estado</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {schedules.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                                                        No hay servicios en este período
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                schedules.sort((a, b) => a.start_time.localeCompare(b.start_time)).map(schedule => {
                                                    const clockData = getClockData(schedule);
                                                    const workedHours = getWorkedHoursFromSchedule(schedule);
                                                    const hasEntry = workEntries.some(e => e.schedule_id === schedule.id);
                                                    const isCompleted = schedule.status === 'completed';
                                                    const needsEntry = isCompleted && clockData?.clock_in_time && clockData?.clock_out_time && !hasEntry;
                                                    
                                                    return (
                                                        <TableRow 
                                                            key={schedule.id}
                                                            className={needsEntry ? 'bg-red-50' : ''}
                                                        >
                                                            <TableCell>
                                                                <div className="font-medium">
                                                                    {format(parseISOAsLocal(schedule.start_time), 'd MMM', { locale: es })}
                                                                </div>
                                                                <div className="text-xs text-slate-500">
                                                                    {format(parseISOAsLocal(schedule.start_time), 'HH:mm')} - {format(parseISOAsLocal(schedule.end_time), 'HH:mm')}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="font-medium truncate max-w-[120px]">
                                                                    {getClientName(schedule.client_id)}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                {clockData?.clock_in_time ? (
                                                                    <div className="text-xs">
                                                                        <div className="text-green-600">
                                                                            In: {format(parseISOAsLocal(clockData.clock_in_time), 'HH:mm')}
                                                                        </div>
                                                                        {clockData.clock_out_time ? (
                                                                            <div className="text-blue-600">
                                                                                Out: {format(parseISOAsLocal(clockData.clock_out_time), 'HH:mm')}
                                                                            </div>
                                                                        ) : (
                                                                            <div className="text-orange-600">Sin clock-out</div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-slate-400 text-xs">Sin registro</span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell>
                                                                <span className="font-semibold">
                                                                    {workedHours > 0 ? `${workedHours.toFixed(2)}h` : '-'}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex items-center gap-1">
                                                                    {getStatusBadge(schedule.status)}
                                                                    {hasEntry && (
                                                                        <CheckCircle className="w-4 h-4 text-green-500" title="Tiene WorkEntry" />
                                                                    )}
                                                                    {needsEntry && (
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            onClick={() => openCreateEntryDialog(schedule)}
                                                                            className="h-6 w-6 p-0 text-green-600 hover:text-green-700"
                                                                            title="Crear entrada"
                                                                        >
                                                                            <Plus className="w-4 h-4" />
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Panel de Entradas de Trabajo (WorkEntries) */}
                        <Card>
                            <CardHeader className="bg-green-50 border-b">
                                <CardTitle className="flex items-center gap-2 text-green-900">
                                    <DollarSign className="w-5 h-5" />
                                    Entradas de Trabajo ({workEntries.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="max-h-[600px] overflow-y-auto">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-white">
                                            <TableRow>
                                                <TableHead>Fecha</TableHead>
                                                <TableHead>Cliente</TableHead>
                                                <TableHead>Actividad</TableHead>
                                                <TableHead>Horas</TableHead>
                                                <TableHead>Monto</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {workEntries.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                                                        No hay entradas de trabajo en este período
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                workEntries.sort((a, b) => a.work_date.localeCompare(b.work_date)).map(entry => {
                                                    const hasSchedule = entry.schedule_id && schedules.some(s => s.id === entry.schedule_id);
                                                    
                                                    return (
                                                        <TableRow 
                                                            key={entry.id}
                                                            className={!hasSchedule && !['entrenamiento', 'gasolina', 'inspecciones', 'otros'].includes(entry.activity) ? 'bg-yellow-50' : ''}
                                                        >
                                                            <TableCell>
                                                                <div className="font-medium">
                                                                    {format(new Date(entry.work_date), 'd MMM', { locale: es })}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="font-medium truncate max-w-[120px]">
                                                                    {entry.client_name || getClientName(entry.client_id)}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant="outline" className="text-xs">
                                                                    {entry.activity}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                <span className="font-semibold">{entry.hours?.toFixed(2)}h</span>
                                                                <div className="text-xs text-slate-500">${entry.hourly_rate}/h</div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <span className="font-bold text-green-600">
                                                                    ${entry.total_amount?.toFixed(2)}
                                                                </span>
                                                                {entry.invoiced && (
                                                                    <Badge className="ml-1 text-xs bg-purple-100 text-purple-800">Facturada</Badge>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                ) : selectedCleanerId ? (
                    <Card>
                        <CardContent className="py-12 text-center text-slate-500">
                            <FileSearch className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                            <p className="text-lg">No hay datos para el período seleccionado</p>
                            <p className="text-sm">Selecciona otra quincena o verifica que el limpiador tenga servicios asignados</p>
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <CardContent className="py-12 text-center text-slate-500">
                            <Users className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                            <p className="text-lg">Selecciona un limpiador para comenzar</p>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Diálogo para crear WorkEntry */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Crear Entrada de Trabajo</DialogTitle>
                    </DialogHeader>
                    
                    {scheduleToCreateEntry && (
                        <div className="space-y-4">
                            <div className="p-3 bg-slate-50 rounded-lg">
                                <p className="font-medium">{getClientName(scheduleToCreateEntry.client_id)}</p>
                                <p className="text-sm text-slate-600">
                                    {format(parseISOAsLocal(scheduleToCreateEntry.start_time), 'd MMM yyyy HH:mm', { locale: es })}
                                </p>
                                <p className="text-sm text-slate-600">
                                    Limpiador: {selectedCleaner?.invoice_name || selectedCleaner?.full_name}
                                </p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Horas</Label>
                                    <Input
                                        type="number"
                                        step="0.25"
                                        value={newEntryData.hours}
                                        onChange={(e) => setNewEntryData({...newEntryData, hours: parseFloat(e.target.value) || 0})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Tarifa/hora</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={newEntryData.hourly_rate}
                                        onChange={(e) => setNewEntryData({...newEntryData, hourly_rate: parseFloat(e.target.value) || 0})}
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <Label>Actividad</Label>
                                <Select value={newEntryData.activity} onValueChange={(v) => setNewEntryData({...newEntryData, activity: v})}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="domestic">Doméstico</SelectItem>
                                        <SelectItem value="commercial">Comercial</SelectItem>
                                        <SelectItem value="training">Entrenamiento</SelectItem>
                                        <SelectItem value="windows">Ventanas</SelectItem>
                                        <SelectItem value="steam_vacuum">Vapor/Aspirado</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div className="p-3 bg-green-50 rounded-lg">
                                <p className="text-sm text-slate-600">Total a pagar:</p>
                                <p className="text-2xl font-bold text-green-600">
                                    ${(newEntryData.hours * newEntryData.hourly_rate).toFixed(2)}
                                </p>
                            </div>
                        </div>
                    )}
                    
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleCreateEntry} disabled={saving} className="bg-green-600 hover:bg-green-700">
                            {saving ? (
                                <>
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    Creando...
                                </>
                            ) : (
                                <>
                                    <Plus className="w-4 h-4 mr-2" />
                                    Crear Entrada
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}