import { addWeeks, addMonths, addDays } from 'npm:date-fns@3.6.0';

const formatLocalISO = (d) => {
    const y = d.getUTCFullYear(), mo = String(d.getUTCMonth() + 1).padStart(2, '0'), dy = String(d.getUTCDate()).padStart(2, '0');
    const h = String(d.getUTCHours()).padStart(2, '0'), mi = String(d.getUTCMinutes()).padStart(2, '0');
    return `${y}-${mo}-${dy}T${h}:${mi}:00.000`;
};

const advanceByRule = (date, rule) => {
    switch (rule) {
        case 'weekly':        return addWeeks(date, 1);
        case 'fortnightly':   return addWeeks(date, 2);
        case 'every_3_weeks': return addWeeks(date, 3);
        case 'every_4_weeks': return addWeeks(date, 4);
        case 'monthly':       return addMonths(date, 1);
        default:              return null;
    }
};

const ABANDONED_DAYS = 60;

async function loadAll(base44, entityName, sortField, batchSize) {
    const acc = [];
    let skip = 0;
    let safety = 1000;
    while (safety-- > 0) {
        const batch = await base44.asServiceRole.entities[entityName].list(sortField, batchSize, skip);
        if (!batch || batch.length === 0) break;
        acc.push(...batch);
        if (batch.length < batchSize) break;
        skip += batchSize;
    }
    return acc;
}

// Paginated filtered load — reduces read volume by querying only matching records.
async function loadAllFiltered(base44, entityName, query, sortField, batchSize) {
    const acc = [];
    let skip = 0;
    let safety = 1000;
    while (safety-- > 0) {
        const batch = await base44.asServiceRole.entities[entityName].filter(query, sortField, batchSize, skip);
        if (!batch || batch.length === 0) break;
        acc.push(...batch);
        if (batch.length < batchSize) break;
        skip += batchSize;
    }
    return acc;
}

// Compute the preview of services that WOULD be created for each active recurring series.
// Read-only: no writes. Returns { preview_items, summary }.
export async function computePreview(base44, log) {
    const today = new Date();
    const targetDate = addMonths(today, 6);
    const abandonedThreshold = addDays(today, -ABANDONED_DAYS);

    const allClients = await loadAll(base44, 'Client', '-created_date', 500);
    const activeClientIds = new Set(allClients.filter((c) => c.active !== false).map((c) => c.id));
    const clientsById = new Map(allClients.map((c) => [c.id, c]));
    const allUsers = await loadAll(base44, 'User', '-created_date', 500);
    const activeUserIds = new Set(
        allUsers.filter((u) => u.role !== 'admin' && u.active !== false).map((u) => u.id)
    );
    // OPTIMIZACIÓN: cargar solo servicios NO cancelados desde hace 90 días.
    // Las series cuyo último servicio es >90 días sin servicios futuros son "abandonadas"
    // (umbral 60 días) y se descartan de todos modos, así que no necesitamos sus datos.
    const sinceDate = formatLocalISO(addDays(today, -90));
    const recentSchedules = await loadAllFiltered(
        base44,
        'Schedule',
        { start_time: { $gte: sinceDate }, status: { $ne: 'cancelled' } },
        '-start_time',
        500
    );

    const recurringSchedules = recentSchedules.filter(
        (s) =>
            s.recurrence_id &&
            s.recurrence_rule &&
            s.recurrence_rule !== 'none' &&
            activeClientIds.has(s.client_id)
    );

    // Group by recurrence_id (NO deduplication/cancellation). Each series is independent.
    const byRid = new Map();
    for (const s of recurringSchedules) {
        if (!byRid.has(s.recurrence_id)) byRid.set(s.recurrence_id, []);
        byRid.get(s.recurrence_id).push(s);
    }

    const preview_items = [];
    let skipped_abandoned = 0;
    let skipped_inactive = 0;
    let already_ok = 0;
    let total_new_services = 0;

    for (const [recurrenceId, items] of byRid.entries()) {
        // "last" = the most recent scheduled future service (the one to extend from)
        const lastService = items.reduce(
            (max, x) => (!max || new Date(x.start_time) > new Date(max.start_time) ? x : max),
            null
        );
        const lastDate = new Date(lastService.start_time);

        if (lastDate >= targetDate) { already_ok++; continue; }
        if (lastDate < abandonedThreshold) { skipped_abandoned++; continue; }

        const cleanerIds = lastService.cleaner_ids || [];
        const activeCleaners = cleanerIds.filter((id) => activeUserIds.has(id));
        if (activeCleaners.length === 0) { skipped_inactive++; continue; }

        const occupiedDays = new Set(items.map((x) => (x.start_time || '').slice(0, 10)));
        const newDates = [];
        let currentStart = new Date(lastService.start_time);
        let currentEnd = new Date(lastService.end_time);
        let safety = 200;

        while (currentStart < targetDate && safety-- > 0) {
            const nextStart = advanceByRule(currentStart, lastService.recurrence_rule);
            const nextEnd = advanceByRule(currentEnd, lastService.recurrence_rule);
            if (!nextStart || !nextEnd) break;
            currentStart = nextStart;
            currentEnd = nextEnd;
            if (nextStart <= today) continue;
            const dayISO = formatLocalISO(nextStart).slice(0, 10);
            if (occupiedDays.has(dayISO)) continue;
            newDates.push(dayISO);
        }

        if (newDates.length === 0) { already_ok++; continue; }

        preview_items.push({
            client_id: lastService.client_id,
            client_name: lastService.client_name || clientsById.get(lastService.client_id)?.name || '—',
            recurrence_id: recurrenceId,
            recurrence_rule: lastService.recurrence_rule,
            last_service_date: lastService.start_time.slice(0, 10),
            new_dates: newDates,
            count: newDates.length,
            cleaner_ids: activeCleaners,
        });
        total_new_services += newDates.length;
    }

    const summary = {
        total_series_to_extend: preview_items.length,
        total_new_services,
        skipped_abandoned,
        skipped_inactive,
        already_ok,
    };
    log(`📊 Vista previa: ${preview_items.length} series a extender, ${total_new_services} servicios nuevos, ${already_ok} ya OK, ${skipped_abandoned} abandonadas, ${skipped_inactive} inactivas.`);
    return { preview_items, summary };
}

export { formatLocalISO, advanceByRule, loadAll };