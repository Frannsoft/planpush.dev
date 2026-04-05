import * as cheerio from 'cheerio';

const REMOVE_ELEMENTS = ['script', 'iframe', 'object', 'embed', 'applet', 'base', 'noscript', 'form', 'style'];
const SAFE_LINK_RELS = new Set(['stylesheet', 'preload', 'icon', 'shortcut icon', 'apple-touch-icon', 'preconnect', 'dns-prefetch']);
const DANGEROUS_URI_ATTRS = new Set(['href', 'src', 'action', 'formaction']);
const DANGEROUS_URI_SCHEMES = /^\s*(javascript|vbscript|data\s*:)/i;

export async function sanitizeHtml(html) {
  const $ = cheerio.load(html);

  // Remove dangerous elements entirely
  REMOVE_ELEMENTS.forEach(tag => $(tag).remove());

  // Remove meta http-equiv and referrer policy
  $('meta[http-equiv]').remove();
  $('meta[name="referrer"]').remove();

  // Filter link elements — only safe rels allowed
  $('link').each((_, el) => {
    const rel = ($(el).attr('rel') || '').toLowerCase().trim();
    if (!SAFE_LINK_RELS.has(rel)) {
      $(el).remove();
      return;
    }
    const href = $(el).attr('href') || '';
    if (DANGEROUS_URI_SCHEMES.test(href)) $(el).removeAttr('href');
  });

  // Strip event handlers and dangerous URIs from all elements
  $('*').each((_, el) => {
    const attribs = el.attribs || {};
    for (const [name, value] of Object.entries(attribs)) {
      // Remove all on* event handlers
      if (/^on\w/i.test(name)) {
        $(el).removeAttr(name);
        continue;
      }
      // Remove srcdoc (can contain arbitrary HTML)
      if (name === 'srcdoc') {
        $(el).removeAttr(name);
        continue;
      }
      // Remove ping (causes browser to POST to attacker-controlled URLs on click)
      if (name === 'ping') {
        $(el).removeAttr(name);
        continue;
      }
      // Remove inline styles (prevents CSS injection via url(), position:fixed overlays, etc.)
      if (name === 'style') {
        $(el).removeAttr(name);
        continue;
      }
      // Sanitize dangerous URI schemes in href/src/action/formaction
      if (DANGEROUS_URI_ATTRS.has(name) && DANGEROUS_URI_SCHEMES.test(value)) {
        $(el).attr(name, '#');
      }
    }
  });

  return $.html();
}
