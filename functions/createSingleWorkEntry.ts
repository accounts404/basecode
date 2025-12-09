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
        const { entry_data } = body;

        console.log('[CreateSingleWorkEntry] 📥 Datos recibidos:', JSON.stringify(entry_data, null, 2));

        // Validar campos requeridos
        const required = ['cleaner_id', 'cleaner_name', 'client_id', 'client_name', 'work_date', 'hours', 'activity', 'hourly_rate'];
        const missing = required.filter(field => !entry_data[field]);
        
        if (missing.length > 0) {
            console.error('[CreateSingleWorkEntry] ❌ Faltan campos requeridos:', missing);
            return Response.json({ 
                success: false, 
                error: `Faltan campos requeridos: ${missing.join(', ')}` 
            }, { status: 400 });
        }

        // Generar period si no existe
        let period = entry_data.period;
        if (!period) {
            const workDate = new Date(entry_data.work_date);
            const day = workDate.getDate();
            const month = workDate.getMonth() + 1;
            const year = workDate.getFullYear();
            const periodSuffix = day <= 15 ? '1st' : '2nd';
            period = `${year}-${String(month).padStart(2, '0')}-${periodSuffix}`;
        }

        // Calcular total_amount
        const totalAmount = parseFloat(entry_data.hours) * parseFloat(entry_data.hourly_rate);

        // Preparar datos para crear
        const workEntryData = {
            cleaner_id: entry_data.cleaner_id,
            cleaner_name: entry_data.cleaner_name,
            client_id: entry_data.client_id,
            client_name: entry_data.client_name,
            work_date: entry_data.work_date,
            hours: parseFloat(entry_data.hours),
            activity: entry_data.activity,
            hourly_rate: parseFloat(entry_data.hourly_rate),
            total_amount: totalAmount,
            period: period,
            invoiced: false
        };

        // Agregar campos opcionales si existen
        if (entry_data.other_activity) {
            workEntryData.other_activity = entry_data.other_activity;
        }
        if (entry_data.schedule_id) {
            workEntryData.schedule_id = entry_data.schedule_id;
        }

        console.log('[CreateSingleWorkEntry] 📝 Datos a crear:', JSON.stringify(workEntryData, null, 2));

        // Crear usando asServiceRole
        const newEntry = await base44.asServiceRole.entities.WorkEntry.create(workEntryData);

        console.log('[CreateSingleWorkEntry] ✅ ENTRADA CREADA EXITOSAMENTE');
        console.log('[CreateSingleWorkEntry] ID:', newEntry.id);
        console.log('[CreateSingleWorkEntry] Verificación:', {
            cleaner_id: newEntry.cleaner_id,
            client_id: newEntry.client_id,
            work_date: newEntry.work_date,
            hours: newEntry.hours,
            total_amount: newEntry.total_amount
        });

        return Response.json({
            success: true,
            entry: newEntry
        });

    } catch (error) {
        console.error('[CreateSingleWorkEntry] ❌ ERROR:', error);
        console.error('[CreateSingleWorkEntry] Stack:', error.stack);
        return Response.json({ 
            success: false,
            error: error.message,
            details: error.stack
        }, { status: 500 });
    }
});