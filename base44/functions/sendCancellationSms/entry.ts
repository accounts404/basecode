import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Twilio from 'npm:twilio@5.2.0';

const formatAustralianPhoneNumber = (phoneNumber) => {
    if (!phoneNumber) return null;
    let cleanNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (cleanNumber.startsWith('+61')) return cleanNumber;
    if (cleanNumber.startsWith('61') && cleanNumber.length >= 10) return '+' + cleanNumber;
    if (cleanNumber.startsWith('0')) return '+61' + cleanNumber.substring(1);
    if (cleanNumber.length === 9 && /^\d+$/.test(cleanNumber)) return '+61' + cleanNumber;
    if (/^\d+$/.test(cleanNumber) && cleanNumber.length >= 8) return '+61' + cleanNumber;
    return null;
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const callingUser = await base44.auth.me();
        if (!callingUser) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { scheduleId } = await req.json();
        if (!scheduleId) {
            return Response.json({ error: 'scheduleId is required' }, { status: 400 });
        }

        const [schedule, allClients, admins] = await Promise.all([
            base44.asServiceRole.entities.Schedule.get(scheduleId),
            base44.asServiceRole.entities.Client.list(),
            base44.asServiceRole.entities.User.filter({ role: 'admin' }),
        ]);

        if (!schedule) {
            return Response.json({ error: 'Schedule not found' }, { status: 404 });
        }

        const clientData = allClients.find(c => c.id === schedule.client_id);
        if (!clientData || !clientData.mobile_number) {
            return Response.json({ error: 'Client phone number not found.' }, { status: 404 });
        }

        // Get template from admin settings
        const adminUser = admins[0];
        const defaultTemplate = `Hi {client_name}, we're sorry to inform you that your RedOak cleaning service scheduled for {service_date} at {service_time} has been cancelled. Please contact us to reschedule. We apologise for any inconvenience.`;
        const messageTemplate = adminUser?.sms_templates?.cancellation || defaultTemplate;

        // Format phone numbers
        const formattedPhoneNumber = formatAustralianPhoneNumber(clientData.mobile_number);
        const formattedSecondaryNumber = clientData.secondary_mobile_number
            ? formatAustralianPhoneNumber(clientData.secondary_mobile_number)
            : null;

        if (!formattedPhoneNumber) {
            return Response.json({ error: `Invalid phone number format: ${clientData.mobile_number}` }, { status: 400 });
        }

        // Build message
        const clientNameForSMS = clientData.sms_name || clientData.name;

        // Parse date and time from schedule
        const startISO = schedule.start_time || '';
        const datePart = startISO.slice(0, 10); // YYYY-MM-DD
        const timePart = startISO.slice(11, 16); // HH:MM

        // Format date nicely
        let serviceDate = datePart;
        let serviceTime = timePart;
        try {
            const d = new Date(startISO.endsWith('Z') ? startISO : startISO + 'Z');
            const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            serviceDate = `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
            serviceTime = `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
        } catch(e) { /* use raw values */ }

        let messageBody = messageTemplate
            .replace(/\{client_name\}/g, clientNameForSMS)
            .replace(/\{service_date\}/g, serviceDate)
            .replace(/\{service_time\}/g, serviceTime);

        // Twilio credentials
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !twilioPhone) {
            return Response.json({ error: 'Twilio service is not configured.' }, { status: 500 });
        }

        const twilioClient = new Twilio(accountSid, authToken);
        const messageSids = [];
        const phonesUsed = [];
        const errors = [];

        try {
            const msg = await twilioClient.messages.create({ body: messageBody, from: twilioPhone, to: formattedPhoneNumber });
            messageSids.push(msg.sid);
            phonesUsed.push(formattedPhoneNumber);
        } catch (err) {
            errors.push(`Error al número principal: ${err.message}`);
        }

        if (formattedSecondaryNumber) {
            try {
                const msg2 = await twilioClient.messages.create({ body: messageBody, from: twilioPhone, to: formattedSecondaryNumber });
                messageSids.push(msg2.sid);
                phonesUsed.push(formattedSecondaryNumber);
            } catch (err) {
                errors.push(`Error al número secundario: ${err.message}`);
            }
        }

        if (messageSids.length === 0) {
            return Response.json({ error: 'No se pudo enviar el mensaje', details: errors }, { status: 500 });
        }

        return Response.json({ success: true, messageSids, phonesUsed, errors: errors.length > 0 ? errors : null });

    } catch (error) {
        console.error('Error sending cancellation SMS:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});