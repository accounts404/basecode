import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { format, differenceInMinutes } from 'npm:date-fns@2.30.0';

const BATCH_SIZE = 500;

// Carga todos los registros paginando para evitar timeouts con mucha data
async function loadAllPaginated(entity, sortField = '-created_date') {
    const all = [];
    let skip = 0;
    while (true) {
        const batch = await entity.list(sortField, BATCH_SIZE, skip);
        if (!Array.isArray(batch) || batch.length === 0) break;
        all.push(...batch);
        if (batch.length < BATCH_SIZE) break;
        skip += BATCH_SIZE;
    }
    return all;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { mode = 'diagnose', dateFrom, dateTo } = await req.json();

        console.log(`[RepairWorkEntries] Modo: ${mode}, Desde: ${dateFrom}, Hasta: ${dateTo}`);

        // FIX: Cargar schedules y workEntries paginados en paralelo
        const [allSchedules, allWorkEntries] = await Promise.all([
            loadAllPaginated(base44.asServiceRole.entities.Schedule, '-start_time'),
            loadAllPaginated(base44.asServiceRole.entities.WorkEntry, '-work_date'),
        ]);

        console.log(`[RepairWorkEntries] Schedules cargados: ${allSchedules.length} | WorkEntries: ${allWorkEntries.length}`);

        let schedulesToCheck = allSchedules.filter(s => s.status === 'completed');

        if (dateFrom) {
            const fromDate = new Date(dateFrom);
            schedulesToCheck = schedulesToCheck.filter(s => new Date(s.start_time) >= fromDate);
        }
        if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            schedulesToCheck = schedulesToCheck.filter(s => new Date(s.start_time) <= toDate);
        }

        console.log(`[RepairWorkEntries] Servicios completados a revisar: ${schedulesToCheck.length}`);

        // FIX: Indexar WorkEntries por schedule_id para búsqueda O(1)
        const workEntriesBySchedule = new Map();
        allWorkEntries.forEach(we => {
            if (!we.schedule_id) return;
            if (!workEntriesBySchedule.has(we.schedule_id)) {
                workEntriesBySchedule.set(we.schedule_id, []);
            }
            workEntriesBySchedule.get(we.schedule_id).push(we);
        });

        const missingWorkEntries = [];

        for (const schedule of schedulesToCheck) {
            const existingEntries = workEntriesBySchedule.get(schedule.id) || [];
            const expectedEntries = schedule.cleaner_ids?.length || 0;

            if (existingEntries.length < expectedEntries) {
                const missingCleaners = (schedule.cleaner_ids || []).filter(cleanerId =>
                    !existingEntries.some(we => we.cleaner_id === cleanerId)
                );

                if (missingCleaners.length > 0) {
                    console.log(`[RepairWorkEntries] Servicio ${schedule.id} (${schedule.client_name}) - Faltan ${missingCleaners.length} WorkEntry`);
                    missingWorkEntries.push({ schedule, missingCleaners, existingEntries: existingEntries.length, expectedEntries });
                }
            }
        }

        if (mode === 'diagnose') {
            const report = missingWorkEntries.map(item => ({
                schedule_id: item.schedule.id,
                client_name: item.schedule.client_name,
                service_date: format(new Date(item.schedule.start_time), 'yyyy-MM-dd'),
                missing_entries: item.missingCleaners.length,
                existing_entries: item.existingEntries,
                expected_entries: item.expectedEntries,
                cleaner_ids: item.missingCleaners
            }));

            console.log(`[RepairWorkEntries] Diagnóstico. Problemas: ${report.length}`);

            return Response.json({ 
                success: true, 
                mode: 'diagnose',
                issues_found: report.length,
                total_schedules_checked: schedulesToCheck.length,
                missing_work_entries: report
            });

        } else if (mode === 'repair') {
            const repairedEntries = [];
            const errors = [];

            // FIX: Precargar todos los usuarios únicos necesarios en paralelo
            const allCleanerIds = [...new Set(missingWorkEntries.flatMap(item => item.missingCleaners))];
            const cleanerUsers = await Promise.all(
                allCleanerIds.map(id => base44.asServiceRole.entities.User.get(id).catch(() => null))
            );
            const cleanerMap = new Map(allCleanerIds.map((id, idx) => [id, cleanerUsers[idx]]));

            for (const item of missingWorkEntries) {
                const { schedule, missingCleaners } = item;

                try {
                    const workDate = new Date(schedule.start_time);

                    for (const cleanerId of missingCleaners) {
                        try {
                            const individualSchedule = schedule.cleaner_schedules?.find(cs => cs.cleaner_id === cleanerId);
                            
                            let startTime, endTime;
                            if (individualSchedule) {
                                startTime = new Date(individualSchedule.start_time);
                                endTime = new Date(individualSchedule.end_time);
                            } else {
                                startTime = new Date(schedule.start_time);
                                endTime = new Date(schedule.end_time);
                            }

                            const cleanerHours = Math.round((differenceInMinutes(endTime, startTime) / 60) * 4) / 4;
                            
                            if (cleanerHours <= 0) {
                                console.warn(`[RepairWorkEntries] Horas <= 0 para ${cleanerId}`);
                                continue;
                            }

                            const cleanerUser = cleanerMap.get(cleanerId);
                            if (!cleanerUser) {
                                errors.push({ schedule_id: schedule.id, cleaner_id: cleanerId, error: 'Usuario no encontrado' });
                                continue;
                            }

                            let cleanerRate = 0;
                            if (cleanerUser?.rate_history?.length > 0) {
                                const effectiveRate = cleanerUser.rate_history
                                    .filter(rh => new Date(rh.effective_date) <= workDate)
                                    .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date))[0];
                                if (effectiveRate) cleanerRate = effectiveRate.rate;
                            }

                            if (cleanerRate === 0) {
                                errors.push({ schedule_id: schedule.id, cleaner_id: cleanerId, error: 'Tarifa no encontrada o es cero' });
                                continue;
                            }

                            const workEntryData = {
                                cleaner_id: cleanerId,
                                cleaner_name: cleanerUser.invoice_name || cleanerUser.full_name,
                                client_id: schedule.client_id,
                                client_name: schedule.client_name,
                                work_date: format(workDate, 'yyyy-MM-dd'),
                                hours: cleanerHours,
                                activity: 'domestic',
                                hourly_rate: cleanerRate,
                                total_amount: parseFloat((cleanerHours * cleanerRate).toFixed(2)),
                                period: `${format(workDate, 'yyyy-MM')}-${workDate.getDate() <= 15 ? '1st' : '2nd'}`,
                                invoiced: false,
                                schedule_id: schedule.id,
                            };

                            const newEntry = await base44.asServiceRole.entities.WorkEntry.create(workEntryData);
                            repairedEntries.push({
                                schedule_id: schedule.id,
                                client_name: schedule.client_name,
                                cleaner_name: workEntryData.cleaner_name,
                                work_entry_id: newEntry.id,
                                hours: cleanerHours,
                                amount: workEntryData.total_amount
                            });

                            console.log(`[RepairWorkEntries] WorkEntry creada: ${newEntry.id} para ${workEntryData.cleaner_name}`);

                        } catch (cleanerError) {
                            console.error(`[RepairWorkEntries] Error para ${cleanerId}:`, cleanerError.message);
                            errors.push({ schedule_id: schedule.id, cleaner_id: cleanerId, error: cleanerError.message });
                        }
                    }

                } catch (scheduleError) {
                    console.error(`[RepairWorkEntries] Error en servicio ${schedule.id}:`, scheduleError.message);
                    errors.push({ schedule_id: schedule.id, error: scheduleError.message });
                }
            }

            console.log(`[RepairWorkEntries] Reparación lista. Creadas: ${repairedEntries.length}, Errores: ${errors.length}`);

            return Response.json({ 
                success: true,
                mode: 'repair',
                repaired_entries: repairedEntries.length,
                created_work_entries: repairedEntries,
                errors
            });
        }

        return Response.json({ error: 'Modo inválido' }, { status: 400 });

    } catch (error) {
        console.error('[RepairWorkEntries] Error:', error);
        return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
});