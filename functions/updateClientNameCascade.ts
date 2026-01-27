import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { client_id, new_name } = await req.json();

        if (!client_id || !new_name) {
            return Response.json({ error: 'client_id y new_name son requeridos' }, { status: 400 });
        }

        // Actualizar Schedules
        const schedules = await base44.asServiceRole.entities.Schedule.filter({ client_id });
        const scheduleUpdates = schedules.map(schedule =>
            base44.asServiceRole.entities.Schedule.update(schedule.id, { client_name: new_name })
        );

        // Actualizar WorkEntries
        const workEntries = await base44.asServiceRole.entities.WorkEntry.filter({ client_id });
        const workEntryUpdates = workEntries.map(entry =>
            base44.asServiceRole.entities.WorkEntry.update(entry.id, { client_name: new_name })
        );

        // Ejecutar todas las actualizaciones en paralelo
        await Promise.all([...scheduleUpdates, ...workEntryUpdates]);

        return Response.json({
            success: true,
            updated: {
                schedules: schedules.length,
                workEntries: workEntries.length
            }
        });
    } catch (error) {
        console.error('Error updating client name cascade:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});