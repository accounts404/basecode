import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TIMEZONE = 'Australia/Melbourne';

function toMelbourneTime(isoString) {
    if (!isoString) return null;
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-AU', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
}

function toMelbourneDateOnly(isoString) {
    if (!isoString) return null;
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date); // YYYY-MM-DD
}

function getMelbourneNow() {
    return new Date().toLocaleString('en-AU', { timeZone: TIMEZONE });
}

function parseMelbourneDate(dateStr) {
    // dateStr: YYYY-MM-DD en Melbourne time → ISO UTC
    const [y, m, d] = dateStr.split('-').map(Number);
    // Usamos medianoche en Melbourne
    const melbourneStr = `${dateStr}T00:00:00`;
    const asUTC = new Date(new Date(melbourneStr).toLocaleString('en-US', { timeZone: 'UTC' }));
    // Calcular offset Melbourne
    const localMidnight = new Date(new Date(`${dateStr}T00:00:00`).toLocaleString('en-US', { timeZone: TIMEZONE }));
    const offsetMs = new Date(`${dateStr}T00:00:00`) - localMidnight;
    return new Date(new Date(`${dateStr}T00:00:00`).getTime() + offsetMs);
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { date_from, date_to } = body;
        // date_from y date_to: YYYY-MM-DD en Melbourne time

        // Cargar datos en paralelo
        const [schedules, clients, users] = await Promise.all([
            base44.asServiceRole.entities.Schedule.list('-start_time', 2000),
            base44.asServiceRole.entities.Client.list('-created_date', 2000),
            base44.asServiceRole.entities.User.list('-created_date', 500),
        ]);

        const clientMap = new Map((clients || []).map(c => [c.id, c]));
        const userMap = new Map((users || []).map(u => [u.id, u]));

        // Filtrar por rango de fechas Melbourne
        const filtered = (schedules || []).filter(s => {
            const schedDate = toMelbourneDateOnly(s.start_time);
            if (!schedDate) return false;
            if (date_from && schedDate < date_from) return false;
            if (date_to && schedDate > date_to) return false;
            return true;
        });

        // Transformar con datos legibles
        const result = filtered.map(s => {
            const client = clientMap.get(s.client_id);
            const startMelbourne = toMelbourneTime(s.start_time);
            const endMelbourne = toMelbourneTime(s.end_time);
            const dateMelbourne = toMelbourneDateOnly(s.start_time);

            // Calcular duración total en horas
            const durationMs = new Date(s.end_time) - new Date(s.start_time);
            const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(2);

            // Cleaners asignados con nombre
            const cleanerNames = (s.cleaner_ids || []).map(id => {
                const u = userMap.get(id);
                return u ? u.full_name : id;
            });

            // Horas por cleaner (si hay cleaner_schedules)
            const cleanerSchedules = (s.cleaner_schedules || []).map(cs => {
                const u = userMap.get(cs.cleaner_id);
                const csStart = toMelbourneTime(cs.start_time);
                const csEnd = toMelbourneTime(cs.end_time);
                const csHours = ((new Date(cs.end_time) - new Date(cs.start_time)) / (1000 * 60 * 60)).toFixed(2);
                return {
                    cleaner: u ? u.full_name : cs.cleaner_id,
                    start: csStart,
                    end: csEnd,
                    hours: parseFloat(csHours),
                };
            });

            return {
                id: s.id,
                date: dateMelbourne,
                start: startMelbourne,
                end: endMelbourne,
                duration_hours: parseFloat(durationHours),
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

        // Resumen general
        const byDate = {};
        result.forEach(s => {
            if (!byDate[s.date]) byDate[s.date] = [];
            byDate[s.date].push(s);
        });

        const summary = {
            timezone: TIMEZONE,
            now_melbourne: getMelbourneNow(),
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
                        // Usar cleaner_schedules para horas exactas si existe
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