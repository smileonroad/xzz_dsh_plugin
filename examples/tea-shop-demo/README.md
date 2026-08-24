# tea-shop-demo example

English | [中文](README.zh.md)

The **declare-and-emit half of typed events**: a milk-tea shop service that
declares its own typed event family (`declare module` + `interface Events`
merge) and dispatches it with all five distribution modes. It completes the
events story started by `events-demo` (which only *listened* to real harness
events and deliberately declared nothing of its own) — this one declares
everything, including `serial` / `bail` / `parallel` with real semantics.

## Running

This directory is the **source of truth** for the example. To run it, first
copy it into the deepseek-harness source's `examples/` (the copy over there may
be stale), then operate from the deepseek-harness root:

```sh
# 1. Copy into the deepseek-harness source (this repo is the source of truth)
cp -r examples/tea-shop-demo ../deepseek-harness/examples/tea-shop-demo

# 2a. Run the tests
cd ../deepseek-harness
pnpm exec vitest run examples/tea-shop-demo/tests/tea-shop-demo.spec.ts

# 2b. Or mount it into the web UI (temporary, via the patch layer)
pnpm dsh web --patch examples/tea-shop-demo/tea-shop.patch.yml
```

> Note: events plugins have **no visible UI** — mounted in web they show
> nothing by themselves. The meaningful verification for this example is the
> test suite. The patch file exists so the demo shop can be activated on a
> running instance if you want it.
>
> Note: an entry's `name` in a patch resolves against the **profile directory**
> (`~/.dsh/profiles/web/`), not against this file. `tea-shop.patch.yml` uses a
> relative path plus a junction under the profile directory; create the
> junction once before first use (Windows, no admin rights):
>
> ```sh
> cmd //c "mklink /J %USERPROFILE%\.dsh\profiles\web\examples <deepseek-harness>\examples"
> ```

## Design

Events-demo taught the *listen* half against real harness events. This example
teaches the *declare and emit* half: a service owns its event namespace, the
`@mode` annotation on every event is part of the contract, and the dispatcher
must call the matching ctx method. The shop's story keeps it obviously a
sample — nobody mistakes a milk-tea ordering demo for a real system.

The producer (`tea-shop`) declares six events covering all five modes:

| Event | Mode | Meaning |
|---|---|---|
| `order/start` | emit | order accepted (family start, paired with `ready` by orderId) |
| `order/ready` | emit | order served (family end) |
| `barista/pick` | serial | first registered barista wins the order |
| `shop/open` | bail | sync open check; first answer wins, none = closed |
| `notify/patrons` | parallel | fan-out to every waiting patron |
| `order/request` | waterfall | shop-rule interception: refuse or call `next()` |

The service methods dispatch them: `placeOrder(drink)` runs the `order/request`
waterfall (refuse when the shop-rule policy is closed), emits `order/start`,
picks a barista via `serial`, then emits `order/ready`; `announce(orderId)`
fans out `notify/patrons`; `isOpen()` bails on `shop/open`.

Two consumers show the consumption side on *our own* events:

- `order-watch` — `import type { OrderInfo } from './tea-shop.ts'` pulls the
  producer's `interface Events` merge into its compilation (type-only, no
  runtime import); it listens to the family and derives its own
  `orders/served` event.
- `shop-policy` — listens to the `order/request` waterfall and vetoes without
  calling `next()` when the shop is closed (`Config { closed }`), mirroring
  events-demo's decider role.

Rules that fall out of this split:

- **The event family carries an identity snapshot.** Every payload carries
  `orderId`; `order/start` and `order/ready` pair by it — the same discipline
  as the harness's own pairs (`command/run` ↔ `command/done`,
  `workflow/start` ↔ `workflow/agent-end`).
- **`@mode` is a contract, not an enforcement.** The annotation documents the
  mode; the actual behavior comes from which ctx method the dispatcher calls
  (`ctx.emit` / `ctx.serial` / `ctx.bail` / `ctx.parallel` / `ctx.waterfall`).
- **Consumers merge the declaration via type-only import.** `import type`
  from the producer brings the typed event names into scope across plugins,
  without a runtime dependency.
- **Every mode got a real semantic.** Unlike events-demo, `serial` (first
  barista), `bail` (open check), and `parallel` (patron fan-out) are declared
  and driven with real meaning, not test fixtures.

## How to develop

```
tea-shop-demo/
├── src/tea-shop.ts      # producer: TeaShopService declares + dispatches all six events
├── src/order-watch.ts   # consumer: listens the family, derives orders/served
├── src/shop-policy.ts   # consumer: order/request waterfall decider (Config { closed })
├── tests/tea-shop-demo.spec.ts # 12 cases, in-process, zero external deps
├── cordis.yml           # composition: producer + two consumers
└── tea-shop.patch.yml   # web overlay entry
```

> Relationship note: this directory is the complete source + test package for
> the self-declared-events practice; `notes/2026-08-22-tea-shop-demo.md`
> records the learning notes behind it. The proposal that shaped it lives in
> `docs/proposals/2026-08-22-tea-shop-demo.md`.

- `src/tea-shop.ts` — the `TeaShopService extends Service` (`super(ctx,
  'teaShop')`), the `declare module` block declaring all six events with
  `@mode`, and the three dispatch methods. `placeOrder` throws a structured
  `TeaShopError` (`code: 'refused'`) when the shop rule refuses.
- `src/order-watch.ts` — `name = 'tea-shop-order-watch'`,
  `inject = ['teaShop']`; type-only import for the merge; derives
  `orders/served` from `order/ready`.
- `src/shop-policy.ts` — `name = 'tea-shop-shop-policy'`, `inject =
  ['teaShop']`, a Schemastery `Config` (same-name export, the csv-query-tool
  pattern); vetoes `order/request` when closed.
- `tests/tea-shop-demo.spec.ts` — twelve cases: the family pairing and
  identity snapshots, waterfall refuse/delegate/default, serial first-wins and
  no-listener, bail fail-closed and first-answer, parallel await-all, the
  derived event, the `ctx.on` disposer, and Loader-safe exports.

Run the tests:

```sh
pnpm exec vitest run examples/tea-shop-demo/tests/tea-shop-demo.spec.ts
```

## How to ship

Same path as the other examples: this directory is a **teaching example**, not
an installable package. To distribute it, promote it to a standard bundle under
`packages/` following the
[packaging tutorial](../../docs/user/develop/basic/publish.md), then install
with `dsh plugin --profile <name> add <package>`.
