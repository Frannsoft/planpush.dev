import { knex } from './db.js';

class DbKv {
  async get(key, type = 'text') {
    const now = new Date().toISOString();
    const row = await knex('kv_store')
      .where({ key })
      .where(b => b.whereNull('expires_at').orWhere('expires_at', '>', now))
      .first();
    if (!row) return null;
    return type === 'json' ? JSON.parse(row.value) : row.value;
  }

  async put(key, value, opts = {}) {
    const expires_at = opts.expirationTtl
      ? new Date(Date.now() + opts.expirationTtl * 1000).toISOString()
      : null;
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    await knex('kv_store')
      .insert({ key, value: str, expires_at })
      .onConflict('key')
      .merge({ value: str, expires_at });
  }

  async delete(key) {
    await knex('kv_store').where({ key }).delete();
  }

  async cleanup() {
    const now = new Date().toISOString();
    const result = await knex('kv_store')
      .whereNotNull('expires_at')
      .where('expires_at', '<', now)
      .delete();
    const deleted = typeof result === 'object' ? (result?.changes ?? 0) : result;
    if (deleted > 0) console.log(`[kv] cleaned ${deleted} expired entries`);
  }
}

export const kv = new DbKv();
