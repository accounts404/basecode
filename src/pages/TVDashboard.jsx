
import React, { useState, useEffect } from 'react';
import { User } from '@/entities/User';
import { Client } from '@/entities/Client';
import { WorkEntry } from '@/entities/WorkEntry';
import { Schedule } from '@/entities/Schedule';
import { ServiceReport } from '@/entities/ServiceReport';
import { Task } from '@/entities/Task';
import { Invoice } from '@/entities/Invoice';
import { Vehicle } from '@/entities/Vehicle';
import { FixedCost } from '@/entities/FixedCost';
import { PricingThreshold } from '@/entities/PricingThreshold';
import { format, startOfMonth, endOfMonth, subMonths, addDays, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    DollarSign,
    Users,
    Clock,
    TrendingUp,
    TrendingDown,
    Percent,
    Target,
    GraduationCap,
    UserPlus,
    UserMinus,
    LineChart as LineChartIcon,
    AlertTriangle,
    FileText,
    Loader2,
    Award,
    UserCheck,
    Briefcase,
    Car,
    CheckCircle,
    Calendar,
    Activity,
    Zap,
    PieChart as PieChartIcon,
    Star
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

// Helper para parsear ISO strings como UTC
const parseISOAsUTC = (isoString) => {
    if (!isoString) return null;
    const correctedIsoString = isoString.endsWith('Z') ? isoString : `${isoString}Z`;
    return new Date(correctedIsoString);
};

// Helper para calcular el monto base (sin GST) de un schedule
const calculateScheduleRevenue = (schedule, client) => {
    const gstType = client?.gst_type || 'inclusive';
    
    if (schedule.reconciliation_items && schedule.reconciliation_items.length > 0) {
        const total = schedule.reconciliation_items.reduce((sum, item) => {
            const amount = parseFloat(item.amount) || 0;
            return item.type === 'discount' ? sum - amount : sum + amount;
        }, 0);
        
        if (gstType === 'inclusive') {
            return total / 1.1;
        } else if (gstType === 'exclusive') {
            return total;
        } else {
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

export default function TVDashboard() {
    const [loading, setLoading] = useState(true);
    const [currentSection, setCurrentSection] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [data, setData] = useState({
        // KPIs principales
        monthlyRevenue: 0,
        monthlyHours: 0,
        activeClients: 0,
        activeCleaners: 0,
        completedServices: 0,
        pendingInvoices: 0,
        revenueChange: 0,
        hoursChange: 0,
        
        // Métricas de Rentabilidad
        grossMargin: 0,
        averageLaborCostPerHour: 0,
        trainingCosts: 0,
        trainingHours: 0,
        
        // Rentabilidad Completa (con costos fijos)
        fixedCosts: 0,
        totalCosts: 0,
        netMargin: 0,
        netMarginPercentage: 0,
        underPricedClients: [],
        
        // Análisis de Clientes
        newClientsThisMonth: 0,
        lostClientsThisMonth: 0,
        newClientsList: [],
        lostClientsList: [],
        clientRetentionRate: 0,
        averageServiceValue: 0,
        servicesByFrequency: [],
        
        // Proyecciones
        projectedMonthlyRevenue: 0,
        hoursGrowthTrend: 0,
        
        // Gráficos
        weeklyActivity: [],
        monthlyTrend: [],
        servicesByType: [],
        topClients: [],
        
        // Reportes - Rendimiento por Limpiador
        cleanerPerformance: [],
        topPerformer: null,
        activityBreakdown: [],
        
        // Actividad
        recentReports: [],
        pendingTasks: [],
        availableVehicles: 0,
        totalVehicles: 0,
        alerts: []
    });

    const TOTAL_SECTIONS = 11; // Incrementamos el total de secciones

    // Función para entrar en pantalla completa
    const enterFullscreen = () => {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            return elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { /* Safari */
            return elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { /* IE11 */
            return elem.msRequestFullscreen();
        }
        return Promise.reject('Fullscreen API not supported');
    };

    // Función para salir de pantalla completa
    const exitFullscreen = () => {
        if (document.exitFullscreen) {
            return document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { /* Safari */
            return document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { /* IE11 */
            return document.msExitFullscreen();
        }
        return Promise.reject('Fullscreen API not supported');
    };

    // Toggle pantalla completa
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            enterFullscreen().catch(err => console.error("Error al intentar entrar en pantalla completa:", err));
        } else {
            exitFullscreen().catch(err => console.error("Error al intentar salir de pantalla completa:", err));
        }
    };

    // Detectar cambios en el estado de pantalla completa
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('msfullscreenchange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('msfullscreenchange', handleFullscreenChange);
        };
    }, []);

    // Intentar entrar en pantalla completa automáticamente al cargar
    useEffect(() => {
        // Pequeño delay para asegurar que el DOM está listo
        const timer = setTimeout(() => {
            if (!document.fullscreenElement) {
                enterFullscreen().catch(err => {
                    // console.log('No se pudo entrar en pantalla completa automáticamente:', err);
                    // This error is expected if user interaction is required
                });
            }
        }, 1000);

        return () => clearTimeout(timer);
    }, []);

    // Rotación automática cada 15 segundos
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentSection((prev) => (prev + 1) % TOTAL_SECTIONS);
        }, 15000);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const now = new Date();
            const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
            const currentMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
            const lastMonthNow = subMonths(now, 1);
            const lastMonthStart = new Date(Date.UTC(lastMonthNow.getUTCFullYear(), lastMonthNow.getUTCMonth(), 1, 0, 0, 0, 0));
            const lastMonthEnd = new Date(Date.UTC(lastMonthNow.getUTCFullYear(), lastMonthNow.getUTCMonth() + 1, 0, 23, 59, 59, 999));

            const [
                allClients, 
                allUsers, 
                allWorkEntries, 
                allSchedules, 
                allReports, 
                allTasks, 
                allInvoices, 
                allVehicles,
                allFixedCosts,
                allPricingThresholds
            ] = await Promise.all([
                Client.list(),
                User.list(),
                WorkEntry.list('-work_date'),
                Schedule.list('-start_time'),
                ServiceReport.list('-created_date'),
                Task.list(),
                Invoice.list('-created_date'),
                Vehicle.list(),
                FixedCost.list(),
                PricingThreshold.list()
            ]);

            // Identificar el cliente de entrenamiento
            const trainingClient = allClients.find(c => 
                c.name?.toUpperCase() === 'TRAINING' || c.client_type === 'training'
            );

            // Filtrar entradas del mes actual
            const currentMonthEntries = allWorkEntries.filter(e => {
                const date = parseISOAsUTC(e.work_date);
                return date && date >= currentMonthStart && date <= currentMonthEnd;
            });

            // Filtrar entradas del mes pasado
            const lastMonthEntries = allWorkEntries.filter(e => {
                const date = parseISOAsUTC(e.work_date);
                return date && date >= lastMonthStart && date <= lastMonthEnd;
            });

            // Filtrar schedules del mes actual (facturados en Xero)
            const currentMonthSchedules = allSchedules.filter(s => {
                if (!s.xero_invoiced || !s.start_time) return false;
                const date = parseISOAsUTC(s.start_time);
                return date && date >= currentMonthStart && date <= currentMonthEnd;
            });

            const clientsMap = new Map(allClients.map(c => [c.id, c]));

            // ========== COSTOS DE ENTRENAMIENTO ==========
            let trainingCosts = 0;
            let trainingHours = 0;
            
            if (trainingClient) {
                const trainingEntries = currentMonthEntries.filter(e => e.client_id === trainingClient.id);
                trainingCosts = trainingEntries.reduce((sum, e) => sum + (e.total_amount || 0), 0);
                trainingHours = trainingEntries.reduce((sum, e) => sum + (e.hours || 0), 0);
            }

            // ========== INGRESOS DEL MES ==========
            const monthlyRevenue = currentMonthSchedules.reduce((sum, schedule) => {
                const client = clientsMap.get(schedule.client_id);
                // Excluir entrenamiento de los ingresos
                if (trainingClient && schedule.client_id === trainingClient.id) return sum;
                return sum + calculateScheduleRevenue(schedule, client);
            }, 0);

            // ========== COSTOS DE MANO DE OBRA ==========
            const monthlyLaborCost = currentMonthEntries
                .filter(e => !trainingClient || e.client_id !== trainingClient.id)
                .reduce((sum, e) => sum + (e.total_amount || 0), 0);

            const grossMargin = monthlyRevenue - monthlyLaborCost;

            // ========== COSTOS FIJOS DEL MES ACTUAL ==========
            const currentMonthKey = format(currentMonthStart, 'yyyy-MM');
            const fixedCostRecord = allFixedCosts.find(fc => fc.period === currentMonthKey);
            const fixedCosts = fixedCostRecord?.amount || 0;

            // ========== RENTABILIDAD COMPLETA ==========
            const totalCosts = monthlyLaborCost + fixedCosts;
            const netMargin = monthlyRevenue - totalCosts;
            const netMarginPercentage = monthlyRevenue > 0 ? (netMargin / monthlyRevenue) * 100 : 0;

            // ========== HORAS TOTALES ==========
            const monthlyHours = currentMonthEntries
                .filter(e => !trainingClient || e.client_id !== trainingClient.id)
                .reduce((sum, e) => sum + (e.hours || 0), 0);

            const averageLaborCostPerHour = monthlyHours > 0 ? monthlyLaborCost / monthlyHours : 0;

            // ========== COMPARACIONES CON MES ANTERIOR ==========
            const lastMonthRevenue = allSchedules
                .filter(s => {
                    if (!s.xero_invoiced || !s.start_time) return false;
                    const date = parseISOAsUTC(s.start_time);
                    if (!date || date < lastMonthStart || date > lastMonthEnd) return false;
                    return !trainingClient || s.client_id !== trainingClient.id;
                })
                .reduce((sum, schedule) => {
                    const client = clientsMap.get(schedule.client_id);
                    return sum + calculateScheduleRevenue(schedule, client);
                }, 0);

            const lastMonthHours = lastMonthEntries
                .filter(e => !trainingClient || e.client_id !== trainingClient.id)
                .reduce((sum, e) => sum + (e.hours || 0), 0);

            const revenueChange = lastMonthRevenue > 0 ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;
            const hoursChange = lastMonthHours > 0 ? ((monthlyHours - lastMonthHours) / lastMonthHours) * 100 : 0;

            // ========== CLIENTES CON PRECIO BAJO DEL UMBRAL ==========
            const activeClientsFilter = allClients.filter(c => c.active !== false); // Renamed to avoid conflict
            const underPricedClients = [];

            activeClientsFilter.forEach(client => {
                const threshold = allPricingThresholds.find(pt => pt.frequency === client.service_frequency);
                if (threshold && client.current_service_price < threshold.min_price) {
                    const difference = threshold.min_price - client.current_service_price;
                    const percentBelow = (difference / threshold.min_price) * 100;
                    underPricedClients.push({
                        clientName: client.name,
                        currentPrice: client.current_service_price,
                        minPrice: threshold.min_price,
                        difference,
                        percentBelow,
                        frequency: client.service_frequency
                    });
                }
            });

            underPricedClients.sort((a, b) => b.percentBelow - a.percentBelow);

            // ========== ANÁLISIS DE CLIENTES ==========

            // Clientes Nuevos: creados en el mes actual
            const newClientsList = allClients.filter(c => {
                if (!c.created_date) return false;
                const date = parseISOAsUTC(c.created_date);
                return date && date >= currentMonthStart && date <= currentMonthEnd;
            }).map(c => ({
                id: c.id,
                name: c.name,
                date: c.created_date,
                service_frequency: c.service_frequency,
                current_service_price: c.current_service_price
            }));
            const newClientsThisMonth = newClientsList.length;

            // Clientes Perdidos: marcados como inactivos en el mes actual
            const lostClientsList = allClients.filter(c => {
                // Cliente debe estar inactivo
                if (c.active !== false) return false;
                // Y debe haber sido actualizado (desactivado) en el mes actual
                if (!c.updated_date) return false;
                const date = parseISOAsUTC(c.updated_date);
                return date && date >= currentMonthStart && date <= currentMonthEnd;
            }).map(c => ({
                id: c.id,
                name: c.name,
                date: c.updated_date,
                service_frequency: c.service_frequency,
                current_service_price: c.current_service_price
            }));
            const lostClientsThisMonth = lostClientsList.length;

            // Clientes activos totales
            const activeClients = allClients.filter(c => c.active !== false);

            // Tasa de retención: clientes activos que había el mes pasado y siguen activos
            const clientsActiveLastMonth = allClients.filter(c => {
                // Cliente debe existir antes del mes actual
                if (!c.created_date) return false;
                const createdDate = parseISOAsUTC(c.created_date);
                if (createdDate >= currentMonthStart) return false; // Creado este mes, no cuenta
                
                // Si está activo ahora, contaba el mes pasado
                if (c.active !== false) return true;
                
                // Si está inactivo, solo contaba si se desactivó este mes o antes
                if (!c.updated_date) {
                    // If no updated_date, assume it was active before this month's start
                    return true;
                }
                const updatedDate = parseISOAsUTC(c.updated_date);
                // If updated_date is within current month, it means it became inactive this month, so it was active last month.
                // If updated_date is before current month, it was already inactive last month, so don't count.
                return updatedDate >= currentMonthStart; 
            });
            
            const totalClientsLastMonth = clientsActiveLastMonth.length;
            const clientsRetained = clientsActiveLastMonth.filter(c => c.active !== false).length;
            const clientRetentionRate = totalClientsLastMonth > 0 
                ? (clientsRetained / totalClientsLastMonth) * 100 
                : 100;

            // Valor promedio de servicio: ingreso promedio por cliente activo
            const clientsWithServicesThisMonth = new Set(
                currentMonthSchedules
                    .filter(s => !trainingClient || s.client_id !== trainingClient.id)
                    .map(s => s.client_id)
            );
            const averageServiceValue = clientsWithServicesThisMonth.size > 0 
                ? monthlyRevenue / clientsWithServicesThisMonth.size 
                : 0;

            // Servicios por frecuencia
            const frequencyCounts = {};
            activeClients.forEach(client => {
                const freq = client.service_frequency || 'unknown';
                frequencyCounts[freq] = (frequencyCounts[freq] || 0) + 1;
            });

            const frequencyLabels = {
                weekly: 'Semanal',
                fortnightly: 'Quincenal',
                every_3_weeks: 'Cada 3 Semanas',
                monthly: 'Mensual',
                one_off: 'Servicio Único'
            };

            const servicesByFrequency = Object.entries(frequencyCounts).map(([freq, count]) => ({
                name: frequencyLabels[freq] || freq,
                value: count
            }));

            // ========== SERVICIOS COMPLETADOS ==========
            const completedServices = currentMonthSchedules.filter(s => 
                s.status === 'completed' && (!trainingClient || s.client_id !== trainingClient.id)
            ).length;

            // ========== LIMPIADORES ACTIVOS ==========
            const activeCleaners = allUsers.filter(u => u.role !== 'admin' && u.active !== false).length;

            // ========== RENDIMIENTO POR LIMPIADOR ==========
            const cleanerPerformanceData = {};
            const clientFacingEntries = currentMonthEntries.filter(e => !trainingClient || e.client_id !== trainingClient.id);

            clientFacingEntries.forEach(entry => {
                const cleanerName = entry.cleaner_name || 'Desconocido';
                if (!cleanerPerformanceData[cleanerName]) {
                    cleanerPerformanceData[cleanerName] = {
                        name: cleanerName,
                        totalCost: 0,
                        hours: 0
                    };
                }
                cleanerPerformanceData[cleanerName].totalCost += entry.total_amount || 0;
                cleanerPerformanceData[cleanerName].hours += entry.hours || 0;
            });

            const cleanerPerformance = Object.values(cleanerPerformanceData)
                .sort((a, b) => b.hours - a.hours)
                .slice(0, 10);

            // Top performer
            const topPerformer = cleanerPerformance.length > 0 ? cleanerPerformance[0] : null;

            // ========== DESGLOSE DE ACTIVIDADES ==========
            const activityCount = {};
            currentMonthEntries.forEach(entry => {
                const activity = entry.activity || 'otros';
                activityCount[activity] = (activityCount[activity] || 0) + 1;
            });

            const activityLabels = {
                domestic: 'Doméstico',
                commercial: 'Comercial',
                windows: 'Ventanas',
                steam_vacuum: 'Vapor/Aspirado',
                entrenamiento: 'Entrenamiento',
                otros: 'Otros'
            };

            const activityBreakdown = Object.entries(activityCount).map(([activity, count]) => ({
                name: activityLabels[activity] || activity,
                value: count
            }));

            // ========== TOP CLIENTS POR INGRESOS ==========
            const clientRevenueMap = {};
            currentMonthSchedules.forEach(schedule => {
                const client = clientsMap.get(schedule.client_id);
                if (!client || (trainingClient && schedule.client_id === trainingClient.id)) return;
                
                const revenue = calculateScheduleRevenue(schedule, client);
                if (!clientRevenueMap[client.name]) {
                    clientRevenueMap[client.name] = 0;
                }
                clientRevenueMap[client.name] += revenue;
            });

            const topClients = Object.entries(clientRevenueMap)
                .map(([name, revenue]) => ({ name, revenue }))
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 5);

            // ========== PROYECCIONES ==========
            const daysInMonth = differenceInDays(currentMonthEnd, currentMonthStart) + 1;
            const daysPassed = differenceInDays(now, currentMonthStart) + 1;
            const projectedMonthlyRevenue = daysPassed > 0 ? (monthlyRevenue / daysPassed) * daysInMonth : 0;

            const hoursGrowthTrend = hoursChange;

            // ========== ACTIVIDAD SEMANAL (últimos 7 días) ==========
            const weeklyActivity = [];
            for (let i = 0; i < 7; i++) {
                const day = addDays(now, -6 + i);
                const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
                const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);
                
                const dayEntries = currentMonthEntries.filter(e => {
                    const date = parseISOAsUTC(e.work_date);
                    return date && date >= dayStart && date <= dayEnd;
                });

                const dayRevenue = allSchedules
                    .filter(s => {
                        if (!s.xero_invoiced || !s.start_time) return false;
                        const date = parseISOAsUTC(s.start_time);
                        return date && date >= dayStart && date <= dayEnd;
                    })
                    .reduce((sum, schedule) => {
                        const client = clientsMap.get(schedule.client_id);
                        if (trainingClient && schedule.client_id === trainingClient.id) return sum;
                        return sum + calculateScheduleRevenue(schedule, client);
                    }, 0);

                weeklyActivity.push({
                    day: format(day, 'EEE', { locale: es }),
                    horas: dayEntries.reduce((sum, e) => sum + (e.hours || 0), 0),
                    ingresos: dayRevenue
                });
            }

            // ========== TENDENCIA MENSUAL (últimos 6 meses) ==========
            const monthlyTrend = [];
            for (let i = 5; i >= 0; i--) {
                const monthDate = subMonths(now, i);
                const monthStart = startOfMonth(monthDate);
                const monthEnd = endOfMonth(monthDate);

                const monthSchedules = allSchedules.filter(s => {
                    if (!s.xero_invoiced || !s.start_time) return false;
                    const date = parseISOAsUTC(s.start_time);
                    return date && date >= monthStart && date <= monthEnd;
                });

                const monthRevenue = monthSchedules.reduce((sum, schedule) => {
                    const client = clientsMap.get(schedule.client_id);
                    if (trainingClient && schedule.client_id === trainingClient.id) return sum;
                    return sum + calculateScheduleRevenue(schedule, client);
                }, 0);

                monthlyTrend.push({
                    month: format(monthStart, 'MMM', { locale: es }),
                    ingresos: monthRevenue
                });
            }

            // ========== SERVICIOS POR TIPO (domestic vs commercial) ==========
            const typeCount = {};
            activeClients.forEach(client => {
                const type = client.client_type || 'domestic';
                typeCount[type] = (typeCount[type] || 0) + 1;
            });

            const typeLabels = {
                domestic: 'Doméstico',
                commercial: 'Comercial',
                training: 'Entrenamiento'
            };

            const servicesByType = Object.entries(typeCount).map(([type, count]) => ({
                name: typeLabels[type] || type,
                value: count
            }));

            // ========== REPORTES Y TAREAS ==========
            const recentReports = allReports
                .filter(r => r.status === 'pending' || r.status === 'in_review')
                .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
                .slice(0, 5);

            const pendingTasks = allTasks.filter(t => 
                t.status === 'pending' && 
                parseISOAsUTC(t.due_date) <= addDays(now, 7)
            );

            // ========== VEHÍCULOS ==========
            const availableVehicles = allVehicles.filter(v => v.status === 'active').length;
            const totalVehicles = allVehicles.length;

            // ========== ALERTAS ==========
            const alerts = [];
            
            if (underPricedClients.length > 0) {
                alerts.push({
                    type: 'warning',
                    message: `${underPricedClients.length} cliente(s) con precio por debajo del umbral mínimo`
                });
            }

            if (recentReports.length > 0) {
                alerts.push({
                    type: 'info',
                    message: `${recentReports.length} reporte(s) de servicio pendientes de revisión`
                });
            }

            if (pendingTasks.length > 0) {
                alerts.push({
                    type: 'info',
                    message: `${pendingTasks.length} tarea(s) pendientes para los próximos 7 días`
                });
            }

            setData({
                // KPIs principales
                monthlyRevenue,
                monthlyHours,
                activeClients: activeClients.length, // Updated from activeClientsFilter
                activeCleaners,
                completedServices,
                pendingInvoices: allInvoices.filter(i => i.status !== 'paid').length,
                revenueChange,
                hoursChange,
                
                // Métricas de Rentabilidad
                grossMargin,
                averageLaborCostPerHour,
                trainingCosts,
                trainingHours,
                
                // Rentabilidad Completa
                fixedCosts,
                totalCosts,
                netMargin,
                netMarginPercentage,
                underPricedClients: underPricedClients.slice(0, 10),
                
                // Análisis de Clientes
                newClientsThisMonth,
                lostClientsThisMonth,
                newClientsList,
                lostClientsList,
                clientRetentionRate,
                averageServiceValue,
                servicesByFrequency,
                
                // Proyecciones
                projectedMonthlyRevenue,
                hoursGrowthTrend,
                
                // Gráficos
                weeklyActivity,
                monthlyTrend,
                servicesByType,
                topClients,
                
                // Reportes
                cleanerPerformance,
                topPerformer,
                activityBreakdown,
                
                // Actividad
                recentReports,
                pendingTasks,
                availableVehicles,
                totalVehicles,
                alerts
            });
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-16 h-16 animate-spin text-blue-500 mx-auto mb-4" />
                    <p className="text-white text-xl">Cargando Dashboard...</p>
                </div>
            </div>
        );
    }

    const StatCard = ({ icon: Icon, title, value, subtitle, trend, color = "blue" }) => {
        const colorClasses = {
            blue: "from-blue-500 to-blue-600",
            green: "from-green-500 to-green-600",
            purple: "from-purple-500 to-purple-600",
            orange: "from-orange-500 to-orange-600",
            red: "from-red-500 to-red-600",
            teal: "from-teal-500 to-teal-600"
        };

        return (
            <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-xl p-4 text-white shadow-xl`}>
                <div className="flex items-center justify-between mb-2">
                    <Icon className="w-10 h-10 opacity-80" />
                    {trend !== undefined && (
                        <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-full">
                            {trend >= 0 ? (
                                <TrendingUp className="w-4 h-4" />
                            ) : (
                                <TrendingDown className="w-4 h-4" />
                            )}
                            <span className="text-lg font-bold">{Math.abs(trend).toFixed(1)}%</span>
                        </div>
                    )}
                </div>
                <h3 className="text-base font-medium opacity-90 mb-1">{title}</h3>
                <p className="text-3xl font-bold mb-1">{value}</p>
                {subtitle && <p className="text-sm opacity-80">{subtitle}</p>}
            </div>
        );
    };

    return (
        <div className="min-h-screen h-screen overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 p-4">
            {/* Botón flotante para toggle pantalla completa */}
            <button
                onClick={toggleFullscreen}
                className="fixed top-4 right-4 z-50 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full backdrop-blur-sm transition-all duration-300"
                title={isFullscreen ? "Salir de pantalla completa (ESC)" : "Pantalla completa"}
            >
                {isFullscreen ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                    </svg>
                )}
            </button>

            {/* Header */}
            <div className="mb-4 text-center">
                <h1 className="text-4xl font-bold text-white mb-1">RedOak Cleaning Solutions</h1>
                <p className="text-xl text-slate-300">
                    {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
                </p>
                <div className="mt-2 flex items-center justify-center gap-2">
                    {[...Array(TOTAL_SECTIONS)].map((_, i) => (
                        <div
                            key={i}
                            className={`h-2 rounded-full transition-all ${
                                i === currentSection ? 'w-8 bg-blue-500' : 'w-2 bg-slate-600'
                            }`}
                        />
                    ))}
                </div>
            </div>

            {/* Sección 0: KPIs Principales */}
            {currentSection === 0 && (
                <div className="h-[calc(100vh-140px)] flex flex-col animate-fadeIn">
                    <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
                        <Activity className="w-8 h-8" />
                        Resumen del Mes
                    </h2>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                        <StatCard
                            icon={DollarSign}
                            title="Ingresos del Mes"
                            value={`$${data.monthlyRevenue.toFixed(0)}`}
                            subtitle="AUD"
                            trend={data.revenueChange}
                            color="green"
                        />
                        <StatCard
                            icon={Clock}
                            title="Horas Trabajadas"
                            value={data.monthlyHours.toFixed(0)}
                            subtitle="horas"
                            trend={data.hoursChange}
                            color="blue"
                        />
                        <StatCard
                            icon={CheckCircle}
                            title="Servicios Completados"
                            value={data.completedServices}
                            subtitle="servicios"
                            color="purple"
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <StatCard
                            icon={Users}
                            title="Clientes Activos"
                            value={data.activeClients}
                            subtitle="clientes"
                            color="teal"
                        />
                        <StatCard
                            icon={UserCheck}
                            title="Limpiadores Activos"
                            value={data.activeCleaners}
                            subtitle="limpiadores"
                            color="orange"
                        />
                        <StatCard
                            icon={FileText}
                            title="Facturas Pendientes"
                            value={data.pendingInvoices}
                            subtitle="facturas"
                            color="red"
                        />
                    </div>
                </div>
            )}

            {/* Sección 1: Métricas de Rentabilidad */}
            {currentSection === 1 && (
                <div className="h-[calc(100vh-140px)] flex flex-col animate-fadeIn">
                    <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
                        <DollarSign className="w-8 h-8" />
                        Métricas de Rentabilidad
                    </h2>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <StatCard
                            icon={Target}
                            title="Margen Bruto"
                            value={`$${data.grossMargin.toFixed(0)}`}
                            subtitle={`${data.monthlyRevenue > 0 ? ((data.grossMargin / data.monthlyRevenue) * 100).toFixed(1) : 0}% de los ingresos`}
                            color="green"
                        />
                        <StatCard
                            icon={DollarSign}
                            title="Costo/Hora Promedio"
                            value={`$${data.averageLaborCostPerHour.toFixed(2)}`}
                            subtitle="AUD por hora"
                            color="blue"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <StatCard
                            icon={GraduationCap}
                            title="Costos de Entrenamiento"
                            value={`$${data.trainingCosts.toFixed(0)}`}
                            subtitle={`${data.trainingHours.toFixed(1)} horas de entrenamiento`}
                            color="purple"
                        />
                        <StatCard
                            icon={Briefcase}
                            title="Costos Fijos del Mes"
                            value={`$${data.fixedCosts.toFixed(0)}`}
                            subtitle="AUD"
                            color="orange"
                        />
                    </div>
                </div>
            )}

            {/* Sección 2: Rentabilidad Neta */}
            {currentSection === 2 && (
                <div className="h-[calc(100vh-140px)] flex flex-col animate-fadeIn">
                    <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
                        <Percent className="w-8 h-8" />
                        Rentabilidad Neta
                    </h2>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6 text-white shadow-xl">
                            <h3 className="text-xl font-medium opacity-90 mb-3">Desglose Financiero</h3>
                            <div className="space-y-3 text-lg">
                                <div className="flex justify-between border-b border-white/20 pb-2">
                                    <span>Ingresos:</span>
                                    <span className="font-bold">${data.monthlyRevenue.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between border-b border-white/20 pb-2">
                                    <span>Costos de M.O.:</span>
                                    <span className="font-bold">-${(data.monthlyRevenue - data.grossMargin).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between border-b border-white/20 pb-2">
                                    <span>Costos Fijos:</span>
                                    <span className="font-bold">-${data.fixedCosts.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-2xl font-bold pt-2">
                                    <span>Margen Neto:</span>
                                    <span className={data.netMargin >= 0 ? 'text-green-300' : 'text-red-300'}>
                                        ${data.netMargin.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <StatCard
                            icon={Percent}
                            title="Margen Neto %"
                            value={`${data.netMarginPercentage.toFixed(1)}%`}
                            subtitle="de los ingresos totales"
                            color={data.netMarginPercentage >= 20 ? "green" : data.netMarginPercentage >= 10 ? "orange" : "red"}
                        />
                    </div>
                    {data.underPricedClients.length > 0 && (
                        <div className="bg-red-900/50 border-2 border-red-500 rounded-xl p-4 flex-1 overflow-hidden">
                            <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                                <AlertTriangle className="w-6 h-6" />
                                Alerta: Clientes con Precio Bajo
                            </h3>
                            <div className="grid grid-cols-2 gap-3 max-h-[calc(100%-3rem)] overflow-auto">
                                {data.underPricedClients.slice(0, 6).map((client, i) => (
                                    <div key={i} className="bg-white/10 rounded-lg p-3">
                                        <p className="text-lg font-bold text-white mb-1">{client.clientName}</p>
                                        <p className="text-sm text-red-300">
                                            Precio: ${client.currentPrice.toFixed(2)} (Mín: ${client.minPrice.toFixed(2)})
                                        </p>
                                        <p className="text-sm text-red-200">
                                            {client.percentBelow.toFixed(1)}% por debajo del mínimo
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Sección 3: Análisis de Clientes */}
            {currentSection === 3 && (
                <div className="h-[calc(100vh-140px)] flex flex-col animate-fadeIn">
                    <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
                        <Users className="w-8 h-8" />
                        Análisis de Clientes
                    </h2>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                        <StatCard
                            icon={UserPlus}
                            title="Clientes Nuevos"
                            value={data.newClientsThisMonth}
                            subtitle="este mes"
                            color="green"
                        />
                        <StatCard
                            icon={UserMinus}
                            title="Clientes Perdidos"
                            value={data.lostClientsThisMonth}
                            subtitle="este mes"
                            color="red"
                        />
                        <StatCard
                            icon={Percent}
                            title="Retención"
                            value={`${data.clientRetentionRate.toFixed(1)}%`}
                            subtitle="tasa de retención"
                            color="blue"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4 flex-1 overflow-hidden">
                        {data.newClientsList.length > 0 && (
                            <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-xl p-4 text-white shadow-xl overflow-auto">
                                <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                                    <UserPlus className="w-6 h-6" />
                                    Clientes Nuevos
                                </h3>
                                <ul className="space-y-2 text-lg">
                                    {data.newClientsList.map((client, i) => (
                                        <li key={i} className="flex items-center gap-2">
                                            <CheckCircle className="w-5 h-5" />
                                            {client.name}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {data.lostClientsList.length > 0 && (
                            <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-xl p-4 text-white shadow-xl overflow-auto">
                                <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                                    <UserMinus className="w-6 h-6" />
                                    Clientes Perdidos
                                </h3>
                                <ul className="space-y-2 text-lg">
                                    {data.lostClientsList.map((client, i) => (
                                        <li key={i} className="flex items-center gap-2">
                                            <AlertTriangle className="w-5 h-5" />
                                            {client.name}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Sección 4: Distribución de Clientes */}
            {currentSection === 4 && (
                <div className="h-[calc(100vh-140px)] flex flex-col animate-fadeIn">
                    <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
                        <PieChartIcon className="w-8 h-8" />
                        Distribución de Clientes
                    </h2>
                    <div className="grid grid-cols-2 gap-4 flex-1">
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                            <h3 className="text-xl font-bold text-white mb-2">Por Frecuencia de Servicio</h3>
                            <ResponsiveContainer width="100%" height="90%">
                                <PieChart>
                                    <Pie
                                        data={data.servicesByFrequency}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={(entry) => `${entry.name}: ${entry.value}`}
                                        outerRadius={100}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {data.servicesByFrequency.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        contentStyle={{ 
                                            backgroundColor: 'rgba(0, 0, 0, 0.8)', 
                                            border: 'none', 
                                            borderRadius: '8px',
                                            fontSize: '14px'
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                            <h3 className="text-xl font-bold text-white mb-2">Por Tipo de Cliente</h3>
                            <ResponsiveContainer width="100%" height="90%">
                                <PieChart>
                                    <Pie
                                        data={data.servicesByType}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={(entry) => `${entry.name}: ${entry.value}`}
                                        outerRadius={100}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {data.servicesByType.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        contentStyle={{ 
                                            backgroundColor: 'rgba(0, 0, 0, 0.8)', 
                                            border: 'none', 
                                            borderRadius: '8px',
                                            fontSize: '14px'
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* Sección 5: Proyecciones */}
            {currentSection === 5 && (
                <div className="h-[calc(100vh-140px)] flex flex-col animate-fadeIn">
                    <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
                        <LineChartIcon className="w-8 h-8" />
                        Proyecciones y Tendencias
                    </h2>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <StatCard
                            icon={Target}
                            title="Proyección Fin de Mes"
                            value={`$${data.projectedMonthlyRevenue.toFixed(0)}`}
                            subtitle="ingresos proyectados"
                            color="green"
                        />
                        <StatCard
                            icon={TrendingUp}
                            title="Tendencia de Horas"
                            value={`${data.hoursGrowthTrend >= 0 ? '+' : ''}${data.hoursGrowthTrend.toFixed(1)}%`}
                            subtitle="vs mes anterior"
                            color={data.hoursGrowthTrend >= 0 ? "green" : "red"}
                        />
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 flex-1">
                        <h3 className="text-xl font-bold text-white mb-2">Tendencia de Ingresos (Últimos 6 Meses)</h3>
                        <ResponsiveContainer width="100%" height="90%">
                            <LineChart data={data.monthlyTrend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                                <XAxis dataKey="month" stroke="#ffffff" style={{ fontSize: '14px' }} />
                                <YAxis stroke="#ffffff" style={{ fontSize: '14px' }} />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: 'rgba(0, 0, 0, 0.8)', 
                                        border: 'none', 
                                        borderRadius: '8px',
                                        fontSize: '14px'
                                    }}
                                    formatter={(value) => `$${value.toFixed(2)}`}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="ingresos" 
                                    stroke="#10b981" 
                                    strokeWidth={3}
                                    dot={{ r: 6 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Sección 6: Actividad Semanal */}
            {currentSection === 6 && (
                <div className="h-[calc(100vh-140px)] flex flex-col animate-fadeIn">
                    <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
                        <Calendar className="w-8 h-8" />
                        Actividad de la Última Semana
                    </h2>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.weeklyActivity}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                                <XAxis dataKey="day" stroke="#ffffff" style={{ fontSize: '16px' }} />
                                <YAxis yAxisId="left" stroke="#3b82f6" style={{ fontSize: '14px' }} />
                                <YAxis yAxisId="right" orientation="right" stroke="#10b981" style={{ fontSize: '14px' }} />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: 'rgba(0, 0, 0, 0.8)', 
                                        border: 'none', 
                                        borderRadius: '8px',
                                        fontSize: '14px'
                                    }}
                                />
                                <Bar yAxisId="left" dataKey="horas" name="Horas" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                                <Bar yAxisId="right" dataKey="ingresos" name="Ingresos ($)" fill="#10b981" radius={[8, 8, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Sección 7: Top Clients */}
            {currentSection === 7 && (
                <div className="h-[calc(100vh-140px)] flex flex-col animate-fadeIn">
                    <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
                        <Star className="w-8 h-8" />
                        Top 5 Clientes del Mes
                    </h2>
                    <div className="space-y-3 flex-1 overflow-auto">
                        {data.topClients.map((client, index) => (
                            <div 
                                key={index}
                                className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl p-4 flex items-center justify-between shadow-xl"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-2xl ${
                                        index === 0 ? 'bg-yellow-500' :
                                        index === 1 ? 'bg-gray-400' :
                                        index === 2 ? 'bg-amber-600' : 'bg-purple-800'
                                    }`}>
                                        {index + 1}
                                    </div>
                                    <span className="text-2xl font-bold text-white">{client.name}</span>
                                </div>
                                <div className="text-right">
                                    <p className="text-3xl font-bold text-white">${client.revenue.toFixed(0)}</p>
                                    <p className="text-lg text-purple-200">AUD</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Sección 8: Rendimiento por Limpiador */}
            {currentSection === 8 && (
                <div className="h-[calc(100vh-140px)] flex flex-col animate-fadeIn">
                    <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
                        <Award className="w-8 h-8" />
                        Rendimiento por Limpiador
                    </h2>
                    {data.topPerformer && (
                        <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-xl p-4 text-white shadow-xl mb-4">
                            <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                                <Award className="w-6 h-6" />
                                Top Performer del Mes
                            </h3>
                            <p className="text-3xl font-bold">{data.topPerformer.name}</p>
                            <div className="flex gap-6 mt-3 text-lg">
                                <div>
                                    <p className="opacity-80">Horas:</p>
                                    <p className="text-2xl font-bold">{data.topPerformer.hours.toFixed(1)}</p>
                                </div>
                                <div>
                                    <p className="opacity-80">Costo Total:</p>
                                    <p className="text-2xl font-bold">${data.topPerformer.totalCost.toFixed(0)}</p>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.cleanerPerformance} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                                <XAxis type="number" stroke="#ffffff" style={{ fontSize: '12px' }} />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    stroke="#ffffff" 
                                    width={150}
                                    style={{ fontSize: '14px' }}
                                />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: 'rgba(0, 0, 0, 0.8)', 
                                        border: 'none', 
                                        borderRadius: '8px',
                                        fontSize: '14px'
                                    }}
                                />
                                <Bar dataKey="hours" name="Horas" fill="#3b82f6" radius={[0, 8, 8, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Sección 9: Desglose de Actividades */}
            {currentSection === 9 && (
                <div className="h-[calc(100vh-140px)] flex flex-col animate-fadeIn">
                    <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
                        <Briefcase className="w-8 h-8" />
                        Desglose de Actividades
                    </h2>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 mb-4" style={{ height: '60%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data.activityBreakdown}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={(entry) => `${entry.name}: ${entry.value}`}
                                    outerRadius={120}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {data.activityBreakdown.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: 'rgba(0, 0, 0, 0.8)', 
                                        border: 'none', 
                                        borderRadius: '8px',
                                        fontSize: '14px'
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        {data.activityBreakdown.map((activity, index) => (
                            <div 
                                key={index}
                                className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-3 text-white text-center shadow-xl"
                            >
                                <p className="text-base font-medium mb-1">{activity.name}</p>
                                <p className="text-3xl font-bold">{activity.value}</p>
                                <p className="text-sm opacity-80 mt-1">servicios</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Sección 10: Estado Operativo */}
            {currentSection === 10 && (
                <div className="h-[calc(100vh-140px)] flex flex-col animate-fadeIn">
                    <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-3">
                        <Activity className="w-8 h-8" />
                        Estado Operativo
                    </h2>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <StatCard
                            icon={AlertTriangle}
                            title="Reportes Pendientes"
                            value={data.recentReports.length}
                            subtitle="requieren atención"
                            color={data.recentReports.length > 0 ? "red" : "green"}
                        />
                        <StatCard
                            icon={FileText}
                            title="Tareas Pendientes"
                            value={data.pendingTasks.length}
                            subtitle="próximos 7 días"
                            color={data.pendingTasks.length > 5 ? "orange" : "green"}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4 flex-1">
                        <StatCard
                            icon={Car}
                            title="Vehículos Disponibles"
                            value={data.availableVehicles}
                            subtitle={`de ${data.totalVehicles} totales`}
                            color="blue"
                        />
                        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-4 text-white shadow-xl overflow-auto">
                            <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                                <Zap className="w-6 h-6" />
                                Alertas
                            </h3>
                            {data.alerts.length > 0 ? (
                                <ul className="space-y-2">
                                    {data.alerts.map((alert, i) => (
                                        <li key={i} className="flex items-start gap-2 text-base">
                                            {alert.type === 'warning' && <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-1" />}
                                            {alert.type === 'info' && <Activity className="w-5 h-5 flex-shrink-0 mt-1" />}
                                            <span>{alert.message}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-lg">✓ Todo en orden</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
