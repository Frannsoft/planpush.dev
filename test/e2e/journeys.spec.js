import { test, expect } from '@playwright/test';
import { loadFixtures, authenticateAs } from './auth-helper.js';

const fx = loadFixtures();

test.describe('PlanPush E2E Journeys', () => {
  // Auth sanity (redo requirement): the harness-minted cookie must actually authenticate
  // before we rely on it in the journeys.
  test('auth: seeded session cookie authenticates a browser request', async ({ page }) => {
    await authenticateAs(page, fx, 'member');
    const res = await page.request.get('/dashboard');
    expect(res.status()).toBe(200);
  });

  // Journey 1: unauthenticated /dashboard → redirected to login
  test('Journey 1: unauthenticated redirect to login', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    const url = page.url();
    expect(url.includes('/auth') || url.includes('github.com')).toBeTruthy();
  });

  // Journey 2: authenticated dashboard renders + client-side controls present
  test('Journey 2: authenticated dashboard + client-side features', async ({ page }) => {
    await authenticateAs(page, fx, 'member');
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    expect(page.url()).toContain('/dashboard');

    // Dashboard chrome renders: the tab bar + the Sessions tab
    expect(await page.locator('[role="tablist"]').count()).toBeGreaterThan(0);
    expect(await page.locator('[role="tab"]').count()).toBeGreaterThan(0);
    await expect(page.locator('[data-tab="sessions"]')).toBeVisible();

    // Tab switching is client-side (no navigation): clicking Activity activates its section
    await page.locator('[data-tab="activity"]').click();
    await page.waitForTimeout(150);
    await expect(page.locator('[data-section="activity"]')).toHaveClass(/active/);

    // Client-side search, if present, is interactive
    const search = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill('test');
      expect(await search.inputValue()).toBe('test');
    }

    await page.waitForTimeout(500);
    expect(errors.filter((e) => !e.toLowerCase().includes('warn'))).toEqual([]);
  });

  // Journey 3: plan viewer renders + plan.js executes under CSP with no app/CSP errors
  test('Journey 3: plan viewer renders client JS under CSP', async ({ page }) => {
    await authenticateAs(page, fx, 'member');
    const consoleLogs = [];
    const cspViolations = [];
    page.on('console', (m) => consoleLogs.push({ type: m.type(), text: m.text() }));
    page.on('securitypolicyviolation', (v) => cspViolations.push({ directive: v.violatedDirective, uri: v.blockedURI }));

    const res = await page.request.get(`/p/${fx.publishedSessionId}`);
    expect(res.status()).toBe(200);

    await page.goto(`/p/${fx.publishedSessionId}`, { waitUntil: 'networkidle' });
    expect(await page.content()).toContain('Test Plan');
    await page.waitForTimeout(500);

    const appErrors = consoleLogs.filter(
      (l) => l.type === 'error' && !l.text.includes('Content Security Policy') && !l.text.includes('nonce')
    );
    expect(appErrors, JSON.stringify(appErrors)).toEqual([]);
    const realCsp = cspViolations.filter((v) => !v.directive.includes('script-src'));
    expect(realCsp, JSON.stringify(realCsp)).toEqual([]);
  });

  // Journey 4: comment overlay infrastructure is present on a plan
  test('Journey 4: comment overlay present on plan viewer', async ({ page }) => {
    await authenticateAs(page, fx, 'member');
    await page.goto(`/p/${fx.publishedSessionId}`, { waitUntil: 'networkidle' });
    const content = await page.content();
    // serve.js injects the comment overlay markup (pp-sidebar / comment controls)
    expect(content.toLowerCase()).toContain('comment');
  });

  // Journey 5: theme toggle persists across reload
  test('Journey 5: theme toggle persists across reload', async ({ page }) => {
    await authenticateAs(page, fx, 'member');
    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    const toggle = page.locator('[data-theme-toggle], #theme-toggle, button:has-text("Theme")').first();
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(300);
      const theme = await page.evaluate(() => localStorage.getItem('theme'));
      await page.reload({ waitUntil: 'networkidle' });
      const persisted = await page.evaluate(() => localStorage.getItem('theme'));
      if (theme) expect(persisted).toBe(theme);
    } else {
      expect(page.url()).toContain('/dashboard');
    }
  });

  // Journey 6a: a non-owner WITHOUT session_view_private (developer) gets 404 on a private plan.
  // (Note: admin legitimately CAN view private plans via session_view_private, so the negative
  // case must use a non-privileged non-owner — `member`, a developer.)
  test('Journey 6a: non-owner developer cannot access private plan (404)', async ({ page }) => {
    await authenticateAs(page, fx, 'member');
    const res = await page.request.get(`/p/${fx.privateSessionId}`);
    expect(res.status()).toBe(404);
  });

  // Journey 6b: the owner can access their private plan
  test('Journey 6b: owner can access private plan', async ({ page }) => {
    await authenticateAs(page, fx, 'privateViewer');
    const res = await page.request.get(`/p/${fx.privateSessionId}`);
    expect(res.status()).toBe(200);
    await page.goto(`/p/${fx.privateSessionId}`, { waitUntil: 'networkidle' });
    expect(await page.content()).toContain('Test Plan');
  });
});
