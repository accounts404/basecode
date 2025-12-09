import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verificar autenticación
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'No autorizado' }, { status: 401 });
        }

        const body = await req.json();
        const { period_start, period_end } = body;

        // Obtener todas las work entries del período (o todas si no se especifica)
        let workEntries;
        if (period_start && period_end) {
            workEntries = await base44.asServiceRole.entities.WorkEntry.filter({
                work_date: {
                    $gte: period_start,
                    $lte: period_end
                }
            });
        } else {
            workEntries = await base44.asServiceRole.entities.WorkEntry.list();
        }

        console.log(`[AuditWorkEntries] Analizando ${workEntries.length} entradas de trabajo`);

        // 1. DETECTAR DUPLICADOS
        const duplicates = [];
        const entryMap = new Map();

        workEntries.forEach(entry => {
            // Crear una clave única basada en los campos críticos
            const key = `${entry.cleaner_id}|${entry.client_id}|${entry.work_date}|${entry.activity}|${entry.hours}|${entry.total_amount}`;
            
            if (entryMap.has(key)) {
                // Ya existe una entrada con estos mismos datos
                const existingGroup = entryMap.get(key);
                existingGroup.push(entry);
            } else {
                entryMap.set(key, [entry]);
            }
        });

        // Filtrar solo los grupos que tienen más de una entrada (duplicados)
        entryMap.forEach((group, key) => {
            if (group.length > 1) {
                duplicates.push({
                    key,
                    count: group.length,
                    entries: group.map(e => ({
                        id: e.id,
                        cleaner_name: e.cleaner_name,
                        client_name: e.client_name,
                        work_date: e.work_date,
                        hours: e.hours,
                        activity: e.activity,
                        total_amount: e.total_amount,
                        created_date: e.created_date,
                        invoiced: e.invoiced
                    }))
                });
            }
        });

        console.log(`[AuditWorkEntries] Encontrados ${duplicates.length} grupos de duplicados`);

        // 2. IDENTIFICAR ENTRADAS MODIFICADAS POR LIMPIADORES
        const modifiedEntries = workEntries
            .filter(entry => entry.modified_by_cleaner === true)
            .map(entry => ({
                id: entry.id,
                cleaner_name: entry.cleaner_name,
                client_name: entry.client_name,
                work_date: entry.work_date,
                hours: entry.hours,
                activity: entry.activity,
                total_amount: entry.total_amount,
                last_modified_at: entry.last_modified_at,
                original_values: entry.original_values || {},
                current_values: {
                    hours: entry.hours,
                    hourly_rate: entry.hourly_rate,
                    total_amount: entry.total_amount,
                    activity: entry.activity,
                    other_activity: entry.other_activity
                },
                invoiced: entry.invoiced
            }));

        console.log(`[AuditWorkEntries] Encontradas ${modifiedEntries.length} entradas modificadas por limpiadores`);

        // 3. IDENTIFICAR OTRAS IRREGULARIDADES
        const irregularities = [];

        workEntries.forEach(entry => {
            const issues = [];

            // Verificar horas sospechosamente altas
            if (entry.hours > 12) {
                issues.push(`Horas inusualmente altas: ${entry.hours}h`);
            }

            // Verificar horas muy bajas
            if (entry.hours < 0.5 && entry.activity !== 'gasolina' && entry.activity !== 'otros') {
                issues.push(`Horas inusualmente bajas: ${entry.hours}h`);
            }

            // Verificar si la tarifa es cero o muy baja
            if (entry.hourly_rate < 10 && entry.activity !== 'gasolina' && entry.activity !== 'otros') {
                issues.push(`Tarifa sospechosamente baja: $${entry.hourly_rate}/h`);
            }

            // Verificar discrepancia en el cálculo del total
            const expectedTotal = entry.hours * entry.hourly_rate;
            const actualTotal = entry.total_amount;
            if (Math.abs(expectedTotal - actualTotal) > 0.5) {
                issues.push(`Discrepancia en total: esperado $${expectedTotal.toFixed(2)}, actual $${actualTotal.toFixed(2)}`);
            }

            // Verificar actividad "otros" sin descripción
            if (entry.activity === 'otros' && (!entry.other_activity || entry.other_activity.trim() === '')) {
                issues.push(`Actividad "otros" sin descripción`);
            }

            if (issues.length > 0) {
                irregularities.push({
                    id: entry.id,
                    cleaner_name: entry.cleaner_name,
                    client_name: entry.client_name,
                    work_date: entry.work_date,
                    hours: entry.hours,
                    activity: entry.activity,
                    total_amount: entry.total_amount,
                    issues: issues,
                    invoiced: entry.invoiced
                });
            }
        });

        console.log(`[AuditWorkEntries] Encontradas ${irregularities.length} entradas con irregularidades`);

        // 4. IDENTIFICAR ENTRADAS FALTANTES (Servicios completados sin Work Entry)
        let schedules;
        if (period_start && period_end) {
            schedules = await base44.asServiceRole.entities.Schedule.filter({
                start_time: {
                    $gte: period_start,
                    $lte: period_end
                },
                status: 'completed'
            });
        } else {
            schedules = await base44.asServiceRole.entities.Schedule.filter({
                status: 'completed'
            });
        }

        console.log(`[AuditWorkEntries] Analizando ${schedules.length} servicios completados`);

        const missingEntries = [];
        const users = await base44.asServiceRole.entities.User.list();
        const clients = await base44.asServiceRole.entities.Client.list();

        for (const schedule of schedules) {
            if (!schedule.cleaner_ids || schedule.cleaner_ids.length === 0) continue;

            const serviceDate = schedule.start_time.split('T')[0]; // YYYY-MM-DD

            for (const cleanerId of schedule.cleaner_ids) {
                // Buscar si ya existe una work entry para este limpiador, cliente y fecha
                const existingEntry = workEntries.find(entry => 
                    entry.cleaner_id === cleanerId &&
                    entry.client_id === schedule.client_id &&
                    entry.work_date === serviceDate
                );

                if (!existingEntry) {
                    const cleaner = users.find(u => u.id === cleanerId);
                    const client = clients.find(c => c.id === schedule.client_id);
                    
                    if (cleaner && client) {
                        // Calcular horas esperadas basado en el servicio
                        const expectedHours = client.service_hours || 3;
                        
                        // Obtener tarifa del limpiador
                        let hourlyRate = 30; // default
                        if (cleaner.hourly_rate) {
                            hourlyRate = cleaner.hourly_rate;
                        } else if (cleaner.rate_history && cleaner.rate_history.length > 0) {
                            // Buscar la tarifa aplicable en la fecha del servicio
                            const sortedRates = [...cleaner.rate_history].sort((a, b) => 
                                new Date(b.effective_date) - new Date(a.effective_date)
                            );
                            
                            for (const rate of sortedRates) {
                                if (rate.effective_date <= serviceDate) {
                                    hourlyRate = rate.rate;
                                    break;
                                }
                            }
                        }

                        missingEntries.push({
                            schedule_id: schedule.id,
                            cleaner_id: cleanerId,
                            cleaner_name: cleaner.invoice_name || cleaner.full_name,
                            client_id: schedule.client_id,
                            client_name: schedule.client_name || client.name,
                            work_date: serviceDate,
                            expected_hours: expectedHours,
                            hourly_rate: hourlyRate,
                            activity: schedule.client_name?.toLowerCase().includes('commercial') ? 'commercial' : 'domestic'
                        });
                    }
                }
            }
        }

        console.log(`[AuditWorkEntries] Encontradas ${missingEntries.length} entradas faltantes`);

        return Response.json({
            success: true,
            summary: {
                total_entries: workEntries.length,
                duplicates_found: duplicates.length,
                modified_entries: modifiedEntries.length,
                irregularities_found: irregularities.length,
                missing_entries: missingEntries.length
            },
            duplicates,
            modified_entries: modifiedEntries,
            irregularities,
            missing_entries: missingEntries
        });

    } catch (error) {
        console.error('[AuditWorkEntries] Error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});