# Trading Hall

A cryptocurrency trading hall built with Next.js and TypeScript. It renders
public spot market data: candlestick chart, order book, and recent trades.

The data source is treated as a swappable **Market Data Provider**. No
exchange name appears in any route, component, type, service, hook, or
directory name, so replacing the upstream means rewriting the provider's
endpoint catalogue and adapters and nothing else.

## Status

Phases 1 to 3 are complete: the chart streams live bars, the order book tracks
the live feed from a REST snapshot, and the trade tape fills from recent history
and keeps up with the print feed. What remains is integration.

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Routing, market data layer, REST + WebSocket clients, adapters | Complete |
| 1 | Candlestick chart | Complete |
| 2 | Order book | Complete |
| 3 | Recent trades | Complete |
| 4 | Integration | Not started |

## Getting started

```bash
npm install
npm run dev
```

Then open:

- <http://localhost:3000/zh-CN/trade/BTC-USDT>
- <http://localhost:3000/en/trade/BTC-USDT>

No API key is needed. All data is public. See `.env.example` for the optional
configuration.

## Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

## Architecture

Data flows in one direction, and each layer only knows the one below it:

```
/[locale]/trade/[symbol]
        |
   TradingHall                 (components)
        |
   hooks                       (history, live bars, pair metadata)
        |
   MarketDataProvider          (single entry point)
        |
   ┌────┴─────────────┐
 client.ts         websocket.ts       REST facade     connection manager
   |
 trading.ts                          one function per endpoint
   |
 http/service.ts                     get / post / del — the only fetch caller
   |
 adapters/                            raw upstream -> internal model
   |
 Public Market API
```

The WebSocket path leaves this stack after `client.ts`: it takes its token
from there, then opens the socket browser-direct.

```
src/
├── app/
│   ├── [locale]/
│   │   ├── layout.tsx                 root layout: <html lang>, i18n provider
│   │   ├── page.tsx                   /{locale} -> default pair
│   │   └── trade/[symbol]/page.tsx    the trading hall route
│   └── api/market/[...path]/route.ts  same-origin REST proxy
├── components/
│   ├── common/LanguageSwitcher.tsx
│   └── trading/                       hall shell and module frames
│       ├── Chart/                     candlestick chart, intervals, attribution
│       ├── OrderBook/                 the price ladder
│       ├── RecentTrades/              the trade tape
│       ├── failure.ts                 shared wording for a failed module
│       ├── PanelNotice.tsx            shared non-blocking overlay
│       └── Placeholder/               modules not yet built
├── hooks/                             provider -> React
├── config/market.ts                   UI-level defaults
├── config/chart.ts                    chart palette and layout
├── config/api.ts                      API bases, timeout, path prefixes
├── i18n/                              locale registry and dictionaries
├── lib/
│   ├── http/service.ts                get / post / del, the only fetch caller
│   ├── market-data/                   the provider abstraction
│   │   ├── types.ts                   internal model used by the UI
│   │   ├── trading.ts                 one function per upstream endpoint
│   │   ├── client.ts                  configured facade over trading.ts
│   │   ├── websocket.ts               connection and subscription manager
│   │   ├── provider.ts                composition root
│   │   ├── endpoints.ts               every upstream-specific path and topic
│   │   ├── protocol.ts                WebSocket envelope codec
│   │   ├── orderBook.ts               local book mirror and sequence handling
│   │   ├── tradeTape.ts               the tape's record cap and de-duplication
│   │   ├── errors.ts                  normalised error codes
│   │   ├── symbol.ts                  symbol parsing and precision
│   │   └── adapters/                  raw payload shapes and translation
│   ├── ws/                            generic, protocol-agnostic transport
│   └── utils/parse.ts                 defensive parsing and time conversion
└── proxy.ts                           locale routing
```

### Why the layers are separated

The UI only ever handles the types in `lib/market-data/types.ts`. Raw payload
shapes live in `adapters/raw.ts` and are translated by
`adapters/marketDataAdapter.ts`, so upstream field order and unit conventions
never leak upward.

Time is normalised at the adapter boundary and each field documents its unit:
candles carry Unix **seconds** (the charting convention) while books and trades
carry Unix **milliseconds**.

### The request layer

Three files, each with one job:

| File | Owns |
| --- | --- |
| `lib/http/service.ts` | `get` / `post` / `del`, deadlines, cancellation, JSON, status codes |
| `lib/market-data/trading.ts` | one function per endpoint, envelope validation, adapters |
| `lib/market-data/client.ts` | transport configuration, and the seam where `fetch` is injected |

`service.ts` is the only module that calls `fetch`, and it knows nothing about
market data — it returns parsed JSON and throws `HttpError`. Which endpoint to
call, and what the payload means, belongs to `trading.ts`. That split is what
keeps transport failures ("the server answered 502") distinct from domain
failures ("that pair is not tradable") all the way up to the UI's message.

Everything upstream-specific lives in `endpoints.ts` (paths and topics),
`trading.ts` (which paths this application calls) and `adapters/` (payload
shapes). Replacing the data source means rewriting those three.

### Pair metadata

Prices and sizes are displayed at the precision the pair quotes, so the symbol
list — the only source of those increments — is fetched once per session and
shared by every panel that needs it.

That request runs under the provider's own abort controller rather than the
first caller's, and the distinction is not cosmetic. The result is cached and
reused, so a caller's abort must stop only that caller from waiting; it must
never reach the request itself. Binding the request to a component's signal
meant whichever panel mounted first could cancel metadata the other two were
still waiting for, and because a rejection clears the cache, nothing retried:
every panel silently fell back to a default precision for the rest of the
page's life. At four decimals a real `0.00001123` print renders as `0.0000`,
which is a trade shown as nothing at all.

### Development and production

`config/api.ts` resolves two bases, and the application code is identical in
both environments:

- **`MARKET_API_BASE_URL`** — the upstream origin, used server-side by the proxy
  route. In development the local HTTP proxy reaches it; in production the
  server reaches it directly.
- **`NEXT_PUBLIC_MARKET_API_BASE_URL`** — overrides the base the *browser*
  uses. Leave it empty, which is the supported configuration.

Leaving it empty matters: the public REST API sends no CORS headers (verified —
no `access-control-allow-origin` on either the request or the preflight), so a
browser calling the upstream origin directly is blocked before the request is
sent. The browser therefore always talks to the same-origin proxy, in
development and production alike. Setting that variable is only correct if the
origin serves CORS headers.

### One socket per tab

`MarketDataWebSocket` owns the only public WebSocket connection. Components
subscribe through it, and the upstream subscription for a topic is released
only when its last consumer detaches. Reconnection uses exponential backoff
capped at 30s, and every local subscription is re-armed automatically after a
reconnect.

Subscription state is held locally and re-asserted whenever a socket opens, so
control frames are never queued while offline: a queued subscribe would be sent
twice, and a queued unsubscribe would replay an intent that is already stale.

A handshake that has not completed within ten seconds is abandoned and retried.
A gateway can accept the connection and then never finish the upgrade, which
produces no error and no close — without that deadline the client would wait on
it forever, showing nothing to the user and never trying another gateway.

The endpoint is not hardcoded. Before each connection attempt the manager
requests a short-lived public token, takes the gateway list it advertises, and
follows the heartbeat intervals that gateway specifies. Gateways are rotated
between attempts, since the upstream may drop connections for load balancing.

### The REST proxy

The public REST API sends no CORS headers, so a browser cannot call it
directly. `app/api/market/[...path]/route.ts` forwards a whitelisted set of
paths to the upstream from the server. It refuses unlisted paths, refuses
methods a path does not declare, never forwards a request body, and attaches no
credentials. WebSocket traffic does not need the proxy and connects directly.

## Internationalization

Locales are declared once in `src/i18n/config.ts`. Adding a language means
adding it to `LOCALES` and dropping a matching JSON file beside the others.

`en.json` is typed against `zh-CN.json`, so a key present in one language and
missing in the other is a build error. Components never branch on a locale
string; they call `t('trade.orderBook')`.

Requests without a locale prefix are redirected to one chosen from the
`Accept-Language` header.

## Notes

- `socket.ts` in the project root is the original socket wrapper supplied as
  reference input. Its transport logic was adapted into
  `src/lib/ws/UnifiedWSClient.ts`, which is the copy the application uses. The
  root file is excluded from lint and typecheck and is not imported anywhere.

## The chart

Charts use [Lightweight Charts](https://github.com/tradingview/lightweight-charts)
by TradingView, rendered from our own market data.

**The chart is not a React component in the usual sense.** History arrives once
over REST and goes in with `setData`; every bar after that goes in with
`update`. Live bars are handed to the chart through a callback ref rather than
React state, so a tick repaints the canvas without re-rendering the tree. That
split is the reason a pair pushing a bar a second stays cheap.

Bars are never re-set wholesale on a tick: besides being wasteful, it would
reset the reader's zoom on every price change. For the same reason a refresh
after a reconnect restores the visible range instead of re-fitting the view.

A bar older than the newest one on the series is dropped rather than applied.
Late frames survive a pair or interval switch, and the charting library throws
if asked to update backwards.

Prices and sizes are formatted at the precision the pair quotes, taken from the
pair's own increments. A fixed number of decimals would be wrong for most
pairs, so nothing here hardcodes one.

Volume is drawn in its own pane beneath the price, tinted by the direction of
its bar, so it reads as an underlay rather than a second competing signal.

### Attribution

The charting library's licence requires its attribution notice and a link to
its vendor on a user-visible page. The chart renders the vendor's logo, which
satisfies the link, and the notice appears under the chart. The vendor here is
the chart renderer, not the data source — naming it does not conflict with the
rule that no exchange is named anywhere in the application.

## The order book

The displayed book is not the upstream's book. It is one REST snapshot, then
kept current by the incremental feed — the only way to show a live book without
re-downloading it continuously, and the reason the snapshot is requested at
display depth rather than in full.

`lib/market-data/orderBook.ts` holds the mirror. It sits deliberately outside
React: the feed delivers hundreds of updates a second, and each one mutates a
`Map` and nothing else. The component tree is told about the result on a
150 ms timer, which is the only path from market rate into React state.

### Sequence handling

Every increment carries the sequence range it covers, and the mirror applies it
only if that range begins exactly one past what it already holds. A frame
wholly behind the mirror is dropped as a duplicate; a frame that starts beyond
the next expected sequence means updates were missed, and the mirror is
rebuilt from a fresh snapshot rather than patched. A book with a hole in it
would show prices that were never tradable, which is worse than showing
nothing.

That contiguity rule was measured against the live feed before it was relied
on, not assumed: ~4,300 consecutive frames were checked and every one began
exactly one past the previous end, with no forward jumps and no overlaps.

The mirror subscribes *before* requesting the snapshot and holds any frames
that arrive meanwhile. The snapshot is generated in the past — it lags the live
tail — so without that buffer the first live increment would always look like a
gap and every load would begin with a spurious rebuild.

Rebuilds are bounded. If the feed keeps producing gaps, the panel stops
retrying and reports the failure instead of looping; a manual retry resets the
count. Reconnecting after a dropped socket also rebuilds, because the frames
missed while offline are unrecoverable.

### Display

Levels are ordered at the source — bids descending, asks ascending — so the
ask column is reversed for display and the best ask lands against the spread,
where the ladder is read from. Prices and sizes are formatted at the pair's own
quoted precision; nothing here hardcodes a number of decimals.

Twenty levels per side are requested and rendered. A short panel shows the
levels nearest the spread and clips the far end of each side; the two rows
against the spread are never clipped.

Prices are keyed as strings, so `86092.70` and `86092.7` cannot become two
levels. Sizes of zero retire a level, and a negative size is refused rather
than rendered. A `prune` step caps each side at a thousand levels as a guard
against a pathological stream; the feed is depth-scoped, so in practice it
never fires.

When the feed drops, the ladder is dimmed and keeps its last levels with a
notice over them, rather than emptying — stale levels the user can see are more
useful than a blank panel, and the notice says which they are.

### Depth

Each row carries its **cumulative size** — the running total from the spread
outward, so the row against the spread shows its own size and the far row shows
the depth of the whole side — and a tint drawn against the largest level on the
same side. The tint is a share of that single largest level, not of the side;
it is there to make the shape of the book readable at a glance, while the size
and total columns stay the figures the eye actually reads.

That the column is a running sum is worth knowing when reading the rest of this
file: a change at the best price moves every total behind it, so the rows now
miss their memo bail-out far more often than they did before the column existed.
At forty rows on a 150 ms cadence it is not worth more machinery, but the
memoisation is no longer buying what it used to.

The foot of the panel splits the resting size of the two sides. Both sides are
summed over **every** level the panel holds rather than the five or so it has
room to paint, so the split is a property of the book and not of the clip. The
distinction is not academic: measured on the live pair the two answers were 25%
and 73% at the same instant.

**Where the tint reads badly, and why it is left that way.** The level nearest
the spread is routinely a hundred times smaller than the largest level on its
side, and the largest is usually well outside the five rows that fit. Measured
on BTC-USDT, every *visible* ask tint fell between 1% and 3% — effectively a
blank column — while the bids, where the largest level often sits at the touch,
came out at 73%, 12%, 3%, 4% and 5%.

That behaviour follows directly from drawing against the largest level, and it
was kept after being measured, not overlooked. A square-root scale would pull
the ask side back into view and a denominator taken from the levels near the
spread would fill it, but both make the bar stop meaning "this row's share of
the side's largest level" — and a thin ask ladder at the touch is what the book
actually looks like. If the tint is ever wanted as a pure shape rather than as a
share, the scale is the thing to change, and this paragraph is the record of
what the current one does.

### Spread and depth are derived, not fetched

`spreadOf`, `cumulativeSizes`, `largestSize` and `depthOf` are pure functions of
the levels, and they are computed once per publish alongside them rather than in
the component. They follow the same rule as the mirror: they depend on nothing
but `./types`, so they can be exercised without React, without a socket, and
without a browser.

## The trade tape

Recent history fills the tape over REST and the print feed keeps it current.
The order is the opposite of the book's, for the opposite reason: the book
subscribes first because a frame that arrives before the snapshot is a
duplicate to be recognised, while the tape subscribes first because a print made
during the round trip is a *print* — if the snapshot were requested first, it
would be lost for good. That ordering makes overlap between the two sources
normal, and the overlap is exactly what the de-duplication is for.

`lib/market-data/tradeTape.ts` holds the policy, outside React like the book
mirror. Prints are kept newest first, bounded at 100 records, and de-duplicated
by id. When the tape trims, the id set is rebuilt from what survived, so a print
pushed off the tail can be accepted again later instead of being remembered
forever — an unbounded id set would slowly refuse prints that are no longer
displayed. The sort is stable, so prints sharing a millisecond — normal at busy
moments, several per millisecond — keep the order they arrived in rather than
swapping places between updates.

This stream is deliberately *not* throttled, unlike the book. The spec's
prescribed mitigation here is the record cap rather than a cadence, prints
arrive at a human pace (~0.4/s measured against the live pair), and React
already batches updates landing in the same tick.

The taker side is carried by colour rather than by a fourth column, and times
are rendered through a locale-aware formatter built once per locale — a fresh
formatter per render would invalidate every memoised row.

A reconnect leaves a hole: prints made while the socket was down were never
delivered and cannot be replayed. Rather than pretending otherwise, the tape is
dimmed and said to be frozen, and the recent history is refetched to fill the
gap once the feed is back.
