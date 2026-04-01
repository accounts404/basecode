import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verificar que el usuario es admin
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const { scheduleId, deleteMode } = await req.json();

        if (!scheduleId || !deleteMode) {
            throw new Error("Se requiere scheduleId y deleteMode");
        }

        console.log(`[eliminarSerieRecurrente] Iniciando eliminación. scheduleId: ${scheduleId}, deleteMode: ${deleteMode}`);

        let deletedCount = 0;
        let scheduleToDelete;

        try {
            // Obtener el servicio a eliminar
            scheduleToDelete = await base44.asServiceRole.entities.Schedule.get(scheduleId);
            console.log(`[eliminarSerieRecurrente] Servicio encontrado:`, scheduleToDelete);
        } catch (error) {
            // Si el servicio ya no existe, considerarlo como "ya eliminado"
            if (error.message && error.message.includes('not found')) {
                console.log(`[eliminarSerieRecurrente] Servicio ya eliminado`);
                return new Response(JSON.stringify({
                    success: true,
                    deletedCount: 0,
                    mode: deleteMode,
                    message: "El servicio ya fue eliminado previamente"
                }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 200,
                });
            }
            throw error;
        }

        if (deleteMode === 'only_this') {
            // Eliminar solo este servicio
            console.log(`[eliminarSerieRecurrente] Modo: solo este servicio`);
            try {
                await base44.asServiceRole.entities.Schedule.delete(scheduleId);
                deletedCount = 1;
                console.log(`[eliminarSerieRecurrente] Servicio eliminado exitosamente`);
            } catch (error) {
                if (error.message && error.message.includes('not found')) {
                    deletedCount = 0;
                } else {
                    throw error;
                }
            }
        } else if (deleteMode === 'this_and_future') {
            // Eliminar este servicio y todos los futuros de la serie
            console.log(`[eliminarSerieRecurrente] Modo: este y futuros`);
            
            if (!scheduleToDelete.recurrence_id) {
                console.log(`[eliminarSerieRecurrente] No tiene recurrence_id, eliminando solo este`);
                // Si no tiene recurrence_id, solo eliminar este
                try {
                    await base44.asServiceRole.entities.Schedule.delete(scheduleId);
                    deletedCount = 1;
                } catch (error) {
                    if (error.message && error.message.includes('not found')) {
                        deletedCount = 0;
                    } else {
                        throw error;
                    }
                }
            } else {
                console.log(`[eliminarSerieRecurrente] Buscando servicios con recurrence_id: ${scheduleToDelete.recurrence_id}`);
                
                // CORREGIDO: Usar filter en lugar de list para obtener solo los schedules de esta serie
                let seriesSchedules;
                try {
                    seriesSchedules = await base44.asServiceRole.entities.Schedule.filter({
                        recurrence_id: scheduleToDelete.recurrence_id
                    });
                    console.log(`[eliminarSerieRecurrente] Schedules encontrados en la serie: ${seriesSchedules?.length || 0}`);
                } catch (filterError) {
                    console.error('[eliminarSerieRecurrente] Error al filtrar schedules:', filterError);
                    throw new Error(`No se pudieron obtener los servicios de la serie: ${filterError.message}`);
                }
                
                // Asegurarse de que seriesSchedules es un array (el SDK puede devolver objeto paginado)
                if (!Array.isArray(seriesSchedules)) {
                    seriesSchedules = seriesSchedules?.items || seriesSchedules?.data || [];
                    console.log(`[eliminarSerieRecurrente] Convertido a array, total: ${seriesSchedules.length}`);
                }
                
                if (seriesSchedules.length === 0) {
                    console.log('[eliminarSerieRecurrente] No se encontraron otros servicios en la serie, eliminando solo este');
                    // Si no hay otros en la serie, eliminar solo este
                    try {
                        await base44.asServiceRole.entities.Schedule.delete(scheduleId);
                        deletedCount = 1;
                    } catch (error) {
                        if (error.message && error.message.includes('not found')) {
                            deletedCount = 0;
                        } else {
                            throw error;
                        }
                    }
                } else {
                    // Filtrar servicios desde la fecha del servicio actual hacia adelante
                    const targetDate = new Date(scheduleToDelete.start_time);
                    console.log(`[eliminarSerieRecurrente] Fecha objetivo: ${targetDate.toISOString()}`);
                    
                    const schedulesToDelete = seriesSchedules.filter(s => 
                        new Date(s.start_time) >= targetDate
                    );
                    console.log(`[eliminarSerieRecurrente] Servicios a eliminar (desde fecha): ${schedulesToDelete.length}`);

                    // Eliminar cada servicio individualmente con manejo de errores
                    const deleteResults = await Promise.allSettled(
                        schedulesToDelete.map(async (s) => {
                            try {
                                await base44.asServiceRole.entities.Schedule.delete(s.id);
                                console.log(`[eliminarSerieRecurrente] Eliminado: ${s.id}`);
                                return { success: true, id: s.id };
                            } catch (error) {
                                if (error.message && error.message.includes('not found')) {
                                    console.log(`[eliminarSerieRecurrente] Ya eliminado: ${s.id}`);
                                    return { success: true, id: s.id, alreadyDeleted: true };
                                }
                                console.error(`[eliminarSerieRecurrente] Error eliminando ${s.id}:`, error);
                                return { success: false, id: s.id, error: error.message };
                            }
                        })
                    );

                    // Contar eliminaciones exitosas
                    deletedCount = deleteResults.filter(result => result.value?.success).length;
                    console.log(`[eliminarSerieRecurrente] Total eliminados: ${deletedCount}`);
                    
                    // Log errores para debugging
                    const failed = deleteResults.filter(result => !result.value?.success);
                    if (failed.length > 0) {
                        console.warn('[eliminarSerieRecurrente] Algunos servicios no pudieron ser eliminados:', failed);
                    }
                }
            }
        }

        console.log(`[eliminarSerieRecurrente] Operación completada. Eliminados: ${deletedCount}`);

        return new Response(JSON.stringify({
            success: true,
            deletedCount,
            mode: deleteMode
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('[eliminarSerieRecurrente] Error general:', error);
        return new Response(JSON.stringify({ 
            error: error.message || 'Error desconocido',
            stack: error.stack
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});