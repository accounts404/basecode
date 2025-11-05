import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';
import { addDays, addWeeks, addMonths, format } from 'npm:date-fns@2.30.0';

// Función para generar tareas recurrentes por un máximo de 6 meses
async function generateRecurringTaskOccurrences(base44, originalTask) {
    const { recurrence_type } = originalTask;
    if (!recurrence_type || recurrence_type === 'none') {
        return [];
    }

    // Usar el ID de la tarea original como referencia
    const originalTaskId = originalTask.original_task_id || originalTask.id;
    
    // Actualizar la tarea original para que tenga el original_task_id si no lo tiene
    if (!originalTask.original_task_id) {
        await base44.asServiceRole.entities.Task.update(originalTask.id, { original_task_id: originalTaskId });
    }

    const tasksCreated = [];
    
    // Parsear la fecha de la tarea original como fecha local (sin zona horaria)
    // Si due_date es "2024-01-15", queremos que sea 15 de enero, no que se convierta
    const baseDateParts = originalTask.due_date.split('-');
    let currentDate = new Date(
        parseInt(baseDateParts[0]),
        parseInt(baseDateParts[1]) - 1,
        parseInt(baseDateParts[2])
    );
    
    // Límite de 6 meses (aproximadamente 180 días)
    const maxDate = addMonths(currentDate, 6);
    let iterationsCount = 0;
    const maxIterations = 200; // Seguridad para evitar bucles infinitos

    while (currentDate <= maxDate && iterationsCount < maxIterations) {
        let nextDate;
        
        switch (recurrence_type) {
            case 'daily':
                nextDate = addDays(currentDate, 1);
                break;
            case 'weekly':
                nextDate = addWeeks(currentDate, 1);
                break;
            case 'biweekly':
                nextDate = addWeeks(currentDate, 2);
                break;
            case 'monthly':
                nextDate = addMonths(currentDate, 1);
                break;
            default:
                return tasksCreated; // Tipo no reconocido
        }

        if (nextDate > maxDate) break;

        // Formatear la fecha en formato local YYYY-MM-DD
        const nextDateString = format(nextDate, 'yyyy-MM-dd');

        // Crear la nueva tarea recurrente
        const newTask = {
            title: originalTask.title,
            description: originalTask.description,
            due_date: nextDateString,
            priority: originalTask.priority,
            status: 'pending',
            recurrence_type: originalTask.recurrence_type,
            original_task_id: originalTaskId,
            created_by_user_id: originalTask.created_by_user_id
        };

        try {
            const createdTask = await base44.asServiceRole.entities.Task.create(newTask);
            if (createdTask) {
                tasksCreated.push(createdTask);
            }
        } catch (e) {
            console.error(`Error creando tarea recurrente: ${e.message}`);
            // Continuar con la siguiente aunque una falle
        }
        
        currentDate = nextDate;
        iterationsCount++;
    }
    
    return tasksCreated;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verificar que el usuario es admin
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const originalTask = await req.json();

        if (!originalTask || !originalTask.id) {
            throw new Error("Se requiere una tarea base para generar recurrencias.");
        }

        const newTasks = await generateRecurringTaskOccurrences(base44, originalTask);
        
        return new Response(JSON.stringify({
            success: true,
            original_task_id: originalTask.id,
            created_tasks: newTasks.length,
            tasks: newTasks
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('Error in generateRecurringTasks:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});