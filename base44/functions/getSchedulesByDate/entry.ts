import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Convierte una fecha Melbourne 'YYYY-MM-DD' a rangos UTC para buscar
// Melbourne AEST = UTC+10, AEDT = UTC+11
// Abril = AEST (+10), entonces:
// Melbourne 2026-04-21 00:00 = UTC 2026-04-20T14:00:00Z
// Melbourne 2026-04-21 23:59 = UTC 2026-04-21T13:59:00Z
function getMelbourneDayUTCRange(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  // AEST = UTC+10
  const offset = 10;
  const startUTC = new Date(Date.UTC(year, month - 1, day, 0 - offset, 0, 0));
  const endUTC = new Date(Date.UTC(year, month - 1, day, 24 - offset, 0, 0));
  return {
    startUTC: startUTC.toISOString(),
    endUTC: endUTC.toISOString(),
    startLocal: `${dateStr}T00:00:00.000`,
    endLocal: `${dateStr}T23:59:59.999`,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { date } = body; // formato: 'YYYY-MM-DD' en hora Melbourne

    if (!date) return Response.json({ error: 'date requerido (formato: YYYY-MM-DD)' }, { status: 400 });

    const range = getMelbourneDayUTCRange(date);

    // Buscar schedules con start_time en formato UTC (con Z)
    const schedulesUTC = await base44.asServiceRole.entities.Schedule.filter({
      start_time: { $gte: range.startUTC, $lt: range.endUTC }
    }, 'start_time', 100);

    // Buscar schedules con start_time en formato local (sin Z) - prefijo de fecha
    const schedulesLocal = await base44.asServiceRole.entities.Schedule.filter({
      start_time: { $gte: range.startLocal, $lt: range.endLocal }
    }, 'start_time', 100);

    // Combinar y deduplicar
    const allMap = new Map();
    [...schedulesUTC, ...schedulesLocal].forEach(s => allMap.set(s.id, s));
    const daySchedules = Array.from(allMap.values());

    // Simplificar datos
    const simplified = daySchedules.map(s => ({
      id: s.id,
      client_name: s.client_name,
      client_address: s.client_address,
      start_time: s.start_time,
      end_time: s.end_time,
      cleaner_ids: s.cleaner_ids || [],
      cleaner_schedules: (s.cleaner_schedules || []).map(cs => ({
        cleaner_id: cs.cleaner_id,
        start_time: cs.start_time,
        end_time: cs.end_time,
      })),
      status: s.status,
      notes_public: s.notes_public || null,
    }));

    // Ordenar por start_time
    simplified.sort((a, b) => a.start_time?.localeCompare(b.start_time || '') || 0);

    // DailyTeamAssignments del día
    const allAssignments = await base44.asServiceRole.entities.DailyTeamAssignment.filter({ date: date });
    const assignments = allAssignments.map(a => ({
      id: a.id,
      team_name: a.team_name || null,
      main_driver_id: a.main_driver_id,
      team_member_ids: a.team_member_ids || [],
      team_members_names: a.team_members_names || [],
      vehicle_info: a.vehicle_info || null,
      status: a.status,
    }));

    // Nombres de limpiadores
    const cleanerIds = new Set();
    simplified.forEach(s => s.cleaner_ids.forEach(id => cleanerIds.add(id)));

    let cleaners = [];
    if (cleanerIds.size > 0) {
      const allUsers = await base44.asServiceRole.entities.User.list();
      cleaners = allUsers
        .filter(u => cleanerIds.has(u.id))
        .map(u => ({ id: u.id, full_name: u.full_name }));
    }

    // Fecha actual en Melbourne para referencia del agente
    const nowUTC = new Date();
    const melbOffset = 10; // AEST abril-octubre
    const melbNow = new Date(nowUTC.getTime() + melbOffset * 60 * 60 * 1000);
    const todayMelbourne = melbNow.toISOString().slice(0, 10);

    return Response.json({
      today_melbourne: todayMelbourne,
      date,
      total_services: simplified.length,
      schedules: simplified,
      total_team_assignments: assignments.length,
      team_assignments: assignments,
      cleaners,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});