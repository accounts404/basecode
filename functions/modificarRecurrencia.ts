import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { addWeeks, startOfDay, set } from 'npm:date-fns@3.6.0';

// Función para generar nuevas recurrencias con manejo de errores mejorado
async function generarNuevasRecurrencias(base44, citaBase) {
    const { recurrence_rule, id: baseId } = citaBase;
    if (!recurrence_rule || recurrence_rule === 'none') {
        return { created: [], failed: [] };
    }

    const recurrenceId = citaBase.recurrence_id || baseId;
    if (!citaBase.recurrence_id) {
        await base44.asServiceRole.entities.Schedule.update(baseId, { recurrence_id: recurrenceId });
    }

    const citasCreadas = [];
    const citasFallidas = [];
    const fechaBase = new Date(citaBase.start_time);
    
    // Mantener hora, minuto y segundo originales
    const horaOriginal = {
        hours: fechaBase.getUTCHours(),
        minutes: fechaBase.getUTCMinutes(),
        seconds: fechaBase.getUTCSeconds()
    };

    let fechaDeCalculo = fechaBase;

    // Límites según frecuencia
    const numSemanales = 25;
    const numQuincenales = 12;
    const numCada3Semanas = 9;
    const numCada4Semanas = 7;
    const numMensuales = 5;

    let limite = 0;
    if (recurrence_rule === 'weekly') limite = numSemanales;
    else if (recurrence_rule === 'fortnightly') limite = numQuincenales;
    else if (recurrence_rule === 'every_3_weeks') limite = numCada3Semanas;
    else if (recurrence_rule === 'every_4_weeks') limite = numCada4Semanas;
    else if (recurrence_rule === 'monthly') limite = numMensuales;

    if (limite === 0) {
        console.warn(`[generarNuevasRecurrencias] Regla desconocida: ${recurrence_rule}`);
        return { created: [], failed: [] };
    }

    for (let i = 0; i < limite; i++) {
        let siguienteFechaBase;

        // Calcular siguiente fecha base
        switch (recurrence_rule) {
            case 'weekly':
                siguienteFechaBase = addWeeks(fechaDeCalculo, 1);
                break;
            case 'fortnightly':
                siguienteFechaBase = addWeeks(fechaDeCalculo, 2);
                break;
            case 'every_3_weeks':
                siguienteFechaBase = addWeeks(fechaDeCalculo, 3);
                break;
            case 'every_4_weeks':
                siguienteFechaBase = addWeeks(fechaDeCalculo, 4);
                break;
            case 'monthly':
                siguienteFechaBase = addWeeks(fechaDeCalculo, 4);
                break;
            default:
                return { created: citasCreadas, failed: citasFallidas };
        }

        // Forzar hora original
        const siguienteInicio = set(siguienteFechaBase, horaOriginal);

        // Calcular duración del servicio original
        const duracionMs = new Date(citaBase.end_time).getTime() - new Date(citaBase.start_time).getTime();
        const siguienteFin = new Date(siguienteInicio.getTime() + duracionMs);

        const nuevaCita = {
            ...citaBase,
            start_time: siguienteInicio.toISOString(),
            end_time: siguienteFin.toISOString(),
            status: 'scheduled',
            recurrence_id: recurrenceId,
            clock_in_data: [],
            reconciliation_items: [],
            xero_invoiced: false,
            on_my_way_sent_at: null,
            reminder_sent_at: null,
        };
        delete nuevaCita.id;

        try {
            const creada = await base44.asServiceRole.entities.Schedule.create(nuevaCita);
            citasCreadas.push(creada);
        } catch (e) {
            console.error(`[generarNuevasRecurrencias] Error creando cita: ${e.message}`);
            citasFallidas.push({
                fecha: siguienteInicio.toISOString(),
                error: e.message
            });
        }
        
        fechaDeCalculo = siguienteInicio;
    }
    
    return { created: citasCreadas, failed: citasFallidas };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        // VALIDACIÓN DE SEGURIDAD
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ 
                success: false,
                error: 'Unauthorized: Solo administradores pueden modificar recurrencias' 
            }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const { scheduleId, updatedData } = await req.json();

        // VALIDACIÓN MEJORADA
        if (!scheduleId) {
            return new Response(JSON.stringify({ 
                success: false,
                error: "Se requiere scheduleId"
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!updatedData) {
            return new Response(JSON.stringify({ 
                success: false,
                error: "Se requiere updatedData"
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 1. Obtener el servicio base original
        const servicioOriginal = await base44.asServiceRole.entities.Schedule.get(scheduleId);
        if (!servicioOriginal) {
            return new Response(JSON.stringify({ 
                success: false,
                error: `No se encontró el servicio con ID ${scheduleId}`
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const oldRecurrenceId = servicioOriginal.recurrence_id;

        // 2. Actualizar el servicio que se está editando
        await base44.asServiceRole.entities.Schedule.update(scheduleId, updatedData);
        const servicioBaseActualizado = await base44.asServiceRole.entities.Schedule.get(scheduleId);

        let deletedCount = 0;
        let deleteFailedCount = 0;
        let createdCount = 0;
        let createFailedCount = 0;

        // 3. Eliminar citas futuras de la serie antigua
        if (oldRecurrenceId) {
            const allSchedules = await base44.asServiceRole.entities.Schedule.list();
            const oldSeriesSchedules = allSchedules.filter(s => s.recurrence_id === oldRecurrenceId);
            
            const fechaDeCorte = startOfDay(new Date(servicioBaseActualizado.start_time));

            const schedulesToDelete = oldSeriesSchedules.filter(s => {
                const scheduleDate = startOfDay(new Date(s.start_time));
                return scheduleDate > fechaDeCorte && 
                       s.id !== scheduleId && 
                       s.status !== 'completed';
            });

            if (schedulesToDelete.length > 0) {
                console.log(`[modificarRecurrencia] 🗑️ Eliminando ${schedulesToDelete.length} servicios antiguos...`);
                const deleteResults = await Promise.allSettled(
                    schedulesToDelete.map(s => base44.asServiceRole.entities.Schedule.delete(s.id))
                );
                deletedCount = deleteResults.filter(r => r.status === 'fulfilled').length;
                deleteFailedCount = deleteResults.filter(r => r.status === 'rejected').length;
                
                if (deleteFailedCount > 0) {
                    console.warn(`[modificarRecurrencia] ⚠️ ${deleteFailedCount} servicios no pudieron eliminarse`);
                }
            }
        }
        
        // 4. Generar nuevas citas si la regla no es 'none'
        if (servicioBaseActualizado.recurrence_rule && servicioBaseActualizado.recurrence_rule !== 'none') {
            console.log(`[modificarRecurrencia] 🔄 Generando nuevos servicios con regla: ${servicioBaseActualizado.recurrence_rule}`);
            const resultado = await generarNuevasRecurrencias(base44, servicioBaseActualizado);
            createdCount = resultado.created.length;
            createFailedCount = resultado.failed.length;
            
            if (createFailedCount > 0) {
                console.warn(`[modificarRecurrencia] ⚠️ ${createFailedCount} servicios no pudieron crearse`);
            }
        }

        const message = `Recurrencia modificada exitosamente. Eliminados: ${deletedCount}, Creados: ${createdCount}${createFailedCount > 0 ? `, Fallidos: ${createFailedCount}` : ''}`;

        return new Response(JSON.stringify({
            success: true,
            message: message,
            deletedCount,
            deleteFailedCount,
            createdCount,
            createFailedCount
        }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 200 
        });

    } catch (error) {
        console.error('[modificarRecurrencia] ❌ Error:', error);
        return new Response(JSON.stringify({ 
            success: false,
            error: error.message || 'Error desconocido',
            stack: error.stack
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});