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
        const { work_entry_id, reason } = body;

        if (!work_entry_id) {
            return Response.json({ error: 'Se requiere work_entry_id' }, { status: 400 });
        }

        // Verificar que la entrada existe y no está facturada
        const workEntry = await base44.asServiceRole.entities.WorkEntry.get(work_entry_id);

        if (!workEntry) {
            return Response.json({ error: 'Entrada de trabajo no encontrada' }, { status: 404 });
        }

        if (workEntry.invoiced) {
            return Response.json({ 
                error: 'No se puede eliminar una entrada que ya está facturada' 
            }, { status: 400 });
        }

        // Eliminar la entrada
        await base44.asServiceRole.entities.WorkEntry.delete(work_entry_id);

        console.log(`[DeleteWorkEntry] Entrada ${work_entry_id} eliminada por admin ${user.email}. Razón: ${reason || 'No especificada'}`);

        return Response.json({
            success: true,
            message: 'Entrada de trabajo eliminada exitosamente',
            deleted_entry: {
                id: workEntry.id,
                cleaner_name: workEntry.cleaner_name,
                client_name: workEntry.client_name,
                work_date: workEntry.work_date
            }
        });

    } catch (error) {
        console.error('[DeleteWorkEntry] Error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});