
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { addWeeks, addMonths } from 'npm:date-fns@2.30.0';

// Función que genera las citas futuras a partir de una cita base.
// No necesita cambios, su lógica es correcta.
async function generarSiguientesCitas(base44, citaOriginal, excludeId = null) {
    const { recurrence_rule } = citaOriginal;
    if (!recurrence_rule || recurrence_rule === 'none') {
        return [];
    }

    const citasCreadas = [];
    let fechaInicioActual = new Date(citaOriginal.start_time);
    let fechaFinActual = new Date(citaOriginal.end_time);

    const numSemanales = 25;
    const numQuincenales = 12;
    const numMensuales = 5;

    let limite = 0;
    if (recurrence_rule === 'weekly') limite = numSemanales;
    if (recurrence_rule === 'fortnightly') limite = numQuincenales;
    if (recurrence_rule === 'monthly') limite = numMensuales;

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
            case 'monthly':
                // CORREGIDO: Usar addWeeks(4) en lugar de addMonths para mantener el mismo día de la semana
                siguienteInicio = addWeeks(fechaInicioActual, 4);
                siguienteFin = addWeeks(fechaFinActual, 4);
                break;
            default:
                return [];
        }

        const nuevaCita = {
            ...citaOriginal,
            start_time: siguienteInicio.toISOString(),
            end_time: siguienteFin.toISOString(),
            status: 'scheduled',
            clock_in_data: [],
        };
        delete nuevaCita.id;

        try {
            const creada = await base44.asServiceRole.entities.Schedule.create(nuevaCita);
            if (creada) citasCreadas.push(creada);
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
        const { scheduleId, updateScope, updatedData } = requestData;

        console.log('[actualizarSerieRecurrente] 🚀 Iniciando. Scope:', updateScope, 'ScheduleID:', scheduleId);

        if (!scheduleId || !updateScope || updateScope === 'this_only') {
            throw new Error("Parámetros inválidos. Se requiere scheduleId y un updateScope para la serie.");
        }
        
        // 1. Obtener el servicio original ANTES de cualquier cambio para tener la fecha de corte.
        const servicioOriginal = await base44.asServiceRole.entities.Schedule.get(scheduleId);
        if (!servicioOriginal) {
            throw new Error(`No se encontró el servicio con ID ${scheduleId}`);
        }
        // NÚCLEO DE LA CORRECCIÓN: Definir la fecha de corte.
        const fechaDeCorte = new Date(servicioOriginal.start_time);
        console.log(`[actualizarSerieRecurrente] 🕰️ Fecha de corte establecida: ${fechaDeCorte.toISOString()}`);

        // 2. Si el servicio no tiene un recurrence_id, es un caso especial de conversión.
        if (!servicioOriginal.recurrence_id) {
            if (updatedData.recurrence_rule && updatedData.recurrence_rule !== 'none') {
                 await base44.asServiceRole.entities.Schedule.update(scheduleId, { ...updatedData, recurrence_id: scheduleId });
                 const servicioActualizado = await base44.asServiceRole.entities.Schedule.get(scheduleId);
                 const nuevasCitas = await generarSiguientesCitas(base44, servicioActualizado, scheduleId);
                 return new Response(JSON.stringify({ success: true, message: `Servicio convertido a recurrente. Se crearon ${nuevasCitas.length} servicios futuros.` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            // Si no, el servicio ya fue actualizado y no se hace más nada.
            return new Response(JSON.stringify({ success: true, message: "Servicio único actualizado." }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        
        // 3. ACTUALIZAR EL SERVICIO BASE
        // Este es el servicio en la "fecha de corte", que servirá de plantilla.
        await base44.asServiceRole.entities.Schedule.update(scheduleId, updatedData);
        const servicioActualizado = await base44.asServiceRole.entities.Schedule.get(scheduleId);
        console.log('[actualizarSerieRecurrente] ✅ Servicio base actualizado. Nueva frecuencia:', servicioActualizado.recurrence_rule);

        // 4. ELIMINAR SERVICIOS FUTUROS
        // Obtener todos los servicios de la serie.
        const todosLosServicios = await base44.asServiceRole.entities.Schedule.filter({ 
            recurrence_id: servicioActualizado.recurrence_id 
        });

        // Filtrar para eliminar solo los que están EN o DESPUÉS de la fecha de corte,
        // y que no sean el servicio que acabamos de actualizar.
        const serviciosAEliminar = todosLosServicios.filter(s =>
            s.id !== scheduleId && // No eliminar el servicio que estamos editando
            new Date(s.start_time) >= fechaDeCorte // Solo tocar servicios desde la fecha de corte en adelante
        );
        
        console.log(`[actualizarSerieRecurrente] 🗑️ ${serviciosAEliminar.length} servicios marcados para eliminación.`);
        
        if (serviciosAEliminar.length > 0) {
            await Promise.all(serviciosAEliminar.map(s => 
                base44.asServiceRole.entities.Schedule.delete(s.id)
            ));
        }

        // 5. REGENERAR la serie a partir del servicio actualizado.
        console.log(`[actualizarSerieRecurrente] 🔄 Regenerando la serie desde el servicio actualizado...`);
        const nuevasCitas = await generarSiguientesCitas(base44, servicioActualizado, scheduleId);
        console.log(`[actualizarSerieRecurrente] ✨ ${nuevasCitas.length} nuevos servicios futuros creados.`);

        const message = `Serie actualizada. Eliminados: ${serviciosAEliminar.length}, Creados: ${nuevasCitas.length}.`;
        
        return new Response(JSON.stringify({
            success: true,
            message: message,
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('[actualizarSerieRecurrente] ❌ Error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});
