---
description: Authenticates with PlanPush via device flow (RFC 8628). One-time setup — run this before using /planpush:planpush.
---

# PlanPush Auth

Authenticate this machine with PlanPush so you can push design docs to your team.

---

## 1. Resolve server URL

Check if credentials already exist:

  cat ~/.planpush/credentials 2>/dev/null

If the file exists and contains a `server_url` field, use it as `{server_url}`.

Otherwise, ask the user:

  Which PlanPush server do you want to connect to?

  1. PlanPush Cloud (pushsync.jazzcatgames.dev)
  2. Self-hosted server (enter URL)

If the user picks option 1, set `{server_url}` to `https://pushsync.jazzcatgames.dev`.
If the user picks option 2 or provides a URL, use that URL (strip any trailing slash).

Validate the server by calling:

  curl -s -X GET {server_url}/api/info

If the request fails, print:

  ✗ Could not reach the server at {server_url}. Check the URL and try again.

Then stop.

Parse the response. Store the `auth` field (e.g. `"github"` or `"clerk"`) as `{auth_type}` for reference, but the device flow works the same for both server types.

---

## 2. Request a device code

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

---

## 3. Prompt the user

Print:

  Open this URL in your browser and enter the code below:

    URL:  {verification_uri}
    Code: {user_code}

  Waiting for authentication...

---

## 4. Poll for completion

Every `{interval}` seconds, run:

  curl -s -X POST {server_url}/api/auth/device/token \
    -H "Content-Type: application/json" \
    -d '{"device_code": "{device_code}"}'

Handle responses:

| Response | Action |
|---|---|
| `{"status": "pending"}` | Wait `{interval}` seconds, poll again |
| `{"status": "complete", "refresh_token": "...", "user": "...", "org": "..."}` | Proceed to step 5 |
| `{"error": "expired"}` | Print error (see below), stop |
| `{"error": "denied"}` | Print error (see below), stop |
| Any other error | Print error (see below), stop |

Continue polling until complete or `{expires_in}` seconds have elapsed.

If polling times out before completion, print:

  ✗ Code expired. Run /planpush:planpush-auth again to get a new code.

If the user denied:

  ✗ Authorization denied.

---

## 5. Save credentials

Run:

  mkdir -p ~/.planpush

Write the following JSON to `~/.planpush/credentials`:

```json
{
  "server_url": "{server_url}",
  "refresh_token": "{refresh_token from response}",
  "user": "{user from response}",
  "org": "{org from response}",
  "issued_at": "{current ISO 8601 timestamp}"
}
```

Then set permissions:

  chmod 600 ~/.planpush/credentials

---

## 6. Confirm

Print:

  ✓ Authenticated as {user} ({org})
    Server: {server_url}
  You can now run /planpush:planpush to push design docs to your team.
