import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { format, differenceInMinutes } from 'npm:date-fns@2.30.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req).asServiceRole;

    try {
        const authUser = await createClientFromRequest(req).auth.me();
        if (!authUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        const { scheduleId, mode = 'preview' } = await req.json();

        if (!scheduleId) {
            return new Response(JSON.stringify({ error: 'scheduleId is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const schedule = await base44.entities.Schedule.get(scheduleId);

        if (!schedule) {
            return new Response(JSON.stringify({ error: 'Schedule not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        // VERIFICACIÓN GLOBAL: Si el modo es 'create', verificar que no existan ya WorkEntries para este schedule
        if (mode === 'create') {
            console.log('=== VERIFICACIÓN DE DUPLICADOS GLOBAL ===');
            const existingEntriesForSchedule = await base44.entities.WorkEntry.filter({
                schedule_id: scheduleId
            });
            
            console.log('WorkEntries existentes para schedule_id', scheduleId, ':', existingEntriesForSchedule.length);
            
            if (existingEntriesForSchedule.length > 0) {
                console.log('⚠️ PREVENCIÓN DE DUPLICADO GLOBAL: Ya existen WorkEntries para este servicio, abortando creación');
                console.log('WorkEntries existentes:', existingEntriesForSchedule.map(e => ({
                    id: e.id,
                    cleaner_id: e.cleaner_id,
                    cleaner_name: e.cleaner_name,
                    created_date: e.created_date
                })));
                
                return new Response(JSON.stringify({ 
                    success: true,
                    message: 'Las WorkEntries ya fueron creadas previamente para este servicio.',
                    existing_entries: existingEntriesForSchedule.length,
                    note: 'No se crearon duplicados.'
                }), { headers: { 'Content-Type': 'application/json' } });
            }
            console.log('✓ Verificación global pasada: No hay WorkEntries existentes');
        }

        // Obtener información del cliente para determinar el tipo de actividad
        let clientActivity = 'domestic';
        try {
            const client = await base44.entities.Client.get(schedule.client_id);
            if (client && client.client_type) {
                clientActivity = client.client_type;
            }
        } catch (error) {
            console.log('No se pudo obtener el tipo de cliente, usando "domestic" por defecto:', error.message);
        }

        console.log('=== DEBUGGING processScheduleForWorkEntries ===');
        console.log('Schedule ID:', scheduleId);
        console.log('Mode:', mode);
        console.log('Invoked by user:', authUser.email);
        console.log('Schedule client:', schedule.client_name);
        console.log('Client activity type:', clientActivity);
        console.log('Schedule cleaner_ids:', schedule.cleaner_ids);
        console.log('Schedule cleaner_ids length:', schedule.cleaner_ids?.length || 0);
        console.log('Schedule status:', schedule.status);
        console.log('Schedule start_time:', schedule.start_time);
        console.log('Schedule end_time:', schedule.end_time);
        console.log('Schedule cleaner_schedules:', schedule.cleaner_schedules);

        const workDate = new Date(schedule.start_time);

        const calculateWorkEntries = async () => {
            const calculatedEntries = [];
            console.log('--- Iniciando calculateWorkEntries ---');
            console.log('Procesando', schedule.cleaner_ids?.length || 0, 'limpiadores');
            
            for (const cleanerId of schedule.cleaner_ids) {
                console.log(`\n>>> Procesando limpiador: ${cleanerId}`);
                
                let cleanerHours = 0;
                let cleanerRate = 0;

                const individualSchedule = schedule.cleaner_schedules?.find(cs => cs.cleaner_id === cleanerId);
                
                let startTime, endTime;
                if (individualSchedule) {
                    console.log('- Usando horario individual para', cleanerId);
                    startTime = new Date(individualSchedule.start_time);
                    endTime = new Date(individualSchedule.end_time);
                    console.log('- Start time individual:', individualSchedule.start_time);
                    console.log('- End time individual:', individualSchedule.end_time);
                } else {
                    console.log('- Usando horario general para', cleanerId);
                    startTime = new Date(schedule.start_time);
                    endTime = new Date(schedule.end_time);
                    console.log('- Start time general:', schedule.start_time);
                    console.log('- End time general:', schedule.end_time);
                }

                const totalMinutes = differenceInMinutes(endTime, startTime);
                cleanerHours = parseFloat((totalMinutes / 60).toFixed(4));
                console.log('- Minutos totales:', totalMinutes);
                console.log('- Horas calculadas (4 decimales):', cleanerHours);
                
                if (cleanerHours <= 0) {
                    console.log('- ⚠️ SALTANDO limpiador', cleanerId, '- Horas <= 0');
                    continue;
                }

                const cleanerUser = await base44.entities.User.get(cleanerId);
                console.log('- Usuario encontrado:', cleanerUser?.full_name || 'No encontrado');
                console.log('- Rate history length:', cleanerUser?.rate_history?.length || 0);
                
                if (cleanerUser?.rate_history?.length > 0) {
                    const effectiveRate = cleanerUser.rate_history
                        .filter(rh => new Date(rh.effective_date) <= workDate)
                        .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date))[0];
                    if (effectiveRate) {
                        cleanerRate = effectiveRate.rate;
                        console.log('- Tarifa efectiva encontrada:', cleanerRate, 'desde', effectiveRate.effective_date);
                    } else {
                        console.log('- ⚠️ No hay tarifa efectiva para la fecha del servicio');
                    }
                } else {
                    console.log('- ⚠️ No hay rate_history para el usuario');
                }

                if (cleanerRate === 0) {
                    console.log('- ⚠️ SALTANDO limpiador', cleanerId, '- Tarifa = 0');
                    continue;
                }

                const entryData = {
                    cleaner_id: cleanerId,
                    cleaner_name: cleanerUser.invoice_name || cleanerUser.full_name,
                    client_id: schedule.client_id,
                    client_name: schedule.client_name,
                    work_date: format(workDate, 'yyyy-MM-dd'),
                    hours: parseFloat(cleanerHours.toFixed(4)),
                    activity: clientActivity,
                    hourly_rate: cleanerRate,
                    total_amount: parseFloat((cleanerHours * cleanerRate).toFixed(2)),
                    period: `${format(workDate, 'yyyy-MM')}-${workDate.getDate() <= 15 ? '1st' : '2nd'}`,
                    invoiced: false,
                    schedule_id: scheduleId,
                };

                console.log('- ✅ Entrada preparada:', {
                    cleaner_name: entryData.cleaner_name,
                    hours: entryData.hours,
                    activity: entryData.activity,
                    hourly_rate: entryData.hourly_rate,
                    total_amount: entryData.total_amount
                });

                calculatedEntries.push(entryData);
            }
            
            console.log('--- Fin calculateWorkEntries ---');
            console.log('Total entradas calculadas:', calculatedEntries.length);
            return calculatedEntries;
        };

        if (mode === 'preview') {
            const previewEntries = await calculateWorkEntries();
            return new Response(JSON.stringify({ 
                success: true, 
                preview_entries: previewEntries,
                schedule: {
                    client_name: schedule.client_name,
                    service_date: format(workDate, 'dd/MM/yyyy'),
                    start_time: format(new Date(schedule.start_time), 'HH:mm'),
                    end_time: format(new Date(schedule.end_time), 'HH:mm'),
                    client_activity_type: clientActivity
                }
            }), { headers: { 'Content-Type': 'application/json' } });

        } else if (mode === 'create') {
            console.log('\n=== MODO CREATE - Iniciando creación ===');
            const entriesToCreate = await calculateWorkEntries();
            const createdEntries = [];
            const skippedEntries = [];

            console.log('Entradas para crear:', entriesToCreate.length);

            for (const entryData of entriesToCreate) {
                console.log(`\n>>> Creando entrada para: ${entryData.cleaner_name} (${entryData.cleaner_id})`);
                
                // VERIFICACIÓN INDIVIDUAL FINAL: Justo antes de crear, verificar que no exista
                console.log('- Ejecutando verificación individual final...');
                const finalCheck = await base44.entities.WorkEntry.filter({
                    schedule_id: scheduleId,
                    cleaner_id: entryData.cleaner_id
                });

                console.log('- Resultado verificación individual:', finalCheck.length, 'entradas encontradas');

                if (finalCheck.length > 0) {
                    console.log('- ⚠️ VERIFICACIÓN INDIVIDUAL: Ya existe WorkEntry para este limpiador en este servicio');
                    console.log('- Entrada existente:', {
                        id: finalCheck[0].id,
                        created_date: finalCheck[0].created_date,
                        hours: finalCheck[0].hours,
                        total_amount: finalCheck[0].total_amount
                    });
                    skippedEntries.push({
                        cleaner_id: entryData.cleaner_id,
                        cleaner_name: entryData.cleaner_name,
                        reason: 'Ya existe WorkEntry',
                        existing_id: finalCheck[0].id
                    });
                    continue; // Saltar a la siguiente iteración
                }

                console.log('- ✅ Verificación individual pasada, creando WorkEntry...');
                const newEntry = await base44.entities.WorkEntry.create(entryData);
                console.log('- ✅ WorkEntry creada con ID:', newEntry.id);
                createdEntries.push(newEntry);
            }

            console.log('\n=== FIN MODO CREATE ===');
            console.log('Total entradas creadas:', createdEntries.length);
            console.log('Total entradas omitidas:', skippedEntries.length);

            if (skippedEntries.length > 0) {
                console.log('Entradas omitidas:', skippedEntries);
            }

            return new Response(JSON.stringify({ 
                success: true, 
                message: `Se crearon exitosamente ${createdEntries.length} entradas de trabajo.${skippedEntries.length > 0 ? ` Se omitieron ${skippedEntries.length} entradas que ya existían.` : ''}`,
                created_entries: createdEntries.length,
                skipped_entries: skippedEntries.length,
                work_entries: createdEntries,
                skipped_details: skippedEntries
            }), { headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ error: 'Invalid mode' }), { 
            status: 400, 
            headers: { 'Content-Type': 'application/json' } 
        });

    } catch (error) {
        console.error('❌ Error en processScheduleForWorkEntries:', error);
        console.error('❌ Stack trace:', error.stack);
        return new Response(JSON.stringify({ 
            error: error.message || 'Internal server error',
            details: error.stack
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});