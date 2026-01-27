import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calendar, DollarSign, TrendingUp, Users, AlertCircle } from 'lucide-react';
import { format, addMonths, startOfMonth, endOfMonth, eachWeekOfInterval, eachMonthOfInterval, addWeeks } from 'date-fns';

export default function ProjectionsTab({ clients, trainingClientId }) {
    const projections = useMemo(() => {
        const today = new Date();
        const projectionMonths = 6;
        
        // Filtrar clientes activos con recurrencia (excluir training y one_off)
        const activeRecurringClients = clients.filter(c => 
            c.id !== trainingClientId && 
            c.active !== false && 
            c.service_frequency && 
            c.service_frequency !== 'one_off' &&
            c.current_service_price > 0
        );

        // Calcular proyección mensual
        const monthlyProjections = [];
        for (let i = 0; i < projectionMonths; i++) {
            const targetMonth = addMonths(startOfMonth(today), i);
            const monthStart = startOfMonth(targetMonth);
            const monthEnd = endOfMonth(targetMonth);

            let monthRevenue = 0;
            let monthServiceCount = 0;

            activeRecurringClients.forEach(client => {
                const price = client.current_service_price || 0;
                let servicesInMonth = 0;

                switch (client.service_frequency) {
                    case 'weekly':
                        servicesInMonth = eachWeekOfInterval({ start: monthStart, end: monthEnd }).length;
                        break;
                    case 'fortnightly':
                        servicesInMonth = Math.floor(eachWeekOfInterval({ start: monthStart, end: monthEnd }).length / 2);
                        break;
                    case 'every_3_weeks':
                        servicesInMonth = Math.floor(eachWeekOfInterval({ start: monthStart, end: monthEnd }).length / 3);
                        break;
                    case 'every_4_weeks':
                    case 'monthly':
                        servicesInMonth = 1;
                        break;
                    default:
                        servicesInMonth = 0;
                }

                monthRevenue += servicesInMonth * price;
                monthServiceCount += servicesInMonth;
            });

            monthlyProjections.push({
                month: format(targetMonth, 'MMM yyyy'),
                monthKey: format(targetMonth, 'yyyy-MM'),
                revenue: monthRevenue,
                serviceCount: monthServiceCount,
                clientCount: activeRecurringClients.length,
            });
        }

        // Agrupar por frecuencia
        const frequencyMap = new Map();
        activeRecurringClients.forEach(client => {
            const freq = client.service_frequency;
            if (!frequencyMap.has(freq)) {
                frequencyMap.set(freq, {
                    frequency: freq,
                    clientCount: 0,
                    monthlyRevenue: 0,
                });
            }

            const data = frequencyMap.get(freq);
            data.clientCount += 1;

            // Calcular ingreso mensual promedio
            let servicesPerMonth = 0;
            switch (freq) {
                case 'weekly':
                    servicesPerMonth = 4.33;
                    break;
                case 'fortnightly':
                    servicesPerMonth = 2.17;
                    break;
                case 'every_3_weeks':
                    servicesPerMonth = 1.44;
                    break;
                case 'every_4_weeks':
                case 'monthly':
                    servicesPerMonth = 1;
                    break;
                default:
                    servicesPerMonth = 0;
            }

            data.monthlyRevenue += (client.current_service_price || 0) * servicesPerMonth;
        });

        const frequencyArray = Array.from(frequencyMap.values())
            .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);

        return {
            monthlyProjections,
            frequencyArray,
            totalActiveClients: activeRecurringClients.length,
            totalMonthlyRevenue: frequencyArray.reduce((sum, f) => sum + f.monthlyRevenue, 0),
        };
    }, [clients, trainingClientId]);

    const formatCurrency = (value) => `$${value.toFixed(2)}`;

    const frequencyLabels = {
        weekly: 'Semanal',
        fortnightly: 'Quincenal',
        every_3_weeks: 'Cada 3 Semanas',
        every_4_weeks: 'Cada 4 Semanas',
        monthly: 'Mensual',
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Proyecciones de Ingresos</h2>
                <p className="text-slate-600">Basado en clientes activos con servicios recurrentes</p>
            </div>

            {/* Resumen de proyección */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            Ingreso Mensual Proyectado
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                            {formatCurrency(projections.totalMonthlyRevenue)}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                            Promedio por mes
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Clientes Activos Recurrentes
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">
                            {projections.totalActiveClients}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                            Con servicios programados
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            Proyección 6 Meses
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-600">
                            {formatCurrency(projections.totalMonthlyRevenue * 6)}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                            Total proyectado
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Alerta si hay clientes sin precio */}
            <Card className="border-amber-200 bg-amber-50">
                <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                        <div>
                            <p className="font-medium text-amber-900">Nota sobre las proyecciones</p>
                            <p className="text-sm text-amber-700 mt-1">
                                Las proyecciones se basan únicamente en clientes activos con servicios recurrentes y precios configurados. 
                                Clientes con service_frequency "one_off" o sin precio no están incluidos.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Gráfico de proyecciones mensuales */}
            <Card>
                <CardHeader>
                    <CardTitle>Proyección de Ingresos - Próximos 6 Meses</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={projections.monthlyProjections}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip formatter={(value) => formatCurrency(value)} />
                            <Legend />
                            <Bar dataKey="revenue" fill="#10b981" name="Ingresos Proyectados" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Tabla detallada de proyecciones */}
            <Card>
                <CardHeader>
                    <CardTitle>Detalle por Mes</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Mes</TableHead>
                                <TableHead className="text-right">Ingresos Proyectados</TableHead>
                                <TableHead className="text-right">Servicios Estimados</TableHead>
                                <TableHead className="text-right">Clientes Activos</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {projections.monthlyProjections.map((month, idx) => (
                                <TableRow key={idx}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-slate-400" />
                                            {month.month}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right text-green-600 font-medium">
                                        {formatCurrency(month.revenue)}
                                    </TableCell>
                                    <TableCell className="text-right">{month.serviceCount}</TableCell>
                                    <TableCell className="text-right">{month.clientCount}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Desglose por frecuencia */}
            <Card>
                <CardHeader>
                    <CardTitle>Ingresos Mensuales por Frecuencia de Servicio</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Frecuencia</TableHead>
                                <TableHead className="text-right">Clientes</TableHead>
                                <TableHead className="text-right">Ingreso Mensual Promedio</TableHead>
                                <TableHead className="text-right">% del Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {projections.frequencyArray.map((freq, idx) => (
                                <TableRow key={idx}>
                                    <TableCell className="font-medium">
                                        {frequencyLabels[freq.frequency] || freq.frequency}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Badge variant="secondary">{freq.clientCount}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right text-green-600 font-medium">
                                        {formatCurrency(freq.monthlyRevenue)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {projections.totalMonthlyRevenue > 0 
                                            ? `${((freq.monthlyRevenue / projections.totalMonthlyRevenue) * 100).toFixed(1)}%`
                                            : '0%'
                                        }
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