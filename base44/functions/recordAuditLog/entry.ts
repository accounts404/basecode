import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Fields to skip (too large or irrelevant)
const SKIP_FIELDS = ['photo_urls', 'access_photos', 'default_photo_urls', 'structured_service_notes', 'clock_in_data', 'price_history', 'reconciliation_items', 'cleaner_schedules', 'updated_date', 'created_date'];

function summarizeValue(val) {
  if (val === null || val === undefined) return '(vacío)';
  if (typeof val === 'boolean') return val ? 'Sí' : 'No';
  if (typeof val === 'object') return JSON.stringify(val).slice(0, 200);
  return String(val).slice(0, 300);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { entity_type, entity_id, entity_name, action, user_id, user_name, user_email, data, old_data, changed_fields } = payload;

    if (!entity_type || !entity_id || !action) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

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
      for (const [field, val] of Object.entries(data)) {
        if (!SKIP_FIELDS.includes(field) && val !== null && val !== undefined && val !== '') {
          changesDetail.push({ field, before: '(nuevo)', after: summarizeValue(val) });
        }
      }
    } else if (action === 'delete') {
      changesDetail.push({ field: 'registro', before: entity_name || entity_id, after: '(eliminado)' });
    }

    await base44.asServiceRole.entities.AuditLog.create({
      entity_type,
      entity_id,
      entity_name: entity_name || entity_id,
      action,
      user_id: user_id || '',
      user_name: user_name || 'Sistema',
      user_email: user_email || '',
      changed_fields: relevantFields,
      changes_detail: changesDetail,
      timestamp: new Date().toISOString(),
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});