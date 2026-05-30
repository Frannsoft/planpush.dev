import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { notifySlack } from '../../src/utils/slack.js';

describe('slack.js', () => {
  const originalEnv = process.env.SLACK_WEBHOOK_URL;

  afterEach(() => {
    process.env.SLACK_WEBHOOK_URL = originalEnv;
    vi.clearAllMocks();
  });

  describe('notifySlack webhook URL validation', () => {
    it('skips notification when SLACK_WEBHOOK_URL is not set', async () => {
      delete process.env.SLACK_WEBHOOK_URL;
      global.fetch = vi.fn();

      await notifySlack({
        event: 'comment_added',
        sessionId: 'test',
        sessionTitle: 'My Plan',
        author: 'John',
        content: 'Great idea',
        planUrl: 'https://example.com/p/test',
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('skips notification when SLACK_WEBHOOK_URL is empty string', async () => {
      process.env.SLACK_WEBHOOK_URL = '';
      global.fetch = vi.fn();

      await notifySlack({
        event: 'comment_added',
        sessionId: 'test',
        sessionTitle: 'My Plan',
        author: 'John',
        content: 'Great idea',
        planUrl: 'https://example.com/p/test',
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('skips notification when SLACK_WEBHOOK_URL is whitespace only', async () => {
      process.env.SLACK_WEBHOOK_URL = '   ';
      global.fetch = vi.fn();

      await notifySlack({
        event: 'comment_added',
        sessionId: 'test',
        sessionTitle: 'My Plan',
        author: 'John',
        content: 'Great idea',
        planUrl: 'https://example.com/p/test',
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects webhook URLs not from hooks.slack.com (SSRF prevention)', async () => {
      global.fetch = vi.fn();

      // Try various non-Slack URLs
      const badUrls = [
        'https://example.com/webhook',
        'https://attacker.com/webhook',
        'https://hooks.evil.com/webhook',
        'http://hooks.slack.com/services/...', // http not https
        'https://hooks.slack.co/services/...', // wrong domain
      ];

      for (const url of badUrls) {
        process.env.SLACK_WEBHOOK_URL = url;

        await notifySlack({
          event: 'comment_added',
          sessionId: 'test',
          sessionTitle: 'My Plan',
          author: 'John',
          content: 'Great idea',
          planUrl: 'https://example.com/p/test',
        });

        expect(global.fetch).not.toHaveBeenCalled();
      }
    });

    it('accepts webhook URLs from hooks.slack.com (HTTPS)', async () => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX';
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      await notifySlack({
        event: 'comment_added',
        sessionId: 'test',
        sessionTitle: 'My Plan',
        author: 'John',
        content: 'Great idea',
        planUrl: 'https://example.com/p/test',
      });

      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('mrkdwn escaping (prevents injection)', () => {
    beforeEach(() => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX';
      global.fetch = vi.fn().mockResolvedValue({ ok: true });
    });

    it('escapes & in author, title, and content', async () => {
      await notifySlack({
        event: 'comment_added',
        sessionId: 'test',
        sessionTitle: 'Plans & Designs',
        author: 'John & Jane',
        content: 'Cookies & Cream',
        anchor: 'Section & Details',
        planUrl: 'https://example.com/p/test',
      });

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      const markdown = body.blocks[0].text.text + body.blocks[1].text.text;

      expect(markdown).toContain('&amp;');
      expect(markdown).not.toContain('& '); // raw ampersand in mrkdwn context
    });

    it('escapes < in fields', async () => {
      await notifySlack({
        event: 'comment_added',
        sessionId: 'test',
        sessionTitle: '<script>alert(1)</script>',
        author: '<img>',
        content: '<iframe>',
        planUrl: 'https://example.com/p/test',
      });

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      const markdown = body.blocks[0].text.text + body.blocks[1].text.text;

      expect(markdown).toContain('&lt;');
      expect(markdown).not.toContain('<script>');
      expect(markdown).not.toContain('<img>');
      expect(markdown).not.toContain('<iframe>');
    });

    it('escapes > in fields', async () => {
      await notifySlack({
        event: 'comment_added',
        sessionId: 'test',
        sessionTitle: 'Plan>Idea>Details',
        author: 'User>Admin',
        content: 'Step>Result',
        planUrl: 'https://example.com/p/test',
      });

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      const markdown = body.blocks[0].text.text + body.blocks[1].text.text;

      expect(markdown).toContain('&gt;');
    });

    it('escapes all three chars together in mrkdwn injection attempt', async () => {
      await notifySlack({
        event: 'comment_added',
        sessionId: 'test',
        sessionTitle: 'Innocent Title',
        author: 'User & Admin<img src=x onerror=alert(1)>Details',
        content: 'Normal content',
        planUrl: 'https://example.com/p/test',
      });

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      const markdown = body.blocks[0].text.text;

      expect(markdown).toContain('&amp;');
      expect(markdown).toContain('&lt;');
      // The escSlack function escapes &, <, > — so onerror= stays as is,
      // but the < and > around it are escaped
      expect(markdown).toContain('&gt;');
    });
  });

  describe('event handling', () => {
    beforeEach(() => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX';
      global.fetch = vi.fn().mockResolvedValue({ ok: true });
    });

    it('handles comment_added event', async () => {
      await notifySlack({
        event: 'comment_added',
        sessionId: 'test',
        sessionTitle: 'My Plan',
        author: 'John',
        content: 'This is a great idea',
        anchor: 'Section Header',
        planUrl: 'https://example.com/p/test',
      });

      const callArgs = global.fetch.mock.calls[0];
      expect(callArgs[1].method).toBe('POST');

      const body = JSON.parse(callArgs[1].body);
      expect(body.text).toContain('commented on');
      expect(body.blocks.length).toBeGreaterThan(0);
    });

    it('handles plan_updated event', async () => {
      await notifySlack({
        event: 'plan_updated',
        sessionId: 'test',
        sessionTitle: 'My Plan',
        author: 'Jane',
        content: 'ignored',
        planUrl: 'https://example.com/p/test',
      });

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.text).toContain('updated');
    });

    it('handles comment_resolved event', async () => {
      await notifySlack({
        event: 'comment_resolved',
        sessionId: 'test',
        sessionTitle: 'My Plan',
        author: 'Bob',
        content: 'ignored',
        anchor: 'Section',
        planUrl: 'https://example.com/p/test',
      });

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.text).toContain('resolved');
    });

    it('ignores unknown event types', async () => {
      global.fetch = vi.fn();

      await notifySlack({
        event: 'unknown_event',
        sessionId: 'test',
        sessionTitle: 'My Plan',
        author: 'John',
        content: 'Test',
        planUrl: 'https://example.com/p/test',
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('content truncation', () => {
    beforeEach(() => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX';
      global.fetch = vi.fn().mockResolvedValue({ ok: true });
    });

    it('truncates long content to 200 chars + ...', async () => {
      const longContent = 'a'.repeat(300);

      await notifySlack({
        event: 'comment_added',
        sessionId: 'test',
        sessionTitle: 'My Plan',
        author: 'John',
        content: longContent,
        planUrl: 'https://example.com/p/test',
      });

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      const contentBlock = body.blocks[1];

      expect(contentBlock.text.text).toContain('a'.repeat(200));
      expect(contentBlock.text.text).toContain('...');
      expect(contentBlock.text.text.length).toBeLessThan(longContent.length);
    });

    it('does not truncate content under 200 chars', async () => {
      const shortContent = 'This is a short comment';

      await notifySlack({
        event: 'comment_added',
        sessionId: 'test',
        sessionTitle: 'My Plan',
        author: 'John',
        content: shortContent,
        planUrl: 'https://example.com/p/test',
      });

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      const contentBlock = body.blocks[1];

      expect(contentBlock.text.text).toContain(shortContent);
      expect(contentBlock.text.text).not.toContain('...');
    });
  });

  describe('anchor formatting', () => {
    beforeEach(() => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX';
      global.fetch = vi.fn().mockResolvedValue({ ok: true });
    });

    it('includes anchor in comment_added when provided', async () => {
      await notifySlack({
        event: 'comment_added',
        sessionId: 'test',
        sessionTitle: 'My Plan',
        author: 'John',
        content: 'Comment',
        anchor: 'Section Title',
        planUrl: 'https://example.com/p/test',
      });

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      const markdown = body.blocks[0].text.text;

      expect(markdown).toContain('Section Title');
      expect(markdown).toContain('`'); // should be in backticks
    });

    it('omits anchor formatting when not provided', async () => {
      await notifySlack({
        event: 'comment_added',
        sessionId: 'test',
        sessionTitle: 'My Plan',
        author: 'John',
        content: 'Comment',
        planUrl: 'https://example.com/p/test',
      });

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      const markdown = body.blocks[0].text.text;

      expect(markdown).not.toContain('(on ');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX';
    });

    it('catches and logs fetch errors without throwing', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Should not throw
      await expect(
        notifySlack({
          event: 'comment_added',
          sessionId: 'test',
          sessionTitle: 'My Plan',
          author: 'John',
          content: 'Comment',
          planUrl: 'https://example.com/p/test',
        })
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('calls fetch with an AbortSignal for timeout enforcement', async () => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX';
      let abortSignalUsed = false;
      global.fetch = vi.fn().mockImplementation((url, opts) => {
        abortSignalUsed = opts.signal instanceof AbortSignal;
        return Promise.resolve({ ok: true });
      });

      await notifySlack({
        event: 'comment_added',
        sessionId: 'test',
        sessionTitle: 'My Plan',
        author: 'John',
        content: 'Comment',
        planUrl: 'https://example.com/p/test',
      });

      // fetch was called with an AbortSignal
      expect(global.fetch).toHaveBeenCalled();
      expect(abortSignalUsed).toBe(true);
      const callArgs = global.fetch.mock.calls[0][1];
      expect(callArgs).toHaveProperty('signal');
      expect(callArgs.signal).toBeInstanceOf(AbortSignal);
    });
  });
});
