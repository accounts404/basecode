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
                const totalAmount = entry.expected_hours * entry.hourly_rate;

                const newEntry = await base44.asServiceRole.entities.WorkEntry.create({
                    cleaner_id: entry.cleaner_id,
                    cleaner_name: entry.cleaner_name,
                    client_id: entry.client_id,
                    client_name: entry.client_name,
                    work_date: entry.work_date,
                    hours: entry.expected_hours,
                    activity: entry.activity || 'domestic',
                    hourly_rate: entry.hourly_rate,
                    total_amount: totalAmount,
                    invoiced: false
                });

                results.created.push(newEntry);
                console.log(`[CreateMissingWorkEntries] ✅ Creada entrada para ${entry.cleaner_name} - ${entry.client_name}`);
            } catch (error) {
                console.error(`[CreateMissingWorkEntries] ❌ Error creando entrada para ${entry.cleaner_name}:`, error);
                results.failed.push({
                    entry,
                    error: error.message
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