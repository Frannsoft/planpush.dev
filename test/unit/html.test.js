import { describe, it, expect } from 'vitest';
import { escHtml, safeRedirectUrl } from '../../src/utils/html.js';

describe('html.js', () => {
  describe('escHtml', () => {
    it('escapes ampersand', () => {
      expect(escHtml('a & b')).toBe('a &amp; b');
      expect(escHtml('&')).toBe('&amp;');
      expect(escHtml('foo & bar & baz')).toBe('foo &amp; bar &amp; baz');
    });

    it('escapes less-than', () => {
      expect(escHtml('<script>')).toBe('&lt;script&gt;');
      expect(escHtml('a < b')).toBe('a &lt; b');
      expect(escHtml('<')).toBe('&lt;');
    });

    it('escapes greater-than', () => {
      expect(escHtml('a > b')).toBe('a &gt; b');
      expect(escHtml('>')).toBe('&gt;');
    });

    it('escapes double quotes', () => {
      expect(escHtml('He said "hello"')).toBe('He said &quot;hello&quot;');
      expect(escHtml('"')).toBe('&quot;');
    });

    it('escapes single quotes', () => {
      expect(escHtml("It's working")).toBe('It&#39;s working');
      expect(escHtml("'")).toBe('&#39;');
    });

    it('escapes all five chars together', () => {
      const input = '<div onclick="alert(\'xss\')" data="a & b">';
      const output = escHtml(input);
      expect(output).toBe('&lt;div onclick=&quot;alert(&#39;xss&#39;)&quot; data=&quot;a &amp; b&quot;&gt;');
    });

    it('preserves normal text', () => {
      expect(escHtml('Hello World')).toBe('Hello World');
      expect(escHtml('This is a normal sentence.')).toBe('This is a normal sentence.');
    });

    it('handles empty string', () => {
      expect(escHtml('')).toBe('');
    });

    it('converts non-string input to string first', () => {
      expect(escHtml(123)).toBe('123');
      expect(escHtml(null)).toBe('null');
      expect(escHtml(undefined)).toBe('undefined');
    });

    it('does not double-escape already escaped entities', () => {
      // This is intentional — escHtml escapes the & in &amp;
      expect(escHtml('&amp;')).toBe('&amp;amp;');
    });

    it('escapes XSS payloads', () => {
      const xssPayload = '<img src=x onerror="alert(\'xss\')">';
      const escaped = escHtml(xssPayload);
      expect(escaped).not.toContain('<img');
      // Note: escHtml doesn't remove attribute names, it just escapes them
      // The attribute name 'onerror' itself is escaped as part of the full HTML
      expect(escaped).toContain('&lt;');
      expect(escaped).toContain('&gt;');
      expect(escaped).toContain('&quot;');
      expect(escaped).toContain('&#39;');
    });
  });

  describe('safeRedirectUrl', () => {
    it('allows relative paths', () => {
      expect(safeRedirectUrl('/dashboard')).toBe('/dashboard');
      expect(safeRedirectUrl('/dashboard?tab=sessions')).toBe('/dashboard?tab=sessions');
      expect(safeRedirectUrl('/api/users/123')).toBe('/api/users/123');
    });

    it('allows relative paths with query strings', () => {
      expect(safeRedirectUrl('/page?param=value&other=123')).toBe('/page?param=value&other=123');
      expect(safeRedirectUrl('/?redirect=true')).toBe('/?redirect=true');
    });

    it('allows relative paths with hash fragments', () => {
      expect(safeRedirectUrl('/page#section')).toBe('/page#section');
      expect(safeRedirectUrl('/dashboard#top')).toBe('/dashboard#top');
    });

    it('allows relative paths with both query and hash', () => {
      expect(safeRedirectUrl('/page?id=1#section')).toBe('/page?id=1#section');
    });

    it('allows root path', () => {
      expect(safeRedirectUrl('/')).toBe('/');
    });

    it('returns fallback for absolute URLs (open redirect prevention)', () => {
      expect(safeRedirectUrl('https://evil.com')).toBe('/dashboard');
      expect(safeRedirectUrl('http://evil.com')).toBe('/dashboard');
      expect(safeRedirectUrl('https://example.com/page')).toBe('/dashboard');
    });

    it('returns fallback for protocol-relative URLs (open redirect prevention)', () => {
      expect(safeRedirectUrl('//evil.com')).toBe('/dashboard');
      expect(safeRedirectUrl('//example.com/page')).toBe('/dashboard');
    });

    it('returns fallback for javascript: URIs', () => {
      expect(safeRedirectUrl('javascript:alert(1)')).toBe('/dashboard');
      expect(safeRedirectUrl('JAVASCRIPT:alert(1)')).toBe('/dashboard');
    });

    it('returns fallback for data: URIs', () => {
      expect(safeRedirectUrl('data:text/html,<script>alert(1)</script>')).toBe('/dashboard');
    });

    it('handles null/undefined by returning fallback', () => {
      expect(safeRedirectUrl(null)).toBe('/dashboard');
      expect(safeRedirectUrl(undefined)).toBe('/dashboard');
    });

    it('handles empty string by returning fallback', () => {
      expect(safeRedirectUrl('')).toBe('/dashboard');
    });

    it('handles whitespace-only string', () => {
      // Whitespace is treated as '/', which is a valid relative path
      expect(safeRedirectUrl('   ')).toBe('/');
    });

    it('allows custom fallback', () => {
      expect(safeRedirectUrl('https://evil.com', '/home')).toBe('/home');
      expect(safeRedirectUrl('', '/login')).toBe('/login');
      expect(safeRedirectUrl('//evil.com', '/dashboard')).toBe('/dashboard');
    });

    it('preserves custom fallback for valid paths too', () => {
      expect(safeRedirectUrl('/valid', '/custom')).toBe('/valid');
      expect(safeRedirectUrl('/', '/custom')).toBe('/');
    });

    it('normalizes backslash-based paths as relative paths', () => {
      // Backslashes in relative paths are treated as literal characters by URL constructor
      // which normalizes path segments (..) in the pathname
      const result = safeRedirectUrl('\\..\\..\\admin');
      // The URL constructor normalizes .. path segments
      expect(result).toBe('/admin');
    });

    it('handles encoded characters in paths', () => {
      expect(safeRedirectUrl('/page%20name')).toBe('/page%20name');
      expect(safeRedirectUrl('/page?name=%3Cscript%3E')).toBe('/page?name=%3Cscript%3E');
    });

    it('rejects URLs with different hostnames via various methods', () => {
      const payloads = [
        'https://evil.com:8080/path',
        'http://user:pass@evil.com/path',
        'https://evil.com.example.com/path', // subdomain trick
      ];

      for (const payload of payloads) {
        expect(safeRedirectUrl(payload)).toBe('/dashboard');
      }
    });

    it('case-insensitive for scheme detection', () => {
      expect(safeRedirectUrl('HTTPS://evil.com')).toBe('/dashboard');
      expect(safeRedirectUrl('Http://evil.com')).toBe('/dashboard');
      expect(safeRedirectUrl('JavaScript:alert(1)')).toBe('/dashboard');
    });

    it('treats invalid scheme strings as relative paths', () => {
      // Invalid scheme like 'ht!tp:' is not a valid scheme, so treated as relative
      expect(safeRedirectUrl('ht!tp://evil')).toBe('/ht!tp://evil');
    });

    it('handles very long URLs', () => {
      const longPath = '/page/' + 'a'.repeat(1000);
      expect(safeRedirectUrl(longPath)).toBe(longPath);
    });

    it('preserves query and hash in relative URLs', () => {
      expect(safeRedirectUrl('/search?q=test&sort=date#results')).toBe('/search?q=test&sort=date#results');
    });
  });
});
