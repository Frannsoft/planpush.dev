// Slack notification helper — fire and forget
// Three events: comment_added, plan_updated, comment_resolved

export async function notifySlack({ event, sessionId, sessionTitle, author, content, anchor, commentId, planUrl }) {
  const webhookUrl = (process.env.SLACK_WEBHOOK_URL || '').trim();
  if (!webhookUrl) return; // Slack not configured — skip silently

  let text;
  let blocks;

  switch (event) {
    case 'comment_added':
      text = `${author} commented on "${sessionTitle}"`;
      blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${author}* commented on *<${planUrl}|${sessionTitle}>*${anchor ? ` (on \`${anchor}\`)` : ''}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `> ${truncate(content, 200)}`,
          },
        },
      ];
      break;

    case 'plan_updated':
      text = `${author} updated "${sessionTitle}"`;
      blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${author}* updated the plan *<${planUrl}|${sessionTitle}>*`,
          },
        },
      ];
      break;

    case 'comment_resolved':
      text = `${author} resolved a comment on "${sessionTitle}"`;
      blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${author}* resolved a comment on *<${planUrl}|${sessionTitle}>*${anchor ? ` (\`${anchor}\`)` : ''}`,
          },
        },
      ];
      break;

    default:
      return;
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, blocks }),
    });
  } catch (err) {
    console.error('Slack notification failed:', err.message);
  }
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}
