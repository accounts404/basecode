import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        // Solo usuarios autenticados pueden llamar a esta función
        if (!(await base44.auth.isAuthenticated())) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { invoiceNumber, cleanerName, pdfUrl } = await req.json();

        if (!invoiceNumber || !cleanerName || !pdfUrl) {
            return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Usar rol de servicio para tener permisos para enviar el email
        await base44.asServiceRole.integrations.Core.SendEmail({
            to: "accounts@redoakcleaning.com.au",
            subject: `Nueva Factura ${invoiceNumber} - ${cleanerName}`,
            body: `Se ha generado una nueva factura de ${cleanerName}.

Número de Factura: ${invoiceNumber}

Puede revisar y descargar el archivo desde el siguiente enlace:
${pdfUrl}

Este es un mensaje automático generado por el sistema.`,
            from_name: 'Sistema RedOak'
        });

        return new Response(JSON.stringify({ success: true, message: 'Notification sent' }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error sending invoice notification:', error);
        // No fallar la respuesta, solo logear el error
        return new Response(JSON.stringify({ 
            success: false,
            error: error.message,
            message: 'Invoice created but notification failed'
        }), {
            status: 200, // Cambiar a 200 para que no se considere error
            headers: { 'Content-Type': 'application/json' }
        });
    }
});