import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { client_id, new_name, new_address } = await req.json();

        if (!client_id || (!new_name && !new_address)) {
            return Response.json({ error: 'client_id y al menos new_name o new_address son requeridos' }, { status: 400 });
        }

        // Obtener datos anteriores del cliente
        const client = await base44.asServiceRole.entities.Client.get(client_id);
        const old_name = client.name;

        // Construir el objeto de actualización para Schedules
        const scheduleUpdate: Record<string, string> = {};
        if (new_name) scheduleUpdate.client_name = new_name;
        if (new_address) scheduleUpdate.client_address = new_address;

        // Obtener todos los Schedules del cliente
        const schedules = await base44.asServiceRole.entities.Schedule.filter({ client_id });
        const scheduleUpdates = schedules.map(schedule =>
            base44.asServiceRole.entities.Schedule.update(schedule.id, scheduleUpdate)
        );

        // WorkEntries: solo actualizar nombre si cambió
        const workEntryUpdates = [];
        if (new_name) {
            const workEntries = await base44.asServiceRole.entities.WorkEntry.filter({ client_id });
            workEntries.forEach(entry =>
                workEntryUpdates.push(
                    base44.asServiceRole.entities.WorkEntry.update(entry.id, { client_name: new_name })
                )
            );
        }

        // ServiceReports: solo actualizar nombre si cambió
        const reportUpdates = [];
        if (new_name) {
            const serviceReports = await base44.asServiceRole.entities.ServiceReport.filter({ client_name: { $exists: true } });
            const clientReports = serviceReports.filter(report => {
                const schedule = schedules.find(s => s.id === report.schedule_id);
                return schedule && schedule.client_id === client_id;
            });
            clientReports.forEach(report =>
                reportUpdates.push(
                    base44.asServiceRole.entities.ServiceReport.update(report.id, { client_name: new_name })
                )
            );
        }

        // Tasks: solo actualizar nombre si cambió
        const taskUpdates = [];
        if (new_name) {
            const tasks = await base44.asServiceRole.entities.Task.filter({ related_client_id: client_id });
            tasks.forEach(task =>
                taskUpdates.push(
                    base44.asServiceRole.entities.Task.update(task.id, { related_client_name: new_name })
                )
            );
        }

        // ClientReconciliationReview: solo actualizar nombre si cambió
        const reviewUpdates = [];
        if (new_name) {
            const reviews = await base44.asServiceRole.entities.ClientReconciliationReview.filter({ client_name: old_name });
            reviews.forEach(review =>
                reviewUpdates.push(
                    base44.asServiceRole.entities.ClientReconciliationReview.update(review.id, { client_name: new_name })
                )
            );
        }

        // Ejecutar todas las actualizaciones en paralelo
        await Promise.all([...scheduleUpdates, ...workEntryUpdates, ...reportUpdates, ...taskUpdates, ...reviewUpdates]);

        return Response.json({
            success: true,
            updated: {
                schedules: schedules.length,
                workEntries: workEntryUpdates.length,
                serviceReports: reportUpdates.length,
                tasks: taskUpdates.length,
                reconciliationReviews: reviewUpdates.length
            }
        });
    } catch (error) {
        console.error('Error updating client cascade:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});