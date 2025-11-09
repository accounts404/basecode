import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { taskId, oldStatus, newStatus, taskTitle } = await req.json();
        
        if (!taskId || !newStatus) {
            throw new Error("taskId and newStatus are required");
        }

        console.log('[notifyTaskStatusChange] Notifying status change for task:', taskId);

        // Get task details
        const task = await base44.asServiceRole.entities.Task.get(taskId);
        if (!task) {
            throw new Error("Task not found");
        }

        // Only notify if task has assignees
        if (!task.assignee_user_ids || task.assignee_user_ids.length === 0) {
            return new Response(JSON.stringify({ 
                success: true,
                notifications_sent: 0,
                message: 'No assignees to notify'
            }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // Get current user (who made the change)
        const currentUser = await base44.auth.me().catch(() => ({ full_name: 'Sistema' }));

        // Get assignee user details
        const assignees = await Promise.all(
            task.assignee_user_ids.map(id => base44.asServiceRole.entities.User.get(id).catch(() => null))
        );

        const validAssignees = assignees.filter(Boolean);

        const statusLabels = {
            'pending': 'Pendiente',
            'in_progress': 'En Progreso',
            'completed': 'Completada',
            'cancelled': 'Cancelada'
        };

        const statusEmojis = {
            'pending': '⏳',
            'in_progress': '🔄',
            'completed': '✅',
            'cancelled': '❌'
        };

        // Send email to each assignee
        const emailPromises = validAssignees.map(assignee => {
            const emailBody = `
Hola ${assignee.full_name},

El estado de una tarea asignada a ti ha cambiado:

📋 Tarea: ${taskTitle || task.title}
${oldStatus ? `Estado anterior: ${statusLabels[oldStatus] || oldStatus}\n` : ''}Estado nuevo: ${statusEmojis[newStatus]} ${statusLabels[newStatus] || newStatus}
👤 Actualizado por: ${currentUser.full_name || 'Sistema'}

${newStatus === 'completed' ? '🎉 ¡Felicitaciones por completar esta tarea!' : ''}
${newStatus === 'cancelled' ? 'Esta tarea ha sido cancelada y ya no requiere acción.' : ''}

Ingresa al sistema para ver más detalles.

Saludos,
Sistema RedOak Cleaning Solutions
            `.trim();

            return base44.asServiceRole.integrations.Core.SendEmail({
                to: assignee.email,
                subject: `Actualización de Tarea: ${taskTitle || task.title}`,
                body: emailBody,
                from_name: 'RedOak Task Manager'
            }).catch(error => {
                console.error(`Error sending email to ${assignee.email}:`, error);
                return { error: error.message };
            });
        });

        const results = await Promise.all(emailPromises);
        const successCount = results.filter(r => !r.error).length;

        console.log(`[notifyTaskStatusChange] Sent ${successCount}/${validAssignees.length} notifications`);

        return new Response(JSON.stringify({ 
            success: true,
            notifications_sent: successCount,
            total_assignees: validAssignees.length
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('[notifyTaskStatusChange] Error:', error);
        return new Response(JSON.stringify({ 
            success: false,
            error: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});