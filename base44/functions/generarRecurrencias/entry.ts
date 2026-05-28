import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { addWeeks, addMonths } from 'npm:date-fns@2.30.0';

// Formato sin timezone: YYYY-MM-DDTHH:mm:00.000
const formatLocalISO = (d) => {
    const y = d.getUTCFullYear(), mo = String(d.getUTCMonth()+1).padStart(2,'0'), dy = String(d.getUTCDate()).padStart(2,'0');
    const h = String(d.getUTCHours()).padStart(2,'0'), mi = String(d.getUTCMinutes()).padStart(2,'0');
    return `${y}-${mo}-${dy}T${h}:${mi}:00.000`;
};

// FIX: Lista explícita de campos a copiar (no spread ciego) para evitar propagar datos stale/corruptos
const buildNuevaCita = (citaOriginal, siguienteInicio, siguienteFin, recurrenceId) => ({
    client_id: citaOriginal.client_id,
    client_name: citaOriginal.client_name,
    client_address: citaOriginal.client_address,
    cleaner_ids: citaOriginal.cleaner_ids,
    cleaner_schedules: (citaOriginal.cleaner_schedules || []).map(cs => {
        // Calcular el offset de cada limpiador relativo al inicio original
        const origStart = new Date(citaOriginal.start_time);
        const origEnd = new Date(citaOriginal.end_time);
        const csStart = new Date(cs.start_time);
        const csEnd = new Date(cs.end_time);
        const startOffset = csStart - origStart;
        const endOffset = csEnd - origEnd;
        const newCsStart = new Date(siguienteInicio.getTime() + startOffset);
        const newCsEnd = new Date(siguienteFin.getTime() + endOffset);
        return {
            cleaner_id: cs.cleaner_id,
            start_time: formatLocalISO(newCsStart),
            end_time: formatLocalISO(newCsEnd),
        };
    }),
    start_time: formatLocalISO(siguienteInicio),
    end_time: formatLocalISO(siguienteFin),
    color: citaOriginal.color || null,
    status: 'scheduled',
    recurrence_rule: citaOriginal.recurrence_rule,
    recurrence_id: recurrenceId,
    notes_public: citaOriginal.notes_public || null,
    service_specific_notes: citaOriginal.service_specific_notes || null,
    structured_service_notes: citaOriginal.structured_service_notes || null,
    notes_private: citaOriginal.notes_private || null,
    // Campos que siempre deben estar limpios en nuevas citas
    clock_in_data: [],
    reconciliation_items: [],
    xero_invoiced: false,
    billed_price_snapshot: null,
    billed_gst_type_snapshot: null,
    billed_payment_method_snapshot: null,
    billed_at: null,
    on_my_way_sent_at: null,
    reminder_sent_at: null,
    photo_urls: [],
});

async function generarSiguientesCitas(base44, citaOriginal, monthsToGenerate) {
    const { recurrence_rule } = citaOriginal;
    if (!recurrence_rule || recurrence_rule === 'none') {
        return { created: [], failed: [] };
    }

    const recurrenceId = citaOriginal.recurrence_id || citaOriginal.id;
    
    if (!citaOriginal.recurrence_id) {
        await base44.asServiceRole.entities.Schedule.update(citaOriginal.id, { recurrence_id: recurrenceId });
    }

    const existingSchedules = await base44.asServiceRole.entities.Schedule.filter({ recurrence_id: recurrenceId });
    const existingStartDays = new Set(existingSchedules.map(s => (s.start_time || '').slice(0, 10)));

    const citasCreadas = [];
    const citasFallidas = [];
    let fechaInicioActual = new Date(citaOriginal.start_time);
    let fechaFinActual = new Date(citaOriginal.end_time);

    const maxIterations = monthsToGenerate * 5; // un poco de margen

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
                console.warn(`[generarSiguientesCitas] Regla desconocida: ${recurrence_rule}`);
                return { created: citasCreadas, failed: citasFallidas };
        }

        const nextDayStartISO = formatLocalISO(siguienteInicio).slice(0, 10);
        
        // Detener si ya superamos los meses solicitados
        const monthsGenerated = citasCreadas.length > 0 
            ? (siguienteInicio - new Date(citaOriginal.start_time)) / (1000 * 60 * 60 * 24 * 30)
            : 0;
        if (monthsGenerated > monthsToGenerate) break;

        if (existingStartDays.has(nextDayStartISO)) {
            fechaInicioActual = siguienteInicio;
            fechaFinActual = siguienteFin;
            continue;
        }

        const nuevaCita = buildNuevaCita(citaOriginal, siguienteInicio, siguienteFin, recurrenceId);

        try {
            const creada = await base44.asServiceRole.entities.Schedule.create(nuevaCita);
            if (creada) {
                citasCreadas.push(creada);
                existingStartDays.add(nextDayStartISO); // prevenir duplicados en misma sesión
            }
        } catch (e) {
            console.error(`[generarSiguientesCitas] Error creando cita: ${e.message}`);
            citasFallidas.push({ fecha: formatLocalISO(siguienteInicio), error: e.message });
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

        console.log('[generarRecurrencias] Parámetros:', { scheduleId, recurrenceRule, months });

        if (!scheduleId) {
            return Response.json({ success: false, error: "Se requiere scheduleId." }, { status: 400 });
        }

        const validatedMonths = Math.min(Math.max(months, 1), 12);
        const validRules = ['weekly', 'fortnightly', 'every_3_weeks', 'every_4_weeks', 'monthly', 'none'];
        
        if (recurrenceRule && !validRules.includes(recurrenceRule)) {
            return Response.json({ 
                success: false, 
                error: `Regla inválida: ${recurrenceRule}. Debe ser: ${validRules.join(', ')}` 
            }, { status: 400 });
        }

        const citaOriginal = await base44.asServiceRole.entities.Schedule.get(scheduleId);
        
        if (!citaOriginal) {
            return Response.json({ success: false, error: `No se encontró la cita: ${scheduleId}` }, { status: 404 });
        }

        if (recurrenceRule) {
            citaOriginal.recurrence_rule = recurrenceRule;
        }

        if (!citaOriginal.recurrence_rule || citaOriginal.recurrence_rule === 'none') {
            return Response.json({ success: false, error: 'El servicio no tiene regla de recurrencia válida' }, { status: 400 });
        }

        const resultado = await generarSiguientesCitas(base44, citaOriginal, validatedMonths);
        
        console.log(`[generarRecurrencias] Completado. Creados: ${resultado.created.length}, Fallidos: ${resultado.failed.length}`);

        return Response.json({ 
            success: true,
            created_count: resultado.created.length,
            failed_count: resultado.failed.length,
            schedules: resultado.created,
            failures: resultado.failed.length > 0 ? resultado.failed : undefined,
            message: `Se generaron ${resultado.created.length} servicios para los próximos ${validatedMonths} meses${resultado.failed.length > 0 ? ` (${resultado.failed.length} fallidos)` : ''}`
        });

    } catch (error) {
        console.error('[generarRecurrencias] Error:', error);
        return Response.json({ success: false, error: error.message || 'Error desconocido' }, { status: 500 });
    }
});