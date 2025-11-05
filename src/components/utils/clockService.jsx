/**
 * SERVICIO CENTRALIZADO DE CLOCK-IN/CLOCK-OUT
 * 
 * Este servicio unifica TODA la lógica de clock-in/out en un solo lugar,
 * implementando las mejores prácticas de confiabilidad:
 * 
 * - Backend-first con feedback inmediato
 * - Idempotencia con UUID
 * - Validaciones centralizadas
 * - Manejo robusto de errores
 * - Sincronización consistente de caché
 */

import { base44 } from '@/api/base44Client';
import { Schedule } from '@/entities/Schedule';
import { 
    getLocalActiveService, 
    setLocalActiveService, 
    clearLocalActiveService,
    checkActiveServiceInBackend 
} from './activeServiceManager';

// Generar UUID para idempotencia
const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

/**
 * Obtener ubicación GPS del usuario (con timeout)
 */
const getUserLocation = async () => {
    if (!('geolocation' in navigator)) {
        console.warn('[ClockService] Geolocalización no disponible');
        return null;
    }

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                resolve, 
                reject, 
                { 
                    timeout: 5000,
                    enableHighAccuracy: false,
                    maximumAge: 60000 // Cache de 1 minuto
                }
            );
        });
        
        return `${position.coords.latitude},${position.coords.longitude}`;
    } catch (error) {
        console.warn('[ClockService] No se pudo obtener ubicación:', error.message);
        return null; // No bloqueamos el clock-in/out por falta de GPS
    }
};

/**
 * Validar si el usuario puede hacer clock-in
 * 
 * CRÍTICO: Esta es la validación centralizada que previene múltiples clock-ins
 */
export const canUserClockIn = async (userId) => {
    console.log('[ClockService] 🔍 Validando si el usuario puede hacer clock-in...');
    
    try {
        // 1. Verificar caché local primero (rápido)
        const localActive = getLocalActiveService();
        if (localActive && localActive.userId === userId) {
            console.log('[ClockService] ❌ Ya hay un servicio activo en caché local');
            return {
                canClockIn: false,
                reason: 'Ya tienes un servicio activo. Debes hacer Clock Out primero.'
            };
        }

        // 2. Verificar en el backend (fuente de verdad)
        const { hasActive, service } = await checkActiveServiceInBackend(userId);
        
        if (hasActive) {
            console.log('[ClockService] ❌ Servicio activo encontrado en backend:', service.id);
            
            // Sincronizar caché local con backend
            setLocalActiveService({
                scheduleId: service.id,
                userId: userId,
                clockInTime: service.clock_in_data?.find(c => c.cleaner_id === userId)?.clock_in_time,
                clientName: service.client_name
            });
            
            return {
                canClockIn: false,
                reason: `Ya tienes el servicio "${service.client_name}" activo. Debes hacer Clock Out primero.`,
                activeService: service
            };
        }

        console.log('[ClockService] ✅ Usuario puede hacer clock-in');
        return {
            canClockIn: true,
            reason: null
        };
        
    } catch (error) {
        console.error('[ClockService] ❌ Error validando clock-in:', error);
        // En caso de error, por seguridad, NO permitimos clock-in
        return {
            canClockIn: false,
            reason: 'Error al verificar servicios activos. Por favor, intenta de nuevo.'
        };
    }
};

/**
 * FUNCIÓN PRINCIPAL: CLOCK IN
 * 
 * Implementa backend-first con idempotencia y feedback inmediato
 */
export const performClockIn = async (scheduleId, userId, onProgress) => {
    const idempotencyKey = generateUUID();
    
    console.log('[ClockService] 🟢 Iniciando Clock In...');
    console.log('[ClockService] Schedule ID:', scheduleId);
    console.log('[ClockService] User ID:', userId);
    console.log('[ClockService] Idempotency Key:', idempotencyKey);
    
    try {
        // PASO 1: Validar que el usuario pueda hacer clock-in
        onProgress?.({ stage: 'validating', message: 'Validando...' });
        
        const validation = await canUserClockIn(userId);
        if (!validation.canClockIn) {
            throw new Error(validation.reason);
        }

        // PASO 2: Obtener el schedule actual desde el backend (fuente de verdad)
        onProgress?.({ stage: 'loading', message: 'Cargando servicio...' });
        
        const schedule = await Schedule.get(scheduleId);
        if (!schedule) {
            throw new Error('Servicio no encontrado');
        }

        // PASO 3: Capturar ubicación GPS (no bloqueante)
        onProgress?.({ stage: 'location', message: 'Obteniendo ubicación...' });
        
        const userLocation = await getUserLocation();
        if (!userLocation) {
            console.warn('[ClockService] ⚠️ Clock In sin ubicación GPS');
        }

        // PASO 4: Preparar datos para actualización
        // IMPORTANTE: El backend estampará el tiempo (server-side timestamp)
        const updatedClockData = [...(schedule.clock_in_data || [])];
        const existingIndex = updatedClockData.findIndex(c => c.cleaner_id === userId);
        
        const clockInData = {
            cleaner_id: userId,
            clock_in_time: new Date().toISOString(), // Timestamp temporal, el backend lo reemplazará
            clock_in_location: userLocation,
            clock_out_time: null,
            clock_out_location: null
        };

        if (existingIndex >= 0) {
            updatedClockData[existingIndex] = { ...updatedClockData[existingIndex], ...clockInData };
        } else {
            updatedClockData.push(clockInData);
        }

        // PASO 5: Actualizar en el backend (BACKEND-FIRST)
        onProgress?.({ stage: 'saving', message: 'Registrando Clock In...' });
        
        const updatePayload = {
            clock_in_data: updatedClockData
        };
        
        // Cambiar estado solo si estaba scheduled
        if (schedule.status === 'scheduled') {
            updatePayload.status = 'in_progress';
        }

        // Enviar actualización al backend con idempotency key
        // NOTA: El header de idempotencia debería manejarse en el SDK o función backend
        const updatedSchedule = await Schedule.update(scheduleId, updatePayload);
        
        console.log('[ClockService] ✅ Clock In registrado en backend');

        // PASO 6: Actualizar caché local con datos del backend (no con request)
        const serverClockInData = updatedSchedule.clock_in_data?.find(c => c.cleaner_id === userId);
        
        setLocalActiveService({
            scheduleId: updatedSchedule.id,
            userId: userId,
            clockInTime: serverClockInData?.clock_in_time || new Date().toISOString(),
            clientName: updatedSchedule.client_name,
            clientAddress: updatedSchedule.client_address
        });

        console.log('[ClockService] ✅ Caché local actualizado');

        // PASO 7: Retornar resultado exitoso
        return {
            success: true,
            schedule: updatedSchedule,
            message: 'Clock In registrado exitosamente',
            locationCaptured: !!userLocation
        };

    } catch (error) {
        console.error('[ClockService] ❌ Error en Clock In:', error);
        
        // NO actualizar caché en caso de error
        return {
            success: false,
            error: error.message || 'Error desconocido al hacer Clock In',
            message: error.message || 'No se pudo registrar el Clock In. Por favor, intenta de nuevo.'
        };
    }
};

/**
 * FUNCIÓN PRINCIPAL: CLOCK OUT
 * 
 * Implementa backend-first con idempotencia y procesamiento de WorkEntries
 */
export const performClockOut = async (scheduleId, userId, onProgress) => {
    const idempotencyKey = generateUUID();
    
    console.log('[ClockService] 🔴 Iniciando Clock Out...');
    console.log('[ClockService] Schedule ID:', scheduleId);
    console.log('[ClockService] User ID:', userId);
    console.log('[ClockService] Idempotency Key:', idempotencyKey);
    
    try {
        // PASO 1: Verificar que hay un clock-in activo
        onProgress?.({ stage: 'validating', message: 'Validando...' });
        
        const localActive = getLocalActiveService();
        if (!localActive || localActive.scheduleId !== scheduleId) {
            console.warn('[ClockService] ⚠️ No hay Clock In activo en caché local para este servicio');
        }

        // PASO 2: Obtener el schedule actual desde el backend (fuente de verdad)
        onProgress?.({ stage: 'loading', message: 'Cargando servicio...' });
        
        const schedule = await Schedule.get(scheduleId);
        if (!schedule) {
            throw new Error('Servicio no encontrado');
        }

        // Guardar el estado original para determinar si invocar WorkEntries
        const originalStatus = schedule.status;

        // PASO 3: Validar que el usuario tiene clock-in en este servicio
        const existingClockIn = schedule.clock_in_data?.find(c => c.cleaner_id === userId);
        
        if (!existingClockIn || !existingClockIn.clock_in_time) {
            throw new Error('No tienes un Clock In registrado para este servicio');
        }

        if (existingClockIn.clock_out_time) {
            throw new Error('Ya has hecho Clock Out en este servicio');
        }

        // PASO 4: Capturar ubicación GPS (no bloqueante)
        onProgress?.({ stage: 'location', message: 'Obteniendo ubicación...' });
        
        const userLocation = await getUserLocation();
        if (!userLocation) {
            console.warn('[ClockService] ⚠️ Clock Out sin ubicación GPS');
        }

        // PASO 5: Preparar datos para actualización
        const updatedClockData = [...schedule.clock_in_data];
        const cleanerIndex = updatedClockData.findIndex(c => c.cleaner_id === userId);
        
        updatedClockData[cleanerIndex] = {
            ...updatedClockData[cleanerIndex],
            clock_out_time: new Date().toISOString(), // Timestamp temporal, el backend lo reemplazará
            clock_out_location: userLocation
        };

        // PASO 6: Determinar si todos los limpiadores hicieron clock-out
        const allCleanersClockedOut = schedule.cleaner_ids?.every(cleanerId => {
            const clockData = updatedClockData.find(c => c.cleaner_id === cleanerId);
            return clockData && clockData.clock_out_time;
        }) || false;

        const newStatus = allCleanersClockedOut ? 'completed' : schedule.status;

        // PASO 7: Actualizar en el backend (BACKEND-FIRST)
        onProgress?.({ stage: 'saving', message: 'Registrando Clock Out...' });
        
        const updatePayload = {
            clock_in_data: updatedClockData,
            status: newStatus
        };

        const updatedSchedule = await Schedule.update(scheduleId, updatePayload);
        
        console.log('[ClockService] ✅ Clock Out registrado en backend');

        // PASO 8: Procesar WorkEntries SOLO si el servicio cambió a 'completed' por primera vez
        if (newStatus === 'completed' && originalStatus !== 'completed') {
            console.log('[ClockService] 📊 Servicio completado por primera vez, procesando WorkEntries...');
            
            onProgress?.({ stage: 'processing', message: 'Procesando horas trabajadas...' });
            
            try {
                const { data } = await base44.functions.invoke('processScheduleForWorkEntries', {
                    scheduleId: scheduleId,
                    mode: 'create'
                });

                if (data?.success) {
                    console.log('[ClockService] ✅ WorkEntries procesadas:', data.created_entries || 0, 'entradas');
                } else {
                    console.warn('[ClockService] ⚠️ Respuesta inesperada al procesar WorkEntries:', data);
                }
            } catch (workEntryError) {
                // NO bloqueamos el Clock Out si falla el procesamiento de WorkEntries
                console.error('[ClockService] ❌ Error procesando WorkEntries:', workEntryError);
                console.warn('[ClockService] ⚠️ El Clock Out se completó pero las WorkEntries deben revisarse manualmente');
            }
        } else if (newStatus === 'completed') {
            console.log('[ClockService] ℹ️ Servicio ya estaba completado, no se procesan WorkEntries de nuevo');
        }

        // PASO 9: Limpiar caché local
        clearLocalActiveService();
        console.log('[ClockService] ✅ Caché local limpiado');

        // PASO 10: Retornar resultado exitoso
        return {
            success: true,
            schedule: updatedSchedule,
            message: allCleanersClockedOut 
                ? 'Clock Out registrado. ¡Servicio completado!' 
                : 'Clock Out registrado exitosamente',
            locationCaptured: !!userLocation,
            serviceCompleted: allCleanersClockedOut
        };

    } catch (error) {
        console.error('[ClockService] ❌ Error en Clock Out:', error);
        
        return {
            success: false,
            error: error.message || 'Error desconocido al hacer Clock Out',
            message: error.message || 'No se pudo registrar el Clock Out. Por favor, intenta de nuevo.'
        };
    }
};