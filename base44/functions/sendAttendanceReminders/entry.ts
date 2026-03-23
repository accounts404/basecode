
import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        if (!(await base44.auth.isAuthenticated())) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
        const adminUser = admins?.[0];
        const emailConfig = adminUser?.email_config || {};
        const defaultTemplate = `¡Hola {cleaner_name}!\n\nConfirmamos que trabajaste durante el período {period_label}, pero notamos que aún no has registrado tus horas en el sistema.\n\nPor favor, ingresa a la aplicación y añade todas tus horas trabajadas lo antes posible para asegurar que tu pago se procese correctamente.\n\nSi tienes alguna pregunta, no dudes en contactarnos.\n\n¡Gracias por tu excelente trabajo!\n\nRedOak Cleaning Solutions`;
        const emailTemplate = emailConfig.attendance_reminder_template || defaultTemplate;

        const today = new Date();
        const twoDaysAgo = new Date(today);
        twoDaysAgo.setDate(today.getDate() - 2);
        
        const startOfTwoDaysAgo = new Date(twoDaysAgo);
        startOfTwoDaysAgo.setHours(0, 0, 0, 0);
        
        const endOfTwoDaysAgo = new Date(twoDaysAgo);
        endOfTwoDaysAgo.setHours(23, 59, 59, 999);

        const attendanceRecords = await base44.asServiceRole.entities.AttendanceRecord.filter({
            worked: true,
            marked_date: {
                $gte: startOfTwoDaysAgo.toISOString(),
                $lte: endOfTwoDaysAgo.toISOString()
            }
        });

        if (!attendanceRecords || attendanceRecords.length === 0) {
            return new Response(JSON.stringify({ message: `No cleaners marked as worked 2 days ago.` }), { headers: { 'Content-Type': 'application/json' } });
        }

        const allUsers = await base44.asServiceRole.entities.User.list();
        let sentCount = 0;

        for (const record of attendanceRecords) {
            const periodWorkEntries = await base44.asServiceRole.entities.WorkEntry.filter({ cleaner_id: record.cleaner_id, period_key: record.period_key });

            if (!periodWorkEntries || periodWorkEntries.length === 0) {
                const cleaner = allUsers.find(u => u.id === record.cleaner_id);
                if (cleaner && cleaner.email) {
                    const [year, month, half] = record.period_key.split('-');
                    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('es-ES', { month: 'long' });
                    const periodLabel = half === '1' ? `1ra Quincena de ${monthName}` : `2da Quincena de ${monthName}`;

                    const emailBody = emailTemplate
                        .replace(/\{cleaner_name\}/g, cleaner.full_name || 'Limpiador')
                        .replace(/\{period_label\}/g, periodLabel);

                    await base44.asServiceRole.integrations.Core.SendEmail({
                        to: cleaner.email,
                        subject: "Recordatorio: Registra tus horas de trabajo",
                        body: emailBody,
                        from_name: 'RedOak Cleaning Solutions'
                    });
                    sentCount++;
                }
            }
        }
        
        return new Response(JSON.stringify({ success: true, reminders_sent: sentCount }), { headers: { "Content-Type": "application/json" } });

    } catch (error) {
        console.error("Error in sendAttendanceReminders:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});
