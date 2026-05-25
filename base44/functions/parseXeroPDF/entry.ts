import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { fileUrl, periodLabel } = await req.json();

    if (!fileUrl) {
        return Response.json({ error: 'fileUrl requerido' }, { status: 400 });
    }

    // Usar InvokeLLM para extraer la tabla del PDF de Xero
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `Este es un reporte de "Sales Transactions" de Xero para una empresa de limpieza. 
Extrae TODOS los contactos (clientes) con sus montos.

El PDF tiene columnas: CONTACT, DATE, SOURCE, DESCRIPTION, REFERENCE, DEBIT, CREDIT, GROSS, GST, ACCOUNT

Para cada fila de cliente (no la fila "Total"), extrae:
- contact: nombre del contacto exactamente como aparece
- credit: el valor numérico de la columna CREDIT (sin GST, puede ser el monto base)
- gross: el valor numérico de la columna GROSS (con GST)
- gst: el valor numérico de la columna GST (puede ser "-" o vacío = 0)

Importante: 
- Ignora la fila "Total" al final
- Si CREDIT tiene "-" es 0
- Los números usan coma como separador de miles (ej: 1,301.80 = 1301.80)
- Si GST es "-" o vacío, es 0

Devuelve un JSON con: { period: "${periodLabel || 'Sin período'}", contacts: [{contact, credit, gross, gst}] }`,
        file_urls: [fileUrl],
        response_json_schema: {
            type: "object",
            properties: {
                period: { type: "string" },
                contacts: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            contact: { type: "string" },
                            credit: { type: "number" },
                            gross: { type: "number" },
                            gst: { type: "number" }
                        },
                        required: ["contact", "credit", "gross", "gst"]
                    }
                }
            },
            required: ["period", "contacts"]
        }
    });

    return Response.json({ success: true, data: result });
});