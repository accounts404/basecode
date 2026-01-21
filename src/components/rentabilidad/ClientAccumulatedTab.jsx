import React, { useState, useMemo } from 'react';
import { format, addMonths, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, Briefcase, Calendar, Send, CheckCircle, X, History, Eye, EyeOff } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';
import { Client } from '@/entities/Client';
import { User } from '@/entities/User';
import { extractDateOnly, isDateInRange } from '@/components/utils/priceCalculations';
import { calculateProfitabilityForPeriod } from '@/components/utils/profitabilityCalculations';

const TotalsCard = ({ summary, title }) => {
    const isGrossProfitable = summary.totalMargin > 0;
    const isRealProfitable = summary.totalRealMargin > 0;
    
    const distributedFixedCostsForSummary = Math.abs(summary.totalMargin - summary.totalRealMargin);

    return (
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 mb-6 shadow-2xl">
            <h3 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                {title}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                    <p className="text-slate-300 text-xs mb-1">Total Horas</p>
                    <p className="text-white text-2xl font-bold">{summary.totalHours.toFixed(2)}h</p>
                </div>

                <div className="bg-emerald-500/20 backdrop-blur-sm rounded-lg p-4 border border-emerald-500/30">
                    <p className="text-emerald-200 text-xs mb-1">Ingresos Totales</p>
                    <p className="text-emerald-100 text-2xl font-bold">${summary.totalIncome.toFixed(2)}</p>
                    <div className="mt-2 pt-2 border-t border-emerald-500/30 space-y-1">
                        <div className="flex justify-between items-center">
                            <span className="text-emerald-300 text-xs">💵 Cash:</span>
                            <span className="text-emerald-100 text-sm font-semibold">${(summary.cashIncome || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-emerald-300 text-xs">📄 Factura:</span>
                            <span className="text-emerald-100 text-sm font-semibold">${(summary.nonCashIncome || 0).toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-rose-500/20 backdrop-blur-sm rounded-lg p-4 border border-rose-500/30">
                    <p className="text-rose-200 text-xs mb-1">Costo Laboral</p>
                    <p className="text-rose-100 text-2xl font-bold">${summary.totalLaborCost.toFixed(2)}</p>
                </div>

                <div className={`${isGrossProfitable ? 'bg-blue-500/20 border-blue-500/30' : 'bg-orange-500/20 border-orange-500/30'} backdrop-blur-sm rounded-lg p-4 border`}>
                    <p className={`${isGrossProfitable ? 'text-blue-200' : 'text-orange-200'} text-xs mb-1`}>Margen Bruto</p>
                    <p className={`${isGrossProfitable ? 'text-blue-100' : 'text-orange-100'} text-2xl font-bold`}>
                        ${summary.totalMargin.toFixed(2)}
                    </p>
                </div>

                <div className="bg-orange-500/20 backdrop-blur-sm rounded-lg p-4 border border-orange-500/30">
                    <p className="text-orange-200 text-xs mb-1">Gastos Fijos</p>
                    <p className="text-orange-100 text-2xl font-bold">
                        (${distributedFixedCostsForSummary.toFixed(2)})
                    </p>
                </div>

                <div className={`${isRealProfitable ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-rose-500/20 border-rose-500/30'} backdrop-blur-sm rounded-lg p-4 border`}>
                    <p className={`${isRealProfitable ? 'text-emerald-200' : 'text-rose-200'} text-xs mb-1`}>Margen Neto Real</p>
                    <p className={`${isRealProfitable ? 'text-emerald-100' : 'text-rose-100'} text-2xl font-bold`}>
                        ${summary.totalRealMargin.toFixed(2)}
                    </p>
                </div>

                <div className={`${isRealProfitable ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-rose-500/20 border-rose-500/30'} backdrop-blur-sm rounded-lg p-4 border`}>
                    <p className={`${isRealProfitable ? 'text-emerald-200' : 'text-rose-200'} text-xs mb-1 flex items-center gap-1`}>
                        <TrendingUp className="w-3 h-3" />
                        Rentabilidad Real
                    </p>
                    <div className="flex items-baseline gap-2">
                        <p className={`${isRealProfitable ? 'text-emerald-100' : 'text-rose-100'} text-2xl font-bold`}>
                            {summary.totalRealProfitPercentage.toFixed(1)}%
                        </p>
                        {isRealProfitable ? (
                            <TrendingUp className="w-5 h-5 text-emerald-300" />
                        ) : (
                            <TrendingDown className="w-5 h-5 text-rose-300" />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function ClientAccumulatedTab({ 
    clients, 
    allWorkEntries, 
    allSchedules, 
    allFixedCosts, 
    trainingClientId,
    sortColumn,
    sortDirection,
    handleSort
}) {
    const [cumulativeStartDate, setCumulativeStartDate] = useState(new Date('2025-04-01T00:00:00Z'));
    const [cumulativeEndDate, setCumulativeEndDate] = useState(new Date());
    const [hideSentClients, setHideSentClients] = useState(false);
    const [sendModalOpen, setSendModalOpen] = useState(false);
    const [selectedClientForSend, setSelectedClientForSend] = useState(null);
    const [sendDate, setSendDate] = useState(new Date());
    const [sendNotes, setSendNotes] = useState('');
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [selectedClientForHistory, setSelectedClientForHistory] = useState(null);
    const [cumulativeTrainingCost, setCumulativeTrainingCost] = useState({ hours: 0, amount: 0 });

    const cumulativeProfitabilityData = useMemo(() => {
        if (clients.length === 0 || allWorkEntries.length === 0 || allSchedules.length === 0) {
            return { 
                clientAnalysis: [], 
                summary: { totalIncome: 0, totalLaborCost: 0, totalMargin: 0, totalRealMargin: 0, totalHours: 0, totalRealProfitPercentage: 0, cashIncome: 0, nonCashIncome: 0 }, 
                overallTotalFixedCosts: 0,
                overallTotalFixedCostsWithOperational: 0,
                trainingCost: { hours: 0, amount: 0 },
                operationalCostsDetails: []
            };
        }

        const activeClients = clients.filter(c => c.active !== false && c.id !== trainingClientId);

        // USAR LA FUNCIÓN CENTRALIZADA
        const result = calculateProfitabilityForPeriod({
            periodStart: cumulativeStartDate,
            periodEnd: endOfDay(cumulativeEndDate),
            clients: activeClients,
            allSchedules,
            allWorkEntries,
            allFixedCosts,
            trainingClientId,
            sortColumn,
            sortDirection
        });

        // Actualizar el estado de training cost
        setCumulativeTrainingCost(result.trainingCost);

        return {
            clientAnalysis: result.clientAnalysis,
            summary: result.summary,
            overallTotalFixedCosts: result.totalFixedCosts,
            overallTotalFixedCostsWithOperational: result.totalFixedCostsWithTraining,
            trainingCost: result.trainingCost,
            operationalCostsDetails: result.operationalCostsDetails
        };
    }, [clients, allWorkEntries, allSchedules, allFixedCosts, cumulativeStartDate, cumulativeEndDate, trainingClientId, sortColumn, sortDirection]);

    const isNotificationExpired = (sentDate) => {
        if (!sentDate) return true;
        const monthsSince = Math.floor((new Date() - new Date(sentDate)) / (1000 * 60 * 60 * 24 * 30));
        return monthsSince >= 9;
    };

    const getClientSendStatus = (client) => {
        if (!client.current_price_increase_sent_date) {
            return { sent: false, expired: true, monthsSince: null };
        }
        const expired = isNotificationExpired(client.current_price_increase_sent_date);
        const monthsSince = Math.floor((new Date() - new Date(client.current_price_increase_sent_date)) / (1000 * 60 * 60 * 24 * 30));
        return { sent: true, expired, monthsSince };
    };

    const handleOpenSendModal = (clientData) => {
        const client = clients.find(c => c.id === clientData.clientId);
        setSelectedClientForSend({ ...clientData, fullClient: client });
        setSendDate(new Date());
        setSendNotes('');
        setSendModalOpen(true);
    };

    const handleMarkAsSent = async () => {
        if (!selectedClientForSend) return;
        
        try {
            const client = selectedClientForSend.fullClient;
            const currentHistory = client.price_increase_notifications || [];
            
            await Client.update(client.id, {
                current_price_increase_sent_date: sendDate.toISOString(),
                current_price_increase_notes: sendNotes,
                price_increase_notifications: [
                    ...currentHistory,
                    {
                        sent_date: sendDate.toISOString(),
                        notes: sendNotes,
                        sent_by_admin: (await User.me())?.id || 'unknown'
                    }
                ]
            });
            
            setSendModalOpen(false);
            setSelectedClientForSend(null);
            setSendNotes('');
        } catch (error) {
            console.error('Error al marcar como enviado:', error);
        }
    };

    const handleUnmarkSent = async (clientData) => {
        if (!confirm('¿Desmarcar el envío de aumento para este cliente?')) return;
        
        try {
            const client = clients.find(c => c.id === clientData.clientId);
            await Client.update(client.id, {
                current_price_increase_sent_date: null,
                current_price_increase_notes: null
            });
        } catch (error) {
            console.error('Error al desmarcar:', error);
        }
    };

    const handleViewHistory = (clientData) => {
        const client = clients.find(c => c.id === clientData.clientId);
        setSelectedClientForHistory({ ...clientData, fullClient: client });
        setHistoryModalOpen(true);
    };

    const getSortIcon = (column) => {
        if (sortColumn !== column) {
            return <TrendingUp className="w-4 h-4 text-slate-400 opacity-50" />;
        }
        return sortDirection === 'asc' ? 
            <TrendingUp className="w-4 h-4 text-blue-700" /> : 
            <TrendingDown className="w-4 h-4 text-blue-700" />;
    };

    return (
        <div className="space-y-6">
            <Card className="shadow-md border border-slate-200/60 bg-white/80 backdrop-blur-sm">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
                        <div className="flex items-center gap-3">
                            <Switch
                                id="hide-sent"
                                checked={hideSentClients}
                                onCheckedChange={setHideSentClients}
                            />
                            <Label htmlFor="hide-sent" className="text-sm font-semibold text-slate-700 cursor-pointer flex items-center gap-2">
                                {hideSentClients ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                Ocultar clientes con aumento enviado
                            </Label>
                        </div>
                        <div className="text-xs text-slate-500 bg-slate-100 px-3 py-2 rounded-lg">
                            Los envíos se resetean automáticamente después de 9 meses
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-green-600" />
                                Fecha Inicial:
                            </Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="h-12 px-4 justify-start text-left font-medium border-slate-300 hover:border-green-600 hover:bg-slate-50 w-full"
                                    >
                                        <Calendar className="mr-3 h-5 w-5 text-green-600" />
                                        {format(cumulativeStartDate, 'd MMMM yyyy', { locale: es })}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <CalendarComponent
                                        mode="single"
                                        selected={cumulativeStartDate}
                                        onSelect={(date) => date && setCumulativeStartDate(date)}
                                        disabled={(date) => {
                                            const minDate = new Date('2025-04-01');
                                            if (date < minDate) return true;
                                            if (date > new Date()) return true;
                                            if (date > cumulativeEndDate) return true;
                                            const dateStr = format(date, 'yyyy-MM');
                                            if (dateStr === '2025-08' || dateStr === '2025-09') return true;
                                            return false;
                                        }}
                                        initialFocus
                                        locale={es}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-blue-600" />
                                Fecha Final:
                            </Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="h-12 px-4 justify-start text-left font-medium border-slate-300 hover:border-blue-600 hover:bg-slate-50 w-full"
                                    >
                                        <Calendar className="mr-3 h-5 w-5 text-blue-600" />
                                        {format(cumulativeEndDate, 'd MMMM yyyy', { locale: es })}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <CalendarComponent
                                        mode="single"
                                        selected={cumulativeEndDate}
                                        onSelect={(date) => date && setCumulativeEndDate(date)}
                                        disabled={(date) => {
                                            if (date < cumulativeStartDate) return true;
                                            if (date > new Date()) return true;
                                            const dateStr = format(date, 'yyyy-MM');
                                            if (dateStr === '2025-08' || dateStr === '2025-09') return true;
                                            return false;
                                        }}
                                        initialFocus
                                        locale={es}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <TotalsCard 
                summary={cumulativeProfitabilityData.summary} 
                title={`Totales Acumulados (${format(cumulativeStartDate, 'd MMM yyyy', { locale: es })} - ${format(cumulativeEndDate, 'd MMM yyyy', { locale: es })})`}
            />

            {/* Gastos Operativos Detallados */}
            <Card className="shadow-xl border border-orange-200/60 bg-gradient-to-br from-orange-50 to-white">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-orange-900">
                        <Briefcase className="w-5 h-5" />
                        Gastos Operativos Detallados ({format(cumulativeStartDate, 'd MMM yyyy', { locale: es })} - {format(cumulativeEndDate, 'd MMM yyyy', { locale: es })})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {cumulativeProfitabilityData.operationalCostsDetails.length > 0 ? (
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <Table>
                                <TableHeader className="bg-orange-100">
                                    <TableRow>
                                        <TableHead className="font-bold text-orange-900">Cliente Operativo</TableHead>
                                        <TableHead className="text-center font-bold text-orange-900">Horas Acum.</TableHead>
                                        <TableHead className="text-right font-bold text-orange-900">Costo Laboral Acum.</TableHead>
                                        <TableHead className="text-right font-bold text-orange-900">% de Distribución</TableHead>
                                        <TableHead className="text-right font-bold text-orange-900">Valor/Hora</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {cumulativeProfitabilityData.operationalCostsDetails.map(data => {
                                        const totalRealHours = cumulativeProfitabilityData.clientAnalysis.reduce((sum, d) => sum + d.totalHours, 0);
                                        const distribution = totalRealHours > 0 ? (data.totalHours / totalRealHours) * 100 : 0;
                                        const valuePerHour = data.totalHours > 0 ? data.totalLaborCost / data.totalHours : 0;

                                        return (
                                            <TableRow key={data.clientId} className="hover:bg-orange-50/50">
                                                <TableCell className="font-semibold">{data.clientName}</TableCell>
                                                <TableCell className="text-center text-slate-700">{data.totalHours.toFixed(2)}h</TableCell>
                                                <TableCell className="text-right text-orange-700 font-bold">${data.totalLaborCost.toFixed(2)}</TableCell>
                                                <TableCell className="text-right text-slate-700 font-medium">{distribution.toFixed(1)}%</TableCell>
                                                <TableCell className="text-right text-slate-700">${valuePerHour.toFixed(2)}/h</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-500">
                            <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p>No hay gastos operativos en este período</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {cumulativeProfitabilityData.clientAnalysis.length > 0 ? (
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto border border-slate-200 rounded-xl bg-white">
                    <Table>
                        <TableHeader className="sticky top-0 bg-slate-100/95 backdrop-blur-sm z-10 border-b-2 border-slate-200">
                            <TableRow>
                                <TableHead 
                                    className="min-w-[150px] cursor-pointer hover:bg-slate-200/50 select-none font-bold text-slate-700 py-4"
                                    onClick={() => handleSort('clientName')}
                                >
                                    <div className="flex items-center gap-2">
                                        Cliente
                                        {getSortIcon('clientName')}
                                    </div>
                                </TableHead>
                                <TableHead 
                                    className="text-center cursor-pointer hover:bg-slate-200/50 select-none font-bold text-slate-700"
                                    onClick={() => handleSort('serviceCount')}
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        Servicios
                                        {getSortIcon('serviceCount')}
                                    </div>
                                </TableHead>
                                <TableHead 
                                    className="text-center cursor-pointer hover:bg-slate-200/50 select-none font-bold text-slate-700"
                                    onClick={() => handleSort('totalHours')}
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        Horas Acum.
                                        {getSortIcon('totalHours')}
                                    </div>
                                </TableHead>
                                <TableHead 
                                    className="text-right cursor-pointer hover:bg-slate-200/50 select-none font-bold text-slate-700 bg-blue-50"
                                    onClick={() => handleSort('incomePerHour')}
                                >
                                    <div className="flex items-center justify-end gap-2">
                                        Valor Venta/Hora
                                        {getSortIcon('incomePerHour')}
                                    </div>
                                </TableHead>
                                <TableHead 
                                    className="text-right cursor-pointer hover:bg-slate-200/50 select-none font-bold text-slate-700 bg-orange-50"
                                    onClick={() => handleSort('totalCostPerHour')}
                                >
                                    <div className="flex items-center justify-end gap-2">
                                        Costo Total/Hora
                                        {getSortIcon('totalCostPerHour')}
                                    </div>
                                </TableHead>
                                <TableHead 
                                    className="text-right cursor-pointer hover:bg-slate-200/50 select-none font-bold text-slate-700"
                                    onClick={() => handleSort('totalIncome')}
                                >
                                    <div className="flex items-center justify-end gap-2">
                                        Ingresos Acum.
                                        {getSortIcon('totalIncome')}
                                    </div>
                                </TableHead>
                                <TableHead 
                                    className="text-right cursor-pointer hover:bg-slate-200/50 select-none font-bold text-slate-700"
                                    onClick={() => handleSort('totalLaborCost')}
                                >
                                    <div className="flex items-center justify-end gap-2">
                                        Costo Laboral Acum.
                                        {getSortIcon('totalLaborCost')}
                                    </div>
                                </TableHead>
                                <TableHead 
                                    className="text-right cursor-pointer hover:bg-slate-200/50 select-none font-bold text-slate-700"
                                    onClick={() => handleSort('margin')}
                                >
                                    <div className="flex items-center justify-end gap-2">
                                        Margen Bruto Acum.
                                        {getSortIcon('margin')}
                                    </div>
                                </TableHead>
                                <TableHead 
                                    className="text-right cursor-pointer hover:bg-slate-200/50 select-none font-bold text-slate-700"
                                    onClick={() => handleSort('distributedFixedCost')}
                                >
                                    <div className="flex items-center justify-end gap-2">
                                        Gasto Fijo Acum.
                                        {getSortIcon('distributedFixedCost')}
                                    </div>
                                </TableHead>
                                <TableHead 
                                    className="text-right cursor-pointer hover:bg-slate-200/50 select-none font-bold text-slate-700"
                                    onClick={() => handleSort('realMargin')}
                                >
                                    <div className="flex items-center justify-end gap-2">
                                        Margen Neto
                                        {getSortIcon('realMargin')}
                                    </div>
                                </TableHead>
                                <TableHead 
                                    className="text-right cursor-pointer hover:bg-slate-200/50 select-none font-bold text-slate-700"
                                    onClick={() => handleSort('realProfitPercentage')}
                                >
                                    <div className="flex items-center justify-end gap-2">
                                        % Rent. Real
                                        {getSortIcon('realProfitPercentage')}
                                    </div>
                                </TableHead>
                                <TableHead className="text-center font-bold text-slate-700 bg-yellow-50">
                                    <div className="flex items-center justify-center gap-2">
                                        <Send className="w-4 h-4" />
                                        Aumento Enviado
                                    </div>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {cumulativeProfitabilityData.clientAnalysis
                                .filter(data => {
                                    if (!hideSentClients) return true;
                                    const client = clients.find(c => c.id === data.clientId);
                                    const status = getClientSendStatus(client);
                                    return !status.sent || status.expired;
                                })
                                .map(data => {
                                    const client = clients.find(c => c.id === data.clientId);
                                    const sendStatus = getClientSendStatus(client);
                                    return (
                                        <TableRow key={data.clientId} className={`hover:bg-slate-50/50 transition-colors border-b border-slate-100 ${sendStatus.sent && !sendStatus.expired ? 'bg-green-50/30' : ''}`}>
                                            <TableCell className="font-semibold text-slate-900 py-4">{data.clientName}</TableCell>
                                            <TableCell className="text-center text-slate-700">{data.serviceCount}</TableCell>
                                            <TableCell className="text-center font-medium text-slate-800">{data.totalHours.toFixed(2)}h</TableCell>
                                            <TableCell className="text-right font-bold text-blue-700 bg-blue-50">${data.incomePerHour.toFixed(2)}/h</TableCell>
                                            <TableCell className="text-right font-bold text-orange-700 bg-orange-50">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="cursor-help">
                                                                ${data.totalCostPerHour.toFixed(2)}/h
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent className="bg-slate-900 text-white p-3">
                                                            <div className="space-y-1">
                                                                <p className="text-sm font-semibold">Desglose por hora:</p>
                                                                <p className="text-xs">Mano de obra: ${data.laborCostPerHour.toFixed(2)}/h</p>
                                                                <p className="text-xs">Gastos fijos: ${data.fixedCostPerHour.toFixed(2)}/h</p>
                                                                <p className="text-xs border-t border-slate-600 pt-1 mt-1 font-semibold">
                                                                    Total: ${data.totalCostPerHour.toFixed(2)}/h
                                                                </p>
                                                            </div>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </TableCell>
                                            <TableCell className="text-right font-semibold text-emerald-700">${data.totalIncome.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-semibold text-rose-700">${data.totalLaborCost.toFixed(2)}</TableCell>
                                            <TableCell className={`text-right font-semibold ${data.margin > 0 ? 'text-blue-700' : 'text-orange-700'}`}>${data.margin.toFixed(2)}</TableCell>
                                            <TableCell className="text-right text-slate-600 font-medium">(${data.distributedFixedCost.toFixed(2)})</TableCell>
                                            <TableCell className={`text-right font-bold text-lg ${data.realMargin > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>${data.realMargin.toFixed(2)}</TableCell>
                                            <TableCell className={`text-right font-bold ${data.realProfitPercentage > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                <div className="flex items-center justify-end gap-2">
                                                    {data.realProfitPercentage > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                                    <span className="text-base">{data.realProfitPercentage.toFixed(1)}%</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center bg-yellow-50">
                                                <div className="flex items-center justify-center gap-2">
                                                    {sendStatus.sent && !sendStatus.expired ? (
                                                        <div className="flex items-center gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleViewHistory(data)}
                                                                className="h-auto py-0.5 px-1 hover:bg-green-100"
                                                            >
                                                                <div className="flex items-center gap-1 text-green-700">
                                                                    <CheckCircle className="w-3.5 h-3.5" />
                                                                    <span className="text-xs font-semibold">
                                                                        {format(new Date(client.current_price_increase_sent_date), 'd MMM', { locale: es })}
                                                                    </span>
                                                                    <span className="text-xs text-slate-500">
                                                                        ({sendStatus.monthsSince}m)
                                                                    </span>
                                                                </div>
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleUnmarkSent(data)}
                                                                className="h-6 w-6 p-0"
                                                            >
                                                                <X className="w-3 h-3 text-red-600" />
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => handleOpenSendModal(data)}
                                                                className="h-7 px-2 text-xs"
                                                            >
                                                                <Send className="w-3 h-3 mr-1" />
                                                                Marcar
                                                            </Button>
                                                            {client?.price_increase_notifications?.length > 0 && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => handleViewHistory(data)}
                                                                    className="h-6 w-6 p-0"
                                                                >
                                                                    <History className="w-3 h-3 text-slate-600" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                        </TableBody>
                        <tfoot>
                            <TableRow className="bg-gradient-to-r from-slate-100 to-slate-50 font-bold text-slate-900 sticky bottom-0 border-t-2 border-slate-300">
                                <TableCell colSpan="2" className="text-right text-xl py-5">TOTAL ACUMULADO</TableCell>
                                <TableCell className="text-center text-xl">{cumulativeProfitabilityData.summary.totalHours.toFixed(2)}h</TableCell>
                                <TableCell className="text-right text-xl text-blue-800 bg-blue-50">
                                    ${(cumulativeProfitabilityData.summary.totalHours > 0 ? cumulativeProfitabilityData.summary.totalIncome / cumulativeProfitabilityData.summary.totalHours : 0).toFixed(2)}/h
                                </TableCell>
                                <TableCell className="text-right text-xl text-orange-800 bg-orange-50">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className="cursor-help">
                                                    ${(cumulativeProfitabilityData.summary.totalHours > 0 ? (cumulativeProfitabilityData.summary.totalLaborCost + (cumulativeProfitabilityData.overallTotalFixedCosts + cumulativeTrainingCost.amount)) / cumulativeProfitabilityData.summary.totalHours : 0).toFixed(2)}/h
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent className="bg-slate-900 text-white p-3">
                                               <div className="space-y-1">
                                                   <p className="text-sm font-semibold">Desglose promedio por hora:</p>
                                                   <p className="text-xs">
                                                       Mano de obra: ${(cumulativeProfitabilityData.summary.totalHours > 0 ? cumulativeProfitabilityData.summary.totalLaborCost / cumulativeProfitabilityData.summary.totalHours : 0).toFixed(2)}/h
                                                   </p>
                                                   <p className="text-xs">
                                                       Gastos fijos: ${(cumulativeProfitabilityData.summary.totalHours > 0 ? cumulativeProfitabilityData.overallTotalFixedCostsWithOperational / cumulativeProfitabilityData.summary.totalHours : 0).toFixed(2)}/h
                                                   </p>
                                                   <p className="text-xs border-t border-slate-600 pt-1 mt-1 font-semibold">
                                                       Total: ${(cumulativeProfitabilityData.summary.totalHours > 0 ? (cumulativeProfitabilityData.summary.totalLaborCost + cumulativeProfitabilityData.overallTotalFixedCostsWithOperational) / cumulativeProfitabilityData.summary.totalHours : 0).toFixed(2)}/h
                                                   </p>
                                               </div>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </TableCell>
                                <TableCell className="text-right text-xl text-emerald-800">${cumulativeProfitabilityData.summary.totalIncome.toFixed(2)}</TableCell>
                                <TableCell className="text-right text-xl text-rose-800">${cumulativeProfitabilityData.summary.totalLaborCost.toFixed(2)}</TableCell>
                                <TableCell className={`text-right text-xl ${cumulativeProfitabilityData.summary.totalMargin > 0 ? 'text-blue-800' : 'text-orange-800'}`}>${cumulativeProfitabilityData.summary.totalMargin.toFixed(2)}</TableCell>
                                <TableCell className="text-right text-xl text-slate-700">(${(cumulativeProfitabilityData.overallTotalFixedCostsWithOperational).toFixed(2)})</TableCell>
                                <TableCell className={`text-right text-xl ${cumulativeProfitabilityData.summary.totalRealMargin > 0 ? 'text-emerald-800' : 'text-rose-800'}`}>${cumulativeProfitabilityData.summary.totalRealMargin.toFixed(2)}</TableCell>
                                <TableCell className={`text-right text-xl ${cumulativeProfitabilityData.summary.totalRealProfitPercentage > 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                                    <div className="flex items-center justify-end gap-2">
                                        {cumulativeProfitabilityData.summary.totalRealProfitPercentage > 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                                        {cumulativeProfitabilityData.summary.totalRealProfitPercentage.toFixed(1)}%
                                    </div>
                                </TableCell>
                            </TableRow>
                        </tfoot>
                    </Table>
                </div>
            ) : (
                <div className="text-center py-16 text-slate-500">
                    <Calendar className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg">No hay datos acumulados para el período seleccionado.</p>
                </div>
            )}

            {/* Modal para marcar como enviado */}
            <Dialog open={sendModalOpen} onOpenChange={setSendModalOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <Send className="w-5 h-5 text-blue-600" />
                            Marcar Aumento como Enviado
                        </DialogTitle>
                        <DialogDescription>
                            Cliente: <span className="font-semibold">{selectedClientForSend?.clientName}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Fecha de Envío</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-start text-left">
                                        <Calendar className="mr-2 h-4 w-4" />
                                        {format(sendDate, 'd MMMM yyyy', { locale: es })}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <CalendarComponent
                                        mode="single"
                                        selected={sendDate}
                                        onSelect={(date) => date && setSendDate(date)}
                                        disabled={(date) => date > new Date()}
                                        initialFocus
                                        locale={es}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Notas (Opcional)</Label>
                            <Textarea
                                placeholder="Ej: Enviado por email, Conversación telefónica, etc."
                                value={sendNotes}
                                onChange={(e) => setSendNotes(e.target.value)}
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSendModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleMarkAsSent} className="bg-blue-600 hover:bg-blue-700">
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Confirmar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de historial */}
            <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <History className="w-5 h-5 text-blue-600" />
                            Historial de Envíos
                        </DialogTitle>
                        <DialogDescription>
                            Cliente: <span className="font-semibold">{selectedClientForHistory?.clientName}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 max-h-[400px] overflow-y-auto">
                        {selectedClientForHistory?.fullClient?.price_increase_notifications?.length > 0 ? (
                            <div className="space-y-3">
                                {[...selectedClientForHistory.fullClient.price_increase_notifications]
                                    .sort((a, b) => new Date(b.sent_date) - new Date(a.sent_date))
                                    .map((notification, index) => (
                                        <Card key={index} className="p-4 border border-slate-200">
                                            <div className="flex items-start justify-between">
                                                <div className="space-y-1">
                                                    <p className="font-semibold text-slate-900">
                                                        {format(new Date(notification.sent_date), 'd MMMM yyyy', { locale: es })}
                                                    </p>
                                                    <p className="text-sm text-slate-600">
                                                        {notification.notes || 'Sin notas'}
                                                    </p>
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    {Math.floor((new Date() - new Date(notification.sent_date)) / (1000 * 60 * 60 * 24 * 30))} meses
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-slate-500">
                                <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p>No hay historial de envíos</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setHistoryModalOpen(false)}>
                            Cerrar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}