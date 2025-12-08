import React, { useState, useEffect, useMemo } from 'react';
import { Client } from '@/entities/Client';
import { WorkEntry } from '@/entities/WorkEntry';
import { FixedCost } from '@/entities/FixedCost';
import { Schedule } from '@/entities/Schedule';
import { ClientPriceReviewList } from '@/entities/ClientPriceReviewList';
import { User } from '@/entities/User';
import { format, startOfMonth, endOfMonth, subMonths, parseISO, addMonths } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, DollarSign, Target, AlertCircle, ArrowUpCircle, Percent, Calendar, FileText, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const extractDateOnly = (isoString) => {
  if (!isoString) return null;
  return isoString.substring(0, 10);
};

// Función para verificar si una fecha está en agosto o septiembre 2025
const isExcludedMonth = (dateString) => {
  if (!dateString) return false;
  const dateOnly = extractDateOnly(dateString);
  // Excluir agosto 2025 (2025-08-XX) y septiembre 2025 (2025-09-XX)
  return dateOnly && (dateOnly.startsWith('2025-08') || dateOnly.startsWith('2025-09'));
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

            // CORRECCIÓN: sumar todos los montos (incluidos descuentos que se restan en calculateTotalIncomeFromBreakdown)
            if (type === 'discount') {
                totalRawReconciledAmount -= amount;
            } else {
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

export default function AumentoClientesPage() {
    const navigate = useNavigate();
    const [clients, setClients] = useState([]);
    const [allWorkEntries, setAllWorkEntries] = useState([]);
    const [allSchedules, setAllSchedules] = useState([]);
    const [allFixedCosts, setAllFixedCosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [targetProfitPercentage, setTargetProfitPercentage] = useState(15);
    const [trainingClientId, setTrainingClientId] = useState(null);
    const [sortColumn, setSortColumn] = useState('adjustmentNeeded');
    const [sortDirection, setSortDirection] = useState('desc');
    const [currentUser, setCurrentUser] = useState(null);
    const [createListDialogOpen, setCreateListDialogOpen] = useState(false);
    const [newListName, setNewListName] = useState('');
    const [creating, setCreating] = useState(false);

    const [startDate] = useState(new Date('2025-04-01T00:00:00Z'));
    const [endDate, setEndDate] = useState(() => {
        const today = new Date();
        return endOfMonth(subMonths(today, 1));
    });

    const loadAllRecords = async (entity, sortField = '-created_date') => {
        const BATCH_SIZE = 5000;
        let allRecords = [];
        let skip = 0;
        let hasMore = true;

        while (hasMore) {
            const batch = await entity.list(sortField, BATCH_SIZE, skip);
            const batchArray = Array.isArray(batch) ? batch : [];
            
            allRecords = [...allRecords, ...batchArray];
            
            if (batchArray.length < BATCH_SIZE) {
                hasMore = false;
            } else {
                skip += BATCH_SIZE;
            }
        }

        return allRecords;
    };

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError('');
            try {
                const [clientsData, workEntriesData, schedulesData, fixedCostsData, user] = await Promise.all([
                    loadAllRecords(Client, '-created_date'),
                    loadAllRecords(WorkEntry, '-work_date'),
                    loadAllRecords(Schedule, '-start_time'),
                    loadAllRecords(FixedCost, '-created_date'),
                    User.me()
                ]);
                
                setCurrentUser(user);
                
                // FILTRAR agosto y septiembre 2025
                const filteredWorkEntries = (workEntriesData || []).filter(e => !isExcludedMonth(e.work_date));
                const filteredSchedules = (schedulesData || []).filter(s => !isExcludedMonth(s.start_time));
                
                console.log('[AumentoClientes] 🚫 Excluidos agosto y septiembre 2025:', {
                  workEntriesExcluded: (workEntriesData?.length || 0) - filteredWorkEntries.length,
                  schedulesExcluded: (schedulesData?.length || 0) - filteredSchedules.length
                });
                
                setClients(clientsData || []);
                setAllWorkEntries(filteredWorkEntries);
                setAllSchedules(filteredSchedules);
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

            const priceData = getPriceForSchedule(schedule, client);
            const { base: netIncome } = calculateGST(priceData.rawAmount, priceData.gstType);
            
            // CORRECCIÓN: Calcular gstFactor correctamente cuando rawAmount es cero
            const gstFactor = priceData.rawAmount > 0 ? (netIncome / priceData.rawAmount) : 1;
            
            let netBreakdownForService = {};
            for (const type in priceData.breakdown) {
                netBreakdownForService[type] = priceData.breakdown[type] * gstFactor;
            }
            
            cumulativeIncomeDetailMap.set(clientId, mergeRevenueBreakdowns(currentClientCumulativeBreakdown, netBreakdownForService));
        });

        const cumulativeWorkEntries = allWorkEntries.filter(entry => {
            return isDateInRange(entry.work_date, startDate, endDate) && 
                   entry.client_id !== trainingClientId &&
                   clientMap.has(entry.client_id);
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

        let cumulativeTrainingAmount = 0;
        allWorkEntries.forEach(entry => {
            if (entry.client_id === trainingClientId && 
                isDateInRange(entry.work_date, startDate, endDate)) {
                cumulativeTrainingAmount += entry.total_amount || 0;
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

        const startPeriod = format(startDate, 'yyyy-MM');
        const endPeriod = format(endDate, 'yyyy-MM');
        const totalCumulativeFixedCosts = allFixedCosts.filter(fc => {
            // EXCLUIR agosto y septiembre 2025
            if (fc.period === '2025-08' || fc.period === '2025-09') {
                return false;
            }
            return fc.period >= startPeriod && fc.period <= endPeriod;
        }).reduce((sum, fc) => sum + (fc.amount || 0), 0);

        const totalFixedCostsWithTraining = totalCumulativeFixedCosts + cumulativeTrainingAmount;
        const overallCumulativeTotalHours = cumulativeWorkEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
        const cumulativeFixedCostPerHourOverall = overallCumulativeTotalHours > 0 ? 
            totalFixedCostsWithTraining / overallCumulativeTotalHours : 0;

        const clientAnalysis = Object.values(cumulativeClientProfitability).map(data => {
            const margin = data.totalIncome - data.totalLaborCost;
            const distributedFixedCost = data.totalHours * cumulativeFixedCostPerHourOverall;
            const realMargin = margin - distributedFixedCost;
            const incomePerHour = data.totalHours > 0 ? data.totalIncome / data.totalHours : 0;
            const laborCostPerHour = data.totalHours > 0 ? data.totalLaborCost / data.totalHours : 0;
            const realMarginPerHour = data.totalHours > 0 ? realMargin / data.totalHours : 0;
            const fixedCostPerHour = data.totalHours > 0 ? distributedFixedCost / data.totalHours : 0;
            const currentRealProfitPercentage = data.totalIncome > 0 ? (realMargin / data.totalIncome) * 100 : (realMargin < 0 ? -100 : 0);

            const targetDecimal = targetProfitPercentage / 100;
            let adjustmentNeeded = 0;
            let newTotalIncome = data.totalIncome;
            let adjustmentPercentage = 0;

            if (targetDecimal < 1 && data.totalIncome > 0) {
                adjustmentNeeded = (data.totalIncome * targetDecimal - realMargin) / (1 - targetDecimal);
                newTotalIncome = data.totalIncome + adjustmentNeeded;
                adjustmentPercentage = data.totalIncome > 0 ? (adjustmentNeeded / data.totalIncome) * 100 : 0;
            }

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
            const client = clientMap.get(data.clientId);
            return client && client.active !== false && (data.totalHours > 0 || data.totalIncome > 0);
        });

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

    const handleCreateListClick = () => {
        const suggestedName = `Revisión ${format(new Date(), "MMMM yyyy", { locale: es })}`;
        setNewListName(suggestedName);
        setCreateListDialogOpen(true);
    };

    const handleCreateList = async () => {
        if (!newListName.trim()) {
            setError('Por favor ingresa un nombre para la lista');
            return;
        }

        setCreating(true);
        try {
            const clientsData = sortedClients.map(client => ({
                client_id: client.clientId,
                client_name: client.clientName,
                service_count: client.serviceCount,
                total_hours: client.totalHours,
                current_real_profit_percentage: client.currentRealProfitPercentage,
                current_price_base: client.currentPriceBase,
                suggested_new_price: client.newServicePriceBase,
                adjustment_per_service: client.adjustmentPerService,
                adjustment_percentage: client.adjustmentPerServicePercentage,
                notes: '',
                excluded: false,
                gst_type: client.gstType
            }));

            const newList = await ClientPriceReviewList.create({
                list_name: newListName,
                review_date: format(new Date(), 'yyyy-MM-dd'),
                status: 'draft',
                created_by_user_id: currentUser.id,
                created_by_user_name: currentUser.full_name,
                target_profit_percentage: targetProfitPercentage,
                period_start: format(startDate, 'yyyy-MM-dd'),
                period_end: format(endDate, 'yyyy-MM-dd'),
                clients_to_review: clientsData,
                notes: `Lista creada automáticamente desde análisis de Aumento de Clientes. Período: ${format(startDate, "d 'de' MMMM", { locale: es })} al ${format(endDate, "d 'de' MMMM 'de' yyyy", { locale: es })}.`
            });

            setCreateListDialogOpen(false);
            setNewListName('');
            navigate(createPageUrl('RevisionPrecios'));
        } catch (err) {
            console.error('Error creating list:', err);
            setError('Error al crear la lista de revisión');
        } finally {
            setCreating(false);
        }
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
                <div className="mb-10">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div className="flex items-center gap-4">
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
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                onClick={() => navigate(createPageUrl('RevisionPrecios'))}
                                className="hover:bg-purple-50 hover:border-purple-300"
                            >
                                <FileText className="w-5 h-5 mr-2" />
                                Ver Listas Guardadas
                            </Button>
                            {sortedClients.length > 0 && (
                                <Button
                                    onClick={handleCreateListClick}
                                    className="bg-purple-600 hover:bg-purple-700 shadow-lg"
                                    size="lg"
                                >
                                    <Plus className="w-5 h-5 mr-2" />
                                    Crear Lista de Revisión
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                <Card className="mb-8 shadow-xl border border-slate-200/60 bg-white/80 backdrop-blur-sm">
                    <CardContent className="p-8">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                                                    disabled={(date) => {
                                                        if (date > new Date() || date < startDate) return true;

                                                        // EXCLUIR agosto y septiembre 2025
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
                            </div>

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
                            <p className="text-xs text-emerald-700 mt-2 font-medium">
                                Ingresos adicionales en el período analizado
                            </p>
                            <p className="text-xs text-emerald-600 mt-1">
                                {format(startDate, "MMM yyyy", { locale: es })} - {format(endDate, "MMM yyyy", { locale: es })}
                            </p>
                        </CardContent>
                    </Card>
                </div>

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
                                                    <div className="space-y-1">
                                                        <div className="font-bold">${client.currentPriceBase.toFixed(2)}</div>
                                                        {client.gstType !== 'no_tax' && (
                                                            <div className="text-xs text-slate-500">
                                                                con GST: ${calculateGST(client.currentServicePrice || 0, client.gstType).total.toFixed(2)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-emerald-700 bg-emerald-50 text-lg">
                                                    <div className="space-y-1">
                                                        <div>${client.newServicePriceBase.toFixed(2)}</div>
                                                        {client.gstType !== 'no_tax' && (
                                                            <div className="text-xs text-emerald-600">
                                                                con GST: ${(() => {
                                                                    if (client.gstType === 'inclusive') {
                                                                        return (client.newServicePriceBase * 1.1).toFixed(2);
                                                                    } else if (client.gstType === 'exclusive') {
                                                                        return (client.newServicePriceBase * 1.1).toFixed(2);
                                                                    }
                                                                    return client.newServicePriceBase.toFixed(2);
                                                                })()}
                                                            </div>
                                                        )}
                                                    </div>
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

                {/* Create List Dialog */}
                <Dialog open={createListDialogOpen} onOpenChange={setCreateListDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-purple-700">
                                <FileText className="w-5 h-5" />
                                Crear Lista de Revisión de Precios
                            </DialogTitle>
                            <DialogDescription>
                                Esta lista incluirá los {sortedClients.length} clientes que actualmente están por debajo del objetivo de rentabilidad del {targetProfitPercentage}%.
                                Podrás gestionar y editar esta lista más adelante.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="list-name">Nombre de la Lista</Label>
                                <Input
                                    id="list-name"
                                    value={newListName}
                                    onChange={(e) => setNewListName(e.target.value)}
                                    placeholder="Ej: Revisión Enero 2026"
                                />
                            </div>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-800">
                                    <strong>Período de análisis:</strong> {format(startDate, "d 'de' MMMM", { locale: es })} al {format(endDate, "d 'de' MMMM 'de' yyyy", { locale: es })}
                                </p>
                                <p className="text-sm text-blue-800 mt-1">
                                    <strong>Total de clientes:</strong> {sortedClients.length}
                                </p>
                                <p className="text-sm text-blue-800 mt-1">
                                    <strong>Aumento total potencial:</strong> ${sortedClients.reduce((sum, c) => sum + Math.max(0, c.adjustmentNeeded), 0).toFixed(2)}
                                </p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setCreateListDialogOpen(false)}
                                disabled={creating}
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleCreateList}
                                disabled={creating || !newListName.trim()}
                                className="bg-purple-600 hover:bg-purple-700"
                            >
                                {creating ? (
                                    <>Creando...</>
                                ) : (
                                    <>
                                        <Plus className="w-4 h-4 mr-2" />
                                        Crear Lista
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}