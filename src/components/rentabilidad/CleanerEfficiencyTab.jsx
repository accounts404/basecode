import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Users, DollarSign, Clock, Target } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { getPriceForSchedule, extractDateOnly, isWithinRange } from '@/components/utils/priceCalculations';

export default function CleanerEfficiencyTab({ 
    clients, 
    allWorkEntries, 
    allSchedules, 
    trainingClientId 
}) {
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

    const availableMonths = useMemo(() => {
        const months = new Set();
        allSchedules.forEach(schedule => {
            if (schedule.start_time) {
                const month = format(new Date(schedule.start_time), 'yyyy-MM');
                months.add(month);
            }
        });
        return Array.from(months).sort().reverse();
    }, [allSchedules]);

    const cleanerStats = useMemo(() => {
        const startDate = startOfMonth(new Date(selectedMonth + '-01'));
        const endDate = endOfMonth(startDate);

        // Filtrar servicios del mes
        const monthSchedules = allSchedules.filter(s => {
            const scheduleDate = extractDateOnly(s.start_time);
            return scheduleDate && isWithinRange(scheduleDate, format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd'));
        });

        // Filtrar work entries del mes
        const monthWorkEntries = allWorkEntries.filter(w => {
            const workDate = extractDateOnly(w.work_date);
            return workDate && isWithinRange(workDate, format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd'));
        });

        const cleanerMap = new Map();

        // Calcular ingresos por limpiador desde schedules
        monthSchedules.forEach(schedule => {
            if (schedule.client_id === trainingClientId) return;
            if (!schedule.cleaner_ids || schedule.cleaner_ids.length === 0) return;

            const client = clients.find(c => c.id === schedule.client_id);
            if (!client) return;

            const totalPrice = getPriceForSchedule(schedule, client);
            const pricePerCleaner = totalPrice / schedule.cleaner_ids.length;

            schedule.cleaner_ids.forEach(cleanerId => {
                if (!cleanerMap.has(cleanerId)) {
                    cleanerMap.set(cleanerId, {
                        cleanerId,
                        revenue: 0,
                        laborCost: 0,
                        hoursWorked: 0,
                        serviceCount: 0,
                    });
                }
                const stats = cleanerMap.get(cleanerId);
                stats.revenue += pricePerCleaner;
                stats.serviceCount += 1;
            });
        });

        // Calcular costos laborales y horas
        monthWorkEntries.forEach(entry => {
            if (!cleanerMap.has(entry.cleaner_id)) {
                cleanerMap.set(entry.cleaner_id, {
                    cleanerId: entry.cleaner_id,
                    revenue: 0,
                    laborCost: 0,
                    hoursWorked: 0,
                    serviceCount: 0,
                });
            }
            const stats = cleanerMap.get(entry.cleaner_id);
            stats.laborCost += entry.total_amount || 0;
            stats.hoursWorked += entry.hours || 0;
        });

        // Calcular métricas derivadas
        const cleanerArray = Array.from(cleanerMap.values()).map(stats => {
            const margin = stats.revenue - stats.laborCost;
            const marginPercent = stats.revenue > 0 ? (margin / stats.revenue) * 100 : 0;
            const revenuePerHour = stats.hoursWorked > 0 ? stats.revenue / stats.hoursWorked : 0;
            const costPerHour = stats.hoursWorked > 0 ? stats.laborCost / stats.hoursWorked : 0;
            const efficiency = stats.revenue > 0 ? (margin / stats.revenue) * 100 : 0;

            // Buscar nombre del limpiador
            const workEntry = monthWorkEntries.find(w => w.cleaner_id === stats.cleanerId);
            const cleanerName = workEntry?.cleaner_name || 'Limpiador desconocido';

            return {
                ...stats,
                cleanerName,
                margin,
                marginPercent,
                revenuePerHour,
                costPerHour,
                efficiency,
            };
        });

        return cleanerArray.sort((a, b) => b.efficiency - a.efficiency);
    }, [selectedMonth, allSchedules, allWorkEntries, clients, trainingClientId]);

    const totalStats = useMemo(() => {
        return cleanerStats.reduce((acc, cleaner) => ({
            revenue: acc.revenue + cleaner.revenue,
            laborCost: acc.laborCost + cleaner.laborCost,
            hoursWorked: acc.hoursWorked + cleaner.hoursWorked,
            serviceCount: acc.serviceCount + cleaner.serviceCount,
        }), { revenue: 0, laborCost: 0, hoursWorked: 0, serviceCount: 0 });
    }, [cleanerStats]);

    const formatCurrency = (value) => `$${value.toFixed(2)}`;

    return (
        <div className="space-y-6">
            {/* Header con selector de mes */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Eficiencia por Limpiador</h2>
                    <p className="text-slate-600">Análisis de rentabilidad individual</p>
                </div>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-48">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {availableMonths.map(month => (
                            <SelectItem key={month} value={month}>
                                {format(new Date(month + '-01'), 'MMMM yyyy')}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Tarjetas resumen */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            Ingresos Totales
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                            {formatCurrency(totalStats.revenue)}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Costo Laboral
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-600">
                            {formatCurrency(totalStats.laborCost)}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Horas Trabajadas
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">
                            {totalStats.hoursWorked.toFixed(1)}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                            <Target className="w-4 h-4" />
                            Margen Promedio
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-600">
                            {totalStats.revenue > 0 
                                ? `${(((totalStats.revenue - totalStats.laborCost) / totalStats.revenue) * 100).toFixed(1)}%`
                                : '0%'
                            }
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabla de limpiadores */}
            <Card>
                <CardHeader>
                    <CardTitle>Detalle por Limpiador</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Limpiador</TableHead>
                                <TableHead className="text-right">Ingresos</TableHead>
                                <TableHead className="text-right">Costo Laboral</TableHead>
                                <TableHead className="text-right">Margen</TableHead>
                                <TableHead className="text-right">Margen %</TableHead>
                                <TableHead className="text-right">Horas</TableHead>
                                <TableHead className="text-right">$/Hora Rev</TableHead>
                                <TableHead className="text-right">$/Hora Costo</TableHead>
                                <TableHead className="text-right">Servicios</TableHead>
                                <TableHead className="text-center">Eficiencia</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {cleanerStats.map((cleaner) => (
                                <TableRow key={cleaner.cleanerId}>
                                    <TableCell className="font-medium">{cleaner.cleanerName}</TableCell>
                                    <TableCell className="text-right text-green-600 font-medium">
                                        {formatCurrency(cleaner.revenue)}
                                    </TableCell>
                                    <TableCell className="text-right text-orange-600">
                                        {formatCurrency(cleaner.laborCost)}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {formatCurrency(cleaner.margin)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <span className={cleaner.marginPercent >= 50 ? 'text-green-600' : cleaner.marginPercent >= 30 ? 'text-yellow-600' : 'text-red-600'}>
                                            {cleaner.marginPercent.toFixed(1)}%
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">{cleaner.hoursWorked.toFixed(1)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(cleaner.revenuePerHour)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(cleaner.costPerHour)}</TableCell>
                                    <TableCell className="text-right">{cleaner.serviceCount}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant={cleaner.efficiency >= 50 ? 'default' : cleaner.efficiency >= 30 ? 'secondary' : 'destructive'}>
                                            {cleaner.efficiency >= 50 ? (
                                                <TrendingUp className="w-3 h-3 mr-1" />
                                            ) : (
                                                <TrendingDown className="w-3 h-3 mr-1" />
                                            )}
                                            {cleaner.efficiency.toFixed(0)}%
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}