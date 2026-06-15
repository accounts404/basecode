import React, { useState, useEffect, useRef, useMemo } from 'react';
import { format, isSameDay, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { calculateRoutes } from '@/functions/calculateRoutes';
import {
    MapPin, Car, Clock, Route, RefreshCw, Navigation,
    Building2, AlertCircle, ChevronDown, ChevronUp, Users,
    ChevronLeft, ChevronRight, CalendarDays, Timer, Milestone, ArrowDown
} from 'lucide-react';

const OFFICE_ADDRESS = '167 Millers Rd, Altona North VIC 3025';
const OFFICE_LABEL = '167 Millers Rd, Altona North';

const parseISOLocal = (iso) => {
    if (!iso) return null;
    const clean = iso.endsWith('Z') ? iso.slice(0, -1) : iso;
    return new Date(clean);
};

const TEAM_COLORS = [
    { gradient: 'from-blue-600 to-indigo-700', accent: '#3b82f6', light: 'bg-blue-50', border: 'border-blue-200', stop: 'bg-blue-600', text: 'text-blue-700', pill: 'bg-blue-100 text-blue-800 border-blue-200' },
    { gradient: 'from-violet-600 to-purple-700', accent: '#7c3aed', light: 'bg-violet-50', border: 'border-violet-200', stop: 'bg-violet-600', text: 'text-violet-700', pill: 'bg-violet-100 text-violet-800 border-violet-200' },
    { gradient: 'from-emerald-500 to-teal-600', accent: '#10b981', light: 'bg-emerald-50', border: 'border-emerald-200', stop: 'bg-emerald-600', text: 'text-emerald-700', pill: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    { gradient: 'from-orange-500 to-amber-600', accent: '#f59e0b', light: 'bg-orange-50', border: 'border-orange-200', stop: 'bg-orange-500', text: 'text-orange-700', pill: 'bg-orange-100 text-orange-800 border-orange-200' },
    { gradient: 'from-rose-500 to-pink-600', accent: '#f43f5e', light: 'bg-rose-50', border: 'border-rose-200', stop: 'bg-rose-500', text: 'text-rose-700', pill: 'bg-rose-100 text-rose-800 border-rose-200' },
];

// ── Travel Pill: the key info between stops ──────────────────────────────────
function TravelPill({ segment, color }) {
    if (!segment || segment.status !== 'OK') return (
        <div className="flex items-center justify-center gap-2 my-1">
            <div className="h-6 w-px bg-slate-200" />
            <span className="text-xs text-slate-300 italic">Sin datos</span>
            <div className="h-6 w-px bg-slate-200" />
        </div>
    );

    return (
        <div className="flex items-center gap-3 my-1 px-2">
            {/* Left line */}
            <div className="flex-1 h-px bg-slate-200" />
            {/* Pill */}
            <div className="flex items-center gap-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded-full shadow-sm">
                <div className="flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-sm font-bold text-amber-700">{segment.duration_text}</span>
                </div>
                <div className="w-px h-4 bg-amber-200" />
                <div className="flex items-center gap-1.5">
                    <Route className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-sm text-slate-500 font-medium">{segment.distance_text}</span>
                </div>
            </div>
            {/* Right line */}
            <div className="flex-1 h-px bg-slate-200" />
        </div>
    );
}

// ── Stop Card ────────────────────────────────────────────────────────────────
function StopCard({ stop, isOffice, stopNumber, color }) {
    return (
        <div className={`flex items-start gap-3 p-3.5 rounded-xl border ${isOffice ? 'bg-slate-50 border-slate-200' : `${color.light} ${color.border}`}`}>
            {/* Number / Icon */}
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm ${isOffice ? 'bg-slate-700' : color.stop}`}>
                {isOffice
                    ? <Building2 className="w-4 h-4 text-white" />
                    : <span className="text-white font-bold text-xs">{stopNumber}</span>
                }
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm leading-tight ${isOffice ? 'text-slate-600' : 'text-slate-900'}`}>
                    {stop.label}
                </p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{stop.address}</p>
            </div>
            {/* Time badge */}
            {stop.timeRange && (
                <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border flex-shrink-0 ${color.pill}`}>
                    <Clock className="w-3 h-3" />
                    {stop.timeRange}
                </div>
            )}
        </div>
    );
}

// ── Team Route Card ───────────────────────────────────────────────────────────
function TeamRouteCard({ team, teamRouteData, loading, users, schedules, date, colorScheme }) {
    const [expanded, setExpanded] = useState(true);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const color = colorScheme;

    const teamSchedules = useMemo(() => (schedules || [])
        .filter(s =>
            s.start_time?.slice(0, 10) === dateStr &&
            s.status !== 'cancelled' &&
            s.cleaner_ids?.some(id => team.team_member_ids?.includes(id))
        )
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time)),
        [schedules, dateStr, team.team_member_ids]
    );

    const teamMemberNames = useMemo(() =>
        (team.team_member_ids || []).map(id => users.find(u => u.id === id)?.full_name).filter(Boolean),
        [team.team_member_ids, users]
    );

    const stops = [
        { label: OFFICE_LABEL, address: OFFICE_ADDRESS, timeRange: null },
        ...teamSchedules.map(s => ({
            label: s.client_name || 'Cliente',
            address: s.client_address || 'Sin dirección',
            timeRange: s.start_time
                ? `${format(parseISOLocal(s.start_time), 'HH:mm')} – ${format(parseISOLocal(s.end_time), 'HH:mm')}`
                : null,
        })),
        { label: OFFICE_LABEL, address: OFFICE_ADDRESS, timeRange: null },
    ];

    const hasRoute = teamRouteData && !teamRouteData.error;

    return (
        <div className="rounded-2xl overflow-hidden shadow-sm border border-slate-200 bg-white">

            {/* ── Header ── */}
            <button
                onClick={() => setExpanded(e => !e)}
                className={`w-full text-left bg-gradient-to-r ${color.gradient} px-5 py-4 focus:outline-none`}
            >
                <div className="flex items-center justify-between gap-4">
                    {/* Left: Team info */}
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                            <Car className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-white font-bold text-base leading-tight truncate">
                                {team.team_name || `Equipo ${teamMemberNames[0] || ''}`}
                            </p>
                            <p className="text-white/70 text-xs mt-0.5 flex items-center gap-1">
                                <Users className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{teamMemberNames.join(' · ') || 'Sin miembros'}</span>
                            </p>
                        </div>
                    </div>

                    {/* Right: Stats + toggle */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {loading && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                        {hasRoute && (
                            <div className="hidden sm:flex items-center gap-2">
                                <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/20">
                                    <Timer className="w-3.5 h-3.5 text-white" />
                                    <span className="text-white font-bold text-sm">{teamRouteData.total_travel_time_text}</span>
                                </div>
                                <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-2.5 py-1.5 border border-white/10">
                                    <Milestone className="w-3.5 h-3.5 text-white/70" />
                                    <span className="text-white/85 text-sm">{teamRouteData.total_distance_text}</span>
                                </div>
                            </div>
                        )}
                        <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
                            {expanded ? <ChevronUp className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-white" />}
                        </div>
                    </div>
                </div>

                {/* Mobile stats */}
                {hasRoute && (
                    <div className="flex items-center gap-2 mt-3 sm:hidden">
                        <div className="flex items-center gap-1.5 bg-white/20 rounded-lg px-3 py-1.5">
                            <Timer className="w-3.5 h-3.5 text-white" />
                            <span className="text-white font-bold text-sm">{teamRouteData.total_travel_time_text}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-2.5 py-1.5">
                            <Milestone className="w-3.5 h-3.5 text-white/70" />
                            <span className="text-white/85 text-sm">{teamRouteData.total_distance_text}</span>
                        </div>
                    </div>
                )}

                {/* Sub-stats: service count */}
                <div className="flex items-center gap-3 mt-2.5">
                    <span className="text-white/60 text-xs">
                        {teamSchedules.length} servicio{teamSchedules.length !== 1 ? 's' : ''}
                    </span>
                    {team.vehicle_info && (
                        <span className="text-white/50 text-xs flex items-center gap-1">
                            <Car className="w-3 h-3" />{team.vehicle_info}
                        </span>
                    )}
                </div>
            </button>

            {/* ── Body ── */}
            {expanded && (
                <div className="p-5">
                    {teamSchedules.length === 0 ? (
                        <div className="text-center py-10">
                            <MapPin className="w-10 h-10 mx-auto mb-2 text-slate-200" />
                            <p className="text-sm text-slate-400">Sin servicios para este equipo</p>
                        </div>
                    ) : loading ? (
                        <div className="flex items-center justify-center py-10 gap-3 text-slate-400">
                            <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                            <span className="text-sm">Calculando tiempos de viaje...</span>
                        </div>
                    ) : (
                        <div className="space-y-0">
                            {teamRouteData?.error && (
                                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    {teamRouteData.error}
                                </div>
                            )}

                            {stops.map((stop, idx) => {
                                const isOffice = idx === 0 || idx === stops.length - 1;
                                const segment = teamRouteData?.segments?.[idx] || null;
                                const isLast = idx === stops.length - 1;
                                return (
                                    <React.Fragment key={idx}>
                                        <StopCard
                                            stop={stop}
                                            isOffice={isOffice}
                                            stopNumber={idx}
                                            color={color}
                                        />
                                        {!isLast && (
                                            <TravelPill segment={segment} color={color} />
                                        )}
                                    </React.Fragment>
                                );
                            })}

                            {/* Total summary bar */}
                            {hasRoute && (
                                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                                    <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total viaje</span>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-1.5">
                                            <Timer className="w-4 h-4 text-amber-500" />
                                            <span className="font-bold text-slate-800">{teamRouteData.total_travel_time_text}</span>
                                        </div>
                                        <div className="w-px h-4 bg-slate-200" />
                                        <div className="flex items-center gap-1.5">
                                            <Route className="w-4 h-4 text-slate-400" />
                                            <span className="font-semibold text-slate-600">{teamRouteData.total_distance_text}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
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
            if (!cleanerIds.length) return;
            const alreadyInTeam = dynamicTeams.some(t => cleanerIds.some(id => t.team_member_ids.includes(id)));
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
        if (!teamsForDay.length) return;
        const teamsPayload = teamsForDay
            .map(team => {
                const ts = (schedules || [])
                    .filter(s => s.start_time?.slice(0, 10) === dateStr && s.status !== 'cancelled' && s.cleaner_ids?.some(id => team.team_member_ids?.includes(id)))
                    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
                return { teamId: team.id, addresses: ts.map(s => s.client_address).filter(Boolean) };
            })
            .filter(t => t.addresses.length > 0);

        if (!teamsPayload.length) return;
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
        } finally {
            setLoading(false);
        }
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
        <div className="min-h-full bg-slate-50">
            {/* ── Sticky Header ── */}
            <div className="bg-white border-b border-slate-200 px-5 py-4 sticky top-0 z-10">
                <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center shadow-sm">
                            <Route className="w-4.5 h-4.5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">Rutas del Día</h2>
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                <Building2 className="w-3 h-3" />
                                Salida desde Altona North
                            </p>
                        </div>
                    </div>

                    {/* Date navigator */}
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setSelectedDate(d => subDays(d, 1))}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 text-white rounded-xl min-w-[160px] justify-center">
                            <CalendarDays className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="font-semibold text-sm capitalize">
                                {format(selectedDate, "EEE d MMM", { locale: es })}
                            </span>
                            {isToday && <span className="text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded-md font-bold">hoy</span>}
                        </div>
                        <button
                            onClick={() => setSelectedDate(d => addDays(d, 1))}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        {!isToday && (
                            <button
                                onClick={() => setSelectedDate(new Date())}
                                className="text-xs font-semibold px-2.5 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-600"
                            >
                                Hoy
                            </button>
                        )}
                        <button
                            onClick={() => { fetchedKeyRef.current = null; fetchAllRoutes(); }}
                            disabled={loading}
                            title="Recalcular rutas"
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-slate-500 disabled:opacity-40"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">

                {/* ── Summary bar ── */}
                {teamsForDay.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        <Pill icon={<Car className="w-3.5 h-3.5 text-blue-500" />} label={`${teamsForDay.length} equipo${teamsForDay.length !== 1 ? 's' : ''}`} />
                        <Pill icon={<MapPin className="w-3.5 h-3.5 text-emerald-500" />} label={`${totalServices} servicio${totalServices !== 1 ? 's' : ''}`} />
                        {totalTravelMins > 0 && (
                            <Pill icon={<Timer className="w-3.5 h-3.5 text-amber-500" />} label={`${totalTravelMins} min viaje total`} />
                        )}
                    </div>
                )}

                {/* ── Error ── */}
                {error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {/* ── Empty state ── */}
                {teamsForDay.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Route className="w-8 h-8 text-slate-300" />
                        </div>
                        <p className="font-semibold text-slate-600">Sin servicios programados</p>
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

function Pill({ icon, label }) {
    return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-sm">
            {icon}{label}
        </div>
    );
}