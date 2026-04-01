// Sistema de Caché Avanzado con Expiración e Invalidación Inteligente

const CACHE_PREFIX = 'redoak_cache_';
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutos

class CacheManager {
    constructor() {
        this.memoryCache = new Map();
        this.subscribers = new Map();
    }

    /**
     * Genera una clave de caché con prefijo
     */
    _getCacheKey(key) {
        return `${CACHE_PREFIX}${key}`;
    }

    /**
     * Guarda datos en caché con TTL
     */
    set(key, data, ttl = DEFAULT_TTL) {
        const cacheKey = this._getCacheKey(key);
        const cacheEntry = {
            data,
            timestamp: Date.now(),
            ttl,
            expiresAt: Date.now() + ttl
        };

        // Guardar en memoria
        this.memoryCache.set(cacheKey, cacheEntry);

        // Guardar en localStorage
        try {
            localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                // Limpiar todas las entradas de cache antiguas y reintentar
                try {
                    const keysToRemove = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k && k.startsWith(CACHE_PREFIX)) keysToRemove.push(k);
                    }
                    keysToRemove.forEach(k => localStorage.removeItem(k));
                    localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
                } catch (retryError) {
                    // Si sigue fallando, solo usar memoria — no bloqueamos el flujo
                }
            }
        }

        // Notificar a suscriptores
        this._notifySubscribers(key, data);

        return true;
    }

    /**
     * Obtiene datos de caché si no han expirado
     */
    get(key) {
        const cacheKey = this._getCacheKey(key);
        
        // Intentar obtener de memoria primero (más rápido)
        let cacheEntry = this.memoryCache.get(cacheKey);
        
        // Si no está en memoria, intentar localStorage
        if (!cacheEntry) {
            try {
                const stored = localStorage.getItem(cacheKey);
                if (stored) {
                    cacheEntry = JSON.parse(stored);
                    // Restaurar en memoria
                    this.memoryCache.set(cacheKey, cacheEntry);
                }
            } catch (error) {
                console.warn('[Cache] Error leyendo de localStorage:', error);
                return null;
            }
        }

        if (!cacheEntry) {
            return null;
        }

        // Verificar expiración
        if (Date.now() > cacheEntry.expiresAt) {
            this.invalidate(key);
            return null;
        }

        return cacheEntry.data;
    }

    /**
     * Invalida una entrada de caché específica
     */
    invalidate(key) {
        const cacheKey = this._getCacheKey(key);
        this.memoryCache.delete(cacheKey);
        
        try {
            localStorage.removeItem(cacheKey);
        } catch (error) {
            console.warn('[Cache] Error eliminando de localStorage:', error);
        }

        this._notifySubscribers(key, null);
    }

    /**
     * Invalida múltiples entradas por patrón
     */
    invalidatePattern(pattern) {
        const regex = new RegExp(pattern);
        const keysToDelete = [];

        // Limpiar memoria
        for (const key of this.memoryCache.keys()) {
            if (regex.test(key)) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => {
            this.memoryCache.delete(key);
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.warn('[Cache] Error eliminando de localStorage:', error);
            }
        });

        // Limpiar localStorage
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && regex.test(key)) {
                    localStorage.removeItem(key);
                }
            }
        } catch (error) {
            console.warn('[Cache] Error limpiando localStorage:', error);
        }
    }

    /**
     * Limpia toda la caché
     */
    clear() {
        this.memoryCache.clear();
        
        try {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(CACHE_PREFIX)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
        } catch (error) {
            console.warn('[Cache] Error limpiando caché:', error);
        }
    }

    /**
     * Obtiene o establece datos (patrón cache-aside)
     */
    async getOrSet(key, fetchFunction, ttl = DEFAULT_TTL) {
        // Intentar obtener de caché
        const cached = this.get(key);
        if (cached !== null) {
            return cached;
        }

        // Si no está en caché, ejecutar función y guardar
        try {
            const data = await fetchFunction();
            this.set(key, data, ttl);
            return data;
        } catch (error) {
            console.error('[Cache] Error en fetchFunction:', error);
            throw error;
        }
    }

    /**
     * Suscribirse a cambios en una clave de caché
     */
    subscribe(key, callback) {
        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, new Set());
        }
        this.subscribers.get(key).add(callback);

        // Retornar función de desuscripción
        return () => {
            const subs = this.subscribers.get(key);
            if (subs) {
                subs.delete(callback);
                if (subs.size === 0) {
                    this.subscribers.delete(key);
                }
            }
        };
    }

    /**
     * Notificar a suscriptores sobre cambios
     */
    _notifySubscribers(key, data) {
        const subs = this.subscribers.get(key);
        if (subs) {
            subs.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('[Cache] Error en callback de suscriptor:', error);
                }
            });
        }
    }

    /**
     * Limpia entradas expiradas
     */
    cleanup() {
        const now = Date.now();
        const keysToDelete = [];

        for (const [key, entry] of this.memoryCache.entries()) {
            if (now > entry.expiresAt) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => {
            this.memoryCache.delete(key);
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.warn('[Cache] Error limpiando entrada expirada:', error);
            }
        });

        return keysToDelete.length;
    }

    /**
     * Obtiene estadísticas de caché
     */
    getStats() {
        return {
            memoryEntries: this.memoryCache.size,
            subscribers: this.subscribers.size
        };
    }
}

// Instancia singleton
const cacheManager = new CacheManager();

// Limpieza automática cada 5 minutos
setInterval(() => {
    const cleaned = cacheManager.cleanup();
    if (cleaned > 0) {
        console.log(`[Cache] Limpiadas ${cleaned} entradas expiradas`);
    }
}, 5 * 60 * 1000);

export default cacheManager;

// Claves de caché predefinidas
export const CACHE_KEYS = {
    SCHEDULES: (dateRange) => `schedules_${dateRange}`,
    SCHEDULE: (id) => `schedule_${id}`,
    CLIENTS: 'clients_all',
    CLIENT: (id) => `client_${id}`,
    USERS: 'users_all',
    USER: (id) => `user_${id}`,
    CLEANERS: 'cleaners_active',
    TEAM_ASSIGNMENTS: (date) => `team_assignments_${date}`,
    WORK_ENTRIES: (period) => `work_entries_${period}`,
    TASKS: (filter) => `tasks_${filter || 'all'}`,
};

// TTLs específicos (en milisegundos)
export const CACHE_TTL = {
    SHORT: 2 * 60 * 1000,      // 2 minutos - datos que cambian frecuentemente
    MEDIUM: 5 * 60 * 1000,     // 5 minutos - default
    LONG: 15 * 60 * 1000,      // 15 minutos - datos más estables
    VERY_LONG: 60 * 60 * 1000, // 1 hora - datos raramente cambian
};