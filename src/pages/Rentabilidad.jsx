import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Client } from '@/entities/Client';
import { WorkEntry } from '@/entities/WorkEntry';
import { FixedCost } from '@/entities/FixedCost';
import { PricingThreshold } from '@/entities/PricingThreshold';
import { Schedule } from '@/entities/Schedule';
import { User } from '@/entities/User';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfMonth, endOfMonth, subMonths, addMonths, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, DollarSign, Users, Briefcase, Activity, Calendar, PiggyBank, BarChart, Target, Save, CheckCircle, Clock, X, Search, Settings, ArrowRightSquare, Clock9, GraduationCap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

import ThresholdManager from '../components/rentabilidad/ThresholdManager';
import PricingAnalysisTable from '../components/rentabilidad/PricingAnalysisTable';

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

// Excluir agosto y septiembre de 2025 de análisis acumulados
const isExcludedMonth = (dateString) => {
  if (!dateString) return false;
  const date = extractDateOnly(dateString);
  return date.startsWith('2025-08') || date.startsWith('2025-09');
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

// CRÍTICO: Función que respeta snapshots inmutables y price_history
const getPriceForSchedule = (schedule, client) => {
    // PRIORIDAD 1: Si tiene reconciliation_items, usar esos
    if (schedule.reconciliation_items && schedule.reconciliation_items.length > 0) {
        let tempRawBreakdown = {};
        let totalRawReconciledAmount = 0;

        schedule.reconciliation_items.forEach(item => {
            const type = item.type || 'other_extra';
            const amount = parseFloat(item.amount) || 0;
            tempRawBreakdown[type] = (tempRawBreakdown[type] || 0) + amount;
            if (type !== 'discount') {
                totalRawReconciledAmount += amount;
            }
        });
        
        return { 
            rawAmount: totalRawReconciledAmount, 
            breakdown: tempRawBreakdown,
            gstType: schedule.billed_gst_type_snapshot || client?.gst_type || 'inclusive'
        };
    }
    
    // PRIORIDAD 2: Si está facturado con snapshot (INMUTABLE)
    if (schedule.xero_invoiced && schedule.billed_price_snapshot !== undefined && schedule.billed_price_snapshot !== null) {
        return {
            rawAmount: schedule.billed_price_snapshot,
            breakdown: { base_service: schedule.billed_price_snapshot },
            gstType: schedule.billed_gst_type_snapshot || 'inclusive'
        };
    }
    
    // PRIORIDAD 3: Precio vigente en fecha del servicio
    if (client) {
        const serviceDate = schedule.start_time;
        if (!client.price_history || client.price_history.length === 0) {
            return {
                rawAmount: client.current_service_price || 0,
                breakdown: { base_service: client.current_service_price || 0 },
                gstType: client.gst_type || 'inclusive'
            };
        }
        
        const serviceDateStr = format(parseISO(serviceDate), 'yyyy-MM-dd');
        const sortedHistory = [...client.price_history].sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
        
        for (const historyEntry of sortedHistory) {
            if (historyEntry.effective_date <= serviceDateStr) {
                return {
                    rawAmount: historyEntry.new_price || client.current_service_price || 0,
                    breakdown: { base_service: historyEntry.new_price || client.current_service_price || 0 },
                    gstType: historyEntry.gst_type || client.gst_type || 'inclusive'
                };
            }
        }
        
        const oldestEntry = sortedHistory[sortedHistory.length - 1];
        if (oldestEntry) {
            return {
                rawAmount: oldestEntry.previous_price || oldestEntry.new_price || client.current_service_price || 0,
                breakdown: { base_service: oldestEntry.previous_price || oldestEntry.new_price || client.current_service_price || 0 },
                gstType: oldestEntry.gst_type || client.gst_type || 'inclusive'
            };
        }
    }
    
    return {
        rawAmount: client?.current_service_price || 0,
        breakdown: { base_service: client?.current_service_price || 0 },
        gstType: client?.gst_type || 'inclusive'
    };
};

const frequencyLabels = {
    'weekly': 'Semanal',
    'fortnightly': 'Quincenal',
    'every_3_weeks': 'Cada 3 Semanas',
    'monthly': 'Mensual',
    'one_off': 'Servicio Único'
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

const generateMonthOptions = () => {
    const months = [];
    const currentDate = new Date();
    const startDate = new Date('2025-04-01'); // Abril 2025
    
    let tempDate = currentDate;
    
    // Generar meses desde ahora hacia atrás hasta abril 2025
    while (tempDate >= startDate) {
        months.push({
            value: format(tempDate, 'yyyy-MM'),
            label: format(tempDate, 'MMMM yyyy', { locale: es })
        });
        tempDate = subMonths(tempDate, 1);
    }
    
    return months;
};

const TotalsCard = ({ summary, title }) => {
    const isGrossProfitable = summary.totalMargin > 0;
    const isRealProfitable = summary.totalRealMargin > 0;
    
    const distributedFixedCostsForSummary = Math.abs(summary.totalMargin - summary.totalRealMargin);

    return (
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 mb-6 shadow-2xl">
            <h3 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
                <BarChart className="w-5 h-5" />
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

export default function RentabilidadPage() {
    const [clients, setClients] = useState([]);
    const [allWorkEntries, setAllWorkEntries] = useState([]);
    const [allSchedules, setAllSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedPeriod, setSelectedPeriod] = useState(null);
    const [monthOptions] = useState(generateMonthOptions());
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [fixedCostInput, setFixedCostInput] = useState(0);
    const [allFixedCosts, setAllFixedCosts] = useState([]);
    const [savedFixedCosts, setSavedFixedCosts] = useState(0);
    const [savingFixedCosts, setSavingFixedCosts] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [clientSearchTerm, setClientSearchTerm] = useState("");
    const [sortColumn, setSortColumn] = useState('realMargin');
    const [sortDirection, setSortDirection] = useState('desc');
    const [pricingThresholds, setPricingThresholds] = useState([]);
    const [selectedFrequency, setSelectedFrequency] = useState('all');
    const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);
    const [users, setUsers] = useState([]);
    const [monthlyProcessedClientAnalysis, setMonthlyProcessedClientAnalysis] = useState([]);
    
    const [monthlyTrainingCost, setMonthlyTrainingCost] = useState({ hours: 0, amount: 0 });
    const [cumulativeTrainingCost, setCumulativeTrainingCost] = useState({ hours: 0, amount: 0 });
    const [trainingClientId, setTrainingClientId] = useState(null);

    const cumulativeStartDate = useMemo(() => new Date('2025-04-01T00:00:00Z'), []);

    const frequencyOptions = [
        { value: "all", label: "Todas las Frecuencias" },
        { value: "weekly", label: "Semanal" },
        { value: "fortnightly", label: "Quincenal" },
        { value: "every_3_weeks", label: "Cada 3 semanas" },
        { value: "monthly", label: "Mensual" },
        { value: "one_off", label: "Servicio Único" }
    ];

    const loadAllInitialData = async () => {
        setLoading(true);
        setError('');
        try {
            const [clientsData, workEntriesData, thresholdsData, schedulesData, fixedCostsData, usersData] = await Promise.all([
                Client.list(),
                WorkEntry.list("-work_date"),
                PricingThreshold.list(),
                Schedule.list(),
                FixedCost.list(),
                User.list(),
            ]);
            setClients(clientsData || []);
            setAllWorkEntries(workEntriesData || []);
            setPricingThresholds(thresholdsData || []);
            setAllSchedules(schedulesData || []);
            setAllFixedCosts(fixedCostsData || []);
            setUsers(usersData || []);
            
            const trainingClient = (clientsData || []).find(c => c.name === 'TRAINING' || c.client_type === 'training');
            if (trainingClient) {
                setTrainingClientId(trainingClient.id);
            }
        } catch (err) {
            console.error("Error loading initial data for profitability analysis:", err);
            setError("No se pudieron cargar los datos iniciales. Por favor, recarga la página.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAllInitialData();
    }, []);

    const loadMonthSpecificData = useCallback(async (monthValue) => {
        if (loading || clients.length === 0 || allWorkEntries.length === 0 || allSchedules.length === 0) {
            return;
        }

        setLoading(true);
        setError('');
        try {
            const [year, month] = monthValue.split('-');
            const monthStart = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
            const monthEnd = endOfMonth(new Date(parseInt(year), parseInt(month) - 1));
            setSelectedPeriod({ start: monthStart, end: monthEnd });

            const clientMap = new Map(clients.map(c => [c.id, c]));
            const clientData = {};

            const monthlySchedules = allSchedules.filter(s => 
                isDateInRange(s.start_time, monthStart, monthEnd) &&
                s.xero_invoiced
            );

            monthlySchedules.forEach(schedule => {
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
            const startStr = format(monthStart, 'yyyy-MM-dd');
            const endStr = format(monthEnd, 'yyyy-MM-dd');
            
            allWorkEntries.forEach(entry => {
                if (!entry.work_date) return;
                const dateOnly = entry.work_date.substring(0, 10);
                if (entry.client_id === trainingClientId && 
                    dateOnly >= startStr && dateOnly <= endStr) {
                    trainingHours += entry.hours || 0;
                    trainingAmount += entry.total_amount || 0;
                }
            });
            setMonthlyTrainingCost({ hours: trainingHours, amount: trainingAmount });

            const monthlyWorkEntries = allWorkEntries.filter(e => {
                if (!e.work_date) return false;
                const dateOnly = e.work_date.substring(0, 10);
                const startStr = format(monthStart, 'yyyy-MM-dd');
                const endStr = format(monthEnd, 'yyyy-MM-dd');
                return dateOnly >= startStr && dateOnly <= endStr && e.activity !== 'training' && e.activity !== 'entrenamiento';
            });

            monthlyWorkEntries.forEach(entry => {
                const clientId = entry.client_id;
                
                if (clientId === trainingClientId) {
                    return;
                }

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

            const fixedCostsForMonth = allFixedCosts.filter(fc => fc.period === monthValue);
            const currentFixedCostAmount = fixedCostsForMonth && fixedCostsForMonth.length > 0
                ? fixedCostsForMonth[0].amount
                : 0;
            setFixedCostInput(currentFixedCostAmount);
            setSavedFixedCosts(currentFixedCostAmount);

            const totalFixedCostsWithTraining = currentFixedCostAmount + trainingAmount;

            const totalMonthlyHours = Object.values(clientData).reduce((sum, c) => sum + c.totalHours, 0);

            const profitData = Object.values(clientData).map(data => {
                const incomePerHour = data.totalHours > 0 ? data.totalIncome / data.totalHours : 0;
                const laborCostPerHour = data.totalHours > 0 ? data.totalLaborCost / data.totalHours : 0;
                const margin = data.totalIncome - data.totalLaborCost;
                const marginPerHour = data.totalHours > 0 ? margin / data.totalHours : 0;

                const clientHourShare = totalMonthlyHours > 0 ? data.totalHours / totalMonthlyHours : 0;
                const distributedFixedCost = totalFixedCostsWithTraining * clientHourShare;
                const fixedCostPerHour = data.totalHours > 0 ? distributedFixedCost / data.totalHours : 0;
                const realMargin = margin - distributedFixedCost;
                const realMarginPerHour = data.totalHours > 0 ? realMargin / data.totalHours : 0;
                const realProfitPercentage = data.totalIncome > 0 ? (realMargin / data.totalIncome) * 100 : (realMargin < 0 ? -100 : 0);

                return {
                    ...data,
                    margin,
                    profitPercentage: data.totalIncome > 0 ? (margin / data.totalIncome) * 100 : 0,
                    distributedFixedCost,
                    realMargin,
                    realProfitPercentage,
                    incomePerHour,
                    laborCostPerHour,
                    marginPerHour,
                    fixedCostPerHour,
                    realMarginPerHour
                };
            }).filter(data => data.totalHours > 0 || data.totalIncome > 0);

            setMonthlyProcessedClientAnalysis(profitData);

        } catch (err) {
            console.error("Error loading month specific data:", err);
            setError("Error al cargar los datos del mes seleccionado. Por favor, intenta de nuevo.");
        } finally {
            setLoading(false);
        }
    }, [allSchedules, allWorkEntries, allFixedCosts, clients, trainingClientId, loading]);

    useEffect(() => {
        if (!loading && selectedMonth) {
            loadMonthSpecificData(selectedMonth);
        }
    }, [selectedMonth, loading, loadMonthSpecificData]);

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
            
            const updatedAllFixedCosts = await FixedCost.list();
            setAllFixedCosts(updatedAllFixedCosts);

            setSavedFixedCosts(parseFloat(fixedCostInput) || 0);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);

            if (!loading && selectedMonth) {
                loadMonthSpecificData(selectedMonth);
            }

        } catch (err) {
            console.error("Error saving fixed costs:", err);
            setError("Error al guardar los gastos fijos. Por favor, intenta de nuevo.");
        }
        
        setSavingFixedCosts(false);
    };

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

        const filteredClientAnalysis = sortedClientAnalysis.filter(data => {
            if (!clientSearchTerm.trim()) return true;
            return data.clientName.toLowerCase().includes(clientSearchTerm.toLowerCase());
        });
        
        const summary = filteredClientAnalysis.reduce((acc, client) => {
            acc.totalIncome += client.totalIncome;
            acc.totalLaborCost += client.totalLaborCost;
            acc.totalMargin += client.margin;
            acc.totalHours += client.totalHours;
            acc.totalRealMargin += client.realMargin;
            return acc;
        }, { totalIncome: 0, totalLaborCost: 0, totalMargin: 0, totalHours: 0, totalRealMargin: 0 });

        const totalRealProfitPercentage = summary.totalIncome > 0 ? (summary.totalRealMargin / summary.totalIncome) * 100 : 0;
        summary.totalRealProfitPercentage = totalRealProfitPercentage;

        return { clientAnalysis: filteredClientAnalysis, summary };

    }, [selectedPeriod, monthlyProcessedClientAnalysis, clientSearchTerm, sortColumn, sortDirection]);

    const cumulativeProfitabilityData = useMemo(() => {
        if (clients.length === 0 || allWorkEntries.length === 0 || allSchedules.length === 0) {
            return { clientAnalysis: [], summary: { totalIncome: 0, totalLaborCost: 0, totalMargin: 0, totalRealMargin: 0, totalHours: 0, totalRealProfitPercentage: 0 }, overallTotalFixedCosts: 0 };
        }

        const activeClients = clients.filter(c => c.active !== false && c.id !== trainingClientId);
        const clientMap = new Map(activeClients.map(c => [c.id, c]));

        const cumulativeIncomeDetailMap = new Map();
        const invoicedSchedulesCumulative = allSchedules.filter(schedule => {
            return isDateInRange(schedule.start_time, cumulativeStartDate, new Date()) && 
                   !isExcludedMonth(schedule.start_time) &&
                   schedule.xero_invoiced === true &&
                   schedule.client_id !== trainingClientId &&
                   clientMap.has(schedule.client_id);
        });

        invoicedSchedulesCumulative.forEach(schedule => {
            const client = clientMap.get(schedule.client_id);
            if (!client) return;

            const clientId = client.id;
            let currentClientCumulativeBreakdown = cumulativeIncomeDetailMap.get(clientId) || {};

            const priceData = getPriceForSchedule(schedule, client);
            const { base: netIncome } = calculateGST(priceData.rawAmount, priceData.gstType);
            
            const gstFactor = priceData.rawAmount > 0 ? (netIncome / priceData.rawAmount) : 1;
            
            let netBreakdownForService = {};
            for (const type in priceData.breakdown) {
                netBreakdownForService[type] = priceData.breakdown[type] * gstFactor;
            }
            
            cumulativeIncomeDetailMap.set(clientId, mergeRevenueBreakdowns(currentClientCumulativeBreakdown, netBreakdownForService));
        });

        let cumulativeTrainingHours = 0;
        let cumulativeTrainingAmount = 0;
        const cumulativeStartStr = format(cumulativeStartDate, 'yyyy-MM-dd');
        const cumulativeEndStr = format(new Date(), 'yyyy-MM-dd');
        
        allWorkEntries.forEach(entry => {
            if (!entry.work_date) return;
            const dateOnly = entry.work_date.substring(0, 10);
            const monthKey = dateOnly.substring(0, 7);
            
            if (entry.client_id === trainingClientId && 
                dateOnly >= cumulativeStartStr && 
                dateOnly <= cumulativeEndStr &&
                !isExcludedMonth(monthKey)) {
                cumulativeTrainingHours += entry.hours || 0;
                cumulativeTrainingAmount += entry.total_amount || 0;
            }
        });
        setCumulativeTrainingCost({ hours: cumulativeTrainingHours, amount: cumulativeTrainingAmount });

        const cumulativeStartStr = format(cumulativeStartDate, 'yyyy-MM-dd');
        const cumulativeEndStr = format(new Date(), 'yyyy-MM-dd');
        
        const cumulativeWorkEntries = allWorkEntries.filter(entry => {
            if (!entry.work_date) return false;
            const dateOnly = entry.work_date.substring(0, 10);
            const monthKey = dateOnly.substring(0, 7);
            
            return dateOnly >= cumulativeStartStr && 
                   dateOnly <= cumulativeEndStr && 
                   !isExcludedMonth(monthKey) &&
                   entry.client_id !== trainingClientId &&
                   clientMap.has(entry.client_id) &&
                   entry.activity !== 'training' &&
                   entry.activity !== 'entrenamiento';
        });

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
                    currentServicePrice: client.current_service_price || 0,
                    gstType: client.gst_type || 'inclusive',
                };
            }
            acc[client.id].totalLaborCost += entry.total_amount || 0;
            acc[client.id].totalHours += entry.hours || 0;
            return acc;
        }, {});

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
                        currentServicePrice: client.current_service_price || 0,
                        gstType: client.gst_type || 'inclusive',
                    };
                }
            }
        });

        const startPeriod = format(cumulativeStartDate, 'yyyy-MM');
        const endPeriod = format(new Date(), 'yyyy-MM');
        const periodMonths = [];
        let currentDate = new Date(startPeriod + '-01');
        while (format(currentDate, 'yyyy-MM') <= endPeriod) {
            const monthKey = format(currentDate, 'yyyy-MM');
            // Excluir agosto y septiembre 2025
            if (monthKey !== '2025-08' && monthKey !== '2025-09') {
                periodMonths.push(monthKey);
            }
            currentDate = addMonths(currentDate, 1);
        }

        const relevantFixedCosts = allFixedCosts.filter(fc => periodMonths.includes(fc.period));
        const totalCumulativeFixedCosts = relevantFixedCosts.reduce((sum, fc) => sum + (fc.amount || 0), 0);

        const totalFixedCostsWithTraining = totalCumulativeFixedCosts + cumulativeTrainingAmount;

        const overallCumulativeTotalHours = Object.values(cumulativeClientProfitability).reduce((sum, entry) => sum + (entry.totalHours || 0), 0);

        const cumulativeFixedCostPerHourOverall = overallCumulativeTotalHours > 0 ? 
            totalFixedCostsWithTraining / overallCumulativeTotalHours : 0;

        const cumulativeClientAnalysis = Object.values(cumulativeClientProfitability).map(data => {
            const margin = data.totalIncome - data.totalLaborCost;
            const profitPercentage = data.totalIncome > 0 ? (margin / data.totalIncome) * 100 : 0;
            
            const distributedFixedCost = data.totalHours * cumulativeFixedCostPerHourOverall;
            const realMargin = margin - distributedFixedCost;
            const realProfitPercentage = data.totalIncome > 0 ? (realMargin / data.totalIncome) * 100 : (realMargin < 0 ? -100 : 0);

            const incomePerHour = data.totalHours > 0 ? data.totalIncome / data.totalHours : 0;
            const laborCostPerHour = data.totalHours > 0 ? data.totalLaborCost / data.totalHours : 0;
            const marginPerHour = data.totalHours > 0 ? margin / data.totalHours : 0;
            const fixedCostPerHour = data.totalHours > 0 ? distributedFixedCost / data.totalHours : 0;
            const realMarginPerHour = data.totalHours > 0 ? realMargin / data.totalHours : 0;

            return {
                ...data,
                margin,
                profitPercentage,
                distributedFixedCost,
                realMargin,
                realProfitPercentage,
                incomePerHour,
                laborCostPerHour,
                marginPerHour,
                fixedCostPerHour,
                realMarginPerHour
            };
        }).filter(data => data.totalHours > 0 || data.totalIncome > 0);

        const sortedCumulativeAnalysis = [...cumulativeClientAnalysis].sort((a, b) => {
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

        const filteredCumulativeAnalysis = sortedCumulativeAnalysis.filter(data => {
            if (!clientSearchTerm.trim()) return true;
            return data.clientName.toLowerCase().includes(clientSearchTerm.toLowerCase());
        });

        const cumulativeSummary = filteredCumulativeAnalysis.reduce((acc, client) => {
            acc.totalIncome += client.totalIncome;
            acc.totalLaborCost += client.totalLaborCost;
            acc.totalMargin += client.margin;
            acc.totalHours += client.totalHours;
            acc.totalRealMargin += client.realMargin;
            return acc;
        }, { totalIncome: 0, totalLaborCost: 0, totalMargin: 0, totalRealMargin: 0, totalHours: 0 });

        const cumulativeTotalRealProfitPercentage = cumulativeSummary.totalIncome > 0 ? (cumulativeSummary.totalRealMargin / cumulativeSummary.totalIncome) * 100 : 0;
        cumulativeSummary.totalRealProfitPercentage = cumulativeTotalRealProfitPercentage;

        return { 
            clientAnalysis: filteredCumulativeAnalysis, 
            summary: cumulativeSummary, 
            overallTotalFixedCosts: totalCumulativeFixedCosts 
        };
    }, [clients, allWorkEntries, allSchedules, allFixedCosts, cumulativeStartDate, trainingClientId, clientSearchTerm, sortColumn, sortDirection]);

    if (loading) return <div className="p-8 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div></div>;
    if (error) return <div className="p-8 text-red-700 text-center font-medium">{error}</div>;

    const clearSearch = () => {
        setClientSearchTerm("");
    };

    const handleThresholdsSaved = () => {
        setIsThresholdModalOpen(false);
        loadAllInitialData();
    };

    const clientsForPricingAnalysis = clients.filter(c => c.id !== trainingClientId);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 md:p-10">
            <div className="max-w-[1920px] mx-auto">
                <div className="mb-10">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="p-3 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-lg">
                            <Activity className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Análisis de Rentabilidad</h1>
                            <p className="text-slate-600 mt-1 text-lg font-light">Evaluación financiera detallada por cliente y período</p>
                        </div>
                    </div>
                </div>

                <Card className="mb-8 shadow-xl border border-slate-200/60 bg-white/80 backdrop-blur-sm">
                  <CardContent className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-end">
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

                        <Dialog open={isThresholdModalOpen} onOpenChange={setIsThresholdModalOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="h-12 shadow-md border-slate-300 hover:bg-slate-50 hover:border-blue-600 font-medium">
                                    <Settings className="mr-2 h-5 w-5" />
                                    Configurar Umbrales
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[700px]">
                                <DialogHeader>
                                    <DialogTitle className="text-2xl font-bold">Umbrales de Precios Mínimos</DialogTitle>
                                </DialogHeader>
                                <ThresholdManager 
                                    initialThresholds={pricingThresholds}
                                    onSave={handleThresholdsSaved}
                                />
                            </DialogContent>
                        </Dialog>
                    </div>
                    
                    {saveSuccess && (
                        <Alert className="mt-6 border-emerald-200 bg-emerald-50/50 shadow-sm">
                            <CheckCircle className="h-5 w-5 text-emerald-600" />
                            <AlertDescription className="text-emerald-800 font-medium">
                                Gastos fijos guardados exitosamente para {format(selectedPeriod?.start || new Date(), 'MMMM yyyy', { locale: es })}.
                            </AlertDescription>
                        </Alert>
                    )}
                  </CardContent>
                </Card>
                
                {selectedPeriod ? (
                    <div className="space-y-8">
                        <Card className="shadow-xl border border-slate-200/60 bg-white/80 backdrop-blur-sm">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-5">
                                    <Search className="w-6 h-6 text-blue-600 flex-shrink-0" />
                                    <Label className="text-sm font-semibold text-slate-700 uppercase tracking-wide whitespace-nowrap">
                                        Buscar Cliente:
                                    </Label>
                                    <div className="flex-1 relative">
                                        <Input
                                            placeholder="Buscar cliente por nombre..."
                                            value={clientSearchTerm}
                                            onChange={(e) => setClientSearchTerm(e.target.value)}
                                            className="h-12 text-base pl-5 pr-12 border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                                        />
                                        {clientSearchTerm && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={clearSearch}
                                                className="absolute right-2 top-2 h-8 w-8 p-0 hover:bg-slate-100 rounded-lg"
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                    {clientSearchTerm && (
                                        <div className="flex items-center gap-2 text-sm bg-blue-50 px-4 py-3 rounded-lg border border-blue-200">
                                            <Search className="w-4 h-4 text-blue-700" />
                                            <span className="font-semibold text-blue-900">
                                                {profitabilityData.clientAnalysis.length} resultado{profitabilityData.clientAnalysis.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

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
                                    <p className="text-4xl font-bold text-orange-900 tracking-tight">${(parseFloat(fixedCostInput || 0) + monthlyTrainingCost.amount).toFixed(2)}</p>
                                    <p className="text-xs text-orange-700 mt-1 font-medium">
                                        Fijos: ${parseFloat(fixedCostInput || 0).toFixed(2)} + TRN: ${monthlyTrainingCost.amount.toFixed(2)}
                                    </p>
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
                                </CardContent>
                            </Card>
                        </div>
                        
                        <Accordion type="multiple" defaultValue={["item-1", "item-2", "item-3"]} className="w-full space-y-6">
                            <AccordionItem value="item-1" className="bg-white border border-slate-200/60 rounded-2xl shadow-lg overflow-hidden">
                                <AccordionTrigger className="px-8 py-6 text-lg font-bold hover:no-underline hover:bg-slate-50/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <Briefcase className="w-6 h-6 text-slate-700"/>
                                        <span className="text-slate-900">
                                            Rentabilidad Detallada por Cliente - {format(selectedPeriod.start, 'MMMM yyyy', { locale: es })}
                                            {clientSearchTerm && (
                                                <span className="text-base font-normal text-blue-700 ml-3">
                                                    (Filtrado: "{clientSearchTerm}")
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-8 pb-8 pt-6">
                                    <TotalsCard 
                                        summary={profitabilityData.summary} 
                                        title={`Totales - ${format(selectedPeriod.start, 'MMMM yyyy', { locale: es })}`}
                                    />
                                    
                                    {profitabilityData.clientAnalysis.length > 0 ? (
                                        <div className="overflow-x-auto max-h-[600px] overflow-y-auto border border-slate-200 rounded-xl">
                                            <Table>
                                                <TableHeader className="sticky top-0 bg-slate-100/95 backdrop-blur-sm z-10 border-b-2 border-slate-200">
                                                    <TableRow>
                                                        <TableHead 
                                                            className="cursor-pointer hover:bg-slate-200/50 select-none font-bold text-slate-700 py-4"
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
                                                                % Rentabilidad
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
                                    ) : (
                                        <div className="text-center py-16 px-6">
                                            {clientSearchTerm ? (
                                                <div>
                                                    <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                                    <h3 className="text-xl font-bold text-slate-700 mb-2">
                                                        No se encontraron resultados
                                                    </h3>
                                                    <p className="text-slate-500 text-lg mb-6">
                                                        No hay clientes que coincidan con "{clientSearchTerm}" en este período.
                                                    </p>
                                                    <Button onClick={clearSearch} variant="outline" className="shadow-md">
                                                        <X className="w-4 h-4 mr-2" />
                                                        Limpiar búsqueda
                                                    </Button>
                                                </div>
                                            ) : (
                                                <p className="text-slate-500 text-lg">No hay datos de servicios para analizar en este período.</p>
                                            )}
                                        </div>
                                    )}
                                </AccordionContent>
                            </AccordionItem>
                            
                            <AccordionItem value="item-2" className="bg-white border border-slate-200/60 rounded-2xl shadow-lg overflow-hidden">
                                <AccordionTrigger className="px-8 py-6 text-lg font-bold hover:no-underline hover:bg-slate-50/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <ArrowRightSquare className="w-6 h-6 text-slate-700"/>
                                        <span className="text-slate-900">
                                            Rentabilidad Acumulada por Cliente (Desde {format(cumulativeStartDate, 'd MMM yyyy', { locale: es })})
                                        </span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-8 pb-8 pt-6">
                                    <TotalsCard 
                                        summary={cumulativeProfitabilityData.summary} 
                                        title={`Totales Acumulados (Desde ${format(cumulativeStartDate, 'd MMM yyyy', { locale: es })})`}
                                    />
                                    
                                    <p className="text-slate-600 mb-6 text-base font-light leading-relaxed">
                                        Análisis acumulado de ingresos, costos y márgenes reales desde la fecha de inicio definida.
                                        {clientSearchTerm && (
                                            <span className="ml-2 text-base font-medium text-blue-700">
                                                (Filtrado: "{clientSearchTerm}")
                                            </span>
                                        )}
                                    </p>
                                    {cumulativeProfitabilityData.clientAnalysis.length > 0 ? (
                                        <div className="overflow-x-auto max-h-[600px] overflow-y-auto border border-slate-200 rounded-xl">
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
                                                                Horas Acum.
                                                                {getSortIcon('totalHours')}
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
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {cumulativeProfitabilityData.clientAnalysis.map(data => (
                                                        <TableRow key={data.clientId} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100">
                                                            <TableCell className="font-semibold text-slate-900 py-4">{data.clientName}</TableCell>
                                                            <TableCell className="text-center text-slate-700">{data.serviceCount}</TableCell>
                                                            <TableCell className="text-center font-medium text-slate-800">{data.totalHours.toFixed(2)}h</TableCell>
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
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                                <tfoot>
                                                    <TableRow className="bg-gradient-to-r from-slate-100 to-slate-50 font-bold text-slate-900 sticky bottom-0 border-t-2 border-slate-300">
                                                        <TableCell colSpan="2" className="text-right text-xl py-5">TOTAL ACUMULADO</TableCell>
                                                        <TableCell className="text-center text-xl">{cumulativeProfitabilityData.summary.totalHours.toFixed(2)}h</TableCell>
                                                        <TableCell className="text-right text-xl text-emerald-800">${cumulativeProfitabilityData.summary.totalIncome.toFixed(2)}</TableCell>
                                                        <TableCell className="text-right text-xl text-rose-800">${cumulativeProfitabilityData.summary.totalLaborCost.toFixed(2)}</TableCell>
                                                        <TableCell className={`text-right text-xl ${cumulativeProfitabilityData.summary.totalMargin > 0 ? 'text-blue-800' : 'text-orange-800'}`}>${cumulativeProfitabilityData.summary.totalMargin.toFixed(2)}</TableCell>
                                                        <TableCell className="text-right text-xl text-slate-700">(${(cumulativeProfitabilityData.overallTotalFixedCosts + cumulativeTrainingCost.amount).toFixed(2)})</TableCell>
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
                                            <Clock9 className="w-16 h-16 mx-auto mb-4" />
                                            <p className="text-lg">No hay datos acumulados desde {format(cumulativeStartDate, 'd MMM yyyy', { locale: es })}.</p>
                                        </div>
                                    )}
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="item-3" className="bg-white border border-slate-200/60 rounded-2xl shadow-lg overflow-hidden">
                                <AccordionTrigger className="px-8 py-6 text-lg font-bold hover:no-underline hover:bg-slate-50/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <Target className="w-6 h-6 text-slate-700"/>
                                        <span className="text-slate-900">Análisis de Precios por Frecuencia</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-8 pb-8 pt-6">
                                    <div className="flex items-center gap-4 mb-8">
                                        <Label htmlFor="frequency-filter" className="font-semibold text-sm uppercase tracking-wide text-slate-700">Frecuencia:</Label>
                                        <Select value={selectedFrequency} onValueChange={setSelectedFrequency}>
                                            <SelectTrigger id="frequency-filter" className="w-[250px] h-11 shadow-sm border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 font-medium">
                                                <SelectValue placeholder="Seleccionar..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {frequencyOptions.map(opt => (
                                                    <SelectItem key={opt.value} value={opt.value} className="py-3">
                                                        {opt.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="max-h-[600px] overflow-y-auto border border-slate-200 rounded-xl">
                                        <PricingAnalysisTable
                                            clients={clientsForPricingAnalysis}
                                            selectedFrequency={selectedFrequency}
                                            thresholds={pricingThresholds}
                                        />
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </div>
                ) : (
                    <Card className="text-center p-20 shadow-xl border border-slate-200/60 bg-white">
                        <Calendar className="w-20 h-20 text-slate-300 mx-auto mb-6" />
                        <h3 className="text-2xl font-bold text-slate-700 mb-3">Selecciona un Período</h3>
                        <p className="text-slate-600 text-lg font-light">Elige un mes para comenzar el análisis de rentabilidad.</p>
                    </Card>
                )}
            </div>
        </div>
    );
}