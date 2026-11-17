import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Reabre las entradas de trabajo de un reporte de pago (las vuelve a marcar como no facturadas).
// Se usa solo al eliminar un reporte, porque las entradas facturadas quedan bloqueadas a nivel de datos.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { invoice_id } = await req.json().catch(() => ({}));
    if (!invoice_id) {
      return Response.json({ error: 'invoice_id es requerido' }, { status: 400 });
    }

    const invoice = await base44.asServiceRole.entities.Invoice
      .get(invoice_id)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));

    if (!invoice) {
      return Response.json({ error: 'Reporte no encontrado' }, { status: 404 });
    }

    // Solo el administrador o el propio limpiador dueño del reporte puede reabrirlo
    if (user.role !== 'admin' && invoice.cleaner_id !== user.id) {
      return Response.json({ error: 'No autorizado para reabrir este reporte' }, { status: 403 });
    }

    const ids = Array.isArray(invoice.work_entries) ? invoice.work_entries : [];

    if (ids.length > 0) {
      await base44.asServiceRole.entities.WorkEntry.updateMany(
        { id: { $in: ids } },
        { $set: { invoiced: false } }
      );
    }

    console.log(`[reopenInvoiceWorkEntries] ${invoice.invoice_number} reabierto por ${user.email}: ${ids.length} entradas liberadas`);

    return Response.json({ success: true, reopened: ids.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}