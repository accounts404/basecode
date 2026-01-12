import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, FileText, XCircle, CheckCircle, Clock, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function QuoteReports({ quotes }) {
    const today = new Date();
    const firstDayThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    const [startDate, setStartDate] = useState(firstDayThisMonth.toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
    const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
    
    const [compareStartDate, setCompareStartDate] = useState(firstDayLastMonth.toISOString().split('T')[0]);
    const [compareEndDate, setCompareEndDate] = useState(lastDayLastMonth.toISOString().split('T')[0]);

    const filteredQuotes = useMemo(() => {
        return quotes.filter(q => {
            const quoteDate = new Date(q.quote_date);
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59);
            
            const inDateRange = quoteDate >= start && quoteDate <= end;
            
            if (serviceTypeFilter === 'all') return inDateRange;
            
            if (serviceTypeFilter === 'initial') {
                return inDateRange && q.selected_services?.some(s => s.service_type === 'initial');
            }
            if (serviceTypeFilter === 'regular') {
                return inDateRange && q.selected_services?.some(s => s.service_type === 'regular');
            }
            if (serviceTypeFilter === 'extras') {
                return inDateRange && ((q.cost_steam_vacuum || 0) > 0 || (q.cost_oven || 0) > 0 || (q.cost_windows_cleaning || 0) > 0);
            }
            
            return inDateRange;
        });
    }, [quotes, startDate, endDate, serviceTypeFilter]);

    const compareQuotes = useMemo(() => {
        return quotes.filter(q => {
            const quoteDate = new Date(q.quote_date);
            const start = new Date(compareStartDate);
            const end = new Date(compareEndDate);
            end.setHours(23, 59, 59);
            return quoteDate >= start && quoteDate <= end;
        });
    }, [quotes, compareStartDate, compareEndDate]);

    const stats = useMemo(() => {
        const calculateStats = (quotesList) => {
            const total = quotesList.length;
            const sent = quotesList.filter(q => q.status === 'enviada').length;
            const approved = quotesList.filter(q => q.status === 'aprobado').length;
            const rejected = quotesList.filter(q => q.status === 'rechazado').length;
            
            let totalInitial = 0;
            let totalRegular = 0;
            let totalExtras = 0;
            
            quotesList.forEach(q => {
                const initialServices = q.selected_services?.filter(s => s.service_type === 'initial') || [];
                const regularServices = q.selected_services?.filter(s => s.service_type === 'regular') || [];
                
                totalInitial += initialServices.reduce((sum, s) => sum + (s.price_min + s.price_max) / 2, 0);
                totalRegular += regularServices.reduce((sum, s) => sum + (s.price_min + s.price_max) / 2, 0);
                totalExtras += (q.cost_steam_vacuum || 0) + (q.cost_oven || 0) + (q.cost_windows_cleaning || 0);
            });
            
            const conversionRate = sent > 0 ? (approved / sent * 100) : 0;
            
            return {
                total,
                sent,
                approved,
                rejected,
                totalInitial,
                totalRegular,
                totalExtras,
                conversionRate
            };
        };
        
        return {
            current: calculateStats(filteredQuotes),
            previous: calculateStats(compareQuotes)
        };
    }, [filteredQuotes, compareQuotes]);

    const rejectionData = useMemo(() => {
        const rejections = filteredQuotes.filter(q => q.status === 'rechazado');
        const byType = {};
        
        rejections.forEach(q => {
            const type = q.rejection_type || 'otro';
            byType[type] = (byType[type] || 0) + 1;
        });
        
        return Object.entries(byType).map(([name, value]) => ({
            name: name === 'precio_alto' ? 'Precio Alto' : 
                  name === 'contrató_competencia' ? 'Competencia' :
                  name === 'no_interesado' ? 'No Interesado' : 'Otro',
            value
        }));
    }, [filteredQuotes]);

    const evolutionData = useMemo(() => {
        const dataByDate = {};
        
        filteredQuotes.forEach(q => {
            const date = q.quote_date;
            if (!dataByDate[date]) {
                dataByDate[date] = { date, enviadas: 0, aprobadas: 0, rechazadas: 0 };
            }
            
            if (q.status === 'enviada') dataByDate[date].enviadas++;
            if (q.status === 'aprobado') dataByDate[date].aprobadas++;
            if (q.status === 'rechazado') dataByDate[date].rechazadas++;
        });
        
        return Object.values(dataByDate).sort((a, b) => a.date.localeCompare(b.date));
    }, [filteredQuotes]);

    const statusData = useMemo(() => {
        const statusCount = {
            borrador: 0,
            itemizando: 0,
            enviada: 0,
            aprobado: 0,
            rechazado: 0
        };
        
        filteredQuotes.forEach(q => {
            statusCount[q.status] = (statusCount[q.status] || 0) + 1;
        });
        
        return [
            { name: 'Borrador', value: statusCount.borrador },
            { name: 'Itemizando', value: statusCount.itemizando },
            { name: 'Enviada', value: statusCount.enviada },
            { name: 'Aprobado', value: statusCount.aprobado },
            { name: 'Rechazado', value: statusCount.rechazado }
        ].filter(d => d.value > 0);
    }, [filteredQuotes]);

    const handleExport = () => {
        const csvContent = [
            ['Fecha', 'Cliente', 'Estado', 'Inicial', 'Regular', 'Extras', 'Total'].join(','),
            ...filteredQuotes.map(q => {
                const initial = q.selected_services?.filter(s => s.service_type === 'initial').reduce((sum, s) => sum + (s.price_min + s.price_max) / 2, 0) || 0;
                const regular = q.selected_services?.filter(s => s.service_type === 'regular').reduce((sum, s) => sum + (s.price_min + s.price_max) / 2, 0) || 0;
                const extras = (q.cost_steam_vacuum || 0) + (q.cost_oven || 0) + (q.cost_windows_cleaning || 0);
                const total = initial + regular + extras;
                
                return [
                    q.quote_date,
                    q.client_name,
                    q.status,
                    initial.toFixed(2),
                    regular.toFixed(2),
                    extras.toFixed(2),
                    total.toFixed(2)
                ].join(',');
            })
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-cotizaciones-${startDate}-${endDate}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const KPICard = ({ title, value, previousValue, icon: Icon, color, prefix = '', suffix = '' }) => {
        const diff = previousValue ? ((value - previousValue) / previousValue * 100) : 0;
        const isPositive = diff >= 0;
        
        return (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle>
                    <Icon className={`w-4 h-4 ${color}`} />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{prefix}{typeof value === 'number' ? value.toFixed(value >= 100 ? 0 : 1) : value}{suffix}</div>
                    {previousValue !== undefined && (
                        <div className="flex items-center gap-1 mt-1">
                            {isPositive ? <TrendingUp className="w-4 h-4 text-green-600" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
                            <span className={`text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                {diff >= 0 ? '+' : ''}{diff.toFixed(1)}% vs período anterior
                            </span>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold">Reportes de Cotizaciones</h2>
                    <p className="text-gray-600">Análisis y métricas de gestión</p>
                </div>
                <Button onClick={handleExport} variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Exportar CSV
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Filtros</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                            <Label>Desde</Label>
                            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Hasta</Label>
                            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Tipo de Servicio</Label>
                            <Select value={serviceTypeFilter} onValueChange={setServiceTypeFilter}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos</SelectItem>
                                    <SelectItem value="initial">Iniciales</SelectItem>
                                    <SelectItem value="regular">Regulares</SelectItem>
                                    <SelectItem value="extras">Extras</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs text-gray-500">Periodo de Comparación</Label>
                            <div className="flex gap-2">
                                <Input type="date" value={compareStartDate} onChange={e => setCompareStartDate(e.target.value)} className="text-xs" />
                                <Input type="date" value={compareEndDate} onChange={e => setCompareEndDate(e.target.value)} className="text-xs" />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="Total Cotizaciones"
                    value={stats.current.total}
                    previousValue={stats.previous.total}
                    icon={FileText}
                    color="text-blue-600"
                />
                <KPICard
                    title="Tasa de Conversión"
                    value={stats.current.conversionRate}
                    previousValue={stats.previous.conversionRate}
                    icon={TrendingUp}
                    color="text-green-600"
                    suffix="%"
                />
                <KPICard
                    title="Aprobadas"
                    value={stats.current.approved}
                    previousValue={stats.previous.approved}
                    icon={CheckCircle}
                    color="text-green-600"
                />
                <KPICard
                    title="Rechazadas"
                    value={stats.current.rejected}
                    previousValue={stats.previous.rejected}
                    icon={XCircle}
                    color="text-red-600"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KPICard
                    title="Valor Servicios Iniciales"
                    value={stats.current.totalInitial}
                    previousValue={stats.previous.totalInitial}
                    icon={DollarSign}
                    color="text-orange-600"
                    prefix="$"
                />
                <KPICard
                    title="Valor Servicios Regulares"
                    value={stats.current.totalRegular}
                    previousValue={stats.previous.totalRegular}
                    icon={DollarSign}
                    color="text-blue-600"
                    prefix="$"
                />
                <KPICard
                    title="Valor Servicios Extras"
                    value={stats.current.totalExtras}
                    previousValue={stats.previous.totalExtras}
                    icon={DollarSign}
                    color="text-purple-600"
                    prefix="$"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Distribución por Estado</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Motivos de Rechazo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={rejectionData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="value" fill="#ef4444" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Evolución de Cotizaciones</CardTitle>
                    <CardDescription>Tendencia por fecha</CardDescription>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={evolutionData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="enviadas" stroke="#3b82f6" name="Enviadas" />
                            <Line type="monotone" dataKey="aprobadas" stroke="#10b981" name="Aprobadas" />
                            <Line type="monotone" dataKey="rechazadas" stroke="#ef4444" name="Rechazadas" />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Detalle de Cotizaciones</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Iniciales</TableHead>
                                    <TableHead className="text-right">Regulares</TableHead>
                                    <TableHead className="text-right">Extras</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredQuotes.map(q => {
                                    const initial = q.selected_services?.filter(s => s.service_type === 'initial').reduce((sum, s) => sum + (s.price_min + s.price_max) / 2, 0) || 0;
                                    const regular = q.selected_services?.filter(s => s.service_type === 'regular').reduce((sum, s) => sum + (s.price_min + s.price_max) / 2, 0) || 0;
                                    const extras = (q.cost_steam_vacuum || 0) + (q.cost_oven || 0) + (q.cost_windows_cleaning || 0);
                                    const total = initial + regular + extras;
                                    
                                    return (
                                        <TableRow key={q.id}>
                                            <TableCell>{q.quote_date}</TableCell>
                                            <TableCell>{q.client_name}</TableCell>
                                            <TableCell>
                                                <Badge variant={
                                                    q.status === 'aprobado' ? 'default' :
                                                    q.status === 'rechazado' ? 'destructive' : 'secondary'
                                                }>
                                                    {q.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">${initial.toFixed(2)}</TableCell>
                                            <TableCell className="text-right">${regular.toFixed(2)}</TableCell>
                                            <TableCell className="text-right">${extras.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-bold">${total.toFixed(2)}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}