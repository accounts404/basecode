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
    Package
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

        return clients.map(client => {
            // Servicios del cliente en el período
            const clientSchedules = schedules.filter(s =>
                s.client_id === client.id &&
                s.start_time &&
                isWithinInterval(new Date(s.start_time), { start: monthStart, end: monthEnd })
            );

            const completedSchedules = clientSchedules.filter(s => s.status === 'completed');

            // Ingresos
            let totalRevenue = 0;
            completedSchedules.forEach(schedule => {
                // Precio base
                if (schedule.billed_price_snapshot) {
                    totalRevenue += schedule.billed_price_snapshot;
                }

                // Servicios adicionales
                if (schedule.reconciliation_items) {
                    schedule.reconciliation_items.forEach(item => {
                        if (item.type !== 'discount') {
                            totalRevenue += item.amount || 0;
                        } else {
                            totalRevenue -= Math.abs(item.amount || 0);
                        }
                    });
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

            return {
                client,
                totalServices: completedSchedules.length,
                totalRevenue: Math.round(totalRevenue * 100) / 100,
                totalCost: Math.round(totalCost * 100) / 100,
                profit: Math.round(profit * 100) / 100,
                profitMargin: Math.round(profitMargin * 10) / 10,
                avgRevenuePerService: completedSchedules.length > 0 
                    ? Math.round((totalRevenue / completedSchedules.length) * 100) / 100 
                    : 0
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