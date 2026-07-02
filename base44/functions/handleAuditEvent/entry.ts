import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// This function is called by entity automations to record audit logs.
// It receives the automation payload and fetches user info to enrich the log.

const SKIP_FIELDS = ['photo_urls', 'access_photos', 'default_photo_urls', 'structured_service_notes', 'clock_in_data', 'price_history', 'reconciliation_items', 'cleaner_schedules', 'updated_date', 'created_date', 'created_by_id'];

function summarizeValue(val) {
  if (val === null || val === undefined) return '(vacío)';
  if (typeof val === 'boolean') return val ? 'Sí' : 'No';
  if (Array.isArray(val)) return `[${val.length} items]`;
  if (typeof val === 'object') return JSON.stringify(val).slice(0, 150);
  return String(val).slice(0, 300);
}

function getEntityName(entity_type, data) {
  if (!data) return '';
  switch (entity_type) {
    case 'Client': return data.name || '';
    case 'Schedule': return data.client_name || '';
    case 'Vehicle': return `${data.make || ''} ${data.model || ''} ${data.plate || ''}`.trim();
    case 'User': return data.full_name || data.email || '';
    case 'Invoice': return data.cleaner_name || '';
    case 'WorkEntry': return data.cleaner_name || '';
    default: return data.name || data.client_name || data.cleaner_name || '';
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { event, data, old_data, changed_fields } = payload;
    if (!event) return Response.json({ error: 'No event' }, { status: 400 });

    const entity_type = event.entity_name;
    const entity_id = event.entity_id;
    const action = event.type; // create, update, delete

    // Try to get the user who made the change.
    // For updates/deletes, created_by_id is the original creator, not the modifier —
    // so we try to resolve the user from both data and old_data, preferring the most recent.
    const raw_user_id = data?.created_by_id || old_data?.created_by_id || '';
    let user_id = raw_user_id;
    let user_name = 'Desconocido';
    let user_email = '';

    if (user_id) {
      try {
        const users = await base44.asServiceRole.entities.User.filter({ id: user_id });
        if (users.length > 0) {
          user_name = users[0].full_name || users[0].email || 'Desconocido';
          user_email = users[0].email || '';
        }
      } catch (_) {}
    }

    const entity_name = getEntityName(entity_type, data || old_data);

    // Build changes detail
    const changesDetail = [];
    const relevantFields = (changed_fields || []).filter(f => !SKIP_FIELDS.includes(f));

    if (action === 'update' && old_data && data) {
      for (const field of relevantFields) {
        const before = summarizeValue(old_data[field]);
        const after = summarizeValue(data[field]);
        if (before !== after) {
          changesDetail.push({ field, before, after });
        }
      }
    } else if (action === 'create' && data) {
      const fields = Object.keys(data).filter(f => !SKIP_FIELDS.includes(f));
      for (const field of fields.slice(0, 15)) {
        const val = data[field];
        if (val !== null && val !== undefined && val !== '') {
          changesDetail.push({ field, before: '(nuevo)', after: summarizeValue(val) });
        }
      }
    } else if (action === 'delete') {
      changesDetail.push({ field: 'registro', before: entity_name || entity_id, after: '(eliminado)' });
    }

    if (changesDetail.length === 0 && action === 'update') {
      // Nothing meaningful changed, skip
      return Response.json({ success: true, skipped: true });
    }

    await base44.asServiceRole.entities.AuditLog.create({
      entity_type,
      entity_id,
      entity_name,
      action,
      user_id,
      user_name,
      user_email,
      changed_fields: relevantFields,
      changes_detail: changesDetail,
      timestamp: new Date().toISOString(),
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});