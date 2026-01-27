import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { client_id, old_name, new_name } = await req.json();

        if (!client_id || !old_name || !new_name) {
            return Response.json({ error: 'client_id, old_name y new_name son requeridos' }, { status: 400 });
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

        // Actualizar ServiceReports
        const serviceReports = await base44.asServiceRole.entities.ServiceReport.filter({ client_name: { $exists: true } });
        const clientReports = serviceReports.filter(report => {
            const schedule = schedules.find(s => s.id === report.schedule_id);
            return schedule && schedule.client_id === client_id;
        });
        const reportUpdates = clientReports.map(report =>
            base44.asServiceRole.entities.ServiceReport.update(report.id, { client_name: new_name })
        );

        // Actualizar Tasks relacionadas
        const tasks = await base44.asServiceRole.entities.Task.filter({ related_client_id: client_id });
        const taskUpdates = tasks.map(task =>
            base44.asServiceRole.entities.Task.update(task.id, { related_client_name: new_name })
        );

        // Actualizar ClientReconciliationReview
        const reviews = await base44.asServiceRole.entities.ClientReconciliationReview.filter({ client_name: old_name });
        const reviewUpdates = reviews.map(review =>
            base44.asServiceRole.entities.ClientReconciliationReview.update(review.id, { client_name: new_name })
        );

        // Ejecutar todas las actualizaciones en paralelo
        await Promise.all([...scheduleUpdates, ...workEntryUpdates, ...reportUpdates, ...taskUpdates, ...reviewUpdates]);

        return Response.json({
            success: true,
            updated: {
                schedules: schedules.length,
                workEntries: workEntries.length,
                serviceReports: clientReports.length,
                tasks: tasks.length,
                reconciliationReviews: reviews.length
            }
        });
    } catch (error) {
        console.error('Error updating client name cascade:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});