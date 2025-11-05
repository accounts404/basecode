import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { report, cleaner_name, client_name, service_date } = await req.json();

        const priorityLabels = {
            low: "🟢 Baja",
            medium: "🟡 Media", 
            high: "🟠 Alta",
            urgent: "🔴 URGENTE"
        };

        const priorityLabel = priorityLabels[report.priority] || "🟡 Media";

        const emailSubject = `[${priorityLabel}] Reporte de Servicio - ${client_name}`;
        
        const emailBody = `
<h2>🚨 Nuevo Reporte de Servicio</h2>

<div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3>📋 Detalles del Servicio</h3>
    <p><strong>Cliente:</strong> ${client_name}</p>
    <p><strong>Limpiador:</strong> ${cleaner_name}</p>
    <p><strong>Fecha del Servicio:</strong> ${service_date}</p>
    <p><strong>Prioridad:</strong> ${priorityLabel}</p>
</div>

<div style="background: #fff3cd; padding: 20px; border-radius: 8px; border-left: 4px solid #ffc107;">
    <h3>📝 Descripción del Problema</h3>
    <p style="white-space: pre-wrap;">${report.report_notes}</p>
</div>

${report.report_photos && report.report_photos.length > 0 ? `
<div style="background: #e7f3ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3>📸 Fotos Adjuntas</h3>
    ${report.report_photos.map((photo, index) => `
        <p><a href="${photo.url}" target="_blank">Ver Foto ${index + 1}</a>
        ${photo.comment ? `- ${photo.comment}` : ''}</p>
    `).join('')}
</div>
` : ''}

<div style="background: #d1ecf1; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3>⚡ Acción Requerida</h3>
    <p>Este reporte requiere tu atención. Revisa los detalles y toma las acciones necesarias.</p>
    <p><a href="${base44.platformUrl || 'https://app.base44.com'}" target="_blank" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Ver en la Plataforma</a></p>
</div>

<hr style="margin: 30px 0;">
<p style="color: #666; font-size: 12px;">
    Este reporte fue generado automáticamente por RedOak Cleaning Solutions.<br>
    ID del Reporte: ${report.schedule_id}<br>
    Fecha de Generación: ${new Date().toLocaleString('es-ES', { timeZone: 'Australia/Sydney' })}
</p>
        `;

        await base44.asServiceRole.integrations.Core.SendEmail({
            to: 'accounts@redoakcleaning.com.au',
            subject: emailSubject,
            body: emailBody
        });

        return Response.json({ success: true, message: 'Notificación enviada exitosamente' });

    } catch (error) {
        console.error('Error enviando notificación de reporte:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});