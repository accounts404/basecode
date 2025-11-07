
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User } from '@/entities/User';
import { Client } from '@/entities/Client';
import { WorkEntry } from '@/entities/WorkEntry';
import { Schedule } from '@/entities/Schedule';
import { Invoice } from '@/entities/Invoice';
import { ServiceReport } from '@/entities/ServiceReport';
import { Vehicle } from '@/entities/Vehicle';
import { Task } from '@/entities/Task';
// Removed MonthlyCleanerScore as it's no longer used
import { format, startOfMonth, endOfMonth, subMonths, addDays, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    DollarSign,
    Users,
    Clock,
    TrendingUp,
    TrendingDown,
    Calendar,
    AlertTriangle,
    CheckCircle,
    Briefcase,
    FileText,
    Activity,
    Award,
    UserCheck,
    Bell,
    ChevronRight,
    Loader2,
    Percent,
    Target,
    GraduationCap,
    UserPlus,
    UserMinus,
    Star,
    LineChart as LineChartIcon
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

// Helper para parsear ISO strings como UTC
const parseISOAsUTC = (isoString) => {
    if (!isoString) return null;
    const correctedIsoString = isoString.endsWith('Z') ? isoString : `${isoString}Z`;
    return new Date(correctedIsoString);
};

// Helper para formatear la hora UTC (HH:mm) - Not used in this file but keeping as it's a helper
const formatTimeUTC = (isoString) => {
    if (!isoString) return '';
    const date = parseISOAsUTC(isoString);
    if (!date) return '';
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
};

// Helper para calcular el monto base (sin GST) de un schedule
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

export default function AdminDashboard() {
    const [loading, setLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState({
        // KPIs principales
        monthlyRevenue: 0,
        monthlyHours: 0,
        activeClients: 0,
        activeCleaners: 0,
        completedServices: 0,
        pendingInvoices: 0,

        // Comparaciones
        revenueChange: 0,
        hoursChange: 0,

        // Métricas de Rentabilidad
        grossMargin: 0,
        averageLaborCostPerHour: 0,
        trainingCosts: 0,
        trainingHours: 0,

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

        // Datos para gráficos
        weeklyActivity: [],
        monthlyTrend: [],
        servicesByType: [],
        topClients: [],

        // Reportes y Tareas
        recentReports: [],
        pendingTasks: [],

        // Estado de la flota
        availableVehicles: 0,
        totalVehicles: 0,

        // Alertas
        alerts: []
    });

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        setLoading(true);
        try {
            const now = new Date();

            // Calculamos los rangos de fechas en UTC para consistencia
            const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
            const currentMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
            const lastMonthNow = subMonths(now, 1);
            const lastMonthStart = new Date(Date.UTC(lastMonthNow.getUTCFullYear(), lastMonthNow.getUTCMonth(), 1, 0, 0, 0, 0));
            const lastMonthEnd = new Date(Date.UTC(lastMonthNow.getUTCFullYear(), lastMonthNow.getUTCMonth() + 1, 0, 23, 59, 59, 999));

            // Cargar todos los datos necesarios
            const [
                allClients,
                allUsers,
                allWorkEntries,
                allSchedules,
                allInvoices,
                allReports,
                allVehicles,
                allTasks,
                // Removed allScores as it's no longer needed for Quality & Satisfaction
            ] = await Promise.all([
                Client.list(),
                User.list(),
                WorkEntry.list('-work_date'),
                Schedule.list('-start_time'),
                Invoice.list('-created_date'),
                ServiceReport.list('-created_date'),
                Vehicle.list(),
                Task.list(),
                // Removed MonthlyCleanerScore.list()
            ]);

            // Identificar el cliente TRAINING
            const trainingClient = allClients.find(c =>
                c.name?.toUpperCase() === 'TRAINING' || c.client_type === 'training'
            );

            // Filtrar datos del mes actual
            const currentMonthEntries = allWorkEntries.filter(e => {
                const date = parseISOAsUTC(e.work_date);
                return date && date >= currentMonthStart && date <= currentMonthEnd;
            });

            const lastMonthEntries = allWorkEntries.filter(e => {
                const date = parseISOAsUTC(e.work_date);
                return date && date >= lastMonthStart && date <= lastMonthEnd;
            });

            // Filtrar schedules facturados del mes actual
            const currentMonthSchedules = allSchedules.filter(s => {
                if (!s.xero_invoiced || !s.start_time) return false;
                const date = parseISOAsUTC(s.start_time);
                return date && date >= currentMonthStart && date <= currentMonthEnd;
            });

            // Crear mapa de clientes para búsqueda rápida
            const clientsMap = new Map(allClients.map(c => [c.id, c]));

            // CALCULAR COSTO DE ENTRENAMIENTO (del cliente TRAINING)
            let trainingCosts = 0;
            let trainingHours = 0;

            if (trainingClient) {
                const trainingEntries = currentMonthEntries.filter(e => e.client_id === trainingClient.id);
                trainingCosts = trainingEntries.reduce((sum, e) => sum + (e.total_amount || 0), 0);
                trainingHours = trainingEntries.reduce((sum, e) => sum + (e.hours || 0), 0);
            }

            // CALCULAR MARGEN BRUTO (Ingresos - Costo de Mano de Obra, excluyendo TRAINING)
            // Ingresos: suma de schedules facturados (sin GST)
            const monthlyRevenue = currentMonthSchedules.reduce((sum, schedule) => {
                const client = clientsMap.get(schedule.client_id);
                // Excluir cliente TRAINING de ingresos
                if (trainingClient && schedule.client_id === trainingClient.id) return sum;
                return sum + calculateScheduleRevenue(schedule, client);
            }, 0);

            // Costo de Mano de Obra: suma de work entries (excluyendo TRAINING)
            const monthlyLaborCost = currentMonthEntries
                .filter(e => !trainingClient || e.client_id !== trainingClient.id)
                .reduce((sum, e) => sum + (e.total_amount || 0), 0);

            const grossMargin = monthlyRevenue > 0 ? ((monthlyRevenue - monthlyLaborCost) / monthlyRevenue) * 100 : 0;

            // CALCULAR COSTO PROMEDIO POR HORA (excluyendo TRAINING)
            const monthlyHours = currentMonthEntries
                .filter(e => !trainingClient || e.client_id !== trainingClient.id)
                .reduce((sum, e) => sum + (e.hours || 0), 0);

            const averageLaborCostPerHour = monthlyHours > 0 ? monthlyLaborCost / monthlyHours : 0;

            // Calcular cambios vs mes anterior
            const lastMonthRevenue = allSchedules
                .filter(s => {
                    if (!s.xero_invoiced || !s.start_time) return false;
                    const date = parseISOAsUTC(s.start_time);
                    return date && date >= lastMonthStart && date <= lastMonthEnd;
                })
                .reduce((sum, schedule) => {
                    const client = clientsMap.get(schedule.client_id);
                    if (trainingClient && schedule.client_id === trainingClient.id) return sum;
                    return sum + calculateScheduleRevenue(schedule, client);
                }, 0);

            const revenueChange = lastMonthRevenue > 0 ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;

            const lastMonthHours = lastMonthEntries
                .filter(e => !trainingClient || e.client_id !== trainingClient.id)
                .reduce((sum, e) => sum + (e.hours || 0), 0);
            const hoursChange = lastMonthHours > 0 ? ((monthlyHours - lastMonthHours) / lastMonthHours) * 100 : 0;

            const activeClients = allClients.filter(c => c.active !== false).length;
            const activeCleaners = allUsers.filter(u => u.role !== 'admin' && u.active !== false).length;

            const completedSchedulesCount = allSchedules.filter(s => {
                const date = parseISOAsUTC(s.start_time);
                // Exclude training client for consistency with averageServiceValue if it uses monthlyRevenue
                return date && s.status === 'completed' && date >= currentMonthStart && date <= currentMonthEnd && (!trainingClient || s.client_id !== trainingClient.id);
            }).length;

            const pendingInvoices = allInvoices.filter(i => i.status === 'submitted' || i.status === 'reviewed').length;

            // === ANÁLISIS DE CLIENTES ===

            // Clientes nuevos y perdidos
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

            const lostClientsList = allClients.filter(c => {
                if (c.active !== false || !c.updated_date) return false; // Client must be inactive and updated this month
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

            // Tasa de retención
            const totalClientsLastMonth = allClients.filter(c => {
                if (!c.created_date) return false; // Must have creation date
                const date = parseISOAsUTC(c.created_date);
                return date && date < currentMonthStart; // Clients active before current month
            }).length;

            const clientRetentionRate = totalClientsLastMonth > 0
                ? (((totalClientsLastMonth - lostClientsThisMonth) / totalClientsLastMonth) * 100)
                : 100; // If no clients last month, 100% retention implies no clients lost.

            // Valor promedio de servicio
            const averageServiceValue = completedSchedulesCount > 0 ? monthlyRevenue / completedSchedulesCount : 0;

            // Servicios por frecuencia
            const frequencyCounts = {};
            allClients.filter(c => c.active !== false).forEach(c => { // All active clients, including training if active
                const freq = c.service_frequency || 'unknown';
                frequencyCounts[freq] = (frequencyCounts[freq] || 0) + 1;
            });

            const servicesByFrequency = Object.entries(frequencyCounts).map(([frequency, count]) => ({
                frequency: frequency === 'weekly' ? 'Semanal' :
                    frequency === 'fortnightly' ? 'Quincenal' :
                        frequency === 'every_3_weeks' ? 'Cada 3 Semanas' :
                            frequency === 'monthly' ? 'Mensual' :
                                frequency === 'one_off' ? 'Servicio Único' : 'Desconocido',
                count
            })).sort((a, b) => b.count - a.count);

            // Removed CALIDAD Y SATISFACCIÓN section calculations

            // === PROYECCIONES ===

            // Proyección de ingresos al final del mes
            const daysPassedInMonth = differenceInDays(now, currentMonthStart) + 1;
            const totalDaysInMonth = differenceInDays(currentMonthEnd, currentMonthStart) + 1;
            const projectedMonthlyRevenue = daysPassedInMonth > 0
                ? (monthlyRevenue / daysPassedInMonth) * totalDaysInMonth
                : 0;

            // Tendencia de crecimiento de horas
            const hoursGrowthTrend = hoursChange;

            // === ACTIVIDAD SEMANAL ===
            const weeklyActivity = [];
            for (let i = 6; i >= 0; i--) {
                const dayDate = addDays(now, -i);
                const dayStart = new Date(Date.UTC(dayDate.getUTCFullYear(), dayDate.getUTCMonth(), dayDate.getUTCDate(), 0, 0, 0));
                const dayEnd = new Date(Date.UTC(dayDate.getUTCFullYear(), dayDate.getUTCMonth(), dayDate.getUTCDate(), 23, 59, 59));

                const dayEntries = allWorkEntries.filter(e => {
                    const date = parseISOAsUTC(e.work_date);
                    return date && date >= dayStart && date <= dayEnd && (!trainingClient || e.client_id !== trainingClient.id);
                });

                const dayHours = dayEntries.reduce((sum, e) => sum + (e.hours || 0), 0);
                const dayRevenue = dayEntries.reduce((sum, e) => sum + (e.total_amount || 0), 0); // Using work entry total_amount for weekly activity

                weeklyActivity.push({
                    day: format(dayDate, 'EEE', { locale: es }),
                    hours: parseFloat(dayHours.toFixed(1)),
                    revenue: parseFloat(dayRevenue.toFixed(0))
                });
            }

            // === TENDENCIA MENSUAL (últimos 6 meses) ===
            const monthlyTrend = [];
            for (let i = 5; i >= 0; i--) {
                const monthDate = subMonths(now, i);
                const monthStart = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1, 0, 0, 0));
                const monthEnd = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0, 23, 59, 59));

                const monthSchedules = allSchedules.filter(s => {
                    if (!s.xero_invoiced || !s.start_time) return false;
                    const date = parseISOAsUTC(s.start_time);
                    return date && date >= monthStart && date <= monthEnd;
                });

                const monthRevenue = monthSchedules.reduce((sum, schedule) => {
                    const client = clientsMap.get(schedule.client_id);
                    if (trainingClient && schedule.client_id === trainingClient.id) return sum;
                    return sum + calculateScheduleRevenue(schedule, client); // Using billed revenue for monthly trend
                }, 0);

                monthlyTrend.push({
                    month: format(monthDate, 'MMM', { locale: es }),
                    revenue: parseFloat(monthRevenue.toFixed(0))
                });
            }

            // === SERVICIOS POR TIPO ===
            const servicesByTypeAggregated = {};
            currentMonthEntries.filter(e => !trainingClient || e.client_id !== trainingClient.id).forEach(e => {
                const type = e.activity || 'otros';
                if (!servicesByTypeAggregated[type]) {
                    servicesByTypeAggregated[type] = { name: type, value: 0, hours: 0 };
                }
                servicesByTypeAggregated[type].value += e.total_amount || 0; // Using work entry total_amount for service type distribution
                servicesByTypeAggregated[type].hours += e.hours || 0;
            });

            const servicesByType = Object.values(servicesByTypeAggregated)
                .sort((a, b) => b.value - a.value)
                .map(s => ({
                    name: s.name === 'domestic' ? 'Doméstico' :
                        s.name === 'commercial' ? 'Comercial' :
                            s.name === 'windows' ? 'Ventanas' :
                                s.name === 'steam_vacuum' ? 'Vapor/Aspirado' : 'Otros',
                    value: parseFloat(s.value.toFixed(0)),
                    hours: parseFloat(s.hours.toFixed(1))
                }));

            // === TOP CLIENTES ===
            const clientStats = {};

            // Calculate revenue and service count from schedules
            currentMonthSchedules.forEach(schedule => {
                const client = clientsMap.get(schedule.client_id);
                if (!client || (trainingClient && client.id === trainingClient.id)) return;

                if (!clientStats[client.id]) {
                    clientStats[client.id] = { name: client.name, revenue: 0, hours: 0, services: 0 };
                }
                clientStats[client.id].revenue += calculateScheduleRevenue(schedule, client);
                clientStats[client.id].services += 1;
            });

            // Calculate hours from work entries
            currentMonthEntries.filter(e => !trainingClient || e.client_id !== trainingClient.id).forEach(e => {
                const client = clientsMap.get(e.client_id);
                if (!client) return;
                if (clientStats[client.id]) {
                    clientStats[client.id].hours += e.hours || 0;
                }
            });

            const topClients = Object.values(clientStats)
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 5)
                .map(c => ({
                    ...c,
                    revenue: parseFloat(c.revenue.toFixed(0)),
                    hours: parseFloat(c.hours.toFixed(1))
                }));

            // === REPORTES Y TAREAS RECIENTES ===
            const recentReports = allReports
                .filter(r => r.status === 'pending' || r.status === 'in_review')
                .sort((a, b) => {
                    const dateA = parseISOAsUTC(b.created_date); // Newest first
                    const dateB = parseISOAsUTC(a.created_date);
                    return dateA - dateB;
                })
                .slice(0, 5);

            const pendingTasks = allTasks
                .filter(t => t.status === 'pending' || t.status === 'in_progress')
                .sort((a, b) => {
                    const dateA = parseISOAsUTC(a.due_date); // Oldest first
                    const dateB = parseISOAsUTC(b.due_date);
                    return dateA - dateB;
                })
                .slice(0, 5);

            // === ESTADO DE LA FLOTA ===
            const availableVehicles = allVehicles.filter(v => v.status === 'active').length;
            const totalVehicles = allVehicles.length;

            // === ALERTAS ===
            const alerts = [];

            if (pendingInvoices > 5) {
                alerts.push({
                    type: 'warning',
                    message: `${pendingInvoices} factura${pendingInvoices > 1 ? 's' : ''} pendiente${pendingInvoices > 1 ? 's' : ''} de revisión`,
                    link: createPageUrl('Facturas')
                });
            }

            // Calculate pending reports for alert, now that it's not part of state
            const pendingReportsCount = allReports.filter(r => r.status === 'pending' || r.status === 'in_review').length;
            if (pendingReportsCount > 3) {
                alerts.push({
                    type: 'warning',
                    message: `${pendingReportsCount} reporte${pendingReportsCount > 1 ? 's' : ''} de servicio pendiente${pendingReportsCount > 1 ? 's' : ''}`,
                    link: createPageUrl('ReportesServicio')
                });
            }

            if (revenueChange < -10) {
                alerts.push({
                    type: 'error',
                    message: `Ingresos han disminuido ${Math.abs(revenueChange).toFixed(1)}% vs mes anterior`,
                    link: createPageUrl('Reportes')
                });
            }

            const vehiclesInMaintenance = allVehicles.filter(v => v.status === 'maintenance').length;
            if (vehiclesInMaintenance > 0) {
                alerts.push({
                    type: 'warning',
                    message: `${vehiclesInMaintenance} vehículo${vehiclesInMaintenance > 1 ? 's' : ''} en mantenimiento`,
                    link: createPageUrl('GestionFlota')
                });
            }

            if (lostClientsThisMonth > 0) {
                alerts.push({
                    type: 'warning',
                    message: `${lostClientsThisMonth} cliente${lostClientsThisMonth > 1 ? 's perdidos' : ' perdido'} este mes`,
                    link: createPageUrl('Clientes')
                });
            }

            setDashboardData({
                monthlyRevenue: parseFloat(monthlyRevenue.toFixed(0)),
                monthlyHours: parseFloat(monthlyHours.toFixed(0)),
                activeClients,
                activeCleaners,
                completedServices: completedSchedulesCount,
                pendingInvoices,
                revenueChange: parseFloat(revenueChange.toFixed(1)),
                hoursChange: parseFloat(hoursChange.toFixed(1)),
                grossMargin: parseFloat(grossMargin.toFixed(1)),
                averageLaborCostPerHour: parseFloat(averageLaborCostPerHour.toFixed(2)),
                trainingCosts: parseFloat(trainingCosts.toFixed(0)),
                trainingHours: parseFloat(trainingHours.toFixed(1)),
                newClientsThisMonth,
                lostClientsThisMonth,
                newClientsList,
                lostClientsList,
                clientRetentionRate: parseFloat(clientRetentionRate.toFixed(1)),
                averageServiceValue: parseFloat(averageServiceValue.toFixed(0)),
                servicesByFrequency,
                // Removed: pendingReports, resolvedReports, reportResolutionRate, topCleanerScore, bottomCleanerScore
                projectedMonthlyRevenue: parseFloat(projectedMonthlyRevenue.toFixed(0)),
                hoursGrowthTrend: parseFloat(hoursGrowthTrend.toFixed(1)),
                weeklyActivity,
                monthlyTrend,
                servicesByType,
                topClients,
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
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto" />
                    <p className="text-slate-600 font-medium">Cargando panel de control...</p>
                </div>
            </div>
        );
    }

    const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-4 md:p-8">
            <div className="max-w-[1920px] mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
                            Panel de Control Ejecutivo
                        </h1>
                        <p className="text-slate-600 mt-1 text-lg">
                            {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-sm py-2 px-4 bg-white">
                            <Activity className="w-4 h-4 mr-2" />
                            Sistema Activo
                        </Badge>
                    </div>
                </div>

                {/* Alertas */}
                {dashboardData.alerts.length > 0 && (
                    <div className="grid gap-3">
                        {dashboardData.alerts.map((alert, index) => (
                            <Link key={index} to={alert.link}>
                                <Card className={`cursor-pointer hover:shadow-lg transition-all duration-200 border-l-4 ${
                                    alert.type === 'warning' ? 'border-l-orange-500 bg-orange-50/50' :
                                        alert.type === 'error' ? 'border-l-red-500 bg-red-50/50' :
                                            'border-l-blue-500 bg-blue-50/50'
                                }`}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                {alert.type === 'warning' ? (
                                                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                                                ) : alert.type === 'error' ? (
                                                    <AlertTriangle className="w-5 h-5 text-red-600" />
                                                ) : (
                                                    <Bell className="w-5 h-5 text-blue-600" />
                                                )}
                                                <span className="font-medium text-slate-900">{alert.message}</span>
                                            </div>
                                            <ChevronRight className="w-5 h-5 text-slate-400" />
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                )}

                {/* KPIs Principales */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-xl hover:shadow-2xl transition-shadow">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium opacity-90">Ingresos del Mes</CardTitle>
                                <div className="p-2 bg-white/20 rounded-lg">
                                    <DollarSign className="w-5 h-5" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <p className="text-3xl font-bold">${dashboardData.monthlyRevenue.toFixed(0)}</p>
                                <div className="flex items-center gap-2 text-sm">
                                    {dashboardData.revenueChange >= 0 ? (
                                        <>
                                            <TrendingUp className="w-4 h-4" />
                                            <span>+{dashboardData.revenueChange.toFixed(1)}%</span>
                                        </>
                                    ) : (
                                        <>
                                            <TrendingDown className="w-4 h-4" />
                                            <span>{dashboardData.revenueChange.toFixed(1)}%</span>
                                        </>
                                    )}
                                    <span className="opacity-75">vs mes anterior</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-purple-600 to-purple-700 text-white shadow-xl hover:shadow-2xl transition-shadow">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium opacity-90">Horas Trabajadas</CardTitle>
                                <div className="p-2 bg-white/20 rounded-lg">
                                    <Clock className="w-5 h-5" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <p className="text-3xl font-bold">{dashboardData.monthlyHours.toFixed(0)}h</p>
                                <div className="flex items-center gap-2 text-sm">
                                    {dashboardData.hoursChange >= 0 ? (
                                        <>
                                            <TrendingUp className="w-4 h-4" />
                                            <span>+{dashboardData.hoursChange.toFixed(1)}%</span>
                                        </>
                                    ) : (
                                        <>
                                            <TrendingDown className="w-4 h-4" />
                                            <span>{dashboardData.hoursChange.toFixed(1)}%</span>
                                        </>
                                    )}
                                    <span className="opacity-75">vs mes anterior</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white shadow-xl hover:shadow-2xl transition-shadow">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium opacity-90">Clientes Activos</CardTitle>
                                <div className="p-2 bg-white/20 rounded-lg">
                                    <Users className="w-5 h-5" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <p className="text-3xl font-bold">{dashboardData.activeClients}</p>
                                <div className="flex items-center gap-2 text-sm opacity-90">
                                    <Briefcase className="w-4 h-4" />
                                    <span>{dashboardData.completedServices} servicios este mes</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-orange-600 to-orange-700 text-white shadow-xl hover:shadow-2xl transition-shadow">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium opacity-90">Equipo Activo</CardTitle>
                                <div className="p-2 bg-white/20 rounded-lg">
                                    <UserCheck className="w-5 h-5" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <p className="text-3xl font-bold">{dashboardData.activeCleaners}</p>
                                <div className="flex items-center gap-2 text-sm opacity-90">
                                    <Activity className="w-4 h-4" />
                                    <span>Limpiadores disponibles</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* === 1. MÉTRICAS DE RENTABILIDAD === */}
                <Card className="shadow-xl border-0">
                    <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b">
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <Percent className="w-6 h-6 text-blue-600" />
                            Métricas de Rentabilidad
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-xl border border-green-200">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-green-900">Margen Bruto</h3>
                                    <Target className="w-5 h-5 text-green-600" />
                                </div>
                                <p className="text-4xl font-bold text-green-700 mb-2">
                                    {dashboardData.grossMargin.toFixed(1)}%
                                </p>
                                <p className="text-xs text-green-600">Ingresos - Costos Laborales</p>
                            </div>

                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-200">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-blue-900">Costo/Hora Promedio</h3>
                                    <DollarSign className="w-5 h-5 text-blue-600" />
                                </div>
                                <p className="text-4xl font-bold text-blue-700 mb-2">
                                    ${dashboardData.averageLaborCostPerHour.toFixed(2)}
                                </p>
                                <p className="text-xs text-blue-600">Costo promedio de mano de obra</p>
                            </div>

                            <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-xl border border-purple-200">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-purple-900">Costos de Entrenamiento</h3>
                                    <GraduationCap className="w-5 h-5 text-purple-600" />
                                </div>
                                <p className="text-4xl font-bold text-purple-700 mb-2">
                                    ${dashboardData.trainingCosts.toFixed(0)}
                                </p>
                                <p className="text-xs text-purple-600">
                                    {dashboardData.trainingHours.toFixed(1)} horas de capacitación
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* === 2. ANÁLISIS DE CLIENTES === */}
                <Card className="shadow-xl border-0">
                    <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b">
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <Users className="w-6 h-6 text-blue-600" />
                            Análisis de Clientes
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                            {/* Clientes Nuevos con Lista */}
                            <Dialog>
                                <DialogTrigger asChild>
                                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-5 rounded-xl border border-green-200 cursor-pointer hover:shadow-md transition-shadow">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="p-2 bg-green-200 rounded-lg">
                                                <UserPlus className="w-5 h-5 text-green-700" />
                                            </div>
                                            <h3 className="text-sm font-semibold text-green-900">Nuevos Clientes</h3>
                                        </div>
                                        <p className="text-3xl font-bold text-green-700">
                                            {dashboardData.newClientsThisMonth}
                                        </p>
                                        <p className="text-xs text-green-600 mt-2">Click para ver detalles →</p>
                                    </div>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[600px] overflow-y-auto">
                                    <DialogHeader>
                                        <DialogTitle className="flex items-center gap-2">
                                            <UserPlus className="w-5 h-5 text-green-600" />
                                            Clientes Nuevos Este Mes
                                        </DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4 mt-4">
                                        {dashboardData.newClientsList.length > 0 ? (
                                            dashboardData.newClientsList.map((client) => (
                                                <Link key={client.id} to={`${createPageUrl('Clientes')}?client=${client.id}`}>
                                                    <Card className="hover:bg-slate-50 transition-colors cursor-pointer">
                                                        <CardContent className="p-4">
                                                            <div className="flex items-start justify-between">
                                                                <div className="flex-1">
                                                                    <h4 className="font-semibold text-slate-900 mb-1">{client.name}</h4>
                                                                    <div className="space-y-1 text-sm text-slate-600">
                                                                        <p>
                                                                            <span className="font-medium">Fecha de registro:</span>{' '}
                                                                            {format(parseISOAsUTC(client.date), "d 'de' MMMM, yyyy", { locale: es })}
                                                                        </p>
                                                                        {client.service_frequency && (
                                                                            <p>
                                                                                <span className="font-medium">Frecuencia:</span>{' '}
                                                                                {client.service_frequency === 'weekly' ? 'Semanal' :
                                                                                    client.service_frequency === 'fortnightly' ? 'Quincenal' :
                                                                                        client.service_frequency === 'every_3_weeks' ? 'Cada 3 Semanas' :
                                                                                            client.service_frequency === 'monthly' ? 'Mensual' :
                                                                                                'Servicio Único'}
                                                                            </p>
                                                                        )}
                                                                        {client.current_service_price && (
                                                                            <p>
                                                                                <span className="font-medium">Precio:</span> ${client.current_service_price}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                                                                    Nuevo
                                                                </Badge>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                </Link>
                                            ))
                                        ) : (
                                            <div className="text-center py-12 text-slate-500">
                                                <UserPlus className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                                <p>No hay clientes nuevos este mes</p>
                                            </div>
                                        )}
                                    </div>
                                </DialogContent>
                            </Dialog>

                            {/* Clientes Perdidos con Lista */}
                            <Dialog>
                                <DialogTrigger asChild>
                                    <div className="bg-gradient-to-br from-red-50 to-rose-50 p-5 rounded-xl border border-red-200 cursor-pointer hover:shadow-md transition-shadow">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="p-2 bg-red-200 rounded-lg">
                                                <UserMinus className="w-5 h-5 text-red-700" />
                                            </div>
                                            <h3 className="text-sm font-semibold text-red-900">Clientes Perdidos</h3>
                                        </div>
                                        <p className="text-3xl font-bold text-red-700">
                                            {dashboardData.lostClientsThisMonth}
                                        </p>
                                        <p className="text-xs text-red-600 mt-2">Click para ver detalles →</p>
                                    </div>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[600px] overflow-y-auto">
                                    <DialogHeader>
                                        <DialogTitle className="flex items-center gap-2">
                                            <UserMinus className="w-5 h-5 text-red-600" />
                                            Clientes Perdidos Este Mes
                                        </DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4 mt-4">
                                        {dashboardData.lostClientsList.length > 0 ? (
                                            dashboardData.lostClientsList.map((client) => (
                                                <Link key={client.id} to={`${createPageUrl('Clientes')}?client=${client.id}`}>
                                                    <Card className="hover:bg-slate-50 transition-colors cursor-pointer">
                                                        <CardContent className="p-4">
                                                            <div className="flex items-start justify-between">
                                                                <div className="flex-1">
                                                                    <h4 className="font-semibold text-slate-900 mb-1">{client.name}</h4>
                                                                    <div className="space-y-1 text-sm text-slate-600">
                                                                        <p>
                                                                            <span className="font-medium">Fecha de baja:</span>{' '}
                                                                            {format(parseISOAsUTC(client.date), "d 'de' MMMM, yyyy", { locale: es })}
                                                                        </p>
                                                                        {client.service_frequency && (
                                                                            <p>
                                                                                <span className="font-medium">Frecuencia que tenía:</span>{' '}
                                                                                {client.service_frequency === 'weekly' ? 'Semanal' :
                                                                                    client.service_frequency === 'fortnightly' ? 'Quincenal' :
                                                                                        client.service_frequency === 'every_3_weeks' ? 'Cada 3 Semanas' :
                                                                                            client.service_frequency === 'monthly' ? 'Mensual' :
                                                                                                'Servicio Único'}
                                                                            </p>
                                                                        )}
                                                                        {client.current_service_price && (
                                                                            <p>
                                                                                <span className="font-medium">Precio que tenía:</span> ${client.current_service_price}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                                                                    Inactivo
                                                                </Badge>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                </Link>
                                            ))
                                        ) : (
                                            <div className="text-center py-12 text-slate-500">
                                                <UserMinus className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                                <p>No hay clientes perdidos este mes</p>
                                                <p className="text-sm mt-2">¡Excelente retención!</p>
                                            </div>
                                        )}
                                    </div>
                                </DialogContent>
                            </Dialog>

                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-xl border border-blue-200">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-blue-200 rounded-lg">
                                        <Target className="w-5 h-5 text-blue-700" />
                                    </div>
                                    <h3 className="text-sm font-semibold text-blue-900">Retención</h3>
                                </div>
                                <p className="text-3xl font-bold text-blue-700">
                                    {dashboardData.clientRetentionRate.toFixed(1)}%
                                </p>
                            </div>

                            <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-5 rounded-xl border border-purple-200">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-purple-200 rounded-lg">
                                        <DollarSign className="w-5 h-5 text-purple-700" />
                                    </div>
                                    <h3 className="text-sm font-semibold text-purple-900">Valor Promedio</h3>
                                </div>
                                <p className="text-3xl font-bold text-purple-700">
                                    ${dashboardData.averageServiceValue.toFixed(0)}
                                </p>
                            </div>
                        </div>

                        {/* Servicios por Frecuencia */}
                        <div className="bg-slate-50 p-5 rounded-xl">
                            <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                Distribución por Frecuencia
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                {dashboardData.servicesByFrequency.map((item, index) => (
                                    <div key={index} className="bg-white p-4 rounded-lg border border-slate-200 text-center">
                                        <p className="text-xs text-slate-600 mb-1">{item.frequency}</p>
                                        <p className="text-2xl font-bold text-slate-900">{item.count}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Removed CALIDAD Y SATISFACCIÓN section */}

                {/* === 5. PROYECCIONES Y TENDENCIAS === */}
                <Card className="shadow-xl border-0">
                    <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b">
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <LineChartIcon className="w-6 h-6 text-blue-600" />
                            Proyecciones y Tendencias
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 rounded-xl border border-indigo-200">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-indigo-900">Proyección Fin de Mes</h3>
                                    <Target className="w-5 h-5 text-indigo-600" />
                                </div>
                                <p className="text-4xl font-bold text-indigo-700 mb-2">
                                    ${dashboardData.projectedMonthlyRevenue.toFixed(0)}
                                </p>
                                <p className="text-xs text-indigo-600">
                                    Estimado basado en ritmo actual
                                </p>
                            </div>

                            <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-xl border border-purple-200">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-purple-900">Tendencia de Horas</h3>
                                    {dashboardData.hoursGrowthTrend >= 0 ? (
                                        <TrendingUp className="w-5 h-5 text-green-600" />
                                    ) : (
                                        <TrendingDown className="w-5 h-5 text-red-600" />
                                    )}
                                </div>
                                <p className={`text-4xl font-bold mb-2 ${
                                    dashboardData.hoursGrowthTrend >= 0 ? 'text-green-700' : 'text-red-700'
                                }`}>
                                    {dashboardData.hoursGrowthTrend >= 0 ? '+' : ''}
                                    {dashboardData.hoursGrowthTrend.toFixed(1)}%
                                </p>
                                <p className="text-xs text-purple-600">
                                    Variación vs mes anterior
                                </p>
                            </div>
                        </div>

                        {/* Gráfico de Tendencia Mensual */}
                        <div className="bg-slate-50 p-5 rounded-xl">
                            <h3 className="text-sm font-semibold text-slate-900 mb-4">
                                Tendencia de Ingresos (6 meses)
                            </h3>
                            <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={dashboardData.monthlyTrend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="month" stroke="#64748b" />
                                    <YAxis stroke="#64748b" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                                        formatter={(value) => [`$${value}`, 'Ingresos']}
                                    />
                                    <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 5 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Gráficos existentes */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Actividad Semanal */}
                    <Card className="shadow-xl">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Activity className="w-5 h-5 text-blue-600" />
                                Actividad de la Semana
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={dashboardData.weeklyActivity}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="day" stroke="#64748b" />
                                    <YAxis stroke="#64748b" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                                        formatter={(value, name) => [
                                            name === 'hours' ? `${value}h` : `$${value}`,
                                            name === 'hours' ? 'Horas' : 'Ingresos'
                                        ]}
                                    />
                                    <Bar dataKey="hours" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                                    <Bar dataKey="revenue" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    {/* Distribución de Servicios */}
                    <Card className="shadow-xl">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Briefcase className="w-5 h-5 text-purple-600" />
                                Distribución de Servicios
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {dashboardData.servicesByType.length > 0 ? (
                                <div className="flex items-center justify-between gap-8">
                                    <ResponsiveContainer width="50%" height={200}>
                                        <PieChart>
                                            <Pie
                                                data={dashboardData.servicesByType}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                outerRadius={80}
                                                fill="#8884d8"
                                                dataKey="value" // Changed from 'count' to 'value' to match original calculation logic
                                            >
                                                {dashboardData.servicesByType.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value) => `$${value}`} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="flex-1 space-y-3">
                                        {dashboardData.servicesByType.map((service, index) => (
                                            <div key={index} className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-3 h-3 rounded-full"
                                                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                                    />
                                                    <span className="text-sm font-medium text-slate-700">{service.name}</span>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-slate-900">${service.value}</p>
                                                    <p className="text-xs text-slate-500">{service.hours}h</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-slate-500">
                                    <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                    <p>No hay datos de servicios este mes</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Top 5 Clientes */}
                <Card className="shadow-xl">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Award className="w-5 h-5 text-yellow-600" />
                            Top 5 Clientes del Mes
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {dashboardData.topClients.length > 0 ? (
                            <div className="space-y-4">
                                {dashboardData.topClients.map((client, index) => (
                                    <div key={index} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                                            {index + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-slate-900 truncate">{client.name}</p>
                                            <p className="text-sm text-slate-500">{client.services} servicios • {client.hours}h</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-emerald-700">${client.revenue}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-slate-500">
                                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>No hay datos de clientes este mes</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Reportes y Tareas */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Reportes Pendientes */}
                    <Card className="shadow-xl">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                                    Reportes Pendientes
                                </CardTitle>
                                <Link to={createPageUrl('ReportesServicio')}>
                                    <Button variant="ghost" size="sm">
                                        Ver todos
                                        <ChevronRight className="w-4 h-4 ml-1" />
                                    </Button>
                                </Link>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {dashboardData.recentReports.length > 0 ? (
                                <div className="space-y-3">
                                    {dashboardData.recentReports.map((report) => (
                                        <div key={report.id} className="flex items-start gap-3 p-3 bg-orange-50/50 rounded-lg border border-orange-100">
                                            <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-slate-900 truncate">{report.client_name}</p>
                                                <p className="text-sm text-slate-600 mt-1 line-clamp-2">{report.report_notes}</p>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <Badge variant="outline" className="text-xs">
                                                        {report.priority === 'urgent' ? 'Urgente' :
                                                            report.priority === 'high' ? 'Alta' :
                                                                report.priority === 'medium' ? 'Media' : 'Baja'}
                                                    </Badge>
                                                    <span className="text-xs text-slate-500">
                                                        {format(parseISOAsUTC(report.service_date), 'd MMM', { locale: es })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12 text-slate-500">
                                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500 opacity-50" />
                                    <p>No hay reportes pendientes</p>
                                    <p className="text-sm mt-1">¡Todo bajo control!</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Tareas de Hoy */}
                    <Card className="shadow-xl">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-blue-600" />
                                    Tareas para Hoy
                                </CardTitle>
                                <Link to={createPageUrl('Configuracion')}>
                                    <Button variant="ghost" size="sm">
                                        Ver todas
                                        <ChevronRight className="w-4 h-4 ml-1" />
                                    </Button>
                                </Link>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {dashboardData.pendingTasks.length > 0 ? (
                                <div className="space-y-3">
                                    {dashboardData.pendingTasks.map((task) => (
                                        <div key={task.id} className="flex items-start gap-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                                            <div className="flex-shrink-0 mt-1">
                                                <div className={`w-5 h-5 rounded border-2 ${
                                                    task.status === 'in_progress' ? 'border-blue-500 bg-blue-100' : 'border-slate-300'
                                                }`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-slate-900">{task.title}</p>
                                                {task.description && (
                                                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{task.description}</p>
                                                )}
                                                <Badge
                                                    variant="outline"
                                                    className={`mt-2 text-xs ${
                                                        task.priority === 'urgent' ? 'border-red-500 text-red-700' :
                                                            task.priority === 'high' ? 'border-orange-500 text-orange-700' :
                                                                task.priority === 'medium' ? 'border-blue-500 text-blue-700' :
                                                                    'border-slate-500 text-slate-700'
                                                    }`}
                                                >
                                                    {task.priority === 'urgent' ? 'Urgente' :
                                                        task.priority === 'high' ? 'Alta' :
                                                            task.priority === 'medium' ? 'Media' : 'Baja'}
                                                </Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12 text-slate-500">
                                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500 opacity-50" />
                                    <p>No hay tareas pendientes para hoy</p>
                                    <p className="text-sm mt-1">¡Agenda despejada!</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
