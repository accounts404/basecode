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
        const { work_entry_id } = body;

        if (!work_entry_id) {
            return Response.json({ error: 'Se requiere work_entry_id' }, { status: 400 });
        }

        // Obtener la entrada de trabajo
        const workEntry = await base44.asServiceRole.entities.WorkEntry.get(work_entry_id);

        if (!workEntry) {
            return Response.json({ error: 'Entrada de trabajo no encontrada' }, { status: 404 });
        }

        // Construir el prompt para el LLM
        let prompt = `Analiza la siguiente entrada de trabajo y proporciona un análisis detallado:

**Detalles de la Entrada:**
- ID: ${workEntry.id}
- Limpiador: ${workEntry.cleaner_name}
- Cliente: ${workEntry.client_name}
- Fecha: ${workEntry.work_date}
- Actividad: ${workEntry.activity}${workEntry.activity === 'otros' ? ` - ${workEntry.other_activity || 'Sin descripción'}` : ''}
- Horas: ${workEntry.hours}
- Tarifa por hora: $${workEntry.hourly_rate}
- Total: $${workEntry.total_amount}
- Facturada: ${workEntry.invoiced ? 'Sí' : 'No'}
`;

        // Si fue modificada por el limpiador, incluir esa información
        if (workEntry.modified_by_cleaner) {
            prompt += `\n**⚠️ MODIFICADA POR EL LIMPIADOR**
- Fecha de modificación: ${workEntry.last_modified_at}
- Valores originales: ${JSON.stringify(workEntry.original_values, null, 2)}
- Valores actuales: Horas: ${workEntry.hours}, Tarifa: $${workEntry.hourly_rate}, Total: $${workEntry.total_amount}
`;
        }

        prompt += `\n**Análisis requerido:**
1. ¿Hay algo inusual o sospechoso en esta entrada?
2. ¿Las horas y el monto son razonables para la actividad descrita?
3. Si fue modificada, ¿los cambios son justificables o preocupantes?
4. ¿Hay alguna inconsistencia en los datos?
5. Resume qué trabajo se realizó basándote en la actividad y el cliente.

Proporciona un análisis conciso pero completo en español.`;

        // Invocar el LLM
        const { data: aiAnalysis } = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: prompt,
            add_context_from_internet: false
        });

        console.log(`[AnalyzeWorkEntry] Análisis completado para entrada ${work_entry_id}`);

        return Response.json({
            success: true,
            work_entry: {
                id: workEntry.id,
                cleaner_name: workEntry.cleaner_name,
                client_name: workEntry.client_name,
                work_date: workEntry.work_date,
                activity: workEntry.activity,
                hours: workEntry.hours,
                total_amount: workEntry.total_amount
            },
            analysis: aiAnalysis
        });

    } catch (error) {
        console.error('[AnalyzeWorkEntry] Error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});