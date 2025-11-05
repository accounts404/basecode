/**
 * GESTOR DE SERVICIO ACTIVO
 * 
 * Este archivo maneja el estado del servicio activo del limpiador usando localStorage.
 * 
 * ⚠️ IMPORTANTE: Las funciones de Clock-In/Clock-Out han sido movidas a clockService.js
 * Este archivo solo mantiene funciones de verificación y sincronización de caché.
 */

import { base44 } from '@/api/base44Client';
import { Schedule } from '@/entities/Schedule';

const ACTIVE_SERVICE_KEY = 'redoak_active_service';
const CACHE_TTL = 30000; // 30 segundos

/**
 * Obtener servicio activo del caché local
 */
export const getLocalActiveService = () => {
    try {
        const cached = localStorage.getItem(ACTIVE_SERVICE_KEY);
        if (!cached) return null;

        const data = JSON.parse(cached);
        const now = Date.now();

        // Validar TTL
        if (data.timestamp && (now - data.timestamp > CACHE_TTL)) {
            console.log('[ActiveServiceManager] ⏰ Caché expirado');
            clearLocalActiveService();
            return null;
        }

        return data;
    } catch (error) {
        console.error('[ActiveServiceManager] Error leyendo caché:', error);
        return null;
    }
};

/**
 * Guardar servicio activo en caché local
 */
export const setLocalActiveService = (serviceData) => {
    try {
        const data = {
            ...serviceData,
            timestamp: Date.now()
        };
        localStorage.setItem(ACTIVE_SERVICE_KEY, JSON.stringify(data));
        console.log('[ActiveServiceManager] ✅ Caché actualizado');
    } catch (error) {
        console.error('[ActiveServiceManager] Error guardando caché:', error);
    }
};

/**
 * Limpiar servicio activo del caché local
 */
export const clearLocalActiveService = () => {
    try {
        localStorage.removeItem(ACTIVE_SERVICE_KEY);
        console.log('[ActiveServiceManager] 🗑️ Caché limpiado');
    } catch (error) {
        console.error('[ActiveServiceManager] Error limpiando caché:', error);
    }
};

/**
 * Verificar si hay un servicio activo en el backend (fuente de verdad)
 * 
 * @param {string} userId - ID del usuario limpiador
 * @returns {Promise<{hasActive: boolean, service: object|null}>}
 */
export const checkActiveServiceInBackend = async (userId) => {
    console.log('[ActiveServiceManager] 🔍 Verificando servicio activo en backend...');
    
    try {
        // Opción 1: Usar función backend dedicada (más eficiente)
        try {
            const { data } = await base44.functions.invoke('checkActiveService', {});
            
            if (data && data.hasActive) {
                console.log('[ActiveServiceManager] ✅ Servicio activo encontrado:', data.service.id);
                return {
                    hasActive: true,
                    service: data.service
                };
            }
            
            console.log('[ActiveServiceManager] ℹ️ No hay servicio activo');
            return { hasActive: false, service: null };
            
        } catch (fnError) {
            console.warn('[ActiveServiceManager] ⚠️ Función backend no disponible, usando filtro directo');
            
            // Opción 2: Fallback a consulta directa
            const schedules = await Schedule.filter({
                cleaner_ids: { $contains: userId },
                status: { $in: ['scheduled', 'in_progress'] }
            });

            const activeService = schedules.find(schedule => {
                if (!schedule.clock_in_data) return false;
                const cleanerClockData = schedule.clock_in_data.find(c => c.cleaner_id === userId);
                return cleanerClockData?.clock_in_time && !cleanerClockData?.clock_out_time;
            });

            if (activeService) {
                console.log('[ActiveServiceManager] ✅ Servicio activo encontrado:', activeService.id);
                return { hasActive: true, service: activeService };
            }

            console.log('[ActiveServiceManager] ℹ️ No hay servicio activo');
            return { hasActive: false, service: null };
        }
        
    } catch (error) {
        console.error('[ActiveServiceManager] ❌ Error verificando servicio activo:', error);
        throw error;
    }
};

/**
 * Sincronizar caché local con backend
 * Útil para asegurar que el caché local esté actualizado
 * 
 * @param {string} userId - ID del usuario limpiador
 */
export const syncActiveService = async (userId) => {
    console.log('[ActiveServiceManager] 🔄 Sincronizando caché con backend...');
    
    try {
        const { hasActive, service } = await checkActiveServiceInBackend(userId);
        
        if (hasActive) {
            const clockInData = service.clock_in_data?.find(c => c.cleaner_id === userId);
            
            setLocalActiveService({
                scheduleId: service.id,
                userId: userId,
                clockInTime: clockInData?.clock_in_time,
                clientName: service.client_name,
                clientAddress: service.client_address
            });
            
            console.log('[ActiveServiceManager] ✅ Sincronización completada - Servicio activo');
            return { hasActive: true, service };
        } else {
            clearLocalActiveService();
            console.log('[ActiveServiceManager] ✅ Sincronización completada - Sin servicio activo');
            return { hasActive: false, service: null };
        }
        
    } catch (error) {
        console.error('[ActiveServiceManager] ❌ Error en sincronización:', error);
        throw error;
    }
};

// =====================================================================
// FUNCIONES OBSOLETAS - Movidas a clockService.js
// =====================================================================
// Las siguientes funciones han sido deprecadas y movidas a clockService.js:
// - registerClockIn() → usar performClockIn() desde clockService.js
// - registerClockOut() → usar performClockOut() desde clockService.js  
// - canUserClockIn() → usar canUserClockIn() desde clockService.js
//
// Estas funciones se mantienen aquí solo para referencia temporal.
// Serán eliminadas en una futura versión.
// =====================================================================

export default {
    getLocalActiveService,
    setLocalActiveService,
    clearLocalActiveService,
    checkActiveServiceInBackend,
    syncActiveService
};