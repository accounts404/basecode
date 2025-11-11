
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';
import { addWeeks, addMonths, startOfDay, differenceInDays } from 'npm:date-fns@2.30.0';

// --- CONFIGURACIÓN ---
// Generar nuevos servicios si la última cita está a menos de 90 días desde hoy.
const HORIZON_DAYS = 90; 
// Cuántos servicios nuevos generar para extender la serie.
const EXTENSION_COUNT = { 
    weekly: 26, // approx 6 months
    fortnightly: 13, // approx 6 months
    every_3_weeks: 9, // approx 6 months
    monthly: 6, // 6 months
};

// Función interna para extender una serie específica
async function extendSeries(base44, lastServiceInSeries, existingStartDays) {
    const { recurrence_rule, recurrence_id } = lastServiceInSeries;
    if (!recurrence_rule || !recurrence_id || recurrence_rule === 'none') {
        return [];
    }

    const createdServices = [];
    let currentStartDate = new Date(lastServiceInSeries.start_time);
    let currentEndDate = new Date(lastServiceInSeries.end_time);

    const limit = EXTENSION_COUNT[recurrence_rule] || 0;
    if (limit === 0) return [];

    for (let i = 0; i < limit; i++) {
        let nextStartDate, nextEndDate;

        switch (recurrence_rule) {
            case 'weekly':
                nextStartDate = addWeeks(currentStartDate, 1);
                nextEndDate = addWeeks(currentEndDate, 1);
                break;
            case 'fortnightly':
                nextStartDate = addWeeks(currentStartDate, 2);
                nextEndDate = addWeeks(currentEndDate, 2);
                break;
            case 'every_3_weeks':
                nextStartDate = addWeeks(currentStartDate, 3);
                nextEndDate = addWeeks(currentEndDate, 3);
                break;
            case 'monthly':
                nextStartDate = addMonths(currentStartDate, 1);
                nextEndDate = addMonths(currentEndDate, 1);
                break;
        }

        // --- Verificación para no crear duplicados ---
        const nextDayStartISO = startOfDay(nextStartDate).toISOString();
        if (existingStartDays.has(nextDayStartISO)) {
            currentStartDate = nextStartDate;
            currentEndDate = nextEndDate;
            continue; // Ya existe un servicio para este día, saltar.
        }

        // Crear la nueva cita con datos limpios
        const newService = {
            ...lastServiceInSeries,
            start_time: nextStartDate.toISOString(),
            end_time: nextEndDate.toISOString(),
            status: 'scheduled',
            clock_in_data: [],
            reconciliation_items: [],
            xero_invoiced: false,
            on_my_way_sent_at: null,
            reminder_sent_at: null,
        };
        delete newService.id; // Quitar el ID para que se cree un nuevo registro

        try {
            const created = await base44.asServiceRole.entities.Schedule.create(newService);
            if (created) {
                createdServices.push(created);
            }
        } catch (e) {
            console.error(`Error creando servicio recurrente para la serie ${recurrence_id}: ${e.message}`);
        }
        
        currentStartDate = nextStartDate;
        currentEndDate = nextEndDate;
    }
    
    return createdServices;
}


Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const log = (message) => console.log(`[extendRecurringSchedules] ${message}`);

    // --- CHEQUEO DE SEGURIDAD PARA EL CRON JOB ---
    try {
        const providedApiKey = req.headers.get('api_key');
        const expectedApiKey = Deno.env.get('CRON_API_KEY');

        if (!expectedApiKey || !providedApiKey || providedApiKey !== expectedApiKey) {
            log('Intento no autorizado: clave API inválida o ausente.');
            return new Response(JSON.stringify({ error: 'Unauthorized: Invalid API Key' }), { 
                status: 401, headers: { 'Content-Type': 'application/json' }
            });
        }
        log('Ejecución del Cron Job autorizada.');
    } catch (e) {
        log(`Error de autorización: ${e.message}`);
        return new Response(JSON.stringify({ error: 'Authorization error' }), { status: 400 });
    }
    // --- FIN DEL CHEQUEO DE SEGURIDAD ---

    try {
        log('Iniciando revisión para extender series recurrentes...');
        const today = new Date();

        // 1. Obtener todos los servicios que pertenecen a una serie
        const allSchedules = await base44.asServiceRole.entities.Schedule.list();
        const recurringSchedules = allSchedules.filter(s => s.recurrence_id);
        
        if (recurringSchedules.length === 0) {
            log('No se encontraron series recurrentes. Finalizando.');
            return new Response(JSON.stringify({ message: 'No recurring schedules found.' }), { status: 200 });
        }

        // 2. Agrupar servicios por serie (recurrence_id)
        const seriesMap = new Map();
        for (const schedule of recurringSchedules) {
            if (!seriesMap.has(schedule.recurrence_id)) {
                seriesMap.set(schedule.recurrence_id, []);
            }
            seriesMap.get(schedule.recurrence_id).push(schedule);
        }
        log(`Se encontraron ${seriesMap.size} series recurrentes únicas.`);

        const results = { extended_series_count: 0, skipped_series: 0, errors: [] };

        // 3. Procesar cada serie
        for (const [recurrenceId, schedulesInSeries] of seriesMap.entries()) {
            // Ordenar para encontrar el último servicio de la serie
            schedulesInSeries.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
            const lastService = schedulesInSeries[0];

            // 4. Decidir si la serie necesita ser extendida
            const daysUntilLast = differenceInDays(new Date(lastService.start_time), today);
            
            if (daysUntilLast < HORIZON_DAYS) {
                log(`Extendiendo la serie ${recurrenceId} (última cita en ${daysUntilLast} días)...`);
                try {
                    // Set de fechas existentes para evitar duplicados
                    const existingStartDays = new Set(schedulesInSeries.map(s => startOfDay(new Date(s.start_time)).toISOString()));
                    
                    const newServices = await extendSeries(base44, lastService, existingStartDays);
                    if (newServices.length > 0) {
                        results.extended_series_count++;
                    } else {
                        results.skipped_series++; // No se crearon nuevos, probablemente por duplicados
                    }
                } catch (error) {
                    log(`Error extendiendo la serie ${recurrenceId}: ${error.message}`);
                    results.errors.push({ recurrenceId, error: error.message });
                }
            } else {
                results.skipped_series++;
            }
        }

        log(`Proceso finalizado. Series extendidas: ${results.extended_series_count}. Series omitidas: ${results.skipped_series}. Errores: ${results.errors.length}.`);
        return new Response(JSON.stringify(results), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        log(`Error fatal en la ejecución del cron: ${error.message}`);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
});
