// activeServiceManager.js
// Gestión centralizada del estado de servicio activo para limpiadores

const ACTIVE_SERVICE_KEY = 'redoak_active_service';
const SKIP_CHECK_KEY = 'redoak_skip_active_check';
const RECENT_CLOCKOUT_KEY = 'redoak_recent_clockout';

/**
 * Registra un Clock In exitoso
 */
export const registerClockIn = (scheduleId, scheduleData) => {
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
};

/**
 * Registra un Clock Out exitoso
 * CRÍTICO: Establece flags para evitar redirecciones inmediatas
 */
export const registerClockOut = (scheduleId) => {
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
    localStorage.removeItem(ACTIVE_SERVICE_KEY);
    localStorage.removeItem(RECENT_CLOCKOUT_KEY);
    localStorage.removeItem(SKIP_CHECK_KEY);
};

/**
 * Limpia flags obsoletos (más de 5 minutos)
 */
export const cleanupStaleFlags = () => {
    try {
        const recentClockOut = localStorage.getItem(RECENT_CLOCKOUT_KEY);
        if (recentClockOut) {
            const data = JSON.parse(recentClockOut);
            if (Date.now() - data.timestamp > 5 * 60 * 1000) {
                localStorage.removeItem(RECENT_CLOCKOUT_KEY);
            }
        }
        const skipCheck = localStorage.getItem(SKIP_CHECK_KEY);
        if (skipCheck) {
            const data = JSON.parse(skipCheck);
            if (Date.now() - data.timestamp > 5 * 60 * 1000) {
                localStorage.removeItem(SKIP_CHECK_KEY);
            }
        }
        const activeService = localStorage.getItem(ACTIVE_SERVICE_KEY);
        if (activeService) {
            const data = JSON.parse(activeService);
            if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
                localStorage.removeItem(ACTIVE_SERVICE_KEY);
            }
        }
    } catch (error) { /* silent */ }
};

/**
 * Función auxiliar para reintentos con backoff exponencial
 */
const retryWithBackoff = async (fn, maxRetries = 2, initialDelay = 1500) => {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries - 1) {
                const delay = initialDelay * Math.pow(2, attempt);
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
        cleanupStaleFlags();
        
        if (hasRecentClockOut() || shouldSkipActiveCheck(userId)) {
            return { hasActive: false, activeSchedule: null };
        }
        
        // Importar dinámicamente para evitar problemas de circular dependency
        const { base44 } = await import('@/api/base44Client');
        
        // FIX: Filtrar también por cleaner_ids para reducir datos transferidos
        // Traer solo los servicios activos/programados relevantes
        const schedules = await retryWithBackoff(
            () => base44.entities.Schedule.filter({ 
                status: { $in: ['scheduled', 'in_progress'] },
                cleaner_ids: { $contains: userId }
            }),
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
                return false;
            }
            
            return isActive;
        });
        
        const hasActive = !!activeSchedule;
        
        // Actualizar localStorage
        // FIX: NO guardar fullSchedule completo (puede pesar varios MB con fotos/notas)
        // Solo guardar los campos mínimos necesarios para el UI
        if (hasActive) {
            const activeServiceData = {
                scheduleId: activeSchedule.id,
                clientName: activeSchedule.client_name,
                clientAddress: activeSchedule.client_address,
                startTime: activeSchedule.start_time,
                timestamp: Date.now(),
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