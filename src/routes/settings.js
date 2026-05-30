// Settings management routes — admin-only (/api/admin/settings)
// GET: fetch all settings (secrets as {isSet: bool}, never values)
// PATCH: update settings (validate, encrypt secrets, audit)
// POST /test-connection: test Okta issuer connectivity

import { knex } from '../db.js';
import { writeAuditLog } from '../utils/audit.js';
import { getAllSettings, getSettingValue, validateSettingNotLocked, isSecretSetting } from '../utils/settings.js';
import { encryptSecret, decryptSecret } from '../utils/secrets.js';

/**
 * GET /api/admin/settings
 * Returns all settings with secrets masked as {isSet: bool}
 */
export async function handleGetSettings(req, res) {
  try {
    const settings = await getAllSettings();

    // Transform secrets to {isSet: bool}, never return ciphertext or plaintext
    const response = settings.map(s => ({
      key: s.key,
      value: s.isSecret ? (s.isSet ? { isSet: true } : { isSet: false }) : s.value,
      isSet: s.isSet,
      isLocked: s.isLocked,
      isSecret: s.isSecret,
    }));

    res.json({ settings: response });
  } catch (err) {
    console.error('[settings] GET failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PATCH /api/admin/settings
 * Update one or more settings
 * Body: { updates: { key: value, ... } }
 */
export async function handlePatchSettings(req, res) {
  try {
    const { updates } = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Invalid request: updates required' });
    }

    const auditMeta = {};
    let restartRequired = false;

    for (const [key, value] of Object.entries(updates)) {
      // Validate key is known
      const validKeys = [
        'AUTH_PROVIDER', 'OKTA_ISSUER', 'OKTA_CLIENT_ID', 'OKTA_CLIENT_SECRET',
        'INITIAL_ADMIN_EMAILS', 'SLACK_WEBHOOK_URL', 'SCIM_AUTH_TOKEN', 'BASE_URL',
      ];
      if (!validKeys.includes(key)) {
        return res.status(400).json({ error: `Unknown setting: ${key}` });
      }

      // Check env override
      try {
        validateSettingNotLocked(key);
      } catch (err) {
        return res.status(409).json({ error: `Setting ${key} is locked by environment variable` });
      }

      // Validate non-null values for certain fields
      if (key === 'AUTH_PROVIDER' && value !== null && !['github', 'okta'].includes(value)) {
        return res.status(400).json({ error: 'AUTH_PROVIDER must be github or okta' });
      }

      // Mark routing fields as requiring restart
      if (['AUTH_PROVIDER', 'OKTA_ISSUER', 'OKTA_CLIENT_ID'].includes(key)) {
        restartRequired = true;
      }

      // Store encrypted secret or plain value
      const isSecret = isSecretSetting(key);
      // Only encrypt non-empty secrets; null/empty values are stored as-is
      const storedValue = isSecret && value !== null && value !== '' ? encryptSecret(value, process.env.SECRET_KEY) : value;

      // Upsert into settings table (insert or update)
      const existing = await knex('settings').where({ key }).first();
      if (existing) {
        await knex('settings').where({ key }).update({
          value: storedValue,
          is_secret: isSecret ? 1 : 0,
          updated_at: new Date().toISOString(),
          updated_by: req.tokenData.user_id,
        });
      } else {
        await knex('settings').insert({
          key,
          value: storedValue,
          is_secret: isSecret ? 1 : 0,
          updated_at: new Date().toISOString(),
          updated_by: req.tokenData.user_id,
        });
      }

      // Redact secret values from audit meta
      auditMeta[key] = isSecret ? '[redacted]' : value;
    }

    // Audit log
    writeAuditLog(knex, {
      actorId: req.tokenData.user_id,
      action: 'settings_update',
      targetType: 'settings',
      targetId: null,
      meta: auditMeta,
    });

    res.json({
      ok: true,
      restartRequired,
      message: restartRequired ? 'Settings saved. Server restart required for changes to take effect.' : 'Settings saved.',
    });
  } catch (err) {
    console.error('[settings] PATCH failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/admin/settings/test-connection
 * Test Okta issuer connectivity by fetching /.well-known/openid-configuration
 * Body: { issuer: string (URL) }
 */
export async function handleTestOktaConnection(req, res) {
  try {
    const { issuer } = req.body;
    if (!issuer || typeof issuer !== 'string') {
      return res.status(400).json({ error: 'issuer required' });
    }

    // Validate issuer is HTTPS and a reasonable URL
    let issuerUrl;
    try {
      issuerUrl = new URL(issuer);
      if (issuerUrl.protocol !== 'https:') {
        return res.status(400).json({ error: 'issuer must use HTTPS' });
      }
    } catch (err) {
      return res.status(400).json({ error: 'issuer must be a valid URL' });
    }

    // Fetch .well-known endpoint
    const wellKnownUrl = new URL('/.well-known/openid-configuration', issuer).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      const response = await fetch(wellKnownUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(400).json({
          error: `Issuer returned ${response.status}`,
          details: `${issuer} is not reachable or not a valid Okta issuer`,
        });
      }

      const data = await response.json();

      // Basic validation: should have issuer and authorization_endpoint
      if (!data.issuer || !data.authorization_endpoint) {
        return res.status(400).json({
          error: 'Invalid OpenID configuration',
          details: 'Response missing required fields (issuer, authorization_endpoint)',
        });
      }

      // Audit log
      writeAuditLog(knex, {
        actorId: req.tokenData.user_id,
        action: 'settings_test_connection',
        targetType: 'okta',
        targetId: null,
        meta: { issuer, success: true },
      });

      res.json({
        ok: true,
        issuer: data.issuer,
        authorizationEndpoint: data.authorization_endpoint,
      });
    } catch (err) {
      clearTimeout(timeout);

      if (err.name === 'AbortError') {
        return res.status(408).json({
          error: 'Connection timeout',
          details: 'Issuer did not respond within 5 seconds',
        });
      }

      console.error('[settings] Test connection failed:', err.message);
      res.status(500).json({
        error: 'Connection failed',
        details: err.message.slice(0, 100),
      });
    }
  } catch (err) {
    console.error('[settings] Test connection error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
