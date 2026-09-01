import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Reverts the over-broad restoration: services changed to completed/scheduled by
// restoreWronglyCancelledSchedules (+ the future-restore updateMany) that do NOT
// belong to the recurrence series the admin actually wanted to restore.
// The series to PRESERVE is identified by recurrence_id === KEEP_RECURRENCE_ID.
// We reconstruct the affected set via updated_date window (bulkUpdate bumps it),
// combined with the original selection criteria. Dry-run is mandatory before apply.
const KEEP_RECURRENCE_ID = '68d9f22332d9d90746c02088';

// Restore window (UTC) — the restore ran ~22:21-22:22 on 2026-09-01.
const WINDOW_START = new Date('2026-09-01T22:15:00.000Z');
const WINDOW_END = new Date('2026-09-01T22:35:00.000Z');

const isInWindow = (d) => {
  if (!d) return false;
  const t = new Date(d).getTime();
  return t >= WINDOW_START.getTime() && t <= WINDOW_END.getTime();
};

const wasRestoreTarget = (s) => {
  // Completed-set criteria: had clock-in OR were billed.
  const hasClockIn = Array.isArray(s.clock_in_data) && s.clock_in_data.some((c) => c.clock_in_time);
  const billed = !!s.billed_at || s.xero_invoiced === true;
  if (s.status === 'completed') return hasClockIn || billed;
  // Scheduled-set criteria: future + recurring (the updateMany that restored futures).
  if (s.status === 'scheduled') {
    const future = new Date(s.start_time).getTime() >= Date.now();
    const recurring = !!s.recurrence_rule && s.recurrence_rule !== 'none';
    return future && recurring;
  }
  return false;
};

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ success: false, error: 'Unauthorized: Solo administradores' }, { status: 403 });
    }

    const { dryRun } = await req.json().catch(() => ({ dryRun: true }));
    console.log(`[revertExcessRestoration] dryRun=${!!dryRun} keep=${KEEP_RECURRENCE_ID}`);

    // Load schedules sorted by -updated_date; collect those in the restore window.
    const BATCH = 500;
    let skip = 0;
    const candidates = [];
    let safety = 60;
    let exhausted = false;
    while (safety-- > 0 && !exhausted) {
      const batch = await base44.asServiceRole.entities.Schedule.list('-updated_date', BATCH, skip);
      if (!batch || batch.length === 0) break;
      for (const s of batch) {
        if (!isInWindow(s.updated_date)) {
          // Sorted desc: once we pass below the window, we can stop.
          if (new Date(s.updated_date).getTime() < WINDOW_START.getTime()) {
            exhausted = true;
            break;
          }
          continue;
        }
        candidates.push(s);
      }
      if (exhausted) break;
      if (batch.length < BATCH) break;
      skip += BATCH;
    }
    console.log(`[revertExcessRestoration] En ventana: ${candidates.length}`);

    // Filter: touched by restore (matches criteria) AND NOT the kept series.
    const toRevert = candidates.filter((s) =>
      wasRestoreTarget(s) && s.recurrence_id !== KEEP_RECURRENCE_ID
    );
    const keptInSeries = candidates.filter((s) => s.recurrence_id === KEEP_RECURRENCE_ID);
    console.log(`[revertExcessRestoration] A revertir: ${toRevert.length} · preservados serie ${KEEP_RECURRENCE_ID}: ${keptInSeries.length}`);

    if (dryRun) {
      return Response.json({
        success: true,
        dryRun: true,
        window: { start: WINDOW_START.toISOString(), end: WINDOW_END.toISOString() },
        in_window: candidates.length,
        to_revert: toRevert.length,
        kept_in_series: keptInSeries.length,
        keep_recurrence_id: KEEP_RECURRENCE_ID,
        sample: toRevert.slice(0, 25).map((s) => ({
          id: s.id,
          client_name: s.client_name,
          start_time: s.start_time,
          status: s.status,
          recurrence_id: s.recurrence_id,
          has_clock_in: Array.isArray(s.clock_in_data) && s.clock_in_data.some((c) => c.clock_in_time),
          xero_invoiced: !!s.xero_invoiced,
          billed_at: s.billed_at,
          updated_date: s.updated_date,
        })),
      });
    }

    if (toRevert.length === 0) {
      return Response.json({ success: true, message: 'No se encontraron servicios para revertir.', reverted_count: 0 });
    }

    // Revert in batches of 50.
    const REVERT_BATCH = 50;
    let revertedCount = 0;
    for (let i = 0; i < toRevert.length; i += REVERT_BATCH) {
      const chunk = toRevert.slice(i, i + REVERT_BATCH);
      try {
        await base44.asServiceRole.entities.Schedule.bulkUpdate(
          chunk.map((s) => ({ id: s.id, status: 'cancelled' }))
        );
        revertedCount += chunk.length;
      } catch (e) {
        console.error(`[revertExcessRestoration] Error en lote ${i}: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    try {
      await base44.asServiceRole.entities.AuditLog.create({
        entity_type: 'Schedule',
        entity_id: 'bulk-revert-excess',
        entity_name: `Reversión de restauración en exceso (preserva serie ${KEEP_RECURRENCE_ID})`,
        action: 'update',
        user_id: user.id,
        user_name: user.full_name || '',
        user_email: user.email || '',
        changed_fields: ['status'],
        changes_detail: [{ field: 'status', before: 'completed/scheduled', after: 'cancelled' }],
        timestamp: new Date().toISOString(),
      });
    } catch (auditErr) {
      console.warn(`[revertExcessRestoration] No se pudo registrar audit log: ${auditErr.message}`);
    }

    console.log(`[revertExcessRestoration] ✅ Revertidos: ${revertedCount}`);
    return Response.json({
      success: true,
      message: `${revertedCount} servicios revertidos a 'cancelled'. Serie ${KEEP_RECURRENCE_ID} preservada.`,
      reverted_count: revertedCount,
      kept_in_series: keptInSeries.length,
    });
  } catch (error) {
    console.error('[revertExcessRestoration] Error:', error);
    return Response.json({ success: false, error: error.message || 'Error desconocido' }, { status: 500 });
  }
}