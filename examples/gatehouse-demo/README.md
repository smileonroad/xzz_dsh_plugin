# gatehouse-demo

[English](README.md) | 中文

In an old-fashioned compound, the gatehouse sits at the entrance. A visitor
who wants in registers first; the gatekeeper checks the list: regulars are
waved straight through, banned names are turned away at the door, strangers
get a phone call to whoever owns what they want. If nobody picks up, nobody
gets in.

That is the **approval answerer chain** of the real harness seam
[`approval/request`](../../docs/subsystems/approval.md) — "a policy answer
instead of the user", as the tutorial calls it. This example practices the
third role of that seam: the answerer. events-demo practiced listening to the
harness's real `tools/*` waterfalls, tea-shop-demo declared and dispatched
its own events; here the same waterfall discipline (claim or delegate) meets
a real harness event, and the story keeps every mechanism honest.

## Running

This directory is the **authoritative source**. To run it, copy it into the
deepseek-harness source tree (the copy there may be stale), then work from
the deepseek-harness root:

```sh
# 1. Copy into the deepseek-harness source (this repository is authoritative)
cp -r examples/gatehouse-demo ../deepseek-harness/examples/gatehouse-demo

# 2a. Run the tests
cd ../deepseek-harness
pnpm exec vitest run examples/gatehouse-demo/tests/gatehouse-demo.spec.ts

# 2b. Or mount it into the web UI (temporary, via the patch layer)
pnpm dsh web --patch examples/gatehouse-demo/gatehouse.patch.yml
```

> Note: web HMR is disabled by default in release builds, so you must restart
> the web process after adding a plugin.
>
> Note: an entry's `name` in a patch resolves against the **profile directory**
> (`~/.dsh/profiles/web/`), not against this file. `gatehouse.patch.yml` uses
> a relative path plus a junction under the profile directory; create the
> junction once before first use (Windows, no admin rights):
>
> ```sh
> cmd //c "mklink /J %USERPROFILE%\.dsh\profiles\web\examples <deepseek-harness>\examples"
> ```
>
> To avoid junctions, switch to an absolute `file:///` URL (rules at the top
> of that file; a DSH_HOME-on-same-drive relative hop and bundle install are
> the other two alternatives).

In the web dialog, ask the model to take something from a storage locker
(`use_locker`): the keeper's allow list waves it through and the tool runs.
Try the vault (`open_vault`): refused outright. Try the lab (`use_lab`): not
on the list, so the web UI answerer asks the human in the browser.

## Design

### The approval seam, three roles

`approval/request` is one question: may this specific tool call proceed?
Three roles meet on it:

- **The Definition** (`dsh-user-approval`, already in every profile) owns the
  service, the closed outcome vocabulary, the session policy, and the audit
  pair.
- **The asker** is the tool executor: when a `tools/pre-execute` listener
  answers `{ kind: 'ask', reason }`, dsh-tools turns it into
  `ctx.approval.request`. The gatehouse's `facilities` plugin plays this role
  with the real path — no hand-rolled asker.
- **The answerers** form a waterfall chain. The web UI answerer (apiproxy,
  part of the web-app bundle) prompts the human; the keeper adds policy
  answers on top of it.

One ask walks the whole chain:

```
tool wants to run
   │  a tools/pre-execute listener returns { kind: 'ask', reason }
   ▼
ctx.approval.request (dsh-tools' serviceAsk)
   │  the log gets approval/asked first
   ▼
approval/request waterfall, answerers asked in registration order
   ├─ return an outcome → claim, chain ends
   ├─ call next()      → pass it on
   └─ nobody claims    → default 'unavailable'
   ▼
the log gets approval/decided (same id), the outcome resolves
   ▼
the tool executor maps: allowed-once runs, everything else denies
```

### The story, mapped

| Gatehouse | approval seam |
|---|---|
| visitor wants in | `tools/pre-execute` ask → `ctx.approval.request` |
| the keeper checks the list | the `approval/request` answerer waterfall |
| regular visitor → straight through | return `'allowed-once'` (claim) |
| banned name → turned away | return `'rejected'` (claim) |
| stranger → phone call to the owner | call `next()` (delegate — the web UI answerer) |
| nobody picks up | no answerer → `'unavailable'` (fail closed) |
| the door is locked | the session `'never'` policy — decided by the service BEFORE any answerer runs |

The keeper's config is the list: `allow` (regulars), `deny` (banned names),
`prepend` (where the automatic rule sits in the chain — see below).
Anything unlisted is a stranger: the keeper delegates.

### The answerer's discipline: claim or delegate

A waterfall listener that wants to answer returns the outcome and stops the
chain. A listener that does not own the question MUST call `next()` — the
same discipline events-demo pinned on `tools/*` observers, now on a real
decision event. Forgetting `next()` in a logging listener silently swallows
every answerer downstream.

```
an answerer is asked
   │
   ├─ mine to answer → return the outcome (claim), chain ends
   │
   └─ not mine → must call next()
                    │
                    └─ nobody claims → default 'unavailable'
```

The outcome vocabulary is closed and fail-closed:

| outcome | meaning |
|---|---|
| `'allowed-once'` | the only grant — this one action may proceed |
| `'rejected'` | refused; the tool call fails with the reason |
| `'cancelled'` | the ask was withdrawn (abort signal); a late answer is discarded |
| `'unavailable'` | no answerer, a throwing answerer, or a rogue return — normalized to deny |

An answerer that throws fails the QUESTION closed, not the caller open: the
seam contains its callbacks.

> **Deeper: who answers first? Layer order vs registration order.**
>
> `ctx.on` listeners run in registration order. The web UI answerer claims
> EVERY audited ask — it publishes a prompt to the browser and waits — so an
> answerer registered after it never gets to answer. Patch layers apply as
> dsh-base → dsh-web-app → profile `cordis.patch.yml` → `--patch` overlays:
> the UI answerer mounts with the web-app bundle, so a `--patch`-mounted
> keeper sits BEHIND it and auto-approval stays dormant. `prepend: true`
> unshifts the keeper to the front of the chain — the one position from
> which a patch overlay can answer before the UI. The keeper's default is
> `prepend: false`: an automatic gate that silently outranks a human is not
> a default.
>
> But no prepend overrides the session policy. `'never'` is decided inside
> the service, before dispatch, so even a keeper prepended tomorrow cannot
> bypass it: the keeper is the door, the policy is the lock.

### Session policy: ask or never

`ApprovalPolicy` is per-session and durable: `'ask'` (the default) delegates
to the answerer chain; `'never'` rejects every ask deterministically without
dispatching anyone. The effective value is the last `approval/policy` event
in the session log — replay reconstructs it, no catch-up machinery.
`setApprovalPolicy(session, policy)` is the single write path, and the model
sees the current policy in its runtime-context snapshot, so it knows when
asking is pointless.

### Every ask leaves an audit pair

`ctx.approval.request` appends `approval/asked`, then the matching
`approval/decided` with the same `ApprovalRequestId` — log-only, never in
the model transcript. The pair must be enclosed by an open turn (the log's
commit boundary); asking outside a turn throws before anything is written.

## How to develop

```
gatehouse-demo/
├── src/gatekeeper.ts    # answerer: allow/deny/prepend Config, claim or delegate
├── src/facilities.ts    # three gated tools (use_locker/open_vault/use_lab) + the ask policy
├── tests/gatehouse-demo.spec.ts  # 18 cases, in-process, real ApprovalService + ToolRuntime
├── cordis.yml           # composition: approval service + facilities + keeper
└── gatehouse.patch.yml  # web overlay entry
```

> Relation note: this directory is the complete source + test package of the
> approval-answerer practice; `notes/2026-08-26-gatehouse-demo.md` records the
> learning behind it, and the shaping proposal is at
> `docs/proposals/2026-08-26-gatehouse-demo.md`.

- `src/gatekeeper.ts` — `name = 'gatehouse-keeper'`, `inject = ['approval']`
  (cordis activation gating: without the service the keeper simply never
  activates). Schemastery `Config` (same-name export, the csv-query-tool
  pattern); the listener claims `allow`/`deny` by tool name and delegates
  everything else.
- `src/facilities.ts` — `name = 'gatehouse-facilities'`, `inject = ['tools']`.
  Three toy tools plus the `tools/pre-execute` ask policy; any other tool
  passes through with `next()`. The ask reason is the visitor's story — the
  web UI shows it to the human.
- `tests/gatehouse-demo.spec.ts` — real `SystemPrompt` + `ToolRuntime` +
  `ApprovalService`, a fake agent with a seeded open turn (the same stand-in
  the harness's own approval tests use), dispatched through
  `ctx.tools.execute`. Eighteen cases: the keeper's three decision paths,
  fail-closed (no answerer / throwing / rogue return), the `'never'` policy
  and its switch back, the audit pair and the open-turn precondition, abort
  cancellation, registration order vs `prepend`, disposer restore, the gated
  set boundary, the no-approval degrade, and Loader-safe exports.

Run the tests:

```sh
pnpm exec vitest run examples/gatehouse-demo/tests/gatehouse-demo.spec.ts
```

## How to distribute

Consistent with the other examples: this directory is a **teaching example**,
not an installable package. To distribute, promote it to a standard bundle
under `packages/` following the [packaging tutorial](../../docs/user/develop/basic/publish.md),
then install with `dsh plugin --profile <name> add <package>`.
