import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { differenceInMinutes } from 'npm:date-fns@2.30.0';

/**
 * Función de Auditoría de Entradas de Trabajo
 * 
 * Analiza la relación entre Schedule (servicios completados) y WorkEntry
 * para identificar discrepancias, entradas faltantes o duplicadas.
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verificar que el usuario es administrador
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ 
                success: false,
                error: 'Unauthorized: Solo administradores pueden acceder a la auditoría' 
            }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const requestData = await req.json();
        const { 
            startDate, 
            endDate, 
            cleanerIds, 
            clientIds,
            discrepancyType 
        } = requestData;

        console.log('[auditWorkEntries] 🔍 Iniciando auditoría con filtros:', { startDate, endDate, cleanerIds, clientIds, discrepancyType });

        // 1. OBTENER TODOS LOS DATOS NECESARIOS
        const [allSchedules, allWorkEntries, allUsers] = await Promise.all([
            base44.asServiceRole.entities.Schedule.list(),
            base44.asServiceRole.entities.WorkEntry.list(),
            base44.asServiceRole.entities.User.list()
        ]);

        console.log(`[auditWorkEntries] 📊 Datos obtenidos: ${allSchedules.length} schedules, ${allWorkEntries.length} work entries, ${allUsers.length} users`);

        // 2. FILTRAR SCHEDULES SEGÚN CRITERIOS
        let filteredSchedules = allSchedules.filter(s => {
            // Solo servicios completados
            if (s.status !== 'completed') return false;

            // Filtro por rango de fechas
            if (startDate && endDate) {
                const scheduleDate = new Date(s.start_time);
                const start = new Date(startDate);
                const end = new Date(endDate);
                if (scheduleDate < start || scheduleDate > end) return false;
            }

            // Filtro por limpiadores
            if (cleanerIds && cleanerIds.length > 0) {
                if (!s.cleaner_ids || !s.cleaner_ids.some(id => cleanerIds.includes(id))) {
                    return false;
                }
            }

            // Filtro por clientes
            if (clientIds && clientIds.length > 0) {
                if (!clientIds.includes(s.client_id)) return false;
            }

            return true;
        });

        console.log(`[auditWorkEntries] ✅ ${filteredSchedules.length} schedules después de filtros`);

        // 3. AUDITAR CADA SCHEDULE
        const auditResults = [];

        for (const schedule of filteredSchedules) {
            const auditResult = await auditSchedule(schedule, allWorkEntries, allUsers, base44);
            
            // Aplicar filtro de tipo de discrepancia si existe
            if (discrepancyType && discrepancyType !== 'all') {
                if (auditResult.status !== discrepancyType) {
                    continue;
                }
            }

            auditResults.push(auditResult);
        }

        console.log(`[auditWorkEntries] ✅ Auditoría completada: ${auditResults.length} resultados`);

        // 4. ESTADÍSTICAS GENERALES
        const stats = {
            total: auditResults.length,
            ok: auditResults.filter(r => r.status === 'ok').length,
            missing: auditResults.filter(r => r.status === 'missing').length,
            partial: auditResults.filter(r => r.status === 'partial').length,
            discrepancy: auditResults.filter(r => r.status === 'discrepancy').length,
        };

        return new Response(JSON.stringify({
            success: true,
            results: auditResults,
            stats: stats,
            message: `Auditoría completada: ${stats.total} servicios analizados`
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('[auditWorkEntries] ❌ Error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Error desconocido en la auditoría',
            stack: error.stack
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

/**
 * Audita un schedule individual
 */
async function auditSchedule(schedule, allWorkEntries, allUsers, base44) {
    const scheduleId = schedule.id;
    const cleanerIds = schedule.cleaner_ids || [];
    
    // Buscar WorkEntries asociadas a este schedule
    const relatedWorkEntries = allWorkEntries.filter(we => we.schedule_id === scheduleId);
    
    // Crear un mapa de cleanerId -> WorkEntry
    const workEntryMap = new Map();
    relatedWorkEntries.forEach(we => {
        if (!workEntryMap.has(we.cleaner_id)) {
            workEntryMap.set(we.cleaner_id, []);
        }
        workEntryMap.get(we.cleaner_id).push(we);
    });

    const issues = [];
    const missingCleaners = [];
    const cleanersWithWorkEntry = [];

    // Analizar cada limpiador asignado
    for (const cleanerId of cleanerIds) {
        const cleaner = allUsers.find(u => u.id === cleanerId);
        const cleanerName = cleaner ? (cleaner.display_name || cleaner.invoice_name || cleaner.full_name) : 'Limpiador desconocido';
        
        const workEntries = workEntryMap.get(cleanerId) || [];
        
        if (workEntries.length === 0) {
            // NO HAY WORKENTRY PARA ESTE LIMPIADOR
            missingCleaners.push({
                cleanerId: cleanerId,
                cleanerName: cleanerName,
                reason: 'No existe WorkEntry para este limpiador'
            });
            issues.push({
                type: 'missing',
                cleanerId: cleanerId,
                cleanerName: cleanerName,
                message: `Falta WorkEntry para ${cleanerName}`
            });
        } else if (workEntries.length > 1) {
            // HAY MÚLTIPLES WORKENTRIES (posible duplicación)
            issues.push({
                type: 'duplicate',
                cleanerId: cleanerId,
                cleanerName: cleanerName,
                count: workEntries.length,
                message: `${cleanerName} tiene ${workEntries.length} WorkEntries (posible duplicación)`
            });
            cleanersWithWorkEntry.push(cleanerId);
        } else {
            // HAY EXACTAMENTE 1 WORKENTRY - Verificar las horas
            const workEntry = workEntries[0];
            const expectedHours = calculateExpectedHours(schedule, cleanerId);
            const actualHours = workEntry.hours;

            cleanersWithWorkEntry.push(cleanerId);

            if (expectedHours !== null) {
                const hoursDiff = Math.abs(expectedHours - actualHours);
                
                // Si la diferencia es mayor a 15 minutos (0.25 horas)
                if (hoursDiff > 0.25) {
                    issues.push({
                        type: 'hours_discrepancy',
                        cleanerId: cleanerId,
                        cleanerName: cleanerName,
                        expectedHours: expectedHours,
                        actualHours: actualHours,
                        difference: hoursDiff,
                        message: `${cleanerName}: Horas esperadas ${expectedHours.toFixed(2)}h, registradas ${actualHours.toFixed(2)}h (diferencia: ${hoursDiff.toFixed(2)}h)`
                    });
                }
            }
        }
    }

    // Determinar el estado general del schedule
    let status = 'ok';
    if (missingCleaners.length > 0) {
        if (missingCleaners.length === cleanerIds.length) {
            status = 'missing'; // Faltan TODAS las WorkEntries
        } else {
            status = 'partial'; // Faltan ALGUNAS WorkEntries
        }
    } else if (issues.some(i => i.type === 'duplicate' || i.type === 'hours_discrepancy')) {
        status = 'discrepancy'; // Hay discrepancias en horas o duplicaciones
    }

    return {
        scheduleId: scheduleId,
        clientName: schedule.client_name,
        clientId: schedule.client_id,
        serviceDate: schedule.start_time,
        cleanersAssigned: cleanerIds.length,
        cleanersWithWorkEntry: cleanersWithWorkEntry.length,
        missingCleaners: missingCleaners,
        issues: issues,
        status: status, // 'ok', 'missing', 'partial', 'discrepancy'
        workEntries: relatedWorkEntries.map(we => ({
            id: we.id,
            cleanerId: we.cleaner_id,
            cleanerName: we.cleaner_name,
            hours: we.hours,
            totalAmount: we.total_amount,
            invoiced: we.invoiced
        }))
    };
}

/**
 * Calcula las horas esperadas para un limpiador en un schedule
 */
function calculateExpectedHours(schedule, cleanerId) {
    // 1. Intentar obtener de cleaner_schedules (horarios individuales)
    if (schedule.cleaner_schedules && Array.isArray(schedule.cleaner_schedules)) {
        const cleanerSchedule = schedule.cleaner_schedules.find(cs => cs.cleaner_id === cleanerId);
        if (cleanerSchedule && cleanerSchedule.start_time && cleanerSchedule.end_time) {
            const start = new Date(cleanerSchedule.start_time);
            const end = new Date(cleanerSchedule.end_time);
            const minutes = differenceInMinutes(end, start);
            return Math.round((minutes / 60) * 4) / 4; // Redondear a 0.25
        }
    }

    // 2. Intentar obtener de clock_in_data (tiempo real trabajado)
    if (schedule.clock_in_data && Array.isArray(schedule.clock_in_data)) {
        const clockData = schedule.clock_in_data.find(cd => cd.cleaner_id === cleanerId);
        if (clockData && clockData.clock_in_time && clockData.clock_out_time) {
            const start = new Date(clockData.clock_in_time);
            const end = new Date(clockData.clock_out_time);
            const minutes = differenceInMinutes(end, start);
            return Math.round((minutes / 60) * 4) / 4;
        }
    }

    // 3. Usar el horario general del schedule (menos preciso)
    if (schedule.start_time && schedule.end_time) {
        const start = new Date(schedule.start_time);
        const end = new Date(schedule.end_time);
        const minutes = differenceInMinutes(end, start);
        return Math.round((minutes / 60) * 4) / 4;
    }

    return null; // No se pudo calcular
}