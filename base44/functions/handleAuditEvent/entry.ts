import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// This function is called by entity automations to record audit logs.
// IMPORTANT: Entity automations run as service-role, so base44.auth.me()
// returns the service account, NOT the real user who made the change.
// We must resolve the acting user from entity data fields instead.

const SKIP_FIELDS = ['photo_urls', 'access_photos', 'default_photo_urls', 'structured_service_notes', 'clock_in_data', 'price_history', 'reconciliation_items', 'cleaner_schedules', 'updated_date', 'created_date', 'created_by_id', 'last_updated_by_id', 'last_updated_by_name', 'last_updated_by_email', 'last_updated_at'];

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

async function resolveUser(base44, userId) {
  if (!userId) return null;
  try {
    const users = await base44.asServiceRole.entities.User.filter({ id: userId });
    if (users.length > 0) {
      return {
        user_id: userId,
        user_name: users[0].full_name || users[0].email || 'Desconocido',
        user_email: users[0].email || '',
      };
    }
  } catch (_) {}
  return null;
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

    // --- Resolve acting user from entity data, NOT from auth.me() ---
    // Entity automations run as service-role, so auth.me() is always the service account.
    // Instead:
    //   create  → created_by_id is the user who created the record
    //   update  → check if entity has a "last_modified_by" field, else use created_by_id from new data
    //   delete  → use created_by_id from old_data (record's owner/creator is best approximation)
    //
    // For entities that store an explicit "logged_by", "assigned_to", "created_by_user_id" etc.,
    // we try those as well.

    let user_id = '';
    let user_name = 'Desconocido';
    let user_email = '';

    const currentData = data || old_data;

    // For update/delete/create: prefer the explicit last_updated_by_* fields (set by frontend before saving).
    // These are the most reliable because they're written by the authenticated user session on the client side.
    if (data?.last_updated_by_id) {
      user_id = data.last_updated_by_id;
      user_name = data.last_updated_by_name || data.last_updated_by_email || 'Desconocido';
      user_email = data.last_updated_by_email || '';
    } else {
      // Fallback: resolve from other user-id fields in entity data
      const userIdCandidates = [
        action === 'create' ? currentData?.created_by_id : null,
        currentData?.last_modified_by_id,
        currentData?.modified_by_id,
        currentData?.created_by_user_id,
        currentData?.awarded_by_admin,
        currentData?.registered_by_admin,
        currentData?.reviewed_by_admin,
        currentData?.issued_by_admin,
      ].filter(Boolean);

      let resolvedUser = null;
      for (const candidateId of userIdCandidates) {
        resolvedUser = await resolveUser(base44, candidateId);
        if (resolvedUser) break;
      }

      if (resolvedUser) {
        user_id = resolvedUser.user_id;
        user_name = resolvedUser.user_name;
        user_email = resolvedUser.user_email;
      } else {
        user_id = 'service_unknown';
        user_name = 'Sistema (automático)';
        user_email = '';
      }
    }

    const entity_name = getEntityName(entity_type, currentData);

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