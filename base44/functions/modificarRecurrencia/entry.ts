import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { addWeeks } from 'npm:date-fns@3.6.0';

const formatLocalISO = (d) => {
    const y = d.getUTCFullYear(), mo = String(d.getUTCMonth()+1).padStart(2,'0'), dy = String(d.getUTCDate()).padStart(2,'0');
    const h = String(d.getUTCHours()).padStart(2,'0'), mi = String(d.getUTCMinutes()).padStart(2,'0');
    return `${y}-${mo}-${dy}T${h}:${mi}:00.000`;
};

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

    const horaOriginalStart = citaBase.start_time.slice(11, 16);
    const horaOriginalEnd = citaBase.end_time.slice(11, 16);

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

    let fechaDeCalculo = new Date(citaBase.start_time);

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
        if (citaBase.cleaner_schedules && citaBase.cleaner_schedules.length > 0) {
            nuevasCleanerSchedules = citaBase.cleaner_schedules.map(cs => {
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
            ...citaBase,
            start_time: siguienteInicio,
            end_time: siguienteFin,
            cleaner_schedules: nuevasCleanerSchedules,
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
            console.error(`[generarNuevasRecurrencias] Error: ${e.message}`);
            citasFallidas.push({ fecha: siguienteInicio, error: e.message });
        }

        fechaDeCalculo = siguienteFechaBase;
    }

    return { created: citasCreadas, failed: citasFallidas };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ success: false, error: 'Unauthorized: Solo administradores' }, { status: 401 });
        }

        const { scheduleId, updatedData } = await req.json();

        if (!scheduleId) {
            return Response.json({ success: false, error: "Se requiere scheduleId" }, { status: 400 });
        }

        if (!updatedData) {
            return Response.json({ success: false, error: "Se requiere updatedData" }, { status: 400 });
        }

        const servicioOriginal = await base44.asServiceRole.entities.Schedule.get(scheduleId);
        if (!servicioOriginal) {
            return Response.json({ success: false, error: `No se encontró el servicio con ID ${scheduleId}` }, { status: 404 });
        }

        const oldRecurrenceId = servicioOriginal.recurrence_id;

        // Actualizar el servicio base
        await base44.asServiceRole.entities.Schedule.update(scheduleId, updatedData);
        const servicioBaseActualizado = await base44.asServiceRole.entities.Schedule.get(scheduleId);

        let deletedCount = 0;
        let createdCount = 0;

        // Eliminar citas futuras de la serie antigua
        if (oldRecurrenceId) {
            const allSchedules = await base44.asServiceRole.entities.Schedule.filter({ recurrence_id: oldRecurrenceId });
            const fechaDeCorte = (servicioBaseActualizado.start_time || '').slice(0, 10);

            const schedulesToDelete = allSchedules.filter(s => {
                const scheduleDate = (s.start_time || '').slice(0, 10);
                return scheduleDate > fechaDeCorte && s.id !== scheduleId && s.status !== 'completed';
            });

            if (schedulesToDelete.length > 0) {
                console.log(`[modificarRecurrencia] Eliminando ${schedulesToDelete.length} servicios...`);
                const deleteResults = await Promise.allSettled(
                    schedulesToDelete.map(s => base44.asServiceRole.entities.Schedule.delete(s.id))
                );
                deletedCount = deleteResults.filter(r => r.status === 'fulfilled').length;
            }
        }

        // Generar nuevas citas
        if (servicioBaseActualizado.recurrence_rule && servicioBaseActualizado.recurrence_rule !== 'none') {
            console.log(`[modificarRecurrencia] Generando con regla: ${servicioBaseActualizado.recurrence_rule}`);
            const resultado = await generarNuevasRecurrencias(base44, servicioBaseActualizado);
            createdCount = resultado.created.length;
        }

        return Response.json({
            success: true,
            message: `Recurrencia modificada. Eliminados: ${deletedCount}, Creados: ${createdCount}`,
            deletedCount,
            createdCount,
        });

    } catch (error) {
        console.error('[modificarRecurrencia] Error:', error);
        return Response.json({ success: false, error: error.message || 'Error desconocido' }, { status: 500 });
    }
});