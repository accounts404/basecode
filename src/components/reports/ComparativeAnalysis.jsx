import React, { useState, useMemo, useEffect } from 'react';
import { subMonths, startOfMonth, endOfMonth, format, eachMonthOfInterval, differenceInMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import MonthRangePicker from './MonthRangePicker';
import ComparativeKPICard from './ComparativeKPICard';
import MonthlyTrendChart from './MonthlyTrendChart';
import MonthlyComparisonTable from './MonthlyComparisonTable';
import { DollarSign, Clock, Users, Briefcase, BarChart3, TrendingUp, TrendingDown, Award, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart } from 'recharts';
import { Client } from '@/entities/Client';
import { User } from '@/entities/User';
import { FixedCost } from '@/entities/FixedCost';
import { PricingThreshold } from '@/entities/PricingThreshold';
import { Schedule } from '@/entities/Schedule';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

// Función para calcular el monto base (sin GST) de un schedule basado en reconciliation_items
const calculateScheduleRevenue = (schedule, client) => {
    const gstType = client?.gst_type || 'inclusive';
    
    if (schedule.reconciliation_items && schedule.reconciliation_items.length > 0) {
        const total = schedule.reconciliation_items.reduce((sum, item) => {
            const amount = parseFloat(item.amount) || 0;
            return item.type === 'discount' ? sum - amount : sum + amount;
        }, 0);
        
        // Calcular base sin GST
        if (gstType === 'inclusive') {
            return total / 1.1;
        } else if (gstType === 'exclusive') {
            return total;
        } else { // no_tax
            return total;
        }
    } else {
        const price = client?.current_service_price || 0;
        if (gstType === 'inclusive') {
            return price / 1.1;
        } else if (gstType === 'exclusive') {
            return price;
        } else {
            return price;
        }
    }
};

// Excluir agosto y septiembre de 2025
const isExcludedMonth = (monthKey) => {
  return monthKey === '2025-08' || monthKey === '2025-09';
};

// Procesar datos de costos de mano de obra (WorkEntry)
const processWorkEntryCosts = (entries) => {
  if (!entries || entries.length === 0) return [];
  
  const monthlyData = {};

  entries.forEach(entry => {
    if (!entry.work_date) return;
    
    // Extraer solo la fecha (YYYY-MM-DD) ignorando la hora
    const dateOnly = entry.work_date.substring(0, 10);
    const monthKey = dateOnly.substring(0, 7); // YYYY-MM
    
    // Excluir meses específicos
    if (isExcludedMonth(monthKey)) return;
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        month: monthKey,
        totalLaborCost: 0,
        totalHours: 0,
        clientIds: new Set(),
        serviceIds: new Set(),
      };
    }
    
    if (entry.activity !== 'entrenamiento' && entry.activity !== 'training') {
        monthlyData[monthKey].totalLaborCost += entry.total_amount || 0;
        monthlyData[monthKey].totalHours += entry.hours || 0;
        if (entry.client_id) {
            monthlyData[monthKey].clientIds.add(entry.client_id);
            const serviceKey = `${entry.client_id}|${dateOnly}`;
            monthlyData[monthKey].serviceIds.add(serviceKey);
        }
    }
  });

  return Object.keys(monthlyData).map(key => ({
    month: key,
    totalLaborCost: monthlyData[key].totalLaborCost,
    totalHours: monthlyData[key].totalHours,
    clientsAttended: monthlyData[key].clientIds.size,
    servicesRealized: monthlyData[key].serviceIds.size,
  })).sort((a,b) => a.month.localeCompare(b.month));
};

// Procesar ingresos desde Schedules facturados
const processScheduleRevenue = (schedules, clients) => {
    if (!schedules || schedules.length === 0) return [];  // CORREGIDO: retornar array vacío
    
    const clientsMap = new Map(clients.map(c => [c.id, c]));
    const monthlyData = {};

    schedules.forEach(schedule => {
        if (!schedule.xero_invoiced || !schedule.start_time) return;
        
        const scheduleDateString = schedule.start_time.slice(0, 10);
        const monthKey = scheduleDateString.slice(0, 7); // YYYY-MM
        
        // Excluir meses específicos
        if (isExcludedMonth(monthKey)) return;
        
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = {
                month: monthKey,
                totalRevenue: 0,
                servicesInvoiced: 0,
            };
        }
        
        const client = clientsMap.get(schedule.client_id);
        const revenue = calculateScheduleRevenue(schedule, client);
        
        monthlyData[monthKey].totalRevenue += revenue;
        monthlyData[monthKey].servicesInvoiced += 1;
    });

    return Object.keys(monthlyData).map(key => ({
        month: key,
        totalRevenue: monthlyData[key].totalRevenue,
        servicesInvoiced: monthlyData[key].servicesInvoiced,
    })).sort((a,b) => a.month.localeCompare(b.month));
};

export default function ComparativeAnalysis({ workEntries }) {
    const [dateRange, setDateRange] = useState({
        start: startOfMonth(subMonths(new Date(), 5)),
        end: endOfMonth(new Date()),
    });
    
    const [clients, setClients] = useState([]);
    const [users, setUsers] = useState([]);
    const [fixedCosts, setFixedCosts] = useState([]);
    const [pricingThresholds, setPricingThresholds] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [loadingExtraData, setLoadingExtraData] = useState(true);

    useEffect(() => {
        const loadExtraData = async () => {
            setLoadingExtraData(true);
            try {
                const [clientsData, usersData, fixedCostsData, thresholdsData, schedulesData] = await Promise.all([
                    Client.list(),
                    User.list(),
                    FixedCost.list(),
                    PricingThreshold.list(),
                    Schedule.list()
                ]);
                setClients(clientsData);
                setUsers(usersData.filter(u => u.role !== 'admin'));
                setFixedCosts(fixedCostsData);
                setPricingThresholds(thresholdsData);
                setSchedules(schedulesData);
            } catch (error) {
                console.error('Error loading extra data:', error);
            } finally {
                setLoadingExtraData(false);
            }
        };
        loadExtraData();
    }, []);
    
    const allMonthlyCosts = useMemo(() => {
        console.log('[ComparativeAnalysis] 📊 Procesando costos de work entries:', workEntries?.length || 0);
        const result = processWorkEntryCosts(workEntries);
        console.log('[ComparativeAnalysis] ✅ Costos mensuales procesados:', result.length, result);
        return result;
    }, [workEntries]);
    
    const allMonthlyRevenue = useMemo(() => {
        console.log('[ComparativeAnalysis] 💰 Procesando ingresos de schedules:', schedules?.length || 0);
        const result = processScheduleRevenue(schedules, clients);
        console.log('[ComparativeAnalysis] ✅ Ingresos mensuales procesados:', result.length, result);
        return result;
    }, [schedules, clients]);

    const filteredMonthlyCosts = useMemo(() => {
        if (!dateRange.start || !dateRange.end || allMonthlyCosts.length === 0) {
            console.log('[ComparativeAnalysis] ⚠️ Filtro vacío:', {
                hasStart: !!dateRange.start,
                hasEnd: !!dateRange.end,
                costsLength: allMonthlyCosts.length
            });
            return [];
        }
        const startMonth = format(dateRange.start, 'yyyy-MM');
        const endMonth = format(dateRange.end, 'yyyy-MM');
        console.log('[ComparativeAnalysis] 📅 Rango de filtro:', { startMonth, endMonth });
        
        const filtered = allMonthlyCosts.filter(d => 
            d.month >= startMonth && 
            d.month <= endMonth && 
            !isExcludedMonth(d.month)
        );
        console.log('[ComparativeAnalysis] ✅ Costos filtrados:', filtered.length, filtered);
        return filtered;
    }, [allMonthlyCosts, dateRange]);

    const filteredMonthlyRevenue = useMemo(() => {
        if (!dateRange.start || !dateRange.end || allMonthlyRevenue.length === 0) return [];
        const startMonth = format(dateRange.start, 'yyyy-MM');
        const endMonth = format(dateRange.end, 'yyyy-MM');
        return allMonthlyRevenue.filter(d => 
            d.month >= startMonth && 
            d.month <= endMonth && 
            !isExcludedMonth(d.month)
        );
    }, [allMonthlyRevenue, dateRange]);

    // Combinar datos de costos e ingresos por mes
    const combinedMonthlyData = useMemo(() => {
        const months = new Set([
            ...filteredMonthlyCosts.map(d => d.month),
            ...filteredMonthlyRevenue.map(d => d.month)
        ]);
        
        return Array.from(months).sort().map(month => {
            const costData = filteredMonthlyCosts.find(d => d.month === month) || { totalLaborCost: 0, totalHours: 0, clientsAttended: 0, servicesRealized: 0 };
            const revenueData = filteredMonthlyRevenue.find(d => d.month === month) || { totalRevenue: 0, servicesInvoiced: 0 };
            
            return {
                month,
                totalRevenue: revenueData.totalRevenue,
                totalLaborCost: costData.totalLaborCost,
                totalHours: costData.totalHours,
                clientsAttended: costData.clientsAttended,
                servicesRealized: costData.servicesRealized,
                servicesInvoiced: revenueData.servicesInvoiced,
                grossMargin: revenueData.totalRevenue - costData.totalLaborCost,
            };
        });
    }, [filteredMonthlyCosts, filteredMonthlyRevenue]);

    const periodTotals = useMemo(() => {
        return combinedMonthlyData.reduce((acc, month) => {
            acc.totalRevenue += month.totalRevenue;
            acc.totalLaborCost += month.totalLaborCost;
            acc.totalHours += month.totalHours;
            acc.servicesRealized += month.servicesRealized;
            acc.servicesInvoiced += month.servicesInvoiced;
            acc.grossMargin += month.grossMargin;
            return acc;
        }, { totalRevenue: 0, totalLaborCost: 0, totalHours: 0, servicesRealized: 0, servicesInvoiced: 0, grossMargin: 0 });
    }, [combinedMonthlyData]);

    periodTotals.clientsAttended = useMemo(() => {
        const clientSet = new Set();
        const startDateString = format(dateRange.start, 'yyyy-MM-dd');
        const endDateString = format(dateRange.end, 'yyyy-MM-dd');
        
        workEntries.forEach(entry => {
            if (!entry.work_date) return;
            const dateOnly = entry.work_date.substring(0, 10);
            const monthKey = dateOnly.substring(0, 7);
            
            if(dateOnly >= startDateString && 
               dateOnly <= endDateString && 
               entry.activity !== 'entrenamiento' &&
               entry.activity !== 'training' &&
               !isExcludedMonth(monthKey) &&
               entry.client_id) {
                clientSet.add(entry.client_id);
            }
        });
        return clientSet.size;
    }, [workEntries, dateRange]);
    
    const previousPeriodTotals = useMemo(() => {
        if (!dateRange.start || !dateRange.end) return null;
        
        const monthsDiff = differenceInMonths(dateRange.end, dateRange.start) + 1;
        const prevEnd = subMonths(dateRange.start, 1);
        const prevStart = subMonths(prevEnd, monthsDiff - 1);
        
        const prevStartMonth = format(prevStart, 'yyyy-MM');
        const prevEndMonth = format(prevEnd, 'yyyy-MM');

        const prevCostData = allMonthlyCosts.filter(d => d.month >= prevStartMonth && d.month <= prevEndMonth);
        const prevRevenueData = allMonthlyRevenue.filter(d => d.month >= prevStartMonth && d.month <= prevEndMonth);

        const totals = prevCostData.reduce((acc, month) => {
            acc.totalLaborCost += month.totalLaborCost;
            acc.totalHours += month.totalHours;
            acc.servicesRealized += month.servicesRealized;
            return acc;
        }, { totalLaborCost: 0, totalHours: 0, servicesRealized: 0, totalRevenue: 0, grossMargin: 0 });
        
        totals.totalRevenue = prevRevenueData.reduce((sum, month) => sum + month.totalRevenue, 0);
        totals.grossMargin = totals.totalRevenue - totals.totalLaborCost;
        
        totals.clientsAttended = (() => {
            const clientSet = new Set();
            const prevStartString = format(prevStart, 'yyyy-MM-dd');
            const prevEndString = format(prevEnd, 'yyyy-MM-dd');
            
            workEntries.forEach(entry => {
                if (!entry.work_date) return;
                const dateOnly = entry.work_date.substring(0, 10);
                const monthKey = dateOnly.substring(0, 7);
                
                if(dateOnly >= prevStartString && 
                   dateOnly <= prevEndString && 
                   entry.activity !== 'entrenamiento' &&
                   entry.activity !== 'training' &&
                   !isExcludedMonth(monthKey) &&
                   entry.client_id) {
                    clientSet.add(entry.client_id);
                }
            });
            return clientSet.size;
        })();

        return totals;
    }, [allMonthlyCosts, allMonthlyRevenue, dateRange, workEntries]);

    // NUEVO: Análisis por Limpiador (usando costos de mano de obra)
    const cleanerAnalysis = useMemo(() => {
        const start = dateRange.start;
        const end = dateRange.end;
        const startDateString = format(start, 'yyyy-MM-dd');
        const endDateString = format(end, 'yyyy-MM-dd');
        
        const filteredEntries = workEntries.filter(entry => {
            if (!entry.work_date) return false;
            const dateOnly = entry.work_date.substring(0, 10);
            const monthKey = dateOnly.substring(0, 7);
            return dateOnly >= startDateString && 
                   dateOnly <= endDateString && 
                   entry.activity !== 'entrenamiento' &&
                   entry.activity !== 'training' &&
                   !isExcludedMonth(monthKey);
        });

        const cleanerData = {};
        filteredEntries.forEach(entry => {
            if (!cleanerData[entry.cleaner_id]) {
                cleanerData[entry.cleaner_id] = {
                    name: entry.cleaner_name,
                    totalLaborCost: 0,
                    totalHours: 0,
                    servicesCompleted: 0
                };
            }
            cleanerData[entry.cleaner_id].totalLaborCost += entry.total_amount || 0;
            cleanerData[entry.cleaner_id].totalHours += entry.hours || 0;
            cleanerData[entry.cleaner_id].servicesCompleted += 1;
        });

        return Object.values(cleanerData)
            .map(cleaner => ({
                ...cleaner,
                avgHourlyRate: cleaner.totalHours > 0 ? cleaner.totalLaborCost / cleaner.totalHours : 0
            }))
            .sort((a, b) => b.totalLaborCost - a.totalLaborCost);
    }, [workEntries, dateRange]);

    // NUEVO: Análisis por Tipo de Cliente (usando ingresos de schedules facturados)
    const clientTypeAnalysis = useMemo(() => {
        const start = dateRange.start;
        const end = dateRange.end;
        const startDateString = format(start, 'yyyy-MM-dd');
        const endDateString = format(end, 'yyyy-MM-dd');
        
        const filteredSchedules = schedules.filter(s => {
            if (!s.xero_invoiced || !s.start_time) return false;
            const scheduleDateString = s.start_time.slice(0, 10);
            const monthKey = scheduleDateString.slice(0, 7);
            return scheduleDateString >= startDateString && 
                   scheduleDateString <= endDateString &&
                   !isExcludedMonth(monthKey);
        });

        const clientsMap = new Map(clients.map(c => [c.id, c]));
        const clientTypeData = {};
        
        filteredSchedules.forEach(schedule => {
            const client = clientsMap.get(schedule.client_id);
            const clientType = client?.client_type || 'unknown';
            
            if (!clientTypeData[clientType]) {
                clientTypeData[clientType] = {
                    type: clientType,
                    totalRevenue: 0,
                    servicesCompleted: 0
                };
            }
            
            const revenue = calculateScheduleRevenue(schedule, client);
            clientTypeData[clientType].totalRevenue += revenue;
            clientTypeData[clientType].servicesCompleted += 1;
        });

        return Object.values(clientTypeData).map(data => ({
            ...data,
            typeName: data.type === 'domestic' ? 'Doméstico' : data.type === 'commercial' ? 'Comercial' : data.type === 'training' ? 'Entrenamiento' : 'Desconocido'
        }));
    }, [schedules, clients, dateRange]);

    // NUEVO: Análisis por Frecuencia de Servicio (usando ingresos de schedules facturados)
    const frequencyAnalysis = useMemo(() => {
        const start = dateRange.start;
        const end = dateRange.end;
        const startDateString = format(start, 'yyyy-MM-dd');
        const endDateString = format(end, 'yyyy-MM-dd');
        
        const filteredSchedules = schedules.filter(s => {
            if (!s.xero_invoiced || !s.start_time) return false;
            const scheduleDateString = s.start_time.slice(0, 10);
            const monthKey = scheduleDateString.slice(0, 7);
            return scheduleDateString >= startDateString && 
                   scheduleDateString <= endDateString &&
                   !isExcludedMonth(monthKey);
        });

        const clientsMap = new Map(clients.map(c => [c.id, c]));
        const frequencyData = {};
        
        filteredSchedules.forEach(schedule => {
            const client = clientsMap.get(schedule.client_id);
            const frequency = client?.service_frequency || 'unknown';
            
            if (!frequencyData[frequency]) {
                frequencyData[frequency] = {
                    frequency: frequency,
                    totalRevenue: 0,
                    servicesCompleted: 0
                };
            }
            
            const revenue = calculateScheduleRevenue(schedule, client);
            frequencyData[frequency].totalRevenue += revenue;
            frequencyData[frequency].servicesCompleted += 1;
        });

        const frequencyLabels = {
            weekly: 'Semanal',
            fortnightly: 'Quincenal',
            every_3_weeks: 'Cada 3 Semanas',
            monthly: 'Mensual',
            one_off: 'Servicio Único'
        };

        return Object.values(frequencyData).map(data => ({
            ...data,
            frequencyName: frequencyLabels[data.frequency] || 'Desconocido'
        }));
    }, [schedules, clients, dateRange]);

    // NUEVO: Análisis de Rentabilidad (Ingresos vs Costos)
    const profitabilityAnalysis = useMemo(() => {
        const months = eachMonthOfInterval({ start: dateRange.start, end: dateRange.end });
        
        return months
            .filter(month => !isExcludedMonth(format(month, 'yyyy-MM')))
            .map(month => {
                const monthKey = format(month, 'yyyy-MM');
                const costData = combinedMonthlyData.find(d => d.month === monthKey) || { totalLaborCost: 0, totalRevenue: 0 };
                const fixedCost = fixedCosts.find(fc => fc.period === monthKey);
                
                const revenue = costData.totalRevenue || 0;
                const laborCost = costData.totalLaborCost || 0;
                const fixedCostAmount = fixedCost?.amount || 0;
                const totalCost = laborCost + fixedCostAmount;
                const margin = revenue - totalCost;
                const marginPercentage = revenue > 0 ? (margin / revenue) * 100 : 0;

                return {
                    month: format(month, 'MMM yyyy', { locale: es }),
                    revenue,
                    laborCost,
                    fixedCost: fixedCostAmount,
                    totalCost,
                    margin,
                    marginPercentage
                };
            });
    }, [combinedMonthlyData, fixedCosts, dateRange]);

    // NUEVO: Clientes con Precio Bajo (por debajo del umbral)
    const underPricedClients = useMemo(() => {
        const activeClients = clients.filter(c => c.active !== false);
        const results = [];

        activeClients.forEach(client => {
            const threshold = pricingThresholds.find(pt => pt.frequency === client.service_frequency);
            if (threshold && client.current_service_price < threshold.min_price) {
                const difference = threshold.min_price - client.current_service_price;
                const percentBelow = (difference / threshold.min_price) * 100;
                results.push({
                    clientName: client.name,
                    currentPrice: client.current_service_price,
                    minPrice: threshold.min_price,
                    difference,
                    percentBelow,
                    frequency: client.service_frequency
                });
            }
        });

        return results.sort((a, b) => b.percentBelow - a.percentBelow);
    }, [clients, pricingThresholds]);

    // NUEVO: Análisis de Items Reconciliados
    const reconciliationItemsAnalysis = useMemo(() => {
        const start = dateRange.start;
        const end = dateRange.end;
        const startDateString = format(start, 'yyyy-MM-dd');
        const endDateString = format(end, 'yyyy-MM-dd');
        
        const filteredSchedules = schedules.filter(s => {
            if (!s.start_time || !s.xero_invoiced) return false;
            const scheduleDateString = s.start_time.slice(0, 10);
            const monthKey = scheduleDateString.slice(0, 7);
            return scheduleDateString >= startDateString && 
                   scheduleDateString <= endDateString &&
                   !isExcludedMonth(monthKey);
        });

        const itemsData = {};
        const clientsMap = new Map(clients.map(c => [c.id, c]));
        
        filteredSchedules.forEach(schedule => {
            const client = clientsMap.get(schedule.client_id);
            const gstType = client?.gst_type || 'inclusive';
            
            if (schedule.reconciliation_items && schedule.reconciliation_items.length > 0) {
                schedule.reconciliation_items.forEach(item => {
                    const itemType = item.type || 'unknown';
                    if (!itemsData[itemType]) {
                        itemsData[itemType] = {
                            type: itemType,
                            totalAmount: 0,
                            count: 0
                        };
                    }
                    
                    let baseAmount = parseFloat(item.amount) || 0;
                    if (gstType === 'inclusive') {
                        baseAmount = baseAmount / 1.1;
                    }
                    
                    itemsData[itemType].totalAmount += baseAmount;
                    itemsData[itemType].count += 1;
                });
            }
        });

        const itemLabels = {
            base_service: 'Servicio Base',
            windows_cleaning: 'Limpieza de Ventanas',
            steam_vacuum: 'Limpieza a Vapor',
            spring_cleaning: 'Spring Cleaning',
            vacancy_cleaning: 'Vacancy Cleaning',
            oven_cleaning: 'Limpieza de Horno',
            fridge_cleaning: 'Limpieza de Nevera',
            first_cleaning: 'Primera Limpieza',
            one_off_service: 'One Off Service',
            other_extra: 'Otro Extra',
            discount: 'Descuento'
        };

        return Object.values(itemsData)
            .map(data => ({
                ...data,
                typeName: itemLabels[data.type] || data.type
            }))
            .sort((a, b) => b.totalAmount - a.totalAmount);
    }, [schedules, clients, dateRange]);

    // NUEVO: Análisis de Eficiencia
    const efficiencyAnalysis = useMemo(() => {
        return combinedMonthlyData.map(month => {
            const revenuePerHour = month.totalHours > 0 ? month.totalRevenue / month.totalHours : 0;
            const laborCostPerHour = month.totalHours > 0 ? month.totalLaborCost / month.totalHours : 0;
            const marginPerHour = revenuePerHour - laborCostPerHour;
            
            return {
                month: format(new Date(month.month + '-01'), 'MMM yyyy', { locale: es }),
                revenuePerHour,
                laborCostPerHour,
                marginPerHour,
                totalHours: month.totalHours,
            };
        });
    }, [combinedMonthlyData]);

    if (workEntries.length === 0) {
        return (
            <Card className="shadow-lg border-0 text-center">
              <CardContent className="p-12">
                <BarChart3 className="w-24 h-24 mx-auto text-slate-300" />
                <p className="mt-4 text-slate-600">
                  No hay datos históricos para analizar.
                </p>
              </CardContent>
            </Card>
        );
    }
    
    const chartLabels = combinedMonthlyData.map(d => format(new Date(d.month + '-01'), 'MMM yyyy', { locale: es }));
    const revenueData = combinedMonthlyData.map(d => d.totalRevenue);
    const laborCostData = combinedMonthlyData.map(d => d.totalLaborCost);
    const hoursData = combinedMonthlyData.map(d => d.totalHours);
    const servicesData = combinedMonthlyData.map(d => d.servicesRealized);
    const clientsData = combinedMonthlyData.map(d => d.clientsAttended);
    const marginData = combinedMonthlyData.map(d => d.grossMargin);

    return (
        <div className="space-y-8">
            <MonthRangePicker onRangeChange={setDateRange} workEntries={workEntries}/>

            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-2 lg:grid-cols-7">
                    <TabsTrigger value="overview">Resumen</TabsTrigger>
                    <TabsTrigger value="cleaners">Limpiadores</TabsTrigger>
                    <TabsTrigger value="clients">Clientes</TabsTrigger>
                    <TabsTrigger value="profitability">Rentabilidad</TabsTrigger>
                    <TabsTrigger value="efficiency">Eficiencia</TabsTrigger>
                    <TabsTrigger value="pricing">Precios</TabsTrigger>
                    <TabsTrigger value="items">Items</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6 mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                        <ComparativeKPICard
                            title="Ingresos Totales"
                            icon={DollarSign}
                            currentValue={periodTotals.totalRevenue}
                            previousValue={previousPeriodTotals?.totalRevenue}
                            formatAs="currency"
                            color="green"
                        />
                        <ComparativeKPICard
                            title="Costo de Mano de Obra"
                            icon={Users}
                            currentValue={periodTotals.totalLaborCost}
                            previousValue={previousPeriodTotals?.totalLaborCost}
                            formatAs="currency"
                            color="orange"
                        />
                        <ComparativeKPICard
                            title="Margen Bruto"
                            icon={TrendingUp}
                            currentValue={periodTotals.grossMargin}
                            previousValue={previousPeriodTotals?.grossMargin}
                            formatAs="currency"
                            color="blue"
                        />
                        <ComparativeKPICard
                            title="Horas Totales"
                            icon={Clock}
                            currentValue={periodTotals.totalHours}
                            previousValue={previousPeriodTotals?.totalHours}
                            formatAs="hours"
                            color="purple"
                        />
                    </div>
                    
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                        <MonthlyTrendChart
                            title="Tendencia de Ingresos vs Costos de Mano de Obra"
                            labels={chartLabels}
                            datasets={[
                                { name: 'Ingresos ($)', data: revenueData, type: 'line', color: '#10b981' },
                                { name: 'Costo Mano de Obra ($)', data: laborCostData, type: 'line', color: '#f59e0b' }
                            ]}
                        />
                        <MonthlyTrendChart
                            title="Tendencia de Margen Bruto"
                            labels={chartLabels}
                            datasets={[
                                { name: 'Margen Bruto ($)', data: marginData, type: 'bar', color: '#3b82f6' }
                            ]}
                        />
                    </div>

                    <Card className="shadow-lg border-0">
                        <CardHeader>
                            <CardTitle>Comparación Mensual Detallada</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Mes</TableHead>
                                            <TableHead className="text-right">Ingresos</TableHead>
                                            <TableHead className="text-right">Costo M.O.</TableHead>
                                            <TableHead className="text-right">Margen Bruto</TableHead>
                                            <TableHead className="text-right">% Margen</TableHead>
                                            <TableHead className="text-right">Horas</TableHead>
                                            <TableHead className="text-right">Servicios</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {combinedMonthlyData.map((month, index) => {
                                            const marginPercent = month.totalRevenue > 0 ? (month.grossMargin / month.totalRevenue) * 100 : 0;
                                            return (
                                                <TableRow key={index}>
                                                    <TableCell className="font-medium">
                                                        {format(new Date(month.month + '-01'), 'MMMM yyyy', { locale: es })}
                                                    </TableCell>
                                                    <TableCell className="text-right text-green-600 font-semibold">
                                                        ${month.totalRevenue.toFixed(2)}
                                                    </TableCell>
                                                    <TableCell className="text-right text-orange-600">
                                                        ${month.totalLaborCost.toFixed(2)}
                                                    </TableCell>
                                                    <TableCell className={`text-right font-semibold ${month.grossMargin >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                                        ${month.grossMargin.toFixed(2)}
                                                    </TableCell>
                                                    <TableCell className={`text-right ${marginPercent >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                                        {marginPercent.toFixed(1)}%
                                                    </TableCell>
                                                    <TableCell className="text-right">{month.totalHours.toFixed(1)}h</TableCell>
                                                    <TableCell className="text-right">{month.servicesRealized}</TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="cleaners" className="space-y-6 mt-6">
                    <Card className="shadow-lg border-0">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Award className="w-5 h-5 text-blue-600" />
                                Costos de Mano de Obra por Limpiador
                            </CardTitle>
                            <p className="text-sm text-slate-600 mt-1">
                                Análisis del costo operativo de cada limpiador
                            </p>
                        </CardHeader>
                        <CardContent>
                            <div className="mb-6">
                                <ResponsiveContainer width="100%" height={400}>
                                    <BarChart data={cleanerAnalysis.slice(0, 10)}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                                        <YAxis yAxisId="left" />
                                        <YAxis yAxisId="right" orientation="right" />
                                        <Tooltip />
                                        <Legend />
                                        <Bar yAxisId="left" dataKey="totalLaborCost" name="Costo M.O. ($)" fill="#f59e0b" />
                                        <Bar yAxisId="right" dataKey="totalHours" name="Horas" fill="#3b82f6" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Limpiador</TableHead>
                                        <TableHead className="text-right">Costo M.O.</TableHead>
                                        <TableHead className="text-right">Horas</TableHead>
                                        <TableHead className="text-right">Servicios</TableHead>
                                        <TableHead className="text-right">$/Hora Promedio</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {cleanerAnalysis.map((cleaner, index) => (
                                        <TableRow key={index}>
                                            <TableCell className="font-medium">{cleaner.name}</TableCell>
                                            <TableCell className="text-right text-orange-600 font-semibold">
                                                ${cleaner.totalLaborCost.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-right">{cleaner.totalHours.toFixed(1)}h</TableCell>
                                            <TableCell className="text-right">{cleaner.servicesCompleted}</TableCell>
                                            <TableCell className="text-right">${cleaner.avgHourlyRate.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="clients" className="space-y-6 mt-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="shadow-lg border-0">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Users className="w-5 h-5 text-purple-600" />
                                    Ingresos por Tipo de Cliente
                                </CardTitle>
                                <p className="text-sm text-slate-600 mt-1">
                                    Basado en servicios facturados (sin GST)
                                </p>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={clientTypeAnalysis}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="typeName" />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="totalRevenue" name="Ingresos ($)" fill="#8b5cf6" />
                                    </BarChart>
                                </ResponsiveContainer>
                                
                                <Table className="mt-4">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Tipo</TableHead>
                                            <TableHead className="text-right">Ingresos</TableHead>
                                            <TableHead className="text-right">Servicios</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {clientTypeAnalysis.map((type, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-medium">{type.typeName}</TableCell>
                                                <TableCell className="text-right text-purple-600 font-semibold">
                                                    ${type.totalRevenue.toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right">{type.servicesCompleted}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        <Card className="shadow-lg border-0">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-orange-600" />
                                    Ingresos por Frecuencia
                                </CardTitle>
                                <p className="text-sm text-slate-600 mt-1">
                                    Basado en servicios facturados (sin GST)
                                </p>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={frequencyAnalysis} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis type="number" />
                                        <YAxis dataKey="frequencyName" type="category" width={120} />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="totalRevenue" name="Ingresos ($)" fill="#f59e0b" />
                                    </BarChart>
                                </ResponsiveContainer>
                                
                                <Table className="mt-4">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Frecuencia</TableHead>
                                            <TableHead className="text-right">Ingresos</TableHead>
                                            <TableHead className="text-right">Servicios</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {frequencyAnalysis.map((freq, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-medium">{freq.frequencyName}</TableCell>
                                                <TableCell className="text-right text-orange-600 font-semibold">
                                                    ${freq.totalRevenue.toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right">{freq.servicesCompleted}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="profitability" className="space-y-6 mt-6">
                    <Card className="shadow-lg border-0">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-green-600" />
                                Análisis de Rentabilidad Completo
                            </CardTitle>
                            <p className="text-sm text-slate-600 mt-1">
                                Ingresos vs Costos (Mano de Obra + Fijos)
                            </p>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={400}>
                                <ComposedChart data={profitabilityAnalysis}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="month" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="revenue" name="Ingresos ($)" fill="#10b981" stackId="a" />
                                    <Bar dataKey="laborCost" name="Costo M.O. ($)" fill="#f59e0b" stackId="b" />
                                    <Bar dataKey="fixedCost" name="Costos Fijos ($)" fill="#ef4444" stackId="b" />
                                    <Line type="monotone" dataKey="margin" name="Margen Neto ($)" stroke="#3b82f6" strokeWidth={3} />
                                </ComposedChart>
                            </ResponsiveContainer>
                            
                            <Table className="mt-6">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Mes</TableHead>
                                        <TableHead className="text-right">Ingresos</TableHead>
                                        <TableHead className="text-right">Costo M.O.</TableHead>
                                        <TableHead className="text-right">Costos Fijos</TableHead>
                                        <TableHead className="text-right">Costo Total</TableHead>
                                        <TableHead className="text-right">Margen Neto</TableHead>
                                        <TableHead className="text-right">% Margen</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {profitabilityAnalysis.map((month, index) => (
                                        <TableRow key={index}>
                                            <TableCell className="font-medium">{month.month}</TableCell>
                                            <TableCell className="text-right text-green-600 font-semibold">
                                                ${month.revenue.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-right text-orange-600">
                                                ${month.laborCost.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-right text-red-600">
                                                ${month.fixedCost.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-right text-red-700 font-semibold">
                                                ${month.totalCost.toFixed(2)}
                                            </TableCell>
                                            <TableCell className={`text-right font-semibold ${month.margin >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                                ${month.margin.toFixed(2)}
                                            </TableCell>
                                            <TableCell className={`text-right ${month.marginPercentage >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                                {month.marginPercentage.toFixed(1)}%
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="efficiency" className="space-y-6 mt-6">
                    <Card className="shadow-lg border-0">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-indigo-600" />
                                Análisis de Eficiencia Operativa
                            </CardTitle>
                            <p className="text-sm text-slate-600 mt-1">
                                Métricas por hora trabajada
                            </p>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={400}>
                                <LineChart data={efficiencyAnalysis}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="month" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="revenuePerHour" name="Ingreso/Hora ($)" stroke="#10b981" strokeWidth={2} />
                                    <Line type="monotone" dataKey="laborCostPerHour" name="Costo M.O./Hora ($)" stroke="#f59e0b" strokeWidth={2} />
                                    <Line type="monotone" dataKey="marginPerHour" name="Margen/Hora ($)" stroke="#3b82f6" strokeWidth={3} />
                                </LineChart>
                            </ResponsiveContainer>
                            
                            <Table className="mt-6">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Mes</TableHead>
                                        <TableHead className="text-right">Ingreso/Hora</TableHead>
                                        <TableHead className="text-right">Costo M.O./Hora</TableHead>
                                        <TableHead className="text-right">Margen/Hora</TableHead>
                                        <TableHead className="text-right">Total Horas</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {efficiencyAnalysis.map((month, index) => (
                                        <TableRow key={index}>
                                            <TableCell className="font-medium">{month.month}</TableCell>
                                            <TableCell className="text-right text-green-600 font-semibold">
                                                ${month.revenuePerHour.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-right text-orange-600">
                                                ${month.laborCostPerHour.toFixed(2)}
                                            </TableCell>
                                            <TableCell className={`text-right font-semibold ${month.marginPerHour >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                                ${month.marginPerHour.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-right">{month.totalHours.toFixed(1)}h</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="pricing" className="space-y-6 mt-6">
                    <Card className="shadow-lg border-0">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-red-600" />
                                Clientes con Precio por Debajo del Umbral
                            </CardTitle>
                            <p className="text-sm text-slate-600 mt-1">
                                {underPricedClients.length} cliente(s) con precios por debajo del mínimo recomendado
                            </p>
                        </CardHeader>
                        <CardContent>
                            {underPricedClients.length === 0 ? (
                                <div className="text-center py-12">
                                    <TrendingUp className="w-16 h-16 text-green-500 mx-auto mb-4" />
                                    <p className="text-lg font-semibold text-green-700">¡Excelente!</p>
                                    <p className="text-slate-600">Todos los clientes activos tienen precios dentro o por encima del umbral mínimo.</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Cliente</TableHead>
                                            <TableHead>Frecuencia</TableHead>
                                            <TableHead className="text-right">Precio Actual</TableHead>
                                            <TableHead className="text-right">Precio Mínimo</TableHead>
                                            <TableHead className="text-right">Diferencia</TableHead>
                                            <TableHead className="text-right">% Bajo</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {underPricedClients.map((client, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-medium">{client.clientName}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">
                                                        {client.frequency === 'weekly' ? 'Semanal' :
                                                         client.frequency === 'fortnightly' ? 'Quincenal' :
                                                         client.frequency === 'every_3_weeks' ? 'Cada 3 Semanas' :
                                                         client.frequency === 'monthly' ? 'Mensual' : 'One Off'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    ${client.currentPrice.toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right text-green-600 font-semibold">
                                                    ${client.minPrice.toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right text-red-600 font-semibold">
                                                    -${client.difference.toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Badge variant="destructive">
                                                        {client.percentBelow.toFixed(1)}%
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="items" className="space-y-6 mt-6">
                    <Card className="shadow-lg border-0">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Briefcase className="w-5 h-5 text-indigo-600" />
                                Desglose de Items Facturados
                            </CardTitle>
                            <p className="text-sm text-slate-600 mt-1">
                                Análisis de servicios adicionales y extras basado en items reconciliados
                            </p>
                        </CardHeader>
                        <CardContent>
                            {reconciliationItemsAnalysis.length === 0 ? (
                                <div className="text-center py-12">
                                    <Briefcase className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                    <p className="text-slate-600">No hay items reconciliados en el período seleccionado.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                        <ResponsiveContainer width="100%" height={300}>
                                            <BarChart data={reconciliationItemsAnalysis}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="typeName" angle={-45} textAnchor="end" height={100} />
                                                <YAxis />
                                                <Tooltip />
                                                <Legend />
                                                <Bar dataKey="totalAmount" name="Monto Total ($)" fill="#6366f1" />
                                            </BarChart>
                                        </ResponsiveContainer>

                                        <ResponsiveContainer width="100%" height={300}>
                                            <BarChart 
                                                data={reconciliationItemsAnalysis.slice(0, 10)} 
                                                layout="vertical"
                                            >
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis type="number" />
                                                <YAxis 
                                                    type="category" 
                                                    dataKey="typeName" 
                                                    width={150}
                                                    tick={{ fontSize: 12 }}
                                                />
                                                <Tooltip />
                                                <Legend />
                                                <Bar 
                                                    dataKey="totalAmount" 
                                                    name="Monto ($)" 
                                                    fill="#8b5cf6"
                                                    label={{ position: 'right', formatter: (value) => `$${value.toFixed(0)}` }}
                                                />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>

                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Tipo de Item</TableHead>
                                                <TableHead className="text-right">Cantidad</TableHead>
                                                <TableHead className="text-right">Monto Total</TableHead>
                                                <TableHead className="text-right">Monto Promedio</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {reconciliationItemsAnalysis.map((item, index) => (
                                                <TableRow key={index}>
                                                    <TableCell className="font-medium">{item.typeName}</TableCell>
                                                    <TableCell className="text-right">{item.count}</TableCell>
                                                    <TableCell className="text-right text-indigo-600 font-semibold">
                                                        ${item.totalAmount.toFixed(2)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        ${(item.totalAmount / item.count).toFixed(2)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}