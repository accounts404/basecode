import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Cache en memoria para idempotencia
const idempotencyCache = new Map();
const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000; // 24 horas

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Auth
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ success: false, error: 'No autenticado' }, { status: 401 });
        }

        // Parsear body
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

        // Idempotencia opcional
        if (idempotencyKey) {
            const cacheKey = `${user.id}:${idempotencyKey}`;
            const cached = idempotencyCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp < IDEMPOTENCY_TTL)) {
                console.log('[ClockOut] ♻️ Respuesta idempotente');
                return Response.json(cached.response);
            }
        }

        console.log(`[ClockOut] 🔴 Usuario ${user.id}, Schedule ${scheduleId}`);

        // Obtener el schedule
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

        // Validar clock-in previo
        const existingClockIn = schedule.clock_in_data?.find(c => c.cleaner_id === user.id);
        if (!existingClockIn?.clock_in_time) {
            return Response.json({
                success: false,
                error: 'No tienes un Clock In registrado para este servicio',
                constraint: 'NO_CLOCK_IN_FOUND'
            }, { status: 409 });
        }

        // Si ya tiene clock-out, retornar éxito (idempotente)
        if (existingClockIn.clock_out_time) {
            console.log('[ClockOut] ℹ️ Ya tenía Clock Out, retornando éxito idempotente');
            return Response.json({
                success: true,
                schedule: schedule,
                clockOutTime: existingClockIn.clock_out_time,
                serviceCompleted: schedule.status === 'completed',
                message: 'Clock Out ya registrado anteriormente'
            });
        }

        // Timestamp del servidor en hora Melbourne (DST-aware: AEST UTC+10 / AEDT UTC+11)
        const now = new Date();
        // Usar Intl para obtener la hora correcta en Melbourne (respeta DST automáticamente)
        const melbParts = new Intl.DateTimeFormat('en-AU', {
            timeZone: 'Australia/Melbourne',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        }).formatToParts(now);
        const p = {};
        melbParts.forEach(({ type, value }) => { p[type] = value; });
        const serverTimestamp = `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}.000`;

        console.log(`[ClockOut] ⏰ Timestamp Melbourne: ${serverTimestamp}`);

        // Preparar datos de clock-out
        const updatedClockData = [...schedule.clock_in_data];
        const cleanerIndex = updatedClockData.findIndex(c => c.cleaner_id === user.id);
        updatedClockData[cleanerIndex] = {
            ...updatedClockData[cleanerIndex],
            clock_out_time: serverTimestamp,
            clock_out_location: location || null
        };

        // Determinar si todos los limpiadores que hicieron clock-in ya hicieron clock-out
        // NOTA: Se ignoran los limpiadores que nunca hicieron clock-in (no están en clock_in_data)
        // para que el servicio pueda completarse aunque algún asignado no haya fichado
        const cleanersWhoCheckedIn = updatedClockData.filter(cd => cd.clock_in_time);
        const allCleanersClockedOut = cleanersWhoCheckedIn.length > 0 &&
            cleanersWhoCheckedIn.every(cd => !!cd.clock_out_time);

        const newStatus = allCleanersClockedOut ? 'completed' : schedule.status;

        console.log(`[ClockOut] 📊 Todos clock-out: ${allCleanersClockedOut}, Estado: ${newStatus}`);

        const updatedSchedule = await base44.asServiceRole.entities.Schedule.update(scheduleId, {
            clock_in_data: updatedClockData,
            status: newStatus
        });

        console.log(`[ClockOut] ✅ Clock Out registrado para usuario ${user.id}`);

        // Procesar WorkEntries si el servicio se completó
        let workEntriesProcessed = false;
        let workEntriesCreated = 0;

        if (newStatus === 'completed' && originalStatus !== 'completed') {
            console.log('[ClockOut] 📊 Procesando WorkEntries...');
            try {
                const result = await base44.asServiceRole.functions.invoke('processScheduleForWorkEntries', {
                    scheduleId,
                    mode: 'create'
                });
                if (result?.data?.success) {
                    workEntriesCreated = result.data.created_entries || 0;
                    workEntriesProcessed = true;
                    console.log(`[ClockOut] ✅ WorkEntries: ${workEntriesCreated}`);
                }
            } catch (err) {
                console.error('[ClockOut] ⚠️ Error WorkEntries (no bloqueante):', err);
            }
        }

        const successResponse = {
            success: true,
            schedule: updatedSchedule,
            clockOutTime: serverTimestamp,
            serviceCompleted: allCleanersClockedOut,
            workEntriesProcessed,
            workEntriesCreated,
            message: allCleanersClockedOut ? 'Clock Out registrado. ¡Servicio completado!' : 'Clock Out registrado exitosamente'
        };

        // Cachear para idempotencia
        if (idempotencyKey) {
            const cacheKey = `${user.id}:${idempotencyKey}`;
            idempotencyCache.set(cacheKey, { response: successResponse, timestamp: Date.now() });
            if (idempotencyCache.size > 1000) {
                const oldest = Array.from(idempotencyCache.entries())
                    .sort((a, b) => a[1].timestamp - b[1].timestamp)
                    .slice(0, 100).map(e => e[0]);
                oldest.forEach(k => idempotencyCache.delete(k));
            }
        }

        return Response.json(successResponse);

    } catch (error) {
        console.error('[ClockOut] ❌ Error:', error);
        return Response.json({ success: false, error: error.message || 'Error interno del servidor' }, { status: 500 });
    }
});