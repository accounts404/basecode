import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { addDays, isBefore, startOfDay } from 'npm:date-fns@2.30.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('[sendTaskReminders] Starting task reminder check...');

        // Get all tasks that are not completed or cancelled
        const allTasks = await base44.asServiceRole.entities.Task.filter({
            status: { $nin: ['completed', 'cancelled'] }
        });

        const tomorrow = addDays(startOfDay(new Date()), 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        let remindersSent = 0;
        const errors = [];

        for (const task of allTasks) {
            if (!task.due_date) continue;
            
            const dueDate = new Date(task.due_date);
            const dueDateStr = dueDate.toISOString().split('T')[0];
            
            // Check if task is due tomorrow
            const isDueTomorrow = dueDateStr === tomorrowStr;
            
            // Check if task is overdue and reminder hasn't been sent in last 24 hours
            const isOverdue = isBefore(dueDate, startOfDay(new Date()));
            const lastReminderSent = task.reminder_sent_at ? new Date(task.reminder_sent_at) : null;
            const needsOverdueReminder = isOverdue && (!lastReminderSent || 
                (new Date().getTime() - lastReminderSent.getTime()) > 86400000); // 24 hours

            if (!isDueTomorrow && !needsOverdueReminder) {
                continue;
            }

            // Only send to assigned users
            if (!task.assignee_user_ids || task.assignee_user_ids.length === 0) {
                continue;
            }

            try {
                // Get assignee details
                const assignees = await Promise.all(
                    task.assignee_user_ids.map(id => 
                        base44.asServiceRole.entities.User.get(id).catch(() => null)
                    )
                );

                const validAssignees = assignees.filter(Boolean);

                for (const assignee of validAssignees) {
                    const reminderType = isDueTomorrow ? 'due_reminder' : 'overdue_alert';
                    const subject = isDueTomorrow 
                        ? `⏰ Recordatorio: Tarea vence mañana - ${task.title}`
                        : `🚨 Alerta: Tarea atrasada - ${task.title}`;
                    
                    const emailBody = `
Hola ${assignee.full_name},

${isDueTomorrow 
    ? '⏰ Esta es una tarea asignada a ti que vence MAÑANA:' 
    : '🚨 ALERTA: Esta tarea está ATRASADA:'}

📋 Título: ${task.title}
📅 Fecha límite: ${new Date(task.due_date).toLocaleDateString('es-ES', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
})}
⚡ Prioridad: ${task.priority === 'urgent' ? '🔴 Urgente' : task.priority === 'high' ? '🟠 Alta' : task.priority === 'medium' ? '🔵 Media' : '🟢 Baja'}
📊 Estado: ${task.status === 'pending' ? 'Pendiente' : 'En Progreso'}

${task.description ? `\nDescripción:\n${task.description}` : ''}

${isDueTomorrow 
    ? 'Por favor, asegúrate de completar esta tarea antes de que venza.' 
    : '⚠️ Esta tarea ya venció. Por favor, actualiza su estado o complétala lo antes posible.'}

Ingresa al sistema para gestionar esta tarea.

Saludos,
Sistema RedOak Cleaning Solutions
                    `.trim();

                    // Send email
                    await base44.asServiceRole.integrations.Core.SendEmail({
                        to: assignee.email,
                        subject: subject,
                        body: emailBody,
                        from_name: 'RedOak Task Manager'
                    });

                    // Create in-app notification
                    await base44.asServiceRole.entities.TaskNotification.create({
                        user_id: assignee.id,
                        task_id: task.id,
                        task_title: task.title,
                        notification_type: reminderType,
                        message: isDueTomorrow 
                            ? `⏰ Tarea vence mañana: "${task.title}"`
                            : `🚨 Tarea atrasada: "${task.title}"`,
                        read: false,
                        action_url: `/AdminTasksPanel?task=${task.id}`
                    });

                    remindersSent++;
                }

                // Update task to mark reminder as sent
                await base44.asServiceRole.entities.Task.update(task.id, {
                    reminder_sent_at: new Date().toISOString()
                });

            } catch (error) {
                console.error(`Error processing task ${task.id}:`, error);
                errors.push({ taskId: task.id, error: error.message });
            }
        }

        console.log(`[sendTaskReminders] Process completed. Sent ${remindersSent} reminders`);

        return new Response(JSON.stringify({ 
            success: true,
            reminders_sent: remindersSent,
            errors: errors.length > 0 ? errors : undefined
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('[sendTaskReminders] Error:', error);
        return new Response(JSON.stringify({ 
            success: false,
            error: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});