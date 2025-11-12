import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { differenceInMinutes } from 'npm:date-fns@2.30.0';
import { format } from 'npm:date-fns@2.30.0';

/**
 * Genera una WorkEntry faltante para un limpiador específico en un schedule
 * Esta función se usa desde el panel de auditoría para corregir entradas faltantes
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verificar que el usuario es administrador
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ 
                success: false,
                error: 'Unauthorized: Solo administradores pueden generar WorkEntries' 
            }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const requestData = await req.json();
        const { scheduleId, cleanerId } = requestData;

        console.log('[generateMissingWorkEntry] 🔧 Generando WorkEntry para:', { scheduleId, cleanerId });

        // VALIDACIONES
        if (!scheduleId || !cleanerId) {
            return new Response(JSON.stringify({ 
                success: false,
                error: 'Se requiere scheduleId y cleanerId' 
            }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // 1. Obtener el schedule
        const schedule = await base44.asServiceRole.entities.Schedule.get(scheduleId);
        if (!schedule) {
            return new Response(JSON.stringify({ 
                success: false,
                error: `No se encontró el servicio con ID ${scheduleId}` 
            }), { 
                status: 404, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // 2. Verificar que el servicio esté completado
        if (schedule.status !== 'completed') {
            return new Response(JSON.stringify({ 
                success: false,
                error: 'Solo se pueden generar WorkEntries para servicios completados' 
            }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // 3. Verificar que el limpiador esté asignado
        if (!schedule.cleaner_ids || !schedule.cleaner_ids.includes(cleanerId)) {
            return new Response(JSON.stringify({ 
                success: false,
                error: 'El limpiador no está asignado a este servicio' 
            }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // 4. Verificar que no exista ya un WorkEntry
        const existingWorkEntries = await base44.asServiceRole.entities.WorkEntry.filter({
            schedule_id: scheduleId,
            cleaner_id: cleanerId
        });

        if (existingWorkEntries && existingWorkEntries.length > 0) {
            return new Response(JSON.stringify({ 
                success: false,
                error: 'Ya existe un WorkEntry para este limpiador en este servicio',
                existingWorkEntry: existingWorkEntries[0]
            }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // 5. Obtener información del limpiador
        const cleaner = await base44.asServiceRole.entities.User.get(cleanerId);
        if (!cleaner) {
            return new Response(JSON.stringify({ 
                success: false,
                error: `No se encontró el limpiador con ID ${cleanerId}` 
            }), { 
                status: 404, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // 6. Calcular las horas trabajadas
        const hours = calculateWorkedHours(schedule, cleanerId);
        if (hours === null || hours <= 0) {
            return new Response(JSON.stringify({ 
                success: false,
                error: 'No se pudo calcular las horas trabajadas para este limpiador. Verifica que tenga clock in/out o un horario asignado.' 
            }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // 7. Determinar la tarifa por hora
        const hourlyRate = determineHourlyRate(cleaner, schedule);
        if (!hourlyRate || hourlyRate <= 0) {
            return new Response(JSON.stringify({ 
                success: false,
                error: 'No se pudo determinar la tarifa por hora del limpiador. Verifica su perfil y rate_history.' 
            }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // 8. Determinar la actividad
        const activity = determineActivity(schedule);

        // 9. Calcular el período de facturación
        const period = calculateBillingPeriod(schedule.start_time);

        // 10. Calcular el total
        const totalAmount = Math.round(hours * hourlyRate * 100) / 100;

        // 11. Crear el WorkEntry
        const workEntryData = {
            cleaner_id: cleanerId,
            cleaner_name: cleaner.invoice_name || cleaner.full_name,
            client_id: schedule.client_id,
            client_name: schedule.client_name,
            work_date: format(new Date(schedule.start_time), 'yyyy-MM-dd'),
            hours: hours,
            activity: activity,
            hourly_rate: hourlyRate,
            total_amount: totalAmount,
            period: period,
            schedule_id: scheduleId,
            invoiced: false,
            modified_by_cleaner: false
        };

        console.log('[generateMissingWorkEntry] 📝 Creando WorkEntry:', workEntryData);

        const createdWorkEntry = await base44.asServiceRole.entities.WorkEntry.create(workEntryData);

        console.log('[generateMissingWorkEntry] ✅ WorkEntry creada exitosamente:', createdWorkEntry.id);

        return new Response(JSON.stringify({
            success: true,
            message: `WorkEntry creada exitosamente para ${cleaner.invoice_name || cleaner.full_name}`,
            workEntry: createdWorkEntry
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('[generateMissingWorkEntry] ❌ Error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Error desconocido al generar WorkEntry',
            stack: error.stack
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

/**
 * Calcula las horas trabajadas por un limpiador
 */
function calculateWorkedHours(schedule, cleanerId) {
    // 1. Prioridad: cleaner_schedules (horarios individuales)
    if (schedule.cleaner_schedules && Array.isArray(schedule.cleaner_schedules)) {
        const cleanerSchedule = schedule.cleaner_schedules.find(cs => cs.cleaner_id === cleanerId);
        if (cleanerSchedule && cleanerSchedule.start_time && cleanerSchedule.end_time) {
            const start = new Date(cleanerSchedule.start_time);
            const end = new Date(cleanerSchedule.end_time);
            const minutes = differenceInMinutes(end, start);
            return Math.round((minutes / 60) * 4) / 4; // Redondear a 0.25
        }
    }

    // 2. Segunda prioridad: clock_in_data (tiempo real)
    if (schedule.clock_in_data && Array.isArray(schedule.clock_in_data)) {
        const clockData = schedule.clock_in_data.find(cd => cd.cleaner_id === cleanerId);
        if (clockData && clockData.clock_in_time && clockData.clock_out_time) {
            const start = new Date(clockData.clock_in_time);
            const end = new Date(clockData.clock_out_time);
            const minutes = differenceInMinutes(end, start);
            return Math.round((minutes / 60) * 4) / 4;
        }
    }

    // 3. Fallback: horario general del schedule
    if (schedule.start_time && schedule.end_time) {
        const start = new Date(schedule.start_time);
        const end = new Date(schedule.end_time);
        const minutes = differenceInMinutes(end, start);
        return Math.round((minutes / 60) * 4) / 4;
    }

    return null;
}

/**
 * Determina la tarifa por hora del limpiador en la fecha del servicio
 */
function determineHourlyRate(cleaner, schedule) {
    const serviceDate = new Date(schedule.start_time);
    
    // Si el limpiador tiene rate_history, buscar la tarifa aplicable
    if (cleaner.rate_history && Array.isArray(cleaner.rate_history) && cleaner.rate_history.length > 0) {
        // Ordenar por fecha descendente
        const sortedRates = [...cleaner.rate_history].sort((a, b) => {
            return new Date(b.effective_date) - new Date(a.effective_date);
        });

        // Buscar la tarifa vigente en la fecha del servicio
        for (const rate of sortedRates) {
            const effectiveDate = new Date(rate.effective_date);
            if (serviceDate >= effectiveDate) {
                return rate.rate;
            }
        }

        // Si no se encontró ninguna, usar la más antigua
        return sortedRates[sortedRates.length - 1].rate;
    }

    // Fallback: hourly_rate directo
    if (cleaner.hourly_rate && cleaner.hourly_rate > 0) {
        return cleaner.hourly_rate;
    }

    return null;
}

/**
 * Determina la actividad basándose en el tipo de cliente del schedule
 */
function determineActivity(schedule) {
    // Intentar obtener el tipo de cliente desde el schedule
    // Si no está disponible, usar 'domestic' por defecto
    
    // Nota: Idealmente, el schedule debería tener una referencia al tipo de cliente
    // Por ahora, usamos 'domestic' como valor por defecto seguro
    return 'domestic';
}

/**
 * Calcula el período de facturación basándose en la fecha del servicio
 */
function calculateBillingPeriod(startTime) {
    const date = new Date(startTime);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = date.getDate();

    // Determinar si es 1ra o 2da quincena
    const half = day <= 15 ? '1st' : '2nd';

    return `${year}-${month}-${half}`;
}