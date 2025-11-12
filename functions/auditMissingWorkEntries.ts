import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { differenceInMinutes, format } from 'npm:date-fns@2.30.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Validación de seguridad
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ 
                success: false,
                error: 'Unauthorized: Solo administradores pueden ejecutar esta auditoría' 
            }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const requestData = await req.json();
        const { period_start, period_end, cleaner_id = null } = requestData;

        console.log('[auditMissingWorkEntries] 🔍 Iniciando auditoría...');
        console.log('Período:', period_start, 'a', period_end);
        console.log('Limpiador específico:', cleaner_id || 'Todos');

        // 1. Obtener todos los schedules completados
        const allSchedules = await base44.asServiceRole.entities.Schedule.list();
        console.log(`[auditMissingWorkEntries] 📊 Total schedules: ${allSchedules.length}`);
        
        // Filtrar localmente los completados y dentro del período
        let completedSchedules = allSchedules.filter(s => s.status === 'completed');
        
        if (period_start && period_end) {
            const periodStart = new Date(`${period_start}T00:00:00.000Z`);
            const periodEnd = new Date(`${period_end}T23:59:59.999Z`);
            
            completedSchedules = completedSchedules.filter(s => {
                const scheduleDate = new Date(s.start_time);
                return scheduleDate >= periodStart && scheduleDate <= periodEnd;
            });
        }

        console.log(`[auditMissingWorkEntries] 📊 Schedules completados en período: ${completedSchedules.length}`);

        if (completedSchedules.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                missing_entries: [],
                total_missing: 0,
                schedules_analyzed: 0,
                message: 'No se encontraron servicios completados en el período seleccionado'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 2. Obtener TODAS las WorkEntries (filtraremos localmente)
        const allWorkEntries = await base44.asServiceRole.entities.WorkEntry.list();
        console.log(`[auditMissingWorkEntries] 📝 Total WorkEntries en sistema: ${allWorkEntries.length}`);

        // Crear un índice rápido de WorkEntries por schedule_id y cleaner_id
        const workEntryIndex = new Map();
        allWorkEntries.forEach(we => {
            if (we.schedule_id && we.cleaner_id) {
                const key = `${we.schedule_id}_${we.cleaner_id}`;
                workEntryIndex.set(key, we);
            }
        });

        console.log(`[auditMissingWorkEntries] 📝 WorkEntries indexadas: ${workEntryIndex.size}`);

        // 3. Obtener información de todos los limpiadores
        const allUsers = await base44.asServiceRole.entities.User.list();
        const cleanersMap = new Map(
            allUsers
                .filter(u => u.role !== 'admin')
                .map(u => [u.id, u])
        );

        console.log(`[auditMissingWorkEntries] 👥 Limpiadores en sistema: ${cleanersMap.size}`);

        // 4. Analizar cada schedule para detectar WorkEntries faltantes
        const missingEntries = [];

        for (const schedule of completedSchedules) {
            if (!schedule.cleaner_ids || !Array.isArray(schedule.cleaner_ids)) {
                console.log(`[auditMissingWorkEntries] ⚠️ Schedule ${schedule.id} sin cleaner_ids válido`);
                continue;
            }

            const cleanerIds = schedule.cleaner_ids;
            
            // Filtro por limpiador específico si se solicitó
            const cleanersToCheck = cleaner_id 
                ? cleanerIds.filter(id => id === cleaner_id)
                : cleanerIds;

            for (const cleanerId of cleanersToCheck) {
                const cleaner = cleanersMap.get(cleanerId);
                if (!cleaner) {
                    console.warn(`[auditMissingWorkEntries] ⚠️ Limpiador ${cleanerId} no encontrado en el sistema`);
                    continue;
                }

                // Verificar si el limpiador completó el clock-in y clock-out
                const clockData = schedule.clock_in_data?.find(c => c.cleaner_id === cleanerId);
                
                if (!clockData?.clock_in_time || !clockData?.clock_out_time) {
                    // No se considera faltante si el limpiador no completó clock-in/out
                    continue;
                }

                // Verificar si existe WorkEntry
                const key = `${schedule.id}_${cleanerId}`;
                const hasWorkEntry = workEntryIndex.has(key);

                if (!hasWorkEntry) {
                    // FALTANTE DETECTADO
                    console.log(`[auditMissingWorkEntries] ❌ FALTANTE: Schedule ${schedule.id}, Limpiador ${cleaner.invoice_name || cleaner.full_name}`);

                    // Calcular horas esperadas
                    let expectedHours = 0;
                    let startTime, endTime;

                    const individualSchedule = schedule.cleaner_schedules?.find(cs => cs.cleaner_id === cleanerId);
                    if (individualSchedule) {
                        startTime = new Date(individualSchedule.start_time);
                        endTime = new Date(individualSchedule.end_time);
                    } else {
                        startTime = new Date(schedule.start_time);
                        endTime = new Date(schedule.end_time);
                    }

                    // Validar que las fechas sean válidas
                    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
                        console.warn(`[auditMissingWorkEntries] ⚠️ Fechas inválidas en schedule ${schedule.id}`);
                        continue;
                    }

                    expectedHours = Math.round((differenceInMinutes(endTime, startTime) / 60) * 4) / 4;

                    // Obtener tarifa del limpiador
                    let expectedRate = 0;
                    const workDate = new Date(schedule.start_time);
                    
                    if (cleaner.rate_history && Array.isArray(cleaner.rate_history) && cleaner.rate_history.length > 0) {
                        const effectiveRate = cleaner.rate_history
                            .filter(rh => {
                                try {
                                    return new Date(rh.effective_date) <= workDate;
                                } catch {
                                    return false;
                                }
                            })
                            .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date))[0];
                        
                        if (effectiveRate && effectiveRate.rate) {
                            expectedRate = effectiveRate.rate;
                        }
                    }

                    // Determinar tipo de actividad
                    let activityType = 'domestic';
                    if (schedule.client_id) {
                        try {
                            const client = await base44.asServiceRole.entities.Client.get(schedule.client_id);
                            if (client?.client_type) {
                                activityType = client.client_type;
                            }
                        } catch (error) {
                            console.warn(`[auditMissingWorkEntries] Error obteniendo cliente ${schedule.client_id}: ${error.message}`);
                        }
                    }

                    missingEntries.push({
                        schedule_id: schedule.id,
                        schedule_start_time: schedule.start_time,
                        client_id: schedule.client_id || '',
                        client_name: schedule.client_name || 'Cliente desconocido',
                        cleaner_id: cleanerId,
                        cleaner_name: cleaner.invoice_name || cleaner.full_name || 'Limpiador desconocido',
                        cleaner_email: cleaner.email || '',
                        expected_hours: expectedHours,
                        expected_rate: expectedRate,
                        expected_total: expectedHours * expectedRate,
                        activity_type: activityType,
                        work_date: format(workDate, 'yyyy-MM-dd'),
                        period: `${format(workDate, 'yyyy-MM')}-${workDate.getDate() <= 15 ? '1st' : '2nd'}`,
                        clock_in_time: clockData.clock_in_time,
                        clock_out_time: clockData.clock_out_time,
                    });
                }
            }
        }

        console.log(`[auditMissingWorkEntries] ✅ Auditoría completada. Faltantes encontrados: ${missingEntries.length}`);

        // Ordenar por fecha de servicio (más reciente primero)
        missingEntries.sort((a, b) => {
            try {
                return new Date(b.schedule_start_time) - new Date(a.schedule_start_time);
            } catch {
                return 0;
            }
        });

        return new Response(JSON.stringify({
            success: true,
            missing_entries: missingEntries,
            total_missing: missingEntries.length,
            schedules_analyzed: completedSchedules.length,
            message: `Se analizaron ${completedSchedules.length} servicios completados. Se encontraron ${missingEntries.length} entradas de trabajo faltantes.`
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('[auditMissingWorkEntries] ❌ Error:', error);
        console.error('[auditMissingWorkEntries] ❌ Stack:', error.stack);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Error desconocido al ejecutar la auditoría',
            details: error.stack
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});