import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Car, Users, Clock, MapPin, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const parseISOAsUTC = (isoString) => {
    if (!isoString) return null;
    const correctedIsoString = isoString.endsWith('Z') ? isoString : `${isoString}Z`;
    return new Date(correctedIsoString);
};

export default function HorarioEquiposView({ schedules, date, users, onSelectEvent }) {
    const [teamAssignments, setTeamAssignments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadTeamAssignments();
    }, [date]);

    const loadTeamAssignments = async () => {
        try {
            setLoading(true);
            const allAssignments = await base44.entities.DailyTeamAssignment.list();
            
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const selectedDateStr = `${year}-${month}-${day}`;
            
            const matchingAssignments = allAssignments.filter(assignment => {
                if (!assignment.date) return false;
                const assignmentDateStr = typeof assignment.date === 'string' 
                    ? assignment.date.slice(0, 10) 
                    : null;
                return assignmentDateStr === selectedDateStr;
            });

            setTeamAssignments(matchingAssignments);
        } catch (error) {
            console.error('[HorarioEquipos] Error cargando asignaciones:', error);
            setTeamAssignments([]);
        } finally {
            setLoading(false);
        }
    };

    // Agrupar servicios por equipo
    const teamsWithServices = useMemo(() => {
        const schedulesArray = Array.isArray(schedules) ? schedules : [];
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const selectedDateStr = `${year}-${month}-${day}`;

        return teamAssignments.map(team => {
            // Filtrar servicios que incluyan algún miembro del equipo
            const teamServices = schedulesArray.filter(schedule => {
                if (!schedule.start_time || !schedule.cleaner_ids) return false;
                const scheduleDate = schedule.start_time.slice(0, 10);
                if (scheduleDate !== selectedDateStr) return false;

                // Verificar si algún cleaner del servicio está en el equipo
                const teamMemberIds = Array.isArray(team.team_member_ids) ? team.team_member_ids : [];
                const scheduleCleaner = Array.isArray(schedule.cleaner_ids) ? schedule.cleaner_ids : [];
                return scheduleCleaner.some(cleanerId => teamMemberIds.includes(cleanerId));
            }).sort((a, b) => {
                const timeA = parseISOAsUTC(a.start_time);
                const timeB = parseISOAsUTC(b.start_time);
                return timeA - timeB;
            });

            return {
                ...team,
                services: teamServices
            };
        });
    }, [teamAssignments, schedules, date]);

    // Calcular limpiadores sin asignar
    const unassignedCleaners = useMemo(() => {
        const schedulesArray = Array.isArray(schedules) ? schedules : [];
        const usersArray = Array.isArray(users) ? users : [];
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const selectedDateStr = `${year}-${month}-${day}`;

        // IDs de todos los cleaners
        const allCleanerIds = usersArray
            .filter(u => u.role !== 'admin')
            .map(u => u.id);

        // IDs asignados a equipos
        const assignedToTeams = new Set();
        teamAssignments.forEach(team => {
            if (Array.isArray(team.team_member_ids)) {
                team.team_member_ids.forEach(id => assignedToTeams.add(id));
            }
        });

        // IDs asignados a servicios del día
        const assignedToServices = new Set();
        schedulesArray.forEach(schedule => {
            if (!schedule.start_time || !schedule.cleaner_ids) return;
            const scheduleDate = schedule.start_time.slice(0, 10);
            if (scheduleDate === selectedDateStr) {
                if (Array.isArray(schedule.cleaner_ids)) {
                    schedule.cleaner_ids.forEach(id => assignedToServices.add(id));
                }
            }
        });

        // Limpiadores sin asignar
        return allCleanerIds
            .filter(id => !assignedToTeams.has(id) && !assignedToServices.has(id))
            .map(id => usersArray.find(u => u.id === id))
            .filter(Boolean);
    }, [users, teamAssignments, schedules, date]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center space-y-3">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-slate-600">Cargando vista de equipos...</p>
                </div>
            </div>
        );
    }

    if (teamAssignments.length === 0) {
        return (
            <div className="flex items-center justify-center py-12">
                <Card className="max-w-md">
                    <CardContent className="pt-6">
                        <div className="text-center space-y-3">
                            <AlertCircle className="w-12 h-12 text-slate-400 mx-auto" />
                            <h3 className="text-lg font-semibold text-slate-900">
                                No hay equipos asignados
                            </h3>
                            <p className="text-slate-600">
                                No se encontraron asignaciones de equipo para el {format(date, 'd MMMM yyyy', { locale: es })}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex gap-4 h-full overflow-hidden">
            {/* Panel Principal - Equipos */}
            <div className="flex-1 overflow-auto space-y-4 p-4">
                {teamsWithServices.map((team, index) => (
                    <Card key={team.id || index} className="shadow-lg">
                        <CardHeader className="pb-3 bg-gradient-to-r from-blue-50 to-slate-50">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <Users className="w-5 h-5 text-blue-600" />
                                        {team.team_name || `Equipo ${index + 1}`}
                                    </CardTitle>
                                    <div className="flex flex-wrap gap-3 text-sm">
                                        {team.vehicle_info && (
                                            <div className="flex items-center gap-1 text-slate-600">
                                                <Car className="w-4 h-4" />
                                                <span className="font-medium">{team.vehicle_info}</span>
                                            </div>
                                        )}
                                        {team.driver_name && (
                                            <div className="flex items-center gap-1 text-slate-600">
                                                <span className="font-semibold">Conductor:</span>
                                                <span>{team.driver_name}</span>
                                            </div>
                                        )}
                                    </div>
                                    {team.team_members_names && team.team_members_names.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {team.team_members_names.map((name, idx) => (
                                                <Badge key={idx} variant="secondary" className="text-xs">
                                                    {name}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <Badge variant="outline" className="text-sm">
                                    {team.services.length} {team.services.length === 1 ? 'Servicio' : 'Servicios'}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                            {team.services.length === 0 ? (
                                <div className="text-center py-6 text-slate-500">
                                    <Clock className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                                    <p className="text-sm">No hay servicios asignados para este equipo</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                    {team.services.map((service) => {
                                        const startTime = parseISOAsUTC(service.start_time);
                                        const endTime = parseISOAsUTC(service.end_time);
                                        
                                        const statusColors = {
                                            scheduled: 'bg-blue-100 text-blue-800 border-blue-300',
                                            in_progress: 'bg-yellow-100 text-yellow-800 border-yellow-300',
                                            completed: 'bg-green-100 text-green-800 border-green-300',
                                            cancelled: 'bg-red-100 text-red-800 border-red-300'
                                        };

                                        return (
                                            <div
                                                key={service.id}
                                                onClick={() => onSelectEvent(service)}
                                                className="p-3 border-2 rounded-lg cursor-pointer hover:shadow-md transition-all hover:scale-105"
                                                style={{ borderColor: service.color || '#3b82f6' }}
                                            >
                                                <div className="space-y-2">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="font-bold text-slate-900 truncate text-sm">
                                                                {service.client_name}
                                                            </h4>
                                                            {service.client_address && (
                                                                <p className="text-xs text-slate-600 truncate flex items-center gap-1 mt-1">
                                                                    <MapPin className="w-3 h-3 flex-shrink-0" />
                                                                    {service.client_address}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <Badge className={`text-xs ${statusColors[service.status] || statusColors.scheduled}`}>
                                                            {service.status === 'scheduled' ? 'Prog.' :
                                                             service.status === 'in_progress' ? 'En Prog.' :
                                                             service.status === 'completed' ? 'Comp.' :
                                                             'Canc.'}
                                                        </Badge>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <Clock className="w-3 h-3 text-slate-500" />
                                                        <span className="font-semibold text-slate-700">
                                                            {format(startTime, 'HH:mm', { locale: es })} - {format(endTime, 'HH:mm', { locale: es })}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Panel Lateral - Limpiadores Sin Asignar */}
            <div className="w-80 flex-shrink-0 overflow-auto p-4 bg-slate-50 border-l">
                <Card className="sticky top-0">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <AlertCircle className="w-5 h-5 text-orange-600" />
                            Sin Asignar
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {unassignedCleaners.length === 0 ? (
                            <div className="text-center py-6">
                                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                                    <Users className="w-6 h-6 text-green-600" />
                                </div>
                                <p className="text-sm text-slate-600">
                                    ✓ Todos los limpiadores están asignados
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-xs text-slate-500 mb-3">
                                    {unassignedCleaners.length} {unassignedCleaners.length === 1 ? 'limpiador' : 'limpiadores'} sin asignación
                                </p>
                                {unassignedCleaners.map((cleaner) => {
                                    const displayName = cleaner.schedule_display_name || cleaner.invoice_name || cleaner.full_name;
                                    return (
                                        <div
                                            key={cleaner.id}
                                            className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-200 hover:border-orange-300 transition-colors"
                                        >
                                            <Avatar className="w-8 h-8">
                                                <AvatarFallback 
                                                    className="text-xs font-semibold"
                                                    style={{ 
                                                        backgroundColor: cleaner.color || '#94a3b8',
                                                        color: 'white'
                                                    }}
                                                >
                                                    {displayName?.charAt(0)?.toUpperCase() || '?'}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-900 truncate">
                                                    {displayName}
                                                </p>
                                                {cleaner.email && (
                                                    <p className="text-xs text-slate-500 truncate">
                                                        {cleaner.email}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}