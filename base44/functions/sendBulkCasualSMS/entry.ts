import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { casual_ids, message, broadcast_id } = await req.json();

    if (!casual_ids?.length || !message) {
      return Response.json({ error: 'Faltan casual_ids o message' }, { status: 400 });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !fromNumber) {
      return Response.json({ error: 'Twilio no configurado' }, { status: 500 });
    }

    const auth = btoa(`${accountSid}:${authToken}`);
    const batchId = broadcast_id || `broadcast_${Date.now()}`;
    const results = [];

    const casuals = await base44.asServiceRole.entities.CasualCleaner.filter({
      id: { $in: casual_ids }
    });

    for (const casual of casuals) {
      if (!casual.phone_number) {
        results.push({ casual_id: casual.id, name: casual.full_name, status: 'skipped', reason: 'Sin teléfono' });
        continue;
      }

      const phone = casual.phone_number.startsWith('+') ? casual.phone_number : `+61${casual.phone_number.replace(/^0/, '')}`;

      try {
        const formData = new URLSearchParams();
        formData.append('From', fromNumber);
        formData.append('To', phone);
        formData.append('Body', message);

        const twilioRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          { method: 'POST', headers: { Authorization: `Basic ${auth}` }, body: formData }
        );

        const twilioData = await twilioRes.json();

        let msgStatus = 'sent';
        if (twilioData.status === 'failed' || twilioData.status === 'undelivered') {
          msgStatus = 'failed';
        } else if (twilioData.status === 'delivered') {
          msgStatus = 'delivered';
        }

        await base44.asServiceRole.entities.CasualMessage.create({
          casual_cleaner_id: casual.id,
          casual_cleaner_name: casual.full_name,
          direction: 'outgoing',
          content: message,
          status: msgStatus,
          twilio_sid: twilioData.sid || null,
          broadcast_id: batchId,
          created_by_user_id: user.id,
        });

        results.push({
          casual_id: casual.id,
          name: casual.full_name,
          status: msgStatus,
          twilio_sid: twilioData.sid || null,
        });

        await base44.asServiceRole.entities.CasualCleaner.update(casual.id, {
          last_contacted_at: new Date().toISOString(),
        });

      } catch (err) {
        results.push({ casual_id: casual.id, name: casual.full_name, status: 'error', reason: err.message });
      }
    }

    return Response.json({ success: true, broadcast_id: batchId, results });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});