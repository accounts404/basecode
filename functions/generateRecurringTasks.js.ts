import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { addDays, addWeeks, addMonths, setDay, setDate as setDayOfMonth, startOfDay } from 'npm:date-fns@2.30.0';

async function generateTaskInstances(base44, originalTask, monthsToGenerate = 6) {
    const { recurrence_type } = originalTask;
    
    if (!recurrence_type || recurrence_type === 'none' || recurrence_type === 'linked_to_service') {
        return [];
    }

    const taskRecurrenceId = originalTask.task_recurrence_id || originalTask.id;
    
    if (!originalTask.task_recurrence_id) {
        await base44.asServiceRole.entities.Task.update(originalTask.id, { 
            task_recurrence_id: taskRecurrenceId 
        });
    }

    // Anti-duplication: fetch existing tasks in this series
    const existingTasks = await base44.asServiceRole.entities.Task.filter({ 
        task_recurrence_id: taskRecurrenceId 
    });
    const existingDueDates = new Set(existingTasks.map(t => startOfDay(new Date(t.due_date)).toISOString()));

    const tasksCreated = [];
    let currentDueDate = new Date(originalTask.due_date);
    const maxIterations = monthsToGenerate * 5; // Enough to cover all frequencies

    for (let i = 0; i < maxIterations; i++) {
        let nextDueDate;

        switch (recurrence_type) {
            case 'daily':
                nextDueDate = addDays(currentDueDate, 1);
                break;
            
            case 'weekly':
                if (originalTask.recurring_day_of_week !== null && originalTask.recurring_day_of_week !== undefined) {
                    // If a specific day of week is set, jump to that day next week
                    nextDueDate = addWeeks(currentDueDate, 1);
                    nextDueDate = setDay(nextDueDate, originalTask.recurring_day_of_week, { weekStartsOn: 1 });
                } else {
                    // Default: just add 7 days
                    nextDueDate = addWeeks(currentDueDate, 1);
                }
                break;
            
            case 'biweekly':
                if (originalTask.recurring_day_of_week !== null && originalTask.recurring_day_of_week !== undefined) {
                    nextDueDate = addWeeks(currentDueDate, 2);
                    nextDueDate = setDay(nextDueDate, originalTask.recurring_day_of_week, { weekStartsOn: 1 });
                } else {
                    nextDueDate = addWeeks(currentDueDate, 2);
                }
                break;
            
            case 'monthly':
                nextDueDate = addMonths(currentDueDate, 1);
                if (originalTask.recurring_day_of_month !== null && originalTask.recurring_day_of_month !== undefined) {
                    // Set to specific day of month
                    try {
                        nextDueDate = setDayOfMonth(nextDueDate, originalTask.recurring_day_of_month);
                    } catch (e) {
                        // If day doesn't exist in month (e.g., Feb 30), use last day of month
                        console.warn(`Day ${originalTask.recurring_day_of_month} doesn't exist in month, using last day`);
                    }
                }
                break;
            
            default:
                console.warn(`[generateTaskInstances] Unknown recurrence type: ${recurrence_type}`);
                return tasksCreated;
        }

        // Check for duplicates
        const nextDayStartISO = startOfDay(nextDueDate).toISOString();
        if (existingDueDates.has(nextDayStartISO)) {
            currentDueDate = nextDueDate;
            continue;
        }

        // Create new task instance
        const newTask = {
            ...originalTask,
            due_date: nextDueDate.toISOString().split('T')[0], // YYYY-MM-DD format
            status: 'pending',
            task_recurrence_id: taskRecurrenceId,
            original_task_id: originalTask.id,
            checklist_items: originalTask.checklist_items ? 
                originalTask.checklist_items.map(item => ({ ...item, completed: false })) : 
                [],
            comments: [], // Reset comments for new instance
        };
        delete newTask.id;
        delete newTask.created_date;
        delete newTask.updated_date;

        try {
            const created = await base44.asServiceRole.entities.Task.create(newTask);
            if (created) {
                tasksCreated.push(created);
            }
        } catch (e) {
            console.error(`Error creating recurring task: ${e.message}`);
        }

        currentDueDate = nextDueDate;
    }

    return tasksCreated;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const task = await req.json();
        
        if (!task || !task.id) {
            throw new Error("Task object with 'id' is required");
        }

        console.log('[generateRecurringTasks] Generating recurring tasks for:', task.title);

        const newTasks = await generateTaskInstances(base44, task, 6);
        
        console.log(`[generateRecurringTasks] Process completed. Created ${newTasks.length} future tasks.`);

        return new Response(JSON.stringify({ 
            success: true,
            created_tasks: newTasks.length,
            tasks: newTasks 
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('[generateRecurringTasks] Error:', error);
        return new Response(JSON.stringify({ 
            success: false,
            error: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});