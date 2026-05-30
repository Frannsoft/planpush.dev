import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLogger } from '../../src/utils/logger.js';

describe('logger.js', () => {
  let consoleLogSpy;
  let consoleWarnSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('createLogger', () => {
    it('logs to console with structured JSON', () => {
      const logger = createLogger('test');
      logger.info('test message', { key: 'value' });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed).toMatchObject({
        level: 'info',
        message: expect.stringContaining('test message'),
        data: { key: 'value' },
      });
      expect(parsed.timestamp).toBeDefined();
    });

    it('includes namespace in message', () => {
      const logger = createLogger('audit');
      logger.info('test');

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.message).toContain('[audit]');
    });

    it('handles error level', () => {
      const logger = createLogger();
      logger.error('error message', { error: 'details' });

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const output = consoleErrorSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe('error');
    });

    it('handles warn level', () => {
      const logger = createLogger();
      logger.warn('warning message');

      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      const output = consoleWarnSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe('warn');
    });

    it('omits data field when empty', () => {
      const logger = createLogger();
      logger.info('message only');

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.data).toBeUndefined();
    });

    it('respects DEBUG env var for debug logs', () => {
      const oldDebug = process.env.DEBUG;

      // Debug off
      delete process.env.DEBUG;
      const logger = createLogger();
      logger.debug('debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();

      // Debug on
      consoleLogSpy.mockClear();
      process.env.DEBUG = '1';
      const logger2 = createLogger();
      logger2.debug('debug message');
      expect(consoleLogSpy).toHaveBeenCalledOnce();

      // Restore
      if (oldDebug) process.env.DEBUG = oldDebug;
      else delete process.env.DEBUG;
    });
  });
});
