
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { addWeeks, addMonths, startOfDay } from 'npm:date-fns@2.30.0';

// Esta función está diseñada para ser llamada desde el frontend justo después de crear
// o actualizar una cita con una regla de recurrencia.
// Genera las futuras instances de esa cita para los próximos meses.

async function generarCitasFuturas(base44, citaOriginal, monthsToGenerate) {
    const { recurrence_rule } = citaOriginal;
    if (!recurrence_rule || recurrence_rule === 'none') {
        return [];
    }

    // Usar el ID de la cita original como ID de la serie, o crear uno nuevo si no existe.
    const recurrenceId = citaOriginal.recurrence_id || citaOriginal.id;
    
    // Actualizar la cita original para que tenga el recurrence_id si aún no lo tiene
    if (!citaOriginal.recurrence_id) {
        await base44.asServiceRole.entities.Schedule.update(citaOriginal.id, { recurrence_id: recurrenceId });
    }

    // --- Anti-Duplication Logic ---
    // Fetch existing schedules for this series to prevent duplicates
    const existingSchedules = await base44.asServiceRole.entities.Schedule.filter({ recurrence_id: recurrenceId });
    // Create a set of start dates (ignoring time) for quick lookups
    const existingStartDays = new Set(existingSchedules.map(s => startOfDay(new Date(s.start_time)).toISOString()));

    const schedulesToCreate = []; // Almacena las citas a crear antes de la inserción masiva
    const createdSchedules = []; // Almacena las citas creadas con éxito

    let fechaInicioActual = new Date(citaOriginal.start_time);
    let fechaFinActual = new Date(citaOriginal.end_time);

    // NUEVO: Capturar snapshots de precio y GST del original
    const priceSnapshot = citaOriginal.service_price_snapshot;
    const gstSnapshot = citaOriginal.gst_type_snapshot;
    console.log('[generarCitasFuturas] 📸 Snapshots a copiar:', { precio: priceSnapshot, gst: gstSnapshot });

    // Definir cuántas citas generar. 'monthsToGenerate' viene del request, con un valor por defecto.
    // Iteraremos un número suficiente de veces para cubrir el periodo, y la lógica de fecha
    // decidirá si se crea una nueva cita. monthsToGenerate * 4 es un límite superior para
    // cubrir todas las frecuencias (semanal, quincenal, etc.) hasta el periodo deseado.
    const maxIterations = monthsToGenerate * 4; 
    const generationLimitDate = addMonths(new Date(citaOriginal.start_time), monthsToGenerate);

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
                // Si la regla de recurrencia no es reconocida, no generar más.
                console.warn(`[generarCitasFuturas] Regla de recurrencia desconocida: ${recurrence_rule}. Deteniendo generación.`);
                return createdSchedules; // Retornar lo que se haya generado hasta ahora.
        }

        // Si la próxima cita generada excede el límite de tiempo, detener la generación.
        if (siguienteInicio > generationLimitDate) {
            break;
        }

        // --- IDEMPOTENCY CHECK ---
        // Check if a schedule for this day in the series already exists.
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
            // NUEVO: Copiar snapshots de precio y GST
            service_price_snapshot: priceSnapshot,
            gst_type_snapshot: gstSnapshot,
        };
        delete nuevaCita.id; // Eliminar el ID para que se genere uno nuevo

        // Lógica para copiar y ajustar los horarios de los limpiadores (cleaner_schedules)
        if (citaOriginal.cleaner_schedules && citaOriginal.cleaner_schedules.length > 0) {
            const originalScheduleStart = new Date(citaOriginal.start_time);
            
            nuevaCita.cleaner_schedules = citaOriginal.cleaner_schedules.map(cs => {
                const csOriginalStart = new Date(cs.start_time);
                const csOriginalEnd = new Date(cs.end_time);

                // Calcular el desplazamiento del horario del limpiador con respecto al inicio de la cita original
                const offsetMsFromMainStart = csOriginalStart.getTime() - originalScheduleStart.getTime();
                // Calcular la duración del horario original del limpiador
                const csDurationMs = csOriginalEnd.getTime() - csOriginalStart.getTime();

                // Aplicar este desplazamiento al nuevo tiempo de inicio de la cita recurrente
                const csNewStart = new Date(siguienteInicio.getTime() + offsetMsFromMainStart);
                const csNewEnd = new Date(csNewStart.getTime() + csDurationMs);

                return {
                    cleaner_id: cs.cleaner_id,
                    start_time: csNewStart.toISOString(),
                    end_time: csNewEnd.toISOString()
                };
            });
        }

        schedulesToCreate.push(nuevaCita); // Añadir a la lista para creación masiva
        
        // Actualizar las fechas base para la siguiente iteración
        fechaInicioActual = siguienteInicio;
        fechaFinActual = siguienteFin;
    }

    // Crear todas las citas recolectadas
    for (const scheduleData of schedulesToCreate) {
        try {
            const creada = await base44.asServiceRole.entities.Schedule.create(scheduleData);
            if (creada) {
                createdSchedules.push(creada);
            }
        } catch (e) {
            console.error(`Error creando cita recurrente: ${e.message}`);
            // Continuar con la siguiente aunque una falle
        }
    }
    
    return createdSchedules;
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

        // Llamar a la función actualizada
        const nuevasCitas = await generarCitasFuturas(base44, citaOriginal, months);
        
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
