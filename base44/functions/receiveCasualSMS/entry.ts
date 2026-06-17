import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Twilio sends form-encoded data via POST
    const formData = await req.formData();
    const fromNumber = formData.get('From')?.trim();
    const body = formData.get('Body')?.trim();
    const messageSid = formData.get('MessageSid');

    if (!fromNumber || !body) {
      return new Response('', { status: 200 });
    }

    // Normalizar número: +61 4XX XXX XXX → +614XXXXXXXX
    const normalized = fromNumber.replace(/\s+/g, '');

    // Buscar casual por número de teléfono
    const casuals = await base44.asServiceRole.entities.CasualCleaner.filter({});

    let matchedCasual = null;
    for (const c of casuals) {
      if (!c.phone_number) continue;
      const casualPhone = c.phone_number.replace(/\s+/g, '');
      // Comparar últimos 9 dígitos para manejar variaciones de formato
      if (normalized.slice(-9) === casualPhone.slice(-9)) {
        matchedCasual = c;
        break;
      }
    }

    if (matchedCasual) {
      await base44.asServiceRole.entities.CasualMessage.create({
        casual_cleaner_id: matchedCasual.id,
        casual_cleaner_name: matchedCasual.full_name,
        direction: 'incoming',
        content: body,
        status: 'received',
        twilio_sid: messageSid || null,
      });

      await base44.asServiceRole.entities.CasualCleaner.update(matchedCasual.id, {
        last_contacted_at: new Date().toISOString(),
        status: matchedCasual.status === 'nuevo' ? 'contactado' : matchedCasual.status,
      });
    }

    // Respuesta vacía para Twilio (no enviamos respuesta automática)
    return new Response('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('Error en webhook SMS:', error);
    return new Response('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
});