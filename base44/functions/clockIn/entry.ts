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
                console.log('[ClockIn] ♻️ Respuesta idempotente');
                return Response.json(cached.response);
            }
        }

        console.log(`[ClockIn] 🟢 Usuario ${user.id}, Schedule ${scheduleId}`);

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

        // Validar asignación
        if (!schedule.cleaner_ids?.includes(user.id)) {
            return Response.json({ success: false, error: 'No estás asignado a este servicio' }, { status: 403 });
        }

        // Timestamp del servidor en hora Melbourne (DST-aware: AEST UTC+10 / AEDT UTC+11)
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

        console.log(`[ClockIn] ⏰ Timestamp Melbourne: ${serverTimestamp}`);

        // Preparar clock_in_data
        const updatedClockData = [...(schedule.clock_in_data || [])];
        const existingIndex = updatedClockData.findIndex(c => c.cleaner_id === user.id);

        // Validar que no haya ya un clock-in activo o completado
        if (existingIndex >= 0) {
            const existing = updatedClockData[existingIndex];
            if (existing.clock_in_time && !existing.clock_out_time) {
                return Response.json({
                    success: false,
                    error: 'Ya tienes un Clock In activo para este servicio. Debes hacer Clock Out primero.',
                    constraint: 'ALREADY_CLOCKED_IN'
                }, { status: 409 });
            }
            if (existing.clock_in_time && existing.clock_out_time) {
                return Response.json({
                    success: false,
                    error: 'Ya completaste este servicio.',
                    constraint: 'ALREADY_COMPLETED'
                }, { status: 409 });
            }
        }

        const clockInEntry = {
            cleaner_id: user.id,
            clock_in_time: serverTimestamp,
            clock_in_location: location || null,
            clock_out_time: null,
            clock_out_location: null
        };

        if (existingIndex >= 0) {
            updatedClockData[existingIndex] = { ...updatedClockData[existingIndex], ...clockInEntry };
        } else {
            updatedClockData.push(clockInEntry);
        }

        const updatePayload = { clock_in_data: updatedClockData };
        if (schedule.status === 'scheduled') {
            updatePayload.status = 'in_progress';
        }

        const updatedSchedule = await base44.asServiceRole.entities.Schedule.update(scheduleId, updatePayload);

        console.log(`[ClockIn] ✅ Clock In registrado para usuario ${user.id}`);

        const successResponse = {
            success: true,
            schedule: updatedSchedule,
            clockInTime: serverTimestamp,
            message: 'Clock In registrado exitosamente'
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
        console.error('[ClockIn] ❌ Error:', error);
        return Response.json({ success: false, error: error.message || 'Error interno del servidor' }, { status: 500 });
    }
});