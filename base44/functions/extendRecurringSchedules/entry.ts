import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { addMonths, addDays, format } from 'npm:date-fns@3.6.0';
import { computePreview, formatLocalISO, advanceByRule, loadAll } from '../../shared/recurrencePreview.ts';

const LOCK_NAME = 'cron_extend_lock';
const LOCK_TTL_MS = 60 * 60 * 1000;
const OWNER_EMAIL = 'accounts@redoakcleaning.com.au';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function acquireLock(base44, log) {
    try {
        const existing = await base44.asServiceRole.entities.SystemSetting.filter({ setting_name: LOCK_NAME });
        if (existing && existing.length > 0) {
            const lock = existing[0];
            const ts = Number(lock.terms_and_conditions || 0);
            const age = Date.now() - ts;
            if (age < LOCK_TTL_MS) {
                log(`🔒 Lock activo (edad ${Math.round(age / 1000)}s). Abortando para evitar doble ejecución.`);
                return { abort: true, lockId: null };
            }
            await base44.asServiceRole.entities.SystemSetting.update(lock.id, {
                terms_and_conditions: String(Date.now()),
            });
            return { abort: false, lockId: lock.id };
        }
        const created = await base44.asServiceRole.entities.SystemSetting.create({
            setting_name: LOCK_NAME,
            terms_and_conditions: String(Date.now()),
        });
        return { abort: false, lockId: created.id };
    } catch (e) {
        log(`⚠️ No se pudo adquirir lock (continuando sin lock): ${e.message}`);
        return { abort: false, lockId: null };
    }
}

async function releaseLock(base44, lockId, log) {
    if (!lockId) return;
    try {
        await base44.asServiceRole.entities.SystemSetting.delete(lockId);
    } catch (e) {
        log(`⚠️ No se pudo liberar lock ${lockId}: ${e.message}`);
    }
}

function buildEmailHtml(period, summary, preview_items) {
    const rows = (preview_items || []).map((it) => `
        <tr>
          <td style="padding:6px;border:1px solid #e5e7eb">${it.client_name || '—'}</td>
          <td style="padding:6px;border:1px solid #e5e7eb">${it.recurrence_rule}</td>
          <td style="padding:6px;border:1px solid #e5e7eb">${it.last_service_date}</td>
          <td style="padding:6px;border:1px solid #e5e7eb">${it.count}</td>
          <td style="padding:6px;border:1px solid #e5e7eb;font-size:12px">${(it.new_dates || []).slice(0, 6).join(', ')}${it.new_dates.length > 6 ? '…' : ''}</td>
        </tr>`).join('');

    return `
      <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto">
        <h2 style="color:#0f172a">Vista previa de recurrencias — ${period}</h2>
        <p style="color:#475569">El cron mensual de extensión de series recurrentes generó una vista previa.
        <strong>Ningún servicio fue creado ni cancelado automáticamente.</strong></p>
        <p>Para aplicar los cambios, entra al panel administrativo → sección <strong>"Recurrencias (Aprobación)"</strong> y pulsa <em>Aprobar y ejecutar</em>.</p>
        <h3 style="color:#0f172a">Resumen</h3>
        <ul>
          <li>Series a extender: <strong>${summary.total_series_to_extend}</strong></li>
          <li>Servicios nuevos a crear: <strong>${summary.total_new_services}</strong></li>
          <li>Series ya al día (sin acción): ${summary.already_ok}</li>
          <li>Series abandonadas (omitidas): ${summary.skipped_abandoned}</li>
          <li>Series con limpiadores inactivos (omitidas): ${summary.skipped_inactive}</li>
        </ul>
        ${preview_items.length > 0 ? `
        <h3 style="color:#0f172a">Detalle de series a extender</h3>
        <table style="border-collapse:collapse;width:100%;font-size:13px">
          <thead>
            <tr style="background:#f1f5f9">
              <th style="padding:6px;border:1px solid #e5e7eb;text-align:left">Cliente</th>
              <th style="padding:6px;border:1px solid #e5e7eb;text-align:left">Frecuencia</th>
              <th style="padding:6px;border:1px solid #e5e7eb;text-align:left">Último servicio</th>
              <th style="padding:6px;border:1px solid #e5e7eb;text-align:left">A crear</th>
              <th style="padding:6px;border:1px solid #e5e7eb;text-align:left">Próximas fechas</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>` : `<p style="color:#16a34a">✅ No hay extensiones pendientes este mes. Todas las series están al día.</p>`}
        <p style="color:#94a3b8;font-size:12px;margin-top:24px">RedOak Cleaning — Sistema de recurrencias</p>
      </div>`;
}

export default async function(req) {
    const base44 = createClientFromRequest(req);
    const log = (m) => console.log(`[extendRecurringSchedules] ${m}`);

    let lockId = null;
    try {
        const lockResult = await acquireLock(base44, log);
        if (lockResult.abort) {
            return Response.json({ success: false, aborted: true, reason: 'lock_active' }, { status: 409 });
        }
        lockId = lockResult.lockId;
        log('🔄 Iniciando generación de vista previa mensual (fase solo lectura)...');

        const { preview_items, summary } = await computePreview(base44, log);

        // Marcar vistas previas pendientes anteriores como expiradas
        const existingPending = await base44.asServiceRole.entities.RecurrencePreview.filter({ status: 'pending' });
        if (existingPending && existingPending.length > 0) {
            await base44.asServiceRole.entities.RecurrencePreview.bulkUpdate(
                existingPending.map((p) => ({ id: p.id, status: 'expired' }))
            );
            log(`📅 ${existingPending.length} vista(s) previa(s) anterior(es) marcada(s) como expirada(s).`);
        }

        const period = format(new Date(), 'yyyy-MM');
        const generated_at = new Date().toISOString();

        // Guardar la vista previa
        const preview = await base44.asServiceRole.entities.RecurrencePreview.create({
            period,
            generated_at,
            status: 'pending',
            preview_items,
            summary,
            email_sent: false,
        });
        log(`📝 Vista previa guardada con id ${preview.id} (${preview_items.length} series, ${summary.total_new_services} servicios).`);

        // Enviar el correo mensual (siempre, incluso si no hay cambios)
        let emailOk = false;
        try {
            const html = buildEmailHtml(period, summary, preview_items);
            const subject = preview_items.length > 0
                ? `[RedOak] Vista previa de recurrencias ${period} — ${summary.total_new_services} servicios pendientes de aprobación`
                : `[RedOak] Vista previa de recurrencias ${period} — Sin cambios pendientes`;
            await base44.asServiceRole.integrations.Core.SendEmail({
                to: OWNER_EMAIL,
                subject,
                body: html,
            });
            emailOk = true;
            await base44.asServiceRole.entities.RecurrencePreview.update(preview.id, { email_sent: true });
            log('✅ Correo mensual enviado.');
        } catch (emailErr) {
            log(`⚠️ Error enviando correo: ${emailErr.message}`);
        }

        return Response.json({
            success: true,
            message: 'Vista previa generada. Esperando aprobación del admin.',
            preview_id: preview.id,
            preview_items: preview_items.length,
            summary,
            email_sent: emailOk,
        });
    } catch (error) {
        log(`❌ Error fatal: ${error.message}`);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    } finally {
        if (lockId) await releaseLock(base44, lockId, log);
    }
}