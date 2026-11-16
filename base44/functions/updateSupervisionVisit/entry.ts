import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Guarda UN cambio puntual sobre una visita del bloque de supervisión.
// Lee siempre el bloque actualizado antes de escribir, así nunca pisa lo que
// agregó u completó otra persona, y deja registro de quién cambió qué.

const newLogId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const {
      supervision_id,
      action,
      client_id,
      client_name,
      client_address,
      notes,
      incidents,
      photo_url,
      comment,
      log_id,
    } = body || {};

    if (!supervision_id || !action) {
      return Response.json({ error: 'supervision_id y action son requeridos' }, { status: 400 });
    }

    // Lectura SIEMPRE fresca del bloque
    const supervision = await base44.entities.Supervision.get(supervision_id).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!supervision) return Response.json({ error: 'Bloque de supervisión no encontrado' }, { status: 404 });

    const isAdmin = user.role === 'admin';
    const isSupervisor = supervision.supervisor_id === user.id;
    if (!isAdmin && !isSupervisor) {
      return Response.json({ error: 'No tienes permiso sobre este bloque' }, { status: 403 });
    }

    // Quitar o restaurar clientes de un bloque es exclusivo del administrador:
    // el limpiador/supervisor solo puede trabajar las visitas asignadas.
    if ((action === 'remove_visit' || action === 'restore_visit') && !isAdmin) {
      return Response.json(
        { error: 'Solo un administrador puede quitar clientes de un bloque de supervisión' },
        { status: 403 }
      );
    }

    const visits = Array.isArray(supervision.visits) ? [...supervision.visits] : [];
    const log = Array.isArray(supervision.visits_log) ? [...supervision.visits_log] : [];
    const index = client_id ? visits.findIndex((v) => v && v.client_id === client_id) : -1;
    const at = new Date().toISOString();
    const byName = user.full_name || user.email || 'Usuario';

    const pushLog = (entry) => {
      log.push({
        id: newLogId(),
        at,
        by_id: user.id,
        by_name: byName,
        ...entry,
      });
    };

    const missingVisit = () => Response.json({ error: 'La visita ya no existe en este bloque' }, { status: 409 });

    switch (action) {
      case 'start_visit': {
        if (index < 0) return missingVisit();
        visits[index] = { ...visits[index], visit_status: 'in_progress', started_at: at };
        pushLog({ action: 'started', client_id, client_name: visits[index].client_name });
        break;
      }
      case 'reopen_visit': {
        if (index < 0) return missingVisit();
        visits[index] = { ...visits[index], visit_status: 'in_progress', started_at: at };
        pushLog({ action: 'reopened', client_id, client_name: visits[index].client_name });
        break;
      }
      case 'complete_visit': {
        if (index < 0) return missingVisit();
        visits[index] = { ...visits[index], visit_status: 'completed', completed_at: at };
        pushLog({ action: 'completed', client_id, client_name: visits[index].client_name });
        break;
      }
      case 'skip_visit': {
        if (index < 0) return missingVisit();
        visits[index] = { ...visits[index], visit_status: 'skipped' };
        pushLog({ action: 'skipped', client_id, client_name: visits[index].client_name });
        break;
      }
      case 'save_visit_text': {
        if (index < 0) return missingVisit();
        visits[index] = {
          ...visits[index],
          notes: typeof notes === 'string' ? notes : visits[index].notes || '',
          incidents: typeof incidents === 'string' ? incidents : visits[index].incidents || '',
        };
        break;
      }
      case 'add_photo': {
        if (index < 0) return missingVisit();
        if (!photo_url) return Response.json({ error: 'photo_url es requerido' }, { status: 400 });
        const photos = Array.isArray(visits[index].photos) ? [...visits[index].photos] : [];
        if (!photos.some((p) => p && p.url === photo_url)) {
          photos.push({ url: photo_url, comment: comment || '' });
        }
        visits[index] = { ...visits[index], photos };
        break;
      }
      case 'remove_photo': {
        if (index < 0) return missingVisit();
        const photos = (visits[index].photos || []).filter((p) => p && p.url !== photo_url);
        visits[index] = { ...visits[index], photos };
        break;
      }
      case 'photo_comment': {
        if (index < 0) return missingVisit();
        const photos = (visits[index].photos || []).map((p) =>
          p && p.url === photo_url ? { ...p, comment: comment || '' } : p
        );
        visits[index] = { ...visits[index], photos };
        break;
      }
      case 'add_visit': {
        if (!client_id) return Response.json({ error: 'client_id es requerido' }, { status: 400 });
        if (visits.some((v) => v && v.client_id === client_id)) {
          return Response.json({ error: 'Ese cliente ya está en el bloque' }, { status: 409 });
        }
        visits.push({
          client_id,
          client_name: client_name || 'Cliente',
          client_address: client_address || '',
          visit_status: 'pending',
          started_at: null,
          completed_at: null,
          notes: '',
          incidents: '',
          photos: [],
        });
        pushLog({ action: 'added', client_id, client_name: client_name || 'Cliente' });
        break;
      }
      case 'remove_visit': {
        if (index < 0) return missingVisit();
        if (supervision.status === 'completed') {
          return Response.json({ error: 'El bloque está completado: ya no se pueden quitar visitas' }, { status: 409 });
        }
        if (supervision.work_entry_id) {
          const we = await base44.entities.WorkEntry.get(supervision.work_entry_id).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
          if (we && we.invoiced) {
            return Response.json({ error: 'El pago de este bloque ya está facturado: no se pueden quitar visitas' }, { status: 409 });
          }
        }
        const [removed] = visits.splice(index, 1);
        pushLog({
          action: 'removed',
          client_id,
          client_name: removed && removed.client_name,
          visit_snapshot: removed || null,
        });
        break;
      }
      case 'restore_visit': {
        if (!log_id) return Response.json({ error: 'log_id es requerido' }, { status: 400 });
        const entry = log.find((l) => l && l.id === log_id && l.action === 'removed');
        if (!entry || !entry.visit_snapshot) {
          return Response.json({ error: 'No se encontró la visita eliminada' }, { status: 404 });
        }
        const restored = entry.visit_snapshot;
        if (visits.some((v) => v && v.client_id === restored.client_id)) {
          return Response.json({ error: 'Ese cliente ya está en el bloque' }, { status: 409 });
        }
        visits.push(restored);
        pushLog({
          action: 'restored',
          client_id: restored.client_id,
          client_name: restored.client_name,
          log_id,
        });
        break;
      }
      default:
        return Response.json({ error: 'Acción no válida' }, { status: 400 });
    }

    const updated = await base44.entities.Supervision.update(supervision.id, { visits, visits_log: log });

    // Rastro en el registro de auditoría para los cambios de estructura del bloque
    const auditKinds = { add_visit: 'added', remove_visit: 'removed', restore_visit: 'restored' };
    if (auditKinds[action]) {
      const kind = auditKinds[action];
      const labels = {
        added: 'Cliente agregado al bloque',
        removed: 'Cliente quitado del bloque',
        restored: 'Cliente restaurado en el bloque',
      };
      await base44.asServiceRole.entities.AuditLog.create({
        entity_type: 'Supervision',
        entity_id: supervision.id,
        entity_name: `${supervision.supervisor_name || 'Supervisor'} · ${supervision.date || ''}`,
        action: 'update',
        user_id: user.id,
        user_name: byName,
        user_email: user.email || '',
        changed_fields: ['visits'],
        changes_detail: [
          {
            field: 'visita',
            before: kind === 'added' ? '(no estaba)' : '(en el bloque)',
            after: `${labels[kind]}: ${client_name || (log[log.length - 1] || {}).client_name || client_id || ''}`,
          },
        ],
        timestamp: at,
      });
    }

    return Response.json({ supervision: updated || { ...supervision, visits, visits_log: log } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}