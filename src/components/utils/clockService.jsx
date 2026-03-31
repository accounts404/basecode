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
 * Obtener ubicación GPS del usuario.
 * Solicita permiso si aún no fue otorgado — el navegador muestra el diálogo nativo
 * con opciones "Permitir una vez", "Permitir siempre" o "No permitir".
 */
export const getUserLocation = async () => {
    if (!('geolocation' in navigator)) {
        console.warn('[ClockService] Geolocalización no disponible en este dispositivo');
        return null;
    }

    // Verificar estado del permiso si la API está disponible
    if (navigator.permissions) {
        try {
            const status = await navigator.permissions.query({ name: 'geolocation' });
            if (status.state === 'denied') {
                console.warn('[ClockService] Permiso GPS denegado por el usuario. Para activarlo, ve a Configuración del navegador.');
                return null;
            }
            // Si es 'prompt' o 'granted', continuar — el navegador mostrará el diálogo si es necesario
        } catch (e) {
            // permissions.query no disponible en todos los navegadores, continuar igual
        }
    }

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                {
                    timeout: 15000,        // 15s para que el usuario tenga tiempo de responder
                    enableHighAccuracy: false,
                    maximumAge: 60000
                }
            );
        });

        return `${position.coords.latitude},${position.coords.longitude}`;
    } catch (error) {
        if (error.code === 1) {
            // PERMISSION_DENIED
            console.warn('[ClockService] El usuario denegó el permiso de GPS.');
        } else if (error.code === 3) {
            // TIMEOUT
            console.warn('[ClockService] Tiempo de espera agotado para obtener GPS.');
        } else {
            console.warn('[ClockService] No se pudo obtener ubicación:', error.message);
        }
        return null; // GPS es opcional — el clock-in/out continúa igual
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

        // PASO 4: Llamar a la backend function (timestamp lo genera el servidor en hora Melbourne)
        onProgress?.({ stage: 'saving', message: 'Registrando Clock In...' });

        const { data: clockInResult } = await base44.functions.invoke('clockIn', {
            scheduleId,
            location: userLocation
        }, { headers: { 'Idempotency-Key': idempotencyKey } });

        if (!clockInResult?.success) {
            throw new Error(clockInResult?.error || 'Error al registrar Clock In');
        }

        const updatedSchedule = clockInResult.schedule;
        console.log('[ClockService] ✅ Clock In registrado (hora Melbourne)');

        // PASO 5: Actualizar caché local con datos del servidor
        const serverClockInData = updatedSchedule.clock_in_data?.find(c => c.cleaner_id === userId);
        
        setLocalActiveService({
            scheduleId: updatedSchedule.id,
            userId: userId,
            clockInTime: serverClockInData?.clock_in_time,
            clientName: updatedSchedule.client_name,
            clientAddress: updatedSchedule.client_address
        });

        console.log('[ClockService] ✅ Caché local actualizado');

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
        // PASO 1: Capturar ubicación GPS (no bloqueante)
        onProgress?.({ stage: 'location', message: 'Obteniendo ubicación...' });
        
        const userLocation = await getUserLocation();

        // PASO 2: Llamar a la backend function (timestamp lo genera el servidor en hora Melbourne)
        // La función backend valida clock-in previo, procesa WorkEntries si es el último, etc.
        onProgress?.({ stage: 'saving', message: 'Registrando Clock Out...' });

        const { data: clockOutResult } = await base44.functions.invoke('clockOut', {
            scheduleId,
            location: userLocation
        }, { headers: { 'Idempotency-Key': idempotencyKey } });

        if (!clockOutResult?.success) {
            throw new Error(clockOutResult?.error || 'Error al registrar Clock Out');
        }

        console.log('[ClockService] ✅ Clock Out registrado (hora Melbourne)');

        if (clockOutResult.serviceCompleted) {
            onProgress?.({ stage: 'processing', message: 'Procesando horas trabajadas...' });
        }

        // PASO 3: Limpiar caché local
        clearLocalActiveService();
        console.log('[ClockService] ✅ Caché local limpiado');

        return {
            success: true,
            schedule: clockOutResult.schedule,
            message: clockOutResult.message,
            locationCaptured: !!userLocation,
            serviceCompleted: clockOutResult.serviceCompleted
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