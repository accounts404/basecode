// Sistema de Logging Centralizado

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    CRITICAL: 4
};

const LOG_LEVEL_NAMES = {
    0: 'DEBUG',
    1: 'INFO',
    2: 'WARN',
    3: 'ERROR',
    4: 'CRITICAL'
};

class Logger {
    constructor() {
        this.currentLevel = LOG_LEVELS.INFO; // Nivel por defecto
        this.logs = [];
        this.maxLogsInMemory = 1000;
        this.listeners = new Set();
        
        // Detectar entorno
        this.isDevelopment = process.env.NODE_ENV === 'development';
        
        // En desarrollo, mostrar todos los logs
        if (this.isDevelopment) {
            this.currentLevel = LOG_LEVELS.DEBUG;
        }
    }

    /**
     * Establece el nivel mínimo de logging
     */
    setLevel(level) {
        if (typeof level === 'string') {
            this.currentLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
        } else {
            this.currentLevel = level;
        }
    }

    /**
     * Formatea un mensaje de log
     */
    _formatMessage(level, context, message, data) {
        const timestamp = new Date().toISOString();
        const levelName = LOG_LEVEL_NAMES[level];
        
        return {
            timestamp,
            level: levelName,
            context,
            message,
            data,
            userAgent: navigator.userAgent,
            url: window.location.href
        };
    }

    /**
     * Guarda log en memoria
     */
    _saveLog(logEntry) {
        this.logs.push(logEntry);
        
        // Mantener solo los últimos N logs
        if (this.logs.length > this.maxLogsInMemory) {
            this.logs.shift();
        }

        // Notificar a listeners
        this.listeners.forEach(listener => {
            try {
                listener(logEntry);
            } catch (error) {
                console.error('[Logger] Error en listener:', error);
            }
        });
    }

    /**
     * Escribe log en consola con formato
     */
    _writeToConsole(level, context, message, data) {
        const emoji = {
            [LOG_LEVELS.DEBUG]: '🔍',
            [LOG_LEVELS.INFO]: '📘',
            [LOG_LEVELS.WARN]: '⚠️',
            [LOG_LEVELS.ERROR]: '❌',
            [LOG_LEVELS.CRITICAL]: '🔥'
        };

        const styles = {
            [LOG_LEVELS.DEBUG]: 'color: #6b7280',
            [LOG_LEVELS.INFO]: 'color: #3b82f6',
            [LOG_LEVELS.WARN]: 'color: #f59e0b',
            [LOG_LEVELS.ERROR]: 'color: #ef4444',
            [LOG_LEVELS.CRITICAL]: 'color: #dc2626; font-weight: bold'
        };

        const prefix = `${emoji[level]} [${context}]`;
        
        if (data) {
            console.log(`%c${prefix}`, styles[level], message, data);
        } else {
            console.log(`%c${prefix}`, styles[level], message);
        }
    }

    /**
     * Método genérico de logging
     */
    _log(level, context, message, data = null) {
        // Verificar nivel mínimo
        if (level < this.currentLevel) {
            return;
        }

        // Formatear entrada de log
        const logEntry = this._formatMessage(level, context, message, data);

        // Guardar en memoria
        this._saveLog(logEntry);

        // Escribir en consola
        this._writeToConsole(level, context, message, data);

        // En producción y errores críticos, enviar al backend
        if (!this.isDevelopment && level >= LOG_LEVELS.ERROR) {
            this._sendToBackend(logEntry).catch(err => {
                console.error('[Logger] Error enviando log al backend:', err);
            });
        }
    }

    /**
     * Envía logs críticos al backend
     */
    async _sendToBackend(logEntry) {
        try {
            // Aquí podrías implementar el envío a un endpoint de logging
            // Por ahora solo lo guardamos en localStorage para análisis posterior
            const errorLogs = JSON.parse(localStorage.getItem('redoak_error_logs') || '[]');
            errorLogs.push(logEntry);
            
            // Mantener solo los últimos 100 errores
            if (errorLogs.length > 100) {
                errorLogs.shift();
            }
            
            localStorage.setItem('redoak_error_logs', JSON.stringify(errorLogs));
        } catch (error) {
            console.error('[Logger] Error guardando log en localStorage:', error);
        }
    }

    /**
     * Métodos de logging por nivel
     */
    debug(context, message, data) {
        this._log(LOG_LEVELS.DEBUG, context, message, data);
    }

    info(context, message, data) {
        this._log(LOG_LEVELS.INFO, context, message, data);
    }

    warn(context, message, data) {
        this._log(LOG_LEVELS.WARN, context, message, data);
    }

    error(context, message, error) {
        const errorData = error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
        } : error;
        
        this._log(LOG_LEVELS.ERROR, context, message, errorData);
    }

    critical(context, message, error) {
        const errorData = error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
        } : error;
        
        this._log(LOG_LEVELS.CRITICAL, context, message, errorData);
    }

    /**
     * Agrega un listener para logs
     */
    addListener(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Obtiene los logs en memoria
     */
    getLogs(filter = {}) {
        let filteredLogs = [...this.logs];

        if (filter.level) {
            const minLevel = LOG_LEVELS[filter.level.toUpperCase()];
            filteredLogs = filteredLogs.filter(log => 
                LOG_LEVELS[log.level] >= minLevel
            );
        }

        if (filter.context) {
            filteredLogs = filteredLogs.filter(log => 
                log.context.includes(filter.context)
            );
        }

        if (filter.limit) {
            filteredLogs = filteredLogs.slice(-filter.limit);
        }

        return filteredLogs;
    }

    /**
     * Limpia los logs en memoria
     */
    clearLogs() {
        this.logs = [];
    }

    /**
     * Obtiene logs de errores guardados
     */
    getStoredErrorLogs() {
        try {
            return JSON.parse(localStorage.getItem('redoak_error_logs') || '[]');
        } catch (error) {
            console.error('[Logger] Error obteniendo logs guardados:', error);
            return [];
        }
    }

    /**
     * Limpia logs de errores guardados
     */
    clearStoredErrorLogs() {
        try {
            localStorage.removeItem('redoak_error_logs');
        } catch (error) {
            console.error('[Logger] Error limpiando logs guardados:', error);
        }
    }
}

// Instancia singleton
const logger = new Logger();

// Capturar errores no manejados
window.addEventListener('error', (event) => {
    logger.critical('Window', 'Error no manejado', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
    });
});

// Capturar promesas rechazadas no manejadas
window.addEventListener('unhandledrejection', (event) => {
    logger.critical('Window', 'Promise rechazada no manejada', {
        reason: event.reason,
        promise: event.promise
    });
});

export default logger;
export { LOG_LEVELS };