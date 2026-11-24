import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Caché de nombres por limpiador: evita releer los mismos usuarios cada vez que se abre un bloque
const NAME_CACHE = new Map<string, { name: string; at: number }>();
const NAME_TTL_MS = 10 * 60 * 1000;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { date, client_ids } = await req.json().catch(() => ({}));
    if (!date || !Array.isArray(client_ids) || client_ids.length === 0) {
      return Response.json({ success: true, visits: {} });
    }

    // Cargar horarios de los clientes indicados para esa fecha (regex de prefijo para limitar lecturas)
    const datePrefix = String(date).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const schedulesRaw = await base44.asServiceRole.entities.Schedule.filter({
      client_id: { $in: client_ids },
      start_time: { $regex: `^${datePrefix}` },
    });
    const schedules = (Array.isArray(schedulesRaw) ? schedulesRaw : (schedulesRaw?.items || []))
      .filter((s) => s.status !== 'cancelled');

    // Resolver nombres de todos los limpiadores involucrados
    // IMPORTANTE: una sola lectura por lote + caché en memoria. Antes se hacía un User.get por
    // limpiador y eso agotaba el límite de lecturas (450/60s) y rompía la vista del limpiador.
    const allCleanerIds = new Set<string>();
    schedules.forEach((s) => (s.cleaner_ids || []).forEach((id) => allCleanerIds.add(id)));
    const cleanerNames: Record<string, string> = {};
    const nowMs = Date.now();
    const missing: string[] = [];
    allCleanerIds.forEach((id) => {
      const hit = NAME_CACHE.get(id);
      if (hit && nowMs - hit.at < NAME_TTL_MS) cleanerNames[id] = hit.name;
      else missing.push(id);
    });
    if (missing.length > 0) {
      try {
        const res = await base44.asServiceRole.entities.User.filter({ id: { $in: missing } });
        const arr = Array.isArray(res) ? res : (res?.items || []);
        const found = new Set<string>();
        arr.forEach((u) => {
          const name = u.invoice_name || u.display_name || u.full_name || 'Limpiador';
          cleanerNames[u.id] = name;
          NAME_CACHE.set(u.id, { name, at: nowMs });
          found.add(u.id);
        });
        missing.forEach((id) => { if (!found.has(id)) cleanerNames[id] = 'Limpiador'; });
      } catch (e) {
        console.warn('[getSupervisionVisitEnrichment] No se pudieron leer los nombres:', e?.message);
        missing.forEach((id) => { cleanerNames[id] = 'Limpiador'; });
      }
    }

    const visits = {};
    for (const clientId of client_ids) {
      const daySchedules = schedules.filter(
        (s) => s.client_id === clientId && (s.start_time || '').slice(0, 10) === date
      );
      if (daySchedules.length === 0) {
        visits[clientId] = null;
        continue;
      }

      // Preferir el servicio en progreso; si no, el primero
      const schedule = daySchedules.find((s) => s.status === 'in_progress') || daySchedules[0];
      const cleanerSchedules = schedule.cleaner_schedules || [];
      const clockInData = schedule.clock_in_data || [];

      const cleaners = (schedule.cleaner_ids || []).map((id) => {
        const cs = cleanerSchedules.find((c) => c.cleaner_id === id);
        const ci = clockInData.find((c) => c.cleaner_id === id);
        return {
          id,
          name: cleanerNames[id] || 'Limpiador',
          start_time: cs?.start_time || schedule.start_time,
          end_time: cs?.end_time || schedule.end_time,
          clock_in_time: ci?.clock_in_time || null,
          clock_out_time: ci?.clock_out_time || null,
        };
      });

      visits[clientId] = {
        schedule_id: schedule.id,
        status: schedule.status,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        service_specific_notes: schedule.service_specific_notes || null,
        notes_public: schedule.notes_public || null,
        cleaners,
      };
    }

    return Response.json({ success: true, visits });
  } catch (error) {
    console.error('[getSupervisionVisitEnrichment] Error:', error);
    return Response.json({ success: false, error: error.message, visits: {} }, { status: 500 });
  }
}