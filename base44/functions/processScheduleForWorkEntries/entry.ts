import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req).asServiceRole;

    try {
        const authUser = await createClientFromRequest(req).auth.me();
        if (!authUser) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { scheduleId, mode = 'preview' } = await req.json();

        if (!scheduleId) {
            return Response.json({ error: 'scheduleId is required' }, { status: 400 });
        }

        const schedule = await base44.entities.Schedule.get(scheduleId);

        if (!schedule) {
            return Response.json({ error: 'Schedule not found' }, { status: 404 });
        }

        // Obtener tipo de actividad del cliente
        let clientActivity = 'domestic';
        try {
            const client = await base44.entities.Client.get(schedule.client_id);
            if (client?.client_type) {
                clientActivity = client.client_type;
            }
        } catch {
            console.log('No se pudo obtener cliente, usando "domestic"');
        }

        console.log('=== processScheduleForWorkEntries ===');
        console.log('Schedule ID:', scheduleId);
        console.log('Mode:', mode);
        console.log('Client:', schedule.client_name);
        console.log('Client activity:', clientActivity);
        console.log('Cleaners:', schedule.cleaner_ids?.length || 0);

        const workDateStr = schedule.start_time.slice(0, 10);
        const [wyear, wmonth, wday] = workDateStr.split('-').map(Number);

        const isoToMinutes = (iso) => {
            if (!iso) return 0;
            return parseInt(iso.slice(11, 13)) * 60 + parseInt(iso.slice(14, 16));
        };

        const calculateWorkEntries = async () => {
            const entries = [];

            for (const cleanerId of (schedule.cleaner_ids || [])) {
                console.log(`\n>>> Limpiador: ${cleanerId}`);

                const individualSchedule = schedule.cleaner_schedules?.find(cs => cs.cleaner_id === cleanerId);

                if (!individualSchedule) {
                    console.log('- SALTANDO: sin horario individual');
                    continue;
                }

                const totalMinutes = isoToMinutes(individualSchedule.end_time) - isoToMinutes(individualSchedule.start_time);
                const cleanerHours = totalMinutes / 60;

                console.log('- Horas:', cleanerHours);

                if (cleanerHours <= 0) {
                    console.log('- SALTANDO: horas <= 0');
                    continue;
                }

                const cleanerUser = await base44.entities.User.get(cleanerId);
                if (!cleanerUser) {
                    console.log('- SALTANDO: usuario no encontrado');
                    continue;
                }

                let cleanerRate = 0;
                if (cleanerUser?.rate_history?.length > 0) {
                    const effectiveRate = cleanerUser.rate_history
                        .filter(rh => rh.effective_date <= workDateStr)
                        .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
                    if (effectiveRate) {
                        cleanerRate = effectiveRate.rate;
                        console.log('- Tarifa:', cleanerRate);
                    }
                }

                if (cleanerRate === 0) {
                    console.log('- SALTANDO: tarifa = 0');
                    continue;
                }

                entries.push({
                    cleaner_id: cleanerId,
                    cleaner_name: cleanerUser.invoice_name || cleanerUser.full_name,
                    client_id: schedule.client_id,
                    client_name: schedule.client_name,
                    work_date: workDateStr,
                    hours: parseFloat(cleanerHours.toFixed(4)),
                    activity: clientActivity,
                    hourly_rate: cleanerRate,
                    total_amount: parseFloat((cleanerHours * cleanerRate).toFixed(2)),
                    period: `${workDateStr.slice(0, 7)}-${wday <= 15 ? '1st' : '2nd'}`,
                    invoiced: false,
                    schedule_id: scheduleId,
                });
            }

            return entries;
        };

        if (mode === 'preview') {
            const previewEntries = await calculateWorkEntries();
            return Response.json({
                success: true,
                preview_entries: previewEntries,
                schedule: {
                    client_name: schedule.client_name,
                    service_date: workDateStr,
                    start_time: schedule.start_time.slice(11, 16),
                    end_time: schedule.end_time.slice(11, 16),
                    client_activity_type: clientActivity
                }
            });

        } else if (mode === 'create') {
            console.log('\n=== MODO CREATE ===');
            const entriesToCreate = await calculateWorkEntries();
            const createdEntries = [];
            const skippedEntries = [];

            for (const entryData of entriesToCreate) {
                const existing = await base44.entities.WorkEntry.filter({
                    schedule_id: scheduleId,
                    cleaner_id: entryData.cleaner_id
                });

                if (existing.length > 0) {
                    console.log(`- Ya existe WorkEntry para ${entryData.cleaner_name}`);
                    skippedEntries.push({
                        cleaner_id: entryData.cleaner_id,
                        cleaner_name: entryData.cleaner_name,
                        reason: 'Ya existe WorkEntry',
                        existing_id: existing[0].id
                    });
                    continue;
                }

                const newEntry = await base44.entities.WorkEntry.create(entryData);
                console.log(`- ✅ WorkEntry creada: ${newEntry.id}`);
                createdEntries.push(newEntry);
            }

            console.log('Creadas:', createdEntries.length, '| Omitidas:', skippedEntries.length);

            return Response.json({
                success: true,
                message: `Se crearon ${createdEntries.length} entradas.${skippedEntries.length > 0 ? ` Se omitieron ${skippedEntries.length} que ya existían.` : ''}`,
                created_entries: createdEntries.length,
                skipped_entries: skippedEntries.length,
                work_entries: createdEntries,
                skipped_details: skippedEntries
            });
        }

        return Response.json({ error: 'Invalid mode' }, { status: 400 });

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
        return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
});