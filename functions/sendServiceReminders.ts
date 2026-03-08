import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Twilio from 'npm:twilio@5.2.0';
import { DateTime } from 'npm:luxon@3.4.4';

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
    const base44 = createClientFromRequest(req);
    const log = (message) => console.log(`[sendServiceReminders] ${message}`);

    // --- CHEQUEO DE SEGURIDAD ---
    try {
        const providedApiKey = req.headers.get('api_key');
        const expectedApiKey = Deno.env.get('CRON_API_KEY');
        
        let isAuthorized = false;
        let executionType = '';

        if (providedApiKey && expectedApiKey && providedApiKey === expectedApiKey) {
            isAuthorized = true;
            executionType = 'cron_job';
            log('Cron job execution authorized successfully.');
        } else {
            try {
                const user = await base44.auth.me();
                if (user && user.role === 'admin') {
                    isAuthorized = true;
                    executionType = 'admin_manual';
                    log('Manual admin execution authorized successfully.');
                }
            } catch (authError) {
                log(`Authentication failed: ${authError.message}`);
            }
        }

        if (!isAuthorized) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        log(`Authorized execution type: ${executionType}`);

    } catch (e) {
        return Response.json({ error: 'Authorization error' }, { status: 400 });
    }

    try {
        log('Starting reminder check...');

        // 1. Obtener config del admin
        const adminsRaw = await base44.asServiceRole.entities.User.filter({ role: 'admin' }, '-created_date', 10);
        const admins = Array.isArray(adminsRaw) ? adminsRaw : (adminsRaw?.items || adminsRaw?.data || []);
        
        log(`Found ${admins.length} admin users`);
        
        // Buscar el admin que tiene la config de recordatorios
        const adminUser = admins.find(a => a.reminder_config?.enabled) || admins[0];
        
        if (!adminUser) {
            log('No admin user found. Skipping.');
            return Response.json({ message: 'No admin user found.' });
        }

        log(`Using admin: ${adminUser.email}`);
        log(`Reminder config: ${JSON.stringify(adminUser.reminder_config)}`);

        const config = adminUser.reminder_config;

        // 2. Verificar si está habilitado
        if (!config || !config.enabled) {
            log('Reminders are disabled in configuration. Skipping.');
            return Response.json({ message: 'Reminders disabled.' });
        }

        // 3. Verificar hora de Melbourne (hora Y minuto exactos, con ventana de ±5 min)
        const melbourneNow = DateTime.now().setZone('Australia/Melbourne');
        const [configHour, configMinute] = (config.time_of_day || '09:00').split(':').map(Number);

        const configuredMinutesOfDay = configHour * 60 + configMinute;
        const currentMinutesOfDay = melbourneNow.hour * 60 + melbourneNow.minute;
        const diffMinutes = Math.abs(currentMinutesOfDay - configuredMinutesOfDay);

        log(`Melbourne time now: ${melbourneNow.toFormat('HH:mm')}, configured: ${config.time_of_day}, diff: ${diffMinutes} min`);

        // Ejecutar si estamos dentro de una ventana de 55 minutos de la hora configurada.
        // El cron corre cada hora pero no en el minuto exacto, así que necesitamos una ventana amplia.
        // Los duplicados se evitan con el campo reminder_sent_at en cada servicio.
        if (diffMinutes > 55) {
            log(`Not the right time. Current: ${melbourneNow.toFormat('HH:mm')}, configured: ${config.time_of_day}. Skipping.`);
            return Response.json({ message: `Not sending time. Current: ${melbourneNow.toFormat('HH:mm')}, configured: ${config.time_of_day}` });
        }
        
        log(`It's sending time in Melbourne! (${melbourneNow.toFormat('HH:mm')})`);
        
        // 3b. Verificar que no se hayan enviado ya hoy (para evitar duplicados dentro de la ventana)
        const todayDateString = melbourneNow.toISODate();

        // 4. Calcular fecha objetivo
        const targetDateTime = melbourneNow.plus({ days: config.days_before || 1 });
        const targetDateString = targetDateTime.toISODate();
        log(`Looking for services scheduled on: ${targetDateString}`);

        // 5. Obtener servicios programados para la fecha objetivo
        // Hay DOS tipos de datos en la base:
        // A) "Naive con Z": start_time almacenado como hora Melbourne pero con sufijo Z (ej: 13:45Z = 1:45pm Melbourne)
        // B) "True UTC": start_time correctamente en UTC (ej: 20:15Z el día anterior = 7:15am Melbourne del día siguiente)
        //
        // Se usan TRES queries para capturar todos los casos y se deduplicán por ID:

        // Query 1 (naive con Z): cubre caso A - horas Melbourne almacenadas con Z
        const schedulesNaiveZ = await base44.asServiceRole.entities.Schedule.filter({
            status: 'scheduled',
            start_time: { $gte: `${targetDateString}T00:00:00.000Z`, $lte: `${targetDateString}T23:59:59.999Z` }
        }, 'start_time', 500);

        // Query 2 (true UTC): cubre caso B - horas Melbourne correctamente en UTC (mañanas tempranas)
        const targetDayStartUTC = targetDateTime.startOf('day').toUTC().toISO();
        const targetDayEndUTC = targetDateTime.endOf('day').toUTC().toISO();
        log(`UTC range for Melbourne ${targetDateString}: ${targetDayStartUTC} to ${targetDayEndUTC}`);
        const schedulesUTC = await base44.asServiceRole.entities.Schedule.filter({
            status: 'scheduled',
            start_time: { $gte: targetDayStartUTC, $lte: targetDayEndUTC }
        }, 'start_time', 500);

        // Query 3 (naive sin Z): cubre datos legacy sin sufijo Z
        const schedulesNaive = await base44.asServiceRole.entities.Schedule.filter({
            status: 'scheduled',
            start_time: { $gte: `${targetDateString}T00:00:00.000`, $lte: `${targetDateString}T23:59:59.999` }
        }, 'start_time', 500);

        const listNaiveZ = Array.isArray(schedulesNaiveZ) ? schedulesNaiveZ : (schedulesNaiveZ?.items || schedulesNaiveZ?.data || []);
        const listUTC = Array.isArray(schedulesUTC) ? schedulesUTC : (schedulesUTC?.items || schedulesUTC?.data || []);
        const listNaive = Array.isArray(schedulesNaive) ? schedulesNaive : (schedulesNaive?.items || schedulesNaive?.data || []);

        // Combinar y deduplicar por ID
        const seenIds = new Set();
        const allSchedules = [...listNaiveZ, ...listUTC, ...listNaive].filter(s => {
            if (seenIds.has(s.id)) return false;
            seenIds.add(s.id);
            return true;
        });
        log(`Total services fetched for ${targetDateString}: ${allSchedules.length} (naiveZ: ${listNaiveZ.length}, utc: ${listUTC.length}, naive: ${listNaive.length})`);

        // 6. Filtrar los que no tienen reminder_sent_at y verificar que la fecha sea correcta.
        // Para datos naive (con o sin Z): usar el date portion del string directamente.
        // Para true UTC: convertir a Melbourne y verificar la fecha.
        const scheduledForTargetDate = allSchedules.filter(s => {
            if (!s.start_time) return false;
            if (s.reminder_sent_at) return false;
            // Verificación 1: date portion naive (cubre caso A y legacy)
            const naiveDatePart = s.start_time.substring(0, 10);
            if (naiveDatePart === targetDateString) return true;
            // Verificación 2: conversión UTC→Melbourne (cubre caso B)
            try {
                if (s.start_time.endsWith('Z') || s.start_time.includes('+')) {
                    const melbDate = DateTime.fromISO(s.start_time).setZone('Australia/Melbourne').toISODate();
                    return melbDate === targetDateString;
                }
            } catch (e) {}
            return false;
        });

        log(`Services for ${targetDateString} needing reminder: ${scheduledForTargetDate.length}`);

        if (scheduledForTargetDate.length === 0) {
            // Log para debug: cuantos hay para esa fecha aunque ya tengan reminder
            const allForDate = allSchedules.filter(s => {
                if (!s.start_time) return false;
                try {
                    let dt;
                    if (s.start_time.endsWith('Z') || s.start_time.includes('+') || s.start_time.includes('-', 10)) {
                        dt = DateTime.fromISO(s.start_time).setZone('Australia/Melbourne');
                    } else {
                        dt = DateTime.fromISO(s.start_time, { zone: 'Australia/Melbourne' });
                    }
                    return dt.toISODate() === targetDateString;
                } catch(e) { return false; }
            });
            log(`(Debug) Total services for ${targetDateString} including already reminded: ${allForDate.length}`);
            return Response.json({ message: 'No services to remind today.', target_date: targetDateString, total_for_date: allForDate.length });
        }

        // 7. Obtener clientes
        const clientsRaw = await base44.asServiceRole.entities.Client.list('-created_date', 2000);
        const allClients = Array.isArray(clientsRaw) ? clientsRaw : (clientsRaw?.items || clientsRaw?.data || []);
        const clientMap = new Map(allClients.map(c => [c.id, c]));
        log(`Clients loaded: ${allClients.length}`);

        // 8. Credenciales Twilio
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !twilioPhone) {
            log('ERROR: Twilio credentials are not set.');
            return Response.json({ error: 'Twilio not configured.' }, { status: 500 });
        }

        const twilioClient = new Twilio(accountSid, authToken);
        const defaultTemplate = `Hi {client_name}, your cleaning service is scheduled for {service_date} at {service_time}. Call 0491829501 for any changes. Redoak Cleaning.`;
        const messageTemplate = adminUser.sms_templates?.service_reminder || defaultTemplate;

        // 9. Enviar SMS
        let sentCount = 0;
        const results = [];

        for (const schedule of scheduledForTargetDate) {
            const client = clientMap.get(schedule.client_id);
            if (!client || !client.mobile_number) {
                log(`Skipping schedule ${schedule.id}: client not found or no phone number.`);
                results.push({ schedule_id: schedule.id, status: 'skipped', reason: 'no client or phone' });
                continue;
            }

            const phoneNumber = formatAustralianPhoneNumber(client.mobile_number);
            const secondaryPhoneNumber = client.secondary_mobile_number
                ? formatAustralianPhoneNumber(client.secondary_mobile_number)
                : null;

            if (!phoneNumber) {
                log(`Skipping schedule ${schedule.id}: invalid phone format: ${client.mobile_number}`);
                results.push({ schedule_id: schedule.id, status: 'skipped', reason: 'invalid phone format' });
                continue;
            }

            const clientNameForSMS = client.sms_name || client.name;
            let serviceMelbourneTime;
            if (schedule.start_time.endsWith('Z') || schedule.start_time.includes('+') || schedule.start_time.includes('-', 10)) {
                serviceMelbourneTime = DateTime.fromISO(schedule.start_time).setZone('Australia/Melbourne');
            } else {
                serviceMelbourneTime = DateTime.fromISO(schedule.start_time, { zone: 'Australia/Melbourne' });
            }
            const messageBody = messageTemplate
                .replace(/\{client_name\}/g, clientNameForSMS)
                .replace(/\{service_date\}/g, serviceMelbourneTime.toFormat('dd/MM/yy'))
                .replace(/\{service_time\}/g, serviceMelbourneTime.toFormat('h:mm a'));

            let sentToAtLeastOne = false;

            // Enviar al número principal
            try {
                await twilioClient.messages.create({ body: messageBody, from: twilioPhone, to: phoneNumber });
                log(`✅ SMS sent to PRIMARY ${phoneNumber} for ${client.name} (schedule ${schedule.id})`);
                sentToAtLeastOne = true;
                results.push({ schedule_id: schedule.id, client: client.name, phone: phoneNumber, status: 'sent' });
            } catch (error) {
                log(`❌ ERROR sending to primary ${phoneNumber}: ${error.message}`);
                results.push({ schedule_id: schedule.id, client: client.name, phone: phoneNumber, status: 'error', error: error.message });
            }

            // Enviar al número secundario
            if (secondaryPhoneNumber) {
                try {
                    await twilioClient.messages.create({ body: messageBody, from: twilioPhone, to: secondaryPhoneNumber });
                    log(`✅ SMS sent to SECONDARY ${secondaryPhoneNumber} for ${client.name}`);
                    sentToAtLeastOne = true;
                } catch (error) {
                    log(`❌ ERROR sending to secondary ${secondaryPhoneNumber}: ${error.message}`);
                }
            }

            if (sentToAtLeastOne) {
                await base44.asServiceRole.entities.Schedule.update(schedule.id, {
                    reminder_sent_at: new Date().toISOString()
                });
                sentCount++;
            }
        }

        log(`Process finished. Sent ${sentCount} reminders.`);
        return Response.json({ success: true, reminders_sent: sentCount, target_date: targetDateString, results });

    } catch (error) {
        log(`FATAL ERROR: ${error.message}`);
        return Response.json({ error: error.message }, { status: 500 });
    }
});