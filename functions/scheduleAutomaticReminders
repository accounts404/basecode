import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

// Esta función debería ser ejecutada diariamente por un cron job
// Por ahora, puede ser ejecutada manualmente para pruebas
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    try {
        const today = new Date();
        const day = today.getDate();
        
        console.log(`Checking automatic reminders for day ${day}`);

        // Solo ejecutar en días 1 y 16
        if (day !== 1 && day !== 16) {
            return new Response(JSON.stringify({ 
                message: 'No es día de recordatorios automáticos',
                day: day,
                next_run: day < 16 ? 16 : 1
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Llamar a la función de envío de recordatorios
        const reminderResponse = await base44.asServiceRole.functions.invoke('sendPaymentReminders', {});
        
        return new Response(JSON.stringify({
            success: true,
            automated_run: true,
            day: day,
            reminder_results: reminderResponse
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error in scheduled reminders:', error);
        return new Response(JSON.stringify({ 
            error: error.message,
            day: new Date().getDate()
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});