import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

        // Obtener tipo de actividad del cliente y todos los limpiadores EN PARALELO
        const cleanerIds = schedule.cleaner_ids || [];

        const [clientResult, ...cleanerResults] = await Promise.all([
            base44.entities.Client.get(schedule.client_id).catch(() => null),
            ...cleanerIds.map(id => base44.entities.User.get(id).catch(() => null))
        ]);

        const clientActivity = clientResult?.client_type || 'domestic';

        console.log('=== processScheduleForWorkEntries ===');
        console.log('Schedule ID:', scheduleId, '| Mode:', mode);
        console.log('Client:', schedule.client_name, '| Activity:', clientActivity);
        console.log('Cleaners:', cleanerIds.length);

        const workDateStr = schedule.start_time.slice(0, 10);
        const [, , wday] = workDateStr.split('-').map(Number);

        const isoToMinutes = (iso) => {
            if (!iso) return 0;
            return parseInt(iso.slice(11, 13)) * 60 + parseInt(iso.slice(14, 16));
        };

        // FIX: calcular entries usando los usuarios ya cargados en paralelo
        const calculateWorkEntries = () => {
            const entries = [];

            cleanerIds.forEach((cleanerId, idx) => {
                const cleanerUser = cleanerResults[idx];

                if (!cleanerUser) {
                    console.log(`- SALTANDO ${cleanerId}: usuario no encontrado`);
                    return;
                }

                const individualSchedule = schedule.cleaner_schedules?.find(cs => cs.cleaner_id === cleanerId);

                if (!individualSchedule) {
                    console.log(`- SALTANDO ${cleanerId}: sin horario individual`);
                    return;
                }

                const totalMinutes = isoToMinutes(individualSchedule.end_time) - isoToMinutes(individualSchedule.start_time);
                const cleanerHours = totalMinutes / 60;

                if (cleanerHours <= 0) {
                    console.log(`- SALTANDO ${cleanerId}: horas <= 0`);
                    return;
                }

                let cleanerRate = 0;
                if (cleanerUser?.rate_history?.length > 0) {
                    const effectiveRate = cleanerUser.rate_history
                        .filter(rh => rh.effective_date <= workDateStr)
                        .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
                    if (effectiveRate) {
                        cleanerRate = effectiveRate.rate;
                    }
                }

                if (cleanerRate === 0) {
                    console.log(`- SALTANDO ${cleanerId}: tarifa = 0`);
                    return;
                }

                console.log(`- ${cleanerUser.full_name}: ${cleanerHours}h @ $${cleanerRate}/h`);

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
            });

            return entries;
        };

        if (mode === 'preview') {
            const previewEntries = calculateWorkEntries();
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
            const entriesToCreate = calculateWorkEntries();

            // FIX: verificar duplicados en paralelo
            const existingChecks = await Promise.all(
                entriesToCreate.map(entryData =>
                    base44.entities.WorkEntry.filter({
                        schedule_id: scheduleId,
                        cleaner_id: entryData.cleaner_id
                    }).catch(() => [])
                )
            );

            const createdEntries = [];
            const skippedEntries = [];

            // Crear solo las que no existen (secuencial para evitar duplicados por race condition)
            for (let i = 0; i < entriesToCreate.length; i++) {
                const entryData = entriesToCreate[i];
                const existing = existingChecks[i];

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
        return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
});