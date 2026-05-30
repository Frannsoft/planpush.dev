import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../../src/utils/sanitize.js';

describe('sanitize.js', () => {
  describe('sanitizeHtml', () => {
    it('removes script tags entirely', async () => {
      const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('<script>');
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('removes iframe elements', async () => {
      const html = '<p>Safe</p><iframe src="https://evil.com"></iframe>';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('<iframe>');
      expect(result).not.toContain('evil.com');
      expect(result).toContain('Safe');
    });

    it('removes form elements', async () => {
      const html = '<form action="/steal"><input type="text" /></form><p>Text</p>';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('<form');
      expect(result).not.toContain('<input');
      expect(result).toContain('Text');
    });

    it('removes style tags', async () => {
      const html = '<p>Content</p><style>body { display: none; }</style>';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('<style>');
      expect(result).toContain('Content');
    });

    it('removes object, embed, applet, base, noscript tags', async () => {
      const html = `
        <object data="evil.swf"></object>
        <embed src="evil.swf" />
        <applet code="Evil.class"></applet>
        <base href="https://evil.com" />
        <noscript>Fallback</noscript>
        <p>Safe</p>
      `;
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('<object');
      expect(result).not.toContain('<embed');
      expect(result).not.toContain('<applet');
      expect(result).not.toContain('<base');
      expect(result).not.toContain('<noscript');
      expect(result).toContain('Safe');
    });

    it('removes on* event handlers', async () => {
      const html = `
        <div onclick="alert('xss')">Click</div>
        <img onerror="alert('xss')" src="test.jpg" />
        <button onmouseover="alert('xss')">Hover</button>
      `;
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('onmouseover');
      expect(result).toContain('Click');
      expect(result).toContain('test.jpg');
    });

    it('removes srcdoc attribute (contains arbitrary HTML)', async () => {
      const html = '<iframe srcdoc="<script>alert(1)</script>"></iframe>';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('srcdoc');
    });

    it('removes ping attribute (CSRF vector)', async () => {
      const html = '<a href="/safe" ping="https://attacker.com/steal">Link</a>';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('ping');
      expect(result).toContain('/safe');
    });

    it('removes inline style attributes', async () => {
      const html = `
        <div style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;">Overlay</div>
        <p style="color: red;">Text</p>
      `;
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('style=');
      expect(result).toContain('Overlay');
      expect(result).toContain('Text');
    });

    it('neutralizes javascript: URI scheme in href', async () => {
      const html = '<a href="javascript:alert(\'xss\')">Click</a>';
      const result = await sanitizeHtml(html);
      expect(result).toContain('href=');
      // Should be replaced with '#' or empty
      expect(result).not.toContain('javascript:');
      expect(result).toContain('Click');
    });

    it('neutralizes javascript: URI scheme in src', async () => {
      const html = '<img src="javascript:alert(\'xss\')" />';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('javascript:');
    });

    it('neutralizes vbscript: URI scheme', async () => {
      const html = '<a href="vbscript:msgbox(\'xss\')">Click</a>';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('vbscript:');
    });

    it('neutralizes data: URI scheme', async () => {
      const html = '<img src="data:text/html,<script>alert(\'xss\')</script>" />';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('data:');
    });

    it('case-insensitive: neutralizes JAVASCRIPT:', async () => {
      const html = '<a href="JAVASCRIPT:alert(\'xss\')">Click</a>';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('JAVASCRIPT:');
    });

    it('case-insensitive: neutralizes Javascript: with whitespace', async () => {
      const html = '<a href="  javascript:alert(\'xss\')">Click</a>';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('javascript:');
    });

    it('preserves safe link rel=stylesheet', async () => {
      const html = '<link rel="stylesheet" href="https://cdn.example.com/style.css">';
      const result = await sanitizeHtml(html);
      expect(result).toContain('<link');
      expect(result).toContain('rel');
      expect(result).toContain('stylesheet');
      expect(result).toContain('https://cdn.example.com/style.css');
    });

    it('preserves other safe link rels', async () => {
      const html = `
        <link rel="preload" href="font.woff2" as="font">
        <link rel="icon" href="favicon.ico">
        <link rel="preconnect" href="https://cdn.example.com">
      `;
      const result = await sanitizeHtml(html);
      expect(result).toContain('rel');
      expect(result).toContain('preload');
      expect(result).toContain('icon');
      expect(result).toContain('preconnect');
    });

    it('removes unsafe link rels', async () => {
      const html = '<link rel="import" href="evil.html">';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('rel="import"');
    });

    it('removes meta http-equiv (can redirect or set headers)', async () => {
      const html = '<meta http-equiv="refresh" content="0; url=https://evil.com">';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('http-equiv');
    });

    it('removes meta referrer policy', async () => {
      const html = '<meta name="referrer" content="no-referrer">';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('name="referrer"');
    });

    it('preserves normal meta tags', async () => {
      const html = '<meta name="description" content="My plan">';
      const result = await sanitizeHtml(html);
      expect(result).toContain('<meta');
      expect(result).toContain('description');
    });

    it('neutralizes dangerous URI in link href', async () => {
      const html = '<link rel="stylesheet" href="javascript:alert(\'xss\')">';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('javascript:');
    });

    it('preserves safe attributes on elements', async () => {
      const html = '<div id="test" class="container" data-value="123">Content</div>';
      const result = await sanitizeHtml(html);
      expect(result).toContain('id');
      expect(result).toContain('class');
      expect(result).toContain('data-value');
      expect(result).toContain('Content');
    });

    it('preserves valid links', async () => {
      const html = '<a href="/safe/path" target="_blank">Safe Link</a>';
      const result = await sanitizeHtml(html);
      expect(result).toContain('/safe/path');
      expect(result).toContain('Safe Link');
    });

    it('handles empty HTML', async () => {
      // cheerio.load('') and $.html() wraps it in html/head/body tags
      const result = await sanitizeHtml('');
      expect(result).toContain('<html');
      expect(result).toContain('<body');
    });

    it('handles nested dangerous elements', async () => {
      const html = '<div><script><div>nested</div></script></div>';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('<script');
    });

    it('preserves semantic HTML', async () => {
      const html = `
        <h1>Title</h1>
        <p>Paragraph with <strong>bold</strong> and <em>italic</em>.</p>
        <ul><li>Item 1</li><li>Item 2</li></ul>
      `;
      const result = await sanitizeHtml(html);
      expect(result).toContain('<h1');
      expect(result).toContain('<p');
      expect(result).toContain('<strong');
      expect(result).toContain('<em');
      expect(result).toContain('<ul');
      expect(result).toContain('<li');
    });

    it('neutralizes formaction with dangerous URIs (can redirect form to evil endpoint)', async () => {
      const html = '<button formaction="javascript:alert(1)">Click</button>';
      const result = await sanitizeHtml(html);
      // formaction with javascript: should be neutralized to '#'
      expect(result).toContain('formaction="#"');
    });

    it('preserves formaction with safe URLs', async () => {
      const html = '<button formaction="/safe/endpoint">Click</button>';
      const result = await sanitizeHtml(html);
      // Safe URLs in formaction are preserved
      expect(result).toContain('formaction="/safe/endpoint"');
    });

    it('removes action attribute from elements', async () => {
      const html = '<form action="https://evil.com"><input type="text" /></form>';
      const result = await sanitizeHtml(html);
      expect(result).not.toContain('action');
      expect(result).not.toContain('<form');
    });
  });
});
