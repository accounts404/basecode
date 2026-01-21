import React, { useState, useEffect, useMemo } from 'react';
import { FixedCost } from '@/entities/FixedCost';
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, DollarSign, Users, Briefcase, Activity, Calendar, PiggyBank, BarChart, Target, Save, CheckCircle, Clock, GraduationCap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isDateInRange } from '@/components/utils/priceCalculations';
import { calculateProfitabilityForPeriod } from '@/components/utils/profitabilityCalculations';

const generateMonthOptions = () => {
    const months = [];
    const currentDate = new Date();
    for (let i = 0; i < 12; i++) {
        const date = subMonths(currentDate, i);
        const monthValue = format(date, 'yyyy-MM');
        
        if (monthValue === '2025-08' || monthValue === '2025-09') {
            continue;
        }
        
        months.push({
            value: monthValue,
            label: format(date, 'MMMM yyyy', { locale: es })
        });
    }
    return months;
};

const ProfitabilityRow = ({ data }) => {
    const isGrossProfitable = data.margin > 0;
    const grossProfitabilityClass = isGrossProfitable ? "text-blue-700" : "text-orange-700";

    const isRealProfitable = data.realMargin > 0;
    const realProfitabilityClass = isRealProfitable ? "text-emerald-700" : "text-rose-700";
    const realProfitabilityIcon = isRealProfitable ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />;
    
    return (
        <TableRow className="hover:bg-slate-50/50 transition-colors border-b border-slate-100">
            <TableCell className="font-semibold text-slate-900 py-4">{data.clientName}</TableCell>
            <TableCell className="text-center text-slate-700">{data.serviceCount}</TableCell>
            <TableCell className="text-center font-medium text-slate-800">{data.totalHours.toFixed(2)}h</TableCell>
            
            <TableCell className="text-right">
                <p className="font-semibold text-emerald-700">${data.totalIncome.toFixed(2)}</p>
                <p className="text-xs text-slate-500 font-medium">(${data.incomePerHour.toFixed(2)}/h)</p>
            </TableCell>
            
            <TableCell className="text-right">
                <p className="font-semibold text-rose-700">${data.totalLaborCost.toFixed(2)}</p>
                <p className="text-xs text-slate-500 font-medium">(${data.laborCostPerHour.toFixed(2)}/h)</p>
            </TableCell>
            
            <TableCell className={`text-right font-semibold ${grossProfitabilityClass}`}>
                <p className="text-base">${data.margin.toFixed(2)}</p>
                <p className="text-xs font-normal text-slate-500">(${data.marginPerHour.toFixed(2)}/h)</p>
            </TableCell>
            
            <TableCell className="text-right text-slate-600">
                <p className="font-medium">(${data.distributedFixedCost.toFixed(2)})</p>
                <p className="text-xs text-slate-500">(${data.fixedCostPerHour.toFixed(2)}/h)</p>
            </TableCell>
            
            <TableCell className={`text-right font-bold text-lg ${realProfitabilityClass}`}>
                <p>${data.realMargin.toFixed(2)}</p>
                <p className="text-xs font-normal text-slate-500">(${data.realMarginPerHour.toFixed(2)}/h)</p>
            </TableCell>
            
            <TableCell className={`text-right font-bold ${realProfitabilityClass}`}>
                <div className="flex items-center justify-end gap-2">
                    {realProfitabilityIcon}
                    <span className="text-base">{data.realProfitPercentage.toFixed(1)}%</span>
                </div>
            </TableCell>
        </TableRow>
    );
};

export default function RentabilityAnalysisTab({ 
    clients, 
    allWorkEntries, 
    allSchedules, 
    allFixedCosts, 
    trainingClientId,
    operationalCostClients,
    sortColumn,
    sortDirection,
    handleSort
}) {
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [selectedPeriod, setSelectedPeriod] = useState(null);
    const [fixedCostInput, setFixedCostInput] = useState(0);
    const [savedFixedCosts, setSavedFixedCosts] = useState(0);
    const [savingFixedCosts, setSavingFixedCosts] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [monthOptions] = useState(generateMonthOptions());
    const [monthlyProcessedClientAnalysis, setMonthlyProcessedClientAnalysis] = useState([]);
    const [monthlyTrainingCost, setMonthlyTrainingCost] = useState({ hours: 0, amount: 0 });
    const [error, setError] = useState('');

    useEffect(() => {
        if (selectedMonth && clients.length > 0) {
            loadMonthData(selectedMonth);
        }
    }, [selectedMonth, clients, allWorkEntries, allSchedules, allFixedCosts]);

    const loadMonthData = async (monthValue) => {
        setError('');
        try {
            const [year, month] = monthValue.split('-');
            const monthStart = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
            const monthEnd = endOfMonth(new Date(parseInt(year), parseInt(month) - 1));
            setSelectedPeriod({ start: monthStart, end: monthEnd });

            const activeClients = clients.filter(c => c.active !== false && c.id !== trainingClientId);

            // USAR LA FUNCIÓN CENTRALIZADA
            const result = calculateProfitabilityForPeriod({
                periodStart: monthStart,
                periodEnd: monthEnd,
                clients: activeClients,
                allSchedules,
                allWorkEntries,
                allFixedCosts,
                trainingClientId,
                sortColumn,
                sortDirection
            });

            setMonthlyProcessedClientAnalysis(result.clientAnalysis);
            setMonthlyTrainingCost(result.trainingCost);

            // Cargar gastos fijos guardados
            const fixedCostsForMonth = allFixedCosts.filter(fc => fc.period === monthValue);
            const currentFixedCostAmount = fixedCostsForMonth && fixedCostsForMonth.length > 0
                ? fixedCostsForMonth[0].amount
                : 0;
            setFixedCostInput(currentFixedCostAmount);
            setSavedFixedCosts(currentFixedCostAmount);

        } catch (err) {
            console.error("Error loading month data:", err);
            setError("Error al cargar los datos del mes.");
        }
    };

    const monthlyOperationalCosts = useMemo(() => {
        if (!selectedPeriod) return 0;
        
        const operationalCostEntries = allWorkEntries.filter(entry => {
            const client = clients.find(c => c.id === entry.client_id);
            return client?.client_type === 'operational_cost' && 
                   isDateInRange(entry.work_date, selectedPeriod.start, selectedPeriod.end);
        });
        
        return operationalCostEntries.reduce((sum, entry) => sum + (entry.total_amount || 0), 0);
    }, [allWorkEntries, clients, selectedPeriod]);

    const monthlyOperationalCostsDetails = useMemo(() => {
        if (!selectedPeriod) return [];
        
        const operationalCostEntries = allWorkEntries.filter(entry => {
            const client = clients.find(c => c.id === entry.client_id);
            return client?.client_type === 'operational_cost' && 
                   isDateInRange(entry.work_date, selectedPeriod.start, selectedPeriod.end);
        });

        const costsByClient = {};
        operationalCostEntries.forEach(entry => {
            if (!costsByClient[entry.client_id]) {
                costsByClient[entry.client_id] = {
                    clientId: entry.client_id,
                    clientName: entry.client_name,
                    totalHours: 0,
                    totalLaborCost: 0
                };
            }
            costsByClient[entry.client_id].totalHours += entry.hours || 0;
            costsByClient[entry.client_id].totalLaborCost += entry.total_amount || 0;
        });

        return Object.values(costsByClient);
    }, [allWorkEntries, clients, selectedPeriod]);

    const profitabilityData = useMemo(() => {
        if (!selectedPeriod || monthlyProcessedClientAnalysis.length === 0) {
            return { clientAnalysis: [], summary: { totalIncome: 0, totalLaborCost: 0, totalMargin: 0, totalRealMargin: 0, totalHours: 0, totalRealProfitPercentage: 0 } };
        }

        const sortedClientAnalysis = [...monthlyProcessedClientAnalysis].sort((a, b) => {
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
        
        const summary = sortedClientAnalysis.reduce((acc, client) => {
            acc.totalIncome += client.totalIncome;
            acc.totalLaborCost += client.totalLaborCost;
            acc.totalMargin += client.margin;
            acc.totalHours += client.totalHours;
            acc.totalRealMargin += client.realMargin;
            if (client.isCash) {
                acc.cashIncome += client.totalIncome;
                acc.cashLaborCost += client.totalLaborCost;
                acc.cashMargin += client.margin;
            } else {
                acc.nonCashIncome += client.totalIncome;
                acc.invoiceLaborCost += client.totalLaborCost;
                acc.invoiceMargin += client.margin;
            }
            return acc;
        }, { 
            totalIncome: 0, 
            totalLaborCost: 0, 
            totalMargin: 0, 
            totalHours: 0, 
            totalRealMargin: 0, 
            cashIncome: 0, 
            nonCashIncome: 0,
            cashLaborCost: 0,
            invoiceLaborCost: 0,
            cashMargin: 0,
            invoiceMargin: 0
        });

        const totalRealProfitPercentage = summary.totalIncome > 0 ? (summary.totalRealMargin / summary.totalIncome) * 100 : 0;
        summary.totalRealProfitPercentage = totalRealProfitPercentage;
        
        const totalFixedCosts = parseFloat(fixedCostInput || 0) + monthlyTrainingCost.amount + monthlyOperationalCosts;
        const cashRatio = summary.totalIncome > 0 ? summary.cashIncome / summary.totalIncome : 0;
        const invoiceRatio = summary.totalIncome > 0 ? summary.nonCashIncome / summary.totalIncome : 0;
        
        summary.cashFixedCosts = totalFixedCosts * cashRatio;
        summary.invoiceFixedCosts = totalFixedCosts * invoiceRatio;
        summary.cashNetMargin = summary.cashMargin - summary.cashFixedCosts;
        summary.invoiceNetMargin = summary.invoiceMargin - summary.invoiceFixedCosts;
        summary.cashProfitability = summary.cashIncome > 0 ? (summary.cashNetMargin / summary.cashIncome) * 100 : 0;
        summary.invoiceProfitability = summary.nonCashIncome > 0 ? (summary.invoiceNetMargin / summary.nonCashIncome) * 100 : 0;

        return { clientAnalysis: sortedClientAnalysis, summary };

    }, [selectedPeriod, monthlyProcessedClientAnalysis, sortColumn, sortDirection, fixedCostInput, monthlyTrainingCost, monthlyOperationalCosts]);

    const handleSaveFixedCosts = async () => {
        if (!selectedMonth) return;
        
        setSavingFixedCosts(true);
        setSaveSuccess(false);
        
        try {
            const existingCosts = allFixedCosts.filter(fc => fc.period === selectedMonth);
            
            if (existingCosts && existingCosts.length > 0) {
                await FixedCost.update(existingCosts[0].id, {
                    amount: parseFloat(fixedCostInput) || 0
                });
            } else {
                await FixedCost.create({
                    period: selectedMonth,
                    amount: parseFloat(fixedCostInput) || 0
                });
            }

            setSavedFixedCosts(parseFloat(fixedCostInput) || 0);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);

        } catch (err) {
            console.error("Error saving fixed costs:", err);
            setError("Error al guardar los gastos fijos.");
        }
        
        setSavingFixedCosts(false);
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
            <Card className="shadow-xl border border-slate-200/60 bg-white/80 backdrop-blur-sm">
                <CardContent className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
                        <div className="space-y-3">
                            <Label className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-blue-600" />
                                Período de Análisis
                            </Label>
                            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                <SelectTrigger className="h-12 text-base border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 font-medium">
                                    <SelectValue placeholder="Selecciona un mes" />
                                </SelectTrigger>
                                <SelectContent>
                                    {monthOptions.map((month) => (
                                        <SelectItem key={month.value} value={month.value} className="py-3 text-base">
                                            {month.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-3">
                            <Label htmlFor="fixed-costs" className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                                <PiggyBank className="w-4 h-4 text-orange-600" />
                                Gastos Fijos del Período
                            </Label>
                            <div className="flex items-center gap-3">
                                <div className="relative flex-1">
                                    <DollarSign className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                                    <Input
                                        id="fixed-costs"
                                        type="number"
                                        step="0.01"
                                        value={fixedCostInput}
                                        onChange={(e) => setFixedCostInput(e.target.value)}
                                        className="pl-12 h-12 text-base border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 font-medium"
                                        placeholder="0.00"
                                        onWheel={(e) => e.currentTarget.blur()}
                                    />
                                </div>
                                <Button 
                                    onClick={handleSaveFixedCosts}
                                    disabled={savingFixedCosts || parseFloat(fixedCostInput) === savedFixedCosts}
                                    size="lg"
                                    className="h-12 px-5 bg-blue-600 hover:bg-blue-700 shadow-md"
                                >
                                    {savingFixedCosts ? (
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    ) : (
                                        <Save className="w-5 h-5" />
                                    )}
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                                <GraduationCap className="w-4 h-4 text-purple-600" />
                                Costo de Entrenamiento
                            </Label>
                            <div className="h-12 bg-purple-50 border-2 border-purple-200 rounded-lg px-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Clock className="w-4 h-4 text-purple-600" />
                                    <span className="text-sm font-medium text-purple-900">
                                        {monthlyTrainingCost.hours.toFixed(2)}h
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <DollarSign className="w-4 h-4 text-purple-600" />
                                    <span className="text-base font-bold text-purple-900">
                                        ${monthlyTrainingCost.amount.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {saveSuccess && (
                        <Alert className="mt-6 border-emerald-200 bg-emerald-50/50 shadow-sm">
                            <CheckCircle className="h-5 w-5 text-emerald-600" />
                            <AlertDescription className="text-emerald-800 font-medium">
                                Gastos fijos guardados exitosamente.
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>

            {selectedPeriod && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="shadow-lg border border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-white">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-semibold text-emerald-800 uppercase tracking-wide flex items-center gap-2">
                                    <DollarSign className="w-4 h-4" />
                                    Ingresos Totales
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-4xl font-bold text-emerald-900 tracking-tight">${profitabilityData.summary.totalIncome.toFixed(2)}</p>
                                <p className="text-xs text-emerald-700 mt-1 font-medium">Base (sin GST)</p>
                                <div className="mt-3 pt-3 border-t border-emerald-200 space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-emerald-700 font-medium">💵 Cash:</span>
                                        <span className="text-sm font-bold text-emerald-900">${(profitabilityData.summary.cashIncome || 0).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-emerald-700 font-medium">📄 Factura:</span>
                                        <span className="text-sm font-bold text-emerald-900">${(profitabilityData.summary.nonCashIncome || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="shadow-lg border border-rose-200/60 bg-gradient-to-br from-rose-50 to-white">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-semibold text-rose-800 uppercase tracking-wide flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    Costo Laboral
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-4xl font-bold text-rose-900 tracking-tight">${profitabilityData.summary.totalLaborCost.toFixed(2)}</p>
                                <p className="text-xs text-rose-700 mt-1 font-medium">Mano de Obra Directa</p>
                                <div className="mt-3 pt-3 border-t border-rose-200 space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-green-700 font-medium">💵 Cash:</span>
                                        <span className="text-sm font-bold text-green-900">${(profitabilityData.summary.cashLaborCost || 0).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-blue-700 font-medium">📄 Factura:</span>
                                        <span className="text-sm font-bold text-blue-900">${(profitabilityData.summary.invoiceLaborCost || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className={`shadow-lg border ${profitabilityData.summary.totalMargin >= 0 ? 'border-blue-200/60 bg-gradient-to-br from-blue-50 to-white' : 'border-orange-200/60 bg-gradient-to-br from-orange-50 to-white'}`}>
                            <CardHeader className="pb-3">
                                <CardTitle className={`text-sm font-semibold uppercase tracking-wide flex items-center gap-2 ${profitabilityData.summary.totalMargin >= 0 ? 'text-blue-800' : 'text-orange-800'}`}>
                                    <BarChart className="w-4 h-4" />
                                    Margen Bruto
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className={`text-4xl font-bold tracking-tight ${profitabilityData.summary.totalMargin >= 0 ? 'text-blue-900' : 'text-orange-900'}`}>
                                    ${profitabilityData.summary.totalMargin.toFixed(2)}
                                </p>
                                <p className={`text-xs mt-1 font-medium ${profitabilityData.summary.totalMargin >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                                    Antes de Gastos Fijos
                                </p>
                                <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-green-700 font-medium">💵 Cash:</span>
                                        <span className="text-sm font-bold text-green-900">${(profitabilityData.summary.cashMargin || 0).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-blue-700 font-medium">📄 Factura:</span>
                                        <span className="text-sm font-bold text-blue-900">${(profitabilityData.summary.invoiceMargin || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="shadow-lg border border-orange-200/60 bg-gradient-to-br from-orange-50 to-white">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-semibold text-orange-800 uppercase tracking-wide flex items-center gap-2">
                                    <PiggyBank className="w-4 h-4" />
                                    Gastos Fijos Totales
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-4xl font-bold text-orange-900 tracking-tight">${(parseFloat(fixedCostInput || 0) + monthlyTrainingCost.amount + monthlyOperationalCosts).toFixed(2)}</p>
                                <p className="text-xs text-orange-700 mt-1 font-medium">
                                    Fijos: ${parseFloat(fixedCostInput || 0).toFixed(2)} + TRN: ${monthlyTrainingCost.amount.toFixed(2)} + OP: ${monthlyOperationalCosts.toFixed(2)}
                                </p>
                                <div className="mt-3 pt-3 border-t border-orange-200 space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-green-700 font-medium">💵 Cash:</span>
                                        <span className="text-sm font-bold text-green-900">${(profitabilityData.summary.cashFixedCosts || 0).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-blue-700 font-medium">📄 Factura:</span>
                                        <span className="text-sm font-bold text-blue-900">${(profitabilityData.summary.invoiceFixedCosts || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className={`shadow-lg border ${profitabilityData.summary.totalRealMargin >= 0 ? 'border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-white' : 'border-rose-200/60 bg-gradient-to-br from-rose-50 to-white'}`}>
                            <CardHeader className="pb-3">
                                <CardTitle className={`text-sm font-semibold uppercase tracking-wide flex items-center gap-2 ${profitabilityData.summary.totalRealMargin >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                                    <Target className="w-4 h-4" />
                                    Margen Neto Real
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className={`text-4xl font-bold tracking-tight ${profitabilityData.summary.totalRealMargin >= 0 ? 'text-emerald-900' : 'text-rose-900'}`}>
                                    ${profitabilityData.summary.totalRealMargin.toFixed(2)}
                                </p>
                                <p className={`text-xs mt-1 font-medium ${profitabilityData.summary.totalRealMargin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                    Después de Gastos Fijos
                                </p>
                                <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-green-700 font-medium">💵 Cash:</span>
                                        <span className="text-sm font-bold text-green-900">${(profitabilityData.summary.cashNetMargin || 0).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-blue-700 font-medium">📄 Factura:</span>
                                        <span className="text-sm font-bold text-blue-900">${(profitabilityData.summary.invoiceNetMargin || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className={`shadow-lg border ${profitabilityData.summary.totalRealProfitPercentage >= 0 ? 'border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-white' : 'border-rose-200/60 bg-gradient-to-br from-rose-50 to-white'}`}>
                            <CardHeader className="pb-3">
                                <CardTitle className={`text-sm font-semibold uppercase tracking-wide flex items-center gap-2 ${profitabilityData.summary.totalRealProfitPercentage >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                                    <TrendingUp className="w-4 h-4"/>
                                    Rentabilidad Real
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-baseline gap-2">
                                    <p className={`text-4xl font-bold tracking-tight ${profitabilityData.summary.totalRealProfitPercentage >= 0 ? 'text-emerald-900' : 'text-rose-900'}`}>
                                        {profitabilityData.summary.totalRealProfitPercentage.toFixed(1)}%
                                    </p>
                                    {profitabilityData.summary.totalRealProfitPercentage >= 0 ? (
                                        <TrendingUp className="w-6 h-6 text-emerald-700" />
                                    ) : (
                                        <TrendingDown className="w-6 h-6 text-rose-700" />
                                    )}
                                </div>
                                <p className={`text-xs mt-1 font-medium ${profitabilityData.summary.totalRealProfitPercentage >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                    Margen sobre Ingresos
                                </p>
                                <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-green-700 font-medium">💵 Cash:</span>
                                        <span className="text-sm font-bold text-green-900">{(profitabilityData.summary.cashProfitability || 0).toFixed(1)}%</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-blue-700 font-medium">📄 Factura:</span>
                                        <span className="text-sm font-bold text-blue-900">{(profitabilityData.summary.invoiceProfitability || 0).toFixed(1)}%</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Gastos Operativos Detallados */}
                    <Card className="shadow-xl border border-orange-200/60 bg-gradient-to-br from-orange-50 to-white">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2 text-orange-900">
                                <Briefcase className="w-5 h-5" />
                                Gastos Operativos Detallados ({format(selectedPeriod.start, 'MMMM yyyy', { locale: es })})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {monthlyOperationalCostsDetails.length > 0 ? (
                                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                    <Table>
                                        <TableHeader className="bg-orange-100">
                                            <TableRow>
                                                <TableHead className="font-bold text-orange-900">Cliente Operativo</TableHead>
                                                <TableHead className="text-center font-bold text-orange-900">Horas</TableHead>
                                                <TableHead className="text-right font-bold text-orange-900">Costo Laboral</TableHead>
                                                <TableHead className="text-right font-bold text-orange-900">Valor/Hora</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {monthlyOperationalCostsDetails.map(data => {
                                                const valuePerHour = data.totalHours > 0 ? data.totalLaborCost / data.totalHours : 0;
                                                return (
                                                    <TableRow key={data.clientId} className="hover:bg-orange-50/50">
                                                        <TableCell className="font-semibold">{data.clientName}</TableCell>
                                                        <TableCell className="text-center text-slate-700">{data.totalHours.toFixed(2)}h</TableCell>
                                                        <TableCell className="text-right text-orange-700 font-bold">${data.totalLaborCost.toFixed(2)}</TableCell>
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
                                            <Clock className="w-4 h-4"/>
                                            Horas
                                            {getSortIcon('totalHours')}
                                        </div>
                                    </TableHead>
                                    <TableHead 
                                        className="text-right cursor-pointer hover:bg-slate-200/50 select-none font-bold text-slate-700"
                                        onClick={() => handleSort('totalIncome')}
                                    >
                                        <div className="flex items-center justify-end gap-2">
                                            Ingresos
                                            {getSortIcon('totalIncome')}
                                        </div>
                                    </TableHead>
                                    <TableHead 
                                        className="text-right cursor-pointer hover:bg-slate-200/50 select-none font-bold text-slate-700"
                                        onClick={() => handleSort('totalLaborCost')}
                                    >
                                        <div className="flex items-center justify-end gap-2">
                                            Costo Laboral
                                            {getSortIcon('totalLaborCost')}
                                        </div>
                                    </TableHead>
                                    <TableHead 
                                        className="text-right cursor-pointer hover:bg-slate-200/50 select-none font-bold text-slate-700"
                                        onClick={() => handleSort('margin')}
                                    >
                                        <div className="flex items-center justify-end gap-2">
                                            Margen Bruto
                                            {getSortIcon('margin')}
                                        </div>
                                    </TableHead>
                                    <TableHead 
                                        className="text-right cursor-pointer hover:bg-slate-200/50 select-none font-bold text-slate-700"
                                        onClick={() => handleSort('distributedFixedCost')}
                                    >
                                        <div className="flex items-center justify-end gap-2">
                                            Gasto Fijo
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
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {profitabilityData.clientAnalysis.map(data => (
                                    <ProfitabilityRow key={data.clientId} data={data} />
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}
        </div>
    );
}