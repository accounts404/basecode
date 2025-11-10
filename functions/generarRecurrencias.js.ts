import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { addWeeks, addMonths, startOfDay } from 'npm:date-fns@2.30.0';

// NUEVA FUNCIÓN: Obtener precio y GST del cliente válido para una fecha específica
function getPriceAndGSTForDate(client, serviceDate) {
    if (!client || !serviceDate) {
        return {
            price: 0,
            gstType: 'inclusive'
        };
    }

    // Si el cliente tiene historial de precios, buscar el precio vigente en esa fecha
    if (client.price_history && client.price_history.length > 0) {
        // Ordenar por fecha efectiva descendente
        const sortedHistory = [...client.price_history].sort((a, b) => {
            const dateA = new Date(a.effective_date);
            const dateB = new Date(b.effective_date);
            return dateB - dateA;
        });

        // Encontrar la primera entrada cuya fecha efectiva sea <= serviceDate
        const serviceDateObj = new Date(serviceDate);
        const applicableEntry = sortedHistory.find(entry => {
            const effectiveDate = new Date(entry.effective_date);
            return effectiveDate <= serviceDateObj;
        });

        if (applicableEntry) {
            return {
                price: applicableEntry.new_price || 0,
                gstType: applicableEntry.gst_type || client.gst_type || 'inclusive'
            };
        }
    }

    // Si no hay historial o no se encontró entrada aplicable, usar valores actuales
    return {
        price: client.current_service_price || 0,
        gstType: client.gst_type || 'inclusive'
    };
}

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

    // NUEVO: Obtener el cliente completo para acceder al price_history
    const cliente = await base44.asServiceRole.entities.Client.get(citaOriginal.client_id);

    // --- Anti-Duplication Logic ---
    const existingSchedules = await base44.asServiceRole.entities.Schedule.filter({ recurrence_id: recurrenceId });
    const existingStartDays = new Set(existingSchedules.map(s => startOfDay(new Date(s.start_time)).toISOString()));

    const citasCreadas = [];
    let fechaInicioActual = new Date(citaOriginal.start_time);
    let fechaFinActual = new Date(citaOriginal.end_time);

    const maxIterations = monthsToGenerate * 4; 

    for (let i = 0; i < maxIterations; i++) {
        let siguienteInicio;
        let siguienteFin;

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
                return citasCreadas;
        }

        // --- IDEMPOTENCY CHECK ---
        const nextDayStartISO = startOfDay(siguienteInicio).toISOString();
        if (existingStartDays.has(nextDayStartISO)) {
            fechaInicioActual = siguienteInicio;
            fechaFinActual = siguienteFin;
            continue;
        }

        // NUEVO: Obtener precio y GST específico para la fecha de este servicio
        const { price, gstType } = getPriceAndGSTForDate(cliente, siguienteInicio.toISOString().substring(0, 10));

        // Crear la nueva cita
        const nuevaCita = {
            ...citaOriginal,
            start_time: siguienteInicio.toISOString(),
            end_time: siguienteFin.toISOString(),
            status: 'scheduled',
            recurrence_id: recurrenceId,
            clock_in_data: [],
            service_price_snapshot: price,     // NUEVO: Snapshot del precio
            gst_type_snapshot: gstType,        // NUEVO: Snapshot del GST
        };
        delete nuevaCita.id;

        try {
            const creada = await base44.asServiceRole.entities.Schedule.create(nuevaCita);
            if (creada) {
                citasCreadas.push(creada);
            }
        } catch (e) {
            console.error(`Error creando cita recurrente: ${e.message}`);
        }
        
        fechaInicioActual = siguienteInicio;
        fechaFinActual = siguienteFin;
    }
    
    return citasCreadas;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const requestData = await req.json();
        const { scheduleId, recurrenceRule, months = 6 } = requestData;

        console.log('[generarRecurrencias] Parámetros recibidos:', { scheduleId, recurrenceRule, months });

        if (!scheduleId) {
            throw new Error("Se requiere scheduleId para generar recurrencias.");
        }

        const citaOriginal = await base44.asServiceRole.entities.Schedule.get(scheduleId);
        
        if (!citaOriginal) {
            throw new Error(`No se encontró la cita con ID: ${scheduleId}`);
        }

        console.log('[generarRecurrencias] Cita base obtenida:', citaOriginal.client_name, citaOriginal.start_time);

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