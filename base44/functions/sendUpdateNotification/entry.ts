import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';
import Twilio from 'npm:twilio@5.2.0';
import { DateTime } from 'npm:luxon@3.4.4';

// Función para formatear números australianos
const formatAustralianPhoneNumber = (phoneNumber) => {
    if (!phoneNumber) return null;
    let cleanNumber = phoneNumber.replace(/[\s\-()]/g, '');
    if (cleanNumber.startsWith('+61')) return cleanNumber;
    if (cleanNumber.startsWith('61')) return '+' + cleanNumber;
    if (cleanNumber.startsWith('0')) return '+61' + cleanNumber.substring(1);
    if (cleanNumber.length === 9) return '+61' + cleanNumber;
    return null;
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 1. Autenticar usuario que llama (debe ser admin)
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Unauthorized: Admin access required.' }), { status: 401 });
        }

        const { scheduleId } = await req.json();
        if (!scheduleId) {
            return new Response(JSON.stringify({ error: 'scheduleId is required' }), { status: 400 });
        }

        // 2. Obtener todos los datos necesarios
        const [schedule, allClients, admins, allUsers] = await Promise.all([
            base44.asServiceRole.entities.Schedule.get(scheduleId),
            base44.asServiceRole.entities.Client.list(),
            base44.asServiceRole.entities.User.filter({ role: 'admin' }),
            base44.asServiceRole.entities.User.list()
        ]);
        
        if (!schedule) {
            return new Response(JSON.stringify({ error: 'Schedule not found' }), { status: 404 });
        }

        const clientData = allClients.find(c => c.id === schedule.client_id);
        if (!clientData || !clientData.mobile_number) {
            return new Response(JSON.stringify({ error: 'Client phone number not found.' }), { status: 404 });
        }
        
        const phoneNumber = formatAustralianPhoneNumber(clientData.mobile_number);
        if (!phoneNumber) {
            return new Response(JSON.stringify({ error: `Invalid phone number format for ${clientData.mobile_number}` }), { status: 400 });
        }

        // 3. Obtener plantilla de SMS y credenciales de Twilio
        const adminUser = admins[0];
        const defaultTemplate = `Hi {client_name}, your RedOak service has been updated. New details:\nDate: {service_date}\nTime: {service_time}.\nPlease contact us if you have any questions.`;
        const messageTemplate = adminUser?.sms_templates?.service_update || defaultTemplate;

        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !twilioPhone) {
            throw new Error('Twilio service is not configured.');
        }

        // 4. Preparar y enviar el mensaje
        const serviceDateTime = DateTime.fromISO(schedule.start_time).setZone('Australia/Melbourne');
        const cleaner = allUsers.find(u => u.id === schedule.cleaner_ids[0]);
        
        // Usar sms_name si existe, sino usar name como respaldo
        const clientNameForSMS = clientData.sms_name || clientData.name;
        
        const messageBody = messageTemplate
            .replace(/\{client_name\}/g, clientNameForSMS)
            .replace(/\{cleaner_name\}/g, cleaner?.full_name || 'nuestro equipo')
            .replace(/\{service_date\}/g, serviceDateTime.toFormat('dd/MM/yy'))
            .replace(/\{service_time\}/g, serviceDateTime.toFormat('h:mm a'));

        const twilioClient = new Twilio(accountSid, authToken);
        const message = await twilioClient.messages.create({
            body: messageBody,
            from: twilioPhone,
            to: phoneNumber
        });

        // 5. Opcional: Registrar que se envió una notificación de actualización
        // (No se implementa aquí para permitir múltiples envíos si es necesario)

        return new Response(JSON.stringify({ success: true, messageSid: message.sid }), { status: 200 });

    } catch (error) {
        console.error('Error sending update notification:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});