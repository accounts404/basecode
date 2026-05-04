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

// Genera rango para filtrar: usamos strings sin Z para capturar tanto
// fechas guardadas como hora local como fechas en UTC
function dateRangeToUTC(dateFrom, dateTo) {
    // Usamos los primeros 10 chars del string como la app — sin conversión UTC.
    // El filtro server-side busca por start_time >= dateFrom y <= dateTo+"T23:59:59"
    const startUTC = dateFrom + 'T00:00:00.000';
    const endUTC = dateTo + 'T23:59:59.999';
    return { startUTC, endUTC };
}

// Extrae fecha del start_time usando siempre los primeros 10 chars del string,
// igual que hace la app en el calendario (sin conversión UTC).
function getLocalDate(isoString) {
    if (!isoString) return null;
    return isoString.slice(0, 10);
}

// Extrae hora local de un ISO string
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

// Calcula duración en horas entre dos ISO strings
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

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        let { date_from, date_to } = body;

        const todayMelbourne = getMelbourneDateToday();
        if (!date_from) date_from = todayMelbourne;
        if (!date_to) date_to = todayMelbourne;

        // Cargar TODOS los datos en paralelo usando filter server-side
        // Filtramos por start_time >= inicio del día y <= fin del día
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

        // Filtrar por los primeros 10 chars del start_time (igual que la app en calendario)
        const filtered = (schedules || []).filter(s => {
            if (!s.start_time) return false;
            const calendarDate = s.start_time.slice(0, 10);
            return calendarDate >= date_from && calendarDate <= date_to;
        });

        // Transformar
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

        // Ordenar por hora
        result.sort((a, b) => (a.start || '').localeCompare(b.start || ''));

        // Agrupar por fecha
        const byDate = {};
        result.forEach(s => {
            if (!byDate[s.date]) byDate[s.date] = [];
            byDate[s.date].push(s);
        });

        const summary = {
            timezone: TIMEZONE,
            now_melbourne: getMelbourneNow(),
            today_melbourne: todayMelbourne,
            date_range: { from: date_from, to: date_to },
            total_services: result.length,
            by_date: byDate,
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