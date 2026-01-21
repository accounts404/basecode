import React, { useState, useEffect, useMemo } from 'react';
import { Client } from '@/entities/Client';
import { WorkEntry } from '@/entities/WorkEntry';
import { FixedCost } from '@/entities/FixedCost';
import { PricingThreshold } from '@/entities/PricingThreshold';
import { Schedule } from '@/entities/Schedule';
import { User } from '@/entities/User';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity } from 'lucide-react';
import RentabilityAnalysisTab from '../components/rentabilidad/RentabilityAnalysisTab';
import ClientAccumulatedTab from '../components/rentabilidad/ClientAccumulatedTab';
import PricingFrequencyTab from '../components/rentabilidad/PricingFrequencyTab';

import React, { useState, useEffect } from 'react';
import { Client } from '@/entities/Client';
import { WorkEntry } from '@/entities/WorkEntry';
import { FixedCost } from '@/entities/FixedCost';
import { PricingThreshold } from '@/entities/PricingThreshold';
import { Schedule } from '@/entities/Schedule';
import { User } from '@/entities/User';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity } from 'lucide-react';
import RentabilityAnalysisTab from '../components/rentabilidad/RentabilityAnalysisTab';
import ClientAccumulatedTab from '../components/rentabilidad/ClientAccumulatedTab';
import PricingFrequencyTab from '../components/rentabilidad/PricingFrequencyTab';
import { extractDateOnly } from '@/components/utils/priceCalculations';

const isExcludedMonth = (dateString) => {
  if (!dateString) return false;
  const dateOnly = extractDateOnly(dateString);
  return dateOnly && (dateOnly.startsWith('2025-08') || dateOnly.startsWith('2025-09'));
};

export default function RentabilidadPage() {
    const [clients, setClients] = useState([]);
    const [allWorkEntries, setAllWorkEntries] = useState([]);
    const [allSchedules, setAllSchedules] = useState([]);
    const [allFixedCosts, setAllFixedCosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sortColumn, setSortColumn] = useState('realMargin');
    const [sortDirection, setSortDirection] = useState('desc');
    const [pricingThresholds, setPricingThresholds] = useState([]);
    const [trainingClientId, setTrainingClientId] = useState(null);

    // Helper para cargar TODOS los registros con paginación automática
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

    const loadAllInitialData = async () => {
        setLoading(true);
        setError('');
        try {
            console.log('[Rentabilidad] 📊 Cargando TODOS los registros con paginación...');
            
            const [clientsData, workEntriesData, thresholdsData, schedulesData, fixedCostsData, usersData] = await Promise.all([
                loadAllRecords(Client, '-created_date'),
                loadAllRecords(WorkEntry, '-work_date'),
                loadAllRecords(PricingThreshold, '-created_date'),
                loadAllRecords(Schedule, '-start_time'),
                loadAllRecords(FixedCost, '-created_date'),
                loadAllRecords(User, '-created_date'),
            ]);
            
            console.log('[Rentabilidad] ✅ Registros cargados:', {
                clients: clientsData?.length || 0,
                workEntries: workEntriesData?.length || 0,
                schedules: schedulesData?.length || 0,
                thresholds: thresholdsData?.length || 0,
                fixedCosts: fixedCostsData?.length || 0,
                users: usersData?.length || 0
            });
            
            // FILTRAR agosto y septiembre 2025
            const filteredWorkEntries = (workEntriesData || []).filter(e => !isExcludedMonth(e.work_date));
            const filteredSchedules = (schedulesData || []).filter(s => !isExcludedMonth(s.start_time));
            
            console.log('[Rentabilidad] 🚫 Excluidos agosto y septiembre 2025:', {
              workEntriesExcluded: (workEntriesData?.length || 0) - filteredWorkEntries.length,
              schedulesExcluded: (schedulesData?.length || 0) - filteredSchedules.length
            });
            
            // DEBUG: Verificar schedules facturados de julio 2025
            const july2025Schedules = (schedulesData || []).filter(s => {
                const dateOnly = extractDateOnly(s.start_time);
                return dateOnly && dateOnly.startsWith('2025-07') && s.xero_invoiced === true;
            });
            console.log('[Rentabilidad] 🔍 DEBUG - Schedules facturados julio 2025:', july2025Schedules.length);
            if (july2025Schedules.length > 0) {
                console.log('[Rentabilidad] 📋 Primeros 3 schedules julio 2025:', 
                    july2025Schedules.slice(0, 3).map(s => ({
                        client: s.client_name,
                        date: extractDateOnly(s.start_time),
                        hasReconciliation: !!s.reconciliation_items?.length,
                        reconciliationTotal: s.reconciliation_items?.reduce((sum, item) => {
                            const amt = parseFloat(item.amount) || 0;
                            return item.type === 'discount' ? sum - amt : sum + amt;
                        }, 0),
                        snapshot: s.billed_price_snapshot
                    }))
                );
            }
            
            setClients(clientsData || []);
            setAllWorkEntries(filteredWorkEntries);
            setPricingThresholds(thresholdsData || []);
            setAllSchedules(filteredSchedules);
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
            
            console.log(`[Rentabilidad] 📅 Schedules facturados en ${monthValue}:`, monthlySchedules.length);
            if (monthValue === '2025-07') {
                console.log('[Rentabilidad] 🔍 DEBUG - Schedules julio 2025:', 
                    monthlySchedules.map(s => ({
                        id: s.id,
                        client: s.client_name,
                        date: extractDateOnly(s.start_time),
                        hasReconciliation: !!s.reconciliation_items?.length,
                        itemsCount: s.reconciliation_items?.length || 0
                    }))
                );
            }

            monthlySchedules.forEach(schedule => {
                if (schedule.client_id === trainingClientId) return;

                const client = clientMap.get(schedule.client_id);
                if (!client) {
                    console.warn('[Rentabilidad] ⚠️ Cliente no encontrado para schedule:', schedule.id, schedule.client_name);
                    return;
                }

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
                
                if (monthValue === '2025-07' && client.name === 'David Muzverney') {
                    console.log('[Rentabilidad] 🔍 DEBUG - David Muzverney julio 2025:', {
                        scheduleId: schedule.id,
                        priceData,
                        netIncome,
                        gstFactor,
                        netBreakdown: netBreakdownForSchedule,
                        totalFromBreakdown: calculateTotalIncomeFromBreakdown(netBreakdownForSchedule)
                    });
                }

                clientData[clientId].revenueBreakdown = mergeRevenueBreakdowns(clientData[clientId].revenueBreakdown, netBreakdownForSchedule);
                clientData[clientId].totalIncome += calculateTotalIncomeFromBreakdown(netBreakdownForSchedule);
                clientData[clientId].serviceCount += 1;
            });

            let trainingHours = 0;
            let trainingAmount = 0;
            allWorkEntries.forEach(entry => {
                if (entry.client_id === trainingClientId && 
                    isDateInRange(entry.work_date, monthStart, monthEnd)) {
                    trainingHours += entry.hours || 0;
                    trainingAmount += entry.total_amount || 0;
                }
            });
            setMonthlyTrainingCost({ hours: trainingHours, amount: trainingAmount });

            const monthlyWorkEntries = allWorkEntries.filter(e => 
                isDateInRange(e.work_date, monthStart, monthEnd) &&
                e.activity !== 'training'
            );

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

            // Calcular costos operativos del mes
            const monthlyOperationalCost = Object.values(clientData)
                .filter(c => {
                    const client = clientMap.get(c.clientId);
                    return client?.client_type === 'operational_cost';
                })
                .reduce((sum, c) => sum + c.totalLaborCost, 0);

            const totalFixedCostsWithTraining = currentFixedCostAmount + trainingAmount + monthlyOperationalCost;
            
            console.log('[Rentabilidad] 💰 Gastos Fijos del Mes:', {
                fijos: currentFixedCostAmount,
                training: trainingAmount,
                operacionales: monthlyOperationalCost,
                total: totalFixedCostsWithTraining
            });

            const totalMonthlyHours = Object.values(clientData)
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

                const clientHourShare = totalMonthlyHours > 0 ? data.totalHours / totalMonthlyHours : 0;
                const distributedFixedCost = totalFixedCostsWithTraining * clientHourShare;
                const fixedCostPerHour = data.totalHours > 0 ? distributedFixedCost / data.totalHours : 0;
                const realMargin = margin - distributedFixedCost;
                const realMarginPerHour = data.totalHours > 0 ? realMargin / data.totalHours : 0;
                const realProfitPercentage = data.totalIncome > 0 ? (realMargin / data.totalIncome) * 100 : (realMargin < 0 ? -100 : 0);

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
                    realMarginPerHour
                };
            }).filter(data => {
                // Excluir clientes operacionales del análisis de rentabilidad
                const client = clientMap.get(data.clientId);
                return client?.client_type !== 'operational_cost' && (data.totalHours > 0 || data.totalIncome > 0);
            });

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

    const monthlyOperationalCosts = useMemo(() => {
        if (!selectedPeriod) return 0;
        
        const operationalCostEntries = allWorkEntries.filter(entry => {
            const client = clients.find(c => c.id === entry.client_id);
            return client?.client_type === 'operational_cost' && 
                   isDateInRange(entry.work_date, selectedPeriod.start, selectedPeriod.end);
        });
        
        return operationalCostEntries.reduce((sum, entry) => sum + (entry.total_amount || 0), 0);
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

        const filteredClientAnalysis = sortedClientAnalysis.filter(data => {
            // Prioridad 1: Si hay clientes seleccionados en multi-select, usar eso
            if (selectedClients.length > 0) {
                return selectedClients.includes(data.clientName);
            }
            // Prioridad 2: Si hay búsqueda de texto, usar eso
            if (clientSearchTerm.trim()) {
                return data.clientName.toLowerCase().includes(clientSearchTerm.toLowerCase());
            }
            // Sin filtros: mostrar todos
            return true;
        });
        
        const summary = filteredClientAnalysis.reduce((acc, client) => {
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
        
        // Calcular gastos fijos proporcionalmente
        const totalFixedCosts = parseFloat(fixedCostInput || 0) + monthlyTrainingCost.amount + monthlyOperationalCosts;
        const cashRatio = summary.totalIncome > 0 ? summary.cashIncome / summary.totalIncome : 0;
        const invoiceRatio = summary.totalIncome > 0 ? summary.nonCashIncome / summary.totalIncome : 0;
        
        summary.cashFixedCosts = totalFixedCosts * cashRatio;
        summary.invoiceFixedCosts = totalFixedCosts * invoiceRatio;
        summary.cashNetMargin = summary.cashMargin - summary.cashFixedCosts;
        summary.invoiceNetMargin = summary.invoiceMargin - summary.invoiceFixedCosts;
        summary.cashProfitability = summary.cashIncome > 0 ? (summary.cashNetMargin / summary.cashIncome) * 100 : 0;
        summary.invoiceProfitability = summary.nonCashIncome > 0 ? (summary.invoiceNetMargin / summary.nonCashIncome) * 100 : 0;

        return { clientAnalysis: filteredClientAnalysis, summary };

    }, [selectedPeriod, monthlyProcessedClientAnalysis, clientSearchTerm, selectedClients, sortColumn, sortDirection, fixedCostInput, monthlyTrainingCost, monthlyOperationalCosts]);

    const cumulativeOperationalCosts = useMemo(() => {
        if (!cumulativeStartDate || !cumulativeEndDate) return [];
        
        const operationalCostEntries = allWorkEntries.filter(entry => {
            const client = clients.find(c => c.id === entry.client_id);
            return client?.client_type === 'operational_cost' && 
                   isDateInRange(entry.work_date, cumulativeStartDate, endOfDay(cumulativeEndDate));
        });

        // Agrupar por cliente operativo
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
    }, [allWorkEntries, clients, cumulativeStartDate, cumulativeEndDate]);

    const cumulativeProfitabilityData = useMemo(() => {
        if (clients.length === 0 || allWorkEntries.length === 0 || allSchedules.length === 0) {
            return { clientAnalysis: [], summary: { totalIncome: 0, totalLaborCost: 0, totalMargin: 0, totalRealMargin: 0, totalHours: 0, totalRealProfitPercentage: 0 }, overallTotalFixedCosts: 0 };
        }

        const activeClients = clients.filter(c => c.active !== false && c.id !== trainingClientId);
        const clientMap = new Map(activeClients.map(c => [c.id, c]));

        const cumulativeIncomeDetailMap = new Map();
        const invoicedSchedulesCumulative = allSchedules.filter(schedule => {
            return isDateInRange(schedule.start_time, cumulativeStartDate, endOfDay(cumulativeEndDate)) && 
                   schedule.xero_invoiced === true &&
                   schedule.client_id !== trainingClientId &&
                   clientMap.has(schedule.client_id);
        });

        // NUEVO: Mapa para contar servicios únicos por cliente desde schedules
        const clientServiceCountFromSchedules = new Map();
        
        invoicedSchedulesCumulative.forEach(schedule => {
            const client = clientMap.get(schedule.client_id);
            if (!client) return;

            const clientId = client.id;
            
            // Contar servicios únicos
            if (!clientServiceCountFromSchedules.has(clientId)) {
                clientServiceCountFromSchedules.set(clientId, new Set());
            }
            const scheduleDateOnly = extractDateOnly(schedule.start_time);
            if (scheduleDateOnly) {
                clientServiceCountFromSchedules.get(clientId).add(scheduleDateOnly);
            }
            
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
        allWorkEntries.forEach(entry => {
            if (entry.client_id === trainingClientId && 
                isDateInRange(entry.work_date, cumulativeStartDate, endOfDay(cumulativeEndDate))) {
                cumulativeTrainingHours += entry.hours || 0;
                cumulativeTrainingAmount += entry.total_amount || 0;
            }
        });
        setCumulativeTrainingCost({ hours: cumulativeTrainingHours, amount: cumulativeTrainingAmount });

        const cumulativeWorkEntries = allWorkEntries.filter(entry => {
            return isDateInRange(entry.work_date, cumulativeStartDate, endOfDay(cumulativeEndDate)) && 
                   entry.client_id !== trainingClientId &&
                   clientMap.has(entry.client_id) &&
                   entry.activity !== 'training';
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
                
                // CORREGIDO: Usar el conteo de servicios desde schedules facturados
                const uniqueServiceDates = clientServiceCountFromSchedules.get(clientId);
                cumulativeClientProfitability[clientId].serviceCount = uniqueServiceDates ? uniqueServiceDates.size : 0;

            } else {
                const client = clientMap.get(clientId);
                if (client) {
                    // CORREGIDO: Usar el conteo de servicios desde schedules facturados
                    const uniqueServiceDates = clientServiceCountFromSchedules.get(clientId);
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
        const endPeriod = format(cumulativeEndDate, 'yyyy-MM');
        const periodMonths = [];
        let currentDate = new Date(startPeriod + '-01');
        while (format(currentDate, 'yyyy-MM') <= endPeriod) {
            periodMonths.push(format(currentDate, 'yyyy-MM'));
            currentDate = addMonths(currentDate, 1);
        }

        const relevantFixedCosts = allFixedCosts.filter(fc => periodMonths.includes(fc.period));
        const totalCumulativeFixedCosts = relevantFixedCosts.reduce((sum, fc) => sum + (fc.amount || 0), 0);

        // Sumar costos operativos acumulados
        const totalCumulativeOperationalCosts = cumulativeOperationalCosts.reduce((sum, cost) => sum + (cost.totalLaborCost || 0), 0);

        const totalFixedCostsWithTraining = totalCumulativeFixedCosts + cumulativeTrainingAmount + totalCumulativeOperationalCosts;

        const overallCumulativeTotalHours = Object.values(cumulativeClientProfitability).reduce((sum, entry) => sum + (entry.totalHours || 0), 0);

        const cumulativeFixedCostPerHourOverall = overallCumulativeTotalHours > 0 ? 
            totalFixedCostsWithTraining / overallCumulativeTotalHours : 0;

        const cumulativeClientAnalysis = Object.values(cumulativeClientProfitability).map(data => {
            const client = clientMap.get(data.clientId);
            const isCash = client?.payment_method === 'cash';
            
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
            const totalCostPerHour = laborCostPerHour + fixedCostPerHour;

            return {
                ...data,
                isCash,
                margin,
                profitPercentage,
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
             // Excluir clientes operacionales del análisis acumulado
             const client = clientMap.get(data.clientId);
             return client?.client_type !== 'operational_cost' && (data.totalHours > 0 || data.totalIncome > 0);
        });

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
            // Prioridad 1: Si hay clientes seleccionados en multi-select, usar eso
            if (selectedClients.length > 0) {
                return selectedClients.includes(data.clientName);
            }
            // Prioridad 2: Si hay búsqueda de texto, usar eso
            if (clientSearchTerm.trim()) {
                return data.clientName.toLowerCase().includes(clientSearchTerm.toLowerCase());
            }
            // Sin filtros: mostrar todos
            return true;
        });

        const cumulativeSummary = filteredCumulativeAnalysis.reduce((acc, client) => {
            acc.totalIncome += client.totalIncome;
            acc.totalLaborCost += client.totalLaborCost;
            acc.totalMargin += client.margin;
            acc.totalHours += client.totalHours;
            acc.totalRealMargin += client.realMargin;
            if (client.isCash) {
                acc.cashIncome += client.totalIncome;
            } else {
                acc.nonCashIncome += client.totalIncome;
            }
            return acc;
        }, { totalIncome: 0, totalLaborCost: 0, totalMargin: 0, totalRealMargin: 0, totalHours: 0, cashIncome: 0, nonCashIncome: 0 });

        const cumulativeTotalRealProfitPercentage = cumulativeSummary.totalIncome > 0 ? (cumulativeSummary.totalRealMargin / cumulativeSummary.totalIncome) * 100 : 0;
        cumulativeSummary.totalRealProfitPercentage = cumulativeTotalRealProfitPercentage;

        return { 
            clientAnalysis: filteredCumulativeAnalysis, 
            summary: cumulativeSummary, 
            overallTotalFixedCosts: totalCumulativeFixedCosts,
            overallTotalFixedCostsWithOperational: totalFixedCostsWithTraining
        };
    }, [clients, allWorkEntries, allSchedules, allFixedCosts, cumulativeStartDate, cumulativeEndDate, trainingClientId, clientSearchTerm, selectedClients, sortColumn, sortDirection]);

    if (loading) return <div className="p-8 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div></div>;
    if (error) return <div className="p-8 text-red-700 text-center font-medium">{error}</div>;

    const clearSearch = () => {
        setClientSearchTerm("");
        setSelectedClients([]);
    };

    const handleMultiClientSelect = (clients) => {
        setSelectedClients(clients);
    };

    const handleThresholdsSaved = () => {
        setIsThresholdModalOpen(false);
        loadAllInitialData();
    };

    const clientsForPricingAnalysis = clients.filter(c => c.id !== trainingClientId);

    // Función para verificar si han pasado 9 meses desde el último envío
    const isNotificationExpired = (sentDate) => {
        if (!sentDate) return true;
        const monthsSince = differenceInMonths(new Date(), new Date(sentDate));
        return monthsSince >= 9;
    };

    // Función para obtener el estado de envío de un cliente
    const getClientSendStatus = (client) => {
        if (!client.current_price_increase_sent_date) {
            return { sent: false, expired: true, monthsSince: null };
        }
        const expired = isNotificationExpired(client.current_price_increase_sent_date);
        const monthsSince = differenceInMonths(new Date(), new Date(client.current_price_increase_sent_date));
        return { sent: true, expired, monthsSince };
    };

    // Abrir modal de envío
    const handleOpenSendModal = (clientData) => {
        const client = clients.find(c => c.id === clientData.clientId);
        setSelectedClientForSend({ ...clientData, fullClient: client });
        setSendDate(new Date());
        setSendNotes('');
        setSendModalOpen(true);
    };

    // Marcar como enviado
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
            
            await loadAllInitialData();
            setSendModalOpen(false);
            setSelectedClientForSend(null);
            setSendNotes('');
        } catch (error) {
            console.error('Error al marcar como enviado:', error);
            alert('Error al guardar. Intenta de nuevo.');
        }
    };

    // Desmarcar envío
    const handleUnmarkSent = async (clientData) => {
        if (!confirm('¿Desmarcar el envío de aumento para este cliente?')) return;
        
        try {
            const client = clients.find(c => c.id === clientData.clientId);
            await Client.update(client.id, {
                current_price_increase_sent_date: null,
                current_price_increase_notes: null
            });
            
            await loadAllInitialData();
        } catch (error) {
            console.error('Error al desmarcar:', error);
            alert('Error al desmarcar. Intenta de nuevo.');
        }
    };

    // Ver historial
    const handleViewHistory = (clientData) => {
        const client = clients.find(c => c.id === clientData.clientId);
        setSelectedClientForHistory({ ...clientData, fullClient: client });
        setHistoryModalOpen(true);
    };

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
                                        Filtrar Cliente(s):
                                    </Label>
                                    <div className="flex-1">
                                        <ClientMultiSelect
                                            clients={uniqueClientNames}
                                            selectedClients={selectedClients}
                                            onSelectionChange={handleMultiClientSelect}
                                            maxSelections={5}
                                        />
                                    </div>
                                    {(selectedClients.length > 0 || clientSearchTerm) && (
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-2 text-sm bg-blue-50 px-4 py-3 rounded-lg border border-blue-200">
                                                <Search className="w-4 h-4 text-blue-700" />
                                                <span className="font-semibold text-blue-900">
                                                    {profitabilityData.clientAnalysis.length} resultado{profitabilityData.clientAnalysis.length !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={clearSearch}
                                                className="hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                                            >
                                                <X className="h-4 w-4 mr-1" />
                                                Limpiar
                                            </Button>
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
                        
                        {/* Sección de Gastos Operativos - Período Acumulado */}
                         <Card className="shadow-xl border border-orange-200/60 bg-gradient-to-br from-orange-50 to-white mb-6">
                             <CardHeader>
                                 <CardTitle className="text-lg flex items-center gap-2 text-orange-900">
                                     <Briefcase className="w-5 h-5" />
                                     Gastos Operativos Detallados ({format(cumulativeStartDate, 'd MMM yyyy', { locale: es })} - {format(cumulativeEndDate, 'd MMM yyyy', { locale: es })})
                                 </CardTitle>
                             </CardHeader>
                             <CardContent>
                                 <div className="space-y-4">
                                     <p className="text-sm text-slate-600">
                                         Detalle de todos los costos operativos por cliente en el período acumulado. Estos gastos se distribuyen automáticamente entre los clientes reales según sus horas de trabajo.
                                     </p>
                                     {cumulativeOperationalCosts.length > 0 ? (
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
                                                     {cumulativeOperationalCosts.map(data => {
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
                                             <p>No hay gastos operativos registrados en este período</p>
                                         </div>
                                     )}
                                 </div>
                             </CardContent>
                         </Card>

                        <Accordion type="multiple" defaultValue={["item-2", "item-3"]} className="w-full space-y-6">
                            <AccordionItem value="item-2" className="bg-white border border-slate-200/60 rounded-2xl shadow-lg overflow-hidden">
                                <AccordionTrigger className="px-8 py-6 text-lg font-bold hover:no-underline hover:bg-slate-50/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <ArrowRightSquare className="w-6 h-6 text-slate-700"/>
                                        <span className="text-slate-900">
                                            Rentabilidad Acumulada por Cliente (Desde {format(cumulativeStartDate, 'd MMM yyyy', { locale: es })} hasta {format(cumulativeEndDate, 'd MMM yyyy', { locale: es })})
                                        </span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-8 pb-8 pt-6">
                                    <Card className="mb-6 shadow-md border border-slate-200/60 bg-white/80 backdrop-blur-sm">
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
                                                                onSelect={(date) => {
                                                                    if (date) {
                                                                        setCumulativeStartDate(date);
                                                                    }
                                                                }}
                                                                disabled={(date) => {
                                                                    // No permitir fechas antes de abril 2025
                                                                    const minDate = new Date('2025-04-01');
                                                                    if (date < minDate) return true;
                                                                    
                                                                    // No permitir fechas futuras
                                                                    if (date > new Date()) return true;
                                                                    
                                                                    // No permitir fechas después de la fecha final
                                                                    if (date > cumulativeEndDate) return true;
                                                                    
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
                                                                onSelect={(date) => {
                                                                    if (date) {
                                                                        setCumulativeEndDate(date);
                                                                    }
                                                                }}
                                                                disabled={(date) => {
                                                                    // No permitir fechas antes de la fecha inicial
                                                                    if (date < cumulativeStartDate) return true;
                                                                    
                                                                    // No permitir fechas futuras
                                                                    if (date > new Date()) return true;
                                                                    
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
                                            
                                            <div className="mt-4 text-sm text-slate-600 bg-blue-50 px-4 py-3 rounded-lg border border-blue-200">
                                                <span className="font-medium">Período seleccionado:</span> {format(cumulativeStartDate, 'd MMM yyyy', { locale: es })} - {format(cumulativeEndDate, 'd MMM yyyy', { locale: es })}
                                            </div>
                                        </CardContent>
                                    </Card>
                                    
                                    <TotalsCard 
                                        summary={cumulativeProfitabilityData.summary} 
                                        title={`Totales Acumulados (${format(cumulativeStartDate, 'd MMM yyyy', { locale: es })} - ${format(cumulativeEndDate, 'd MMM yyyy', { locale: es })})`}
                                    />
                                    
                                    <p className="text-slate-600 mb-6 text-base font-light leading-relaxed">
                                        Análisis acumulado de ingresos, costos y márgenes reales para el período seleccionado. Excluye agosto y septiembre 2025.
                                        {(selectedClients.length > 0 || clientSearchTerm) && (
                                            <span className="ml-2 text-base font-medium text-blue-700">
                                                (Filtrado: {selectedClients.length > 0 ? `${selectedClients.length} cliente${selectedClients.length > 1 ? 's' : ''}` : `"${clientSearchTerm}"`})
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
                                                                            {client.price_increase_notifications?.length > 0 && (
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
                                                            )})}
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
                                                                                Gastos fijos: ${(cumulativeProfitabilityData.summary.totalHours > 0 ? (cumulativeProfitabilityData.overallTotalFixedCosts + cumulativeTrainingCost.amount) / cumulativeProfitabilityData.summary.totalHours : 0).toFixed(2)}/h
                                                                            </p>
                                                                            <p className="text-xs border-t border-slate-600 pt-1 mt-1 font-semibold">
                                                                                Total: ${(cumulativeProfitabilityData.summary.totalHours > 0 ? (cumulativeProfitabilityData.summary.totalLaborCost + (cumulativeProfitabilityData.overallTotalFixedCosts + cumulativeTrainingCost.amount)) / cumulativeProfitabilityData.summary.totalHours : 0).toFixed(2)}/h
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
                                                        {differenceInMonths(new Date(), new Date(notification.sent_date))} meses
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
                </div>
                );
                }