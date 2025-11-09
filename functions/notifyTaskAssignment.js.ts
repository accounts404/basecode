import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { taskId, assigneeIds, createdBy } = await req.json();
        
        if (!taskId || !assigneeIds || assigneeIds.length === 0) {
            throw new Error("taskId and assigneeIds are required");
        }

        console.log('[notifyTaskAssignment] Sending notifications for task:', taskId);

        // Get task details
        const task = await base44.asServiceRole.entities.Task.get(taskId);
        if (!task) {
            throw new Error("Task not found");
        }

        // Get assignee user details
        const assignees = await Promise.all(
            assigneeIds.map(id => base44.asServiceRole.entities.User.get(id).catch(() => null))
        );

        const validAssignees = assignees.filter(Boolean);

        // Send email to each assignee
        const emailPromises = validAssignees.map(assignee => {
            const emailBody = `
Hola ${assignee.full_name},

Se te ha asignado una nueva tarea en el sistema RedOak:

📋 Título: ${task.title}
📅 Fecha límite: ${new Date(task.due_date).toLocaleDateString('es-ES', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
})}
⚡ Prioridad: ${task.priority === 'urgent' ? '🔴 Urgente' : task.priority === 'high' ? '🟠 Alta' : task.priority === 'medium' ? '🔵 Media' : '🟢 Baja'}
👤 Asignado por: ${createdBy || 'Administrador'}

${task.description ? `\nDescripción:\n${task.description}` : ''}

Ingresa al sistema para ver más detalles y gestionar esta tarea.

Saludos,
Sistema RedOak Cleaning Solutions
            `.trim();

            return base44.asServiceRole.integrations.Core.SendEmail({
                to: assignee.email,
                subject: `Nueva Tarea Asignada: ${task.title}`,
                body: emailBody,
                from_name: 'RedOak Task Manager'
            }).catch(error => {
                console.error(`Error sending email to ${assignee.email}:`, error);
                return { error: error.message };
            });
        });

        const results = await Promise.all(emailPromises);
        const successCount = results.filter(r => !r.error).length;

        console.log(`[notifyTaskAssignment] Sent ${successCount}/${validAssignees.length} notifications`);

        return new Response(JSON.stringify({ 
            success: true,
            notifications_sent: successCount,
            total_assignees: validAssignees.length
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('[notifyTaskAssignment] Error:', error);
        return new Response(JSON.stringify({ 
            success: false,
            error: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});