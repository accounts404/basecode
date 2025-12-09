import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verificar autenticación
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'No autorizado' }, { status: 401 });
        }

        const body = await req.json();
        const { entries_to_create } = body;

        if (!entries_to_create || !Array.isArray(entries_to_create) || entries_to_create.length === 0) {
            return Response.json({ error: 'No se proporcionaron entradas para crear' }, { status: 400 });
        }

        console.log(`[CreateMissingWorkEntries] Creando ${entries_to_create.length} entradas`);

        const results = {
            created: [],
            failed: []
        };

        for (const entry of entries_to_create) {
            try {
                const totalAmount = parseFloat((entry.expected_hours * entry.hourly_rate).toFixed(2));

                // Generar period basado en la fecha (YYYY-MM-1st o YYYY-MM-2nd)
                const workDate = new Date(entry.work_date);
                const day = workDate.getDate();
                const month = workDate.getMonth() + 1;
                const year = workDate.getFullYear();
                const periodSuffix = day <= 15 ? '1st' : '2nd';
                const period = `${year}-${String(month).padStart(2, '0')}-${periodSuffix}`;

                const workEntryData = {
                    cleaner_id: entry.cleaner_id,
                    cleaner_name: entry.cleaner_name,
                    client_id: entry.client_id,
                    client_name: entry.client_name,
                    work_date: entry.work_date,
                    hours: parseFloat(entry.expected_hours),
                    activity: entry.activity || 'domestic',
                    other_activity: entry.activity === 'otros' ? 'Servicio regular' : undefined,
                    hourly_rate: parseFloat(entry.hourly_rate),
                    total_amount: totalAmount,
                    period: period,
                    invoiced: false,
                    schedule_id: entry.schedule_id || undefined,
                    modified_by_cleaner: false
                };

                console.log(`[CreateMissingWorkEntries] 📝 Datos a crear:`, JSON.stringify(workEntryData, null, 2));

                const newEntry = await base44.asServiceRole.entities.WorkEntry.create(workEntryData);

                console.log(`[CreateMissingWorkEntries] ✅ CREADA CON ÉXITO - ID: ${newEntry.id}`);
                console.log(`[CreateMissingWorkEntries] Verificación: cleaner_id=${newEntry.cleaner_id}, client_id=${newEntry.client_id}, work_date=${newEntry.work_date}`);
                
                results.created.push({
                    id: newEntry.id,
                    cleaner_name: entry.cleaner_name,
                    client_name: entry.client_name,
                    work_date: entry.work_date,
                    total_amount: totalAmount
                });
            } catch (error) {
                console.error(`[CreateMissingWorkEntries] ❌ Error creando entrada para ${entry.cleaner_name}:`, error);
                console.error(`[CreateMissingWorkEntries] Error completo:`, error.stack);
                results.failed.push({
                    entry,
                    error: error.message,
                    stack: error.stack
                });
            }
        }

        return Response.json({
            success: true,
            created_count: results.created.length,
            failed_count: results.failed.length,
            created: results.created,
            failed: results.failed
        });

    } catch (error) {
        console.error('[CreateMissingWorkEntries] Error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});