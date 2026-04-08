import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { addWeeks, addMonths, addDays } from 'npm:date-fns@3.6.0';

// Formato sin timezone: YYYY-MM-DDTHH:mm:00.000
const formatLocalISO = (d) => {
    const y = d.getUTCFullYear(), mo = String(d.getUTCMonth()+1).padStart(2,'0'), dy = String(d.getUTCDate()).padStart(2,'0');
    const h = String(d.getUTCHours()).padStart(2,'0'), mi = String(d.getUTCMinutes()).padStart(2,'0');
    return `${y}-${mo}-${dy}T${h}:${mi}:00.000`;
};

const advanceByRule = (date, rule) => {
    switch (rule) {
        case 'weekly':       return addWeeks(date, 1);
        case 'fortnightly':  return addWeeks(date, 2);
        case 'every_3_weeks': return addWeeks(date, 3);
        case 'every_4_weeks': return addWeeks(date, 4);
        case 'monthly':      return addMonths(date, 1);
        default:             return null;
    }
};

// Extiende una serie hasta que el último servicio esté al menos a 6 meses en el futuro
async function extendSeries(base44, lastServiceInSeries, existingStartDays, today, targetDate) {
    const { recurrence_rule, recurrence_id } = lastServiceInSeries;
    if (!recurrence_rule || !recurrence_id || recurrence_rule === 'none') {
        return { created: [], failed: [] };
    }

    const createdServices = [];
    const failedServices = [];

    let currentStartDate = new Date(lastServiceInSeries.start_time);
    let currentEndDate = new Date(lastServiceInSeries.end_time);

    // Avanzar hasta el último servicio existente en la serie (puede haber servicios futuros ya)
    // Se pasa el lastServiceInSeries como el más tardío de la serie, así que partimos desde allí

    let safetyLimit = 100; // Evitar loops infinitos

    while (currentStartDate < targetDate && safetyLimit-- > 0) {
        const nextStartDate = advanceByRule(currentStartDate, recurrence_rule);
        const nextEndDate = advanceByRule(currentEndDate, recurrence_rule);
        if (!nextStartDate || !nextEndDate) break;

        // Nunca crear en el pasado
        if (nextStartDate <= today) {
            currentStartDate = nextStartDate;
            currentEndDate = nextEndDate;
            continue;
        }

        const nextDayISO = formatLocalISO(nextStartDate).slice(0, 10);
        if (!existingStartDays.has(nextDayISO)) {
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
                billed_at: null,
                billed_price_snapshot: null,
                billed_gst_type_snapshot: null,
                billed_payment_method_snapshot: null,
            };
            delete newService.id;
            delete newService.created_date;
            delete newService.updated_date;
            delete newService.created_by;

            try {
                const created = await base44.asServiceRole.entities.Schedule.create(newService);
                if (created) {
                    createdServices.push(created);
                    existingStartDays.add(nextDayISO);
                }
            } catch (e) {
                console.error(`[extendSeries] ❌ Error serie ${recurrence_id}:`, e.message);
                failedServices.push({ recurrence_id, fecha: formatLocalISO(nextStartDate), error: e.message });
            }
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
        log('🔄 Iniciando revisión mensual para garantizar 6 meses de servicios...');
        const today = new Date();
        const targetDate = addMonths(today, 6); // Horizonte: 6 meses
        log(`📅 Horizonte objetivo: ${targetDate.toISOString().slice(0, 10)}`);

        // Solo clientes activos
        const allClients = await base44.asServiceRole.entities.Client.list();
        const activeClientIds = new Set(allClients.filter(c => c.active !== false).map(c => c.id));
        log(`👥 Clientes activos: ${activeClientIds.size} de ${allClients.length} total`);

        const allSchedules = await base44.asServiceRole.entities.Schedule.list('-start_time', 2000);
        const recurringSchedules = allSchedules.filter(s =>
            s.recurrence_id &&
            s.recurrence_rule &&
            s.recurrence_rule !== 'none' &&
            activeClientIds.has(s.client_id)
        );

        if (recurringSchedules.length === 0) {
            log('ℹ️ No se encontraron series recurrentes de clientes activos.');
            return Response.json({ success: true, message: 'No recurring schedules found.', extended_series_count: 0 });
        }

        // Agrupar por serie y encontrar el ÚLTIMO servicio de cada una
        const seriesMap = new Map();
        for (const schedule of recurringSchedules) {
            const existing = seriesMap.get(schedule.recurrence_id);
            if (!existing || new Date(schedule.start_time) > new Date(existing.last.start_time)) {
                seriesMap.set(schedule.recurrence_id, {
                    last: schedule,
                    allDays: new Set(recurringSchedules
                        .filter(s => s.recurrence_id === schedule.recurrence_id)
                        .map(s => (s.start_time || '').slice(0, 10)))
                });
            }
        }
        log(`📊 ${seriesMap.size} series recurrentes únicas`);

        const results = {
            extended_series_count: 0,
            already_ok_series: 0,
            total_services_created: 0,
            errors: []
        };

        for (const [recurrenceId, { last: lastService, allDays }] of seriesMap.entries()) {
            const lastDate = new Date(lastService.start_time);

            // Si ya tiene servicios más allá del horizonte de 6 meses, no hace falta extender
            if (lastDate >= targetDate) {
                results.already_ok_series++;
                continue;
            }

            log(`🔧 Extendiendo serie ${recurrenceId} (${lastService.client_name}, última cita: ${lastService.start_time.slice(0,10)})...`);
            try {
                const resultado = await extendSeries(base44, lastService, allDays, today, targetDate);

                if (resultado.created.length > 0) {
                    results.extended_series_count++;
                    results.total_services_created += resultado.created.length;
                    log(`✅ ${lastService.client_name}: ${resultado.created.length} servicios creados`);
                } else {
                    results.already_ok_series++;
                }

                if (resultado.failed.length > 0) {
                    results.errors.push(...resultado.failed);
                }
            } catch (error) {
                log(`❌ Error extendiendo serie ${recurrenceId}: ${error.message}`);
                results.errors.push({ recurrenceId, error: error.message });
            }
        }

        log(`✅ Completado. Series extendidas: ${results.extended_series_count}, Servicios creados: ${results.total_services_created}`);

        return Response.json({
            success: true,
            ...results,
            horizon_date: targetDate.toISOString().slice(0, 10),
            message: `Revisión completada: ${results.extended_series_count} series extendidas con ${results.total_services_created} nuevos servicios`
        });

    } catch (error) {
        log(`❌ Error fatal: ${error.message}`);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});