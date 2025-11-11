import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { addWeeks, addMonths, startOfDay } from 'npm:date-fns@2.30.0';

// Genera servicios recurrentes futuros a partir de un servicio base
async function generarSiguientesCitas(base44, citaOriginal, monthsToGenerate) {
    const { recurrence_rule } = citaOriginal;
    if (!recurrence_rule || recurrence_rule === 'none') {
        return { created: [], failed: [] };
    }

    // Usar el ID de la cita original como ID de la serie, o crear uno nuevo si no existe
    const recurrenceId = citaOriginal.recurrence_id || citaOriginal.id;
    
    // Actualizar la cita original para que tenga el recurrence_id
    if (!citaOriginal.recurrence_id) {
        await base44.asServiceRole.entities.Schedule.update(citaOriginal.id, { recurrence_id: recurrenceId });
    }

    // Prevención de duplicados: Obtener servicios existentes de la serie
    const existingSchedules = await base44.asServiceRole.entities.Schedule.filter({ recurrence_id: recurrenceId });
    const existingStartDays = new Set(existingSchedules.map(s => startOfDay(new Date(s.start_time)).toISOString()));

    const citasCreadas = [];
    const citasFallidas = [];
    let fechaInicioActual = new Date(citaOriginal.start_time);
    let fechaFinActual = new Date(citaOriginal.end_time);

    // Calcular iteraciones según meses solicitados
    const maxIterations = monthsToGenerate * 4;

    for (let i = 0; i < maxIterations; i++) {
        let siguienteInicio;
        let siguienteFin;

        // Calcular siguiente fecha según regla de recurrencia
        switch (recurrence_rule) {
            case 'weekly':
                siguienteInicio = addWeeks(fechaInicioActual, 1);
                siguienteFin = addWeeks(fechaFinActual, 1);
                break;
            case 'fortnightly':
                siguienteInicio = addWeeks(fechaInicioActual, 2);
                siguienteFin = addWeeks(fechaFinActual, 2);
                break;
            case 'every_3_weeks':
                siguienteInicio = addWeeks(fechaInicioActual, 3);
                siguienteFin = addWeeks(fechaFinActual, 3);
                break;
            case 'every_4_weeks':
                siguienteInicio = addWeeks(fechaInicioActual, 4);
                siguienteFin = addWeeks(fechaFinActual, 4);
                break;
            case 'monthly':
                siguienteInicio = addMonths(fechaInicioActual, 1);
                siguienteFin = addMonths(fechaFinActual, 1);
                break;
            default:
                console.warn(`[generarSiguientesCitas] Regla de recurrencia desconocida: ${recurrence_rule}. Deteniendo generación.`);
                return { created: citasCreadas, failed: citasFallidas };
        }

        // Verificación de duplicados
        const nextDayStartISO = startOfDay(siguienteInicio).toISOString();
        if (existingStartDays.has(nextDayStartISO)) {
            fechaInicioActual = siguienteInicio;
            fechaFinActual = siguienteFin;
            continue;
        }

        // Crear nueva cita limpia
        const nuevaCita = {
            ...citaOriginal,
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
            if (creada) {
                citasCreadas.push(creada);
            }
        } catch (e) {
            console.error(`[generarSiguientesCitas] Error creando cita recurrente: ${e.message}`);
            citasFallidas.push({
                fecha: siguienteInicio.toISOString(),
                error: e.message
            });
        }
        
        fechaInicioActual = siguienteInicio;
        fechaFinActual = siguienteFin;
    }
    
    return { created: citasCreadas, failed: citasFallidas };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const requestData = await req.json();
        const { scheduleId, recurrenceRule, months = 6 } = requestData;

        console.log('[generarRecurrencias] 🚀 Parámetros recibidos:', { scheduleId, recurrenceRule, months });

        // VALIDACIÓN MEJORADA
        if (!scheduleId) {
            return new Response(JSON.stringify({ 
                success: false,
                error: "Se requiere scheduleId para generar recurrencias."
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Validar months está en rango razonable
        const validatedMonths = Math.min(Math.max(months, 1), 12);
        if (validatedMonths !== months) {
            console.warn(`[generarRecurrencias] ⚠️ Months ajustado de ${months} a ${validatedMonths}`);
        }

        // Validar recurrenceRule si se proporciona
        const validRules = ['weekly', 'fortnightly', 'every_3_weeks', 'every_4_weeks', 'monthly', 'none'];
        if (recurrenceRule && !validRules.includes(recurrenceRule)) {
            return new Response(JSON.stringify({ 
                success: false,
                error: `Regla de recurrencia inválida: ${recurrenceRule}. Debe ser una de: ${validRules.join(', ')}`
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Obtener la cita base
        const citaOriginal = await base44.asServiceRole.entities.Schedule.get(scheduleId);
        
        if (!citaOriginal) {
            return new Response(JSON.stringify({ 
                success: false,
                error: `No se encontró la cita con ID: ${scheduleId}`
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        console.log('[generarRecurrencias] ✅ Cita base obtenida:', citaOriginal.client_name, citaOriginal.start_time);

        // Si se proporciona recurrenceRule desde el frontend, usarla
        if (recurrenceRule) {
            citaOriginal.recurrence_rule = recurrenceRule;
        }

        // Verificar que tenga una regla de recurrencia válida
        if (!citaOriginal.recurrence_rule || citaOriginal.recurrence_rule === 'none') {
            return new Response(JSON.stringify({ 
                success: false,
                error: 'El servicio no tiene una regla de recurrencia válida'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Generar recurrencias
        const resultado = await generarSiguientesCitas(base44, citaOriginal, validatedMonths);
        
        console.log(`[generarRecurrencias] ✅ Proceso completado. Creados: ${resultado.created.length}, Fallidos: ${resultado.failed.length}`);

        return new Response(JSON.stringify({ 
            success: true,
            created_count: resultado.created.length,
            failed_count: resultado.failed.length,
            schedules: resultado.created,
            failures: resultado.failed.length > 0 ? resultado.failed : undefined,
            message: `Se generaron ${resultado.created.length} servicios para los próximos ${validatedMonths} meses${resultado.failed.length > 0 ? ` (${resultado.failed.length} fallidos)` : ''}`
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('[generarRecurrencias] ❌ Error:', error);
        return new Response(JSON.stringify({ 
            success: false,
            error: error.message || 'Error desconocido al generar recurrencias'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});