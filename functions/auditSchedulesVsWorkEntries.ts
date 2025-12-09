import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verificar autenticación
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'No autorizado' }, { status: 401 });
        }

        const body = await req.json();
        const { period_start, period_end, cleaner_id } = body;

        if (!period_start || !period_end) {
            return Response.json({ 
                error: 'Período requerido' 
            }, { status: 400 });
        }

        console.log(`[AuditSchedulesVsWorkEntries] Auditando período: ${period_start} a ${period_end}`);

        // Cargar datos necesarios
        const [schedules, workEntries, users] = await Promise.all([
            base44.asServiceRole.entities.Schedule.filter({
                start_time: {
                    $gte: `${period_start}T00:00:00Z`,
                    $lte: `${period_end}T23:59:59Z`
                }
            }),
            base44.asServiceRole.entities.WorkEntry.filter({
                work_date: {
                    $gte: period_start,
                    $lte: period_end
                }
            }),
            base44.asServiceRole.entities.User.list()
        ]);

        console.log(`[AuditSchedulesVsWorkEntries] Schedules: ${schedules.length}, WorkEntries: ${workEntries.length}`);

        // Filtrar solo schedules completados
        const completedSchedules = schedules.filter(s => s.status === 'completed');

        // Crear mapa de WorkEntries por schedule_id + cleaner_id
        const workEntryMap = new Map();
        workEntries.forEach(we => {
            if (we.schedule_id) {
                const key = `${we.schedule_id}_${we.cleaner_id}`;
                if (!workEntryMap.has(key)) {
                    workEntryMap.set(key, []);
                }
                workEntryMap.get(key).push(we);
            }
        });

        // Analizar cada schedule y cada limpiador asignado
        const results = [];
        
        completedSchedules.forEach(schedule => {
            const cleanerIds = schedule.cleaner_ids || [];
            
            cleanerIds.forEach(cleanerId => {
                // Aplicar filtro de limpiador si se especificó
                if (cleaner_id && cleanerId !== cleaner_id) return;

                const cleaner = users.find(u => u.id === cleanerId);
                const cleanerName = cleaner?.invoice_name || cleaner?.full_name || 'Desconocido';

                // Buscar WorkEntries para este schedule y limpiador
                const key = `${schedule.id}_${cleanerId}`;
                const relatedWorkEntries = workEntryMap.get(key) || [];

                // Calcular horas esperadas
                let expectedHours = 0;
                if (schedule.cleaner_schedules && schedule.cleaner_schedules.length > 0) {
                    const cleanerSchedule = schedule.cleaner_schedules.find(cs => cs.cleaner_id === cleanerId);
                    if (cleanerSchedule?.start_time && cleanerSchedule?.end_time) {
                        const start = new Date(cleanerSchedule.start_time);
                        const end = new Date(cleanerSchedule.end_time);
                        expectedHours = (end - start) / (1000 * 60 * 60);
                    }
                }
                
                // Fallback al horario general si no hay cleaner_schedules
                if (expectedHours === 0 && schedule.start_time && schedule.end_time) {
                    const start = new Date(schedule.start_time);
                    const end = new Date(schedule.end_time);
                    expectedHours = (end - start) / (1000 * 60 * 60);
                }

                // Calcular horas reales
                const actualHours = relatedWorkEntries.reduce((sum, we) => sum + (we.hours || 0), 0);

                // Determinar estado
                let status = 'ok';
                let statusLabel = 'Correcto';
                
                if (relatedWorkEntries.length === 0) {
                    status = 'missing';
                    statusLabel = 'Falta WorkEntry';
                } else if (Math.abs(expectedHours - actualHours) > 0.25) {
                    status = 'mismatch';
                    statusLabel = 'Diferencia de horas';
                }

                results.push({
                    schedule_id: schedule.id,
                    schedule_date: schedule.start_time.slice(0, 10),
                    client_name: schedule.client_name || 'Sin cliente',
                    client_id: schedule.client_id,
                    cleaner_id: cleanerId,
                    cleaner_name: cleanerName,
                    expected_hours: Math.round(expectedHours * 4) / 4,
                    actual_hours: Math.round(actualHours * 4) / 4,
                    work_entries_count: relatedWorkEntries.length,
                    work_entry_ids: relatedWorkEntries.map(we => we.id),
                    status,
                    status_label: statusLabel,
                    key: `${schedule.id}_${cleanerId}`
                });
            });
        });

        // Ordenar: missing primero, luego mismatch, luego ok
        const statusOrder = { missing: 0, mismatch: 1, ok: 2 };
        results.sort((a, b) => {
            const orderDiff = statusOrder[a.status] - statusOrder[b.status];
            if (orderDiff !== 0) return orderDiff;
            return b.schedule_date.localeCompare(a.schedule_date);
        });

        // Estadísticas
        const stats = {
            total: results.length,
            ok: results.filter(r => r.status === 'ok').length,
            missing: results.filter(r => r.status === 'missing').length,
            mismatch: results.filter(r => r.status === 'mismatch').length
        };

        console.log(`[AuditSchedulesVsWorkEntries] Resultados:`, stats);

        return Response.json({
            success: true,
            stats,
            results
        });

    } catch (error) {
        console.error('[AuditSchedulesVsWorkEntries] Error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});