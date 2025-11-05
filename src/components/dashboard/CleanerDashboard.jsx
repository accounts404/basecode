
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
    Calendar, 
    Clock, 
    DollarSign, 
    TrendingUp, 
    AlertCircle,
    Car,
    Key,
    Users,
    MapPin,
    Briefcase
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ActiveServiceTimer from "./ActiveServiceTimer";
import ScoreCard from "./ScoreCard";

export default function CleanerDashboard() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [stats, setStats] = useState({
        currentMonthHours: 0,
        currentMonthEarnings: 0,
        pendingInvoices: 0,
        todaySchedules: [],
        activeService: null
    });
    const [assignedVehicle, setAssignedVehicle] = useState(null);
    const [requiredKeys, setRequiredKeys] = useState([]);
    const [teamMembers, setTeamMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dataLoaded, setDataLoaded] = useState(false);

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            // PASO 1: Cargar datos críticos desde caché primero (INSTANTÁNEO)
            const cachedData = localStorage.getItem('cleaner_dashboard_cache');
            if (cachedData) {
                const parsed = JSON.parse(cachedData);
                setUser(parsed.user);
                setStats(parsed.stats);
                setAssignedVehicle(parsed.assignedVehicle);
                setRequiredKeys(parsed.requiredKeys);
                setTeamMembers(parsed.teamMembers);
                setDataLoaded(true);
                setLoading(false);
                
                // NUEVO: Si hay servicio activo, redirigir inmediatamente a ServicioActivo
                if (parsed.stats?.activeService) {
                    navigate(createPageUrl('ServicioActivo'));
                    return; // Importante para detener la carga de datos frescos si ya se redirige
                }
            }

            // PASO 2: Cargar datos frescos en segundo plano (SIN BLOQUEAR UI)
            loadFreshData();
        } catch (error) {
            console.error("Error loading initial data:", error);
            setLoading(false);
        }
    };

    const loadFreshData = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);

            const today = new Date();
            const todayStr = format(today, 'yyyy-MM-dd');

            // Cargar datos en paralelo
            const [workEntries, invoices, schedules, assignments] = await Promise.all([
                base44.entities.WorkEntry.filter({ cleaner_id: userData.id }).catch(() => []),
                base44.entities.Invoice.filter({ cleaner_id: userData.id, status: 'draft' }).catch(() => []),
                base44.entities.Schedule.list().catch(() => []),
                base44.functions.invoke('getDailyTeamAssignments', { date: todayStr })
                    .then(res => res.data?.assignments || [])
                    .catch(() => [])
            ]);

            // Filtrar servicios de hoy del limpiador
            const todaySchedules = (Array.isArray(schedules) ? schedules : []).filter(s => {
                if (!s.start_time || !s.cleaner_ids) return false;
                const scheduleDate = format(new Date(s.start_time), 'yyyy-MM-dd');
                return scheduleDate === todayStr && 
                       Array.isArray(s.cleaner_ids) && 
                       s.cleaner_ids.includes(userData.id);
            });

            // Buscar servicio activo
            const activeService = todaySchedules.find(schedule => {
                const cleanerClockData = schedule.clock_in_data?.find(c => c.cleaner_id === userData.id);
                return cleanerClockData?.clock_in_time && !cleanerClockData?.clock_out_time;
            });

            // NUEVO: Si encontramos servicio activo durante la carga fresca, redirigir
            if (activeService) {
                navigate(createPageUrl('ServicioActivo'));
                return; // Importante para detener el resto de la ejecución de loadFreshData
            }

            // Calcular estadísticas del mes actual
            const monthStart = startOfMonth(today);
            const monthEnd = endOfMonth(today);
            const monthEntries = (Array.isArray(workEntries) ? workEntries : []).filter(entry => {
                const entryDate = new Date(entry.work_date);
                return entryDate >= monthStart && entryDate <= monthEnd;
            });

            const currentMonthHours = monthEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
            const currentMonthEarnings = monthEntries.reduce((sum, entry) => sum + (entry.total_amount || 0), 0);

            // Vehículo y equipo asignado
            let vehicleInfo = null;
            let keys = [];
            let team = [];

            const todayAssignment = (Array.isArray(assignments) ? assignments : [])
                .find(a => a.team_member_ids?.includes(userData.id));

            if (todayAssignment) {
                if (todayAssignment.vehicle_details) {
                    vehicleInfo = todayAssignment.vehicle_details;
                }
                
                if (todayAssignment.team_members_info) {
                    team = todayAssignment.team_members_info;
                }
            }

            // Llaves necesarias para el día
            if (todaySchedules.length > 0) {
                const clientIds = [...new Set(todaySchedules.map(s => s.client_id).filter(Boolean))];
                const clients = await Promise.all(
                    clientIds.map(id => base44.entities.Client.get(id).catch(() => null))
                );

                keys = todaySchedules
                    .map(schedule => {
                        const client = clients.find(c => c && c.id === schedule.client_id);
                        if (client && client.has_access && client.access_identifier) {
                            return {
                                identifier: client.access_identifier,
                                client_name: client.name,
                                access_type: client.access_type
                            };
                        }
                        return null;
                    })
                    .filter(Boolean);
            }

            const freshStats = {
                currentMonthHours,
                currentMonthEarnings,
                pendingInvoices: Array.isArray(invoices) ? invoices.length : 0,
                todaySchedules,
                activeService
            };

            // Actualizar estado
            setStats(freshStats);
            setAssignedVehicle(vehicleInfo);
            setRequiredKeys(keys);
            setTeamMembers(team);
            setDataLoaded(true);

            // Guardar en caché
            localStorage.setItem('cleaner_dashboard_cache', JSON.stringify({
                user: userData,
                stats: freshStats,
                assignedVehicle: vehicleInfo,
                requiredKeys: keys,
                teamMembers: team,
                timestamp: Date.now()
            }));

        } catch (error) {
            console.error("Error loading fresh data:", error);
        } finally {
            setLoading(false);
        }
    };

    // Skeleton/Loading state mínimo
    if (!dataLoaded && loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
                <div className="max-w-6xl mx-auto space-y-6">
                    <div className="h-8 bg-gray-200 rounded w-1/3 animate-pulse"></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[1,2,3,4].map(i => (
                            <div key={i} className="h-32 bg-gray-200 rounded-xl animate-pulse"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const motivationalMessage = user?.motivational_message || 
        "¡Hoy es un gran día para brillar! Da lo mejor de ti y haz que cada cliente sonría. 💪✨";

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header con mensaje motivacional */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white shadow-xl">
                    <h1 className="text-3xl font-bold mb-2">
                        ¡Hola, {user?.full_name?.split(' ')[0] || 'Limpiador'}! 👋
                    </h1>
                    <p className="text-blue-100 text-lg">{motivationalMessage}</p>
                </div>

                {/* Active Service Alert */}
                {/* Note: If the redirect logic works as intended, this block might never be rendered */}
                {stats.activeService && (
                    <ActiveServiceTimer
                        schedule={stats.activeService}
                        onViewDetails={() => navigate(createPageUrl('ServicioActivo'))}
                    />
                )}

                {/* Score Card (si participa) */}
                <ScoreCard userId={user?.id} />

                {/* Info del Día: Vehículo, Equipo, Llaves */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Vehículo Asignado */}
                    {assignedVehicle && (
                        <Card className="bg-white shadow-lg border-l-4 border-l-orange-500">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Car className="w-5 h-5 text-orange-600" />
                                    Vehículo Asignado
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="font-bold text-xl">{assignedVehicle.make} {assignedVehicle.model}</p>
                                <p className="text-sm text-gray-600">{assignedVehicle.license_plate}</p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Miembros del Equipo */}
                    {teamMembers.length > 0 && (
                        <Card className="bg-white shadow-lg border-l-4 border-l-purple-500">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Users className="w-5 h-5 text-purple-600" />
                                    Equipo del Día
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-1">
                                    {teamMembers.map((member, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${member.is_main_driver ? 'bg-purple-600' : 'bg-gray-400'}`}></div>
                                            <span className="text-sm">{member.name}</span>
                                            {member.is_main_driver && (
                                                <Badge variant="outline" className="text-xs">Conductor</Badge>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Llaves Necesarias */}
                    {requiredKeys.length > 0 && (
                        <Card className="bg-white shadow-lg border-l-4 border-l-amber-500">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Key className="w-5 h-5 text-amber-600" />
                                    Llaves Necesarias
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {requiredKeys.map((key, idx) => (
                                        <div key={idx} className="flex items-center justify-between">
                                            <span className="text-sm font-medium">{key.identifier}</span>
                                            <span className="text-xs text-gray-500">{key.client_name}</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="bg-white shadow-lg hover:shadow-xl transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600">
                                Horas del Mes
                            </CardTitle>
                            <Clock className="w-4 h-4 text-blue-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-blue-600">
                                {stats.currentMonthHours.toFixed(1)}h
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                {format(new Date(), "MMMM yyyy", { locale: es })}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="bg-white shadow-lg hover:shadow-xl transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600">
                                Ganancias del Mes
                            </CardTitle>
                            <DollarSign className="w-4 h-4 text-green-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-green-600">
                                ${stats.currentMonthEarnings.toFixed(2)}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">AUD</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-white shadow-lg hover:shadow-xl transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600">
                                Servicios de Hoy
                            </CardTitle>
                            <Briefcase className="w-4 h-4 text-purple-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-purple-600">
                                {stats.todaySchedules.length}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                {stats.activeService ? 'En progreso' : 'Programados'}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="bg-white shadow-lg hover:shadow-xl transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600">
                                Facturas Pendientes
                            </CardTitle>
                            <TrendingUp className="w-4 h-4 text-amber-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-amber-600">
                                {stats.pendingInvoices}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Por enviar</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Servicios de Hoy */}
                {stats.todaySchedules.length > 0 && (
                    <Card className="bg-white shadow-lg">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-blue-600" />
                                Servicios de Hoy
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {stats.todaySchedules.map((schedule) => {
                                    const cleanerClockData = schedule.clock_in_data?.find(c => c.cleaner_id === user?.id);
                                    const hasStarted = Boolean(cleanerClockData?.clock_in_time);
                                    const hasEnded = Boolean(cleanerClockData?.clock_out_time);

                                    return (
                                        <div
                                            key={schedule.id}
                                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="flex items-center gap-4 flex-1">
                                                <div className={`w-3 h-3 rounded-full ${
                                                    hasEnded ? 'bg-gray-400' :
                                                    hasStarted ? 'bg-green-500 animate-pulse' :
                                                    'bg-blue-500'
                                                }`}></div>
                                                <div>
                                                    <h3 className="font-semibold text-gray-900">
                                                        {schedule.client_name}
                                                    </h3>
                                                    <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                                                        <MapPin className="w-3 h-3" />
                                                        <span>{schedule.client_address}</span>
                                                    </div>
                                                    <p className="text-sm text-gray-500 mt-1">
                                                        {format(new Date(schedule.start_time), "h:mm a", { locale: es })} - {format(new Date(schedule.end_time), "h:mm a", { locale: es })}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {hasEnded ? (
                                                    <Badge variant="secondary">Completado</Badge>
                                                ) : hasStarted ? (
                                                    <Badge className="bg-green-500 text-white">En Progreso</Badge>
                                                ) : (
                                                    <Badge variant="outline">Programado</Badge>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Acceso Rápido */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Button
                        variant="outline"
                        className="h-24 flex flex-col items-center justify-center gap-2"
                        onClick={() => navigate(createPageUrl('Horario'))}
                    >
                        <Calendar className="w-6 h-6" />
                        <span>Mi Horario</span>
                    </Button>
                    <Button
                        variant="outline"
                        className="h-24 flex flex-col items-center justify-center gap-2"
                        onClick={() => navigate(createPageUrl('MisHoras'))}
                    >
                        <Clock className="w-6 h-6" />
                        <span>Mis Horas</span>
                    </Button>
                    <Button
                        variant="outline"
                        className="h-24 flex flex-col items-center justify-center gap-2"
                        onClick={() => navigate(createPageUrl('MisFacturas'))}
                    >
                        <DollarSign className="w-6 h-6" />
                        <span>Mis Facturas</span>
                    </Button>
                    <Button
                        variant="outline"
                        className="h-24 flex flex-col items-center justify-center gap-2"
                        onClick={() => navigate(createPageUrl('MiPerfil'))}
                    >
                        <Users className="w-6 h-6" />
                        <span>Mi Perfil</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
