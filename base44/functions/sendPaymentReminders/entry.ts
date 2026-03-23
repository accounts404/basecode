
import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

// Función para convertir texto plano a HTML preservando formato
function textToHtml(text) {
    return text
        .split('\n')
        .map(line => line.trim() === '' ? '<br>' : `<p style="margin: 8px 0; line-height: 1.6;">${line}</p>`)
        .join('');
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    try {
        // Verificar que sea una llamada autorizada (admin o sistema)
        if (!(await base44.auth.isAuthenticated())) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const today = new Date();
        const day = today.getDate();
        
        // Solo ejecutar en días 1 y 16
        if (day !== 1 && day !== 16) {
            return new Response(JSON.stringify({ 
                message: 'No es día de envío automático',
                day: day 
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Determinar el período anterior
        let periodStart, periodEnd, periodLabel;
        
        if (day === 1) {
            // Estamos en día 1, recordar la 2da quincena del mes anterior
            const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 16);
            periodStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 16);
            periodEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
            periodLabel = `2da Quincena - ${periodStart.toLocaleString('es', { month: 'long', year: 'numeric' })}`;
        } else {
            // Estamos en día 16, recordar la 1ra quincena del mes actual
            periodStart = new Date(today.getFullYear(), today.getMonth(), 1);
            periodEnd = new Date(today.getFullYear(), today.getMonth(), 15);
            periodLabel = `1ra Quincena - ${today.toLocaleString('es', { month: 'long', year: 'numeric' })}`;
        }

        // Obtener todas las entradas de trabajo del período
        const workEntries = await base44.asServiceRole.entities.WorkEntry.filter({});
        const periodWorkEntries = workEntries.filter(entry => {
            const workDate = new Date(entry.work_date);
            return workDate >= periodStart && workDate <= periodEnd;
        });

        // Agrupar por limpiador
        const cleanerWork = {};
        periodWorkEntries.forEach(entry => {
            if (!cleanerWork[entry.cleaner_id]) {
                cleanerWork[entry.cleaner_id] = {
                    cleaner_name: entry.cleaner_name,
                    total_hours: 0,
                    total_amount: 0,
                    work_count: 0
                };
            }
            cleanerWork[entry.cleaner_id].total_hours += entry.hours || 0;
            cleanerWork[entry.cleaner_id].total_amount += entry.total_amount || 0;
            cleanerWork[entry.cleaner_id].work_count += 1;
        });

        // Obtener facturas del período
        const invoices = await base44.asServiceRole.entities.Invoice.filter({});
        const periodInvoices = invoices.filter(invoice => {
            if (!invoice.period_start || !invoice.period_end) return false;
            const invoiceStart = new Date(invoice.period_start);
            const invoiceEnd = new Date(invoice.period_end);
            return invoiceStart <= periodEnd && invoiceEnd >= periodStart;
        });

        const cleanersWithInvoices = new Set(periodInvoices.map(inv => inv.cleaner_id));

        // Obtener usuarios limpiadores
        const users = await base44.asServiceRole.entities.User.list();
        const cleaners = users.filter(u => u.role !== 'admin');

        // Identificar limpiadores que necesitan recordatorio
        const remindersToSend = [];
        
        Object.entries(cleanerWork).forEach(([cleanerId, workData]) => {
            if (!cleanersWithInvoices.has(cleanerId)) {
                const cleaner = cleaners.find(c => c.id === cleanerId);
                if (cleaner && cleaner.email && cleaner.active !== false) {
                    remindersToSend.push({
                        cleaner,
                        workData,
                        periodLabel
                    });
                }
            }
        });

        // Obtener configuración de emails del admin
        let emailConfig;
        try {
            const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
            const adminUser = admins?.[0];
            emailConfig = adminUser?.email_config || {};
        } catch {
            emailConfig = {};
        }

        // Plantilla de email por defecto EN INGLÉS (SIN la línea de horas pendientes)
        const defaultTemplate = `Hello {cleaner_name}!

The period of {period_label} has ended and we detected that you have registered work that has not yet been included in a payment report.

Please log in to the application and generate your payment report as soon as possible to process your payment.

If you have any questions, do not hesitate to contact us.

Thank you for your excellent work!

RedOak Cleaning Solutions`;

        const emailTemplate = emailConfig.reminder_template || defaultTemplate;

        // Enviar recordatorios
        const results = [];
        
        for (const { cleaner, workData, periodLabel } of remindersToSend) {
            try {
                // Usar invoice_name si está disponible, sino full_name
                const cleanerName = cleaner.invoice_name || cleaner.full_name;
                
                const personalizedMessage = emailTemplate
                    .replace(/\{cleaner_name\}/g, cleanerName)
                    .replace(/\{period_label\}/g, periodLabel)
                    .replace(/\{total_hours\}/g, workData.total_hours.toFixed(1))
                    .replace(/\{total_amount\}/g, workData.total_amount.toFixed(2))
                    .replace(/\{work_count\}/g, workData.work_count);

                // Convertir a HTML para preservar formato
                const htmlMessage = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                    </head>
                    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        ${textToHtml(personalizedMessage)}
                    </body>
                    </html>
                `;

                await base44.asServiceRole.integrations.Core.SendEmail({
                    to: cleaner.email,
                    subject: `Reminder: Generate your payment report - ${periodLabel}`,
                    body: htmlMessage,
                    from_name: 'RedOak Cleaning Solutions'
                });

                results.push({
                    success: true,
                    cleaner_name: cleanerName,
                    email: cleaner.email,
                    hours: workData.total_hours
                });
            } catch (error) {
                results.push({
                    success: false,
                    cleaner_name: cleaner.invoice_name || cleaner.full_name,
                    email: cleaner.email,
                    error: error.message
                });
            }
        }

        return new Response(JSON.stringify({
            success: true,
            period: periodLabel,
            reminders_sent: results.filter(r => r.success).length,
            errors: results.filter(r => !r.success).length,
            details: results
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error sending payment reminders:', error);
        return new Response(JSON.stringify({ 
            error: error.message,
            stack: error.stack 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});
