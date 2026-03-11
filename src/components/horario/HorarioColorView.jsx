import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Users, Calendar } from 'lucide-react';

const VISIBLE_START_HOUR = 6;
const VISIBLE_END_HOUR = 22;
const TOTAL_VISIBLE_HOURS = VISIBLE_END_HOUR - VISIBLE_START_HOUR;
const HOUR_WIDTH = 90; // px por hora
const LANE_HEIGHT = 40; // px por "carril" dentro de una fila
const MIN_ROW_HEIGHT = 56; // px mínimo por fila de color

// Organiza eventos en carriles para evitar solapamiento visual
function organizeIntoLanes(events) {
    const sorted = [...events].sort((a, b) =>
        a.start_time.localeCompare(b.start_time)
    );
    const lanes = [];
    sorted.forEach(event => {
        const eStart = event.start_time.slice(11, 16);
        const eEnd = event.end_time.slice(11, 16);
        let placed = false;
        for (let i = 0; i < lanes.length; i++) {
            const last = lanes[i][lanes[i].length - 1];
            if (last.end_time.slice(11, 16) <= eStart) {
                lanes[i].push(event);
                placed = true;
                break;
            }
        }
        if (!placed) lanes.push([event]);
    });
    // Devolver eventos con su índice de carril
    const result = [];
    lanes.forEach((lane, laneIdx) => {
        lane.forEach(event => result.push({ ...event, laneIdx, totalLanes: lanes.length }));
    });
    return result;
}

function getEventStyle(event) {
    const startH = parseInt(event.start_time.slice(11, 13));
    const startM = parseInt(event.start_time.slice(14, 16));
    const endH = parseInt(event.end_time.slice(11, 13));
    const endM = parseInt(event.end_time.slice(14, 16));

    const startMinutes = startH * 60 + startM - VISIBLE_START_HOUR * 60;
    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);

    const left = (startMinutes / 60) * HOUR_WIDTH;
    const width = Math.max((durationMinutes / 60) * HOUR_WIDTH, 40);

    return { left: Math.max(0, left), width };
}

export default function HorarioColorView({ events, date, users, onSelectEvent }) {
    const dayStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    const dayEvents = useMemo(() => {
        return (events || []).filter(e =>
            e.start_time &&
            e.start_time.slice(0, 10) === dayStr &&
            e.status !== 'cancelled'
        );
    }, [events, dayStr]);

    // Agrupar por color
    const colorGroups = useMemo(() => {
        const groups = new Map();
        dayEvents.forEach(event => {
            const color = event.color || '#64748b';
            if (!groups.has(color)) groups.set(color, []);
            groups.get(color).push(event);
        });
        return groups;
    }, [dayEvents]);

    // Obtener nombres de limpiadores por color
    const getCleanersForColor = (color) => {
        return (users || []).filter(u => u.role !== 'admin' && u.color === color);
    };

    const hourColumns = Array.from({ length: TOTAL_VISIBLE_HOURS }, (_, i) => VISIBLE_START_HOUR + i);

    if (colorGroups.size === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 py-24">
                <Calendar className="w-16 h-16" />
                <p className="text-lg font-medium">No hay servicios para este día</p>
                <p className="text-sm">{format(date, "EEEE, d 'de' MMMM yyyy", { locale: es })}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Cabecera con horas — sticky */}
            <div className="flex flex-shrink-0 sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
                {/* Columna etiqueta */}
                <div className="flex-shrink-0 border-r border-slate-200 bg-slate-50" style={{ width: 180 }} />
                {/* Horas */}
                <div className="flex overflow-x-visible">
                    {hourColumns.map(h => (
                        <div
                            key={h}
                            className="flex-shrink-0 border-r border-slate-200 text-center py-2"
                            style={{ width: HOUR_WIDTH }}
                        >
                            <span className="text-xs font-semibold text-slate-500">
                                {String(h).padStart(2, '0')}:00
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Filas de colores */}
            <div className="flex-1 overflow-y-auto overflow-x-auto">
                {Array.from(colorGroups.entries()).map(([color, colorEvents]) => {
                    const eventsWithLanes = organizeIntoLanes(colorEvents);
                    const totalLanes = eventsWithLanes.length > 0 ? eventsWithLanes[0].totalLanes : 1;
                    const rowHeight = Math.max(MIN_ROW_HEIGHT, totalLanes * LANE_HEIGHT + 16);
                    const cleaners = getCleanersForColor(color);

                    return (
                        <div
                            key={color}
                            className="flex border-b border-slate-200 hover:bg-slate-50/50 transition-colors"
                            style={{ minHeight: rowHeight }}
                        >
                            {/* Etiqueta del equipo */}
                            <div
                                className="flex-shrink-0 border-r border-slate-200 flex flex-col justify-center px-3 gap-1"
                                style={{ width: 180 }}
                            >
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm"
                                        style={{ backgroundColor: color }}
                                    />
                                    <span className="text-xs font-bold text-slate-800 truncate">
                                        {cleaners.length > 0
                                            ? cleaners.map(c => (c.display_name || c.invoice_name || c.full_name || '').split(' ')[0]).join(', ')
                                            : 'Equipo'}
                                    </span>
                                </div>
                                {cleaners.length > 0 && (
                                    <div className="flex items-center gap-1 text-slate-400">
                                        <Users className="w-3 h-3" />
                                        <span className="text-xs">{cleaners.length} limpiador{cleaners.length !== 1 ? 'es' : ''}</span>
                                    </div>
                                )}
                                <span className="text-xs text-slate-400">{colorEvents.length} servicio{colorEvents.length !== 1 ? 's' : ''}</span>
                            </div>

                            {/* Timeline */}
                            <div
                                className="relative flex-shrink-0"
                                style={{ width: TOTAL_VISIBLE_HOURS * HOUR_WIDTH, minHeight: rowHeight }}
                            >
                                {/* Líneas de horas */}
                                {hourColumns.map((h, i) => (
                                    <div
                                        key={h}
                                        className="absolute top-0 bottom-0 border-r border-slate-100"
                                        style={{ left: i * HOUR_WIDTH }}
                                    />
                                ))}
                                {/* Línea de medias horas */}
                                {hourColumns.map((h, i) => (
                                    <div
                                        key={`half-${h}`}
                                        className="absolute top-0 bottom-0 border-r border-dashed border-slate-100"
                                        style={{ left: i * HOUR_WIDTH + HOUR_WIDTH / 2 }}
                                    />
                                ))}

                                {/* Eventos */}
                                {eventsWithLanes.map(event => {
                                    const { left, width } = getEventStyle(event);
                                    const top = 8 + event.laneIdx * LANE_HEIGHT;
                                    const isCompleted = event.status === 'completed';
                                    const isInProgress = event.status === 'in_progress';

                                    return (
                                        <div
                                            key={event.id}
                                            className="absolute rounded-lg cursor-pointer shadow-sm hover:shadow-md hover:scale-[1.02] transition-all overflow-hidden border-2 border-white/40 group"
                                            style={{
                                                left,
                                                width,
                                                top,
                                                height: LANE_HEIGHT - 4,
                                                backgroundColor: isCompleted ? '#94a3b8' : color,
                                                opacity: isCompleted ? 0.7 : 1,
                                            }}
                                            onClick={() => onSelectEvent(event)}
                                            title={`${event.client_name} — ${event.start_time.slice(11, 16)} a ${event.end_time.slice(11, 16)}`}
                                        >
                                            <div className="flex items-center h-full px-2 gap-1">
                                                {isInProgress && (
                                                    <span className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0" />
                                                )}
                                                {isCompleted && (
                                                    <span className="text-white text-xs flex-shrink-0">✓</span>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white text-xs font-bold truncate leading-tight">
                                                        {event.client_name}
                                                    </p>
                                                    {width > 80 && (
                                                        <p className="text-white/80 text-[10px] truncate leading-tight">
                                                            {event.start_time.slice(11, 16)}–{event.end_time.slice(11, 16)}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}