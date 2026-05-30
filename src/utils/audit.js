// Durable audit log writer with retry logic and pool state guards
import { createLogger } from './logger.js';

const logger = createLogger('audit');

// Small backoff: [10ms, 50ms] for transient failures
const RETRY_DELAYS = [10, 50];
const MAX_RETRIES = RETRY_DELAYS.length;

// Guard: check if knex pool is destroyed or closing
function isPoolHealthy(knex) {
  if (!knex || !knex.client || !knex.client.pool) {
    return false;
  }
  // better-sqlite3 doesn't have destroy state, but postgres pools do
  const pool = knex.client.pool;
  if (pool.destroyed || pool.closing) {
    return false;
  }
  return true;
}

// Fire-and-forget audit log writer with retry on transient failures
// Never blocks the caller and never throws post-shutdown
export function writeAuditLog(knex, { actorId, action, targetType, targetId, meta, requestId }) {
  // Avoid queueing if pool is already down
  if (!isPoolHealthy(knex)) {
    logger.debug('audit write skipped', { reason: 'pool_unavailable', action });
    return;
  }

  setImmediate(async () => {
    let lastErr = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Double-check pool health before each attempt (pool might close between retry attempts)
        if (!isPoolHealthy(knex)) {
          logger.debug('audit write abandoned', { reason: 'pool_closed_mid-retry', action, attempt });
          return;
        }

        await knex('audit_log')
          .insert({
            actor_id: actorId || null,
            action,
            target_type: targetType || null,
            target_id: targetId || null,
            meta: meta ? JSON.stringify(meta) : null,
          });

        // Success — exit early
        return;
      } catch (err) {
        lastErr = err;

        // Check if pool is closed or we're in a shutdown (likely cause of error)
        if (!isPoolHealthy(knex)) {
          logger.debug('audit write abandoned', { reason: 'pool_closed', action, attempt });
          return;
        }

        // Check if this is a permanent error (not transient)
        const isPermanent =
          err.message?.includes('Cannot use a pool') ||
          err.message?.includes('no connections available') ||
          err.code === 'POOL_DESTROYED';

        if (attempt < MAX_RETRIES && !isPermanent) {
          // Transient error — wait and retry
          const delay = RETRY_DELAYS[attempt];
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // Last retry or permanent error — give up
          logger.error('audit write failed (giving up)', {
            action,
            attempt: attempt + 1,
            error: err.message,
            requestId,
          });
          return;
        }
      }
    }

    // Should not reach here, but just in case
    if (lastErr) {
      logger.error('audit write failed (max retries exceeded)', {
        action,
        error: lastErr.message,
        requestId,
      });
    }
  });
}
