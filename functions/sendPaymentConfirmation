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
        // Verificar autenticación
        if (!(await base44.auth.isAuthenticated())) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const body = await req.json();
        const { invoice_id, cleaner_email, cleaner_name, total_amount, period_label } = body;

        if (!invoice_id || !cleaner_email || !cleaner_name || !total_amount) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Obtener configuración de emails del admin
        let emailConfig;
        try {
            const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
            const adminUser = admins?.[0];
            emailConfig = adminUser?.email_config || {};
        } catch {
            emailConfig = {};
        }

        // Plantilla de email por defecto EN INGLÉS
        const defaultTemplate = `Hello {cleaner_name}!

We are pleased to inform you that your payment has been processed successfully.

💰 Payment details:
• Period: {period_label}
• Amount: ${'{total_amount}'} AUD
• Processing date: {payment_date}

The payment should be reflected in your bank account within 1-2 business days.

If you have any questions about this payment, do not hesitate to contact us.

Thank you for being part of the RedOak team!

RedOak Cleaning Solutions`;

        const emailTemplate = emailConfig.payment_confirmation_template || defaultTemplate;

        const personalizedMessage = emailTemplate
            .replace(/\{cleaner_name\}/g, cleaner_name)
            .replace(/\{period_label\}/g, period_label || 'Period not specified')
            .replace(/\{total_amount\}/g, parseFloat(total_amount).toFixed(2))
            .replace(/\{payment_date\}/g, new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            }));

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
            to: cleaner_email,
            subject: `Payment Confirmation - $${parseFloat(total_amount).toFixed(2)} AUD`,
            body: htmlMessage,
            from_name: 'RedOak Cleaning Solutions'
        });

        return new Response(JSON.stringify({
            success: true,
            message: 'Payment confirmation sent successfully',
            sent_to: cleaner_email
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error sending payment confirmation:', error);
        return new Response(JSON.stringify({ 
            error: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});