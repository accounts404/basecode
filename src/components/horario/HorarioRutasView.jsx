import React, { useState, useEffect, useCallback } from 'react';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { calculateRoutes } from '@/functions/calculateRoutes';
import {
    MapPin, Car, Clock, Route, RefreshCw, Navigation,
    Building2, Home, AlertCircle, ChevronDown, ChevronUp, Users
} from 'lucide-react';

const OFFICE_ADDRESS = '167 Millers Rd, Altona North VIC 3025';
const OFFICE_LABEL = '🏢 Oficina (167 Millers Rd, Altona North)';

// Parse ISO without timezone shift
const parseISOLocal = (iso) => {
    if (!iso) return null;
    const clean = iso.endsWith('Z') ? iso.slice(0, -1) : iso;
    return new Date(clean);
};

const formatDuration = (seconds) => {
    if (!seconds) return '—';
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}min`;
};

function TravelSegment({ from, to, segment, index, isLast }) {
    return (
        <div className="flex flex-col items-stretch">
            {/* Stop point */}
            <div className={`flex items-start gap-3 px-4 py-3 rounded-xl ${
                index === 0 || isLast
                    ? 'bg-slate-100 border border-slate-200'
                    : 'bg-white border border-slate-200'
            }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    index === 0 || isLast ? 'bg-slate-700' : 'bg-blue-600'
                }`}>
                    {index === 0 || isLast
                        ? <Building2 className="w-4 h-4 text-white" />
                        : <MapPin className="w-4 h-4 text-white" />
                    }
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{from.label}</p>
                    {from.address && from.address !== OFFICE_ADDRESS && (
                        <p className="text-xs text-slate-500 truncate">{from.address}</p>
                    )}
                    {from.timeRange && (
                        <Badge variant="outline" className="mt-1 text-xs text-blue-700 border-blue-200 bg-blue-50">
                            <Clock className="w-3 h-3 mr-1" />
                            {from.timeRange}
                        </Badge>
                    )}
                </div>
            </div>

            {/* Travel arrow */}
            {segment && (
                <div className="flex items-center gap-2 py-1.5 pl-8">
                    <div className="flex flex-col items-center">
                        <div className="w-0.5 h-3 bg-slate-300" />
                        <Navigation className="w-3.5 h-3.5 text-slate-400 rotate-180 -my-0.5" />
                        <div className="w-0.5 h-3 bg-slate-300" />
                    </div>
                    <div className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs font-medium ${
                        segment.status === 'OK'
                            ? 'bg-amber-50 border border-amber-200 text-amber-800'
                            : 'bg-red-50 border border-red-200 text-red-700'
                    }`}>
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {segment.duration_text || formatDuration(segment.duration_seconds)}
                        </span>
                        <span className="text-amber-400">·</span>
                        <span className="flex items-center gap-1">
                            <Route className="w-3 h-3" />
                            {segment.distance_text}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

function TeamRouteCard({ team, schedules, users, date }) {
    const [routeData, setRouteData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [expanded, setExpanded] = useState(true);

    // Get schedules for this team on this date, sorted by start time
    const teamSchedules = schedules
        .filter(s => {
            if (!s.start_time) return false;
            const sDate = parseISOLocal(s.start_time);
            if (!isSameDay(sDate, date)) return false;
            if (s.status === 'cancelled') return false;
            // Check if any team member is assigned
            return s.cleaner_ids?.some(id => team.team_member_ids?.includes(id));
        })
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    const teamMemberNames = team.team_member_ids
        ?.map(id => users.find(u => u.id === id)?.full_name)
        .filter(Boolean) || [];

    const calculateRoute = useCallback(async () => {
        if (teamSchedules.length === 0) return;
        setLoading(true);
        setError('');
        try {
            const addresses = teamSchedules
                .map(s => s.client_address)
                .filter(Boolean);

            if (addresses.length === 0) {
                setError('No hay direcciones disponibles para calcular la ruta.');
                setLoading(false);
                return;
            }

            const res = await calculateRoutes({ addresses });
            if (res.data?.success) {
                setRouteData(res.data);
            } else {
                setError(res.data?.error || 'Error al calcular la ruta');
            }
        } catch (err) {
            setError(err.message || 'Error al calcular la ruta');
        }
        setLoading(false);
    }, [teamSchedules]);

    useEffect(() => {
        calculateRoute();
    }, [calculateRoute]);

    // Build stop list for display
    const stops = [
        { label: OFFICE_LABEL, address: OFFICE_ADDRESS, timeRange: null },
        ...teamSchedules.map(s => ({
            label: s.client_name || 'Cliente',
            address: s.client_address || 'Sin dirección',
            timeRange: s.start_time
                ? `${format(parseISOLocal(s.start_time), 'HH:mm')} – ${format(parseISOLocal(s.end_time), 'HH:mm')}`
                : null,
            scheduleId: s.id
        })),
        { label: OFFICE_LABEL, address: OFFICE_ADDRESS, timeRange: null }
    ];

    return (
        <Card className="shadow-lg border border-slate-200 overflow-hidden">
            <CardHeader
                className="bg-gradient-to-r from-slate-800 to-slate-700 text-white cursor-pointer py-3 px-4"
                onClick={() => setExpanded(e => !e)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                            <Car className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-white text-base">
                                {team.team_name || `Equipo ${team.main_driver_id?.slice(-4)}`}
                            </CardTitle>
                            <div className="flex items-center gap-2 mt-0.5">
                                <Users className="w-3 h-3 text-slate-300" />
                                <p className="text-slate-300 text-xs">
                                    {teamMemberNames.length > 0
                                        ? teamMemberNames.join(' · ')
                                        : 'Sin miembros asignados'}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {routeData && (
                            <div className="text-right">
                                <div className="flex items-center gap-3 text-sm">
                                    <span className="flex items-center gap-1 text-amber-300 font-semibold">
                                        <Clock className="w-3.5 h-3.5" />
                                        {routeData.total_travel_time_text}
                                    </span>
                                    <span className="flex items-center gap-1 text-slate-300">
                                        <Route className="w-3.5 h-3.5" />
                                        {routeData.total_distance_text}
                                    </span>
                                </div>
                                <p className="text-slate-400 text-xs mt-0.5">
                                    {teamSchedules.length} servicio{teamSchedules.length !== 1 ? 's' : ''}
                                </p>
                            </div>
                        )}
                        {expanded
                            ? <ChevronUp className="w-4 h-4 text-slate-300" />
                            : <ChevronDown className="w-4 h-4 text-slate-300" />
                        }
                    </div>
                </div>
            </CardHeader>

            {expanded && (
                <CardContent className="p-4">
                    {teamSchedules.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <MapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No hay servicios para este equipo en la fecha seleccionada</p>
                        </div>
                    ) : (
                        <>
                            {error && (
                                <Alert className="mb-4 border-red-200 bg-red-50">
                                    <AlertCircle className="w-4 h-4 text-red-600" />
                                    <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
                                </Alert>
                            )}

                            {loading ? (
                                <div className="flex items-center justify-center py-10 gap-3 text-slate-500">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                                    <span className="text-sm">Calculando tiempos de viaje...</span>
                                </div>
                            ) : (
                                <div className="space-y-0">
                                    {stops.map((stop, idx) => {
                                        const isLast = idx === stops.length - 1;
                                        const segment = routeData?.segments?.[idx] || null;
                                        return (
                                            <TravelSegment
                                                key={idx}
                                                from={stop}
                                                to={stops[idx + 1]}
                                                segment={!isLast ? segment : null}
                                                index={idx}
                                                isLast={isLast}
                                            />
                                        );
                                    })}
                                </div>
                            )}

                            <div className="mt-4 flex justify-end">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={calculateRoute}
                                    disabled={loading}
                                    className="text-xs gap-1.5"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                                    Recalcular
                                </Button>
                            </div>
                        </>
                    )}
                </CardContent>
            )}
        </Card>
    );
}

export default function HorarioRutasView({ schedules, date, users, dailyTeamAssignments }) {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    const teamsForDay = (dailyTeamAssignments || []).filter(a => {
        if (!a.date) return false;
        return a.date.slice(0, 10) === dateStr;
    });

    // Also find schedules without a team assignment (assigned directly)
    const assignedCleanerIds = new Set(teamsForDay.flatMap(t => t.team_member_ids || []));
    const schedulesForDay = schedules.filter(s => {
        if (!s.start_time) return false;
        const sDate = parseISOLocal(s.start_time);
        return isSameDay(sDate, date) && s.status !== 'cancelled';
    });

    return (
        <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Route className="w-5 h-5 text-blue-600" />
                        Rutas del Día
                    </h2>
                    <p className="text-sm text-slate-500 mt-0.5 capitalize">
                        {format(date, "EEEE, d 'de' MMMM yyyy", { locale: es })}
                    </p>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg text-sm text-slate-600">
                    <Building2 className="w-4 h-4 text-slate-500" />
                    <span className="font-medium">Salida: 167 Millers Rd, Altona North</span>
                </div>
            </div>

            {teamsForDay.length === 0 ? (
                <Card className="border border-slate-200">
                    <CardContent className="py-16 text-center text-slate-400">
                        <Car className="w-14 h-14 mx-auto mb-3 opacity-25" />
                        <p className="font-semibold text-slate-600">No hay equipos asignados para este día</p>
                        <p className="text-sm mt-1">Asigná equipos en la pestaña "Equipos" para ver las rutas</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {teamsForDay.map(team => (
                        <TeamRouteCard
                            key={team.id}
                            team={team}
                            schedules={schedules}
                            users={users}
                            date={date}
                        />
                    ))}
                </div>
            )}

            {teamsForDay.length > 0 && schedulesForDay.length === 0 && (
                <Alert className="border-amber-200 bg-amber-50">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <AlertDescription className="text-amber-700">
                        Hay equipos asignados pero no hay servicios agendados para este día.
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
}