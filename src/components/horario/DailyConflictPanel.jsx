import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

export default function DailyConflictPanel({ schedules, users, date }) {
    const [expanded, setExpanded] = useState(true);

    const conflicts = useMemo(() => {
        if (!date || !schedules?.length || !users?.length) return [];

        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayKey = dayNames[date.getDay()];
        const dayLabels = { sunday: 'domingos', monday: 'lunes', tuesday: 'martes', wednesday: 'miércoles', thursday: 'jueves', friday: 'viernes', saturday: 'sábados' };

        // Servicios activos del día (no cancelados)
        const daySchedules = schedules.filter(s =>
            s.start_time?.slice(0, 10) === dateStr &&
            s.status !== 'cancelled'
        );

        if (!daySchedules.length) return [];

        const result = [];

        // Helper: HH:MM string a minutos
        const toMinutes = (timeStr) => {
            if (!timeStr) return null;
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        // Agrupar servicios por limpiador
        // IMPORTANTE: Siempre usar el start_time del schedule principal para extraer la hora
        // porque los cleaner_schedules pueden tener fechas en UTC distintas al día local.
        // Solo usamos cleaner_schedules si su fecha (slice 0-10) coincide con dateStr.
        const schedulesByUser = {};
        daySchedules.forEach(sched => {
            const schedDateStr = sched.start_time?.slice(0, 10);
            (sched.cleaner_ids || []).forEach(cleanerId => {
                if (!schedulesByUser[cleanerId]) schedulesByUser[cleanerId] = [];

                // Usar cleaner_schedule solo si su fecha base coincide con el día
                const cs = sched.cleaner_schedules?.find(c => c.cleaner_id === cleanerId);
                const csDateMatches = cs?.start_time?.slice(0, 10) === schedDateStr;

                const startStr = (cs && csDateMatches)
                    ? cs.start_time.slice(11, 16)
                    : sched.start_time?.slice(11, 16);
                const endStr = (cs && csDateMatches)
                    ? cs.end_time.slice(11, 16)
                    : sched.end_time?.slice(11, 16);

                schedulesByUser[cleanerId].push({
                    scheduleId: sched.id,
                    clientName: sched.client_name || 'Sin cliente',
                    startMin: toMinutes(startStr),
                    endMin: toMinutes(endStr),
                    startStr,
                    endStr,
                });
            });
        });

        users.filter(u => u.role !== 'admin' && u.active !== false).forEach(user => {
            const userSchedules = schedulesByUser[user.id];
            if (!userSchedules?.length) return;

            const name = user.display_name || user.invoice_name || user.full_name;
            const avail = user.availability?.[dayKey];

            // 1. Día no disponible
            if (avail?.available === false) {
                userSchedules.forEach(s => {
                    result.push({
                        type: 'day',
                        severity: 'red',
                        name,
                        color: user.color,
                        message: `Asignado a "${s.clientName}" (${s.startStr}–${s.endStr}) pero NO está disponible los ${dayLabels[dayKey]}`,
                    });
                });
                return; // No seguir revisando si no trabaja ese día
            }

            // 2. Horario fuera de disponibilidad
            const availStart = toMinutes(avail?.start_time);
            const availEnd = toMinutes(avail?.end_time);

            userSchedules.forEach(s => {
                if (availStart !== null && s.startMin !== null && s.startMin < availStart) {
                    result.push({
                        type: 'time',
                        severity: 'amber',
                        name,
                        color: user.color,
                        message: `"${s.clientName}": empieza a las ${s.startStr} pero su disponibilidad es desde las ${avail.start_time}`,
                    });
                }
                if (availEnd !== null && s.endMin !== null && s.endMin > availEnd) {
                    result.push({
                        type: 'time',
                        severity: 'amber',
                        name,
                        color: user.color,
                        message: `"${s.clientName}": termina a las ${s.endStr} pero su disponibilidad es hasta las ${avail.end_time}`,
                    });
                }
            });

            // 3. Solapamiento entre servicios del mismo limpiador
            // Solapamiento estricto: NO contar si uno termina exactamente cuando el otro empieza
            for (let i = 0; i < userSchedules.length; i++) {
                for (let j = i + 1; j < userSchedules.length; j++) {
                    const a = userSchedules[i];
                    const b = userSchedules[j];
                    // Ignorar si es el mismo servicio (duplicado por alguna razón)
                    if (a.scheduleId === b.scheduleId) continue;
                    if (a.startMin === null || a.endMin === null || b.startMin === null || b.endMin === null) continue;
                    // Solapamiento estricto: se solapan solo si hay minutos en común (no si solo se tocan en el límite)
                    if (a.startMin < b.endMin && b.startMin < a.endMin) {
                        result.push({
                            type: 'overlap',
                            severity: 'red',
                            name,
                            color: user.color,
                            message: `Asignado a 2 servicios que se superponen: "${a.clientName}" (${a.startStr}–${a.endStr}) y "${b.clientName}" (${b.startStr}–${b.endStr})`,
                        });
                    }
                }
            }
        });

        return result;
    }, [schedules, users, date]);

    if (!conflicts.length) return null;

    const redCount = conflicts.filter(c => c.severity === 'red').length;
    const amberCount = conflicts.filter(c => c.severity === 'amber').length;

    return (
        <div className="flex-shrink-0 border-b border-red-200 bg-red-50">
            {/* Header siempre visible */}
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-red-100 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <span className="text-sm font-bold text-red-800">
                        ⚠️ {conflicts.length} conflicto{conflicts.length !== 1 ? 's' : ''} de disponibilidad
                    </span>
                    {redCount > 0 && (
                        <span className="bg-red-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{redCount} crítico{redCount !== 1 ? 's' : ''}</span>
                    )}
                    {amberCount > 0 && (
                        <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{amberCount} advertencia{amberCount !== 1 ? 's' : ''}</span>
                    )}
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-red-600" /> : <ChevronDown className="w-4 h-4 text-red-600" />}
            </button>

            {/* Lista expandible */}
            {expanded && (
                <div className="px-4 pb-3 space-y-1.5 max-h-48 overflow-y-auto">
                    {conflicts.map((c, i) => (
                        <div
                            key={i}
                            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                                c.severity === 'red'
                                    ? 'bg-red-100 border border-red-300 text-red-900'
                                    : 'bg-amber-100 border border-amber-300 text-amber-900'
                            }`}
                        >
                            <span
                                className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 mt-0.5"
                                style={{ backgroundColor: c.color || (c.severity === 'red' ? '#dc2626' : '#d97706'), fontSize: '9px' }}
                            >
                                {c.name?.charAt(0)?.toUpperCase()}
                            </span>
                            <div>
                                <span className="font-semibold">{c.name}:</span>{' '}
                                <span>{c.message}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}