import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, DollarSign, TrendingUp, Users } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { extractDateOnly, isWithinRange } from '@/components/utils/priceCalculations';

export default function ExtraServicesTab({ 
    clients, 
    allSchedules, 
    trainingClientId 
}) {
    const [selectedMonth, setSelectedMonth] = useState('all');

    const availableMonths = useMemo(() => {
        const months = new Set();
        allSchedules.forEach(schedule => {
            if (schedule.start_time) {
                const month = format(new Date(schedule.start_time), 'yyyy-MM');
                months.add(month);
            }
        });
        return ['all', ...Array.from(months).sort().reverse()];
    }, [allSchedules]);

    const extraServicesData = useMemo(() => {
        let filteredSchedules = allSchedules;

        if (selectedMonth !== 'all') {
            const startDate = startOfMonth(new Date(selectedMonth + '-01'));
            const endDate = endOfMonth(startDate);
            
            filteredSchedules = allSchedules.filter(s => {
                const scheduleDate = extractDateOnly(s.start_time);
                return scheduleDate && isWithinRange(scheduleDate, format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd'));
            });
        }

        // Mapeo de tipos de servicios extras
        const serviceTypeMap = {
            windows_cleaning: 'Limpieza de Ventanas',
            steam_vacuum: 'Vapor/Aspirado',
            spring_cleaning: 'Limpieza de Primavera',
            vacancy_cleaning: 'Limpieza de Vacante',
            oven_cleaning: 'Limpieza de Horno',
            fridge_cleaning: 'Limpieza de Nevera',
            first_cleaning: 'Primera Limpieza',
            one_off_service: 'Servicio Único',
            other_extra: 'Otros Extras',
        };

        const extraStats = new Map();
        const clientExtraStats = new Map();

        filteredSchedules.forEach(schedule => {
            if (schedule.client_id === trainingClientId) return;
            if (!schedule.reconciliation_items || schedule.reconciliation_items.length === 0) return;

            const client = clients.find(c => c.id === schedule.client_id);
            if (!client) return;

            schedule.reconciliation_items.forEach(item => {
                if (item.type === 'base_service' || item.type === 'discount') return;

                const serviceName = serviceTypeMap[item.type] || item.type;

                if (!extraStats.has(serviceName)) {
                    extraStats.set(serviceName, {
                        serviceName,
                        count: 0,
                        totalRevenue: 0,
                        clients: new Set(),
                    });
                }

                const stats = extraStats.get(serviceName);
                stats.count += 1;
                stats.totalRevenue += item.amount || 0;
                stats.clients.add(schedule.client_id);

                // Estadísticas por cliente
                if (!clientExtraStats.has(schedule.client_id)) {
                    clientExtraStats.set(schedule.client_id, {
                        clientId: schedule.client_id,
                        clientName: client.name,
                        extraCount: 0,
                        extraRevenue: 0,
                        services: new Map(),
                    });
                }

                const clientStats = clientExtraStats.get(schedule.client_id);
                clientStats.extraCount += 1;
                clientStats.extraRevenue += item.amount || 0;
                
                if (!clientStats.services.has(serviceName)) {
                    clientStats.services.set(serviceName, 0);
                }
                clientStats.services.set(serviceName, clientStats.services.get(serviceName) + 1);
            });
        });

        const serviceArray = Array.from(extraStats.values())
            .map(s => ({
                ...s,
                clientCount: s.clients.size,
                avgRevenue: s.count > 0 ? s.totalRevenue / s.count : 0,
            }))
            .sort((a, b) => b.totalRevenue - a.totalRevenue);

        const clientArray = Array.from(clientExtraStats.values())
            .map(c => ({
                ...c,
                avgPerService: c.extraCount > 0 ? c.extraRevenue / c.extraCount : 0,
                topService: Array.from(c.services.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A',
            }))
            .sort((a, b) => b.extraRevenue - a.extraRevenue);

        return { serviceArray, clientArray };
    }, [allSchedules, clients, trainingClientId, selectedMonth]);

    const totalStats = useMemo(() => {
        return extraServicesData.serviceArray.reduce((acc, service) => ({
            totalRevenue: acc.totalRevenue + service.totalRevenue,
            totalCount: acc.totalCount + service.count,
        }), { totalRevenue: 0, totalCount: 0 });
    }, [extraServicesData]);

    const formatCurrency = (value) => `$${value.toFixed(2)}`;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Análisis de Servicios Extras</h2>
                    <p className="text-slate-600">Rentabilidad de servicios adicionales</p>
                </div>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-48">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos los meses</SelectItem>
                        {availableMonths.filter(m => m !== 'all').map(month => (
                            <SelectItem key={month} value={month}>
                                {format(new Date(month + '-01'), 'MMMM yyyy')}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            Ingresos por Extras
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                            {formatCurrency(totalStats.totalRevenue)}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            Total de Extras
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">
                            {totalStats.totalCount}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            Promedio por Extra
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-600">
                            {totalStats.totalCount > 0 
                                ? formatCurrency(totalStats.totalRevenue / totalStats.totalCount)
                                : '$0.00'
                            }
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabla por tipo de servicio */}
            <Card>
                <CardHeader>
                    <CardTitle>Rentabilidad por Tipo de Servicio</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Servicio</TableHead>
                                <TableHead className="text-right">Cantidad</TableHead>
                                <TableHead className="text-right">Ingresos Totales</TableHead>
                                <TableHead className="text-right">Promedio</TableHead>
                                <TableHead className="text-right">Clientes</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {extraServicesData.serviceArray.map((service, idx) => (
                                <TableRow key={idx}>
                                    <TableCell className="font-medium">{service.serviceName}</TableCell>
                                    <TableCell className="text-right">{service.count}</TableCell>
                                    <TableCell className="text-right text-green-600 font-medium">
                                        {formatCurrency(service.totalRevenue)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatCurrency(service.avgRevenue)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Badge variant="secondary">{service.clientCount}</Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Top clientes con más extras */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Top Clientes con Servicios Extras
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Cliente</TableHead>
                                <TableHead className="text-right">Extras Contratados</TableHead>
                                <TableHead className="text-right">Ingresos por Extras</TableHead>
                                <TableHead className="text-right">Promedio</TableHead>
                                <TableHead>Servicio Más Frecuente</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {extraServicesData.clientArray.slice(0, 15).map((client) => (
                                <TableRow key={client.clientId}>
                                    <TableCell className="font-medium">{client.clientName}</TableCell>
                                    <TableCell className="text-right">{client.extraCount}</TableCell>
                                    <TableCell className="text-right text-green-600 font-medium">
                                        {formatCurrency(client.extraRevenue)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatCurrency(client.avgPerService)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge>{client.topService}</Badge>
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