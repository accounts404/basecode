import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Historial de solo lectura: últimas revisiones de supervisión de cada cliente.
// No modifica nada; solo devuelve las visitas anteriores ya registradas.

const MAX_REVIEWS = 3;
const MAX_BLOCKS = 300;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const supervision_id = body?.supervision_id;
    const requested = Array.isArray(body?.client_ids) ? body.client_ids.filter(Boolean) : [];
    const rawLimit = Number(body?.limit);
    const limit = rawLimit > 0 ? Math.min(rawLimit, 10) : MAX_REVIEWS;

    if (!supervision_id) return Response.json({ error: 'supervision_id es requerido' }, { status: 400 });
    if (requested.length === 0) return Response.json({ success: true, history: {} });

    const supervision = await base44.entities.Supervision.get(supervision_id).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!supervision) return Response.json({ error: 'Bloque de supervisión no encontrado' }, { status: 404 });

    const isAdmin = user.role === 'admin';
    const isSupervisor = supervision.supervisor_id === user.id;
    if (!isAdmin && !isSupervisor) {
      return Response.json({ error: 'No tienes permiso sobre este bloque' }, { status: 403 });
    }

    // Solo se puede consultar historial de clientes realmente asignados a este bloque
    const allowed = new Set((supervision.visits || []).map((v) => v && v.client_id).filter(Boolean));
    const targets = requested.filter((id) => allowed.has(id));
    if (targets.length === 0) return Response.json({ success: true, history: {} });

    const blockDate = supervision.date || (supervision.start_time || '').slice(0, 10);
    if (!blockDate) return Response.json({ success: true, history: {} });

    // Bloques anteriores: lectura con rol de servicio porque pueden ser de otro supervisor
    const pastRaw = await base44.asServiceRole.entities.Supervision.filter(
      { date: { $lt: blockDate } },
      { sort: '-date', limit: MAX_BLOCKS }
    );
    const past = (Array.isArray(pastRaw) ? pastRaw : (pastRaw?.items || []))
      .filter((s) => s && s.id !== supervision.id);

    const history = {};
    targets.forEach((id) => { history[id] = []; });

    for (const block of past) {
      for (const visit of block.visits || []) {
        if (!visit || !visit.client_id) continue;
        const bucket = history[visit.client_id];
        if (!bucket || bucket.length >= limit) continue;

        const photos = Array.isArray(visit.photos) ? visit.photos.filter((p) => p && p.url) : [];
        const notes = (visit.notes || '').trim();
        const incidents = (visit.incidents || '').trim();

        // Solo revisiones con algo registrado: evita ruido de visitas nunca trabajadas
        if (!notes && !incidents && photos.length === 0) continue;

        bucket.push({
          supervision_id: block.id,
          date: block.date || (block.start_time || '').slice(0, 10) || null,
          supervisor_name: block.supervisor_name || 'Supervisor',
          supervision_status: block.status || null,
          visit_status: visit.visit_status || 'pending',
          started_at: visit.started_at || null,
          completed_at: visit.completed_at || null,
          notes,
          incidents,
          photos: photos.map((p) => ({ url: p.url, comment: p.comment || '' })),
        });
      }
    }

    return Response.json({ success: true, history });
  } catch (error) {
    console.error('[getClientSupervisionHistory] Error:', error);
    return Response.json({ success: false, error: error.message, history: {} }, { status: 500 });
  }
}