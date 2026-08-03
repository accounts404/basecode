import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { recipients, subject, html } = await req.json();

        // Protección: solo administradores pueden enviar reportes de asistencia
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized: Solo administradores' }, { status: 401 });
        }

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return Response.json({ error: 'No recipients provided' }, { status: 400 });
        }

        if (!subject || typeof subject !== 'string' || subject.length > 200) {
            return Response.json({ error: 'Subject inválido' }, { status: 400 });
        }

        if (!html || typeof html !== 'string' || html.length > 50000) {
            return Response.json({ error: 'HTML inválido' }, { status: 400 });
        }

        // Whitelist de destinatarios: solo emails de usuarios registrados en la app
        const usersRaw = await base44.asServiceRole.entities.User.list();
        const users = Array.isArray(usersRaw) ? usersRaw : (usersRaw?.items || usersRaw?.data || []);
        const allowedEmails = new Set(
            users
                .map(u => (u.email || '').toLowerCase().trim())
                .filter(e => e)
        );

        const invalidRecipients = recipients.filter(
            r => !allowedEmails.has(String(r).toLowerCase().trim())
        );

        if (invalidRecipients.length > 0) {
            return Response.json({
                error: 'Destinatarios no autorizados (solo usuarios registrados)',
                invalid: invalidRecipients,
            }, { status: 403 });
        }

        const sanitizedRecipients = recipients.map(r => String(r).toLowerCase().trim());

        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

        await Promise.all(sanitizedRecipients.map(to =>
            fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: 'RedOak Cleaning Solutions <info@redoaktimes.com.au>',
                    to,
                    subject,
                    html,
                }),
            }).then(async res => {
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.message || 'Resend error');
                }
                return res.json();
            })
        ));

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});