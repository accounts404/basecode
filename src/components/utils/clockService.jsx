/**
 * SERVICIO CENTRALIZADO DE CLOCK-IN/CLOCK-OUT
 * 
 * Este servicio unifica TODA la lógica de clock-in/out en un solo lugar,
 * implementando las mejores prácticas de confiabilidad:
 * 
 * - Backend-first con funciones dedicadas
 * - Idempotencia con UUID
 * - Validaciones centralizadas
 * - Timestamps del servidor
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
 * Ahora usa la función backend dedicada con idempotencia y timestamps del servidor
 */
export const performClockIn = async (scheduleId, userId, onProgress) => {
    const idempotencyKey = generateUUID();
    
    console.log('[ClockService] 🟢 Iniciando Clock In...');
    console.log('[ClockService] Schedule ID:', scheduleId);
    console.log('[ClockService] User ID:', userId);
    console.log('[ClockService] Idempotency Key:', idempotencyKey);
    
    try {
        // PASO 1: Validar que el usuario pueda hacer clock-in (validación previa rápida)
        onProgress?.({ stage: 'validating', message: 'Validando...' });
        
        const validation = await canUserClockIn(userId);
        if (!validation.canClockIn) {
            throw new Error(validation.reason);
        }

        // PASO 2: Capturar ubicación GPS (no bloqueante)
        onProgress?.({ stage: 'location', message: 'Obteniendo ubicación...' });
        
        const userLocation = await getUserLocation();
        if (!userLocation) {
            console.warn('[ClockService] ⚠️ Clock In sin ubicación GPS');
        }

        // PASO 3: Llamar a la función backend con idempotencia
        onProgress?.({ stage: 'saving', message: 'Registrando Clock In...' });
        
        const { data } = await base44.functions.invoke('clockIn', {
            scheduleId: scheduleId,
            location: userLocation
        }, {
            headers: {
                'Idempotency-Key': idempotencyKey
            }
        });

        console.log('[ClockService] 📡 Respuesta del backend:', data);

        if (!data.success) {
            throw new Error(data.error || 'Error desconocido en el backend');
        }

        console.log('[ClockService] ✅ Clock In registrado en backend');

        // PASO 4: Actualizar caché local con datos del backend
        const serverClockInData = data.schedule.clock_in_data?.find(c => c.cleaner_id === userId);
        
        setLocalActiveService({
            scheduleId: data.schedule.id,
            userId: userId,
            clockInTime: data.clockInTime || serverClockInData?.clock_in_time,
            clientName: data.schedule.client_name,
            clientAddress: data.schedule.client_address
        });

        console.log('[ClockService] ✅ Caché local actualizado');

        // PASO 5: Retornar resultado exitoso
        return {
            success: true,
            schedule: data.schedule,
            message: data.message || 'Clock In registrado exitosamente',
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
 * Ahora usa la función backend dedicada con idempotencia y timestamps del servidor
 */
export const performClockOut = async (scheduleId, userId, onProgress) => {
    const idempotencyKey = generateUUID();
    
    console.log('[ClockService] 🔴 Iniciando Clock Out...');
    console.log('[ClockService] Schedule ID:', scheduleId);
    console.log('[ClockService] User ID:', userId);
    console.log('[ClockService] Idempotency Key:', idempotencyKey);
    
    try {
        // PASO 1: Verificar que hay un clock-in activo (validación local rápida)
        onProgress?.({ stage: 'validating', message: 'Validando...' });
        
        const localActive = getLocalActiveService();
        if (!localActive || localActive.scheduleId !== scheduleId) {
            console.warn('[ClockService] ⚠️ No hay Clock In activo en caché local para este servicio');
            // No bloqueamos, el backend validará
        }

        // PASO 2: Capturar ubicación GPS (no bloqueante)
        onProgress?.({ stage: 'location', message: 'Obteniendo ubicación...' });
        
        const userLocation = await getUserLocation();
        if (!userLocation) {
            console.warn('[ClockService] ⚠️ Clock Out sin ubicación GPS');
        }

        // PASO 3: Llamar a la función backend con idempotencia
        onProgress?.({ stage: 'saving', message: 'Registrando Clock Out...' });
        
        const { data } = await base44.functions.invoke('clockOut', {
            scheduleId: scheduleId,
            location: userLocation
        }, {
            headers: {
                'Idempotency-Key': idempotencyKey
            }
        });

        console.log('[ClockService] 📡 Respuesta del backend:', data);

        if (!data.success) {
            throw new Error(data.error || 'Error desconocido en el backend');
        }

        console.log('[ClockService] ✅ Clock Out registrado en backend');

        // PASO 4: Mostrar mensaje de procesamiento de WorkEntries si aplica
        if (data.workEntriesProcessed) {
            onProgress?.({ 
                stage: 'completed', 
                message: `WorkEntries procesadas: ${data.workEntriesCreated || 0}` 
            });
        }

        // PASO 5: Limpiar caché local
        clearLocalActiveService();
        console.log('[ClockService] ✅ Caché local limpiado');

        // PASO 6: Retornar resultado exitoso
        return {
            success: true,
            schedule: data.schedule,
            message: data.message || 'Clock Out registrado exitosamente',
            locationCaptured: !!userLocation,
            serviceCompleted: data.serviceCompleted || false,
            workEntriesCreated: data.workEntriesCreated || 0
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