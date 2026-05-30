// Minimal in-house structured JSON logger
// Outputs JSON to stdout for production observability

export function createLogger(namespace = '') {
  const prefix = namespace ? `[${namespace}]` : '';

  function formatLog(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const log = {
      timestamp,
      level,
      message,
      ...(data && Object.keys(data).length > 0 && { data }),
    };
    return JSON.stringify(log);
  }

  return {
    info(message, data) {
      console.log(formatLog('info', `${prefix} ${message}`, data));
    },
    warn(message, data) {
      console.warn(formatLog('warn', `${prefix} ${message}`, data));
    },
    error(message, data) {
      console.error(formatLog('error', `${prefix} ${message}`, data));
    },
    debug(message, data) {
      if (process.env.DEBUG) {
        console.log(formatLog('debug', `${prefix} ${message}`, data));
      }
    },
  };
}

export const globalLogger = createLogger();
