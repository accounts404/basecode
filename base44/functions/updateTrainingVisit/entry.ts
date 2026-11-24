import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Guarda UN cambio puntual sobre una visita de un bloque de entrenamiento.
// Lee siempre el bloque actualizado antes de escribir para no pisar lo que
// agregó otra persona. Las instrucciones del administrador solo las puede
// cambiar un administrador; el entrenador escribe sus propias notas.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const {
      training_id,
      action,
      client_id,
      client_name,
      client_address,
      trainer_notes,
      training_instructions,
      areas_covered,
      photo_url,
      comment,
    } = body || {};

    if (!training_id || !action) {
      return Response.json({ error: 'training_id y action son requeridos' }, { status: 400 });
    }

    const training = await base44.entities.Training.get(training_id).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!training) return Response.json({ error: 'Bloque de entrenamiento no encontrado' }, { status: 404 });

    const isAdmin = user.role === 'admin';
    const isTrainer = training.trainer_id === user.id;
    if (!isAdmin && !isTrainer) {
      return Response.json({ error: 'No tienes permiso sobre este bloque' }, { status: 403 });
    }

    if ((action === 'remove_visit' || action === 'add_visit') && !isAdmin) {
      return Response.json(
        { error: 'Solo un administrador puede cambiar los clientes del bloque' },
        { status: 403 }
      );
    }
    if (action === 'save_instructions' && !isAdmin) {
      return Response.json(
        { error: 'Solo un administrador puede cambiar las instrucciones de entrenamiento' },
        { status: 403 }
      );
    }

    const visits = Array.isArray(training.visits) ? [...training.visits] : [];
    const index = client_id ? visits.findIndex((v) => v && v.client_id === client_id) : -1;
    const at = new Date().toISOString();

    const missingVisit = () => Response.json({ error: 'La visita ya no existe en este bloque' }, { status: 409 });

    switch (action) {
      case 'start_visit': {
        if (index < 0) return missingVisit();
        visits[index] = { ...visits[index], visit_status: 'in_progress', started_at: at };
        break;
      }
      case 'reopen_visit': {
        if (index < 0) return missingVisit();
        visits[index] = { ...visits[index], visit_status: 'in_progress', started_at: at };
        break;
      }
      case 'complete_visit': {
        if (index < 0) return missingVisit();
        visits[index] = { ...visits[index], visit_status: 'completed', completed_at: at };
        break;
      }
      case 'skip_visit': {
        if (index < 0) return missingVisit();
        visits[index] = { ...visits[index], visit_status: 'skipped' };
        break;
      }
      case 'save_trainer_notes': {
        if (index < 0) return missingVisit();
        visits[index] = {
          ...visits[index],
          trainer_notes: typeof trainer_notes === 'string' ? trainer_notes : visits[index].trainer_notes || '',
        };
        break;
      }
      case 'save_instructions': {
        if (index < 0) return missingVisit();
        visits[index] = {
          ...visits[index],
          training_instructions:
            typeof training_instructions === 'string'
              ? training_instructions
              : visits[index].training_instructions || '',
        };
        break;
      }
      case 'set_areas': {
        if (index < 0) return missingVisit();
        visits[index] = {
          ...visits[index],
          areas_covered: Array.isArray(areas_covered) ? areas_covered : visits[index].areas_covered || [],
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
          training_instructions: '',
          trainer_notes: '',
          areas_covered: [],
          started_at: null,
          completed_at: null,
          photos: [],
        });
        break;
      }
      case 'remove_visit': {
        if (index < 0) return missingVisit();
        if (training.status === 'completed') {
          return Response.json({ error: 'El bloque está completado: ya no se pueden quitar visitas' }, { status: 409 });
        }
        visits.splice(index, 1);
        break;
      }
      default:
        return Response.json({ error: 'Acción no válida' }, { status: 400 });
    }

    const updated = await base44.entities.Training.update(training.id, { visits });
    return Response.json({ training: updated || { ...training, visits } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}