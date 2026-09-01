import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Restaura servicios cancelados por el bug del 1-Sep y/o la reversión de hoy (revertExcessRestoration).
// Modo "estado original":
//   - pasado (start_time < hoy) con evidencia (clock-in/out o facturado) -> 'completed'
//   - pasado sin evidencia -> 'scheduled'
//   - futuro (start_time >= hoy) -> 'scheduled'
// Excluye la serie protegida 68d9f22332d9d90746c02088 (Lime Company) que ya está correcta.
// Filtra por updated_date dentro de la ventana del incidente (>= 2026-09-01 UTC).
// Registra un AuditLog por cada servicio restaurado.
const INCIDENT_START = new Date('2026-09-01T00:00:00.000Z');
const TODAY_STR = '2026-09-01'; // fecha de corte pasado/futuro
const PROTECTED_SERIES = '68d9f22332d9d90746c02088';

function hasWorkEvidence(s) {
    const hasClockIn = Array.isArray(s.clock_in_data) && s.clock_in_data.some((c) => c.clock_in_time);
    const billed = !!s.billed_at || s.xero_invoiced === true;
    return hasClockIn || billed;
}

function isFuture(s) {
    if (!s.start_time) return true;
    return String(s.start_time).slice(0, 10) >= TODAY_STR;
}

function proposedStatus(s) {
    if (isFuture(s)) return 'scheduled';
    return hasWorkEvidence(s) ? 'completed' : 'scheduled';
}

export default async function(req) {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ success: false, error: 'Unauthorized: Solo administradores' }, { status: 403 });
        }

        const { dryRun } = await req.json().catch(() => ({ dryRun: false }));
        console.log(`[restoreWronglyCancelledSchedules] dryRun=${!!dryRun}`);

        // Cargar todos los cancelados (paginado, dedup por id)
        const BATCH = 500;
        let skip = 0;
        let allCancelled = [];
        const seen = new Set();
        let safety = 100;
        while (safety-- > 0) {
            const batch = await base44.asServiceRole.entities.Schedule.filter({ status: 'cancelled' }, '-created_date', BATCH, skip);
            if (!batch || batch.length === 0) break;
            for (const s of batch) {
                if (s && s.id && !seen.has(s.id)) {
                    seen.add(s.id);
                    allCancelled.push(s);
                }
            }
            if (batch.length < BATCH) break;
            skip += BATCH;
        }
        console.log(`[restoreWronglyCancelledSchedules] Cancelados totales (dedup): ${allCancelled.length}`);

        // Filtrar por ventana del incidente y excluir serie protegida
        const incidentCancelled = allCancelled.filter((s) => {
            if (s.recurrence_id === PROTECTED_SERIES) return false;
            const upd = s.updated_date ? new Date(s.updated_date) : null;
            return upd && upd >= INCIDENT_START;
        });
        console.log(`[restoreWronglyCancelledSchedules] Cancelados en ventana del incidente: ${incidentCancelled.length}`);

        // Clasificar estado propuesto
        const withStatus = incidentCancelled.map((s) => ({
            id: s.id,
            client_name: s.client_name,
            client_id: s.client_id,
            start_time: s.start_time,
            recurrence_id: s.recurrence_id,
            is_future: isFuture(s),
            has_evidence: hasWorkEvidence(s),
            proposed: proposedStatus(s),
        }));

        const toCompleted = withStatus.filter((x) => x.proposed === 'completed');
        const toScheduled = withStatus.filter((x) => x.proposed === 'scheduled');

        // Resumen por cliente
        const byClientMap = new Map();
        for (const x of withStatus) {
            const key = x.client_name || '(sin nombre)';
            if (!byClientMap.has(key)) byClientMap.set(key, { client_name: key, completed: 0, scheduled: 0, total: 0 });
            const e = byClientMap.get(key);
            if (x.proposed === 'completed') e.completed++; else e.scheduled++;
            e.total++;
        }
        const by_client = Array.from(byClientMap.values()).sort((a, b) => b.total - a.total);

        const report = {
            total_cancelled: allCancelled.length,
            incident_cancelled: incidentCancelled.length,
            to_completed: toCompleted.length,
            to_scheduled: toScheduled.length,
            by_status: { completed: toCompleted.length, scheduled: toScheduled.length },
            by_client,
            sample: withStatus.slice(0, 25),
        };

        if (dryRun) {
            return Response.json({ success: true, dryRun: true, ...report });
        }

        if (withStatus.length === 0) {
            return Response.json({ success: true, message: 'No se encontraron servicios cancelados por el bug.', restored_count: 0, ...report });
        }

        // Aplicar restauración en lotes (bulkUpdate) por estado
        const UPDATE_BATCH = 50;
        let restoredCompleted = 0;
        let restoredScheduled = 0;
        const restoredIds = new Set();

        for (let i = 0; i < toCompleted.length; i += UPDATE_BATCH) {
            const chunk = toCompleted.slice(i, i + UPDATE_BATCH);
            try {
                await base44.asServiceRole.entities.Schedule.bulkUpdate(
                    chunk.map((x) => ({ id: x.id, status: 'completed' }))
                );
                chunk.forEach((x) => { restoredIds.add(x.id); restoredCompleted++; });
            } catch (e) {
                console.error(`[restoreWronglyCancelledSchedules] Error lote completed ${i}: ${e.message}`);
            }
            await new Promise((r) => setTimeout(r, 150));
        }

        for (let i = 0; i < toScheduled.length; i += UPDATE_BATCH) {
            const chunk = toScheduled.slice(i, i + UPDATE_BATCH);
            try {
                await base44.asServiceRole.entities.Schedule.bulkUpdate(
                    chunk.map((x) => ({ id: x.id, status: 'scheduled' }))
                );
                chunk.forEach((x) => { restoredIds.add(x.id); restoredScheduled++; });
            } catch (e) {
                console.error(`[restoreWronglyCancelledSchedules] Error lote scheduled ${i}: ${e.message}`);
            }
            await new Promise((r) => setTimeout(r, 150));
        }

        const restoredCount = restoredCompleted + restoredScheduled;
        console.log(`[restoreWronglyCancelledSchedules] ✅ Restaurados: ${restoredCount} (completed=${restoredCompleted}, scheduled=${restoredScheduled})`);

        // AuditLog por cada servicio restaurado (bulkCreate en lotes)
        const now = new Date().toISOString();
        const auditEntries = withStatus
            .filter((x) => restoredIds.has(x.id))
            .map((x) => ({
                entity_type: 'Schedule',
                entity_id: x.id,
                entity_name: `${x.client_name || '(sin nombre)'} — ${String(x.start_time || '').slice(0, 10)}`,
                action: 'update',
                user_id: user.id,
                user_name: user.full_name || '',
                user_email: user.email || '',
                changed_fields: ['status'],
                changes_detail: [{ field: 'status', before: 'cancelled', after: x.proposed }],
                timestamp: now,
            }));

        const AUDIT_BATCH = 50;
        let auditCreated = 0;
        for (let i = 0; i < auditEntries.length; i += AUDIT_BATCH) {
            const chunk = auditEntries.slice(i, i + AUDIT_BATCH);
            try {
                await base44.asServiceRole.entities.AuditLog.bulkCreate(chunk);
                auditCreated += chunk.length;
            } catch (e) {
                console.error(`[restoreWronglyCancelledSchedules] Error audit lote ${i}: ${e.message}`);
            }
            await new Promise((r) => setTimeout(r, 120));
        }
        console.log(`[restoreWronglyCancelledSchedules] AuditLog creados: ${auditCreated}`);

        return Response.json({
            success: true,
            message: `${restoredCount} servicios restaurados (${restoredCompleted} a completed, ${restoredScheduled} a scheduled). AuditLog: ${auditCreated}.`,
            restored_count: restoredCount,
            restored_completed: restoredCompleted,
            restored_scheduled: restoredScheduled,
            audit_created: auditCreated,
            ...report,
        });
    } catch (error) {
        console.error('[restoreWronglyCancelledSchedules] Error:', error);
        return Response.json({ success: false, error: error.message || 'Error desconocido' }, { status: 500 });
    }
}