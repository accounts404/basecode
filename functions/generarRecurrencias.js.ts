
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { addWeeks, addMonths, startOfDay } from 'npm:date-fns@2.30.0';

// No se necesita date-fns-tz aquí, causando el problema de importación.
// const TIME_ZONE = 'Australia/Melbourne';

// Esta función está diseñada para ser llamada desde el frontend justo después de crear
// o actualizar una cita con una regla de recurrencia.
// Genera las futuras instances de esa cita para los próximos meses.

async function generarSiguientesCitas(base44, citaOriginal, monthsToGenerate) {
    const { recurrence_rule } = citaOriginal;
    if (!recurrence_rule || recurrence_rule === 'none') {
        return [];
    }

    // Usar el ID de la cita original como ID de la serie, o crear uno nuevo si no existe.
    const recurrenceId = citaOriginal.recurrence_id || citaOriginal.id;
    
    // Actualizar la cita original para que tenga el recurrence_id
    if (!citaOriginal.recurrence_id) {
        await base44.asServiceRole.entities.Schedule.update(citaOriginal.id, { recurrence_id: recurrenceId });
    }

    // --- Anti-Duplication Logic ---
    // Fetch existing schedules for this series to prevent duplicates
    const existingSchedules = await base44.asServiceRole.entities.Schedule.filter({ recurrence_id: recurrenceId });
    // Create a set of start dates (ignoring time) for quick lookups
    const existingStartDays = new Set(existingSchedules.map(s => startOfDay(new Date(s.start_time)).toISOString()));

    const citasCreadas = [];
    let fechaInicioActual = new Date(citaOriginal.start_time);
    let fechaFinActual = new Date(citaOriginal.end_time);

    // Definir cuántas citas generar. 'monthsToGenerate' viene del request, con un valor por defecto.
    // Iteraremos un número suficiente de veces para cubrir el periodo, y la lógica de fecha
    // decidirá si se crea una nueva cita. monthsToGenerate * 4 es un límite superior para
    // cubrir todas las frecuencias (semanal, quincenal, etc.).
    const maxIterations = monthsToGenerate * 4; 

    for (let i = 0; i < maxIterations; i++) {
        let siguienteInicio;
        let siguienteFin;

        // Utilizamos recurrence_rule de la cita original (que ya podría haber sido actualizada
        // con el valor del frontend si se proveyó en la llamada a Deno.serve)
        switch (recurrence_rule) {
            case 'weekly':
                siguienteInicio = addWeeks(fechaInicioActual, 1);
                siguienteFin = addWeeks(fechaFinActual, 1);
                break;
            case 'fortnightly':
                siguienteInicio = addWeeks(fechaInicioActual, 2);
                siguienteFin = addWeeks(fechaFinActual, 2);
                break;
            case 'every_3_weeks': // Nueva regla de recurrencia
                siguienteInicio = addWeeks(fechaInicioActual, 3);
                siguienteFin = addWeeks(fechaFinActual, 3);
                break;
            case 'every_4_weeks': // NUEVO: Soporte para cada 4 semanas
                siguienteInicio = addWeeks(fechaInicioActual, 4);
                siguienteFin = addWeeks(fechaFinActual, 4);
                break;
            case 'monthly':
                // Según la outline, ahora se usa addMonths en lugar de addWeeks(4)
                siguienteInicio = addMonths(fechaInicioActual, 1);
                siguienteFin = addMonths(fechaFinActual, 1);
                break;
            default:
                // Si la regla de recurrencia no es reconocida, no generar más.
                console.warn(`[generarSiguientesCitas] Regla de recurrencia desconocida: ${recurrence_rule}. Deteniendo generación.`);
                return citasCreadas;
        }

        // --- IDEMPOTENCY CHECK ---
        // Check if a service for this day in the series already exists.
        const nextDayStartISO = startOfDay(siguienteInicio).toISOString();
        if (existingStartDays.has(nextDayStartISO)) {
            // Update dates for next loop iteration but skip creation.
            fechaInicioActual = siguienteInicio;
            fechaFinActual = siguienteFin;
            continue; // Skip to the next iteration
        }

        // Crear la nueva cita
        const nuevaCita = {
            ...citaOriginal,
            start_time: siguienteInicio.toISOString(),
            end_time: siguienteFin.toISOString(),
            status: 'scheduled',
            recurrence_id: recurrenceId, // Asegurar que todas las citas de la serie tengan el mismo ID
            clock_in_data: [],
        };
        delete nuevaCita.id; // Eliminar el ID para que se genere uno nuevo

        try {
            const creada = await base44.asServiceRole.entities.Schedule.create(nuevaCita);
            if (creada) {
                citasCreadas.push(creada);
            }
        } catch (e) {
            console.error(`Error creando cita recurrente: ${e.message}`);
            // Continuar con la siguiente aunque una falle
        }
        
        // Actualizar las fechas base para la siguiente iteración
        fechaInicioActual = siguienteInicio;
        fechaFinActual = siguienteFin;
    }
    
    return citasCreadas;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Ahora esperamos recibir scheduleId, recurrenceRule y months desde el frontend
        // Se añade un valor por defecto de 6 meses si no se especifica.
        const requestData = await req.json();
        const { scheduleId, recurrenceRule, months = 6 } = requestData;

        console.log('[generarRecurrencias] Parámetros recibidos:', { scheduleId, recurrenceRule, months });

        if (!scheduleId) {
            throw new Error("Se requiere scheduleId para generar recurrencias.");
        }

        // Obtener la cita base usando el scheduleId
        const citaOriginal = await base44.asServiceRole.entities.Schedule.get(scheduleId);
        
        if (!citaOriginal) {
            throw new Error(`No se encontró la cita con ID: ${scheduleId}`);
        }

        console.log('[generarRecurrencias] Cita base obtenida:', citaOriginal.client_name, citaOriginal.start_time);

        // Si se proporciona recurrenceRule desde el frontend, usarla para la generación.
        // Esto sobrescribe temporalmente la regla de la cita original para el propósito de la generación.
        if (recurrenceRule) {
            citaOriginal.recurrence_rule = recurrenceRule;
        }

        const nuevasCitas = await generarSiguientesCitas(base44, citaOriginal, months);
        
        console.log(`[generarRecurrencias] Proceso completado. Se crearon ${nuevasCitas.length} citas futuras.`);

        return new Response(JSON.stringify({ 
            success: true,
            created_count: nuevasCitas.length,
            schedules: nuevasCitas 
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('[generarRecurrencias] Error:', error);
        return new Response(JSON.stringify({ 
            success: false,
            error: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});
