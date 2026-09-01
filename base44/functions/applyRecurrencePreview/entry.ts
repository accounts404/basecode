import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { addMonths, addDays } from 'npm:date-fns@3.6.0';
import { formatLocalISO, advanceByRule, loadAll } from '../../shared/recurrencePreview.ts';

const CREATION_BATCH = 50;
const CREATION_SLEEP_MS = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Reconstructs a new schedule from the series' last service, offset to the new date.
function buildNewService(lastService, nextStart, nextEnd, activeCleaners, clientFresh) {
    const origBaseStart = new Date(lastService.start_time);
    const cleanerSchedules = (lastService.cleaner_schedules || [])
        .filter((cs) => activeCleaners.includes(cs.cleaner_id))
        .map((cs) => {
            const offsetStart = new Date(cs.start_time) - origBaseStart;
            const offsetEnd = new Date(cs.end_time) - origBaseStart;
            return {
                cleaner_id: cs.cleaner_id,
                start_time: formatLocalISO(new Date(nextStart.getTime() + offsetStart)),
                end_time: formatLocalISO(new Date(nextEnd.getTime() + offsetEnd)),
                is_leader_bonus: cs.is_leader_bonus || false,
            };
        });

    const baseDefaultNotes = clientFresh?.default_service_notes || '';
    const baseStructuredNotes = clientFresh?.structured_service_notes || {};

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
    return newService;
}

export default async function(req) {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ success: false, error: 'Unauthorized: Solo administradores' }, { status: 403 });
        }

        const { previewId, recurrenceId, mode } = await req.json();
        if (!previewId) {
            return Response.json({ success: false, error: 'Se requiere previewId' }, { status: 400 });
        }

        const preview = await base44.asServiceRole.entities.RecurrencePreview.get(previewId);
        if (!preview) {
            return Response.json({ success: false, error: 'Vista previa no encontrada' }, { status: 404 });
        }
        // Allow applying while pending or partially approved. Reject expired/failed.
        if (preview.status === 'expired' || preview.status === 'failed') {
            return Response.json({ success: false, error: `La vista previa no está disponible (estado: ${preview.status})` }, { status: 400 });
        }

        const items = Array.isArray(preview.preview_items) ? preview.preview_items : [];

        // SKIP mode: mark a single series as skipped (no services created, won't be extended this cycle).
        if (mode === 'skip') {
            if (!recurrenceId) {
                return Response.json({ success: false, error: 'Se requiere recurrenceId para omitir' }, { status: 400 });
            }
            const now = new Date().toISOString();
            const updatedItems = items.map((it) =>
                it.recurrence_id === recurrenceId ? { ...it, item_status: 'skipped', applied_at: now } : it
            );
            const allDone = updatedItems.every((it) => ['applied', 'skipped'].includes(it.item_status || 'pending'));
            await base44.asServiceRole.entities.RecurrencePreview.update(preview.id, {
                preview_items: updatedItems,
                ...(allDone ? { status: 'approved', approved_by: user.id, approved_at: now } : {}),
            });
            return Response.json({ success: true, message: 'Serie omitida. No se crearán servicios para esta serie.', skipped: recurrenceId });
        }

        // APPLY mode: only process items still pending (skip 'applied' and 'skipped').
        const targetItems = recurrenceId
            ? items.filter((it) => it.recurrence_id === recurrenceId && (it.item_status || 'pending') === 'pending')
            : items.filter((it) => (it.item_status || 'pending') === 'pending');

        if (targetItems.length === 0) {
            return Response.json({ success: false, error: 'No hay series pendientes para aplicar con ese criterio.' }, { status: 400 });
        }

        console.log(`[applyRecurrencePreview] Aplicando ${targetItems.length} serie(s) de vista previa ${previewId}${recurrenceId ? ` (recurrence_id=${recurrenceId})` : ''}.`);

        // Load fresh data for execution (clients/users for active checks)
        const allClients = await loadAll(base44, 'Client', '-created_date', 500);
        const clientsById = new Map(allClients.map((c) => [c.id, c]));
        const allUsers = await loadAll(base44, 'User', '-created_date', 500);
        const activeUserIds = new Set(
            allUsers.filter((u) => u.role !== 'admin' && u.active !== false).map((u) => u.id)
        );

        const today = new Date();
        const targetDate = addMonths(today, 6);

        const perItemResults = {}; // recurrence_id -> { created, errors }
        let totalCreated = 0;
        const allErrors = [];
        const buffer = [];

        const flushBuffer = async () => {
            if (buffer.length === 0) return;
            try {
                const created = await base44.asServiceRole.entities.Schedule.bulkCreate(buffer.splice(0, buffer.length));
                totalCreated += (created || []).length;
            } catch (e) {
                allErrors.push({ error: e.message });
            }
            await sleep(CREATION_SLEEP_MS);
        };

        for (const item of targetItems) {
            const itemResult = { created: 0, errors: [] };
            try {
                const seriesSchedules = await base44.asServiceRole.entities.Schedule.filter({ recurrence_id: item.recurrence_id });
                if (!seriesSchedules || seriesSchedules.length === 0) {
                    itemResult.errors.push('serie no encontrada');
                    perItemResults[item.recurrence_id] = itemResult;
                    continue;
                }
                const lastService = seriesSchedules.reduce(
                    (max, x) => (!max || new Date(x.start_time) > new Date(max.start_time) ? x : max),
                    null
                );
                if (!lastService) {
                    perItemResults[item.recurrence_id] = itemResult;
                    continue;
                }

                const cleanerIds = lastService.cleaner_ids || [];
                const activeCleaners = cleanerIds.filter((id) => activeUserIds.has(id));
                if (activeCleaners.length === 0) {
                    console.log(`[applyRecurrencePreview] Serie ${item.recurrence_id}: limpiadores inactivos, saltando.`);
                    perItemResults[item.recurrence_id] = itemResult;
                    continue;
                }
                const clientFresh = clientsById.get(lastService.client_id);
                if (!clientFresh || clientFresh.active === false) {
                    console.log(`[applyRecurrencePreview] Serie ${item.recurrence_id}: cliente inactivo, saltando.`);
                    perItemResults[item.recurrence_id] = itemResult;
                    continue;
                }

                const occupiedDays = new Set(seriesSchedules.map((x) => (x.start_time || '').slice(0, 10)));
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

                    buffer.push(buildNewService(lastService, nextStart, nextEnd, activeCleaners, clientFresh));
                    occupiedDays.add(dayISO);
                    itemResult.created += 1;

                    if (buffer.length >= CREATION_BATCH) {
                        await flushBuffer();
                    }
                }
            } catch (err) {
                itemResult.errors.push(err.message);
                allErrors.push({ recurrence_id: item.recurrence_id, error: err.message });
            }
            perItemResults[item.recurrence_id] = itemResult;
        }
        await flushBuffer();

        // Update items: mark applied ones with count + timestamp.
        const now = new Date().toISOString();
        const updatedItems = items.map((it) => {
            const r = perItemResults[it.recurrence_id];
            if (!r) return it;
            return {
                ...it,
                item_status: 'applied',
                applied_at: now,
                applied_count: r.created,
            };
        });
        const allApplied = updatedItems.every((it) => ['applied', 'skipped'].includes(it.item_status || 'pending'));
        const updatePatch = {
            preview_items: updatedItems,
            execution_result: {
                created_count: totalCreated,
                errors: allErrors,
            },
        };
        if (allApplied) {
            updatePatch.status = 'approved';
            updatePatch.approved_by = user.id;
            updatePatch.approved_at = now;
        } else if (preview.status === 'pending') {
            // Keep pending until at least the first apply happens; once partial, leave pending.
        }
        await base44.asServiceRole.entities.RecurrencePreview.update(preview.id, updatePatch);

        const appliedNow = targetItems.map((it) => perItemResults[it.recurrence_id]).filter(Boolean);
        const createdNow = appliedNow.reduce((a, r) => a + (r.created || 0), 0);
        console.log(`[applyRecurrencePreview] ✅ Creados ahora: ${createdNow}. Errores: ${allErrors.length}.`);
        return Response.json({
            success: true,
            message: recurrenceId
                ? `Serie aprobada. ${createdNow} servicios creados.`
                : `Recurrencias aplicadas. ${createdNow} servicios creados.`,
            created_count: createdNow,
            errors: allErrors,
            all_applied: allApplied,
        });
    } catch (error) {
        console.error('[applyRecurrencePreview] Error:', error);
        return Response.json({ success: false, error: error.message || 'Error desconocido' }, { status: 500 });
    }
}