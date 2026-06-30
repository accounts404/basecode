import React, { useMemo, useState } from 'react';
import { AlertTriangle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

export default function DailyConflictPanel({ schedules, users, date }) {
    const [expanded, setExpanded] = useState(true);

    const warnings = useMemo(() => {
        if (!date || !Array.isArray(schedules) || !Array.isArray(users)) return [];

        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayLabels = {
            sunday: 'domingos', monday: 'lunes', tuesday: 'martes',
            wednesday: 'miércoles', thursday: 'jueves', friday: 'viernes', saturday: 'sábados'
        };

        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const dayKey = dayNames[date.getDay()];

        const daySchedules = schedules.filter(s =>
            s.start_time?.slice(0, 10) === dateStr &&
            s.status !== 'cancelled'
        );

        if (daySchedules.length === 0) return [];

        const result = [];

        // Build a map: cleanerId -> list of {start, end, clientName}
        const cleanerIntervals = {};
        daySchedules.forEach(s => {
            (s.cleaner_ids || []).forEach(cid => {
                if (!cleanerIntervals[cid]) cleanerIntervals[cid] = [];
                // Use individual cleaner schedule if available, else service times
                const cs = s.cleaner_schedules?.find(c => c.cleaner_id === cid);
                const startStr = cs?.start_time || s.start_time;
                const endStr = cs?.end_time || s.end_time;
                const startTime = startStr?.slice(11, 16) || '';
                const endTime = endStr?.slice(11, 16) || '';
                cleanerIntervals[cid].push({ startTime, endTime, clientName: s.client_name, scheduleId: s.id });
            });
        });

        users.forEach(u => {
            if (u.role === 'admin' || u.active === false) return;
            if (!cleanerIntervals[u.id]) return;

            const name = u.display_name || u.invoice_name || u.full_name || u.email;
            const avail = u.availability?.[dayKey];
            const intervals = cleanerIntervals[u.id];

            // 1. Day not available
            if (avail && avail.available === false) {
                result.push({
                    type: 'day',
                    severity: 'red',
                    name,
                    message: `No debería trabajar los ${dayLabels[dayKey]} según su disponibilidad`,
                    services: intervals.map(i => i.clientName).join(', ')
                });
                return; // Skip time checks if day is blocked
            }

            // 2. Time range violations (per service)
            intervals.forEach(({ startTime, endTime, clientName }) => {
                if (avail?.end_time && endTime && endTime > avail.end_time) {
                    result.push({
                        type: 'time_end',
                        severity: 'amber',
                        name,
                        message: `Disponible hasta ${avail.end_time} — servicio en "${clientName}" termina a las ${endTime}`,
                        services: clientName
                    });
                }
                if (avail?.start_time && startTime && startTime < avail.start_time) {
                    result.push({
                        type: 'time_start',
                        severity: 'amber',
                        name,
                        message: `Disponible desde ${avail.start_time} — servicio en "${clientName}" empieza a las ${startTime}`,
                        services: clientName
                    });
                }
            });

            // 3. Overlapping services for same cleaner
            if (intervals.length > 1) {
                for (let i = 0; i < intervals.length; i++) {
                    for (let j = i + 1; j < intervals.length; j++) {
                        const a = intervals[i];
                        const b = intervals[j];
                        if (a.startTime && a.endTime && b.startTime && b.endTime) {
                            if (a.startTime < b.endTime && a.endTime > b.startTime) {
                                result.push({
                                    type: 'overlap',
                                    severity: 'red',
                                    name,
                                    message: `Asignado a dos servicios que se superponen: "${a.clientName}" (${a.startTime}–${a.endTime}) y "${b.clientName}" (${b.startTime}–${b.endTime})`,
                                    services: `${a.clientName}, ${b.clientName}`
                                });
                            }
                        }
                    }
                }
            }
        });

        return result;
    }, [schedules, users, date]);

    if (warnings.length === 0) return null;

    const redCount = warnings.filter(w => w.severity === 'red').length;
    const amberCount = warnings.filter(w => w.severity === 'amber').length;

    return (
        <div className="flex-shrink-0 border-b border-red-200 bg-red-50">
            {/* Header - always visible */}
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-red-100 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <span className="text-sm font-bold text-red-800">
                        Conflictos del día ({warnings.length})
                    </span>
                    <div className="flex items-center gap-1">
                        {redCount > 0 && (
                            <span className="px-1.5 py-0.5 bg-red-600 text-white text-xs font-bold rounded-full">
                                {redCount} crítico{redCount > 1 ? 's' : ''}
                            </span>
                        )}
                        {amberCount > 0 && (
                            <span className="px-1.5 py-0.5 bg-amber-500 text-white text-xs font-bold rounded-full">
                                {amberCount} aviso{amberCount > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>
                {expanded
                    ? <ChevronUp className="w-4 h-4 text-red-600" />
                    : <ChevronDown className="w-4 h-4 text-red-600" />
                }
            </button>

            {/* Warning list */}
            {expanded && (
                <div className="px-4 pb-3 space-y-1.5">
                    {warnings.map((w, i) => (
                        <div
                            key={i}
                            className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                                w.severity === 'red'
                                    ? 'bg-red-100 border border-red-300'
                                    : 'bg-amber-100 border border-amber-300'
                            }`}
                        >
                            <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                                w.severity === 'red' ? 'text-red-700' : 'text-amber-700'
                            }`} />
                            <p className={w.severity === 'red' ? 'text-red-900' : 'text-amber-900'}>
                                <strong>{w.name}:</strong> {w.message}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}