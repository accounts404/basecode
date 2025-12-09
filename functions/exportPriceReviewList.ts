import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { listId } = await req.json();

        if (!listId) {
            return Response.json({ error: 'listId is required' }, { status: 400 });
        }

        // Obtener la lista de revisión de precios
        const lists = await base44.entities.ClientPriceReviewList.filter({ id: listId });
        
        if (!lists || lists.length === 0) {
            return Response.json({ error: 'Lista no encontrada' }, { status: 404 });
        }

        const list = lists[0];

        // Generar CSV
        const headers = [
            'Nombre de Lista',
            'Fecha de Revisión',
            'Estado',
            'Objetivo de Rentabilidad (%)',
            'Período Inicio',
            'Período Fin',
            'Cliente',
            'Cantidad de Servicios',
            'Horas Totales',
            'Rentabilidad Actual (%)',
            'Precio Actual (Base)',
            'Precio Sugerido (Base)',
            'Ajuste por Servicio',
            'Ajuste (%)',
            'Tipo GST',
            'Precio Actual (con GST)',
            'Precio Sugerido (con GST)',
            'Notas del Cliente',
            'Excluido'
        ];

        const rows = [headers];

        // Agregar datos de clientes
        if (list.clients_to_review && list.clients_to_review.length > 0) {
            list.clients_to_review.forEach(client => {
                const gstMultiplier = (client.gst_type === 'inclusive' || client.gst_type === 'exclusive') ? 1.1 : 1;
                const currentPriceWithGST = (client.current_price_base || 0) * gstMultiplier;
                const suggestedPriceWithGST = (client.suggested_new_price || 0) * gstMultiplier;

                rows.push([
                    list.list_name || '',
                    list.review_date || '',
                    list.status || '',
                    list.target_profit_percentage || '',
                    list.period_start || '',
                    list.period_end || '',
                    client.client_name || '',
                    client.service_count || 0,
                    (client.total_hours || 0).toFixed(2),
                    (client.current_real_profit_percentage || 0).toFixed(2),
                    (client.current_price_base || 0).toFixed(2),
                    (client.suggested_new_price || 0).toFixed(2),
                    (client.adjustment_per_service || 0).toFixed(2),
                    (client.adjustment_percentage || 0).toFixed(2),
                    client.gst_type || 'inclusive',
                    currentPriceWithGST.toFixed(2),
                    suggestedPriceWithGST.toFixed(2),
                    client.notes || '',
                    client.excluded ? 'Sí' : 'No'
                ]);
            });
        }

        // Convertir a CSV
        const csvContent = rows.map(row => 
            row.map(cell => {
                // Escapar comillas y envolver en comillas si contiene comas, saltos de línea o comillas
                const cellStr = String(cell);
                if (cellStr.includes(',') || cellStr.includes('\n') || cellStr.includes('"')) {
                    return `"${cellStr.replace(/"/g, '""')}"`;
                }
                return cellStr;
            }).join(',')
        ).join('\n');

        // Agregar BOM para UTF-8 (para que Excel reconozca caracteres especiales)
        const bom = '\uFEFF';
        const csvWithBom = bom + csvContent;

        // Generar nombre de archivo
        const fileName = `revision_precios_${list.list_name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;

        return new Response(csvWithBom, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${fileName}"`
            }
        });

    } catch (error) {
        console.error('Error exporting price review list:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});