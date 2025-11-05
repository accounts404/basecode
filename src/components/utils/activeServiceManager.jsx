// Gestor de estado del servicio activo con persistencia local y sincronización con backend
import { base44 } from '@/api/base44Client';

const ACTIVE_SERVICE_KEY = 'redoak_active_service';
const LAST_SYNC_KEY = 'redoak_last_sync';
const SYNC_THRESHOLD = 30000; // 30 segundos

/**
 * Obtiene el estado del servicio activo desde el caché local
 */
export const getLocalActiveService = () => {
    try {
        const stored = localStorage.getItem(ACTIVE_SERVICE_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (error) {
        console.error('[ActiveServiceManager] Error leyendo caché local:', error);
        return null;
    }
};

/**
 * Guarda el estado del servicio activo en caché local
 */
export const setLocalActiveService = (serviceData) => {
    try {
        if (serviceData) {
            localStorage.setItem(ACTIVE_SERVICE_KEY, JSON.stringify(serviceData));
            localStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
        } else {
            localStorage.removeItem(ACTIVE_SERVICE_KEY);
            localStorage.removeItem(LAST_SYNC_KEY);
        }
    } catch (error) {
        console.error('[ActiveServiceManager] Error guardando caché local:', error);
    }
};

/**
 * Limpia el estado del servicio activo
 */
export const clearLocalActiveService = () => {
    setLocalActiveService(null);
};

/**
 * Verifica si necesitamos sincronizar con el backend
 */
const needsSync = () => {
    const lastSync = localStorage.getItem(LAST_SYNC_KEY);
    if (!lastSync) return true;
    return (Date.now() - parseInt(lastSync)) > SYNC_THRESHOLD;
};

/**
 * Verifica en el backend si el usuario tiene un servicio activo
 * Retorna: { hasActive: boolean, service: object|null }
 */
export const checkActiveServiceInBackend = async (userId) => {
    try {
        console.log('[ActiveServiceManager] Consultando backend para servicio activo...');
        const schedules = await base44.entities.Schedule.list();
        
        const activeService = schedules.find(schedule => {
            if (!schedule.cleaner_ids || !schedule.cleaner_ids.includes(userId)) return false;
            const cleanerClockData = schedule.clock_in_data?.find(c => c.cleaner_id === userId);
            return cleanerClockData?.clock_in_time && !cleanerClockData?.clock_out_time;
        });

        if (activeService) {
            console.log('[ActiveServiceManager] ✅ Servicio activo encontrado:', activeService.id);
            return { hasActive: true, service: activeService };
        } else {
            console.log('[ActiveServiceManager] ℹ️ No hay servicio activo');
            return { hasActive: false, service: null };
        }
    } catch (error) {
        console.error('[ActiveServiceManager] ❌ Error consultando backend:', error);
        throw error;
    }
};

/**
 * Sincroniza el estado local con el backend
 * Retorna: { hasActive: boolean, service: object|null, source: 'cache'|'backend' }
 */
export const syncActiveService = async (userId, forceSync = false) => {
    // 1. Primero revisar caché local
    const localService = getLocalActiveService();
    
    // 2. Si no necesitamos sincronizar y tenemos datos locales, usarlos
    if (!forceSync && !needsSync() && localService) {
        console.log('[ActiveServiceManager] 📦 Usando caché local (reciente)');
        return { hasActive: true, service: localService, source: 'cache' };
    }

    // 3. Sincronizar con backend
    try {
        const backendResult = await checkActiveServiceInBackend(userId);
        
        // 4. Actualizar caché local con resultado del backend
        if (backendResult.hasActive) {
            setLocalActiveService(backendResult.service);
        } else {
            clearLocalActiveService();
        }

        return { ...backendResult, source: 'backend' };
    } catch (error) {
        // 5. Si falla el backend pero tenemos caché local, usarlo como fallback
        if (localService) {
            console.warn('[ActiveServiceManager] ⚠️ Backend falló, usando caché local como fallback');
            return { hasActive: true, service: localService, source: 'cache' };
        }
        
        // 6. Si no hay caché local, propagar el error
        throw error;
    }
};

/**
 * Registra el inicio de un servicio (Clock In)
 */
export const registerClockIn = async (scheduleId, service) => {
    console.log('[ActiveServiceManager] 📝 Registrando Clock In:', scheduleId);
    setLocalActiveService({
        id: scheduleId,
        client_name: service.client_name,
        client_address: service.client_address,
        start_time: service.start_time,
        clockedInAt: new Date().toISOString()
    });
};

/**
 * Registra el fin de un servicio (Clock Out)
 */
export const registerClockOut = () => {
    console.log('[ActiveServiceManager] 📝 Registrando Clock Out');
    clearLocalActiveService();
};

/**
 * Verifica si el usuario puede hacer Clock In
 * Retorna: { canClockIn: boolean, reason: string|null, activeService: object|null }
 */
export const canUserClockIn = async (userId) => {
    try {
        const result = await syncActiveService(userId, true); // Forzar sync para esta verificación crítica
        
        if (result.hasActive) {
            return {
                canClockIn: false,
                reason: 'Ya tienes un servicio activo en progreso',
                activeService: result.service
            };
        }
        
        return {
            canClockIn: true,
            reason: null,
            activeService: null
        };
    } catch (error) {
        console.error('[ActiveServiceManager] Error verificando si puede hacer Clock In:', error);
        // En caso de error, permitir Clock In para no bloquear al usuario
        return {
            canClockIn: true,
            reason: null,
            activeService: null
        };
    }
};