import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TIMEZONE = 'Australia/Melbourne';

function getMelbourneDateToday() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}

function getMelbourneNow() {
    return new Date().toLocaleString('en-AU', { timeZone: TIMEZONE });
}

function dateRangeToUTC(dateFrom, dateTo) {
    const startUTC = dateFrom + 'T00:00:00.000';
    const endUTC = dateTo + 'T23:59:59.999';
    return { startUTC, endUTC };
}

function getLocalDate(isoString) {
    if (!isoString) return null;
    return isoString.slice(0, 10);
}

function getLocalTime(isoString) {
    if (!isoString) return null;
    if (isoString.endsWith('Z') || isoString.includes('+') || (isoString.length > 19 && isoString[19] !== '.')) {
        return new Intl.DateTimeFormat('en-AU', {
            timeZone: TIMEZONE,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(new Date(isoString));
    }
    return isoString.slice(11, 16);
}

function calcHours(startIso, endIso) {
    if (!startIso || !endIso) return 0;
    try {
        const startMs = new Date(startIso.endsWith('Z') || startIso.includes('+') ? startIso : startIso + 'Z').getTime();
        const endMs = new Date(endIso.endsWith('Z') || endIso.includes('+') ? endIso : endIso + 'Z').getTime();
        return Math.max(0, (endMs - startMs) / 3600000);
    } catch {
        return 0;
    }
}

// Convierte HH:MM a minutos desde medianoche
function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

// Convierte minutos desde medianoche a HH:MM
function minutesToTime(mins) {
    const h = Math.floor(mins / 60).toString().padStart(2, '0');
    const m = (mins % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
}

// Calcula disponibilidad de cada limpiador en un día dado
// workdayStart y workdayEnd en minutos (ej: 8*60=480, 16*60=960)
function calculateCleanerAvailability(cleanerName, cleanerId, servicesForDay, workdayStart, workdayEnd) {
    // Obtener todos los bloques ocupados por este limpiador
    const busyBlocks = [];
    
    for (const svc of servicesForDay) {
        if (svc.status === 'cancelled') continue;
        
        // Buscar en cleaner_schedules individuales primero
        const cs = svc.cleaner_schedules.find(c => c.cleaner === cleanerName);
        if (cs) {
            const start = timeToMinutes(cs.start);
            const end = timeToMinutes(cs.end);
            if (start !== null && end !== null) {
                busyBlocks.push({ start, end, client: svc.client_name });
            }
        } else if (svc.cleaners.includes(cleanerName)) {
            // Usar horario general del servicio
            const start = timeToMinutes(svc.start);
            const end = timeToMinutes(svc.end);
            if (start !== null && end !== null) {
                busyBlocks.push({ start, end, client: svc.client_name });
            }
        }
    }

    // Ordenar bloques ocupados
    busyBlocks.sort((a, b) => a.start - b.start);

    // Calcular huecos libres dentro de la jornada laboral
    const freeSlots = [];
    let cursor = workdayStart;

    for (const block of busyBlocks) {
        const blockStart = Math.max(block.start, workdayStart);
        const blockEnd = Math.min(block.end, workdayEnd);
        if (blockStart > cursor) {
            freeSlots.push({
                from: minutesToTime(cursor),
                to: minutesToTime(blockStart),
                duration_hours: parseFloat(((blockStart - cursor) / 60).toFixed(2)),
            });
        }
        if (blockEnd > cursor) cursor = blockEnd;
    }

    if (cursor < workdayEnd) {
        freeSlots.push({
            from: minutesToTime(cursor),
            to: minutesToTime(workdayEnd),
            duration_hours: parseFloat(((workdayEnd - cursor) / 60).toFixed(2)),
        });
    }

    const totalBusyHours = busyBlocks.reduce((sum, b) => {
        const s = Math.max(b.start, workdayStart);
        const e = Math.min(b.end, workdayEnd);
        return sum + Math.max(0, (e - s) / 60);
    }, 0);

    return {
        cleaner: cleanerName,
        busy_services: busyBlocks.length,
        busy_hours: parseFloat(totalBusyHours.toFixed(2)),
        free_slots: freeSlots,
        is_free_all_day: busyBlocks.length === 0,
    };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        let { date_from, date_to, workday_start = '08:00', workday_end = '16:00' } = body;

        const todayMelbourne = getMelbourneDateToday();
        if (!date_from) date_from = todayMelbourne;
        if (!date_to) date_to = todayMelbourne;

        const { startUTC, endUTC } = dateRangeToUTC(date_from, date_to);

        const [schedules, clients, users] = await Promise.all([
            base44.asServiceRole.entities.Schedule.filter(
                { start_time: { $gte: startUTC, $lte: endUTC } },
                'start_time',
                5000
            ),
            base44.asServiceRole.entities.Client.list('-created_date', 3000),
            base44.asServiceRole.entities.User.list('-created_date', 500),
        ]);

        const clientMap = new Map((clients || []).map(c => [c.id, c]));
        const userMap = new Map();
        (users || []).forEach(u => {
            if (u.id) userMap.set(u.id, u);
            if (u.email) userMap.set(u.email, u);
        });

        // Lista de limpiadores activos (role != admin)
        const activecleaners = (users || []).filter(u => u.role !== 'admin' && u.full_name);

        // Filtrar por los primeros 10 chars del start_time
        const filtered = (schedules || []).filter(s => {
            if (!s.start_time) return false;
            const calendarDate = s.start_time.slice(0, 10);
            return calendarDate >= date_from && calendarDate <= date_to;
        });

        // Transformar servicios
        const result = filtered.map(s => {
            const client = clientMap.get(s.client_id);
            const dateMelbourne = getLocalDate(s.start_time);
            const startTime = getLocalTime(s.start_time);
            const endTime = getLocalTime(s.end_time);
            const durationHours = calcHours(s.start_time, s.end_time);

            const cleanerNames = (s.cleaner_ids || []).map(id => {
                const u = userMap.get(id);
                return u ? u.full_name : id;
            });

            const cleanerSchedules = (s.cleaner_schedules || []).map(cs => {
                const u = userMap.get(cs.cleaner_id);
                const csHours = calcHours(cs.start_time, cs.end_time);
                return {
                    cleaner: u ? u.full_name : cs.cleaner_id,
                    start: getLocalTime(cs.start_time),
                    end: getLocalTime(cs.end_time),
                    hours: parseFloat(csHours.toFixed(2)),
                };
            });

            return {
                id: s.id,
                date: dateMelbourne,
                start: startTime,
                end: endTime,
                duration_hours: parseFloat(durationHours.toFixed(2)),
                client_name: client?.name || s.client_name || 'Unknown',
                client_address: client?.address || s.client_address || '',
                client_type: client?.client_type || '',
                status: s.status,
                cleaners: cleanerNames,
                cleaner_schedules: cleanerSchedules,
                recurrence: s.recurrence_rule || 'none',
                notes_public: s.notes_public || '',
                xero_invoiced: s.xero_invoiced || false,
            };
        });

        result.sort((a, b) => (a.start || '').localeCompare(b.start || ''));

        // Agrupar por fecha
        const byDate = {};
        result.forEach(s => {
            if (!byDate[s.date]) byDate[s.date] = [];
            byDate[s.date].push(s);
        });

        // Calcular disponibilidad de limpiadores por fecha
        const workdayStartMins = timeToMinutes(workday_start) || 480;
        const workdayEndMins = timeToMinutes(workday_end) || 960;

        const cleanerAvailabilityByDate = {};
        const allDates = Object.keys(byDate);

        // También incluir fechas del rango aunque no tengan servicios
        const start = new Date(date_from);
        const end = new Date(date_to);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().slice(0, 10);
            if (!allDates.includes(dateStr)) allDates.push(dateStr);
        }

        for (const dateStr of allDates) {
            const servicesForDay = byDate[dateStr] || [];
            cleanerAvailabilityByDate[dateStr] = activecleaners.map(cleaner =>
                calculateCleanerAvailability(
                    cleaner.full_name,
                    cleaner.id,
                    servicesForDay,
                    workdayStartMins,
                    workdayEndMins
                )
            );
        }

        const summary = {
            timezone: TIMEZONE,
            now_melbourne: getMelbourneNow(),
            today_melbourne: todayMelbourne,
            date_range: { from: date_from, to: date_to },
            workday: { start: workday_start, end: workday_end },
            total_services: result.length,
            by_date: byDate,
            cleaner_availability: cleanerAvailabilityByDate,
            stats: {
                total_hours: result.reduce((sum, s) => sum + s.duration_hours, 0).toFixed(2),
                by_status: result.reduce((acc, s) => {
                    acc[s.status] = (acc[s.status] || 0) + 1;
                    return acc;
                }, {}),
                by_client: result.reduce((acc, s) => {
                    if (!acc[s.client_name]) acc[s.client_name] = { count: 0, hours: 0 };
                    acc[s.client_name].count++;
                    acc[s.client_name].hours += s.duration_hours;
                    return acc;
                }, {}),
                cleaners_workload: result.reduce((acc, s) => {
                    s.cleaners.forEach(name => {
                        if (!acc[name]) acc[name] = { services: 0, hours: 0 };
                        acc[name].services++;
                        const cs = s.cleaner_schedules.find(c => c.cleaner === name);
                        acc[name].hours += cs ? cs.hours : s.duration_hours;
                    });
                    return acc;
                }, {}),
            }
        };

        return Response.json(summary);
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});