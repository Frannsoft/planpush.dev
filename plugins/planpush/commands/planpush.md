---
description: Generates or updates a visual HTML design doc from the current planning session and pushes it to PlanPush for your team to view, comment on, and get notified about.
---

# PlanPush

$ARGUMENTS

Push a visual design doc from this planning session to PlanPush.

**Prerequisites:** Run `/planpush-auth` once before using this command. Best run mid- or end-of a planning or design conversation.

---

## 1. Check authentication

Run:

  cat ~/.planpush/credentials 2>/dev/null

If the file does not exist or is empty, print:

  ✗ Not authenticated. Run /planpush-auth first to connect this machine to PlanPush.

Then stop.

Parse the credentials JSON:
- `server_url`
- `refresh_token`
- `user`
- `org`

If `server_url` is missing, print:

  ✗ No server configured. Run /planpush-auth to set up your PlanPush server.

Then stop.

Use `{server_url}` for all API calls below.

---

## 2. Exchange refresh token for access token

Run:

  curl -s -X POST {server_url}/api/auth/token \
    -H "Content-Type: application/json" \
    -d '{"refresh_token": "{refresh_token}"}'

Expected response: `{"access_token": "...", "expires_in": 300}`

If the response contains `{"error": "invalid_token"}` or any auth error, print:

  ✗ Session expired. Run /planpush-auth again to re-authenticate.

Then stop.

Store the `access_token` for use in step 6.

---

## 3. Resolve the session name

Run:

  echo $CLAUDE_SESSION_NAME

If non-empty, sanitize for use as a filename:
- Lowercase
- Replace spaces and special characters with hyphens
- Trim leading/trailing hyphens

Use the result as `{session-name}`.

If empty, run:

  echo $CLAUDE_SESSION_ID

Use the result as `{session-name}`.

The local output file will be: `.claude/pushsync_plans/pushsync_plan_{session-name}.html`

---

## 4. Check for existing server session

Run:

  cat .claude/plan-session-$CLAUDE_SESSION_ID 2>/dev/null

If the file exists and contains a non-empty string, store it as `{existing_session_id}`.
This is a subsequent push — the server will overwrite the existing session.

If the file does not exist or is empty, this is a first push — the server will create a new session.

---

## 5. Ensure output directory exists and update .gitignore

Run:

  mkdir -p .claude/pushsync_plans

Check the project root `.gitignore`. If either of these lines is missing, add them:

  .claude/pushsync_plans/
  .claude/plan-session-*

---

## 6. Determine context and generate HTML

Scan the conversation history for the most recent message that contains a prior `/p/` URL from the server — this marks the last push.

**First push** (no prior URL found):
- Read the full conversation
- Generate `.claude/pushsync_plans/pushsync_plan_{session-name}.html` from scratch

**Subsequent push** (prior URL found):
- Read the current `.claude/pushsync_plans/pushsync_plan_{session-name}.html`
- Read only messages after the last push marker
- Identify what has changed: new components, updated flows, new entities, new UI, resolved questions, new decisions
- Update only the changed sections — do not regenerate what has not changed

Write `.claude/pushsync_plans/pushsync_plan_{session-name}.html` as a plain HTML file with **no inline `<style>` or `<script>` tags**. The server injects `plan.css` (styling) and `plan.js` (tab switching, anchor scrolling) automatically with CSP nonces.

**HTML structure:**
- Standard `<!DOCTYPE html>` with `<meta charset>` and `<meta viewport>`
- Body wrapped in `<div class="plan-wrapper">`
- Header: `<div class="plan-header">` with `<h1>` title and `<div class="plan-meta">` for metadata/badges
- Tabs: `<div class="plan-tabs">` containing `<button class="plan-tab" data-tab="...">` elements — first tab gets class `active`
- Panes: `<div class="plan-pane" data-pane="...">` for each tab — first pane gets class `active`
- Use tabs to organize sections when the plan is complex enough to warrant it

**CSS class reference** (provided by the server's `plan.css`):
- Layout: `plan-wrapper`, `plan-header`, `plan-meta`, `plan-tabs`, `plan-tab`, `plan-pane`, `plan-section`, `plan-divider`
- Cards: `plan-card` (general), `plan-component` (architecture boxes), `plan-entity` (data models), `plan-flow` (sequence flows), `plan-decision` (decision entries), `plan-tier` (pricing tiers), `plan-mockup` (UI mockups), `plan-integration` (integration blocks)
- Grid: `plan-grid plan-grid-2` (2-col), `plan-grid-3` (3-col), `plan-columns`
- Tables: `plan-table` with standard `<thead>/<tbody>/<tr>/<th>/<td>`
- Entity fields: `plan-entity-header`, `plan-entity-body`, `plan-entity-field` with `field-name`, `field-type`, `field-pk`, `field-fk` spans
- Flow steps: `plan-flow-steps`, `plan-flow-step`, `plan-flow-num`, `plan-flow-content`
- Horizontal flow: `plan-flow-horizontal`, `plan-flow-box`, `plan-flow-arrow`
- Decisions: `plan-decision` with `decision-status decided` or `decision-status open` spans
- Badges: `plan-badge`, `plan-badge-accent`, `plan-badge-success`, `plan-badge-warning`, `plan-badge-danger`
- Notes: `plan-note plan-note-info` (or `-warning`, `-success`, `-danger`)
- Code: `plan-code` for blocks, `<code>` for inline
- Lists: `plan-list`, `plan-checklist` (with `.checked` on items)
- Mockups: `plan-mockup`, `plan-mockup-bar`, `plan-mockup-dot` (x3), `plan-mockup-url`, `plan-mockup-body`
- Utility: `text-muted`, `text-accent`, `text-sm`, `text-xs`, `font-bold`, `mt-0`/`mt-1`/`mt-2`/`mt-3`, `mb-0`/`mb-1`/`mb-2`/`mb-3`

**Content — include what is relevant from the conversation:**
- Architecture components and their relationships
- Data models and entities
- User flows and sequences
- API surface or key interfaces
- Decisions made and rationale
- Open questions still unresolved
- For any UI screens or components being discussed, render an HTML/CSS mockup using `plan-mockup` classes — no images
- No auto-refresh, no external CDN links

**Each major element must have a stable anchor ID:**

  data-anchor="component-AuthService"
  data-anchor="flow-Login"
  data-anchor="entity-User"

**User direction:**
If $ARGUMENTS is not empty, treat it as editorial direction for this run.
Use it to influence what gets emphasized, added, or focused on. Examples:
  /planpush focus on the data model
  /planpush add a mockup for the dashboard
  /planpush mark the auth flow as decided

---

## 7. Push to server

Read the HTML file and push it:

**First push** (no `{existing_session_id}`):

  curl -s -X POST {server_url}/api/push \
    -H "Authorization: Bearer {access_token}" \
    -H "Content-Type: text/html" \
    --data-binary @.claude/pushsync_plans/pushsync_plan_{session-name}.html

**Subsequent push** (has `{existing_session_id}`):

  curl -s -X POST {server_url}/api/push \
    -H "Authorization: Bearer {access_token}" \
    -H "Content-Type: text/html" \
    -H "X-Session-Id: {existing_session_id}" \
    --data-binary @.claude/pushsync_plans/pushsync_plan_{session-name}.html

Expected response: `{"session_id": "...", "url": "{server_url}/p/..."}`

If the push returns 401 (access token expired), retry step 2 to get a new access token, then retry the push once. If it fails again, print the error and stop.

If the push fails (non-200 or error in response body), print:

  ✗ Push failed. The design doc was saved locally at:
    .claude/pushsync_plans/pushsync_plan_{session-name}.html

Then stop.

---

## 8. Save the session ID

Write the `session_id` from the response to:

  .claude/plan-session-$CLAUDE_SESSION_ID

(Overwrite if it already exists.)

---

## 9. Confirm

Print:

  ✓ Plan pushed successfully.

    URL: {url from response}

  Share this link with your team. They can view the doc and leave comments.
