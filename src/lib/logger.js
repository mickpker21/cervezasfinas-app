/**
 * Enterprise Structured Logger
 * Levels: INFO, WARN, ERROR, CRITICAL
 */

const LOG_LEVELS = {
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
    CRITICAL: 'CRITICAL'
};

export function logEvent(level, module, action, payload = null) {
    const timestamp = new Date().toISOString();
    const cleanLevel = LOG_LEVELS[level] || 'INFO';

    // Structure: [TIMESTAMP] [LEVEL] [MODULE] [ACTION] payload
    const prefix = `[${timestamp}] [${cleanLevel}] [${module}] [${action}]`;

    switch (cleanLevel) {
        case 'WARN':
            console.warn(prefix, payload || '');
            break;
        case 'ERROR':
        case 'CRITICAL':
            console.error(prefix, payload || '');
            break;
        case 'INFO':
        default:
            console.log(prefix, payload || '');
            break;
    }

    // TODO: Here we could dispatch to analytics/Sentry
}

export const logger = {
    info: (module, action, payload) => logEvent('INFO', module, action, payload),
    warn: (module, action, payload) => logEvent('WARN', module, action, payload),
    error: (module, action, payload) => logEvent('ERROR', module, action, payload),
    critical: (module, action, payload) => logEvent('CRITICAL', module, action, payload),
};
