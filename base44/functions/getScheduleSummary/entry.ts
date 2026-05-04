import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TIMEZONE = 'Australia/Melbourne';

// Los start_time se guardan como "2026-05-05T08:00:00.000" (sin Z, hora local Melbourne)
// Por eso los tratamos directamente como fecha local sin conversión de timezone

function extractDateFromISO(isoString) {
    // Extrae YYYY-MM-DD directamente del string sin conversión de timezone
    if (!isoString) return null;
    return isoString.slice(0, 10);
}

function extractTimeFromISO(isoString) {
    // Extrae HH:MM directamente del string sin conversión de timezone
    if (!isoString) return null;
    return isoString.slice(11, 16);
}

function getMelbourneNow() {
    return new Date().toLocaleString('en-AU', { timeZone: TIMEZONE });
}

function getMelbourneDateToday() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        let { date_from, date_to } = body;

        // Si no se dan fechas, usar hoy en Melbourne
        const todayMelbourne = getMelbourneDateToday();
        if (!date_from) date_from = todayMelbourne;
        if (!date_to) date_to = todayMelbourne;

        // Cargar datos en paralelo
        const [schedules, clients, users] = await Promise.all([
            base44.asServiceRole.entities.Schedule.list('-start_time', 3000),
            base44.asServiceRole.entities.Client.list('-created_date', 2000),
            base44.asServiceRole.entities.User.list('-created_date', 500),
        ]);

        const clientMap = new Map((clients || []).map(c => [c.id, c]));
        // Mapear por id Y por email (algunos cleaner_ids pueden ser emails)
        const userMap = new Map();
        (users || []).forEach(u => {
            if (u.id) userMap.set(u.id, u);
            if (u.email) userMap.set(u.email, u);
        });

        // Filtrar por rango de fechas extrayendo la fecha directamente del ISO string
        // (los start_time se guardan como hora local Melbourne sin Z)
        const filtered = (schedules || []).filter(s => {
            if (!s.start_time) return false;
            const schedDate = extractDateFromISO(s.start_time);
            if (!schedDate) return false;
            if (date_from && schedDate < date_from) return false;
            if (date_to && schedDate > date_to) return false;
            return true;
        });

        // Transformar con datos legibles
        const result = filtered.map(s => {
            const client = clientMap.get(s.client_id);

            // Extraer hora directamente del ISO (hora local Melbourne)
            const startTime = extractTimeFromISO(s.start_time);
            const endTime = extractTimeFromISO(s.end_time);
            const dateMelbourne = extractDateFromISO(s.start_time);

            // Calcular duración en horas
            let durationHours = 0;
            if (s.start_time && s.end_time) {
                const startH = parseInt(s.start_time.slice(11, 13));
                const startM = parseInt(s.start_time.slice(14, 16));
                const endH = parseInt(s.end_time.slice(11, 13));
                const endM = parseInt(s.end_time.slice(14, 16));
                durationHours = ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
                if (durationHours < 0) durationHours += 24;
            }

            // Cleaners asignados con nombre
            const cleanerNames = (s.cleaner_ids || []).map(id => {
                const u = userMap.get(id);
                return u ? u.full_name : id;
            });

            // Horas por cleaner
            const cleanerSchedules = (s.cleaner_schedules || []).map(cs => {
                const u = userMap.get(cs.cleaner_id);
                const csStart = extractTimeFromISO(cs.start_time);
                const csEnd = extractTimeFromISO(cs.end_time);
                let csHours = 0;
                if (cs.start_time && cs.end_time) {
                    const sH = parseInt(cs.start_time.slice(11, 13));
                    const sM = parseInt(cs.start_time.slice(14, 16));
                    const eH = parseInt(cs.end_time.slice(11, 13));
                    const eM = parseInt(cs.end_time.slice(14, 16));
                    csHours = ((eH * 60 + eM) - (sH * 60 + sM)) / 60;
                    if (csHours < 0) csHours += 24;
                }
                return {
                    cleaner: u ? u.full_name : cs.cleaner_id,
                    start: csStart,
                    end: csEnd,
                    hours: parseFloat(csHours.toFixed(2)),
                };
            });

            return {
                id: s.id,
                date: dateMelbourne,
                start: startTime ? `${startTime} hs` : null,
                end: endTime ? `${endTime} hs` : null,
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

        // Agrupar por fecha
        const byDate = {};
        result.forEach(s => {
            if (!byDate[s.date]) byDate[s.date] = [];
            byDate[s.date].push(s);
        });

        // Ordenar servicios dentro de cada fecha por hora
        Object.keys(byDate).forEach(date => {
            byDate[date].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
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