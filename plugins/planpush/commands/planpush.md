---
description: Generates or updates a visual HTML design doc from the current planning session and pushes it to PlanPush for your team to view, comment on, and get notified about. Handles authentication automatically on first run.
---

# PlanPush

$ARGUMENTS

Push a visual design doc from this planning session to PlanPush.

---

## 1. Authenticate

Read existing credentials:

  cat ~/.planpush/credentials 2>/dev/null

If the file exists and contains both `server_url` and `refresh_token`, skip to step 1c.

If the file exists and contains `server_url` but no `refresh_token`, skip to step 1b using the saved `{server_url}`.

Otherwise, run first-time setup (step 1a).

### 1a. First-time setup

Ask the user:

  What is your PlanPush server URL? (e.g., https://planpush.example.com)

Store the response (strip any trailing slash) as `{server_url}`.

Validate the server:

  curl -s -X GET {server_url}/api/info

If the request fails, print:

  ✗ Could not reach the server at {server_url}. Check the URL and try again.

Then stop.

### 1b. Device flow

Run:

  curl -s -X GET {server_url}/api/auth/device

Parse the JSON response:
- `device_code` — used to poll for completion (never shown to user)
- `user_code` — shown to user
- `verification_uri` — URL user opens to complete auth
- `expires_in` — seconds until the code expires
- `interval` — polling interval in seconds (default: 5)

If the request fails or returns an error, print:

  ✗ Could not reach PlanPush server. Check your connection and try again.

Then stop.

Print:

  Open this URL in your browser and enter the code below:

    URL:  {verification_uri}
    Code: {user_code}

  Waiting for authentication...

Every `{interval}` seconds, run:

  curl -s -X POST {server_url}/api/auth/device/token \
    -H "Content-Type: application/json" \
    -d '{"device_code": "{device_code}"}'

Handle responses:

| Response | Action |
|---|---|
| HTTP 428 with `{"error": "authorization_pending"}` | Wait `{interval}` seconds, poll again |
| HTTP 200 with `refresh_token` present | Save credentials and continue |
| `{"error": "expired_token"}` | Print `✗ Code expired. Run /planpush again.` and stop |
| Any other error | Print the error and stop |

Continue polling until complete or `{expires_in}` seconds have elapsed.

On success, save credentials:

  mkdir -p ~/.planpush

Write to `~/.planpush/credentials`:

```json
{
  "server_url": "{server_url}",
  "refresh_token": "{refresh_token from response}",
  "user": "{user from response}",
  "issued_at": "{current ISO 8601 timestamp}"
}
```

Then:

  chmod 600 ~/.planpush/credentials

Print:

  ✓ Authenticated as {user}

Continue to step 1c.

### 1c. Exchange refresh token for access token

Using `{server_url}` and `{refresh_token}` from the credentials file, run:

  curl -s -X POST {server_url}/api/auth/token \
    -H "Content-Type: application/json" \
    -d '{"refresh_token": "{refresh_token}"}'

Expected response: `{"access_token": "...", "expires_in": 3600}`

If the response contains `{"error": "invalid_refresh_token"}` or any auth error:
- Print: `⟳ Session expired. Re-authenticating...`
- Go back to step 1b to run the device flow again with the existing `{server_url}`
- After successful re-auth, retry this step once
- If it fails a second time, print `✗ Authentication failed. Check your server and try again.` and stop

Store the `access_token` for use in step 6.

---

## 2. Resolve output directory and session name

Determine the plan output directory:

  git rev-parse --show-toplevel 2>/dev/null

If this succeeds, use the result as `{repo_root}` and set `{plans_dir}` to `{repo_root}/pushplans`.

If it fails (no git repo), set `{plans_dir}` to `./pushplans` (relative to the current working directory).

Next, resolve the session name.

  echo $CLAUDE_SESSION_NAME

If non-empty, sanitize for use as a filename:
- Lowercase
- Replace spaces and special characters with hyphens
- Trim leading/trailing hyphens

Use the result as `{session-name}`.

If empty, run:

  echo $CLAUDE_SESSION_ID

Use the result as `{session-name}`.

The local output file will be: `{plans_dir}/pushplan_{session-name}.html`

---

## 3. Check for existing server session

  cat .claude/plan-session-$CLAUDE_SESSION_ID 2>/dev/null

If the file exists and contains a non-empty string, store it as `{existing_session_id}`.
This is a subsequent push — the server will overwrite the existing session.

If the file does not exist or is empty, this is a first push — the server will create a new session.

---

## 4. Ensure output directory exists and update .gitignore

  mkdir -p {plans_dir}

Check the project root `.gitignore` (or create one if it doesn't exist). If either of these lines is missing, add them:

  pushplans/
  .claude/plan-session-*

---

## 5. Determine context and generate HTML

Scan the conversation history for the most recent message that contains a prior `/p/` URL from the server — this marks the last push.

**First push** (no prior URL found):
- Read the full conversation
- Generate `{plans_dir}/pushplan_{session-name}.html` from scratch

**Subsequent push** (prior URL found):
- Read the current `{plans_dir}/pushplan_{session-name}.html`
- Read only messages after the last push marker
- Identify what has changed: new components, updated flows, new entities, new UI, resolved questions, new decisions
- Update only the changed sections — do not regenerate what has not changed

Write `{plans_dir}/pushplan_{session-name}.html` as a plain HTML file with **no inline `<style>` or `<script>` tags**. The server injects `plan.css` (styling) and `plan.js` (tab switching, anchor scrolling) automatically with CSP nonces.

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

## 6. Push to server

Read the HTML file and push it:

**First push** (no `{existing_session_id}`):

  curl -s -X POST {server_url}/api/push \
    -H "Authorization: Bearer {access_token}" \
    -H "Content-Type: text/html" \
    --data-binary @{plans_dir}/pushplan_{session-name}.html

**Subsequent push** (has `{existing_session_id}`):

  curl -s -X POST {server_url}/api/push \
    -H "Authorization: Bearer {access_token}" \
    -H "Content-Type: text/html" \
    -H "X-Session-Id: {existing_session_id}" \
    --data-binary @{plans_dir}/pushplan_{session-name}.html

Expected response: `{"session_id": "...", "url": "{server_url}/p/..."}`

If the push returns 401, go back to step 1c to get a new access token, then retry the push once. If it fails again, print the error and stop.

If the push fails (non-200 or error in response body), print:

  ✗ Push failed. The design doc was saved locally at:
    {plans_dir}/pushplan_{session-name}.html

Then stop.

---

## 7. Save the session ID

Write the `session_id` from the response to:

  .claude/plan-session-$CLAUDE_SESSION_ID

(Overwrite if it already exists.)

---

## 8. Confirm

Print:

  ✓ Plan pushed successfully.

    URL: {url from response}
    Local: {plans_dir}/pushplan_{session-name}.html

  Share this link with your team. They can view the doc and leave comments.
