import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const idempotencyCache = new Map();
const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ success: false, error: 'No autenticado' }, { status: 401 });
        }

        let body;
        try {
            body = await req.json();
        } catch {
            return Response.json({ success: false, error: 'Body inválido' }, { status: 400 });
        }

        const { scheduleId, location, idempotencyKey } = body;

        if (!scheduleId) {
            return Response.json({ success: false, error: 'scheduleId es requerido' }, { status: 400 });
        }

        if (idempotencyKey) {
            const cacheKey = `${user.id}:${idempotencyKey}`;
            const cached = idempotencyCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp < IDEMPOTENCY_TTL)) {
                console.log('[ClockOut] Respuesta idempotente');
                return Response.json(cached.response);
            }
        }

        console.log(`[ClockOut] Usuario ${user.id}, Schedule ${scheduleId}`);

        let schedule;
        try {
            schedule = await base44.asServiceRole.entities.Schedule.get(scheduleId);
        } catch {
            return Response.json({ success: false, error: 'Servicio no encontrado' }, { status: 404 });
        }
        if (!schedule) {
            return Response.json({ success: false, error: 'Servicio no encontrado' }, { status: 404 });
        }

        const originalStatus = schedule.status;

        const existingClockIn = schedule.clock_in_data?.find(c => c.cleaner_id === user.id);
        if (!existingClockIn?.clock_in_time) {
            return Response.json({
                success: false,
                error: 'No tienes un Clock In registrado para este servicio',
                constraint: 'NO_CLOCK_IN_FOUND'
            }, { status: 409 });
        }

        if (existingClockIn.clock_out_time) {
            return Response.json({
                success: true,
                schedule: schedule,
                clockOutTime: existingClockIn.clock_out_time,
                serviceCompleted: schedule.status === 'completed',
                message: 'Clock Out ya registrado anteriormente'
            });
        }

        const now = new Date();
        const melbParts = new Intl.DateTimeFormat('en-AU', {
            timeZone: 'Australia/Melbourne',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        }).formatToParts(now);
        const p = {};
        melbParts.forEach(({ type, value }) => { p[type] = value; });
        const serverTimestamp = `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}.000`;

        console.log(`[ClockOut] Timestamp Melbourne: ${serverTimestamp}`);

        const updatedClockData = [...schedule.clock_in_data];
        const cleanerIndex = updatedClockData.findIndex(c => c.cleaner_id === user.id);
        updatedClockData[cleanerIndex] = {
            ...updatedClockData[cleanerIndex],
            clock_out_time: serverTimestamp,
            clock_out_location: location || null
        };

        const allCleanersClockedOut = schedule.cleaner_ids?.every(cleanerId => {
            const cd = updatedClockData.find(c => c.cleaner_id === cleanerId);
            return cd?.clock_out_time;
        }) || false;

        const newStatus = allCleanersClockedOut ? 'completed' : schedule.status;

        const updatedSchedule = await base44.asServiceRole.entities.Schedule.update(scheduleId, {
            clock_in_data: updatedClockData,
            status: newStatus
        });

        console.log(`[ClockOut] Clock Out registrado para usuario ${user.id}`);

        let workEntriesProcessed = false;
        let workEntriesCreated = 0;

        if (newStatus === 'completed' && originalStatus !== 'completed') {
            try {
                const result = await base44.asServiceRole.functions.invoke('processScheduleForWorkEntries', {
                    scheduleId,
                    mode: 'create'
                });
                if (result?.data?.success) {
                    workEntriesCreated = result.data.created_entries || 0;
                    workEntriesProcessed = true;
                }
            } catch (err) {
                console.error('[ClockOut] Error WorkEntries (no bloqueante):', err);
            }
        }

        const successResponse = {
            success: true,
            schedule: updatedSchedule,
            clockOutTime: serverTimestamp,
            serviceCompleted: allCleanersClockedOut,
            workEntriesProcessed,
            workEntriesCreated,
            message: allCleanersClockedOut ? 'Clock Out registrado. Servicio completado!' : 'Clock Out registrado exitosamente'
        };

        if (idempotencyKey) {
            const cacheKey = `${user.id}:${idempotencyKey}`;
            idempotencyCache.set(cacheKey, { response: successResponse, timestamp: Date.now() });
        }

        return Response.json(successResponse);

    } catch (error) {
        console.error('[ClockOut] Error:', error);
        return Response.json({ success: false, error: error.message || 'Error interno del servidor' }, { status: 500 });
    }
});