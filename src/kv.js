import { createHash } from 'crypto';
import { readFile, writeFile, unlink, readdir, mkdirSync, existsSync } from 'fs';
import { readFile as readFileAsync, writeFile as writeFileAsync, unlink as unlinkAsync, readdir as readdirAsync } from 'fs/promises';
import { join } from 'path';

export class FileKv {
  constructor(dir) {
    this.dir = dir;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  _hash(key) {
    return createHash('sha256').update(key).digest('hex');
  }

  async get(key, type = 'text') {
    const hash = this._hash(key);
    const metaPath = join(this.dir, hash + '.meta');
    const valPath = join(this.dir, hash + '.val');
    try {
      const meta = JSON.parse(await readFileAsync(metaPath, 'utf-8'));
      if (meta.expires_at && new Date(meta.expires_at) < new Date()) {
        await unlinkAsync(metaPath).catch(() => {});
        await unlinkAsync(valPath).catch(() => {});
        return null;
      }
      const raw = await readFileAsync(valPath, 'utf-8');
      return type === 'json' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }

  async put(key, value, opts = {}) {
    const hash = this._hash(key);
    const expires_at = opts.expirationTtl
      ? new Date(Date.now() + opts.expirationTtl * 1000).toISOString()
      : null;
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    await writeFileAsync(join(this.dir, hash + '.val'), str);
    await writeFileAsync(join(this.dir, hash + '.meta'), JSON.stringify({ expires_at, key }));
  }

  async delete(key) {
    const hash = this._hash(key);
    await unlinkAsync(join(this.dir, hash + '.meta')).catch(() => {});
    await unlinkAsync(join(this.dir, hash + '.val')).catch(() => {});
  }

  async cleanup() {
    try {
      const files = await readdirAsync(this.dir);
      const metaFiles = files.filter(f => f.endsWith('.meta'));
      let cleaned = 0;
      for (const metaFile of metaFiles) {
        try {
          const meta = JSON.parse(await readFileAsync(join(this.dir, metaFile), 'utf-8'));
          if (meta.expires_at && new Date(meta.expires_at) < new Date()) {
            const base = metaFile.replace('.meta', '');
            await unlinkAsync(join(this.dir, metaFile)).catch(() => {});
            await unlinkAsync(join(this.dir, base + '.val')).catch(() => {});
            cleaned++;
          }
        } catch {
          // skip corrupt entries
        }
      }
      if (cleaned > 0) console.log(`[kv] cleaned ${cleaned} expired entries`);
    } catch {
      // kv dir may not exist yet
    }
  }
}
