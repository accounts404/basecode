import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
    DollarSign, 
    TrendingUp, 
    TrendingDown,
    Users,
    Calendar,
    Package,
    AlertTriangle,
    Award,
    ThumbsDown,
    Zap
} from "lucide-react";
import { format, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";

export default function ClientProfitabilityReport({ clients, schedules, workEntries }) {
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [filterType, setFilterType] = useState('all');

    // Generar opciones de meses
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

    // Calcular rentabilidad por cliente
    const clientProfitability = useMemo(() => {
        const [year, month] = selectedMonth.split('-');
        const monthStart = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
        const monthEnd = endOfMonth(new Date(parseInt(year), parseInt(month) - 1));

        // Función auxiliar para comparar solo fecha (YYYY-MM-DD)
        const extractDate = (isoString) => {
            if (!isoString) return null;
            return isoString.substring(0, 10);
        };

        const isDateInRange = (dateString, rangeStart, rangeEnd) => {
            if (!dateString) return false;
            const date = extractDate(dateString);
            const startDate = format(rangeStart, 'yyyy-MM-dd');
            const endDate = format(rangeEnd, 'yyyy-MM-dd');
            return date >= startDate && date <= endDate;
        };

        return clients.map(client => {
            // Servicios del cliente en el período (solo comparando fechas)
            const clientSchedules = schedules.filter(s =>
                s.client_id === client.id &&
                s.start_time &&
                isDateInRange(s.start_time, monthStart, monthEnd)
            );

            const completedSchedules = clientSchedules.filter(s => s.status === 'completed');

            // Ingresos
            let totalRevenue = 0;
            completedSchedules.forEach(schedule => {
                if (schedule.reconciliation_items && schedule.reconciliation_items.length > 0) {
                    // Si hay reconciliation_items, usar esos (ya incluye el base_service)
                    schedule.reconciliation_items.forEach(item => {
                        if (item.type === 'discount') {
                            totalRevenue -= Math.abs(item.amount || 0);
                        } else {
                            totalRevenue += item.amount || 0;
                        }
                    });
                } else if (schedule.billed_price_snapshot) {
                    // Si no hay reconciliation_items, usar el precio snapshot
                    totalRevenue += schedule.billed_price_snapshot;
                }
            });

            // Costos (horas trabajadas * tarifas)
            let totalCost = 0;
            completedSchedules.forEach(schedule => {
                const scheduleWorkEntries = workEntries.filter(we => we.schedule_id === schedule.id);
                scheduleWorkEntries.forEach(we => {
                    totalCost += we.total_amount || 0;
                });
            });

            // Rentabilidad
            const profit = totalRevenue - totalCost;
            const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

            // Calcular horas trabajadas totales para este cliente EN EL PERÍODO
            const clientWorkEntries = workEntries.filter(we => 
                we.client_id === client.id &&
                we.work_date &&
                isDateInRange(we.work_date, monthStart, monthEnd)
            );
            const totalHoursWorked = clientWorkEntries.reduce((sum, we) => sum + (we.hours || 0), 0);
            const revenuePerHour = totalHoursWorked > 0 ? totalRevenue / totalHoursWorked : 0;

            // Desglose de servicios adicionales
            const additionalServices = {
                windows: 0,
                steam_vacuum: 0,
                spring_cleaning: 0,
                oven_cleaning: 0,
                fridge_cleaning: 0,
                other: 0
            };

            completedSchedules.forEach(schedule => {
                if (schedule.reconciliation_items) {
                    schedule.reconciliation_items.forEach(item => {
                        if (item.type === 'windows_cleaning') additionalServices.windows += item.amount || 0;
                        else if (item.type === 'steam_vacuum') additionalServices.steam_vacuum += item.amount || 0;
                        else if (item.type === 'spring_cleaning') additionalServices.spring_cleaning += item.amount || 0;
                        else if (item.type === 'oven_cleaning') additionalServices.oven_cleaning += item.amount || 0;
                        else if (item.type === 'fridge_cleaning') additionalServices.fridge_cleaning += item.amount || 0;
                        else if (item.type === 'other_extra') additionalServices.other += item.amount || 0;
                    });
                }
            });

            const totalAdditionalRevenue = Object.values(additionalServices).reduce((sum, v) => sum + v, 0);

            return {
                client,
                totalServices: completedSchedules.length,
                totalRevenue: Math.round(totalRevenue * 100) / 100,
                totalCost: Math.round(totalCost * 100) / 100,
                profit: Math.round(profit * 100) / 100,
                profitMargin: Math.round(profitMargin * 10) / 10,
                avgRevenuePerService: completedSchedules.length > 0 
                    ? Math.round((totalRevenue / completedSchedules.length) * 100) / 100 
                    : 0,
                totalHoursWorked: Math.round(totalHoursWorked * 10) / 10,
                revenuePerHour: Math.round(revenuePerHour * 100) / 100,
                additionalServices,
                totalAdditionalRevenue: Math.round(totalAdditionalRevenue * 100) / 100
            };
        }).filter(c => c.client.active !== false && c.totalServices > 0);
    }, [clients, schedules, workEntries, selectedMonth]);

    // Filtrar por tipo
    const filteredData = useMemo(() => {
        if (filterType === 'all') return clientProfitability;
        return clientProfitability.filter(c => c.client.client_type === filterType);
    }, [clientProfitability, filterType]);

    // Ordenar por rentabilidad
    const sortedData = useMemo(() => {
        return [...filteredData].sort((a, b) => b.profit - a.profit);
    }, [filteredData]);

    // Estadísticas generales
    const stats = useMemo(() => {
        const totalRevenue = sortedData.reduce((sum, c) => sum + c.totalRevenue, 0);
        const totalCost = sortedData.reduce((sum, c) => sum + c.totalCost, 0);
        const totalProfit = totalRevenue - totalCost;
        const avgMargin = sortedData.length > 0
            ? sortedData.reduce((sum, c) => sum + c.profitMargin, 0) / sortedData.length
            : 0;

        return {
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalCost: Math.round(totalCost * 100) / 100,
            totalProfit: Math.round(totalProfit * 100) / 100,
            avgMargin: Math.round(avgMargin * 10) / 10,
            totalClients: sortedData.length,
            totalServices: sortedData.reduce((sum, c) => sum + c.totalServices, 0)
        };
    }, [sortedData]);

    // Análisis por tipo de cliente
    const typeAnalysis = useMemo(() => {
        const types = ['domestic', 'commercial', 'training'];
        return types.map(type => {
            const typeData = clientProfitability.filter(c => c.client.client_type === type);
            const revenue = typeData.reduce((sum, c) => sum + c.totalRevenue, 0);
            const profit = typeData.reduce((sum, c) => sum + c.profit, 0);
            const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

            return {
                type,
                label: type === 'domestic' ? 'Doméstico' : type === 'commercial' ? 'Comercial' : 'Entrenamiento',
                clients: typeData.length,
                revenue: Math.round(revenue * 100) / 100,
                profit: Math.round(profit * 100) / 100,
                margin: Math.round(margin * 10) / 10
            };
        }).filter(t => t.clients > 0);
    }, [clientProfitability]);

    // Análisis por frecuencia de servicio
    const frequencyAnalysis = useMemo(() => {
        const frequencies = ['weekly', 'fortnightly', 'every_3_weeks', 'monthly', 'one_off'];
        return frequencies.map(freq => {
            const freqData = clientProfitability.filter(c => c.client.service_frequency === freq);
            const revenue = freqData.reduce((sum, c) => sum + c.totalRevenue, 0);
            const profit = freqData.reduce((sum, c) => sum + c.profit, 0);
            const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

            return {
                frequency: freq,
                label: freq === 'weekly' ? 'Semanal' : 
                       freq === 'fortnightly' ? 'Quincenal' : 
                       freq === 'every_3_weeks' ? 'Cada 3 Semanas' :
                       freq === 'monthly' ? 'Mensual' : 'One-Off',
                clients: freqData.length,
                revenue: Math.round(revenue * 100) / 100,
                profit: Math.round(profit * 100) / 100,
                margin: Math.round(margin * 10) / 10
            };
        }).filter(f => f.clients > 0);
    }, [clientProfitability]);

    // Top 10 mejores y peores clientes
    const topClients = useMemo(() => {
        const sorted = [...clientProfitability].sort((a, b) => b.profit - a.profit);
        return {
            best: sorted.slice(0, 10),
            worst: sorted.slice(-10).reverse()
        };
    }, [clientProfitability]);

    // Clientes en riesgo (margen bajo o negativo)
    const riskClients = useMemo(() => {
        return clientProfitability.filter(c => c.profitMargin < 25)
            .sort((a, b) => a.profitMargin - b.profitMargin);
    }, [clientProfitability]);

    // Desglose de servicios adicionales
    const additionalServicesAnalysis = useMemo(() => {
        const totals = {
            windows: 0,
            steam_vacuum: 0,
            spring_cleaning: 0,
            oven_cleaning: 0,
            fridge_cleaning: 0,
            other: 0
        };

        clientProfitability.forEach(c => {
            Object.keys(totals).forEach(key => {
                totals[key] += c.additionalServices[key] || 0;
            });
        });

        return [
            { type: 'windows', label: 'Limpieza de Ventanas', revenue: Math.round(totals.windows * 100) / 100 },
            { type: 'steam_vacuum', label: 'Vapor/Aspirado', revenue: Math.round(totals.steam_vacuum * 100) / 100 },
            { type: 'spring_cleaning', label: 'Limpieza Profunda', revenue: Math.round(totals.spring_cleaning * 100) / 100 },
            { type: 'oven_cleaning', label: 'Limpieza de Horno', revenue: Math.round(totals.oven_cleaning * 100) / 100 },
            { type: 'fridge_cleaning', label: 'Limpieza de Nevera', revenue: Math.round(totals.fridge_cleaning * 100) / 100 },
            { type: 'other', label: 'Otros Extras', revenue: Math.round(totals.other * 100) / 100 }
        ].filter(s => s.revenue > 0).sort((a, b) => b.revenue - a.revenue);
    }, [clientProfitability]);

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
                    <span className="text-sm font-medium text-slate-700">Tipo:</span>
                    <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger className="w-48">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="domestic">Doméstico</SelectItem>
                            <SelectItem value="commercial">Comercial</SelectItem>
                            <SelectItem value="training">Entrenamiento</SelectItem>
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
                                <p className="text-sm text-slate-500">Ingresos Totales</p>
                                <p className="text-2xl font-bold text-slate-900">${stats.totalRevenue}</p>
                            </div>
                            <DollarSign className="w-8 h-8 text-green-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Ganancia Total</p>
                                <p className="text-2xl font-bold text-slate-900">${stats.totalProfit}</p>
                            </div>
                            <TrendingUp className="w-8 h-8 text-blue-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Margen Promedio</p>
                                <p className="text-2xl font-bold text-slate-900">{stats.avgMargin}%</p>
                            </div>
                            <Package className="w-8 h-8 text-purple-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Clientes Activos</p>
                                <p className="text-2xl font-bold text-slate-900">{stats.totalClients}</p>
                            </div>
                            <Users className="w-8 h-8 text-orange-600" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Análisis por Tipo */}
            <Card>
                <CardHeader>
                    <CardTitle>Análisis por Tipo de Cliente</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {typeAnalysis.map(type => (
                            <div key={type.type} className="p-4 border rounded-lg bg-slate-50">
                                <h4 className="font-semibold text-slate-900 mb-3">{type.label}</h4>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Clientes:</span>
                                        <span className="font-medium">{type.clients}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Ingresos:</span>
                                        <span className="font-medium text-green-700">${type.revenue}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Ganancia:</span>
                                        <span className="font-medium text-blue-700">${type.profit}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Margen:</span>
                                        <Badge 
                                            className={
                                                type.margin >= 40 ? "bg-green-100 text-green-800" :
                                                type.margin >= 25 ? "bg-yellow-100 text-yellow-800" :
                                                "bg-red-100 text-red-800"
                                            }
                                        >
                                            {type.margin}%
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Análisis por Frecuencia de Servicio */}
            <Card>
                <CardHeader>
                    <CardTitle>Análisis por Frecuencia de Servicio</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {frequencyAnalysis.map(freq => (
                            <div key={freq.frequency} className="p-4 border rounded-lg bg-blue-50">
                                <h4 className="font-semibold text-slate-900 mb-3">{freq.label}</h4>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Clientes:</span>
                                        <span className="font-medium">{freq.clients}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Ingresos:</span>
                                        <span className="font-medium text-green-700">${freq.revenue}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Ganancia:</span>
                                        <span className="font-medium text-blue-700">${freq.profit}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Margen:</span>
                                        <Badge 
                                            className={
                                                freq.margin >= 40 ? "bg-green-100 text-green-800" :
                                                freq.margin >= 25 ? "bg-yellow-100 text-yellow-800" :
                                                "bg-red-100 text-red-800"
                                            }
                                        >
                                            {freq.margin}%
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Top 10 Mejores y Peores Clientes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-2 border-green-200">
                    <CardHeader className="bg-green-50">
                        <CardTitle className="flex items-center gap-2 text-green-900">
                            <Award className="w-5 h-5" />
                            Top 10 Clientes Más Rentables
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="space-y-2">
                            {topClients.best.map((item, index) => (
                                <div key={item.client.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <Badge className="bg-green-600 text-white w-8 h-8 flex items-center justify-center rounded-full">
                                            {index + 1}
                                        </Badge>
                                        <div>
                                            <p className="font-medium text-slate-900">{item.client.name}</p>
                                            <p className="text-xs text-slate-500">
                                                {item.totalServices} servicios • {item.profitMargin}% margen
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-green-700">${item.profit}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-2 border-red-200">
                    <CardHeader className="bg-red-50">
                        <CardTitle className="flex items-center gap-2 text-red-900">
                            <ThumbsDown className="w-5 h-5" />
                            Top 10 Clientes Menos Rentables
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="space-y-2">
                            {topClients.worst.map((item, index) => (
                                <div key={item.client.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <Badge className="bg-red-600 text-white w-8 h-8 flex items-center justify-center rounded-full">
                                            {index + 1}
                                        </Badge>
                                        <div>
                                            <p className="font-medium text-slate-900">{item.client.name}</p>
                                            <p className="text-xs text-slate-500">
                                                {item.totalServices} servicios • {item.profitMargin}% margen
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-bold ${item.profit >= 0 ? 'text-slate-600' : 'text-red-700'}`}>
                                            ${item.profit}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Desglose de Servicios Adicionales */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-yellow-600" />
                        Ingresos por Servicios Adicionales
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {additionalServicesAnalysis.map(service => (
                            <div key={service.type} className="p-4 border rounded-lg bg-yellow-50">
                                <p className="text-sm font-medium text-slate-700 mb-1">{service.label}</p>
                                <p className="text-2xl font-bold text-yellow-700">${service.revenue}</p>
                            </div>
                        ))}
                    </div>
                    {additionalServicesAnalysis.length === 0 && (
                        <p className="text-center text-slate-500 py-6">
                            No hay ingresos por servicios adicionales en este período
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Clientes en Riesgo */}
            {riskClients.length > 0 && (
                <Card className="border-2 border-orange-300">
                    <CardHeader className="bg-orange-50">
                        <CardTitle className="flex items-center gap-2 text-orange-900">
                            <AlertTriangle className="w-5 h-5" />
                            Clientes en Riesgo ({riskClients.length})
                        </CardTitle>
                        <p className="text-sm text-orange-700 mt-2">
                            Clientes con margen de ganancia menor al 25% que requieren revisión de precios
                        </p>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="space-y-2">
                            {riskClients.slice(0, 15).map(item => (
                                <div key={item.client.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200">
                                    <div className="flex-1">
                                        <p className="font-medium text-slate-900">{item.client.name}</p>
                                        <p className="text-xs text-slate-600">
                                            {item.client.service_frequency === 'weekly' ? 'Semanal' :
                                             item.client.service_frequency === 'fortnightly' ? 'Quincenal' :
                                             item.client.service_frequency === 'monthly' ? 'Mensual' : 'One-off'}
                                            {' • '}
                                            Precio actual: ${item.client.current_service_price}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <Badge 
                                            className={
                                                item.profitMargin < 0 ? "bg-red-600 text-white" :
                                                item.profitMargin < 15 ? "bg-orange-600 text-white" :
                                                "bg-yellow-600 text-white"
                                            }
                                        >
                                            {item.profitMargin}%
                                        </Badge>
                                        <p className="text-sm font-medium text-slate-600 mt-1">
                                            ${item.profit}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Tabla de Clientes */}
            <Card>
                <CardHeader>
                    <CardTitle>Rentabilidad por Cliente</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left p-3 text-sm font-semibold text-slate-700">Cliente</th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">Tipo</th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">Frecuencia</th>
                                    <th className="text-right p-3 text-sm font-semibold text-slate-700">Servicios</th>
                                    <th className="text-right p-3 text-sm font-semibold text-slate-700">Ingresos</th>
                                    <th className="text-right p-3 text-sm font-semibold text-slate-700">Costos</th>
                                    <th className="text-right p-3 text-sm font-semibold text-slate-700">Ganancia</th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">Margen</th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">$/Hora</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedData.map(item => (
                                    <tr key={item.client.id} className="border-b hover:bg-slate-50">
                                        <td className="p-3">
                                            <div>
                                                <p className="font-medium">{item.client.name}</p>
                                                <p className="text-xs text-slate-500">{item.client.address}</p>
                                            </div>
                                        </td>
                                        <td className="p-3 text-center">
                                            <Badge variant="outline" className="text-xs">
                                                {item.client.client_type === 'domestic' ? 'Dom' : 
                                                 item.client.client_type === 'commercial' ? 'Com' : 'Train'}
                                            </Badge>
                                        </td>
                                        <td className="p-3 text-center">
                                            <Badge variant="secondary" className="text-xs">
                                                {item.client.service_frequency === 'weekly' ? 'Sem' :
                                                 item.client.service_frequency === 'fortnightly' ? '2 Sem' :
                                                 item.client.service_frequency === 'monthly' ? 'Mens' : 'One-off'}
                                            </Badge>
                                        </td>
                                        <td className="p-3 text-right font-medium">{item.totalServices}</td>
                                        <td className="p-3 text-right font-medium text-green-700">${item.totalRevenue}</td>
                                        <td className="p-3 text-right font-medium text-red-700">${item.totalCost}</td>
                                        <td className="p-3 text-right">
                                            <span className={`font-bold ${item.profit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                                                ${item.profit}
                                            </span>
                                        </td>
                                        <td className="p-3 text-center">
                                            <Badge 
                                                className={
                                                    item.profitMargin >= 40 ? "bg-green-100 text-green-800" :
                                                    item.profitMargin >= 25 ? "bg-yellow-100 text-yellow-800" :
                                                    "bg-red-100 text-red-800"
                                                }
                                            >
                                                {item.profitMargin}%
                                            </Badge>
                                        </td>
                                        <td className="p-3 text-center">
                                            <Badge variant="outline" className="font-mono">
                                                ${item.revenuePerHour}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {sortedData.length === 0 && (
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