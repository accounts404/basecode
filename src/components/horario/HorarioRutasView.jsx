import React, { useState, useEffect, useRef, useMemo } from 'react';
import { format, isSameDay, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { calculateRoutes } from '@/functions/calculateRoutes';
import {
    MapPin, Car, Clock, Route, RefreshCw, Navigation,
    Building2, AlertCircle, ChevronDown, ChevronUp, Users,
    ChevronLeft, ChevronRight, CalendarDays, Timer, Milestone
} from 'lucide-react';

const OFFICE_ADDRESS = '167 Millers Rd, Altona North VIC 3025';
const OFFICE_LABEL = '167 Millers Rd, Altona North';

const parseISOLocal = (iso) => {
    if (!iso) return null;
    const clean = iso.endsWith('Z') ? iso.slice(0, -1) : iso;
    return new Date(clean);
};

// Color palette for teams
const TEAM_COLORS = [
    { bg: 'from-blue-600 to-blue-700', light: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-600', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800' },
    { bg: 'from-violet-600 to-violet-700', light: 'bg-violet-50', border: 'border-violet-200', dot: 'bg-violet-600', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-800' },
    { bg: 'from-emerald-600 to-emerald-700', light: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-600', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800' },
    { bg: 'from-orange-500 to-orange-600', light: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-800' },
    { bg: 'from-rose-600 to-rose-700', light: 'bg-rose-50', border: 'border-rose-200', dot: 'bg-rose-600', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-800' },
];

function StopPin({ type, color, index, total }) {
    if (type === 'office') {
        return (
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center shadow-md flex-shrink-0 ring-4 ring-white">
                <Building2 className="w-5 h-5 text-white" />
            </div>
        );
    }
    return (
        <div className={`w-10 h-10 rounded-full ${color.dot} flex items-center justify-center shadow-md flex-shrink-0 ring-4 ring-white`}>
            <span className="text-white font-bold text-sm">{index}</span>
        </div>
    );
}

function TimelineStop({ stop, segment, type, stopIndex, totalStops, color }) {
    const isFirst = type === 'office-start';
    const isLast = type === 'office-end';
    const isOffice = isFirst || isLast;
    const showConnector = type !== 'office-end';

    return (
        <div className="flex gap-4">
            {/* Timeline spine */}
            <div className="flex flex-col items-center">
                <StopPin type={isOffice ? 'office' : 'client'} color={color} index={stopIndex} />
                {showConnector && (
                    <div className="flex flex-col items-center flex-1 py-1 min-h-[56px]">
                        <div className="w-0.5 flex-1 bg-gradient-to-b from-slate-300 to-slate-200" />
                        {segment && segment.status === 'OK' && (
                            <div className="my-1 flex flex-col items-center gap-0.5">
                                <Navigation className="w-3 h-3 text-slate-400" style={{ transform: 'rotate(180deg)' }} />
                            </div>
                        )}
                        <div className="w-0.5 flex-1 bg-gradient-to-b from-slate-200 to-slate-300" />
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 pb-4">
                <div className={`rounded-xl border p-3 ${isOffice ? 'bg-slate-50 border-slate-200' : `${color.light} ${color.border}`}`}>
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <p className={`font-bold text-sm ${isOffice ? 'text-slate-700' : 'text-slate-900'}`}>
                                {isOffice ? '🏢 ' : ''}{stop.label}
                            </p>
                            {!isOffice && stop.address && (
                                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 truncate">
                                    <MapPin className="w-3 h-3 flex-shrink-0" />
                                    {stop.address}
                                </p>
                            )}
                            {isOffice && (
                                <p className="text-xs text-slate-400 mt-0.5">{OFFICE_ADDRESS}</p>
                            )}
                        </div>
                        {stop.timeRange && (
                            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${color.badge} flex-shrink-0`}>
                                <Clock className="w-3 h-3" />
                                {stop.timeRange}
                            </div>
                        )}
                    </div>
                </div>

                {/* Travel info between stops */}
                {segment && segment.status === 'OK' && (
                    <div className="flex items-center gap-2 mt-2 ml-2">
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1 font-medium">
                                <Timer className="w-3 h-3 text-amber-500" />
                                <span className="text-amber-600 font-semibold">{segment.duration_text}</span>
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="flex items-center gap-1">
                                <Route className="w-3 h-3 text-slate-400" />
                                {segment.distance_text}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function TeamRouteCard({ team, teamRouteData, loading, users, schedules, date, colorScheme }) {
    const [expanded, setExpanded] = useState(true);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    const teamSchedules = (schedules || [])
        .filter(s => {
            if (!s.start_time) return false;
            if (s.start_time.slice(0, 10) !== dateStr) return false;
            if (s.status === 'cancelled') return false;
            return s.cleaner_ids?.some(id => team.team_member_ids?.includes(id));
        })
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    const teamMemberNames = (team.team_member_ids || [])
        .map(id => users.find(u => u.id === id)?.full_name)
        .filter(Boolean);

    const color = colorScheme;

    const stops = [
        { label: OFFICE_LABEL, address: OFFICE_ADDRESS, timeRange: null },
        ...teamSchedules.map(s => ({
            label: s.client_name || 'Cliente',
            address: s.client_address || 'Sin dirección',
            timeRange: s.start_time
                ? `${format(parseISOLocal(s.start_time), 'HH:mm')} – ${format(parseISOLocal(s.end_time), 'HH:mm')}`
                : null,
        })),
        { label: OFFICE_LABEL, address: OFFICE_ADDRESS, timeRange: null }
    ];

    const hasRouteData = teamRouteData && !teamRouteData.error;

    return (
        <div className="rounded-2xl overflow-hidden shadow-md border border-slate-200 bg-white">
            {/* Card Header */}
            <div
                className={`bg-gradient-to-r ${color.bg} px-5 py-4 cursor-pointer`}
                onClick={() => setExpanded(e => !e)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                            <Car className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-base leading-tight">
                                {team.team_name || `Equipo ${teamMemberNames[0] || ''}`}
                            </h3>
                            <p className="text-white/70 text-xs mt-0.5 flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {teamMemberNames.length > 0 ? teamMemberNames.join(' · ') : 'Sin miembros asignados'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {hasRouteData && (
                            <div className="text-right hidden sm:block">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5 bg-white/20 rounded-lg px-2.5 py-1">
                                        <Timer className="w-3.5 h-3.5 text-white/80" />
                                        <span className="text-white font-bold text-sm">{teamRouteData.total_travel_time_text}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 bg-white/15 rounded-lg px-2.5 py-1">
                                        <Milestone className="w-3.5 h-3.5 text-white/70" />
                                        <span className="text-white/90 text-sm">{teamRouteData.total_distance_text}</span>
                                    </div>
                                </div>
                                <p className="text-white/60 text-xs mt-1 text-right">
                                    {teamSchedules.length} servicio{teamSchedules.length !== 1 ? 's' : ''}
                                </p>
                            </div>
                        )}
                        {loading && (
                            <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                        )}
                        <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
                            {expanded
                                ? <ChevronUp className="w-4 h-4 text-white" />
                                : <ChevronDown className="w-4 h-4 text-white" />
                            }
                        </div>
                    </div>
                </div>

                {/* Mobile stats */}
                {hasRouteData && (
                    <div className="flex items-center gap-3 mt-3 sm:hidden">
                        <div className="flex items-center gap-1.5 bg-white/20 rounded-lg px-2.5 py-1">
                            <Timer className="w-3.5 h-3.5 text-white/80" />
                            <span className="text-white font-bold text-sm">{teamRouteData.total_travel_time_text}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-white/15 rounded-lg px-2.5 py-1">
                            <Milestone className="w-3.5 h-3.5 text-white/70" />
                            <span className="text-white/90 text-sm">{teamRouteData.total_distance_text}</span>
                        </div>
                    </div>
                )}
            </div>

            {expanded && (
                <div className="p-5">
                    {teamSchedules.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <MapPin className="w-10 h-10 mx-auto mb-2 opacity-25" />
                            <p className="text-sm">Sin servicios para este equipo</p>
                        </div>
                    ) : loading ? (
                        <div className="flex items-center justify-center py-10 gap-3 text-slate-400">
                            <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                            <span className="text-sm">Calculando tiempos de viaje...</span>
                        </div>
                    ) : (
                        <>
                            {teamRouteData?.error && (
                                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    {teamRouteData.error}
                                </div>
                            )}
                            <div>
                                {stops.map((stop, idx) => {
                                    const stopType = idx === 0
                                        ? 'office-start'
                                        : idx === stops.length - 1
                                        ? 'office-end'
                                        : 'client';
                                    return (
                                        <TimelineStop
                                            key={idx}
                                            stop={stop}
                                            segment={teamRouteData?.segments?.[idx] || null}
                                            type={stopType}
                                            stopIndex={idx}
                                            totalStops={stops.length}
                                            color={color}
                                        />
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default function HorarioRutasView({ schedules, users, dailyTeamAssignments }) {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [routesData, setRoutesData] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const fetchedKeyRef = useRef(null);

    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

    const schedulesForDay = useMemo(() => (schedules || []).filter(s =>
        s.start_time?.slice(0, 10) === dateStr && s.status !== 'cancelled'
    ), [schedules, dateStr]);

    const teamsForDay = useMemo(() => {
        const assignments = (dailyTeamAssignments || []).filter(a => a.date?.slice(0, 10) === dateStr);
        const dynamicTeams = assignments.map(a => ({
            id: a.id,
            team_name: a.team_name || `Equipo — ${a.vehicle_info || a.driver_name || a.id?.slice(-4)}`,
            team_member_ids: a.team_member_ids || [],
            vehicle_info: a.vehicle_info || null,
        }));

        schedulesForDay.forEach(s => {
            const cleanerIds = s.cleaner_ids || [];
            if (cleanerIds.length === 0) return;
            const alreadyInTeam = dynamicTeams.some(t =>
                cleanerIds.some(id => t.team_member_ids.includes(id))
            );
            if (alreadyInTeam) return;
            const teamKey = `dynamic_${[...cleanerIds].sort().join('_')}`;
            if (!dynamicTeams.find(t => t.id === teamKey)) {
                const names = cleanerIds.map(id => (users || []).find(u => u.id === id)?.full_name).filter(Boolean);
                dynamicTeams.push({
                    id: teamKey,
                    team_name: names.length > 0 ? names.join(' + ') : 'Equipo Sin Nombre',
                    team_member_ids: cleanerIds,
                    vehicle_info: null,
                });
            }
        });

        return dynamicTeams.filter(team =>
            schedulesForDay.some(s => (s.cleaner_ids || []).some(id => team.team_member_ids.includes(id)))
        );
    }, [dailyTeamAssignments, schedulesForDay, dateStr, users]);

    const fetchAllRoutes = async () => {
        if (teamsForDay.length === 0) return;
        const teamsPayload = teamsForDay.map(team => {
            const teamSchedules = (schedules || [])
                .filter(s => s.start_time?.slice(0, 10) === dateStr && s.status !== 'cancelled' && s.cleaner_ids?.some(id => team.team_member_ids?.includes(id)))
                .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
            return { teamId: team.id, addresses: teamSchedules.map(s => s.client_address).filter(Boolean) };
        }).filter(t => t.addresses.length > 0);
        if (teamsPayload.length === 0) return;
        setLoading(true);
        setError('');
        try {
            const res = await calculateRoutes({ teams: teamsPayload });
            if (res.data?.success) {
                setRoutesData(res.data.teams || {});
            } else {
                setError(res.data?.error || 'Error al calcular rutas');
            }
        } catch (err) {
            setError(err.message || 'Error al calcular rutas');
        }
        setLoading(false);
    };

    const cacheKey = dateStr + ':' + teamsForDay.map(t => t.id).join(',') + ':' + schedulesForDay.map(s => s.id).sort().join(',');

    useEffect(() => {
        if (fetchedKeyRef.current === cacheKey) return;
        fetchedKeyRef.current = cacheKey;
        setRoutesData({});
        fetchAllRoutes();
    }, [cacheKey]);

    const isToday = isSameDay(selectedDate, new Date());
    const totalServices = schedulesForDay.length;
    const totalTravelMins = Object.values(routesData).reduce((acc, r) => acc + (r?.total_travel_time_minutes || 0), 0);

    return (
        <div className="min-h-full bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Top Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10 shadow-sm">
                <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-sm">
                            <Route className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Rutas del Día</h2>
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                Desde 167 Millers Rd, Altona North
                            </p>
                        </div>
                    </div>

                    {/* Date controls */}
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedDate(d => subDays(d, 1))} className="h-9 w-9 p-0 hover:bg-slate-100">
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl min-w-[175px] justify-center shadow-sm">
                            <CalendarDays className="w-4 h-4 text-slate-300 flex-shrink-0" />
                            <span className="font-semibold text-sm capitalize">
                                {format(selectedDate, "EEE d MMM yyyy", { locale: es })}
                            </span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedDate(d => addDays(d, 1))} className="h-9 w-9 p-0 hover:bg-slate-100">
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                        {!isToday && (
                            <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())} className="h-9 px-3 text-xs font-semibold">
                                Hoy
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { fetchedKeyRef.current = null; fetchAllRoutes(); }}
                            disabled={loading}
                            className="h-9 w-9 p-0"
                            title="Recalcular rutas"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
                {/* Summary pills */}
                {teamsForDay.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        <div className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-sm">
                            <Car className="w-3.5 h-3.5 text-blue-500" />
                            {teamsForDay.length} equipo{teamsForDay.length !== 1 ? 's' : ''}
                        </div>
                        <div className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-sm">
                            <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                            {totalServices} servicio{totalServices !== 1 ? 's' : ''}
                        </div>
                        {totalTravelMins > 0 && (
                            <div className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-sm">
                                <Timer className="w-3.5 h-3.5 text-amber-500" />
                                {totalTravelMins} min viaje total
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {teamsForDay.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-20 text-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Route className="w-8 h-8 text-slate-400" />
                        </div>
                        <p className="font-semibold text-slate-700 text-lg">Sin servicios programados</p>
                        <p className="text-sm text-slate-400 mt-1">No hay servicios agendados para este día</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {teamsForDay.map((team, idx) => (
                            <TeamRouteCard
                                key={team.id}
                                team={team}
                                teamRouteData={routesData[team.id] || null}
                                loading={loading}
                                users={users}
                                schedules={schedules}
                                date={selectedDate}
                                colorScheme={TEAM_COLORS[idx % TEAM_COLORS.length]}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}