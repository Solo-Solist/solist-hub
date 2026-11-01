/**
 * Unified logger utility
 * Suppresses logs in production, outputs in development only.
 */

const isDev = typeof process !== 'undefined'
  ? process.env.NODE_ENV === 'development'
  : typeof window !== 'undefined' && window.location?.hostname === 'localhost';

function noop() {}

export const logger = {
  log: isDev ? console.log.bind(console) : noop,
  warn: isDev ? console.warn.bind(console) : noop,
  error: isDev ? console.error.bind(console) : noop,
  info: isDev ? console.info.bind(console) : noop,
};
