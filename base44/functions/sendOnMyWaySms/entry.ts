import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';
import Twilio from 'npm:twilio@5.2.0';

// Función para formatear números australianos al formato internacional
const formatAustralianPhoneNumber = (phoneNumber) => {
    if (!phoneNumber) return null;
    
    // Remover espacios, guiones y paréntesis
    let cleanNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
    
    // Si ya tiene código de país (+61 o 61), devolverlo tal como está
    if (cleanNumber.startsWith('+61')) {
        return cleanNumber;
    }
    if (cleanNumber.startsWith('61') && cleanNumber.length >= 10) {
        return '+' + cleanNumber;
    }
    
    // Si empieza con 0 (formato local australiano), reemplazar por +61
    if (cleanNumber.startsWith('0')) {
        return '+61' + cleanNumber.substring(1);
    }
    
    // Si es un número de 9 dígitos sin 0 al inicio, agregar +61
    if (cleanNumber.length === 9 && /^\d+$/.test(cleanNumber)) {
        return '+61' + cleanNumber;
    }
    
    // Si no coincide con ningún formato conocido, intentar agregar +61
    if (/^\d+$/.test(cleanNumber) && cleanNumber.length >= 8) {
        return '+61' + cleanNumber;
    }
    
    return null; // Formato no reconocido
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // 1. Autenticar usuario que hace la llamada
        const callingUser = await base44.auth.me();
        if (!callingUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const { scheduleId, estimatedArrivalMinutes } = await req.json();
        if (!scheduleId) {
            return new Response(JSON.stringify({ error: 'scheduleId is required' }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // 2. Obtener datos con rol de servicio
        const [schedule, allClients, admins] = await Promise.all([
            base44.asServiceRole.entities.Schedule.get(scheduleId),
            base44.asServiceRole.entities.Client.list(),
            base44.asServiceRole.entities.User.filter({ role: 'admin' }),
        ]);
        
        if (!schedule) {
            return new Response(JSON.stringify({ error: 'Schedule not found' }), { 
                status: 404, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }
        
        const clientData = allClients.find(c => c.id === schedule.client_id);
        if (!clientData || !clientData.mobile_number) {
            return new Response(JSON.stringify({ error: 'Client phone number not found.' }), { 
                status: 404, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        if (schedule.on_my_way_sent_at) {
             return new Response(JSON.stringify({ error: '"On my way" notification already sent.' }), { 
                status: 409, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // 3. Obtener plantilla de SMS y definir mensaje por defecto
        const adminUser = admins[0];
        const defaultTemplate = estimatedArrivalMinutes 
            ? `Hi {client_name}, your RedOak cleaner, {cleaner_name}, is on the way and will arrive in approximately {eta_minutes} minutes. See you soon!`
            : `Hi {client_name}, your RedOak cleaner, {cleaner_name}, is on the way to your service. See you soon!`;
        
        const messageTemplate = adminUser?.sms_templates?.on_my_way || defaultTemplate;

        // 4. Formatear números de teléfono (principal y secundario)
        const formattedPhoneNumber = formatAustralianPhoneNumber(clientData.mobile_number);
        const formattedSecondaryNumber = clientData.secondary_mobile_number 
            ? formatAustralianPhoneNumber(clientData.secondary_mobile_number) 
            : null;

        if (!formattedPhoneNumber) {
            return new Response(JSON.stringify({ 
                error: `Invalid phone number format: ${clientData.mobile_number}. Please use Australian format (e.g., 0412345678 or +61412345678)` 
            }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        console.log(`Primary phone: ${clientData.mobile_number}, Formatted: ${formattedPhoneNumber}`);
        if (formattedSecondaryNumber) {
            console.log(`Secondary phone: ${clientData.secondary_mobile_number}, Formatted: ${formattedSecondaryNumber}`);
        }

        // 5. Obtener credenciales de Twilio
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !twilioPhone) {
            console.error('Twilio credentials are not set in environment variables.');
            return new Response(JSON.stringify({ error: 'Twilio service is not configured.' }), { 
                status: 500, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const twilioClient = new Twilio(accountSid, authToken);

        // 6. Construir el mensaje reemplazando variables
        const cleanerName = callingUser.invoice_name || callingUser.full_name;
        
        // Usar sms_name si existe, sino usar name como respaldo
        const clientNameForSMS = clientData.sms_name || clientData.name;
        
        let messageBody = messageTemplate
            .replace(/\{client_name\}/g, clientNameForSMS)
            .replace(/\{cleaner_name\}/g, cleanerName);
        
        // Reemplazar tiempo estimado si está disponible
        if (estimatedArrivalMinutes) {
            messageBody = messageBody.replace(/\{eta_minutes\}/g, estimatedArrivalMinutes.toString());
        }

        console.log(`Mensaje: ${messageBody}`);

        // 7. Enviar SMS a ambos números
        const messageSids = [];
        const phonesUsed = [];
        let errors = [];

        // Enviar al número principal
        try {
            const message = await twilioClient.messages.create({
                body: messageBody,
                from: twilioPhone,
                to: formattedPhoneNumber
            });
            messageSids.push(message.sid);
            phonesUsed.push(formattedPhoneNumber);
            console.log(`SMS enviado exitosamente al número principal. SID: ${message.sid}`);
        } catch (error) {
            console.error(`Error enviando SMS al número principal: ${error.message}`);
            errors.push(`Error al enviar al número principal: ${error.message}`);
        }

        // Enviar al número secundario si existe
        if (formattedSecondaryNumber) {
            try {
                const secondaryMessage = await twilioClient.messages.create({
                    body: messageBody,
                    from: twilioPhone,
                    to: formattedSecondaryNumber
                });
                messageSids.push(secondaryMessage.sid);
                phonesUsed.push(formattedSecondaryNumber);
                console.log(`SMS enviado exitosamente al número secundario. SID: ${secondaryMessage.sid}`);
            } catch (error) {
                console.error(`Error enviando SMS al número secundario: ${error.message}`);
                errors.push(`Error al enviar al número secundario: ${error.message}`);
            }
        }

        // Verificar si al menos un mensaje se envió correctamente
        if (messageSids.length === 0) {
            return new Response(JSON.stringify({ 
                error: 'No se pudo enviar el mensaje a ningún número', 
                details: errors 
            }), { 
                status: 500, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // 8. Actualizar el servicio para marcar la notificación como enviada
        const _n = new Date();
        const now = `${_n.getFullYear()}-${String(_n.getMonth()+1).padStart(2,'0')}-${String(_n.getDate()).padStart(2,'0')}T${String(_n.getHours()).padStart(2,'0')}:${String(_n.getMinutes()).padStart(2,'0')}:00.000`;
        const updatedSchedule = await base44.asServiceRole.entities.Schedule.update(scheduleId, {
            on_my_way_sent_at: now,
            estimated_arrival_minutes: estimatedArrivalMinutes || null
        });

        // 9. Devolver éxito
        return new Response(JSON.stringify({ 
            success: true, 
            messageSids,
            updatedSchedule,
            phonesUsed,
            estimatedArrivalMinutes,
            errors: errors.length > 0 ? errors : null
        }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
        });

    } catch (error) {
        console.error('Error sending "On my way" SMS:', error);
        
        // Manejar errores específicos de Twilio
        if (error.code) {
            let errorMessage = `Twilio Error (${error.code}): ${error.message}`;
            if (error.code === 21211) {
                errorMessage = 'Invalid phone number format. Please check the client\'s mobile number.';
            } else if (error.code === 21614) {
                errorMessage = 'Invalid sender phone number. Please check Twilio configuration.';
            }
            
            return new Response(JSON.stringify({ error: errorMessage }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }
        
        const errorMessage = error.message || 'An internal error occurred.';
        return new Response(JSON.stringify({ error: errorMessage }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
});