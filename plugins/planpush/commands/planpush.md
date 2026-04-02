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

## 5. Load class reference and generate HTML

**First push only** — read the CSS class reference. Look for it in the same directory as this command file:

  find ~/.claude -name planpush-classes.md -path "*/planpush/*" 2>/dev/null | head -1 | xargs cat 2>/dev/null

This file documents every available CSS class and SVG theming variable. If the file cannot be found, proceed using the class names listed in the HTML structure guidance below. On subsequent pushes you already know the classes.

**Determine what to generate:**

Scan the conversation for the most recent `/p/` URL from the server — this marks the last push.

- **First push** (no prior URL): Read the full conversation. Generate the HTML from scratch.
- **Subsequent push** (prior URL found): Read the current HTML file and only messages since the last push. Update changed sections — don't regenerate unchanged content.

**Write `{plans_dir}/pushplan_{session-name}.html`** as plain HTML — **no inline `<style>` or `<script>` tags**. The server injects `plan.css` and `plan.js` automatically.

### HTML structure

```
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{Plan Title}</title></head>
<body>
<div class="plan-wrapper">
  <div class="plan-header"><h1>...</h1><div class="plan-meta">...</div></div>
  <!-- tabs if multiple sections -->
  <div class="plan-tabs">
    <button class="plan-tab active" data-tab="overview">Overview</button>
    ...
  </div>
  <div class="plan-pane active" data-pane="overview">...</div>
  ...
</div>
</body>
</html>
```

Use tabs only when the plan has enough content to warrant them. Simple plans can skip tabs.

### Content — include what's relevant

- Architecture components and relationships
- Data models and entities
- User flows and sequences
- API surface or key interfaces
- Decisions made (with rationale) and open questions
- UI mockups using `plan-mockup` classes

### Visual diagrams

When the conversation involves architecture, flows, state machines, or relationships between components, **render them as inline SVG diagrams** inside `<div class="plan-diagram">`. Diagrams communicate structure far more effectively than prose.

Use CSS custom properties for theming so diagrams match light/dark mode:

```svg
<svg viewBox="0 0 600 300" xmlns="http://www.w3.org/2000/svg">
  <!-- Always define markers/symbols first -->
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
      markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--pp-accent)"/>
    </marker>
  </defs>

  <!-- Box -->
  <rect x="50" y="40" width="140" height="50" rx="8"
    fill="var(--pp-surface-2)" stroke="var(--pp-border)" stroke-width="1.5"/>
  <text x="120" y="70" text-anchor="middle"
    fill="var(--pp-text)" font-family="var(--pp-font)" font-size="14" font-weight="600">
    API Gateway
  </text>

  <!-- Arrow -->
  <line x1="190" y1="65" x2="260" y2="65"
    stroke="var(--pp-accent)" stroke-width="1.5" marker-end="url(#arrow)"/>
</svg>
```

**Diagram patterns:**

- **Architecture layers**: Stacked rows of rounded boxes with arrows showing data flow between layers. Group by layer (Client → API → Service → DB).
- **Flowcharts**: Rounded-rect steps connected by arrows. Use diamonds (rotated squares) for decision points. Color-code: accent for normal flow, success for happy path, danger for error paths.
- **State machines**: Circles/rounded-rects for states, arrows for transitions labeled with events. Double-circle for terminal states. Fill active/initial state with `--pp-accent-soft`.
- **ER diagrams**: Entity boxes (like `plan-entity` but in SVG) with lines between them showing relationships. Label cardinality (1:N, M:N) on the lines.
- **Sequence diagrams**: Vertical lifelines with horizontal arrows between participants. Label each arrow with the message/call.

Keep SVGs at reasonable dimensions (400-800px wide, scale height to content). Use `viewBox` so they scale responsively.

### Anchor IDs

Every major element must have a stable anchor ID:

  data-anchor="component-AuthService"
  data-anchor="flow-Login"
  data-anchor="entity-User"
  data-anchor="diagram-Architecture"

### User direction

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
