import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';
import { format, differenceInMinutes } from 'npm:date-fns@2.30.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    try {
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const { mode = 'diagnose', dateFrom, dateTo } = await req.json();

        console.log(`[RepairWorkEntries] Modo: ${mode}, Desde: ${dateFrom}, Hasta: ${dateTo}`);

        // Obtener todos los servicios completados en el rango de fechas
        const allSchedules = await base44.entities.Schedule.list();
        
        let schedulesToCheck = allSchedules.filter(schedule => 
            schedule.status === 'completed'
        );

        // Filtrar por fechas si se proporcionan
        if (dateFrom) {
            const fromDate = new Date(dateFrom);
            schedulesToCheck = schedulesToCheck.filter(schedule => 
                new Date(schedule.start_time) >= fromDate
            );
        }
        
        if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999); // Final del día
            schedulesToCheck = schedulesToCheck.filter(schedule => 
                new Date(schedule.start_time) <= toDate
            );
        }

        console.log(`[RepairWorkEntries] Servicios completados encontrados: ${schedulesToCheck.length}`);

        // Obtener todas las WorkEntry existentes
        const allWorkEntries = await base44.entities.WorkEntry.list();
        
        // Identificar servicios completados sin WorkEntry
        const missingWorkEntries = [];
        
        for (const schedule of schedulesToCheck) {
            // Verificar si ya existen WorkEntry para este servicio
            const existingEntries = allWorkEntries.filter(we => we.schedule_id === schedule.id);
            const expectedEntries = schedule.cleaner_ids?.length || 0;
            
            if (existingEntries.length < expectedEntries) {
                // Identificar qué limpiadores no tienen WorkEntry
                const missingCleaners = schedule.cleaner_ids.filter(cleanerId => 
                    !existingEntries.some(we => we.cleaner_id === cleanerId)
                );
                
                console.log(`[RepairWorkEntries] Servicio ${schedule.id} (${schedule.client_name}) - Faltan ${missingCleaners.length} WorkEntry`);
                
                missingWorkEntries.push({
                    schedule,
                    missingCleaners,
                    existingEntries: existingEntries.length,
                    expectedEntries
                });
            }
        }

        if (mode === 'diagnose') {
            // Solo diagnóstico - reportar problemas encontrados
            const report = missingWorkEntries.map(item => ({
                schedule_id: item.schedule.id,
                client_name: item.schedule.client_name,
                service_date: format(new Date(item.schedule.start_time), 'yyyy-MM-dd'),
                missing_entries: item.missingCleaners.length,
                existing_entries: item.existingEntries,
                expected_entries: item.expectedEntries,
                cleaner_ids: item.schedule.cleaner_ids
            }));

            console.log(`[RepairWorkEntries] Diagnóstico completado. Problemas encontrados: ${report.length}`);

            return new Response(JSON.stringify({ 
                success: true, 
                mode: 'diagnose',
                issues_found: report.length,
                missing_work_entries: report
            }), { headers: { 'Content-Type': 'application/json' } });

        } else if (mode === 'repair') {
            // Modo reparación - crear las WorkEntry faltantes
            const repairedEntries = [];
            const errors = [];

            for (const item of missingWorkEntries) {
                const { schedule, missingCleaners } = item;
                
                try {
                    const workDate = new Date(schedule.start_time);

                    for (const cleanerId of missingCleaners) {
                        try {
                            // Calcular horas trabajadas
                            let cleanerHours = 0;
                            let startTime, endTime;

                            const individualSchedule = schedule.cleaner_schedules?.find(cs => cs.cleaner_id === cleanerId);
                            
                            if (individualSchedule) {
                                startTime = new Date(individualSchedule.start_time);
                                endTime = new Date(individualSchedule.end_time);
                            } else {
                                startTime = new Date(schedule.start_time);
                                endTime = new Date(schedule.end_time);
                            }

                            cleanerHours = Math.round((differenceInMinutes(endTime, startTime) / 60) * 4) / 4;
                            
                            if (cleanerHours <= 0) {
                                console.warn(`[RepairWorkEntries] Horas calculadas <= 0 para ${cleanerId} en servicio ${schedule.id}`);
                                continue;
                            }

                            // Obtener tarifa del limpiador
                            const cleanerUser = await base44.entities.User.get(cleanerId);
                            let cleanerRate = 0;
                            
                            if (cleanerUser?.rate_history?.length > 0) {
                                const effectiveRate = cleanerUser.rate_history
                                    .filter(rh => new Date(rh.effective_date) <= workDate)
                                    .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date))[0];
                                if (effectiveRate) cleanerRate = effectiveRate.rate;
                            }

                            if (cleanerRate === 0) {
                                console.warn(`[RepairWorkEntries] Tarifa = 0 para ${cleanerId} en servicio ${schedule.id}`);
                                errors.push({
                                    schedule_id: schedule.id,
                                    cleaner_id: cleanerId,
                                    error: 'Tarifa no encontrada o es cero'
                                });
                                continue;
                            }

                            // Crear WorkEntry
                            const workEntryData = {
                                cleaner_id: cleanerId,
                                cleaner_name: cleanerUser.invoice_name || cleanerUser.full_name,
                                client_id: schedule.client_id,
                                client_name: schedule.client_name,
                                work_date: format(workDate, 'yyyy-MM-dd'),
                                hours: cleanerHours,
                                activity: 'domestic',
                                hourly_rate: cleanerRate,
                                total_amount: cleanerHours * cleanerRate,
                                period: `${format(workDate, 'yyyy-MM')}-${workDate.getDate() <= 15 ? '1st' : '2nd'}`,
                                invoiced: false,
                                schedule_id: schedule.id,
                            };

                            const newEntry = await base44.entities.WorkEntry.create(workEntryData);
                            repairedEntries.push({
                                schedule_id: schedule.id,
                                client_name: schedule.client_name,
                                cleaner_name: workEntryData.cleaner_name,
                                work_entry_id: newEntry.id,
                                hours: cleanerHours,
                                amount: cleanerHours * cleanerRate
                            });

                            console.log(`[RepairWorkEntries] WorkEntry creada: ${newEntry.id} para ${workEntryData.cleaner_name}`);

                        } catch (cleanerError) {
                            console.error(`[RepairWorkEntries] Error creando WorkEntry para ${cleanerId}:`, cleanerError);
                            errors.push({
                                schedule_id: schedule.id,
                                cleaner_id: cleanerId,
                                error: cleanerError.message
                            });
                        }
                    }

                } catch (scheduleError) {
                    console.error(`[RepairWorkEntries] Error procesando servicio ${schedule.id}:`, scheduleError);
                    errors.push({
                        schedule_id: schedule.id,
                        error: scheduleError.message
                    });
                }
            }

            console.log(`[RepairWorkEntries] Reparación completada. Entradas creadas: ${repairedEntries.length}, Errores: ${errors.length}`);

            return new Response(JSON.stringify({ 
                success: true,
                mode: 'repair',
                repaired_entries: repairedEntries.length,
                created_work_entries: repairedEntries,
                errors: errors
            }), { headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ error: 'Modo inválido' }), { 
            status: 400, 
            headers: { 'Content-Type': 'application/json' } 
        });

    } catch (error) {
        console.error('Error en repairMissingWorkEntries:', error);
        return new Response(JSON.stringify({ 
            error: error.message || 'Internal server error',
            details: error.stack
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});