# tea-shop-demo example

English | [中文](README.zh.md)

In dsh, plugins never import each other. They couple through two mechanisms:
**services** ("I need your capability — give it to me") and **events** ("I
don't know who is listening — I just shout"). An event is fired with
`ctx.emit` and heard with `ctx.on`, and both sides are type-checked.

This example practices the **producer side of events**: how a plugin defines
its own typed events and emits them. The story is a milk-tea shop — order,
make, serve — deliberately toy-sized so it is obviously a teaching sample, not
a real system. It pairs with the
[events-demo](../events-demo/) example, which practiced the consumer side on
dsh's own real events; here the shop declares all six events itself and
dispatches them with all five distribution modes — including the three
(first-answer, fan-out, middleware) that real harness events almost never use.

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

> Note: events plugins have **no visible UI**. Mounted in web they show
> nothing by themselves, so the meaningful verification for this example is
> the test suite. The patch file exists in case you want the demo shop
> running on a live instance.
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

### Events have two halves

Listening is one half: someone shouts, you react (`ctx.on`). Declaring and
emitting is the other half: you decide what the shouts look like, and you fire
them. The events-demo example practiced listening against dsh's own events.
This example practices declaring and emitting, from scratch.

### A typed event is a compile-time contract

The shop declares its events by merging into Cordis's `Events` interface:

```ts
declare module '@deepseek-ai/cordis' {
  interface Events {
    'order/start'(order: OrderInfo): void
    'order/ready'(order: OrderInfo): void
    'barista/pick'(orderId: string): string | undefined | Promise<string | undefined>
    'shop/open'(): boolean | undefined
    'notify/patrons'(orderId: string): void | Promise<void>
    'order/request'(order: OrderRequest, next: () => Promise<OrderDecision>): Promise<OrderDecision>
  }
}
```

"Typed" means the event name, its arguments, and its return value are checked
at compile time across the whole project — `ctx.emit` and `ctx.on` both know
the exact shape. Each event also carries an `@mode` annotation, which says how
listeners will be invoked. That annotation is part of the contract, and the
dispatcher must call the matching ctx method (`ctx.emit`, `ctx.serial`,
`ctx.bail`, `ctx.parallel`, `ctx.waterfall`).

### An event family pairs start with end

An event family describes the stages of one thing, linked by a stable id.
Here `order/start` and `order/ready` both carry the same `orderId` — the
identity snapshot — so a listener can pair them. This is the same discipline
the harness itself uses (`command/run` ↔ `command/done`, `workflow/start` ↔
`workflow/agent-end`): a start without its end, or an end without its id,
leaves listeners guessing.

### Five distribution modes, each with a real job

An event's mode decides how its listeners run. The shop's six events cover all
five modes, and each mode is chosen to fit its business meaning:

| Event | Mode | What happens | Why this mode |
|---|---|---|---|
| `order/start` / `order/ready` | emit | broadcast, no waiting | the family announces its stages; nobody's answer matters |
| `barista/pick` | serial | listeners run in order until one returns a value | first free barista takes the order — ask until someone says yes |
| `shop/open` | bail | synchronous version of serial | a quick "are you open" check at the door |
| `notify/patrons` | parallel | all listeners run concurrently, wait for all | a broadcast announcement — everyone must be told |
| `order/request` | waterfall | listeners wrap a `next()` chain; not calling `next()` vetoes | the shop rule sits at the entrance: accept or refuse |

The service methods drive them: `placeOrder(drink)` runs the `order/request`
waterfall (a closed shop refuses), then emits `order/start`, picks a barista
via `serial`, and finishes with `order/ready`; `announce(orderId)` fans out
`notify/patrons`; `isOpen()` bails on `shop/open`.

### The consumers

Two consumer plugins show the listening side on these self-declared events:

- `order-watch` imports only the types — `import type { OrderInfo } from
  './tea-shop.ts'` — which pulls the event declarations into its compilation
  with no runtime dependency. It listens to the family and derives its own
  `orders/served` event.
- `shop-policy` listens to the `order/request` waterfall and refuses without
  calling `next()` when the shop is closed (`Config { closed }`), mirroring
  the decider role from events-demo.

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
> records the learning notes behind it, and the proposal that shaped it lives
> in `docs/proposals/2026-08-22-tea-shop-demo.md`.

- `src/tea-shop.ts` — `TeaShopService extends Service` (its constructor
  registers it as `ctx.teaShop`), the `declare module` block declaring all six
  events with `@mode`, and the three dispatch methods. `placeOrder` throws a
  structured `TeaShopError` (`code: 'refused'`) when the shop rule refuses.
- `src/order-watch.ts` — `name = 'tea-shop-order-watch'`,
  `inject = ['teaShop']`; the type-only import for the merge; derives
  `orders/served` from `order/ready`.
- `src/shop-policy.ts` — `name = 'tea-shop-shop-policy'`, `inject =
  ['teaShop']`, a Schemastery `Config` (same-name export, the csv-query-tool
  pattern); vetoes `order/request` when closed.
- `tests/tea-shop-demo.spec.ts` — twelve cases: family pairing and identity
  snapshots, waterfall refuse / delegate / default, serial first-wins and
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
