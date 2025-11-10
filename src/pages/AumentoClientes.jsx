
import React, { useState, useEffect, useMemo } from 'react';
import { Client } from '@/entities/Client';
import { WorkEntry } from '@/entities/WorkEntry';
import { FixedCost } from '@/entities/FixedCost';
import { Schedule } from '@/entities/Schedule';
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, DollarSign, Target, AlertCircle, ArrowUpCircle, Percent, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";

// Helper functions (same as Rentabilidad.js)
const extractDateOnly = (isoString) => {
  if (!isoString) return null;
  return isoString.substring(0, 10);
};

const isDateInRange = (dateString, rangeStart, rangeEnd) => {
  if (!dateString || !rangeStart || !rangeEnd) return false;
  
  const date = extractDateOnly(dateString);
  const startDate = format(rangeStart, 'yyyy-MM-dd');
  const endDate = format(rangeEnd, 'yyyy-MM-dd');
  
  return date >= startDate && date <= endDate;
};

const calculateGST = (price, gstType) => {
    const numPrice = parseFloat(price) || 0;
    switch (gstType) {
        case 'inclusive':
            return { base: numPrice / 1.1, gst: numPrice - (numPrice / 1.1), total: numPrice };
        case 'exclusive':
            const gst = numPrice * 0.1;
            return { base: numPrice, gst: gst, total: numPrice + gst };
        case 'no_tax':
            return { base: numPrice, gst: 0, total: numPrice };
        default:
            return { base: numPrice, gst: 0, total: numPrice };
    }
};

const mergeRevenueBreakdowns = (currentBreakdown, newBreakdown) => {
    const merged = { ...currentBreakdown };
    for (const key in newBreakdown) {
        merged[key] = (merged[key] || 0) + newBreakdown[key];
    }
    return merged;
};

const calculateTotalIncomeFromBreakdown = (breakdown) => {
    let total = 0;
    for (const type in breakdown) {
        if (type === 'discount') {
            total -= breakdown[type];
        } else {
            total += breakdown[type];
        }
    }
    return total;
};

export default function AumentoClientesPage() {
    const [clients, setClients] = useState([]);
    const [allWorkEntries, setAllWorkEntries] = useState([]);
    const [allSchedules, setAllSchedules] = useState([]);
    const [allFixedCosts, setAllFixedCosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [targetProfitPercentage, setTargetProfitPercentage] = useState(15); // Default: 15%
    const [trainingClientId, setTrainingClientId] = useState(null);
    const [sortColumn, setSortColumn] = useState('adjustmentNeeded');
    const [sortDirection, setSortDirection] = useState('desc');

    // Period selection
    const [startDate] = useState(new Date('2025-04-01T00:00:00Z')); // Fixed start date
    const [endDate, setEndDate] = useState(() => {
        // Default to end of previous month
        const today = new Date();
        return endOfMonth(subMonths(today, 1));
    });

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError('');
            try {
                const [clientsData, workEntriesData, schedulesData, fixedCostsData] = await Promise.all([
                    Client.list(),
                    WorkEntry.list("-work_date"),
                    Schedule.list(),
                    FixedCost.list(),
                ]);
                
                setClients(clientsData || []);
                setAllWorkEntries(workEntriesData || []);
                setAllSchedules(schedulesData || []);
                setAllFixedCosts(fixedCostsData || []);
                
                const trainingClient = (clientsData || []).find(c => c.name === 'TRAINING' || c.client_type === 'training');
                if (trainingClient) {
                    setTrainingClientId(trainingClient.id);
                }
            } catch (err) {
                console.error("Error loading data:", err);
                setError("Error al cargar los datos. Por favor, recarga la página.");
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    const clientPriceAnalysis = useMemo(() => {
        if (clients.length === 0 || allWorkEntries.length === 0 || allSchedules.length === 0) {
            return [];
        }

        const activeClients = clients.filter(c => c.active !== false && c.id !== trainingClientId);
        const clientMap = new Map(activeClients.map(c => [c.id, c]));

        // Calculate cumulative income
        const cumulativeIncomeDetailMap = new Map();
        const invoicedSchedulesCumulative = allSchedules.filter(schedule => {
            return isDateInRange(schedule.start_time, startDate, endDate) && 
                   schedule.xero_invoiced === true &&
                   schedule.client_id !== trainingClientId &&
                   clientMap.has(schedule.client_id);
        });

        invoicedSchedulesCumulative.forEach(schedule => {
            const client = clientMap.get(schedule.client_id);
            if (!client) return;

            const clientId = client.id;
            let currentClientCumulativeBreakdown = cumulativeIncomeDetailMap.get(clientId) || {};

            let tempRawBreakdown = {};
            let totalRawReconciledAmount = 0;

            if (schedule.reconciliation_items && schedule.reconciliation_items.length > 0) {
                schedule.reconciliation_items.forEach(item => {
                    const type = item.type || 'other_extra';
                    const amount = parseFloat(item.amount) || 0;
                    tempRawBreakdown[type] = (tempRawBreakdown[type] || 0) + amount;
                    if (type !== 'discount') {
                        totalRawReconciledAmount += amount;
                    }
                });
            } else {
                totalRawReconciledAmount = client.current_service_price || 0;
                tempRawBreakdown['base_service'] = totalRawReconciledAmount;
            }
            
            const { base: netIncomeFromRawTotal, total: grossIncomeFromRawTotal } = calculateGST(totalRawReconciledAmount, client.gst_type);

            const gstFactor = (grossIncomeFromRawTotal > 0 && totalRawReconciledAmount > 0) ? (netIncomeFromRawTotal / totalRawReconciledAmount) : 1;
            
            let netBreakdownForService = {};
            for (const type in tempRawBreakdown) {
                netBreakdownForService[type] = tempRawBreakdown[type] * gstFactor;
            }
            
            cumulativeIncomeDetailMap.set(clientId, mergeRevenueBreakdowns(currentClientCumulativeBreakdown, netBreakdownForService));
        });

        // Calculate work entries
        const cumulativeWorkEntries = allWorkEntries.filter(entry => {
            return isDateInRange(entry.work_date, startDate, endDate) && 
                   entry.client_id !== trainingClientId &&
                   clientMap.has(entry.client_id);
        });

        // Count unique service dates
        const clientServiceDates = new Map();
        cumulativeWorkEntries.forEach(entry => {
            if (!entry.client_id || !entry.work_date) return;
            
            if (!clientServiceDates.has(entry.client_id)) {
                clientServiceDates.set(entry.client_id, new Set());
            }
            
            const dateOnly = extractDateOnly(entry.work_date);
            if (dateOnly) {
                clientServiceDates.get(entry.client_id).add(dateOnly);
            }
        });

        // Calculate training costs
        let cumulativeTrainingAmount = 0;
        allWorkEntries.forEach(entry => {
            if (entry.client_id === trainingClientId && 
                isDateInRange(entry.work_date, startDate, endDate)) {
                cumulativeTrainingAmount += entry.total_amount || 0;
            }
        });

        // Build client profitability data
        const cumulativeClientProfitability = cumulativeWorkEntries.reduce((acc, entry) => {
            if (!entry.client_id) return acc;
            const client = clientMap.get(entry.client_id);
            if (!client) return acc;

            if (!acc[client.id]) {
                acc[client.id] = {
                    clientId: client.id,
                    clientName: client.name,
                    totalIncome: 0,
                    totalLaborCost: 0,
                    totalHours: 0,
                    serviceCount: 0,
                    revenueBreakdown: {},
                    serviceFrequency: client.service_frequency,
                    currentServicePrice: client.current_service_price,
                    serviceHours: client.service_hours,
                    gstType: client.gst_type,
                };
            }
            acc[client.id].totalLaborCost += entry.total_amount || 0;
            acc[client.id].totalHours += entry.hours || 0;
            return acc;
        }, {});

        // Add income and service count
        cumulativeIncomeDetailMap.forEach((breakdown, clientId) => {
            if (cumulativeClientProfitability[clientId]) {
                cumulativeClientProfitability[clientId].revenueBreakdown = breakdown;
                cumulativeClientProfitability[clientId].totalIncome = calculateTotalIncomeFromBreakdown(breakdown);
                
                const uniqueServiceDates = clientServiceDates.get(clientId);
                cumulativeClientProfitability[clientId].serviceCount = uniqueServiceDates ? uniqueServiceDates.size : 0;
            } else {
                const client = clientMap.get(clientId);
                if (client) {
                    const uniqueServiceDates = clientServiceDates.get(clientId);
                    cumulativeClientProfitability[clientId] = {
                        clientId: clientId,
                        clientName: client.name,
                        totalIncome: calculateTotalIncomeFromBreakdown(breakdown),
                        totalLaborCost: 0,
                        totalHours: 0,
                        serviceCount: uniqueServiceDates ? uniqueServiceDates.size : 0,
                        revenueBreakdown: breakdown,
                        serviceFrequency: client.service_frequency,
                        currentServicePrice: client.current_service_price,
                        serviceHours: client.service_hours,
                        gstType: client.gst_type,
                    };
                }
            }
        });

        // Calculate fixed costs
        const startPeriod = format(startDate, 'yyyy-MM');
        const endPeriod = format(endDate, 'yyyy-MM');
        const totalCumulativeFixedCosts = allFixedCosts.filter(fc => {
            return fc.period >= startPeriod && fc.period <= endPeriod;
        }).reduce((sum, fc) => sum + (fc.amount || 0), 0);

        const totalFixedCostsWithTraining = totalCumulativeFixedCosts + cumulativeTrainingAmount;
        const overallCumulativeTotalHours = cumulativeWorkEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
        const cumulativeFixedCostPerHourOverall = overallCumulativeTotalHours > 0 ? 
            totalFixedCostsWithTraining / overallCumulativeTotalHours : 0;

        // Calculate margins and profitability
        const clientAnalysis = Object.values(cumulativeClientProfitability).map(data => {
            const margin = data.totalIncome - data.totalLaborCost;
            const distributedFixedCost = data.totalHours * cumulativeFixedCostPerHourOverall;
            const realMargin = margin - distributedFixedCost;
            const incomePerHour = data.totalHours > 0 ? data.totalIncome / data.totalHours : 0;
            const laborCostPerHour = data.totalHours > 0 ? data.totalLaborCost / data.totalHours : 0;
            const realMarginPerHour = data.totalHours > 0 ? realMargin / data.totalHours : 0;
            const fixedCostPerHour = data.totalHours > 0 ? distributedFixedCost / data.totalHours : 0;
            const currentRealProfitPercentage = data.totalIncome > 0 ? (realMargin / data.totalIncome) * 100 : (realMargin < 0 ? -100 : 0);

            // NUEVO CÁLCULO: Basado en porcentaje de rentabilidad
            const targetDecimal = targetProfitPercentage / 100;
            let adjustmentNeeded = 0;
            let newTotalIncome = data.totalIncome;
            let adjustmentPercentage = 0;

            if (targetDecimal < 1 && data.totalIncome > 0) {
                adjustmentNeeded = (data.totalIncome * targetDecimal - realMargin) / (1 - targetDecimal);
                newTotalIncome = data.totalIncome + adjustmentNeeded;
                adjustmentPercentage = data.totalIncome > 0 ? (adjustmentNeeded / data.totalIncome) * 100 : 0;
            }

            // Calculate per-service adjustment
            const currentPriceBase = calculateGST(data.currentServicePrice || 0, data.gstType).base;
            const adjustmentPerService = data.serviceCount > 0 ? adjustmentNeeded / data.serviceCount : 0;
            const newServicePriceBase = currentPriceBase + adjustmentPerService;
            const adjustmentPerServicePercentage = currentPriceBase > 0 ? (adjustmentPerService / currentPriceBase) * 100 : 0;

            return {
                ...data,
                margin,
                distributedFixedCost,
                realMargin,
                incomePerHour,
                laborCostPerHour,
                realMarginPerHour,
                fixedCostPerHour,
                currentRealProfitPercentage,
                targetProfitPercentage,
                adjustmentNeeded: adjustmentNeeded > 0 ? adjustmentNeeded : 0,
                newTotalIncome,
                adjustmentPercentage: adjustmentNeeded > 0 ? adjustmentPercentage : 0,
                currentPriceBase,
                adjustmentPerService: adjustmentNeeded > 0 ? adjustmentPerService : 0,
                newServicePriceBase,
                adjustmentPerServicePercentage: adjustmentNeeded > 0 ? adjustmentPerServicePercentage : 0,
                isBelowTarget: currentRealProfitPercentage < targetProfitPercentage,
            };
        })
        .filter(data => {
            // IMPORTANTE: Solo incluir clientes que están actualmente activos y tienen horas o ingresos
            const client = clientMap.get(data.clientId);
            return client && client.active !== false && (data.totalHours > 0 || data.totalIncome > 0);
        });

        // Filter only clients below target
        const clientsBelowTarget = clientAnalysis.filter(c => c.isBelowTarget);

        return clientsBelowTarget;

    }, [clients, allWorkEntries, allSchedules, allFixedCosts, startDate, endDate, trainingClientId, targetProfitPercentage]);

    const sortedClients = useMemo(() => {
        return [...clientPriceAnalysis].sort((a, b) => {
            let aValue = a[sortColumn];
            let bValue = b[sortColumn];

            if (sortColumn === 'clientName') {
                aValue = aValue?.toLowerCase() || '';
                bValue = bValue?.toLowerCase() || '';
                return sortDirection === 'asc' ? 
                    aValue.localeCompare(bValue) : 
                    bValue.localeCompare(aValue);
            }

            aValue = parseFloat(aValue) || 0;
            bValue = parseFloat(bValue) || 0;
            
            return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        });
    }, [clientPriceAnalysis, sortColumn, sortDirection]);

    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('desc');
        }
    };

    const getSortIcon = (column) => {
        if (sortColumn !== column) {
            return <TrendingUp className="w-4 h-4 text-slate-400 opacity-50" />;
        }
        return sortDirection === 'asc' ? 
            <TrendingUp className="w-4 h-4 text-blue-700" /> : 
            <TrendingDown className="w-4 h-4 text-blue-700" />;
    };

    if (loading) return (
        <div className="p-8 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div>
        </div>
    );
    
    if (error) return (
        <div className="p-8 text-red-700 text-center font-medium">{error}</div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 md:p-10">
            <div className="max-w-[1920px] mx-auto">
                {/* Header */}
                <div className="mb-10">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="p-3 bg-gradient-to-br from-orange-600 to-orange-700 rounded-xl shadow-lg">
                            <ArrowUpCircle className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Aumento de Clientes</h1>
                            <p className="text-slate-600 mt-1 text-lg font-light">
                                Identifica qué clientes necesitan ajuste de precio para alcanzar tu rentabilidad objetivo
                            </p>
                        </div>
                    </div>
                </div>

                {/* Control Panel */}
                <Card className="mb-8 shadow-xl border border-slate-200/60 bg-white/80 backdrop-blur-sm">
                    <CardContent className="p-8">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Period Selection */}
                            <div className="space-y-3">
                                <Label className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-blue-600" />
                                    Período de Análisis
                                </Label>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm text-slate-600">
                                        <span className="font-medium">Desde:</span>
                                        <span className="font-semibold text-slate-900">
                                            {format(startDate, "d 'de' MMMM 'de' yyyy", { locale: es })}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-600">Hasta:</span>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="w-full justify-start text-left font-normal border-slate-300 hover:border-blue-500"
                                                >
                                                    <Calendar className="mr-2 h-4 w-4 text-blue-600" />
                                                    {format(endDate, "d 'de' MMMM 'de' yyyy", { locale: es })}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <CalendarPicker
                                                    mode="single"
                                                    selected={endDate}
                                                    onSelect={(date) => date && setEndDate(date)}
                                                    disabled={(date) => date > new Date() || date < startDate}
                                                    initialFocus
                                                    locale={es}
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>
                            </div>

                            {/* Target Profit */}
                            <div className="space-y-3">
                                <Label htmlFor="target-profit" className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                                    <Target className="w-4 h-4 text-orange-600" />
                                    Rentabilidad Mínima Deseada
                                </Label>
                                <div className="relative">
                                    <Percent className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                                    <Input
                                        id="target-profit"
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="100"
                                        value={targetProfitPercentage}
                                        onChange={(e) => setTargetProfitPercentage(parseFloat(e.target.value) || 0)}
                                        className="pl-12 h-12 text-base border-slate-300 focus:border-orange-600 focus:ring-2 focus:ring-orange-600/20 font-medium"
                                        placeholder="15.0"
                                        onWheel={(e) => e.currentTarget.blur()}
                                    />
                                </div>
                            </div>

                            {/* Info Alert */}
                            <div className="flex items-end">
                                <Alert className="border-blue-200 bg-blue-50/50">
                                    <AlertCircle className="h-5 w-5 text-blue-600" />
                                    <AlertDescription className="text-blue-800 text-sm">
                                        <strong>Nota:</strong> Solo se muestran clientes por debajo del objetivo de rentabilidad. Ajusta el período para excluir meses con gastos incompletos.
                                    </AlertDescription>
                                </Alert>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <Card className="shadow-lg border border-orange-200/60 bg-gradient-to-br from-orange-50 to-white">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold text-orange-800 uppercase tracking-wide flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                Clientes Requieren Ajuste
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-4xl font-bold text-orange-900 tracking-tight">{sortedClients.length}</p>
                            <p className="text-xs text-orange-700 mt-1 font-medium">Por debajo del objetivo</p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-lg border border-blue-200/60 bg-gradient-to-br from-blue-50 to-white">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold text-blue-800 uppercase tracking-wide flex items-center gap-2">
                                <Target className="w-4 h-4" />
                                Rentabilidad Objetivo
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-4xl font-bold text-blue-900 tracking-tight">{targetProfitPercentage.toFixed(1)}%</p>
                            <p className="text-xs text-blue-700 mt-1 font-medium">Margen Neto Deseado</p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-lg border border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-white">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold text-emerald-800 uppercase tracking-wide flex items-center gap-2">
                                <DollarSign className="w-4 h-4" />
                                Aumento Total Potencial
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-4xl font-bold text-emerald-900 tracking-tight">
                                ${sortedClients.reduce((sum, c) => sum + Math.max(0, c.adjustmentNeeded), 0).toFixed(2)}
                            </p>
                            <p className="text-xs text-emerald-700 mt-1 font-medium">Si todos los clientes ajustan</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Table */}
                {sortedClients.length > 0 ? (
                    <Card className="shadow-xl border border-slate-200/60 bg-white/80 backdrop-blur-sm">
                        <CardHeader>
                            <CardTitle className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                                <ArrowUpCircle className="w-6 h-6 text-orange-600" />
                                Clientes que Requieren Ajuste de Precio
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-slate-100/95 sticky top-0 z-10">
                                        <TableRow>
                                            <TableHead 
                                                className="cursor-pointer hover:bg-slate-200/50 font-bold text-slate-700"
                                                onClick={() => handleSort('clientName')}
                                            >
                                                <div className="flex items-center gap-2">
                                                    Cliente
                                                    {getSortIcon('clientName')}
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-center font-bold text-slate-700">
                                                Servicios
                                            </TableHead>
                                            <TableHead className="text-center font-bold text-slate-700">
                                                Horas Totales
                                            </TableHead>
                                            <TableHead 
                                                className="text-right cursor-pointer hover:bg-slate-200/50 font-bold text-slate-700"
                                                onClick={() => handleSort('currentRealProfitPercentage')}
                                            >
                                                <div className="flex items-center justify-end gap-2">
                                                    Rentabilidad Actual (%)
                                                    {getSortIcon('currentRealProfitPercentage')}
                                                </div>
                                            </TableHead>
                                            <TableHead className="text-right font-bold text-slate-700 bg-blue-50">
                                                Rentabilidad Objetivo (%)
                                            </TableHead>
                                            <TableHead 
                                                className="text-right cursor-pointer hover:bg-slate-200/50 font-bold text-slate-700"
                                                onClick={() => handleSort('currentPriceBase')}
                                            >
                                                <div className="flex items-center justify-end gap-2">
                                                    Precio Servicio Actual
                                                    {getSortIcon('currentPriceBase')}
                                                </div>
                                            </TableHead>
                                            <TableHead 
                                                className="text-right cursor-pointer hover:bg-slate-200/50 font-bold text-slate-700 bg-emerald-50"
                                                onClick={() => handleSort('newServicePriceBase')}
                                            >
                                                <div className="flex items-center justify-end gap-2">
                                                    Nuevo Precio Servicio Sugerido
                                                    {getSortIcon('newServicePriceBase')}
                                                </div>
                                            </TableHead>
                                            <TableHead 
                                                className="text-right cursor-pointer hover:bg-slate-200/50 font-bold text-slate-700 bg-orange-50"
                                                onClick={() => handleSort('adjustmentPerService')}
                                            >
                                                <div className="flex items-center justify-end gap-2">
                                                    Aumento por Servicio ($)
                                                    {getSortIcon('adjustmentPerService')}
                                                </div>
                                            </TableHead>
                                            <TableHead 
                                                className="text-right cursor-pointer hover:bg-slate-200/50 font-bold text-slate-700 bg-orange-50"
                                                onClick={() => handleSort('adjustmentPerServicePercentage')}
                                            >
                                                <div className="flex items-center justify-end gap-2">
                                                    Aumento Requerido (%)
                                                    {getSortIcon('adjustmentPerServicePercentage')}
                                                </div>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sortedClients.map((client) => (
                                            <TableRow 
                                                key={client.clientId}
                                                className="hover:bg-slate-50/50 transition-colors border-b border-slate-100"
                                            >
                                                <TableCell className="font-semibold text-slate-900">
                                                    {client.clientName}
                                                </TableCell>
                                                <TableCell className="text-center text-slate-700">
                                                    {client.serviceCount}
                                                </TableCell>
                                                <TableCell className="text-center font-medium text-slate-800">
                                                    {client.totalHours.toFixed(2)}h
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-red-700">
                                                    {client.currentRealProfitPercentage.toFixed(1)}%
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-blue-700 bg-blue-50">
                                                    {targetProfitPercentage.toFixed(1)}%
                                                </TableCell>
                                                <TableCell className="text-right font-medium text-slate-700">
                                                    ${client.currentPriceBase.toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-emerald-700 bg-emerald-50 text-lg">
                                                    ${client.newServicePriceBase.toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-orange-700 bg-orange-50 text-lg">
                                                    +${client.adjustmentPerService.toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-orange-700 bg-orange-50 text-xl">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <ArrowUpCircle className="w-5 h-5" />
                                                        +{client.adjustmentPerServicePercentage.toFixed(1)}%
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="shadow-lg text-center">
                        <CardContent className="p-12">
                            <Target className="w-24 h-24 mx-auto text-green-300 mb-4" />
                            <h3 className="text-2xl font-bold text-slate-900 mb-2">
                                ¡Excelente! Todos los clientes cumplen el objetivo
                            </h3>
                            <p className="text-slate-600 text-lg">
                                No hay clientes con rentabilidad por debajo de {targetProfitPercentage.toFixed(1)}% en el período seleccionado.
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
