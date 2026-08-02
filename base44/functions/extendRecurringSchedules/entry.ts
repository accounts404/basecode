import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { addWeeks, addMonths, addDays } from 'npm:date-fns@3.6.0';

// ===============================================================
// CRON DE EXTENSIÓN DE RECURRENCIAS – VERSIÓN PARCHADA
// Parches aplicados:
//   B  Deduplicación por (client_id, recurrence_rule) -> canónica
//   C  Filtro de clientes y limpiadores inactivos
//   D  Descarte de series abandonadas (> 60 días sin actividad)
//   E  Reset de campos contaminantes (notas, fotos, structured)
//   F  bulkCreate en lotes de 50 + sleep(200ms) -> evita 429
//   G  Lock anti-doble ejecución vía SystemSetting
// ===============================================================

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LOCK_NAME = 'cron_extend_lock';
const LOCK_TTL_MS = 60 * 60 * 1000;       // 60 min: si otra ejecución lleva <1h, aborta
const ABANDONED_DAYS = 60;                // series sin actividad >60d -> skip
const CREATION_BATCH = 50;                // bulkCreate lote
const CREATION_SLEEP_MS = 200;            // throttle entre lotes
const UPDATE_BATCH = 50;
const UPDATE_SLEEP_MS = 200;

// ---------- Lock anti-doble ejecución (Parche G) ----------
// Retorna { abort, lockId }:
//   - abort=true  -> otra ejecución en curso; el caller debe abortar.
//   - abort=false -> continuar (lockId puede ser null si no se pudo adquirir por error).
async function acquireLock(base44, log) {
    try {
        const existing = await base44.asServiceRole.entities.SystemSetting.filter({ setting_name: LOCK_NAME });
        if (existing && existing.length > 0) {
            const lock = existing[0];
            const ts = Number(lock.terms_and_conditions || 0);
            const age = Date.now() - ts;
            if (age < LOCK_TTL_MS) {
                log(`🔒 Lock activo (edad ${Math.round(age / 1000)}s). Abortando para evitar doble ejecución.`);
                return { abort: true, lockId: null };
            }
            // lock expirado: tomar posesión
            await base44.asServiceRole.entities.SystemSetting.update(lock.id, {
                terms_and_conditions: String(Date.now()),
            });
            return { abort: false, lockId: lock.id };
        }
        const created = await base44.asServiceRole.entities.SystemSetting.create({
            setting_name: LOCK_NAME,
            terms_and_conditions: String(Date.now()),
        });
        return { abort: false, lockId: created.id };
    } catch (e) {
        log(`⚠️ No se pudo adquirir lock (continuando sin lock): ${e.message}`);
        return { abort: false, lockId: null };
    }
}

async function releaseLock(base44, lockId, log) {
    if (!lockId) return;
    try {
        await base44.asServiceRole.entities.SystemSetting.delete(lockId);
    } catch (e) {
        log(`⚠️ No se pudo liberar lock ${lockId}: ${e.message}`);
    }
}

// ---------- Carga paginada completa ----------
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

// ---------- Extension de una serie canónica ----------
async function extendCanonicalSeries(
    base44,
    recurrenceId,
    lastService,
    cachedDays,
    today,
    targetDate,
    abandonedThreshold,
    activeUserIds,
    clientFresh,
    log
) {
    const lastDate = new Date(lastService.start_time);

    if (lastDate >= targetDate) return { status: 'already_ok' };

    if (lastDate < abandonedThreshold) {
        return { status: 'skipped_abandoned', info: lastService.start_time.slice(0, 10) };
    }

    const cleanerIds = lastService.cleaner_ids || [];
    const activeCleaners = cleanerIds.filter((id) => activeUserIds.has(id));
    if (activeCleaners.length === 0) {
        return { status: 'skipped_inactive', info: cleanerIds.join(',') };
    }

    // occupiedDays frescos desde BD (protege contra doble ejecución de otra instancia)
    let fresherDays;
    try {
        const existing = await base44.asServiceRole.entities.Schedule.filter({ recurrence_id: recurrenceId });
        fresherDays = new Set((existing || []).map((x) => (x.start_time || '').slice(0, 10)));
    } catch (e) {
        fresherDays = new Set(cachedDays);
    }
    for (const d of cachedDays) fresherDays.add(d);

    const baseDefaultNotes = clientFresh?.default_service_notes || '';
    const baseStructuredNotes = clientFresh?.structured_service_notes || {};

    let currentStart = new Date(lastService.start_time);
    let currentEnd = new Date(lastService.end_time);
    const buffer = [];
    let createdCount = 0;
    let errors = [];
    let safety = 200;

    const flushBuffer = async () => {
        if (buffer.length === 0) return;
        try {
            const created = await base44.asServiceRole.entities.Schedule.bulkCreate(buffer.splice(0, buffer.length));
            createdCount += (created || []).length;
        } catch (e) {
            errors.push({ recurrence_id: recurrenceId, error: e.message });
        }
        await sleep(CREATION_SLEEP_MS);
    };

    while (currentStart < targetDate && safety-- > 0) {
        const nextStart = advanceByRule(currentStart, lastService.recurrence_rule);
        const nextEnd = advanceByRule(currentEnd, lastService.recurrence_rule);
        if (!nextStart || !nextEnd) break;
        currentStart = nextStart;
        currentEnd = nextEnd;

        if (nextStart <= today) continue; // nunca crear en pasado

        const dayISO = formatLocalISO(nextStart).slice(0, 10);
        if (fresherDays.has(dayISO)) continue;

        // Reconstruir cleaner_schedules relativo al nuevo start
        const origBaseStart = new Date(lastService.start_time);
        const cleanerSchedules = (lastService.cleaner_schedules || [])
            .filter((cs) => activeCleaners.includes(cs.cleaner_id))
            .map((cs) => {
                const offsetStart = new Date(cs.start_time) - origBaseStart;
                const offsetEnd = new Date(cs.end_time) - origBaseStart;
                return {
                    cleaner_id: cs.cleaner_id,
                    start_time: formatLocalISO(new Date(nextStart.getTime() + offsetStart)),
                    end_time: formatLocalISO(new Date(nextStart.getTime() + offsetEnd)),
                    is_leader_bonus: cs.is_leader_bonus || false,
                };
            });

        const newService = {
            ...lastService,
            start_time: formatLocalISO(nextStart),
            end_time: formatLocalISO(nextEnd),
            status: 'scheduled',
            clock_in_data: [],
            reconciliation_items: [],
            xero_invoiced: false,
            on_my_way_sent_at: null,
            reminder_sent_at: null,
            billed_at: null,
            billed_price_snapshot: null,
            billed_gst_type_snapshot: null,
            billed_payment_method_snapshot: null,
            // Reset de campos contaminantes (Parche E)
            notes_public: baseDefaultNotes,
            service_specific_notes: '',
            notes_private: '',
            photo_urls: [],
            structured_service_notes: baseStructuredNotes,
            cleaner_ids: activeCleaners,
            cleaner_schedules: cleanerSchedules,
        };
        delete newService.id;
        delete newService.created_date;
        delete newService.updated_date;
        delete newService.created_by;

        buffer.push(newService);
        fresherDays.add(dayISO);

        if (buffer.length >= CREATION_BATCH) {
            await flushBuffer();
        }
    }
    await flushBuffer();

    return { status: createdCount > 0 ? 'extended' : 'already_ok', created: createdCount, errors };
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const log = (message) => console.log(`[extendRecurringSchedules] ${message}`);

    let lockId = null;
    try {
        // -------- Lock (Parche G) --------
        const lockResult = await acquireLock(base44, log);
        if (lockResult.abort) {
            return Response.json({ success: false, aborted: true, reason: 'lock_active' }, { status: 409 });
        }
        lockId = lockResult.lockId;
        log('🔄 Lock adquirido. Iniciando revisión mensual (6 meses de horizonte)...');

        const today = new Date();
        const targetDate = addMonths(today, 6);
        const abandonedThreshold = addDays(today, -ABANDONED_DAYS);
        log(`📅 Horizonte objetivo: ${targetDate.toISOString().slice(0, 10)}`);
        log(`📅 Umbral series abandonadas (sin actividad desde): ${abandonedThreshold.toISOString().slice(0, 10)}`);

        // -------- 1. Clientes + Usuarios --------
        const allClients = await loadAll(base44, 'Client', '-created_date', 500);
        const activeClientIds = new Set(allClients.filter((c) => c.active !== false).map((c) => c.id));
        const clientsById = new Map(allClients.map((c) => [c.id, c]));
        log(`👥 Clientes activos: ${activeClientIds.size}/${allClients.length}`);

        const allUsers = await loadAll(base44, 'User', '-created_date', 500);
        const activeUserIds = new Set(
            allUsers.filter((u) => u.role !== 'admin' && u.active !== false).map((u) => u.id)
        );
        log(`👥 Limpiadores activos: ${activeUserIds.size}/${allUsers.length}`);

        // -------- 2. Schedules --------
        const allSchedules = await loadAll(base44, 'Schedule', '-start_time', 5000);
        log(`📋 Total schedules cargados: ${allSchedules.length}`);

        const recurringSchedules = allSchedules.filter(
            (s) =>
                s.recurrence_id &&
                s.recurrence_rule &&
                s.recurrence_rule !== 'none' &&
                s.status !== 'cancelled' &&
                activeClientIds.has(s.client_id)
        );

        if (recurringSchedules.length === 0) {
            await releaseLock(base44, lockId, log);
            return Response.json({ success: true, message: 'No recurring schedules found.', extended_series_count: 0 });
        }

        // -------- 3. Agrupar por (client_id, recurrence_rule) y elegir canónica (Parche B) --------
        const groupsMap = new Map();
        for (const s of recurringSchedules) {
            const key = `${s.client_id}|${s.recurrence_rule}`;
            if (!groupsMap.has(key)) groupsMap.set(key, []);
            groupsMap.get(key).push(s);
        }

        const canonicalSeries = [];
        const duplicatedToCancel = [];
        for (const [, sers] of groupsMap.entries()) {
            const byRid = new Map();
            for (const s of sers) {
                if (!byRid.has(s.recurrence_id)) byRid.set(s.recurrence_id, []);
                byRid.get(s.recurrence_id).push(s);
            }
            const stats = [...byRid.entries()].map(([rid, items]) => ({
                rid,
                items,
                futureCount: items.filter((x) => new Date(x.start_time) >= today).length,
                last: items.reduce(
                    (max, x) => (!max || new Date(x.start_time) > new Date(max.start_time) ? x : max),
                    null
                ),
            }));
            stats.sort((a, b) => b.futureCount - a.futureCount);

            canonicalSeries.push({
                recurrence_id: stats[0].rid,
                last: stats[0].last,
                allDays: new Set(stats[0].items.map((x) => (x.start_time || '').slice(0, 10))),
            });

            for (let i = 1; i < stats.length; i++) {
                for (const item of stats[i].items) {
                    if (item.status !== 'cancelled') duplicatedToCancel.push(item);
                }
            }
        }
        log(`📊 Series únicas canónicas: ${canonicalSeries.length}. Servicios duplicados a cancelar: ${duplicatedToCancel.length}`);

        // -------- Cancelar servicios de series duplicadas --------
        if (duplicatedToCancel.length > 0) {
            for (let i = 0; i < duplicatedToCancel.length; i += UPDATE_BATCH) {
                const chunk = duplicatedToCancel.slice(i, i + UPDATE_BATCH);
                try {
                    await base44.asServiceRole.entities.Schedule.bulkUpdate(
                        chunk.map((s) => ({ id: s.id, status: 'cancelled' }))
                    );
                } catch (e) {
                    log(`⚠️ Error cancelando duplicados (lote ${i}): ${e.message}`);
                }
                await sleep(UPDATE_SLEEP_MS);
            }
            log(`✅ ${duplicatedToCancel.length} servicios duplicados marcados como 'cancelled'`);
        }

        // -------- 4. Extender series canónicas (Parches C, D, E, F) --------
        const results = {
            extended_series_count: 0,
            already_ok_series: 0,
            skipped_abandoned: 0,
            skipped_inactive: 0,
            duplicated_cancelled: duplicatedToCancel.length,
            total_services_created: 0,
            errors: [],
        };

        for (const { recurrence_id, last: lastService, allDays } of canonicalSeries) {
            const clientFresh = clientsById.get(lastService.client_id);
            try {
                const res = await extendCanonicalSeries(
                    base44,
                    recurrence_id,
                    lastService,
                    allDays,
                    today,
                    targetDate,
                    abandonedThreshold,
                    activeUserIds,
                    clientFresh,
                    log
                );
                if (res.status === 'extended') {
                    results.extended_series_count++;
                    results.total_services_created += res.created || 0;
                } else if (res.status === 'already_ok') {
                    results.already_ok_series++;
                } else if (res.status === 'skipped_abandoned') {
                    results.skipped_abandoned++;
                    log(`⏭️ Serie ${recurrence_id} (${lastService.client_name}) abandonada (última: ${res.info})`);
                } else if (res.status === 'skipped_inactive') {
                    results.skipped_inactive++;
                    log(`⏭️ Serie ${recurrence_id} (${lastService.client_name}): todos los limpiadores inactivos`);
                }
                if (res.errors && res.errors.length > 0) results.errors.push(...res.errors);
            } catch (error) {
                log(`❌ Error extendiendo serie ${recurrence_id}: ${error.message}`);
                results.errors.push({ recurrence_id, error: error.message });
            }
        }

        log(`✅ Completado. Extendidas: ${results.extended_series_count}. Creados: ${results.total_services_created}. Abandonadas: ${results.skipped_abandoned}. Inactivas: ${results.skipped_inactive}. Duplicados cancelados: ${results.duplicated_cancelled}`);

        return Response.json({
            success: true,
            ...results,
            horizon_date: targetDate.toISOString().slice(0, 10),
            message: `Revisión completada: ${results.extended_series_count} series extendidas, ${results.total_services_created} servicios creados, ${results.skipped_abandoned} abandonadas, ${results.skipped_inactive} inactivas, ${results.duplicated_cancelled} duplicados cancelados.`,
        });
    } catch (error) {
        log(`❌ Error fatal: ${error.message}`);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    } finally {
        if (lockId) await releaseLock(base44, lockId, log);
    }
});