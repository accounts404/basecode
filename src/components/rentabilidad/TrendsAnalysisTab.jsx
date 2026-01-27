import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Activity, DollarSign } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { getPriceForSchedule } from '@/components/utils/priceCalculations';

export default function TrendsAnalysisTab({ 
    clients, 
    allWorkEntries, 
    allSchedules, 
    trainingClientId 
}) {
    const monthlyData = useMemo(() => {
        const monthMap = new Map();

        // Agrupar schedules por mes
        allSchedules.forEach(schedule => {
            if (schedule.client_id === trainingClientId) return;
            if (!schedule.start_time) return;

            const client = clients.find(c => c.id === schedule.client_id);
            if (!client) return;

            const month = format(new Date(schedule.start_time), 'yyyy-MM');
            
            if (!monthMap.has(month)) {
                monthMap.set(month, {
                    month,
                    revenue: 0,
                    laborCost: 0,
                    serviceCount: 0,
                    clientCount: new Set(),
                });
            }

            const data = monthMap.get(month);
            const priceResult = getPriceForSchedule(schedule, client);
            const price = priceResult.rawAmount || 0;
            data.revenue += price;
            data.serviceCount += 1;
            data.clientCount.add(schedule.client_id);
        });

        // Agregar costos laborales
        allWorkEntries.forEach(entry => {
            if (!entry.work_date) return;
            const month = format(new Date(entry.work_date), 'yyyy-MM');
            
            if (!monthMap.has(month)) {
                monthMap.set(month, {
                    month,
                    revenue: 0,
                    laborCost: 0,
                    serviceCount: 0,
                    clientCount: new Set(),
                });
            }

            const data = monthMap.get(month);
            data.laborCost += entry.total_amount || 0;
        });

        // Convertir a array y calcular métricas
        const monthArray = Array.from(monthMap.values())
            .sort((a, b) => a.month.localeCompare(b.month))
            .map(data => ({
                month: format(new Date(data.month + '-01'), 'MMM yyyy'),
                monthKey: data.month,
                revenue: data.revenue,
                laborCost: data.laborCost,
                margin: data.revenue - data.laborCost,
                marginPercent: data.revenue > 0 ? ((data.revenue - data.laborCost) / data.revenue) * 100 : 0,
                serviceCount: data.serviceCount,
                clientCount: data.clientCount.size,
                avgRevenuePerService: data.serviceCount > 0 ? data.revenue / data.serviceCount : 0,
            }));

        return monthArray;
    }, [allSchedules, allWorkEntries, clients, trainingClientId]);

    // Calcular crecimiento MoM y YoY
    const growthMetrics = useMemo(() => {
        if (monthlyData.length < 2) return null;

        const currentMonth = monthlyData[monthlyData.length - 1];
        const previousMonth = monthlyData[monthlyData.length - 2];
        
        const momGrowth = previousMonth.revenue > 0 
            ? ((currentMonth.revenue - previousMonth.revenue) / previousMonth.revenue) * 100 
            : 0;

        // Buscar mismo mes año anterior
        const currentMonthKey = currentMonth.monthKey;
        const [year, month] = currentMonthKey.split('-');
        const lastYearKey = `${parseInt(year) - 1}-${month}`;
        const lastYearData = monthlyData.find(d => d.monthKey === lastYearKey);
        
        const yoyGrowth = lastYearData && lastYearData.revenue > 0
            ? ((currentMonth.revenue - lastYearData.revenue) / lastYearData.revenue) * 100
            : null;

        return {
            currentMonth,
            previousMonth,
            momGrowth,
            yoyGrowth,
            lastYearData,
        };
    }, [monthlyData]);

    const formatCurrency = (value) => `$${value.toFixed(0)}`;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Análisis de Tendencias</h2>
                <p className="text-slate-600">Evolución temporal del negocio</p>
            </div>

            {/* Métricas de crecimiento */}
            {growthMetrics && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                                <DollarSign className="w-4 h-4" />
                                Ingresos Actuales
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">
                                {formatCurrency(growthMetrics.currentMonth.revenue)}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                {growthMetrics.currentMonth.month}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" />
                                Crecimiento MoM
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${growthMetrics.momGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {growthMetrics.momGrowth >= 0 ? '+' : ''}{growthMetrics.momGrowth.toFixed(1)}%
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                vs {growthMetrics.previousMonth.month}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                                <Activity className="w-4 h-4" />
                                Crecimiento YoY
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {growthMetrics.yoyGrowth !== null ? (
                                <>
                                    <div className={`text-2xl font-bold ${growthMetrics.yoyGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {growthMetrics.yoyGrowth >= 0 ? '+' : ''}{growthMetrics.yoyGrowth.toFixed(1)}%
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        vs {growthMetrics.lastYearData.month}
                                    </div>
                                </>
                            ) : (
                                <div className="text-sm text-slate-400">
                                    Sin datos del año anterior
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-slate-600">
                                Margen Actual
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-purple-600">
                                {growthMetrics.currentMonth.marginPercent.toFixed(1)}%
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                {formatCurrency(growthMetrics.currentMonth.margin)} margen
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Gráfico de ingresos y costos */}
            <Card>
                <CardHeader>
                    <CardTitle>Evolución de Ingresos y Costos</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={350}>
                        <LineChart data={monthlyData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip formatter={(value) => formatCurrency(value)} />
                            <Legend />
                            <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} name="Ingresos" />
                            <Line type="monotone" dataKey="laborCost" stroke="#f59e0b" strokeWidth={2} name="Costo Laboral" />
                            <Line type="monotone" dataKey="margin" stroke="#8b5cf6" strokeWidth={2} name="Margen" />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Gráfico de margen % */}
            <Card>
                <CardHeader>
                    <CardTitle>Evolución de Margen (%)</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={monthlyData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                            <Legend />
                            <Bar dataKey="marginPercent" fill="#8b5cf6" name="Margen %" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Gráfico de servicios y clientes */}
            <Card>
                <CardHeader>
                    <CardTitle>Servicios y Clientes Activos</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={monthlyData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis yAxisId="left" />
                            <YAxis yAxisId="right" orientation="right" />
                            <Tooltip />
                            <Legend />
                            <Line yAxisId="left" type="monotone" dataKey="serviceCount" stroke="#3b82f6" strokeWidth={2} name="Servicios" />
                            <Line yAxisId="right" type="monotone" dataKey="clientCount" stroke="#ef4444" strokeWidth={2} name="Clientes Activos" />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}