import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { recipients, subject, html } = await req.json();

        if (!recipients || recipients.length === 0) {
            return Response.json({ error: 'No recipients provided' }, { status: 400 });
        }

        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

        await Promise.all(recipients.map(to =>
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