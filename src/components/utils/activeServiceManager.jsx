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
 * Sincroniza el estado del servicio activo con la base de datos
 * OPTIMIZADO: Respeta flags de Clock Out reciente
 */
export const syncActiveService = async (userId) => {
    try {
        console.log('[ActiveServiceManager] 🔄 Sincronizando servicio activo para:', userId);
        
        // CRÍTICO: Verificar si hay un Clock Out reciente
        if (hasRecentClockOut() || shouldSkipActiveCheck(userId)) {
            console.log('[ActiveServiceManager] ⏭️ Saltando sincronización por Clock Out reciente');
            return { hasActive: false, activeSchedule: null };
        }
        
        // Importar dinámicamente para evitar problemas de circular dependency
        const { base44 } = await import('@/api/base44Client');
        
        // Consultar la base de datos
        const schedules = await base44.entities.Schedule.list();
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
                startTime: activeSchedule.start_time,
                timestamp: Date.now()
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

export default {
    registerClockIn,
    registerClockOut,
    hasRecentClockOut,
    shouldSkipActiveCheck,
    clearAllFlags,
    syncActiveService,
    canUserClockIn,
    getActiveServiceFromCache
};