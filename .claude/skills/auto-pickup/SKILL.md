---
name: auto-pickup
description: "Autonomously pick up Linear issues in `Ready` status, one at a time, and implement them end-to-end via an Opus subagent per issue. Each iteration: pick the highest-priority unblocked Ready issue (sub-issues take priority over standalone issues) → flip to In Progress → spawn an Opus subagent that does an upfront complexity check and either implements the issue (worktree → tests → merge → Done) OR decomposes it into sub-issues in Linear (parent stays Ready, blocked_by each child). Loops until the Ready queue is empty or the stop flag is set. Triggers: `/auto-pickup`, `/auto-pickup on`, `/auto-pickup off`, `/auto-pickup status`."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, Skill, AskUserQuestion, mcp__linear__list_issues, mcp__linear__get_issue, mcp__linear__list_issue_statuses, mcp__linear__save_issue, mcp__linear__save_comment, mcp__linear__list_comments
---

# /auto-pickup

Autonomous loop that drains the `Ready` Linear queue by spawning one Opus subagent per issue. Each subagent does one issue end-to-end (worktree → implement → test → merge → flip to Done) and returns a summary. The main loop only accumulates summaries, so context stays bounded across many issues.

This skill exists as a deliberate carve-out from the project rule "implementation work is done directly, not via subagents." That rule still holds for normal sessions — this loop is the only place subagent-delegated implementation is allowed. See [[project-auto-pickup-loop]] in memory.

**Project scope is hard-locked.** This loop only ever picks up issues in the **PlanPush** Linear project (team `Jazzcatgames`). Every `list_issues` / `save_issue` / `save_comment` call must pass the resolved `team` + `project` from `.claude/pipeline-config.json`, and the loop must defensively post-filter results to drop anything whose `project.name` (or project id) doesn't match. Issues from other Linear projects — even if they show up in an MCP response — must be ignored. This is a load-bearing safety property: the user runs the loop unattended, and a misrouted issue would have the subagent doing work in the wrong repo against the wrong CLAUDE.md.

## Args

`/auto-pickup [on|off|status]`

- `on` (default if no arg) — start the loop in the current session.
- `off` — write `.claude/auto-pickup-stop`. Any running loop will exit cleanly at its next iteration boundary.
- `status` — print whether a loop is currently running (by checking `.claude/auto-pickup.lock`) and how many `Ready` issues are queued.

## When to use vs alternatives

- **/auto-pickup** — drain the Ready queue unattended in the current session. Good for "I'm walking away for an hour; clear what you can."
- **/pipeline advance** — manually move one issue's status. Use when you want full control.
- **Routines (Anthropic-managed)** — true session-independent automation that survives terminal close. Not built here. If the user asks for "auto-pickup that runs when my laptop is closed," steer them there instead.

## Procedure

### `off` branch

1. Touch `.claude/auto-pickup-stop` (create the `.claude/` dir if missing).
2. Print: `Stop flag set. The running loop (if any) will exit at its next iteration boundary.`
3. Done.

### `status` branch

1. Read `.claude/auto-pickup.lock` if present — it contains the start time and session ID of the running loop.
2. Query Linear: `mcp__linear__list_issues` with `team=Jazzcatgames`, `project=PlanPush`, status `Ready`. Post-filter to confirm every returned issue belongs to that project (drop and warn on any that don't). Count what remains.
3. Print:
   - Running? (yes/no, plus lock contents if yes)
   - Stop flag set? (yes/no)
   - Ready queue depth (count)

### `on` branch (the loop itself)

**0. Preflight.**
- Read `.claude/auto-pickup-stop` — if it exists, delete it (we're starting fresh; old stop flag is stale).
- Write `.claude/auto-pickup.lock` with the current timestamp + a short session marker.
- Read `.claude/pipeline-config.json` to resolve `team` and `project`.
- Verify the current branch is `main`. If not, refuse to start — print which branch is checked out and exit.
- Check `git status --porcelain`. If dirty:
  1. Run `git status --porcelain` and `git diff HEAD` to inspect the changeset.
  2. Run `git log -5 --oneline` to match the repo's commit-message style.
  3. Draft a concise commit message (1–2 sentences max, focused on the *why*) that accurately summarizes the snapshot. Use the same prefix conventions seen in recent commits (`feat`, `fix`, `chore`, `refactor`, etc.) — pick whichever fits the diff. If the diff is genuinely unrelated and mixed, prefix `chore:` and describe the broad area touched.
  4. Stage everything (`git add -A`) and commit with that drafted message (no Co-Authored-By trailer, per global CLAUDE.md).
  5. Print the commit hash + message + list of files snapshotted. Then continue.

**1. Invoke `/loop` (self-paced).** Pass the iteration body below as the loop prompt. Self-paced means the loop's "tick" is "one full issue done" — not a fixed interval — because issue implementation time varies wildly. Use the `Skill` tool with `skill=loop` and no interval.

**2. Iteration body** (executed by the loop each tick):

   1. **Check stop flag.** If `.claude/auto-pickup-stop` exists, delete it, delete `.claude/auto-pickup.lock`, and exit the loop cleanly.

   2. **Fetch Ready issues.** `mcp__linear__list_issues` with the resolved team + project + status=`Ready`. Include `relations` so blocker info is available. **Defensively post-filter** the results: drop any issue whose project doesn't match the resolved project name/id. If anything was dropped, log a one-line warning naming the projects encountered so the misrouting is visible. If zero results remain, delete `.claude/auto-pickup.lock` and exit the loop ("queue empty").

   3. **Filter out blocked issues.** For each Ready issue, look at its `blocked_by` relations. If any blocker is NOT in `Done` status, drop the issue from this iteration's candidates. (A blocker that's been merged is fine; a blocker still in Ready/In Progress/Todo means the dependency isn't satisfied.) If, after filtering, candidates is empty AND the original list was non-empty, print which issues are blocked-by-what and exit the loop ("all Ready issues are blocked").

   4. **Pick the top candidate.** Sort the unblocked candidates by:
      1. **Is sub-issue first** — issues with a `parent` field set come before issues without one. Auto-pickup decomposes work into sub-issues over time, and the contract is that sub-issues take priority over standalone Ready issues so decomposed work is finished before new top-level work is started.
      2. Then by Linear priority (`urgent` > `high` > `medium` > `low` > `no priority`).
      3. Break ties by `createdAt` ascending (oldest first).

   5. **Flip to In Progress.** `mcp__linear__save_issue` with status=`In Progress`. Post a comment on the issue: `auto-pickup: starting implementation (session <session-id>)`.

   6. **Assemble related-issue context.** Use `mcp__linear__get_issue` with `includeRelations=true` on the picked issue to read its `relations` (`blockedBy`, `blocks`, `relatedTo`, `duplicateOf`) and `parentId`. For each related identifier — including the parent if set — call `mcp__linear__get_issue` and capture `{identifier, title, status, description}`. Keep all of them; don't filter by status — Done siblings show what was decided, In Progress / Ready ones show what's adjacent. Cap descriptions at ~2000 characters each (truncate with `…` if longer) to keep the prompt bounded. If there are zero relations and no parent, skip this step.

   Additionally, call `mcp__linear__list_comments` on the picked issue and capture any comment whose body starts with `auto-pickup:` — these are the loop's own prior activity on this issue. Cap each comment body at ~500 chars. If at least one is a `auto-pickup: decomposed into …` comment, this picked issue is a **re-pickup of a previously-decomposed parent** — the subagent's prompt step 0c uses this signal to force a completeness audit before returning `merged`.

   7. **Delegate to an Opus subagent** via the `Agent` tool with `model="opus"`. Prompt template:

      ```
      You are working on Linear issue <IDENTIFIER>: <TITLE>.

      Full issue description:
      <DESCRIPTION>

      Related Linear issues (parent / blockers / related — for context only; do NOT
      re-implement them, but DO honor any decisions they locked in):
      <RELATED_CONTEXT — for each related issue, a block of:
        ### <IDENTIFIER> (<STATUS>): <TITLE>
        <DESCRIPTION truncated to ~2000 chars>
      — or "(none)" if empty>

      Prior auto-pickup activity on this issue (the loop's own `auto-pickup:`-prefixed comments):
      <PRIOR_AUTO_PICKUP_COMMENTS — for each, "<createdAt>: <body truncated to ~500 chars>", or "(none)" if empty>

      Treat the issue description as the spec. Follow CLAUDE.md in the repo root for all conventions
      (code style, security patterns, route/migration conventions). PlanPush is an Express 5 / Node 22+
      ESM app using Knex.js (SQLite via better-sqlite3 by default). Specific requirements:

      0a. PROJECT MEMORY PRELOAD. Before anything else, read
          `~/.claude/projects/C--Users-Jordan-wkspaces-planpush-dev/memory/MEMORY.md`.
          It's a one-line-per-entry index of accumulated project context (feedback rules,
          architectural constraints, prior decisions). For any entry whose description
          plausibly relates to this issue, read the linked memory file and follow its guidance.
          The no-cd-with-git rule, the bump-plugin-version rule, and the rebuild-Docker-after-
          code-changes rule are particularly load-bearing — load them if they touch your work.

      0b. UPFRONT COMPLEXITY CHECK. Read the issue's ## Implementation Plan. Default to
          ATTEMPTING the implementation in one pass — decomposition is expensive (it
          creates Linear churn and delays the work) so only decompose when one-pass
          completion is genuinely unrealistic. It is TOO LARGE only if MULTIPLE of these
          hold simultaneously:
           - The plan reads as 5+ distinct phases that each warrant their own PR
             (not just numbered steps within a single coherent change).
           - It touches more than ~20 source files across genuinely unrelated systems
             (a new system + its natural integration sites is ONE pass, not two).
           - The ## Goal contains 3+ semicolon- or "and"-joined goals that each
             justify a standalone issue (a single feature with sub-mechanics is fine).
           - Implementing it would realistically require 4+ hours of focused work,
             even with the plan fully specified.
          A single new system that wires into existing systems is NORMAL scope — implement
          it. A feature with 3-4 implementation phases is NORMAL scope — implement it
          phase-by-phase in one worktree, with one commit per phase if helpful, and merge
          at the end. When in doubt, attempt; you can still bail to `too_large` mid-attempt
          (see step 3) if the work genuinely explodes.

          If TOO LARGE upfront, do NOT create a worktree. Return immediately:
           {"status":"too_large","reason":"<one-line cause>",
            "subIssues":[
              {"title":"<short imperative title>","priority":<0-4>,
               "goal":"<one paragraph>","implementationPlan":"<markdown bullets>",
               "filesToCreate":["..."],"filesToModify":["..."]},
              ...
            ]}
         Sub-issues should be sequenced so #1 is independently mergeable, #2 builds
         on #1, etc. Inherit `priority` from the parent unless one sub-issue is
         genuinely more urgent.

      0c. RE-PICKUP COMPLETENESS AUDIT. The "Prior auto-pickup activity" block
          above tells you whether this is a re-pickup of a previously-decomposed
          parent. If it contains at least one `auto-pickup: decomposed into …`
          comment, you ARE that re-pickup. Do NOT trust "all children Done =
          parent Done" — the children may have each shipped their own narrow
          scope while leaving the parent's cross-cutting promise partly
          unfulfilled (e.g. a parent promising "a test file per route" whose
          children each shipped one route's tests, leaving two routes silently
          uncovered).

          Before deciding to return `merged`, run this audit:
           - Re-read the parent's ## Goal and ## Acceptance (if present)
             line by line.
           - If the Goal enumerates targets ("one X per Y" with a fixed list
             of Y; "wire each of A/B/C"; "cover every route/migration/endpoint"),
             grep the codebase and confirm a real code path exists for EVERY
             enumerated target. Do not stop at "5 of 6 wired — close enough."
           - For each entry in ## Files to modify (if the parent lists any),
             verify a child's commit actually touched it
             (`git log --oneline -- <file>`).
           - If ANY enumerated target is missing OR any Files-to-modify entry
             is untouched: return `too_large` with a SINGLE follow-up sub-issue
             whose title is `Finish/Wire <parent topic> — <specific gap>`,
             NOT `merged`. Inherit priority from the parent.
           - Return `merged` (with `filesChanged: 0` if no new code is needed)
             ONLY when every enumeration and every listed file is verifiably
             satisfied.

          This audit applies ONLY on re-pickup; first-encounter parents use
          0b's normal complexity check and skip this step.

      1. Create an isolated worktree off `main`:
           git worktree add .claude/worktrees/<IDENTIFIER-slug> -b <IDENTIFIER-slug> main
         better-sqlite3 is a native module, so the worktree needs node_modules. On
         Windows, junction it from the main checkout instead of reinstalling:
           cmd /c mklink /J <worktree>\node_modules <repo-root>\node_modules
         Work entirely inside the worktree from here on.

      2. Implement per the issue's ## Implementation Plan section. Follow the
         code-style and security rules in CLAUDE.md (minimal changes, no comment
         bloat, no scope creep). New DB schema goes in a Knex migration under
         src/migrations/ (auto-run at startup); never edit an existing migration.

      3. SMOKE TEST — PlanPush has no automated test suite, so verify the app still
         boots and serves. In the worktree:
           a. `node --check` every .js file you created or modified (syntax gate).
           b. Boot the server against a throwaway SQLite DB so migrations run clean:
              set a temp DB path + a >=32-char SECRET_KEY in the env, `npm start` in
              the background, poll `GET /health` until 200 (or fail after ~15s),
              then stop the server. A non-200 or a boot/migration error is a failure.
         All checks must pass. If they don't, fix and retry — up to 3 attempts total.
         If after 3 attempts it still fails, do NOT merge: revert any local changes
         (`git restore .`), exit the worktree.

         Then decide: was the issue blocked on a specific external dependency / open
         question (true blocker), or was it actually too large to land in one pass
         (scope kept expanding, integration kept breaking the boot)?

           - True blocker → return:
             {"status":"blocked","reason":"<one-line cause>"}

           - Too large after attempt → return the same `too_large` shape as step 0b,
             with `subIssues` broken out from what you learned during the failed
             attempt:
             {"status":"too_large","reason":"<one-line cause from the attempt>",
              "subIssues":[...]}

      3b. PRE-MERGE FILE-PLAN AUDIT. The smoke test passing does not prove the
          plan was followed — an agent can ship `merged` with explicit
          Files-to-delete or Files-to-modify items silently skipped, and the app
          still boots because the dead code is unreachable (e.g. a refactor lists
          three route/util files to delete but leaves one behind as a stub with a
          now-broken import to the just-deleted module; the server still boots and
          `/health` still returns 200 because nothing reachable imports the stub).
          Run this audit BEFORE committing. It is mechanical and cheap.

          For each entry in the issue's ## Files to delete (if the section exists):
           - Run `test -e <path>` from the worktree root. If the file still exists,
             the deletion was not completed.
           - Do NOT leave it as a stub, a re-export shim, or "kept for backward
             compatibility." The plan said delete; delete it.
           - Options:
              a) Complete the deletion now: remove the file, fix any newly-broken
                 imports by repointing them at the canonical source, re-run the
                 smoke test, re-run this audit. Repeat until the audit clears.
              b) If completion is genuinely impossible in this pass (surviving
                 callers you can't refactor in scope), revert local changes
                 (`git restore .`), exit the worktree, and return `too_large`
                 with a single follow-up titled `Finish deletion of <files>`.

          For each entry in the issue's ## Files to modify (if the section exists):
           - Run `git diff --name-only main..HEAD` in the worktree and verify
             every listed file appears. A listed file that wasn't touched usually
             means a plan item was silently skipped — investigate.
           - Allowed exception: a Files-to-modify entry whose Plan rationale no
             longer applies after upstream changes (rare). If so, record why in
             the commit message; do not treat as a free pass.

          Also grep the worktree for orphaned imports of any deleted module
          (PlanPush uses ESM relative imports with `.js` extensions):
          `grep -rn "<deleted-module-name>" src/`. Any hit is a broken import the
          agent missed. Fix or escalate before merging.

          Skip this audit entirely if the issue body contains neither
          ## Files to delete nor ## Files to modify (the plan made no
          file-system promises to check).

      4. Commit (no Co-Authored-By trailer — see global CLAUDE.md), merge to main
         with `--no-ff` using message `merge: <branch-name>`, remove the worktree
         (remove the node_modules junction first with `cmd /c rmdir <worktree>\node_modules`,
         then `git worktree remove`, then delete the branch with `git branch -d`).

      5. Return a JSON summary on success:
         {"status":"merged","branch":"<branch-name>","filesChanged":<n>,"smokePass":true}

      Do NOT update the Linear issue status — the parent loop handles that.
      Do NOT push to remote — the parent loop handles that if needed.
      Do NOT comment on the Linear issue — the parent loop handles that.
      Do NOT create Linear sub-issues yourself — return them in the JSON and
        the parent loop will create them.

      Your final message must be ONLY the JSON summary, nothing else.
      ```

   8. **Parse the subagent's JSON return.**

      - `status: "merged"` → verify the merge actually happened: `git log main --oneline -1` should show `merge: <branch-name>`. If it doesn't, treat as malformed (see below). On verification: post a comment on the issue: `auto-pickup: merged to main on branch <branch>. Files changed: <n>.` Then `mcp__linear__save_issue` with status=`Done`. Continue to next iteration.

      - `status: "blocked"` → post a comment: `auto-pickup: blocked — <reason>. Flipping back to Ready for manual handling.` Then `mcp__linear__save_issue` with status=`Ready`. Continue to next iteration.

      - `status: "too_large"` → decompose. See **Decomposition** section below. After creating sub-issues and updating relations, continue to next iteration.

      - Any other / malformed return → treat as blocked. Comment: `auto-pickup: subagent returned malformed result; flipping back to Ready.` Flip to Ready. Continue.

   9. Loop back to step 1.

### Decomposition (handling `status: "too_large"`)

When the subagent returns `too_large`, the parent loop must:

1. **Create each sub-issue in Linear** via `mcp__linear__save_issue`. For each entry in the returned `subIssues` array:
   - `team` + `project` from the resolved config.
   - `parent` = the parent issue's id (this makes it a Linear sub-issue, visible nested under the parent).
   - `status` = `Ready` (directly available for pickup — the subagent has already framed them, so they skip the Backlog → Todo → Ready stages).
   - `priority` from the subagent's suggestion (default: inherit from parent).
   - `description` = the standard pipeline issue template:
     ```markdown
     ## Goal
     <subIssue.goal>

     ## Open questions
     <!-- none — auto-generated by /auto-pickup decomposition of parent <PARENT-IDENTIFIER> -->

     ## Decisions
     <!-- inherits from parent <PARENT-IDENTIFIER> -->

     ## Implementation Plan
     <subIssue.implementationPlan>

     ## Files to create
     <bulleted list from subIssue.filesToCreate>

     ## Files to modify
     <bulleted list from subIssue.filesToModify>
     ```
   - Keep track of each new sub-issue's id and identifier as Linear returns them.

2. **Establish blocker relations on the parent.** For each newly-created sub-issue, add a `blocked_by` relation from the parent to that sub-issue. Use `mcp__linear__save_issue` with whatever relation field the MCP exposes (if relations aren't updateable via save_issue, log a warning and proceed — the parent-status fallback in step 4 still keeps the loop correct).

3. **Flip the parent back to Ready.** The parent was moved to In Progress in step 5 of the iteration; with sub-issues blocking it, flip back to `Ready` via `mcp__linear__save_issue`. The existing blocker filter in iteration step 3 will skip it until all children are Done.

4. **Comment on the parent:**
   `auto-pickup: decomposed into <COUNT> sub-issues: <list of new identifiers with titles>. Reason: <reason>. Parent will be picked up again once all sub-issues are Done.`

5. **Continue.** The next iteration will refresh the Ready queue, and one of the new sub-issues will sort to the top (sub-issues > non-sub-issues in the selection order).

When the parent is eventually picked up again (all children Done, no longer blocked), the subagent MUST run the re-pickup completeness audit defined in prompt step 0c before deciding `merged`. "All children Done" is necessary but not sufficient: the children's individual narrow scopes can collectively leave the parent's cross-cutting promise partly unfulfilled — e.g. a parent promising "a test file per route" can have every child marked Done while two routes were silently left uncovered. The audit forces the subagent to grep for each enumerated target in the parent's Goal before returning `merged`. The parent loop verifies via `git log` exactly as for any other merged issue.

**3. On loop exit** (queue empty, all-blocked, or stop flag): delete `.claude/auto-pickup.lock`. Print a final summary: how many issues were merged, how many were blocked, and which ones.

## Notes

- **Single-session lifespan.** The loop runs inside whatever session invoked `/auto-pickup on`. Closing the terminal kills the loop. The lock file will remain stale — `/auto-pickup status` will detect and report this (lock present, but no running session). The next `/auto-pickup on` invocation clears stale locks automatically.

- **Concurrency.** Don't run two `/auto-pickup` loops in parallel from different sessions — they'd race on worktree creation and on `main` merges. The lock file makes this visible; honor it.

- **Why subagents here only.** Subagent delegation is normally forbidden in this project (see [[feedback-implement-directly]] — past delegation failed with false-green test claims). The carve-out is justified because (a) context bloat is fatal for a long-running loop, (b) the subagent's contract is narrow and verifiable (must return JSON), (c) the parent loop re-verifies the merge happened by checking git log before flipping the Linear status. The parent loop should not blindly trust the subagent's `smokePass: true` — it should `git log main --oneline -1` after each subagent return and confirm a `merge: <branch-name>` commit landed.

- **Model pinning.** The `Agent` call must pass `model="opus"` explicitly. Don't rely on inheritance.

- **No design discussion.** If a Ready issue's `## Open questions` section has non-comment content, the subagent should treat it as blocked (comment + skip back to Ready) — auto-pickup never makes design decisions.

- **Decomposition is bounded.** The subagent can return `too_large` at most twice for any single parent issue (track this in the parent issue's comments — count prior `auto-pickup: decomposed into…` comments). On the third encounter, treat as `blocked` instead and surface for manual handling. This prevents pathological infinite-recursion where a parent splits into children that themselves split into grandchildren without convergence.

- **Sub-issue stages skipped.** Sub-issues created by auto-pickup go directly to `Ready` — they bypass the normal Backlog → Todo → Ready flow because the parent subagent has already framed them (Goal + Implementation Plan + files lists). The `## Open questions` section is explicitly empty by construction. If you want a sub-issue to go through `/pipeline review` before being built, manually flip it back to `Todo`.
