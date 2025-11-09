import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { taskId, assigneeIds, notificationType, message } = await req.json();
        
        if (!taskId || !assigneeIds || assigneeIds.length === 0 || !notificationType || !message) {
            throw new Error("taskId, assigneeIds, notificationType and message are required");
        }

        console.log('[createTaskNotifications] Creating notifications for task:', taskId);

        // Get task details
        const task = await base44.asServiceRole.entities.Task.get(taskId);
        if (!task) {
            throw new Error("Task not found");
        }

        const notifications = [];

        for (const userId of assigneeIds) {
            try {
                const notification = await base44.asServiceRole.entities.TaskNotification.create({
                    user_id: userId,
                    task_id: taskId,
                    task_title: task.title,
                    notification_type: notificationType,
                    message: message,
                    read: false,
                    action_url: `/AdminTasksPanel?task=${taskId}`
                });
                
                notifications.push(notification);
            } catch (error) {
                console.error(`Error creating notification for user ${userId}:`, error);
            }
        }

        console.log(`[createTaskNotifications] Created ${notifications.length} notifications`);

        return new Response(JSON.stringify({ 
            success: true,
            notifications_created: notifications.length
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('[createTaskNotifications] Error:', error);
        return new Response(JSON.stringify({ 
            success: false,
            error: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});