import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Users, Navigation, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const HOUR_HEIGHT = 64;
const VISIBLE_START_HOUR = 6;
const VISIBLE_END_HOUR = 22;
const TOTAL_VISIBLE_HOURS = VISIBLE_END_HOUR - VISIBLE_START_HOUR;
const TOTAL_DISPLAY_HEIGHT_PX = TOTAL_VISIBLE_HOURS * HOUR_HEIGHT;

const parseISOAsUTC = (isoString) => {
    if (!isoString) return new Date();
    const s = isoString.endsWith('Z') ? isoString : `${isoString}Z`;
    return new Date(s);
};

const formatTimeUTC = (date) => {
    if (!date) return '';
    return `${date.getUTCHours().toString().padStart(2, '0')}:${date.getUTCMinutes().toString().padStart(2, '0')}`;
};

const organizeOverlapping = (colEvents) => {
    if (colEvents.length === 0) return [];
    const sorted = [...colEvents].sort((a, b) =>
        parseISOAsUTC(a.start_time).getTime() - parseISOAsUTC(b.start_time).getTime()
    );
    const columns = [];
    sorted.forEach(event => {
        const eStart = parseISOAsUTC(event.start_time).getTime();
        const eEnd = parseISOAsUTC(event.end_time).getTime();
        let placed = false;
        for (let ci = 0; ci < columns.length; ci++) {
            const conflict = columns[ci].some(e => {
                const s = parseISOAsUTC(e.start_time).getTime();
                const en = parseISOAsUTC(e.end_time).getTime();
                return eStart < en && eEnd > s;
            });
            if (!conflict) {
                columns[ci].push(event);
                placed = true;
                break;
            }
        }
        if (!placed) columns.push([event]);
    });
    return columns.flatMap((col, ci) =>
        col.map(e => ({ ...e, _ci: ci, _tc: columns.length }))
    );
};

export default function HorarioColorView({ events = [], date, users = [], onSelectEvent }) {
    const selectedDateStr = useMemo(() => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }, [date]);

    // Map color -> users (non-admin)
    const colorUserMap = useMemo(() => {
        const map = new Map();
        users.forEach(u => {
            if (u.color && u.role !== 'admin') {
                if (!map.has(u.color)) map.set(u.color, []);
                map.get(u.color).push(u);
            }
        });
        return map;
    }, [users]);

    // Filter events for selected date and group by color
    const colorGroups = useMemo(() => {
        const dayEvts = events.filter(e =>
            e.start_time && e.status !== 'cancelled' && e.start_time.slice(0, 10) === selectedDateStr
        );
        const groups = new Map();
        dayEvts.forEach(e => {
            const c = e.color || '#64748b';
            if (!groups.has(c)) groups.set(c, []);
            groups.get(c).push(e);
        });
        // Sort by number of events desc
        return new Map([...groups.entries()].sort((a, b) => b[1].length - a[1].length));
    }, [events, selectedDateStr]);

    const colorList = [...colorGroups.keys()];

    const getTeamMembers = (color) => {
        const us = colorUserMap.get(color) || [];
        return us.map(u => {
            const full = (u.display_name || u.invoice_name || u.full_name || '').trim();
            // First name + first letter of last name if available
            const parts = full.split(' ').filter(Boolean);
            if (parts.length >= 2) return `${parts[0]} ${parts[1][0]}.`;
            return parts[0] || 'Limpiador';
        }).filter(Boolean);
    };

    const calculatePos = (event) => {
        const s = parseISOAsUTC(event.start_time);
        const e = parseISOAsUTC(event.end_time);
        const sh = s.getUTCHours() + s.getUTCMinutes() / 60;
        const eh = e.getUTCHours() + e.getUTCMinutes() / 60;
        if (eh <= VISIBLE_START_HOUR || sh >= VISIBLE_END_HOUR) return null;
        const vs = Math.max(sh, VISIBLE_START_HOUR);
        const ve = Math.min(eh, VISIBLE_END_HOUR);
        return { startPos: vs - VISIBLE_START_HOUR, dur: ve - vs };
    };

    if (colorList.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-slate-500">
                <div className="text-center">
                    <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p className="font-medium">No hay servicios para esta fecha</p>
                    <p className="text-sm text-slate-400 mt-1">
                        {format(date, "EEEE, d 'de' MMMM", { locale: es })}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Column headers */}
            <div className="flex border-b border-gray-200 sticky top-0 bg-white z-20 shadow-sm">
                <div className="w-20 flex-shrink-0 border-r border-gray-200 p-2 text-center flex items-center justify-center">
                    <p className="text-xs font-semibold text-slate-500">{format(date, "d MMM", { locale: es })}</p>
                </div>
                {colorList.map(color => {
                    const colEvts = colorGroups.get(color);
                    const members = getTeamMembers(color);
                    return (
                        <div key={color} className="flex-1 p-3 text-center border-r border-gray-200 min-w-[200px]">
                            <div className="flex items-center justify-center gap-2 mb-2">
                                <div
                                    className="w-4 h-4 rounded-full border-2 border-white shadow flex-shrink-0"
                                    style={{ backgroundColor: color }}
                                />
                            </div>
                            <div className="text-sm font-semibold text-slate-800">
                                {members.map((member, i) => (
                                    <div key={i} className="leading-tight">
                                        {member}
                                    </div>
                                ))}
                            </div>
                            <span className="text-xs text-slate-500 mt-1">
                                {colEvts.length} servicio{colEvts.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Time grid */}
            <div className="flex flex-1 overflow-auto">
                {/* Hour labels */}
                <div className="w-20 flex-shrink-0 border-r border-gray-200">
                    {Array.from({ length: TOTAL_VISIBLE_HOURS }).map((_, i) => (
                        <div
                            key={i}
                            className="p-2 text-sm text-gray-500 bg-gray-50 border-b border-gray-100 flex items-center justify-center"
                            style={{ height: `${HOUR_HEIGHT}px` }}
                        >
                            {(VISIBLE_START_HOUR + i).toString().padStart(2, '0')}:00
                        </div>
                    ))}
                </div>

                {/* Color columns */}
                <div className="flex flex-1">
                    {colorList.map(color => {
                        const colEvts = organizeOverlapping(colorGroups.get(color) || []);
                        return (
                            <div
                                key={color}
                                className="flex-1 relative border-r border-gray-200 min-w-[160px]"
                                style={{ height: `${TOTAL_DISPLAY_HEIGHT_PX}px` }}
                            >
                                {/* Grid lines */}
                                {Array.from({ length: TOTAL_VISIBLE_HOURS }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="absolute w-full border-b border-gray-100"
                                        style={{ top: `${i * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                                    />
                                ))}

                                {/* Events */}
                                {colEvts.map(event => {
                                    const pos = calculatePos(event);
                                    if (!pos) return null;
                                    const topPx = pos.startPos * HOUR_HEIGHT;
                                    const heightPx = Math.max(pos.dur * HOUR_HEIGHT, 32);
                                    const w = 100 / event._tc;
                                    const l = event._ci * w;
                                    const startDt = parseISOAsUTC(event.start_time);
                                    const endDt = parseISOAsUTC(event.end_time);
                                    const isUnassigned = !event.cleaner_ids || event.cleaner_ids.length === 0;

                                    return (
                                        <div
                                            key={event.id}
                                            className="absolute p-0.5 z-10"
                                            style={{
                                                top: `${topPx}px`,
                                                height: `${heightPx}px`,
                                                left: `${l}%`,
                                                width: `${w}%`,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <Card
                                                onClick={() => onSelectEvent(event)}
                                                className={`h-full text-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all border-2 hover:border-white/50 ${isUnassigned ? 'border-4 border-red-500' : ''}`}
                                                style={{ backgroundColor: event.color || '#3b82f6' }}
                                            >
                                                <div className="p-1.5 md:p-2 flex flex-col h-full">
                                                    <p className="font-bold text-sm leading-tight truncate">
                                                        {event.client_name}
                                                    </p>
                                                    <div className="text-xs opacity-90 font-medium">
                                                        {formatTimeUTC(startDt)} - {formatTimeUTC(endDt)}
                                                    </div>
                                                    {heightPx > 60 && event.client_address && (
                                                        <div className="text-xs opacity-80 mt-1 truncate flex items-center gap-1">
                                                            <Navigation className="w-3 h-3 flex-shrink-0" />
                                                            <span className="truncate">{event.client_address}</span>
                                                        </div>
                                                    )}
                                                    {event.status === 'completed' && heightPx > 48 && (
                                                        <div className="mt-auto pt-1 flex items-center gap-1">
                                                            <CheckCircle className="w-3 h-3 text-white/90" />
                                                            <span className="text-xs text-white/90">Completado</span>
                                                        </div>
                                                    )}
                                                    {event.status === 'in_progress' && heightPx > 48 && (
                                                        <div className="mt-auto pt-1">
                                                            <span className="text-xs bg-white/20 rounded px-1 py-0.5">En Progreso</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </Card>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}