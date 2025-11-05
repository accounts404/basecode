import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('[checkActiveService] Verificando servicio activo para:', user.id);

        // Consulta optimizada: solo servicios activos del limpiador
        const schedules = await base44.entities.Schedule.filter({
            cleaner_ids: { $contains: user.id },
            status: { $in: ['scheduled', 'in_progress'] }
        });

        // Buscar servicio activo (con clock_in pero sin clock_out)
        const activeService = schedules.find(schedule => {
            if (!schedule.clock_in_data) return false;
            const cleanerClockData = schedule.clock_in_data.find(c => c.cleaner_id === user.id);
            return cleanerClockData?.clock_in_time && !cleanerClockData?.clock_out_time;
        });

        if (activeService) {
            console.log('[checkActiveService] ✅ Servicio activo encontrado:', activeService.id);
            return Response.json({
                hasActive: true,
                service: {
                    id: activeService.id,
                    client_name: activeService.client_name,
                    client_address: activeService.client_address,
                    start_time: activeService.start_time,
                    end_time: activeService.end_time,
                    client_id: activeService.client_id
                }
            });
        }

        console.log('[checkActiveService] ℹ️ No hay servicio activo');
        return Response.json({ hasActive: false, service: null });

    } catch (error) {
        console.error('[checkActiveService] ❌ Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});