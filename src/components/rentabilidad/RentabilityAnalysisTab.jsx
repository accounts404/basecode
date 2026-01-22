import React, { useState, useEffect, useMemo } from 'react';
import { FixedCost } from '@/entities/FixedCost';
import { format, startOfMonth, endOfMonth, endOfDay, subMonths, addMonths } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, DollarSign, Users, Briefcase, Activity, Calendar, PiggyBank, BarChart, Target, Save, CheckCircle, Clock, GraduationCap, Search, Send, X, History, Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';
import { Client } from '@/entities/Client';
import { User } from '@/entities/User';
import { calculateTotalIncomeFromBreakdown, mergeRevenueBreakdowns } from '@/components/utils/priceCalculations';
import { getPriceForSchedule, calculateGST, isDateInRange, extractDateOnly } from '@/components/utils/priceCalculations';

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
    const [filterMode, setFilterMode] = useState('month'); // 'month' o 'range'
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [rangeStartDate, setRangeStartDate] = useState(new Date('2025-04-01T00:00:00Z'));
    const [rangeEndDate, setRangeEndDate] = useState(new Date());
    const [selectedPeriod, setSelectedPeriod] = useState(null);
    const [fixedCostInput, setFixedCostInput] = useState(0);
    const [savedFixedCosts, setSavedFixedCosts] = useState(0);
    const [savingFixedCosts, setSavingFixedCosts] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [monthOptions] = useState(generateMonthOptions());
    const [monthlyProcessedClientAnalysis, setMonthlyProcessedClientAnalysis] = useState([]);
    const [monthlyTrainingCost, setMonthlyTrainingCost] = useState({ hours: 0, amount: 0 });
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [hideSentClients, setHideSentClients] = useState(false);
    const [sendModalOpen, setSendModalOpen] = useState(false);
    const [selectedClientForSend, setSelectedClientForSend] = useState(null);
    const [sendDate, setSendDate] = useState(new Date());
    const [sendNotes, setSendNotes] = useState('');
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [selectedClientForHistory, setSelectedClientForHistory] = useState(null);

    useEffect(() => {
        if (clients.length > 0) {
            if (filterMode === 'month' && selectedMonth) {
                loadMonthData(selectedMonth);
            } else if (filterMode === 'range' && rangeStartDate && rangeEndDate) {
                loadRangeData(rangeStartDate, rangeEndDate);
            }
        }
    }, [filterMode, selectedMonth, rangeStartDate, rangeEndDate, clients, allWorkEntries, allSchedules, allFixedCosts]);

    const loadRangeData = async (startDate, endDate) => {
        setError('');
        try {
            const periodStart = startDate;
            const periodEnd = endOfDay(endDate);
            setSelectedPeriod({ start: periodStart, end: periodEnd });

            // Calcular gastos fijos para el rango
            const startPeriod = format(startDate, 'yyyy-MM');
            const endPeriod = format(endDate, 'yyyy-MM');
            const periodMonths = [];
            let currentDate = new Date(startPeriod + '-01');
            while (format(currentDate, 'yyyy-MM') <= endPeriod) {
                periodMonths.push(format(currentDate, 'yyyy-MM'));
                currentDate = addMonths(currentDate, 1);
            }

            const relevantFixedCosts = allFixedCosts.filter(fc => periodMonths.includes(fc.period));
            const totalRangeFixedCosts = relevantFixedCosts.reduce((sum, fc) => sum + (fc.amount || 0), 0);
            setFixedCostInput(totalRangeFixedCosts);
            setSavedFixedCosts(totalRangeFixedCosts);

            processData(periodStart, periodEnd);
        } catch (err) {
            console.error("Error loading range data:", err);
            setError("Error al cargar los datos del rango.");
        }
    };

    const loadMonthData = async (monthValue) => {
        setError('');
        try {
            const [year, month] = monthValue.split('-');
            const monthStart = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
            const monthEnd = endOfMonth(new Date(parseInt(year), parseInt(month) - 1));
            setSelectedPeriod({ start: monthStart, end: monthEnd });

            const fixedCostsForMonth = allFixedCosts.filter(fc => fc.period === monthValue);
            const currentFixedCostAmount = fixedCostsForMonth && fixedCostsForMonth.length > 0
                ? fixedCostsForMonth[0].amount
                : 0;
            setFixedCostInput(currentFixedCostAmount);
            setSavedFixedCosts(currentFixedCostAmount);

            processData(monthStart, monthEnd);
        } catch (err) {
            console.error("Error loading month data:", err);
            setError("Error al cargar los datos del mes.");
        }
    };

    const processData = (periodStart, periodEnd) => {
        try {

            const clientMap = new Map(clients.map(c => [c.id, c]));
            const clientData = {};

            const periodSchedules = allSchedules.filter(s => 
                isDateInRange(s.start_time, periodStart, periodEnd) &&
                s.xero_invoiced
            );

            periodSchedules.forEach(schedule => {
                if (schedule.client_id === trainingClientId) return;

                const client = clientMap.get(schedule.client_id);
                if (!client) return;

                const clientId = client.id;
                if (!clientData[clientId]) {
                    clientData[clientId] = {
                        clientId: clientId,
                        clientName: client.name,
                        totalIncome: 0,
                        totalLaborCost: 0,
                        totalHours: 0,
                        serviceCount: 0,
                        revenueBreakdown: {},
                        currentServicePrice: client.current_service_price || 0,
                        gstType: client.gst_type || 'inclusive',
                    };
                }

                const priceData = getPriceForSchedule(schedule, client);
                const { base: netIncome } = calculateGST(priceData.rawAmount, priceData.gstType);
                
                const gstFactor = priceData.rawAmount > 0 ? (netIncome / priceData.rawAmount) : 1;
                
                let netBreakdownForSchedule = {};
                for (const type in priceData.breakdown) {
                    netBreakdownForSchedule[type] = priceData.breakdown[type] * gstFactor;
                }

                clientData[clientId].revenueBreakdown = mergeRevenueBreakdowns(clientData[clientId].revenueBreakdown, netBreakdownForSchedule);
                clientData[clientId].totalIncome += calculateTotalIncomeFromBreakdown(netBreakdownForSchedule);
                clientData[clientId].serviceCount += 1;
            });

            let trainingHours = 0;
            let trainingAmount = 0;
            allWorkEntries.forEach(entry => {
                if (entry.client_id === trainingClientId && 
                    isDateInRange(entry.work_date, periodStart, periodEnd)) {
                    trainingHours += entry.hours || 0;
                    trainingAmount += entry.total_amount || 0;
                }
            });
            setMonthlyTrainingCost({ hours: trainingHours, amount: trainingAmount });

            const periodWorkEntries = allWorkEntries.filter(e => 
                isDateInRange(e.work_date, periodStart, periodEnd) &&
                e.activity !== 'training'
            );

            periodWorkEntries.forEach(entry => {
                const clientId = entry.client_id;
                
                if (clientId === trainingClientId) return;

                if (!clientData[clientId]) {
                    const client = clientMap.get(clientId);
                    if (client) {
                        clientData[clientId] = {
                            clientId: clientId,
                            clientName: client.name,
                            totalIncome: 0,
                            revenueBreakdown: {},
                            totalLaborCost: 0,
                            totalHours: 0,
                            serviceCount: 0,
                            currentServicePrice: client.current_service_price || 0,
                            gstType: client.gst_type || 'inclusive',
                        };
                    }
                }
                
                if (clientData[clientId]) {
                    clientData[clientId].totalLaborCost += entry.total_amount || 0;
                    clientData[clientId].totalHours += entry.hours || 0;
                }
            });

            const periodOperationalCost = Object.values(clientData)
                .filter(c => {
                    const client = clientMap.get(c.clientId);
                    return client?.client_type === 'operational_cost';
                })
                .reduce((sum, c) => sum + c.totalLaborCost, 0);

            const totalFixedCostsWithTraining = (filterMode === 'month' ? savedFixedCosts : fixedCostInput) + trainingAmount + periodOperationalCost;

            const totalPeriodHours = Object.values(clientData)
                .filter(c => {
                    const client = clientMap.get(c.clientId);
                    return client?.client_type !== 'operational_cost';
                })
                .reduce((sum, c) => sum + c.totalHours, 0);

            const profitData = Object.values(clientData).map(data => {
                const client = clientMap.get(data.clientId);
                const isCash = client?.payment_method === 'cash';
                
                const incomePerHour = data.totalHours > 0 ? data.totalIncome / data.totalHours : 0;
                const laborCostPerHour = data.totalHours > 0 ? data.totalLaborCost / data.totalHours : 0;
                const margin = data.totalIncome - data.totalLaborCost;
                const marginPerHour = data.totalHours > 0 ? margin / data.totalHours : 0;

                const clientHourShare = totalPeriodHours > 0 ? data.totalHours / totalPeriodHours : 0;
                const distributedFixedCost = totalFixedCostsWithTraining * clientHourShare;
                const fixedCostPerHour = data.totalHours > 0 ? distributedFixedCost / data.totalHours : 0;
                const realMargin = margin - distributedFixedCost;
                const realMarginPerHour = data.totalHours > 0 ? realMargin / data.totalHours : 0;
                const realProfitPercentage = data.totalIncome > 0 ? (realMargin / data.totalIncome) * 100 : (realMargin < 0 ? -100 : 0);
                const totalCostPerHour = laborCostPerHour + fixedCostPerHour;

                return {
                    ...data,
                    isCash,
                    margin,
                    profitPercentage: data.totalIncome > 0 ? (margin / data.totalIncome) * 100 : 0,
                    distributedFixedCost,
                    realMargin,
                    realProfitPercentage,
                    incomePerHour,
                    laborCostPerHour,
                    marginPerHour,
                    fixedCostPerHour,
                    realMarginPerHour,
                    totalCostPerHour
                };
            }).filter(data => {
                const client = clientMap.get(data.clientId);
                return client?.client_type !== 'operational_cost' && (data.totalHours > 0 || data.totalIncome > 0);
            });

            setMonthlyProcessedClientAnalysis(profitData);

        } catch (err) {
            console.error("Error processing data:", err);
            setError("Error al procesar los datos.");
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

        let filteredClientAnalysis = monthlyProcessedClientAnalysis;

        // Aplicar filtro de búsqueda
        if (searchTerm.trim()) {
            filteredClientAnalysis = filteredClientAnalysis.filter(client => 
                client.clientName.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        const sortedClientAnalysis = [...filteredClientAnalysis].sort((a, b) => {
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

        return { clientAnalysis: sortedClientAnalysis, summary, overallTotalFixedCosts: parseFloat(fixedCostInput || 0) };

    }, [selectedPeriod, monthlyProcessedClientAnalysis, sortColumn, sortDirection, fixedCostInput, monthlyTrainingCost, monthlyOperationalCosts, searchTerm]);

    const handleSaveFixedCosts = async () => {
        if (filterMode !== 'month' || !selectedMonth) return;
        
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
            const currentUser = await User.me();
            
            await Client.update(client.id, {
                current_price_increase_sent_date: sendDate.toISOString(),
                current_price_increase_notes: sendNotes,
                price_increase_notifications: [
                    ...currentHistory,
                    {
                        sent_date: sendDate.toISOString(),
                        notes: sendNotes,
                        sent_by_admin: currentUser?.id || 'unknown'
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
            <Card className="shadow-xl border border-slate-200/60 bg-white/80 backdrop-blur-sm">
                <CardContent className="p-8">
                    <div className="mb-6">
                        <Label className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3 block">
                            Modo de Filtro
                        </Label>
                        <div className="flex gap-3">
                            <Button
                                variant={filterMode === 'month' ? 'default' : 'outline'}
                                onClick={() => setFilterMode('month')}
                                className="flex-1"
                            >
                                <Calendar className="w-4 h-4 mr-2" />
                                Mes Único
                            </Button>
                            <Button
                                variant={filterMode === 'range' ? 'default' : 'outline'}
                                onClick={() => setFilterMode('range')}
                                className="flex-1"
                            >
                                <Calendar className="w-4 h-4 mr-2" />
                                Rango de Fechas
                            </Button>
                        </div>
                    </div>

                    {filterMode === 'month' ? (
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
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
                            <div className="space-y-3">
                                <Label className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-green-600" />
                                    Fecha Inicial
                                </Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="h-12 px-4 justify-start text-left font-medium border-slate-300 hover:border-green-600 hover:bg-slate-50 w-full"
                                        >
                                            <Calendar className="mr-3 h-5 w-5 text-green-600" />
                                            {format(rangeStartDate, 'd MMMM yyyy', { locale: es })}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <CalendarComponent
                                            mode="single"
                                            selected={rangeStartDate}
                                            onSelect={(date) => date && setRangeStartDate(date)}
                                            disabled={(date) => {
                                                const minDate = new Date('2025-04-01');
                                                if (date < minDate) return true;
                                                if (date > new Date()) return true;
                                                if (date > rangeEndDate) return true;
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

                            <div className="space-y-3">
                                <Label className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-blue-600" />
                                    Fecha Final
                                </Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="h-12 px-4 justify-start text-left font-medium border-slate-300 hover:border-blue-600 hover:bg-slate-50 w-full"
                                        >
                                            <Calendar className="mr-3 h-5 w-5 text-blue-600" />
                                            {format(rangeEndDate, 'd MMMM yyyy', { locale: es })}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <CalendarComponent
                                            mode="single"
                                            selected={rangeEndDate}
                                            onSelect={(date) => date && setRangeEndDate(date)}
                                            disabled={(date) => {
                                                if (date < rangeStartDate) return true;
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

                            <div className="space-y-3">
                                <Label className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                                    <PiggyBank className="w-4 h-4 text-orange-600" />
                                    Gastos Fijos del Rango
                                </Label>
                                <div className="h-12 bg-orange-50 border-2 border-orange-200 rounded-lg px-4 flex items-center justify-between">
                                    <span className="text-xs text-orange-700 font-medium">Total acumulado:</span>
                                    <div className="flex items-center gap-2">
                                        <DollarSign className="w-4 h-4 text-orange-600" />
                                        <span className="text-base font-bold text-orange-900">
                                            ${fixedCostInput.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    
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

                    {/* Buscador y Filtros */}
                    <Card className="shadow-md border border-slate-200/60 bg-white/80 backdrop-blur-sm">
                        <CardContent className="p-6 space-y-4">
                            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
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
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input
                                    type="text"
                                    placeholder="Buscar cliente..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-12 h-12 text-base border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Gastos Operativos Detallados */}
                    <Card className="shadow-xl border border-orange-200/60 bg-gradient-to-br from-orange-50 to-white">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2 text-orange-900">
                                <Briefcase className="w-5 h-5" />
                                Gastos Operativos Detallados ({format(selectedPeriod.start, 'd MMM yyyy', { locale: es })} - {format(selectedPeriod.end, 'd MMM yyyy', { locale: es })})
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

                    <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
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
                                {profitabilityData.clientAnalysis
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
                                    <TableCell colSpan="2" className="text-right text-xl py-5">TOTAL</TableCell>
                                    <TableCell className="text-center text-xl">{profitabilityData.summary.totalHours.toFixed(2)}h</TableCell>
                                    <TableCell className="text-right text-xl text-blue-800 bg-blue-50">
                                        ${(profitabilityData.summary.totalHours > 0 ? profitabilityData.summary.totalIncome / profitabilityData.summary.totalHours : 0).toFixed(2)}/h
                                    </TableCell>
                                    <TableCell className="text-right text-xl text-orange-800 bg-orange-50">
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <div className="cursor-help">
                                                        ${(profitabilityData.summary.totalHours > 0 ? (profitabilityData.summary.totalLaborCost + (profitabilityData.overallTotalFixedCosts + monthlyTrainingCost.amount + monthlyOperationalCosts)) / profitabilityData.summary.totalHours : 0).toFixed(2)}/h
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent className="bg-slate-900 text-white p-3">
                                                    <div className="space-y-1">
                                                        <p className="text-sm font-semibold">Desglose promedio por hora:</p>
                                                        <p className="text-xs">
                                                            Mano de obra: ${(profitabilityData.summary.totalHours > 0 ? profitabilityData.summary.totalLaborCost / profitabilityData.summary.totalHours : 0).toFixed(2)}/h
                                                        </p>
                                                        <p className="text-xs">
                                                            Gastos fijos: ${(profitabilityData.summary.totalHours > 0 ? (profitabilityData.overallTotalFixedCosts + monthlyTrainingCost.amount + monthlyOperationalCosts) / profitabilityData.summary.totalHours : 0).toFixed(2)}/h
                                                        </p>
                                                        <p className="text-xs border-t border-slate-600 pt-1 mt-1 font-semibold">
                                                            Total: ${(profitabilityData.summary.totalHours > 0 ? (profitabilityData.summary.totalLaborCost + (profitabilityData.overallTotalFixedCosts + monthlyTrainingCost.amount + monthlyOperationalCosts)) / profitabilityData.summary.totalHours : 0).toFixed(2)}/h
                                                        </p>
                                                    </div>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </TableCell>
                                    <TableCell className="text-right text-xl text-emerald-800">${profitabilityData.summary.totalIncome.toFixed(2)}</TableCell>
                                    <TableCell className="text-right text-xl text-rose-800">${profitabilityData.summary.totalLaborCost.toFixed(2)}</TableCell>
                                    <TableCell className={`text-right text-xl ${profitabilityData.summary.totalMargin > 0 ? 'text-blue-800' : 'text-orange-800'}`}>${profitabilityData.summary.totalMargin.toFixed(2)}</TableCell>
                                    <TableCell className="text-right text-xl text-slate-700">(${(parseFloat(fixedCostInput || 0) + monthlyTrainingCost.amount + monthlyOperationalCosts).toFixed(2)})</TableCell>
                                    <TableCell className={`text-right text-xl ${profitabilityData.summary.totalRealMargin > 0 ? 'text-emerald-800' : 'text-rose-800'}`}>${profitabilityData.summary.totalRealMargin.toFixed(2)}</TableCell>
                                    <TableCell className={`text-right text-xl ${profitabilityData.summary.totalRealProfitPercentage > 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                                        <div className="flex items-center justify-end gap-2">
                                            {profitabilityData.summary.totalRealProfitPercentage > 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                                            {profitabilityData.summary.totalRealProfitPercentage.toFixed(1)}%
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center bg-yellow-50"></TableCell>
                                </TableRow>
                            </tfoot>
                        </Table>
                    </div>

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
                </>
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