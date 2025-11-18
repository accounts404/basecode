import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
    Clock, 
    CheckCircle, 
    AlertTriangle, 
    TrendingUp, 
    Users,
    Trophy,
    ChevronDown,
    ChevronUp
} from "lucide-react";
import { format, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";

export default function CleanerPerformanceReport({ 
    cleaners, 
    schedules, 
    workEntries, 
    serviceReports,
    teamAssignments,
    scores 
}) {
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [sortBy, setSortBy] = useState('efficiency');
    const [sortOrder, setSortOrder] = useState('desc');

    // Generar opciones de meses (últimos 6 meses)
    const monthOptions = useMemo(() => {
        const months = [];
        for (let i = 0; i < 6; i++) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            months.push({
                value: format(date, 'yyyy-MM'),
                label: format(date, 'MMMM yyyy', { locale: es })
            });
        }
        return months;
    }, []);

    // Calcular métricas por limpiador
    const cleanerMetrics = useMemo(() => {
        const [year, month] = selectedMonth.split('-');
        const monthStart = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
        const monthEnd = endOfMonth(new Date(parseInt(year), parseInt(month) - 1));

        return cleaners.map(cleaner => {
            // Filtrar datos del mes seleccionado
            const cleanerWorkEntries = workEntries.filter(we => 
                we.cleaner_id === cleaner.id &&
                we.work_date &&
                isWithinInterval(new Date(we.work_date), { start: monthStart, end: monthEnd })
            );

            const cleanerSchedules = schedules.filter(s =>
                s.cleaner_ids?.includes(cleaner.id) &&
                s.start_time &&
                isWithinInterval(new Date(s.start_time), { start: monthStart, end: monthEnd })
            );

            const cleanerReports = serviceReports.filter(sr =>
                sr.cleaner_id === cleaner.id &&
                sr.service_date &&
                isWithinInterval(new Date(sr.service_date), { start: monthStart, end: monthEnd })
            );

            const cleanerTeamAssignments = teamAssignments.filter(ta =>
                ta.team_member_ids?.includes(cleaner.id) &&
                ta.date &&
                isWithinInterval(new Date(ta.date), { start: monthStart, end: monthEnd })
            );

            // Calcular métricas
            const totalHours = cleanerWorkEntries.reduce((sum, we) => sum + (we.hours || 0), 0);
            const completedServices = cleanerSchedules.filter(s => s.status === 'completed').length;
            const totalServices = cleanerSchedules.length;
            
            // Calcular días únicos trabajados
            const uniqueWorkDates = new Set(
                cleanerWorkEntries
                    .filter(we => we.work_date)
                    .map(we => we.work_date.slice(0, 10))
            );
            const daysWorked = uniqueWorkDates.size;
            const avgHoursPerDay = daysWorked > 0 ? totalHours / daysWorked : 0;

            // Puntualidad: comparar clock_in_time real vs start_time programado
            let onTimeCount = 0;
            let lateCount = 0;
            cleanerSchedules.forEach(schedule => {
                const clockData = schedule.clock_in_data?.find(c => c.cleaner_id === cleaner.id);
                if (clockData?.clock_in_time && schedule.start_time) {
                    const scheduledTime = new Date(schedule.start_time);
                    const actualTime = new Date(clockData.clock_in_time);
                    const diffMinutes = (actualTime - scheduledTime) / (1000 * 60);
                    
                    if (diffMinutes <= 5) { // tolerancia de 5 minutos
                        onTimeCount++;
                    } else {
                        lateCount++;
                    }
                }
            });

            const punctualityRate = (onTimeCount + lateCount) > 0 
                ? (onTimeCount / (onTimeCount + lateCount)) * 100 
                : 100;

            // Reportes
            const totalReports = cleanerReports.length;
            const pendingReports = cleanerReports.filter(r => r.status === 'pending').length;

            // Asignaciones a equipos
            const daysWithTeamAssignment = cleanerTeamAssignments.length;

            // Puntuación del mes
            const monthScore = scores.find(s => 
                s.cleaner_id === cleaner.id && 
                s.month_period === selectedMonth
            );

            // Calcular eficiencia general (0-100)
            const efficiency = (
                (completedServices / Math.max(totalServices, 1)) * 30 + // 30% completitud
                (punctualityRate * 0.3) + // 30% puntualidad
                Math.min((totalHours / 160) * 20, 20) + // 20% horas trabajadas (160h = jornada completa)
                (monthScore ? (monthScore.current_score / 100) * 20 : 20) // 20% puntuación
            );

            return {
                cleaner,
                totalHours: Math.round(totalHours * 10) / 10,
                completedServices,
                totalServices,
                daysWorked,
                avgHoursPerDay: Math.round(avgHoursPerDay * 10) / 10,
                punctualityRate: Math.round(punctualityRate * 10) / 10,
                onTimeCount,
                lateCount,
                totalReports,
                pendingReports,
                daysWithTeamAssignment,
                monthScore: monthScore?.current_score || null,
                efficiency: Math.round(efficiency * 10) / 10
            };
        }).filter(m => m.cleaner.active !== false); // Solo limpiadores activos
    }, [cleaners, schedules, workEntries, serviceReports, teamAssignments, scores, selectedMonth]);

    // Ordenar métricas
    const sortedMetrics = useMemo(() => {
        const sorted = [...cleanerMetrics].sort((a, b) => {
            let comparison = 0;
            
            switch(sortBy) {
                case 'efficiency':
                    comparison = b.efficiency - a.efficiency;
                    break;
                case 'hours':
                    comparison = b.totalHours - a.totalHours;
                    break;
                case 'services':
                    comparison = b.completedServices - a.completedServices;
                    break;
                case 'punctuality':
                    comparison = b.punctualityRate - a.punctualityRate;
                    break;
                case 'name':
                    comparison = (a.cleaner.full_name || '').localeCompare(b.cleaner.full_name || '');
                    break;
                default:
                    comparison = 0;
            }
            
            return sortOrder === 'asc' ? -comparison : comparison;
        });
        
        return sorted;
    }, [cleanerMetrics, sortBy, sortOrder]);

    const toggleSort = (field) => {
        if (sortBy === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('desc');
        }
    };

    const SortIcon = ({ field }) => {
        if (sortBy !== field) return null;
        return sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
    };

    // Estadísticas generales
    const totalStats = useMemo(() => {
        return {
            totalHours: sortedMetrics.reduce((sum, m) => sum + m.totalHours, 0),
            totalServices: sortedMetrics.reduce((sum, m) => sum + m.completedServices, 0),
            avgEfficiency: sortedMetrics.length > 0 
                ? sortedMetrics.reduce((sum, m) => sum + m.efficiency, 0) / sortedMetrics.length 
                : 0,
            avgPunctuality: sortedMetrics.length > 0
                ? sortedMetrics.reduce((sum, m) => sum + m.punctualityRate, 0) / sortedMetrics.length
                : 0
        };
    }, [sortedMetrics]);

    return (
        <div className="space-y-6">
            {/* Controles */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">Período:</span>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="w-48">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {monthOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">Ordenar por:</span>
                    <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-48">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="efficiency">Eficiencia</SelectItem>
                            <SelectItem value="hours">Horas Trabajadas</SelectItem>
                            <SelectItem value="services">Servicios Completados</SelectItem>
                            <SelectItem value="punctuality">Puntualidad</SelectItem>
                            <SelectItem value="name">Nombre</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* KPIs Generales */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Horas Totales</p>
                                <p className="text-2xl font-bold text-slate-900">{Math.round(totalStats.totalHours)}</p>
                            </div>
                            <Clock className="w-8 h-8 text-blue-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Servicios Completados</p>
                                <p className="text-2xl font-bold text-slate-900">{totalStats.totalServices}</p>
                            </div>
                            <CheckCircle className="w-8 h-8 text-green-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Eficiencia Promedio</p>
                                <p className="text-2xl font-bold text-slate-900">{Math.round(totalStats.avgEfficiency)}%</p>
                            </div>
                            <TrendingUp className="w-8 h-8 text-purple-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Puntualidad Promedio</p>
                                <p className="text-2xl font-bold text-slate-900">{Math.round(totalStats.avgPunctuality)}%</p>
                            </div>
                            <Trophy className="w-8 h-8 text-yellow-600" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabla de Limpiadores */}
            <Card>
                <CardHeader>
                    <CardTitle>Rendimiento Individual</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left p-3 text-sm font-semibold text-slate-700">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => toggleSort('name')}
                                            className="flex items-center gap-1 -ml-3"
                                        >
                                            Limpiador
                                            <SortIcon field="name" />
                                        </Button>
                                    </th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => toggleSort('efficiency')}
                                            className="flex items-center gap-1"
                                        >
                                            Eficiencia
                                            <SortIcon field="efficiency" />
                                        </Button>
                                    </th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => toggleSort('hours')}
                                            className="flex items-center gap-1"
                                        >
                                            Horas
                                            <SortIcon field="hours" />
                                        </Button>
                                    </th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => toggleSort('services')}
                                            className="flex items-center gap-1"
                                        >
                                            Servicios
                                            <SortIcon field="services" />
                                        </Button>
                                    </th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">Días Trabajados</th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">Promedio h/día</th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => toggleSort('punctuality')}
                                            className="flex items-center gap-1"
                                        >
                                            Puntualidad
                                            <SortIcon field="punctuality" />
                                        </Button>
                                    </th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">Reportes</th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">Puntuación</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedMetrics.map((metric, index) => (
                                    <tr key={metric.cleaner.id} className="border-b hover:bg-slate-50">
                                        <td className="p-3">
                                            <div className="flex items-center gap-2">
                                                <div 
                                                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                                                    style={{ backgroundColor: metric.cleaner.color || '#3b82f6' }}
                                                >
                                                    {metric.cleaner.full_name?.charAt(0)?.toUpperCase()}
                                                </div>
                                                <span className="font-medium">{metric.cleaner.full_name}</span>
                                            </div>
                                        </td>
                                        <td className="p-3 text-center">
                                            <Badge 
                                                className={
                                                    metric.efficiency >= 80 ? "bg-green-100 text-green-800" :
                                                    metric.efficiency >= 60 ? "bg-yellow-100 text-yellow-800" :
                                                    "bg-red-100 text-red-800"
                                                }
                                            >
                                                {metric.efficiency}%
                                            </Badge>
                                        </td>
                                        <td className="p-3 text-center font-medium">{metric.totalHours}h</td>
                                        <td className="p-3 text-center">
                                            <span className="font-medium">{metric.completedServices}</span>
                                            <span className="text-slate-400 text-sm">/{metric.totalServices}</span>
                                        </td>
                                        <td className="p-3 text-center font-medium text-slate-600">{metric.daysWorked}</td>
                                        <td className="p-3 text-center font-medium text-blue-700">{metric.avgHoursPerDay}h</td>
                                        <td className="p-3 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <span className="font-medium">{metric.punctualityRate}%</span>
                                                {metric.punctualityRate >= 90 && (
                                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                {metric.onTimeCount} a tiempo / {metric.lateCount} tarde
                                            </div>
                                        </td>
                                        <td className="p-3 text-center">
                                            {metric.totalReports > 0 ? (
                                                <div className="flex items-center justify-center gap-1">
                                                    <AlertTriangle className="w-4 h-4 text-orange-600" />
                                                    <span className="text-sm">{metric.totalReports}</span>
                                                    {metric.pendingReports > 0 && (
                                                        <span className="text-xs text-red-600">({metric.pendingReports} pend.)</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-slate-400">-</span>
                                            )}
                                        </td>
                                        <td className="p-3 text-center">
                                            {metric.monthScore !== null ? (
                                                <Badge 
                                                    variant="outline"
                                                    className={
                                                        metric.monthScore >= 90 ? "border-green-500 text-green-700" :
                                                        metric.monthScore >= 70 ? "border-blue-500 text-blue-700" :
                                                        "border-orange-500 text-orange-700"
                                                    }
                                                >
                                                    {metric.monthScore}
                                                </Badge>
                                            ) : (
                                                <span className="text-slate-400">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {sortedMetrics.length === 0 && (
                        <div className="text-center py-12">
                            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-500">No hay datos para el período seleccionado</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}