import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { addWeeks } from 'npm:date-fns@3.6.0';

const formatLocalISO = (d) => {
    const y = d.getUTCFullYear(), mo = String(d.getUTCMonth()+1).padStart(2,'0'), dy = String(d.getUTCDate()).padStart(2,'0');
    const h = String(d.getUTCHours()).padStart(2,'0'), mi = String(d.getUTCMinutes()).padStart(2,'0');
    return `${y}-${mo}-${dy}T${h}:${mi}:00.000`;
};

async function generarSiguientesCitas(base44, citaOriginal, excludeId = null) {
    const { recurrence_rule } = citaOriginal;
    if (!recurrence_rule || recurrence_rule === 'none') {
        return { created: [], failed: [] };
    }

    const citasCreadas = [];
    const citasFallidas = [];

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

    const horaOriginalStart = citaOriginal.start_time.slice(11, 16);
    const horaOriginalEnd = citaOriginal.end_time.slice(11, 16);

    let fechaDeCalculo = new Date(citaOriginal.start_time);

    for (let i = 0; i < limite; i++) {
        let siguienteFechaBase;

        switch (recurrence_rule) {
            case 'weekly': siguienteFechaBase = addWeeks(fechaDeCalculo, 1); break;
            case 'fortnightly': siguienteFechaBase = addWeeks(fechaDeCalculo, 2); break;
            case 'every_3_weeks': siguienteFechaBase = addWeeks(fechaDeCalculo, 3); break;
            case 'every_4_weeks': siguienteFechaBase = addWeeks(fechaDeCalculo, 4); break;
            case 'monthly': siguienteFechaBase = addWeeks(fechaDeCalculo, 4); break;
            default: return { created: citasCreadas, failed: citasFallidas };
        }

        const dateStr = `${siguienteFechaBase.getUTCFullYear()}-${String(siguienteFechaBase.getUTCMonth()+1).padStart(2,'0')}-${String(siguienteFechaBase.getUTCDate()).padStart(2,'0')}`;
        const siguienteInicio = `${dateStr}T${horaOriginalStart}:00.000`;
        const siguienteFin = `${dateStr}T${horaOriginalEnd}:00.000`;

        // Ajustar cleaner_schedules si existen
        let nuevasCleanerSchedules = null;
        if (citaOriginal.cleaner_schedules && citaOriginal.cleaner_schedules.length > 0) {
            nuevasCleanerSchedules = citaOriginal.cleaner_schedules.map(cs => {
                const csStartHora = cs.start_time ? cs.start_time.slice(11, 16) : horaOriginalStart;
                const csEndHora = cs.end_time ? cs.end_time.slice(11, 16) : horaOriginalEnd;
                return {
                    ...cs,
                    start_time: `${dateStr}T${csStartHora}:00.000`,
                    end_time: `${dateStr}T${csEndHora}:00.000`,
                };
            });
        }

        const nuevaCita = {
            ...citaOriginal,
            start_time: siguienteInicio,
            end_time: siguienteFin,
            cleaner_schedules: nuevasCleanerSchedules,
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
            if (creada) citasCreadas.push(creada);
        } catch (e) {
            console.error(`[generarSiguientesCitas] Error: ${e.message}`);
            citasFallidas.push({ fecha: siguienteInicio, error: e.message });
        }

        fechaDeCalculo = siguienteFechaBase;
    }

    return { created: citasCreadas, failed: citasFallidas };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const requestData = await req.json();
        const { scheduleId, updateScope, updatedData } = requestData;

        console.log('[actualizarSerieRecurrente] Scope:', updateScope, 'ID:', scheduleId);

        if (!scheduleId) {
            return Response.json({ success: false, error: "Se requiere scheduleId" }, { status: 400 });
        }

        if (!updateScope || updateScope === 'this_only') {
            return Response.json({ success: false, error: "updateScope debe ser 'this_and_future'" }, { status: 400 });
        }

        if (!updatedData) {
            return Response.json({ success: false, error: "Se requiere updatedData" }, { status: 400 });
        }

        const servicioOriginal = await base44.asServiceRole.entities.Schedule.get(scheduleId);
        if (!servicioOriginal) {
            return Response.json({ success: false, error: `No se encontró el servicio con ID ${scheduleId}` }, { status: 404 });
        }

        const fechaDeCorte = servicioOriginal.start_time.slice(0, 10);
        console.log(`[actualizarSerieRecurrente] Fecha de corte: ${fechaDeCorte}`);

        // Caso especial: conversión a recurrente
        if (!servicioOriginal.recurrence_id) {
            if (updatedData.recurrence_rule && updatedData.recurrence_rule !== 'none') {
                await base44.asServiceRole.entities.Schedule.update(scheduleId, { ...updatedData, recurrence_id: scheduleId });
                const servicioActualizado = await base44.asServiceRole.entities.Schedule.get(scheduleId);
                const resultado = await generarSiguientesCitas(base44, servicioActualizado, scheduleId);
                return Response.json({
                    success: true,
                    message: `Servicio convertido a recurrente. Creados: ${resultado.created.length}`,
                    created_count: resultado.created.length,
                    failed_count: resultado.failed.length
                });
            }
            return Response.json({ success: true, message: "Servicio único actualizado." });
        }

        // Actualizar el servicio base
        await base44.asServiceRole.entities.Schedule.update(scheduleId, updatedData);
        const servicioActualizado = await base44.asServiceRole.entities.Schedule.get(scheduleId);
        console.log('[actualizarSerieRecurrente] Servicio base actualizado.');

        // Eliminar servicios futuros
        const todosLosServicios = await base44.asServiceRole.entities.Schedule.filter({
            recurrence_id: servicioActualizado.recurrence_id
        });

        const serviciosAEliminar = todosLosServicios.filter(s =>
            s.id !== scheduleId &&
            (s.start_time || '').slice(0, 10) >= fechaDeCorte &&
            s.status !== 'completed'
        );

        console.log(`[actualizarSerieRecurrente] ${serviciosAEliminar.length} servicios a eliminar`);

        let deletedCount = 0;
        if (serviciosAEliminar.length > 0) {
            const deleteResults = await Promise.allSettled(
                serviciosAEliminar.map(s => base44.asServiceRole.entities.Schedule.delete(s.id))
            );
            deletedCount = deleteResults.filter(r => r.status === 'fulfilled').length;
        }

        // Regenerar la serie
        const resultado = await generarSiguientesCitas(base44, servicioActualizado, scheduleId);
        console.log(`[actualizarSerieRecurrente] Creados: ${resultado.created.length}`);

        return Response.json({
            success: true,
            message: `Serie actualizada. Eliminados: ${deletedCount}, Creados: ${resultado.created.length}`,
            deleted_count: deletedCount,
            created_count: resultado.created.length,
            failed_count: resultado.failed.length,
        });

    } catch (error) {
        console.error('[actualizarSerieRecurrente] Error:', error);
        return Response.json({ success: false, error: error.message || 'Error desconocido' }, { status: 500 });
    }
});