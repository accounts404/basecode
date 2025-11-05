import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    try {
        const reminderResponse = await base44.asServiceRole.functions.invoke('sendAttendanceReminders', {});
        
        return new Response(JSON.stringify({
            success: true,
            triggered_at: new Date().toISOString(),
            message: "Daily attendance reminders check completed",
            reminder_results: reminderResponse
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ 
            error: error.message,
            triggered_at: new Date().toISOString()
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});