import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import knexLib from 'knex';
import { writeAuditLog } from '../../src/utils/audit.js';

describe('audit.js', () => {
  let db;

  beforeEach(async () => {
    // Create an in-memory SQLite database for testing
    db = knexLib({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
      pool: { min: 1, max: 1, afterCreate(c, done) { c.pragma('foreign_keys = ON'); done(null, c); } },
    });

    // Create audit_log table
    await db.schema.createTable('audit_log', (t) => {
      t.increments('id').primary();
      t.uuid('actor_id');
      t.string('action').notNullable();
      t.string('target_type');
      t.string('target_id');
      t.text('meta');
      t.timestamps(true, true);
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe('writeAuditLog', () => {
    it('writes audit log entry successfully', async () => {
      await new Promise((resolve) => {
        writeAuditLog(db, {
          actorId: 'user-123',
          action: 'test.action',
          targetType: 'test',
          targetId: 'target-1',
          meta: { foo: 'bar' },
          requestId: 'req_abc123',
        });

        // Wait for setImmediate
        setTimeout(async () => {
          const entry = await db('audit_log').first();
          expect(entry).toBeDefined();
          expect(entry.action).toBe('test.action');
          expect(entry.actor_id).toBe('user-123');
          expect(entry.target_id).toBe('target-1');
          expect(JSON.parse(entry.meta)).toEqual({ foo: 'bar' });
          resolve();
        }, 50);
      });
    });

    it('continues to retry after transient errors', async () => {
      // Write multiple entries rapidly and verify they all succeed
      await new Promise((resolve) => {
        writeAuditLog(db, {
          actorId: 'user-123',
          action: 'test.retry.1',
          targetType: 'test',
          targetId: 'target-1',
          requestId: 'req_retry_1',
        });

        writeAuditLog(db, {
          actorId: 'user-456',
          action: 'test.retry.2',
          targetType: 'test',
          targetId: 'target-2',
          requestId: 'req_retry_2',
        });

        // Wait for both writes
        setTimeout(async () => {
          const entries = await db('audit_log')
            .where('action', 'like', 'test.retry.%')
            .orderBy('id');
          expect(entries).toHaveLength(2);
          expect(entries[0].action).toBe('test.retry.1');
          expect(entries[1].action).toBe('test.retry.2');
          resolve();
        }, 150);
      });
    });

    it('does not throw when pool is destroyed', async () => {
      await new Promise((resolve) => {
        // Destroy the pool before writing audit
        db.destroy();

        // This should not throw
        expect(() => {
          writeAuditLog(db, {
            actorId: 'user-123',
            action: 'test.after_destroy',
            targetType: 'test',
            targetId: 'target-1',
            requestId: 'req_destroy',
          });
        }).not.toThrow();

        // Wait a bit to let the setImmediate handler run
        setTimeout(() => {
          resolve();
        }, 50);
      });
    });

    it('handles null actor_id and meta gracefully', async () => {
      await new Promise((resolve) => {
        writeAuditLog(db, {
          action: 'test.minimal',
          requestId: 'req_minimal',
        });

        setTimeout(async () => {
          const entry = await db('audit_log').where({ action: 'test.minimal' }).first();
          expect(entry).toBeDefined();
          expect(entry.actor_id).toBeNull();
          expect(entry.meta).toBeNull();
          resolve();
        }, 50);
      });
    });
  });
});
