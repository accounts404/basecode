import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Restores schedules wrongly cancelled by the dedup bug: those with status='cancelled'
// that were actually worked (clock_in_data non-empty) or billed (billed_at / xero_invoiced).
// Reverts them to 'completed' and records an audit log.
export default async function(req) {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ success: false, error: 'Unauthorized: Solo administradores' }, { status: 403 });
        }

        const { dryRun } = await req.json().catch(() => ({ dryRun: false }));
        console.log(`[restoreWronglyCancelledSchedules] dryRun=${!!dryRun}`);

        // Load all cancelled schedules (paginate)
        const BATCH = 500;
        let skip = 0;
        let allCancelled = [];
        let safety = 100;
        while (safety-- > 0) {
            const batch = await base44.asServiceRole.entities.Schedule.filter({ status: 'cancelled' }, '-created_date', BATCH, skip);
            if (!batch || batch.length === 0) break;
            allCancelled.push(...batch);
            if (batch.length < BATCH) break;
            skip += BATCH;
        }
        console.log(`[restoreWronglyCancelledSchedules] Cancelados totales cargados: ${allCancelled.length}`);

        // Identify wrongly cancelled: had clock-in/out OR were billed
        const wronglyCancelled = allCancelled.filter((s) => {
            const hasClockIn = Array.isArray(s.clock_in_data) && s.clock_in_data.some((c) => c.clock_in_time);
            const billed = !!s.billed_at || s.xero_invoiced === true;
            return hasClockIn || billed;
        });

        console.log(`[restoreWronglyCancelledSchedules] Cancelados a restaurar (worked/billed): ${wronglyCancelled.length}`);

        if (dryRun) {
            return Response.json({
                success: true,
                dryRun: true,
                total_cancelled: allCancelled.length,
                to_restore: wronglyCancelled.length,
                sample: wronglyCancelled.slice(0, 20).map((s) => ({
                    id: s.id,
                    client_name: s.client_name,
                    start_time: s.start_time,
                    has_clock_in: Array.isArray(s.clock_in_data) && s.clock_in_data.some((c) => c.clock_in_time),
                    xero_invoiced: !!s.xero_invoiced,
                    billed_at: s.billed_at,
                })),
            });
        }

        if (wronglyCancelled.length === 0) {
            return Response.json({ success: true, message: 'No se encontraron servicios cancelados por error.', restored_count: 0 });
        }

        // Revert in batches via bulkUpdate
        const UPDATE_BATCH = 50;
        let restoredCount = 0;
        for (let i = 0; i < wronglyCancelled.length; i += UPDATE_BATCH) {
            const chunk = wronglyCancelled.slice(i, i + UPDATE_BATCH);
            try {
                await base44.asServiceRole.entities.Schedule.bulkUpdate(
                    chunk.map((s) => ({ id: s.id, status: 'completed' }))
                );
                restoredCount += chunk.length;
            } catch (e) {
                console.error(`[restoreWronglyCancelledSchedules] Error en lote ${i}: ${e.message}`);
            }
            await new Promise((r) => setTimeout(r, 150));
        }

        // Audit log entry
        try {
            await base44.asServiceRole.entities.AuditLog.create({
                entity_type: 'Schedule',
                entity_id: 'bulk-restore',
                entity_name: `Restauración masiva de servicios cancelados por error`,
                action: 'update',
                user_id: user.id,
                user_name: user.full_name || '',
                user_email: user.email || '',
                changed_fields: ['status'],
                changes_detail: [{
                    field: 'status',
                    before: 'cancelled',
                    after: 'completed',
                }],
                timestamp: new Date().toISOString(),
            });
        } catch (auditErr) {
            console.warn(`[restoreWronglyCancelledSchedules] No se pudo registrar audit log: ${auditErr.message}`);
        }

        console.log(`[restoreWronglyCancelledSchedules] ✅ Restaurados: ${restoredCount}`);
        return Response.json({
            success: true,
            message: `${restoredCount} servicios restaurados a 'completed'.`,
            restored_count: restoredCount,
            total_cancelled: allCancelled.length,
        });
    } catch (error) {
        console.error('[restoreWronglyCancelledSchedules] Error:', error);
        return Response.json({ success: false, error: error.message || 'Error desconocido' }, { status: 500 });
    }
}