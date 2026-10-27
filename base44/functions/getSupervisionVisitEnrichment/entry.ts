import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

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
    const allCleanerIds = new Set();
    schedules.forEach((s) => (s.cleaner_ids || []).forEach((id) => allCleanerIds.add(id)));
    const cleanerNames = {};
    await Promise.all([...allCleanerIds].map(async (id) => {
      try {
        const u = await base44.asServiceRole.entities.User.get(id);
        cleanerNames[id] = u.invoice_name || u.display_name || u.full_name || 'Limpiador';
      } catch {
        cleanerNames[id] = 'Limpiador';
      }
    }));

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