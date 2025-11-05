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

        return Response.json({
            success: true,
            summary: {
                total_entries: workEntries.length,
                duplicates_found: duplicates.length,
                modified_entries: modifiedEntries.length,
                irregularities_found: irregularities.length
            },
            duplicates,
            modified_entries: modifiedEntries,
            irregularities
        });

    } catch (error) {
        console.error('[AuditWorkEntries] Error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});