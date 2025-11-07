import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Users, FileText, TrendingUp, AlertCircle, Calendar, DollarSign } from 'lucide-react';
import KPIGrid from './admin/KPIGrid';
import ActionableAlerts from './admin/ActionableAlerts';
import ActivityChart from './admin/ActivityChart';
import RecentActivity from './admin/RecentActivity';
import TeamOverview from './admin/TeamOverview';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

export default function AdminDashboard() {
    const [loading, setLoading] = useState(true);
    const [dataLoading, setDataLoading] = useState({
        clients: true,
        users: true,
        schedules: true,
        workEntries: true,
    });
    
    const [clients, setClients] = useState([]);
    const [users, setUsers] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [workEntries, setWorkEntries] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchDataProgressively();
    }, []);

    // OPTIMIZACIÓN: Carga progresiva en lugar de Promise.all
    const fetchDataProgressively = async () => {
        try {
            // Paso 1: Cargar datos básicos más ligeros primero (usuarios y clientes activos)
            console.log('[AdminDashboard] 📊 Cargando datos básicos...');
            
            try {
                const usersData = await base44.entities.User.list();
                setUsers(usersData || []);
                setDataLoading(prev => ({ ...prev, users: false }));
                console.log('[AdminDashboard] ✅ Usuarios cargados:', usersData.length);
            } catch (err) {
                console.error('[AdminDashboard] Error cargando usuarios:', err);
            }

            try {
                const clientsData = await base44.entities.Client.list();
                setClients(clientsData || []);
                setDataLoading(prev => ({ ...prev, clients: false }));
                console.log('[AdminDashboard] ✅ Clientes cargados:', clientsData.length);
            } catch (err) {
                console.error('[AdminDashboard] Error cargando clientes:', err);
            }

            // Ya podemos mostrar el dashboard parcialmente
            setLoading(false);

            // Paso 2: Cargar schedules del mes actual (más relevante)
            console.log('[AdminDashboard] 📅 Cargando horarios del mes...');
            try {
                const currentMonth = format(new Date(), 'yyyy-MM');
                const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
                const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');
                
                // OPTIMIZACIÓN: Filtrar schedules por fecha en lugar de traer todos
                const schedulesData = await base44.entities.Schedule.list();
                const filteredSchedules = schedulesData.filter(s => {
                    const scheduleDate = s.start_time ? s.start_time.split('T')[0] : '';
                    return scheduleDate >= monthStart && scheduleDate <= monthEnd;
                });
                
                setSchedules(filteredSchedules || []);
                setDataLoading(prev => ({ ...prev, schedules: false }));
                console.log('[AdminDashboard] ✅ Horarios cargados:', filteredSchedules.length);
            } catch (err) {
                console.error('[AdminDashboard] Error cargando horarios:', err);
            }

            // Paso 3: Cargar work entries solo del mes actual y anterior (más relevante)
            console.log('[AdminDashboard] 💼 Cargando entradas de trabajo...');
            try {
                const currentMonth = format(new Date(), 'yyyy-MM');
                const lastMonth = format(subMonths(new Date(), 1), 'yyyy-MM');
                
                // OPTIMIZACIÓN: Filtrar work entries por período
                const workEntriesData = await base44.entities.WorkEntry.list();
                const recentWorkEntries = workEntriesData.filter(we => {
                    return we.period && (we.period.startsWith(currentMonth) || we.period.startsWith(lastMonth));
                });
                
                setWorkEntries(recentWorkEntries || []);
                setDataLoading(prev => ({ ...prev, workEntries: false }));
                console.log('[AdminDashboard] ✅ Entradas de trabajo cargadas:', recentWorkEntries.length);
            } catch (err) {
                console.error('[AdminDashboard] Error cargando work entries:', err);
            }

            console.log('[AdminDashboard] ✨ Carga completa');

        } catch (error) {
            console.error('[AdminDashboard] ❌ Error general:', error);
            setError(error.message);
            setLoading(false);
        }
    };

    // Cálculos memoizados para evitar recalcular en cada render
    const stats = useMemo(() => {
        const activeClients = clients.filter(c => c.active !== false).length;
        const activeUsers = users.filter(u => u.active !== false && u.role !== 'admin').length;
        
        const today = format(new Date(), 'yyyy-MM-dd');
        const todaySchedules = schedules.filter(s => {
            const scheduleDate = s.start_time ? s.start_time.split('T')[0] : '';
            return scheduleDate === today;
        });
        
        const currentMonth = format(new Date(), 'yyyy-MM');
        const monthWorkEntries = workEntries.filter(we => we.period && we.period.startsWith(currentMonth));
        const monthlyRevenue = monthWorkEntries.reduce((sum, we) => sum + (we.total_amount || 0), 0);

        return {
            activeClients,
            activeUsers,
            todaySchedules: todaySchedules.length,
            monthlyRevenue,
        };
    }, [clients, users, schedules, workEntries]);

    // Loading inicial (solo muestra mientras carga usuarios y clientes)
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
                <div className="text-center space-y-4">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto" />
                    <div className="space-y-2">
                        <p className="text-lg font-semibold text-slate-800">Cargando Dashboard...</p>
                        <div className="space-y-1 text-sm text-slate-600">
                            {dataLoading.users && <p>⏳ Cargando usuarios...</p>}
                            {dataLoading.clients && <p>⏳ Cargando clientes...</p>}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
                <Card className="max-w-md w-full border-red-200">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3 text-red-600 mb-4">
                            <AlertCircle className="w-8 h-8" />
                            <h2 className="text-xl font-bold">Error al cargar datos</h2>
                        </div>
                        <p className="text-slate-600 mb-4">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Recargar página
                        </button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 mb-2">Panel Administrativo</h1>
                        <p className="text-slate-600">Vista general de tu negocio</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-slate-600">Última actualización</p>
                        <p className="text-lg font-semibold text-slate-900">{format(new Date(), 'HH:mm')}</p>
                    </div>
                </div>

                {/* Indicador de carga progresiva */}
                {(dataLoading.schedules || dataLoading.workEntries) && (
                    <Card className="border-blue-200 bg-blue-50">
                        <CardContent className="py-3">
                            <div className="flex items-center gap-3 text-blue-800">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="text-sm">
                                    Cargando datos adicionales en segundo plano...
                                    {dataLoading.schedules && ' Horarios...'}
                                    {dataLoading.workEntries && ' Entradas de trabajo...'}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Quick Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-2">
                                <Users className="w-8 h-8 opacity-80" />
                                <span className="text-3xl font-bold">{stats.activeClients}</span>
                            </div>
                            <p className="text-blue-100 text-sm">Clientes Activos</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-2">
                                <Users className="w-8 h-8 opacity-80" />
                                <span className="text-3xl font-bold">{stats.activeUsers}</span>
                            </div>
                            <p className="text-green-100 text-sm">Limpiadores Activos</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-2">
                                <Calendar className="w-8 h-8 opacity-80" />
                                <span className="text-3xl font-bold">{stats.todaySchedules}</span>
                            </div>
                            <p className="text-purple-100 text-sm">Servicios Hoy</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-2">
                                <DollarSign className="w-8 h-8 opacity-80" />
                                <span className="text-3xl font-bold">${stats.monthlyRevenue.toFixed(0)}</span>
                            </div>
                            <p className="text-amber-100 text-sm">Ingresos del Mes</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - KPIs and Alerts */}
                    <div className="lg:col-span-2 space-y-6">
                        <KPIGrid 
                            clients={clients}
                            users={users}
                            workEntries={workEntries}
                            schedules={schedules}
                        />
                        
                        <ActionableAlerts 
                            schedules={schedules}
                            workEntries={workEntries}
                            users={users}
                        />
                        
                        <ActivityChart workEntries={workEntries} />
                    </div>

                    {/* Right Column - Team and Activity */}
                    <div className="space-y-6">
                        <TeamOverview users={users} schedules={schedules} />
                        <RecentActivity schedules={schedules} workEntries={workEntries} />
                    </div>
                </div>
            </div>
        </div>
    );
}