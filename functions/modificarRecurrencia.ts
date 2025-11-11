
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';
// CORRECCIÓN: Importar las funciones necesarias de date-fns
import { addWeeks, startOfDay, set } from 'npm:date-fns@3.6.0';

// FUNCIÓN REESCRITA para generar recurrencias de forma robusta
async function generarNuevasRecurrencias(base44, citaBase) {
    const { recurrence_rule, id: baseId } = citaBase;
    if (!recurrence_rule || recurrence_rule === 'none') {
        return [];
    }

    const recurrenceId = citaBase.recurrence_id || baseId;
    if (!citaBase.recurrence_id) {
        await base44.asServiceRole.entities.Schedule.update(baseId, { recurrence_id: recurrenceId });
    }

    const citasCreadas = [];
    // Usamos la fecha base para los cálculos
    const fechaBase = new Date(citaBase.start_time);
    
    // Extraemos la hora, minuto y segundo originales para mantenerlos fijos
    const horaOriginal = {
        hours: fechaBase.getUTCHours(),
        minutes: fechaBase.getUTCMinutes(),
        seconds: fechaBase.getUTCSeconds()
    };

    let fechaDeCalculo = fechaBase;

    const numSemanales = 25;
    const numQuincenales = 12;
    const numMensuales = 5;

    let limite = 0;
    if (recurrence_rule === 'weekly') limite = numSemanales;
    else if (recurrence_rule === 'fortnightly') limite = numQuincenales;
    else if (recurrence_rule === 'monthly') limite = numMensuales;

    for (let i = 0; i < limite; i++) {
        let siguienteFechaBase;

        // 1. Calcular la siguiente fecha base sin preocuparnos por la hora
        switch (recurrence_rule) {
            case 'weekly':
                siguienteFechaBase = addWeeks(fechaDeCalculo, 1);
                break;
            case 'fortnightly':
                siguienteFechaBase = addWeeks(fechaDeCalculo, 2);
                break;
            case 'monthly':
                 // Para mensual, usamos addWeeks(4) para mantener el día de la semana
                siguienteFechaBase = addWeeks(fechaDeCalculo, 4);
                break;
        }

        // 2. Forzar la hora, minuto y segundo originales en la nueva fecha.
        // `set` de date-fns aplica los valores en el "wall time" de la fecha, respetando el día.
        const siguienteInicio = set(siguienteFechaBase, horaOriginal);

        // 3. Calcular la duración del servicio original para aplicarla
        const duracionMs = new Date(citaBase.end_time).getTime() - new Date(citaBase.start_time).getTime();
        const siguienteFin = new Date(siguienteInicio.getTime() + duracionMs);

        const nuevaCita = {
            ...citaBase,
            start_time: siguienteInicio.toISOString(),
            end_time: siguienteFin.toISOString(),
            status: 'scheduled',
            recurrence_id: recurrenceId,
            clock_in_data: [],
        };
        delete nuevaCita.id;

        try {
            const creada = await base44.asServiceRole.entities.Schedule.create(nuevaCita);
            citasCreadas.push(creada);
        } catch (e) {
            console.error(`Error creando nueva cita recurrente: ${e.message}`);
        }
        
        // Actualizamos la fecha de cálculo para la siguiente iteración
        fechaDeCalculo = siguienteInicio;
    }
    return citasCreadas;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        const { scheduleId, updatedData } = await req.json();

        if (!scheduleId || !updatedData) {
            throw new Error("Se requiere scheduleId y updatedData");
        }

        // 1. Obtener el servicio base original ANTES de cualquier cambio
        const servicioOriginal = await base44.asServiceRole.entities.Schedule.get(scheduleId);
        const oldRecurrenceId = servicioOriginal.recurrence_id;

        // 2. Actualizar el servicio que se está editando con los nuevos datos
        await base44.asServiceRole.entities.Schedule.update(scheduleId, updatedData);
        // La `updatedData` ahora es la verdad, la obtenemos de nuevo para tener la versión más fresca
        const servicioBaseActualizado = await base44.asServiceRole.entities.Schedule.get(scheduleId);

        let deletedCount = 0;
        let createdCount = 0;

        // 3. Eliminar TODAS las citas futuras de la SERIE ANTIGUA, si existía una.
        if (oldRecurrenceId) {
            const allSchedules = await base44.asServiceRole.entities.Schedule.list();
            const oldSeriesSchedules = allSchedules.filter(s => s.recurrence_id === oldRecurrenceId);
            
            const fechaDeCorte = startOfDay(new Date(servicioBaseActualizado.start_time));

            const schedulesToDelete = oldSeriesSchedules.filter(s => {
                const scheduleDate = startOfDay(new Date(s.start_time));
                // Eliminar solo si es futuro Y NO es el mismo servicio que estamos editando
                return scheduleDate > fechaDeCorte && s.id !== scheduleId && s.status !== 'completed';
            });

            if(schedulesToDelete.length > 0) {
                const deletePromises = schedulesToDelete.map(s => base44.asServiceRole.entities.Schedule.delete(s.id));
                const results = await Promise.allSettled(deletePromises);
                deletedCount = results.filter(r => r.status === 'fulfilled').length;
            }
        }
        
        // 4. Generar las NUEVAS citas futuras si la nueva regla de recurrencia no es 'none'
        if (servicioBaseActualizado.recurrence_rule && servicioBaseActualizado.recurrence_rule !== 'none') {
            const nuevasCitas = await generarNuevasRecurrencias(base44, servicioBaseActualizado);
            createdCount = nuevasCitas.length;
        }

        return new Response(JSON.stringify({
            success: true,
            message: `Recurrencia modificada: ${deletedCount} citas antiguas eliminadas, ${createdCount} citas nuevas creadas.`,
            deletedCount,
            createdCount
        }), { headers: { 'Content-Type': 'application/json' }, status: 200 });

    } catch (error) {
        console.error('Error en modificarRecurrencia:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});
