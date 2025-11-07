
// Gestor de estado del servicio activo con persistencia local y sincronización con backend
// Sistema OFFLINE-FIRST con cola de eventos persistente y reintentos automáticos
import { base44 } from '@/api/base44Client';

const ACTIVE_SERVICE_KEY = 'redoak_active_service';
const LAST_SYNC_KEY = 'redoak_last_sync';
const SYNC_THRESHOLD = 30000; // 30 segundos

// NUEVO: Claves para la cola de eventos offline
const OFFLINE_QUEUE_KEY = 'redoak_offline_queue';
const SYNC_WORKER_RUNNING_KEY = 'redoak_sync_worker';

/**
 * Estructura de un evento en la cola:
 * {
 *   id: string (UUID),
 *   type: 'clock_in' | 'clock_out',
 *   timestamp: string (ISO 8601 - hora EXACTA del botón),
 *   scheduleId: string,
 *   cleanerId: string,
 *   location: string | null (coordenadas GPS),
 *   status: 'pending' | 'sent' | 'failed',
 *   retries: number,
 *   lastAttempt: string | null (ISO 8601),
 *   error: string | null
 * }
 */

// Generar UUID simple para IDs de eventos
const generateEventId = () => {
    return 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

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

// ==================== SISTEMA DE COLA OFFLINE ====================

/**
 * Obtiene la cola de eventos offline
 */
export const getOfflineQueue = () => {
    try {
        const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error('[OfflineQueue] Error leyendo cola:', error);
        return [];
    }
};

/**
 * Guarda la cola de eventos offline
 */
const saveOfflineQueue = (queue) => {
    try {
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
        console.log('[OfflineQueue] 💾 Cola guardada:', queue.length, 'eventos');
    } catch (error) {
        console.error('[OfflineQueue] Error guardando cola:', error);
    }
};

/**
 * Agrega un evento a la cola offline
 */
export const enqueueOfflineEvent = async (eventData) => {
    const event = {
        id: generateEventId(),
        ...eventData,
        status: 'pending',
        retries: 0,
        lastAttempt: null,
        error: null
    };

    const queue = getOfflineQueue();
    queue.push(event);
    saveOfflineQueue(queue);

    console.log('[OfflineQueue] ➕ Evento agregado a la cola:', event.id, event.type);
    
    // Intentar sincronizar inmediatamente
    await startSyncWorker();
    
    return event.id;
};

/**
 * Elimina un evento de la cola
 */
const removeEventFromQueue = (eventId) => {
    const queue = getOfflineQueue();
    const newQueue = queue.filter(e => e.id !== eventId);
    saveOfflineQueue(newQueue);
    console.log('[OfflineQueue] ➖ Evento eliminado de la cola:', eventId);
};

/**
 * Actualiza un evento en la cola
 */
const updateEventInQueue = (eventId, updates) => {
    const queue = getOfflineQueue();
    const index = queue.findIndex(e => e.id === eventId);
    if (index >= 0) {
        queue[index] = { ...queue[index], ...updates };
        saveOfflineQueue(queue);
        console.log('[OfflineQueue] 🔄 Evento actualizado:', eventId, updates);
    }
};

/**
 * Verifica si hay conexión a internet
 */
const isOnline = () => {
    return navigator.onLine;
};

/**
 * Obtiene la ubicación GPS actual
 */
const getCurrentLocation = () => {
    return new Promise((resolve) => {
        if (!('geolocation' in navigator)) {
            resolve(null);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const location = `${position.coords.latitude},${position.coords.longitude}`;
                console.log('[Location] 📍 GPS obtenido:', location);
                resolve(location);
            },
            (error) => {
                console.warn('[Location] ⚠️ Error obteniendo GPS:', error.message);
                resolve(null);
            },
            {
                timeout: 10000,
                enableHighAccuracy: true
            }
        );
    });
};

/**
 * Procesa un evento de Clock In
 */
const processClockInEvent = async (event) => {
    console.log('[SyncWorker] 📥 Procesando Clock In:', event.id);
    
    // Obtener el Schedule actual
    const schedules = await base44.entities.Schedule.list();
    const schedule = schedules.find(s => s.id === event.scheduleId);
    
    if (!schedule) {
        throw new Error('Schedule no encontrado');
    }

    // Preparar los datos de clock_in_data
    const updatedClockInData = [...(schedule.clock_in_data || [])];
    const existingIndex = updatedClockInData.findIndex(c => c.cleaner_id === event.cleanerId);

    const clockInEntry = {
        cleaner_id: event.cleanerId,
        clock_in_time: event.timestamp, // ⭐ Hora ORIGINAL del botón
        clock_in_location: event.location,
        clock_out_time: null,
        clock_out_location: null
    };

    if (existingIndex >= 0) {
        updatedClockInData[existingIndex] = clockInEntry;
    } else {
        updatedClockInData.push(clockInEntry);
    }

    // Actualizar en el backend
    await base44.entities.Schedule.update(schedule.id, {
        clock_in_data: updatedClockInData,
        status: 'in_progress'
    });

    console.log('[SyncWorker] ✅ Clock In procesado exitosamente');
};

/**
 * Procesa un evento de Clock Out
 */
const processClockOutEvent = async (event) => {
    console.log('[SyncWorker] 📤 Procesando Clock Out:', event.id);
    
    // Obtener el Schedule actual
    const schedules = await base44.entities.Schedule.list();
    const schedule = schedules.find(s => s.id === event.scheduleId);
    
    if (!schedule) {
        throw new Error('Schedule no encontrado');
    }

    // Actualizar clock_out en clock_in_data
    const updatedClockInData = [...(schedule.clock_in_data || [])];
    const existingIndex = updatedClockInData.findIndex(c => c.cleaner_id === event.cleanerId);

    if (existingIndex >= 0) {
        updatedClockInData[existingIndex] = {
            ...updatedClockInData[existingIndex],
            clock_out_time: event.timestamp, // ⭐ Hora ORIGINAL del botón
            clock_out_location: event.location
        };
    }

    // Verificar si todos los limpiadores han hecho clock out
    const allClockedOut = updatedClockInData.every(c => c.clock_out_time);
    const newStatus = allClockedOut ? 'completed' : schedule.status;

    // Actualizar en el backend
    await base44.entities.Schedule.update(schedule.id, {
        clock_in_data: updatedClockInData,
        status: newStatus
    });

    // Si todos terminaron, procesar WorkEntries
    if (newStatus === 'completed') {
        try {
            await base44.functions.invoke('processScheduleForWorkEntries', {
                scheduleId: schedule.id,
                mode: 'create'
            });
            console.log('[SyncWorker] 📝 WorkEntries procesadas');
        } catch (workEntryError) {
            console.warn('[SyncWorker] ⚠️ Error procesando WorkEntries:', workEntryError);
            // No re-lanzar el error, el Clock Out fue exitoso
        }
    }

    console.log('[SyncWorker] ✅ Clock Out procesado exitosamente');
};

/**
 * Worker de sincronización - Procesa eventos pendientes en la cola
 */
let syncWorkerInterval = null;

export const startSyncWorker = async () => {
    // Evitar múltiples workers simultáneos
    if (syncWorkerInterval) {
        console.log('[SyncWorker] 🔄 Ya hay un worker corriendo');
        return;
    }

    console.log('[SyncWorker] 🚀 Iniciando worker de sincronización');

    const processPendingEvents = async () => {
        // Verificar conectividad
        if (!isOnline()) {
            console.log('[SyncWorker] 📡 Sin conexión, esperando...');
            return;
        }

        const queue = getOfflineQueue();
        const pendingEvents = queue.filter(e => e.status === 'pending' || e.status === 'failed');

        if (pendingEvents.length === 0) {
            console.log('[SyncWorker] ✨ Cola vacía, deteniendo worker');
            if (syncWorkerInterval) {
                clearInterval(syncWorkerInterval);
                syncWorkerInterval = null;
            }
            return;
        }

        console.log('[SyncWorker] 📋 Procesando', pendingEvents.length, 'eventos pendientes');

        // Procesar eventos en orden (FIFO)
        for (const event of pendingEvents) {
            // Calcular tiempo de espera con exponential backoff
            const backoffMs = Math.min(1000 * Math.pow(2, event.retries), 60000); // Max 60 segundos
            const timeSinceLastAttempt = event.lastAttempt 
                ? Date.now() - new Date(event.lastAttempt).getTime()
                : Infinity;

            if (timeSinceLastAttempt < backoffMs) {
                console.log('[SyncWorker] ⏳ Esperando backoff para evento:', event.id);
                continue; // Esperar más tiempo antes de reintentar
            }

            console.log('[SyncWorker] 🔄 Intentando procesar evento:', event.id, 'Intento #', event.retries + 1);

            try {
                // Actualizar estado antes de intentar
                updateEventInQueue(event.id, {
                    lastAttempt: new Date().toISOString()
                });

                // Procesar según el tipo
                if (event.type === 'clock_in') {
                    await processClockInEvent(event);
                } else if (event.type === 'clock_out') {
                    await processClockOutEvent(event);
                }

                // ✅ Éxito: Eliminar de la cola
                removeEventFromQueue(event.id);
                console.log('[SyncWorker] ✅ Evento procesado y eliminado:', event.id);

            } catch (error) {
                // ❌ Error: Incrementar reintentos
                console.error('[SyncWorker] ❌ Error procesando evento:', event.id, error.message);
                
                const newRetries = event.retries + 1;
                const maxRetries = 10; // Intentar hasta 10 veces

                if (newRetries >= maxRetries) {
                    console.error('[SyncWorker] 🚨 Máximo de reintentos alcanzado para:', event.id);
                    // Marcar como fallido permanentemente pero NO eliminar
                    // Esto permite revisión manual y reintentos futuros
                    updateEventInQueue(event.id, {
                        status: 'failed',
                        retries: newRetries,
                        error: error.message
                    });
                } else {
                    updateEventInQueue(event.id, {
                        status: 'failed',
                        retries: newRetries,
                        error: error.message
                    });
                }
            }
        }
    };

    // Procesar inmediatamente
    await processPendingEvents();

    // Continuar procesando cada 10 segundos
    syncWorkerInterval = setInterval(processPendingEvents, 10000);

    // Escuchar cambios de conectividad
    window.addEventListener('online', () => {
        console.log('[SyncWorker] 🌐 Conexión restaurada, procesando cola');
        processPendingEvents();
    });
};

/**
 * Detiene el worker de sincronización
 */
export const stopSyncWorker = () => {
    if (syncWorkerInterval) {
        clearInterval(syncWorkerInterval);
        syncWorkerInterval = null;
        console.log('[SyncWorker] 🛑 Worker detenido');
    }
};

/**
 * Obtiene estadísticas de la cola
 */
export const getQueueStats = () => {
    const queue = getOfflineQueue();
    return {
        total: queue.length,
        pending: queue.filter(e => e.status === 'pending').length,
        failed: queue.filter(e => e.status === 'failed').length,
        sent: queue.filter(e => e.status === 'sent').length
    };
};

// ==================== FIN SISTEMA DE COLA OFFLINE ====================

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
export const syncActiveService = async (userId) => {
    console.log('[ActiveServiceManager] 🔄 Sincronizando servicio activo para usuario:', userId);
    
    try {
        // NUEVO: Verificar si acabamos de hacer Clock Out
        const clockOutPending = localStorage.getItem(`clock_out_pending_${userId}`);
        const clockOutTime = localStorage.getItem(`clock_out_time_${userId}`);
        
        if (clockOutPending && clockOutTime) {
            const timeSinceClockOut = Date.now() - parseInt(clockOutTime);
            if (timeSinceClockOut < 10000) { // Durante 10 segundos después del Clock Out
                console.log('[ActiveServiceManager] 🚫 Clock Out reciente detectado, no hay servicio activo');
                return {
                    hasActive: false,
                    service: null,
                    source: 'optimistic_update'
                };
            } else {
                // Limpiar flags si ya pasaron 10 segundos
                localStorage.removeItem(`clock_out_pending_${userId}`);
                localStorage.removeItem(`clock_out_time_${userId}`);
            }
        }
        
        // Verificar flag de skip_active_check
        const skipActiveCheck = localStorage.getItem(`skip_active_check_${userId}`);
        if (skipActiveCheck) {
            const skipTime = parseInt(skipActiveCheck);
            const now = Date.now();
            if (now - skipTime < 5000) { // Solo por 5 segundos
                console.log('[ActiveServiceManager] 🚫 Verificación deshabilitada temporalmente');
                return {
                    hasActive: false,
                    service: null,
                    source: 'skip_check'
                };
            } else {
                localStorage.removeItem(`skip_active_check_${userId}`);
            }
        }

        // 1. Primero revisar caché local
        const localService = getLocalActiveService();
        
        // 2. Si no necesitamos sincronizar y tenemos datos locales, usarlos
        // Note: 'forceSync' parameter removed, so only needsSync() is checked.
        if (!needsSync() && localService) {
            console.log('[ActiveServiceManager] 📦 Usando caché local (reciente)');
            return { hasActive: true, service: localService, source: 'cache' };
        }

        // 3. Sincronizar con backend
        const backendResult = await checkActiveServiceInBackend(userId);
        
        // 4. Actualizar caché local con resultado del backend
        if (backendResult.hasActive) {
            setLocalActiveService(backendResult.service);
        } else {
            clearLocalActiveService();
        }

        return { ...backendResult, source: 'backend' };
    } catch (error) {
        console.error('[ActiveServiceManager] ❌ Error sincronizando:', error);
        
        // Si hay error en la red pero tenemos una marca de Clock Out reciente, asumir que no hay servicio activo
        const clockOutPending = localStorage.getItem(`clock_out_pending_${userId}`);
        if (clockOutPending) {
            console.warn('[ActiveServiceManager] ⚠️ Error de red con Clock Out pendiente, asumiendo no activo.');
            return {
                hasActive: false,
                service: null,
                source: 'error_with_pending_clock_out'
            };
        }
        
        // Si no hay clock out pendiente, y tenemos un local service, usamos el local
        const localService = getLocalActiveService();
        if (localService) {
            console.warn('[ActiveServiceManager] ⚠️ Backend falló, usando caché local como fallback');
            return { hasActive: true, service: localService, source: 'cache' };
        }

        return {
            hasActive: false,
            service: null,
            source: 'error'
        };
    }
};

/**
 * Registra el inicio de un servicio (Clock In) - OFFLINE-FIRST
 * Retorna: { success: boolean, eventId: string, message: string }
 */
export const registerClockIn = async (scheduleId, service, userId) => {
    console.log('[ClockIn] 🕐 Registrando Clock In OFFLINE-FIRST:', scheduleId);
    
    const timestamp = new Date().toISOString(); // ⭐ Hora EXACTA del botón
    
    // 1. Actualizar caché local INMEDIATAMENTE
    setLocalActiveService({
        id: scheduleId,
        client_name: service.client_name,
        client_address: service.client_address,
        start_time: service.start_time,
        clockedInAt: timestamp
    });
    console.log('[ClockIn] 💾 Estado local actualizado');

    // Desactivar temporalmente la verificación activa para evitar carreras al actualizar el estado
    localStorage.setItem(`skip_active_check_${userId}`, Date.now().toString());


    // 2. Obtener ubicación (en segundo plano, no bloquear)
    const location = await getCurrentLocation();

    // 3. Agregar a la cola offline
    const eventId = await enqueueOfflineEvent({
        type: 'clock_in',
        timestamp: timestamp, // ⭐ Hora EXACTA del botón
        scheduleId: scheduleId,
        cleanerId: userId,
        location: location
    });

    console.log('[ClockIn] ✅ Clock In registrado localmente, eventId:', eventId);

    return {
        success: true,
        eventId: eventId,
        message: 'Clock In registrado. Se sincronizará automáticamente cuando haya conexión.'
    };
};

/**
 * Registra el fin de un servicio (Clock Out) - OFFLINE-FIRST
 * Retorna: { success: boolean, eventId: string, message: string }
 */
export const registerClockOut = async (scheduleId, userId) => {
    console.log('[ClockOut] 🕐 Registrando Clock Out OFFLINE-FIRST:', scheduleId);
    
    const timestamp = new Date().toISOString(); // ⭐ Hora EXACTA del botón
    
    // 1. Limpiar caché local INMEDIATAMENTE
    clearLocalActiveService();
    console.log('[ClockOut] 💾 Estado local limpiado');

    // Set optimistic flags for a short period after clock out
    localStorage.setItem(`clock_out_pending_${userId}`, 'true');
    localStorage.setItem(`clock_out_time_${userId}`, Date.now().toString());


    // 2. Obtener ubicación (en segundo plano, no bloquear)
    const location = await getCurrentLocation();

    // 3. Agregar a la cola offline
    const eventId = await enqueueOfflineEvent({
        type: 'clock_out',
        timestamp: timestamp, // ⭐ Hora EXACTA del botón
        scheduleId: scheduleId,
        cleanerId: userId,
        location: location
    });

    console.log('[ClockOut] ✅ Clock Out registrado localmente, eventId:', eventId);

    return {
        success: true,
        eventId: eventId,
        message: 'Clock Out registrado. Se sincronizará automáticamente cuando haya conexión.'
    };
};

/**
 * Verifica si el usuario puede hacer Clock In
 * Retorna: { canClockIn: boolean, reason: string|null, activeService: object|null }
 */
export const canUserClockIn = async (userId) => {
    try {
        // Call syncActiveService without forceSync parameter, as it's been removed
        // The new internal logic of syncActiveService will handle temporary skips/optimistic updates.
        const result = await syncActiveService(userId);
        
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
        // Note: The new syncActiveService error handling should ideally prevent this if clock_out_pending is set.
        // If an actual network error occurs and no local fallbacks, it's safer to allow clock in.
        return {
            canClockIn: true,
            reason: null,
            activeService: null
        };
    }
};

// Iniciar el worker automáticamente al cargar el módulo
// Esto asegura que eventos pendientes se procesen incluso después de recargas
if (typeof window !== 'undefined') {
    // Esperar un momento para que la app se cargue
    setTimeout(() => {
        const queue = getOfflineQueue();
        if (queue.length > 0) {
            console.log('[ActiveServiceManager] 🔄 Hay eventos pendientes, iniciando worker...');
            startSyncWorker();
        }
    }, 2000);
}
