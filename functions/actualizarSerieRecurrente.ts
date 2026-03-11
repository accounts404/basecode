import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { addWeeks, addMonths } from 'npm:date-fns@2.30.0';

// Formato sin timezone: YYYY-MM-DDTHH:mm:00.000
const formatLocalISO = (d) => {
    const y = d.getUTCFullYear(), mo = String(d.getUTCMonth()+1).padStart(2,'0'), dy = String(d.getUTCDate()).padStart(2,'0');
    const h = String(d.getUTCHours()).padStart(2,'0'), mi = String(d.getUTCMinutes()).padStart(2,'0');
    return `${y}-${mo}-${dy}T${h}:${mi}:00.000`;
};

// Función que genera las citas futuras a partir de una cita base
async function generarSiguientesCitas(base44, citaOriginal, excludeId = null) {
    const { recurrence_rule } = citaOriginal;
    if (!recurrence_rule || recurrence_rule === 'none') {
        return { created: [], failed: [] };
    }

    const citasCreadas = [];
    const citasFallidas = [];
    let fechaInicioActual = new Date(citaOriginal.start_time);
    let fechaFinActual = new Date(citaOriginal.end_time);

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

    for (let i = 0; i < limite; i++) {
        let siguienteInicio, siguienteFin;
        
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
                siguienteInicio = addWeeks(fechaInicioActual, 4);
                siguienteFin = addWeeks(fechaFinActual, 4);
                break;
            default:
                return { created: citasCreadas, failed: citasFallidas };
        }

        const nuevaCita = {
            ...citaOriginal,
            start_time: formatLocalISO(siguienteInicio),
            end_time: formatLocalISO(siguienteFin),
            status: 'scheduled',
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
            console.error(`[generarSiguientesCitas] Error creando cita: ${e.message}`);
            citasFallidas.push({
                fecha: formatLocalISO(siguienteInicio),
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
        const { scheduleId, updateScope, updatedData } = requestData;

        console.log('[actualizarSerieRecurrente] 🚀 Iniciando. Scope:', updateScope, 'ScheduleID:', scheduleId);

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

        if (!updateScope || updateScope === 'this_only') {
            return new Response(JSON.stringify({ 
                success: false,
                error: "updateScope debe ser 'this_and_future' para actualizar serie"
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
        
        // 1. Obtener el servicio original ANTES de cualquier cambio
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

        const fechaDeCorte = servicioOriginal.start_time.slice(0, 10); // YYYY-MM-DD
        console.log(`[actualizarSerieRecurrente] 🕰️ Fecha de corte: ${fechaDeCorte}`);

        // 2. Caso especial: conversión a recurrente
        if (!servicioOriginal.recurrence_id) {
            if (updatedData.recurrence_rule && updatedData.recurrence_rule !== 'none') {
                await base44.asServiceRole.entities.Schedule.update(scheduleId, { 
                    ...updatedData, 
                    recurrence_id: scheduleId 
                });
                const servicioActualizado = await base44.asServiceRole.entities.Schedule.get(scheduleId);
                const resultado = await generarSiguientesCitas(base44, servicioActualizado, scheduleId);
                
                return new Response(JSON.stringify({ 
                    success: true, 
                    message: `Servicio convertido a recurrente. Creados: ${resultado.created.length}, Fallidos: ${resultado.failed.length}`,
                    created_count: resultado.created.length,
                    failed_count: resultado.failed.length
                }), { 
                    status: 200, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }
            
            return new Response(JSON.stringify({ 
                success: true, 
                message: "Servicio único actualizado." 
            }), { 
                status: 200, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }
        
        // 3. ACTUALIZAR EL SERVICIO BASE
        await base44.asServiceRole.entities.Schedule.update(scheduleId, updatedData);
        const servicioActualizado = await base44.asServiceRole.entities.Schedule.get(scheduleId);
        console.log('[actualizarSerieRecurrente] ✅ Servicio base actualizado. Frecuencia:', servicioActualizado.recurrence_rule);

        // 4. ELIMINAR SERVICIOS FUTUROS
        const todosLosServicios = await base44.asServiceRole.entities.Schedule.filter({ 
            recurrence_id: servicioActualizado.recurrence_id 
        });

        const serviciosAEliminar = todosLosServicios.filter(s =>
            s.id !== scheduleId && 
            (s.start_time || '').slice(0, 10) >= fechaDeCorte &&
            s.status !== 'completed' // No eliminar servicios ya completados
        );
        
        console.log(`[actualizarSerieRecurrente] 🗑️ ${serviciosAEliminar.length} servicios marcados para eliminación`);
        
        let deletedCount = 0;
        if (serviciosAEliminar.length > 0) {
            const deleteResults = await Promise.allSettled(
                serviciosAEliminar.map(s => base44.asServiceRole.entities.Schedule.delete(s.id))
            );
            deletedCount = deleteResults.filter(r => r.status === 'fulfilled').length;
            const deleteFailed = deleteResults.filter(r => r.status === 'rejected').length;
            
            if (deleteFailed > 0) {
                console.warn(`[actualizarSerieRecurrente] ⚠️ ${deleteFailed} servicios no pudieron eliminarse`);
            }
        }

        // 5. REGENERAR la serie
        console.log(`[actualizarSerieRecurrente] 🔄 Regenerando serie...`);
        const resultado = await generarSiguientesCitas(base44, servicioActualizado, scheduleId);
        console.log(`[actualizarSerieRecurrente] ✨ Creados: ${resultado.created.length}, Fallidos: ${resultado.failed.length}`);

        const message = `Serie actualizada exitosamente. Eliminados: ${deletedCount}, Creados: ${resultado.created.length}${resultado.failed.length > 0 ? `, Fallidos: ${resultado.failed.length}` : ''}`;
        
        return new Response(JSON.stringify({
            success: true,
            message: message,
            deleted_count: deletedCount,
            created_count: resultado.created.length,
            failed_count: resultado.failed.length,
            failures: resultado.failed.length > 0 ? resultado.failed : undefined
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('[actualizarSerieRecurrente] ❌ Error:', error);
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