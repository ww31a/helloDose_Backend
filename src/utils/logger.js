/**
 * Minimal logger — wraps console with level prefixes.
 * Swap for winston/pino post-MVP.
 */
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
};

export default logger;
