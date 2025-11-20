// activeServiceManager.js
// Gestión centralizada del estado de servicio activo para limpiadores

const ACTIVE_SERVICE_KEY = 'redoak_active_service';
const SKIP_CHECK_KEY = 'redoak_skip_active_check';
const RECENT_CLOCKOUT_KEY = 'redoak_recent_clockout';

/**
 * Registra un Clock In exitoso
 */
export const registerClockIn = (scheduleId, scheduleData) => {
    console.log('[ActiveServiceManager] 🟢 Registrando Clock In:', scheduleId);
    
    const activeServiceData = {
        scheduleId: scheduleId,
        clientName: scheduleData.client_name,
        startTime: new Date().toISOString(),
        timestamp: Date.now()
    };
    
    localStorage.setItem(ACTIVE_SERVICE_KEY, JSON.stringify(activeServiceData));
    
    // Limpiar cualquier flag de Clock Out reciente
    localStorage.removeItem(RECENT_CLOCKOUT_KEY);
    localStorage.removeItem(SKIP_CHECK_KEY);
    
    console.log('[ActiveServiceManager] ✅ Clock In registrado en localStorage');
};

/**
 * Registra un Clock Out exitoso
 * CRÍTICO: Establece flags para evitar redirecciones inmediatas
 */
export const registerClockOut = (scheduleId) => {
    console.log('[ActiveServiceManager] 🔴 Registrando Clock Out:', scheduleId || 'actual');
    
    const clockOutData = {
        scheduleId: scheduleId || localStorage.getItem(ACTIVE_SERVICE_KEY)?.scheduleId,
        timestamp: Date.now(),
        expiresAt: Date.now() + 20000 // 20 segundos de gracia
    };
    
    // Guardar información del Clock Out reciente
    localStorage.setItem(RECENT_CLOCKOUT_KEY, JSON.stringify(clockOutData));
    
    // Establecer flag de skip más duradero
    localStorage.setItem(SKIP_CHECK_KEY, JSON.stringify({
        timestamp: Date.now(),
        expiresAt: Date.now() + 20000, // 20 segundos
        scheduleId: clockOutData.scheduleId
    }));
    
    // Limpiar el servicio activo
    localStorage.removeItem(ACTIVE_SERVICE_KEY);
    
    console.log('[ActiveServiceManager] ✅ Clock Out registrado, flags establecidos por 20s');
};

/**
 * Verifica si hay un Clock Out reciente que debe ser respetado
 */
export const hasRecentClockOut = (scheduleId = null) => {
    try {
        const recentClockOut = localStorage.getItem(RECENT_CLOCKOUT_KEY);
        if (!recentClockOut) return false;
        
        const data = JSON.parse(recentClockOut);
        const now = Date.now();
        
        // Si expiró, limpiar
        if (now > data.expiresAt) {
            localStorage.removeItem(RECENT_CLOCKOUT_KEY);
            return false;
        }
        
        // Si se especifica un scheduleId, verificar que coincida
        if (scheduleId && data.scheduleId !== scheduleId) {
            return false;
        }
        
        console.log('[ActiveServiceManager] ⚠️ Clock Out reciente detectado, ignorando servicio activo');
        return true;
    } catch (error) {
        console.error('[ActiveServiceManager] Error verificando Clock Out reciente:', error);
        return false;
    }
};

/**
 * Verifica si se debe omitir la verificación de servicio activo
 */
export const shouldSkipActiveCheck = (userId) => {
    try {
        const skipCheck = localStorage.getItem(SKIP_CHECK_KEY);
        if (!skipCheck) return false;
        
        const data = JSON.parse(skipCheck);
        const now = Date.now();
        
        // Si expiró, limpiar
        if (now > data.expiresAt) {
            localStorage.removeItem(SKIP_CHECK_KEY);
            return false;
        }
        
        console.log('[ActiveServiceManager] 🚫 Skip check activo, ignorando verificación');
        return true;
    } catch (error) {
        console.error('[ActiveServiceManager] Error verificando skip check:', error);
        return false;
    }
};

/**
 * Limpia todos los flags relacionados con servicio activo
 */
export const clearAllFlags = () => {
    console.log('[ActiveServiceManager] 🧹 Limpiando todos los flags');
    localStorage.removeItem(ACTIVE_SERVICE_KEY);
    localStorage.removeItem(RECENT_CLOCKOUT_KEY);
    localStorage.removeItem(SKIP_CHECK_KEY);
};

/**
 * Limpia flags obsoletos (más de 5 minutos)
 */
export const cleanupStaleFlags = () => {
    console.log('[ActiveServiceManager] 🧹 Limpiando flags obsoletos');
    
    try {
        // Limpiar Clock Out reciente obsoleto
        const recentClockOut = localStorage.getItem(RECENT_CLOCKOUT_KEY);
        if (recentClockOut) {
            const data = JSON.parse(recentClockOut);
            const elapsed = Date.now() - data.timestamp;
            if (elapsed > 5 * 60 * 1000) { // 5 minutos
                localStorage.removeItem(RECENT_CLOCKOUT_KEY);
                console.log('[ActiveServiceManager] 🧹 Clock Out reciente limpiado (obsoleto)');
            }
        }
        
        // Limpiar skip check obsoleto
        const skipCheck = localStorage.getItem(SKIP_CHECK_KEY);
        if (skipCheck) {
            const data = JSON.parse(skipCheck);
            const elapsed = Date.now() - data.timestamp;
            if (elapsed > 5 * 60 * 1000) { // 5 minutos
                localStorage.removeItem(SKIP_CHECK_KEY);
                console.log('[ActiveServiceManager] 🧹 Skip check limpiado (obsoleto)');
            }
        }
        
        // Limpiar servicio activo obsoleto (más de 24 horas)
        const activeService = localStorage.getItem(ACTIVE_SERVICE_KEY);
        if (activeService) {
            const data = JSON.parse(activeService);
            const elapsed = Date.now() - data.timestamp;
            if (elapsed > 24 * 60 * 60 * 1000) { // 24 horas
                localStorage.removeItem(ACTIVE_SERVICE_KEY);
                console.log('[ActiveServiceManager] 🧹 Servicio activo limpiado (obsoleto)');
            }
        }
    } catch (error) {
        console.error('[ActiveServiceManager] Error limpiando flags obsoletos:', error);
    }
};

/**
 * Función auxiliar para reintentos con backoff exponencial
 */
const retryWithBackoff = async (fn, maxRetries = 3, initialDelay = 1000) => {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            console.warn(`[ActiveServiceManager] ⚠️ Intento ${attempt + 1}/${maxRetries} falló:`, error.message);
            
            if (attempt < maxRetries - 1) {
                const delay = initialDelay * Math.pow(2, attempt);
                console.log(`[ActiveServiceManager] ⏳ Reintentando en ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError;
};

/**
 * Sincroniza el estado del servicio activo con la base de datos
 * OPTIMIZADO: Respeta flags de Clock Out reciente y usa reintentos
 */
export const syncActiveService = async (userId) => {
    try {
        console.log('[ActiveServiceManager] 🔄 Sincronizando servicio activo para:', userId);
        
        // Limpiar flags obsoletos primero
        cleanupStaleFlags();
        
        // CRÍTICO: Verificar si hay un Clock Out reciente
        if (hasRecentClockOut() || shouldSkipActiveCheck(userId)) {
            console.log('[ActiveServiceManager] ⏭️ Saltando sincronización por Clock Out reciente');
            return { hasActive: false, activeSchedule: null };
        }
        
        // Importar dinámicamente para evitar problemas de circular dependency
        const { base44 } = await import('@/api/base44Client');
        
        // Consultar la base de datos con reintentos
        const schedules = await retryWithBackoff(
            () => base44.entities.Schedule.list(),
            3,
            1000
        );
        
        const schedulesArray = Array.isArray(schedules) ? schedules : [];
        
        const activeSchedule = schedulesArray.find(schedule => {
            if (!schedule.cleaner_ids || !schedule.cleaner_ids.includes(userId)) {
                return false;
            }
            
            const clockInDataArray = Array.isArray(schedule.clock_in_data) ? schedule.clock_in_data : [];
            const cleanerClockData = clockInDataArray.find(c => c.cleaner_id === userId);
            
            const isActive = cleanerClockData?.clock_in_time && !cleanerClockData?.clock_out_time;
            
            // CRÍTICO: Verificar si este servicio tiene Clock Out reciente
            if (isActive && hasRecentClockOut(schedule.id)) {
                console.log('[ActiveServiceManager] 🚫 Ignorando servicio', schedule.id, 'por Clock Out reciente');
                return false;
            }
            
            return isActive;
        });
        
        const hasActive = !!activeSchedule;
        
        console.log(`[ActiveServiceManager] ${hasActive ? '✅ Servicio activo encontrado' : '❌ Sin servicio activo'}`);
        
        // Actualizar localStorage
        if (hasActive) {
            const activeServiceData = {
                scheduleId: activeSchedule.id,
                clientName: activeSchedule.client_name,
                clientAddress: activeSchedule.client_address,
                startTime: activeSchedule.start_time,
                timestamp: Date.now(),
                fullSchedule: activeSchedule // Guardar el schedule completo
            };
            localStorage.setItem(ACTIVE_SERVICE_KEY, JSON.stringify(activeServiceData));
        } else {
            localStorage.removeItem(ACTIVE_SERVICE_KEY);
        }
        
        return { hasActive, activeSchedule };
        
    } catch (error) {
        console.error('[ActiveServiceManager] ❌ Error en syncActiveService:', error);
        return { hasActive: false, activeSchedule: null };
    }
};

/**
 * Verifica si el usuario puede hacer Clock In
 * (No puede si ya tiene un servicio activo)
 */
export const canUserClockIn = async (userId) => {
    try {
        const { hasActive, activeSchedule } = await syncActiveService(userId);
        
        if (hasActive) {
            return {
                canClockIn: false,
                reason: `Ya tienes un servicio activo: ${activeSchedule?.client_name || 'Sin nombre'}`,
                activeSchedule: activeSchedule
            };
        }
        
        return {
            canClockIn: true,
            reason: null,
            activeSchedule: null
        };
    } catch (error) {
        console.error('[ActiveServiceManager] Error verificando Clock In:', error);
        return {
            canClockIn: false,
            reason: 'Error al verificar el estado del servicio',
            activeSchedule: null
        };
    }
};

/**
 * Obtiene el servicio activo actual (sin verificar base de datos)
 */
export const getActiveServiceFromCache = () => {
    try {
        const activeServiceStr = localStorage.getItem(ACTIVE_SERVICE_KEY);
        if (!activeServiceStr) return null;
        
        const activeService = JSON.parse(activeServiceStr);
        return activeService;
    } catch (error) {
        console.error('[ActiveServiceManager] Error obteniendo servicio activo:', error);
        return null;
    }
};

/**
 * Actualiza la base de datos con reintentos automáticos
 */
export const updateScheduleWithRetry = async (scheduleId, updateData) => {
    const { base44 } = await import('@/api/base44Client');
    
    return await retryWithBackoff(
        () => base44.entities.Schedule.update(scheduleId, updateData),
        3,
        1000
    );
};

export default {
    registerClockIn,
    registerClockOut,
    hasRecentClockOut,
    shouldSkipActiveCheck,
    clearAllFlags,
    cleanupStaleFlags,
    syncActiveService,
    canUserClockIn,
    getActiveServiceFromCache,
    updateScheduleWithRetry
};