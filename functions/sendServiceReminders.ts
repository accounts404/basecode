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

        // Verificar si viene con force=true para saltear el chequeo de hora (útil para testing)
        const url = new URL(req.url);
        const forceTest = url.searchParams.get('force') === 'true';
        const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
        const isForced = forceTest || body.force === true;

        // Solo ejecutar si estamos dentro de una ventana de 5 minutos de la hora configurada
        if (diffMinutes > 5 && !isForced) {
            log(`Not the right time. Current: ${melbourneNow.toFormat('HH:mm')}, configured: ${config.time_of_day}. Skipping.`);
            return Response.json({ message: `Not sending time. Current: ${melbourneNow.toFormat('HH:mm')}, configured: ${config.time_of_day}` });
        }
        
        if (isForced) log(`⚡ Force mode enabled - skipping time check.`);
        
        log(`It's sending time in Melbourne! (${melbourneNow.toFormat('HH:mm')})`);
        
        // 3b. Verificar que no se hayan enviado ya hoy (para evitar duplicados dentro de la ventana)
        const todayDateString = melbourneNow.toISODate();

        // 4. Calcular fecha objetivo
        const targetDateTime = melbourneNow.plus({ days: config.days_before || 1 });
        const targetDateString = targetDateTime.toISODate();
        log(`Looking for services scheduled on: ${targetDateString}`);

        // 5. Obtener servicios programados para la fecha objetivo
        // Usamos un rango amplio para capturar tanto strings UTC (con Z) como naive strings (sin Z)
        // Melbourne es UTC+10/+11, así que el día Melbourne puede abarcar hasta el día siguiente en UTC.
        // También incluimos naive strings del día objetivo (sin Z) que la BD trata como strings literales.
        const targetStartUTC = `${targetDateString}T00:00:00.000`;  // captura naive strings del día
        const targetEndUTC = `${targetDateString}T23:59:59.999Z`;   // captura hasta fin del día UTC
        
        const schedulesRaw = await base44.asServiceRole.entities.Schedule.filter({
            status: 'scheduled',
            start_time: { $gte: targetStartUTC, $lte: targetEndUTC }
        }, 'start_time', 500);
        const allSchedules = Array.isArray(schedulesRaw) ? schedulesRaw : (schedulesRaw?.items || schedulesRaw?.data || []);
        log(`Total scheduled services fetched for ${targetDateString}: ${allSchedules.length}`);

        // 6. Filtrar para fecha objetivo exacta en Melbourne (sin reminder_sent_at)
        // IMPORTANTE: strings sin 'Z' se tratan como hora Melbourne (naive local),
        // strings con 'Z' o offset se convierten normalmente.
        const scheduledForTargetDate = allSchedules.filter(s => {
            if (!s.start_time) return false;
            if (s.reminder_sent_at) return false;
            try {
                let serviceDateTime;
                if (s.start_time.endsWith('Z') || s.start_time.includes('+') || s.start_time.includes('-', 10)) {
                    // Tiene timezone explícito, convertir a Melbourne
                    serviceDateTime = DateTime.fromISO(s.start_time).setZone('Australia/Melbourne');
                } else {
                    // Sin timezone: tratar directamente como hora Melbourne
                    serviceDateTime = DateTime.fromISO(s.start_time, { zone: 'Australia/Melbourne' });
                }
                const serviceDateString = serviceDateTime.toISODate();
                return serviceDateString === targetDateString;
            } catch (e) {
                return false;
            }
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

        // 7. Obtener solo los clientes necesarios (EN PARALELO)
        const neededClientIds = [...new Set(scheduledForTargetDate.map(s => s.client_id).filter(Boolean))];
        log(`Loading ${neededClientIds.length} clients needed for reminders (parallel)`);
        const clientMap = new Map();
        const clientResults = await Promise.allSettled(
            neededClientIds.map(clientId => base44.asServiceRole.entities.Client.get(clientId))
        );
        clientResults.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                clientMap.set(neededClientIds[index], result.value);
            } else {
                log(`Could not load client ${neededClientIds[index]}`);
            }
        });
        log(`Clients loaded: ${clientMap.size}`);

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

        // 9. Enviar SMS EN PARALELO
        const _rn = new Date();
        const reminderTs = `${_rn.getFullYear()}-${String(_rn.getMonth()+1).padStart(2,'0')}-${String(_rn.getDate()).padStart(2,'0')}T${String(_rn.getHours()).padStart(2,'0')}:${String(_rn.getMinutes()).padStart(2,'0')}:00.000`;

        const sendResults = await Promise.allSettled(
            scheduledForTargetDate.map(async (schedule) => {
                const client = clientMap.get(schedule.client_id);
                if (!client || !client.mobile_number) {
                    return { schedule_id: schedule.id, status: 'skipped', reason: 'no client or phone' };
                }

                const phoneNumber = formatAustralianPhoneNumber(client.mobile_number);
                const secondaryPhoneNumber = client.secondary_mobile_number
                    ? formatAustralianPhoneNumber(client.secondary_mobile_number)
                    : null;

                if (!phoneNumber) {
                    return { schedule_id: schedule.id, status: 'skipped', reason: 'invalid phone format' };
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

                // Enviar al número principal y secundario en paralelo
                const smsTasks = [twilioClient.messages.create({ body: messageBody, from: twilioPhone, to: phoneNumber })];
                if (secondaryPhoneNumber) {
                    smsTasks.push(twilioClient.messages.create({ body: messageBody, from: twilioPhone, to: secondaryPhoneNumber }));
                }

                const smsResults = await Promise.allSettled(smsTasks);
                const primaryOk = smsResults[0].status === 'fulfilled';

                if (primaryOk) {
                    log(`✅ SMS sent to ${phoneNumber} for ${client.name} (schedule ${schedule.id})`);
                } else {
                    log(`❌ ERROR sending to ${phoneNumber}: ${smsResults[0].reason?.message}`);
                }

                const sentToAtLeastOne = smsResults.some(r => r.status === 'fulfilled');

                if (sentToAtLeastOne) {
                    await base44.asServiceRole.entities.Schedule.update(schedule.id, { reminder_sent_at: reminderTs });
                }

                return {
                    schedule_id: schedule.id,
                    client: client.name,
                    phone: phoneNumber,
                    status: sentToAtLeastOne ? 'sent' : 'error'
                };
            })
        );

        const results = sendResults.map(r => r.status === 'fulfilled' ? r.value : { status: 'error', error: r.reason?.message });
        const sentCount = results.filter(r => r.status === 'sent').length;

        log(`Process finished. Sent ${sentCount} reminders.`);
        return Response.json({ success: true, reminders_sent: sentCount, target_date: targetDateString, results });

    } catch (error) {
        log(`FATAL ERROR: ${error.message}`);
        return Response.json({ error: error.message }, { status: 500 });
    }
});