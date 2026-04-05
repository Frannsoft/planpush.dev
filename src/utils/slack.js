// Slack notification helper — fire and forget
// Three events: comment_added, plan_updated, comment_resolved

export async function notifySlack({ event, sessionId, sessionTitle, author, content, anchor, planUrl }) {
  const webhookUrl = (process.env.SLACK_WEBHOOK_URL || '').trim();
  if (!webhookUrl) return; // Slack not configured — skip silently
  if (!webhookUrl.startsWith('https://hooks.slack.com/')) return; // Prevent SSRF via misconfigured URL

  let text;
  let blocks;

  const safeAuthor = escSlack(author);
  const safeTitle = escSlack(sessionTitle);
  const safeAnchor = escSlack(anchor);
  const safeContent = escSlack(truncate(content, 200));

  switch (event) {
    case 'comment_added':
      text = `${safeAuthor} commented on "${safeTitle}"`;
      blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${safeAuthor}* commented on *<${planUrl}|${safeTitle}>*${safeAnchor ? ` (on \`${safeAnchor}\`)` : ''}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `> ${safeContent}`,
          },
        },
      ];
      break;

    case 'plan_updated':
      text = `${safeAuthor} updated "${safeTitle}"`;
      blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${safeAuthor}* updated the plan *<${planUrl}|${safeTitle}>*`,
          },
        },
      ];
      break;

    case 'comment_resolved':
      text = `${safeAuthor} resolved a comment on "${safeTitle}"`;
      blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${safeAuthor}* resolved a comment on *<${planUrl}|${safeTitle}>*${safeAnchor ? ` (\`${safeAnchor}\`)` : ''}`,
          },
        },
      ];
      break;

    default:
      return;
  }

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10000);
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, blocks }),
      signal: ac.signal,
    }).finally(() => clearTimeout(timer));
  } catch (err) {
    console.error('Slack notification failed:', err.message);
  }
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

// Escape user-supplied strings for Slack mrkdwn
function escSlack(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
