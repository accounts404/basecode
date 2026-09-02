/**
 * Envía un SMS individual usando la API REST de Twilio directamente con fetch().
 *
 * No usa el SDK npm:twilio (la v5.x falla en el runtime de Deno con
 * "Unsupported cache mode: default"). Sigue el mismo patrón que sendBulkCasualSMS.
 *
 * Credenciales leídas de las variables de entorno:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 *
 * @param to   Número destino en formato E.164 (ej. +61412345678)
 * @param body  Texto del mensaje
 * @returns { sid, status } si Twilio acepta el envío
 * @throws Error si Twilio no responde correctamente (mensaje de error incluido)
 */
export async function sendTwilioSms(
  to: string,
  body: string
): Promise<{ sid: string; status: string }> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio service is not configured.');
  }

  const auth = btoa(`${accountSid}:${authToken}`);
  const formData = new URLSearchParams();
  formData.append('From', fromNumber);
  formData.append('To', to);
  formData.append('Body', body);

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    { method: 'POST', headers: { Authorization: `Basic ${auth}` }, body: formData }
  );

  const data = await res.json();
  if (!res.ok || !data.sid) {
    const errMsg = data.message || data.error_message || `Twilio HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  return { sid: data.sid, status: data.status };
}