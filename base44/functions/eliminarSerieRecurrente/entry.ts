import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { scheduleId, deleteMode } = await req.json();

        if (!scheduleId || !deleteMode) {
            return Response.json({ error: 'Se requiere scheduleId y deleteMode' }, { status: 400 });
        }

        console.log(`[eliminarSerieRecurrente] scheduleId: ${scheduleId}, deleteMode: ${deleteMode}`);

        let scheduleToDelete;
        try {
            scheduleToDelete = await base44.asServiceRole.entities.Schedule.get(scheduleId);
        } catch (error) {
            if (error.message && error.message.includes('not found')) {
                return Response.json({ success: true, deletedCount: 0, mode: deleteMode, message: 'El servicio ya fue eliminado previamente' });
            }
            throw error;
        }

        let deletedCount = 0;

        if (deleteMode === 'only_this') {
            try {
                await base44.asServiceRole.entities.Schedule.delete(scheduleId);
                deletedCount = 1;
            } catch (error) {
                if (!error.message?.includes('not found')) throw error;
            }
        } else if (deleteMode === 'this_and_future') {
            if (!scheduleToDelete.recurrence_id) {
                try {
                    await base44.asServiceRole.entities.Schedule.delete(scheduleId);
                    deletedCount = 1;
                } catch (error) {
                    if (!error.message?.includes('not found')) throw error;
                }
            } else {
                let seriesSchedules = await base44.asServiceRole.entities.Schedule.filter({
                    recurrence_id: scheduleToDelete.recurrence_id
                });

                if (!Array.isArray(seriesSchedules)) {
                    seriesSchedules = seriesSchedules?.items || seriesSchedules?.data || [];
                }

                const targetDate = new Date(scheduleToDelete.start_time);
                const schedulesToDelete = seriesSchedules.filter(s => new Date(s.start_time) >= targetDate);

                const deleteResults = await Promise.allSettled(
                    schedulesToDelete.map(async (s) => {
                        try {
                            await base44.asServiceRole.entities.Schedule.delete(s.id);
                            return { success: true };
                        } catch (error) {
                            if (error.message?.includes('not found')) return { success: true };
                            return { success: false, error: error.message };
                        }
                    })
                );

                deletedCount = deleteResults.filter(r => r.value?.success).length;
            }
        }

        console.log(`[eliminarSerieRecurrente] Eliminados: ${deletedCount}`);
        return Response.json({ success: true, deletedCount, mode: deleteMode });

    } catch (error) {
        console.error('[eliminarSerieRecurrente] Error:', error);
        return Response.json({ error: error.message || 'Error desconocido' }, { status: 500 });
    }
});