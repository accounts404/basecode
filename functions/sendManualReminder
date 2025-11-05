
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
        // Obtener el usuario que hace la llamada
        const callingUser = await base44.auth.me();

        // 1. Primero, verificar que haya un usuario autenticado
        if (!callingUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized: No user logged in' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 2. Segundo, verificar que el usuario sea administrador
        if (callingUser.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const body = await req.json();
        const { cleaner_ids, period_label, custom_message } = body;

        if (!cleaner_ids || !Array.isArray(cleaner_ids) || cleaner_ids.length === 0) {
            return new Response(JSON.stringify({ error: 'No cleaners specified' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Usar rol de servicio para obtener todos los usuarios y enviar emails
        const users = await base44.asServiceRole.entities.User.list();
        const cleaners = users.filter(u => cleaner_ids.includes(u.id) && u.role !== 'admin');

        if (cleaners.length === 0) {
            return new Response(JSON.stringify({ error: 'No valid cleaners found' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const results = [];

        for (const cleaner of cleaners) {
            // Usar invoice_name si está disponible, sino full_name
            const cleanerName = cleaner.invoice_name || cleaner.full_name;

            if (!cleaner.email || cleaner.active === false) {
                results.push({
                    success: false,
                    cleaner_name: cleanerName,
                    email: cleaner.email || 'No email',
                    error: 'Email not available or user inactive'
                });
                continue;
            }

            // Si hay mensaje personalizado, usarlo directamente; si no, usar mensaje por defecto en inglés
            const message = custom_message || `Hello ${cleanerName}!

We hope you are well. This is a reminder to generate your payment report for the period ${period_label || 'current period'}.

Please log in to the application when you have a moment and generate your payment report.

If you need help or have any questions, do not hesitate to contact us.

Thank you!

RedOak Cleaning Solutions`;

            try {
                // Convertir a HTML para preservar formato
                const htmlMessage = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                    </head>
                    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        ${textToHtml(message)}
                    </body>
                    </html>
                `;

                await base44.asServiceRole.integrations.Core.SendEmail({
                    to: cleaner.email,
                    subject: `Reminder: Payment Report - ${period_label || 'Current Period'}`,
                    body: htmlMessage,
                    from_name: 'RedOak Cleaning Solutions'
                });

                results.push({
                    success: true,
                    cleaner_name: cleanerName,
                    email: cleaner.email
                });
            } catch (error) {
                results.push({
                    success: false,
                    cleaner_name: cleanerName,
                    email: cleaner.email,
                    error: error.message
                });
            }
        }

        return new Response(JSON.stringify({
            success: true,
            reminders_sent: results.filter(r => r.success).length,
            errors: results.filter(r => !r.success).length,
            details: results
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error sending manual reminders:', error);
        if (error.message.includes('token')) {
             return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return new Response(JSON.stringify({ 
            error: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});
