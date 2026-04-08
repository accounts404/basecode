import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { addWeeks, addMonths, differenceInDays } from 'npm:date-fns@3.6.0';

// Formato sin timezone: YYYY-MM-DDTHH:mm:00.000
const formatLocalISO = (d) => {
    const y = d.getUTCFullYear(), mo = String(d.getUTCMonth()+1).padStart(2,'0'), dy = String(d.getUTCDate()).padStart(2,'0');
    const h = String(d.getUTCHours()).padStart(2,'0'), mi = String(d.getUTCMinutes()).padStart(2,'0');
    return `${y}-${mo}-${dy}T${h}:${mi}:00.000`;
};

// CONFIGURACIÓN
const HORIZON_DAYS = 90; // Generar nuevos servicios si la última cita está a menos de 90 días
const EXTENSION_COUNT = {
    weekly: 26,        // aprox 6 meses
    fortnightly: 13,   // aprox 6 meses
    every_3_weeks: 9,  // aprox 6 meses
    every_4_weeks: 7,  // aprox 6 meses
    monthly: 6,        // 6 meses
};

async function extendSeries(base44, lastServiceInSeries, existingStartDays) {
    const { recurrence_rule, recurrence_id } = lastServiceInSeries;
    if (!recurrence_rule || !recurrence_id || recurrence_rule === 'none') {
        return { created: [], failed: [] };
    }

    const createdServices = [];
    const failedServices = [];
    let currentStartDate = new Date(lastServiceInSeries.start_time);
    let currentEndDate = new Date(lastServiceInSeries.end_time);

    const limit = EXTENSION_COUNT[recurrence_rule] || 0;
    if (limit === 0) {
        console.warn(`[extendSeries] No hay límite definido para: ${recurrence_rule}`);
        return { created: [], failed: [] };
    }

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
            case 'every_4_weeks':
                nextStartDate = addWeeks(currentStartDate, 4);
                nextEndDate = addWeeks(currentEndDate, 4);
                break;
            case 'monthly':
                nextStartDate = addMonths(currentStartDate, 1);
                nextEndDate = addMonths(currentEndDate, 1);
                break;
            default:
                console.warn(`[extendSeries] Regla desconocida: ${recurrence_rule}`);
                return { created: createdServices, failed: failedServices };
        }

        const nextDayStartISO = formatLocalISO(nextStartDate).slice(0, 10);
        if (existingStartDays.has(nextDayStartISO)) {
            currentStartDate = nextStartDate;
            currentEndDate = nextEndDate;
            continue;
        }

        const newService = {
            ...lastServiceInSeries,
            start_time: formatLocalISO(nextStartDate),
            end_time: formatLocalISO(nextEndDate),
            status: 'scheduled',
            clock_in_data: [],
            reconciliation_items: [],
            xero_invoiced: false,
            on_my_way_sent_at: null,
            reminder_sent_at: null,
        };
        delete newService.id;
        delete newService.created_date;
        delete newService.updated_date;
        delete newService.created_by;

        try {
            const created = await base44.asServiceRole.entities.Schedule.create(newService);
            if (created) {
                createdServices.push(created);
                existingStartDays.add(nextDayStartISO);
            }
        } catch (e) {
            console.error(`[extendSeries] ❌ Error creando servicio para serie ${recurrence_id}:`, e.message);
            failedServices.push({ recurrence_id, fecha: formatLocalISO(nextStartDate), error: e.message });
        }

        currentStartDate = nextStartDate;
        currentEndDate = nextEndDate;
    }

    return { created: createdServices, failed: failedServices };
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const log = (message) => console.log(`[extendRecurringSchedules] ${message}`);

    try {
        log('🔄 Iniciando revisión para extender series recurrentes...');
        const today = new Date();

        // Obtener todos los servicios que pertenecen a una serie (en lotes)
        const allSchedules = await base44.asServiceRole.entities.Schedule.list('-start_time', 2000);
        const recurringSchedules = allSchedules.filter(s => s.recurrence_id);

        if (recurringSchedules.length === 0) {
            log('ℹ️ No se encontraron series recurrentes.');
            return Response.json({ success: true, message: 'No recurring schedules found.', extended_series_count: 0 });
        }

        // Agrupar por serie
        const seriesMap = new Map();
        for (const schedule of recurringSchedules) {
            if (!seriesMap.has(schedule.recurrence_id)) {
                seriesMap.set(schedule.recurrence_id, []);
            }
            seriesMap.get(schedule.recurrence_id).push(schedule);
        }
        log(`📊 Se encontraron ${seriesMap.size} series recurrentes únicas`);

        const results = {
            extended_series_count: 0,
            skipped_series: 0,
            total_services_created: 0,
            errors: []
        };

        for (const [recurrenceId, schedulesInSeries] of seriesMap.entries()) {
            schedulesInSeries.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
            const lastService = schedulesInSeries[0];
            const daysUntilLast = differenceInDays(new Date(lastService.start_time), today);

            if (daysUntilLast < HORIZON_DAYS) {
                log(`🔧 Extendiendo serie ${recurrenceId} (última cita en ${daysUntilLast} días)...`);
                try {
                    const existingStartDays = new Set(schedulesInSeries.map(s => (s.start_time || '').slice(0, 10)));
                    const resultado = await extendSeries(base44, lastService, existingStartDays);

                    if (resultado.created.length > 0) {
                        results.extended_series_count++;
                        results.total_services_created += resultado.created.length;
                        log(`✅ Serie ${recurrenceId}: ${resultado.created.length} servicios creados`);
                    } else {
                        results.skipped_series++;
                    }

                    if (resultado.failed.length > 0) {
                        results.errors.push(...resultado.failed);
                    }
                } catch (error) {
                    log(`❌ Error extendiendo serie ${recurrenceId}: ${error.message}`);
                    results.errors.push({ recurrenceId, error: error.message });
                    results.skipped_series++;
                }
            } else {
                results.skipped_series++;
                log(`⏭️ Serie ${recurrenceId} omitida (última cita en ${daysUntilLast} días)`);
            }
        }

        log(`✅ Completado. Series extendidas: ${results.extended_series_count}, Servicios creados: ${results.total_services_created}`);

        return Response.json({
            success: true,
            ...results,
            message: `Extensión completada: ${results.extended_series_count} series extendidas con ${results.total_services_created} nuevos servicios`
        });

    } catch (error) {
        log(`❌ Error fatal: ${error.message}`);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});