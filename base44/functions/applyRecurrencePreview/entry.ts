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

        const { previewId } = await req.json();
        if (!previewId) {
            return Response.json({ success: false, error: 'Se requiere previewId' }, { status: 400 });
        }

        const preview = await base44.asServiceRole.entities.RecurrencePreview.get(previewId);
        if (!preview) {
            return Response.json({ success: false, error: 'Vista previa no encontrada' }, { status: 404 });
        }
        if (preview.status !== 'pending') {
            return Response.json({ success: false, error: `La vista previa no está pendiente (estado: ${preview.status})` }, { status: 400 });
        }

        console.log(`[applyRecurrencePreview] Aplicando vista previa ${previewId} (${preview.preview_items?.length} series).`);

        // Mark as approved immediately to prevent double execution
        await base44.asServiceRole.entities.RecurrencePreview.update(preview.id, {
            status: 'approved',
            approved_by: user.id,
            approved_at: new Date().toISOString(),
        });

        // Load fresh data for execution (clients/users for active checks)
        const allClients = await loadAll(base44, 'Client', '-created_date', 500);
        const clientsById = new Map(allClients.map((c) => [c.id, c]));
        const allUsers = await loadAll(base44, 'User', '-created_date', 500);
        const activeUserIds = new Set(
            allUsers.filter((u) => u.role !== 'admin' && u.active !== false).map((u) => u.id)
        );

        const today = new Date();
        const targetDate = addMonths(today, 6);

        let createdCount = 0;
        const errors = [];
        const buffer = [];

        const flushBuffer = async () => {
            if (buffer.length === 0) return;
            try {
                const created = await base44.asServiceRole.entities.Schedule.bulkCreate(buffer.splice(0, buffer.length));
                createdCount += (created || []).length;
            } catch (e) {
                errors.push({ error: e.message });
            }
            await sleep(CREATION_SLEEP_MS);
        };

        for (const item of preview.preview_items) {
            try {
                // Re-fetch the series' last service to build from fresh data
                const seriesSchedules = await base44.asServiceRole.entities.Schedule.filter({ recurrence_id: item.recurrence_id });
                if (!seriesSchedules || seriesSchedules.length === 0) {
                    errors.push({ recurrence_id: item.recurrence_id, error: 'serie no encontrada' });
                    continue;
                }
                const lastService = seriesSchedules.reduce(
                    (max, x) => (!max || new Date(x.start_time) > new Date(max.start_time) ? x : max),
                    null
                );
                if (!lastService) continue;

                // Re-validate active cleaners and client at execution time
                const cleanerIds = lastService.cleaner_ids || [];
                const activeCleaners = cleanerIds.filter((id) => activeUserIds.has(id));
                if (activeCleaners.length === 0) {
                    console.log(`[applyRecurrencePreview] Serie ${item.recurrence_id}: limpiadores inactivos, saltando.`);
                    continue;
                }
                const clientFresh = clientsById.get(lastService.client_id);
                if (!clientFresh || clientFresh.active === false) {
                    console.log(`[applyRecurrencePreview] Serie ${item.recurrence_id}: cliente inactivo, saltando.`);
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

                    if (buffer.length >= CREATION_BATCH) {
                        await flushBuffer();
                    }
                }
            } catch (err) {
                errors.push({ recurrence_id: item.recurrence_id, error: err.message });
            }
        }
        await flushBuffer();

        await base44.asServiceRole.entities.RecurrencePreview.update(preview.id, {
            execution_result: { created_count: createdCount, errors },
        });

        console.log(`[applyRecurrencePreview] ✅ Creados: ${createdCount}. Errores: ${errors.length}.`);
        return Response.json({
            success: true,
            message: `Recurrencias aplicadas. ${createdCount} servicios creados.`,
            created_count: createdCount,
            errors,
        });
    } catch (error) {
        console.error('[applyRecurrencePreview] Error:', error);
        return Response.json({ success: false, error: error.message || 'Error desconocido' }, { status: 500 });
    }
}