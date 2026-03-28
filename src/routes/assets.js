import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ASSETS = {
  'plan.css': { body: readFileSync(join(__dirname, '../assets/plan.css'), 'utf-8'), type: 'text/css' },
  'plan.js': { body: readFileSync(join(__dirname, '../assets/plan.js'), 'utf-8'), type: 'application/javascript' },
};

// Pre-compute ETags at startup
for (const a of Object.values(ASSETS)) {
  a.etag = '"' + createHash('md5').update(a.body).digest('hex') + '"';
}

export function handleAsset(req, res) {
  const asset = ASSETS[req.params.file];
  if (!asset) return res.status(404).json({ error: 'not_found' });
  if (req.headers['if-none-match'] === asset.etag) return res.status(304).end();
  res.set({
    'Content-Type': asset.type + '; charset=UTF-8',
    'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    'ETag': asset.etag,
    'Access-Control-Allow-Origin': '*',
  }).send(asset.body);
}
