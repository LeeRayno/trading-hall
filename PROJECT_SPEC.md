# Crypto Trading Hall Implementation Specification

## 1. 项目目标

使用 **Next.js + TypeScript** 实现一个加密货币交易大厅（Trading Hall）。

第一阶段只实现交易大厅的三个核心公共行情模块：

1. K 线（Candlestick）
2. 订单簿（Order Book）
3. 最新成交（Recent Trades）

数据源使用一个**外部交易所的公开、无需 API Key 的 Spot Market Data API/WebSocket**。

> Implementation note:
> 当前阶段实际使用 KuCoin Public Spot API 作为数据源。
> 但是：
>
> * 项目目录中不要出现交易所品牌名称
> * React Component 名称不要出现交易所品牌名称
> * TypeScript type 不要出现交易所品牌名称
> * service 名称不要出现交易所品牌名称
> * hooks 名称不要出现交易所品牌名称
> * comments 中不要出现交易所品牌名称
> * README 中不要把项目描述成“某交易所客户端”
>
> 数据源应该被抽象成通用的 Market Data Provider，后续可以替换成其他交易所。

---

# 2. 技术栈

必须使用：

* Next.js
* TypeScript
* React
* App Router
* `lightweight-charts`
* WebSocket
* REST API
* i18n 路由

推荐：

* Next.js 最新稳定版本
* TypeScript strict mode
* ESLint
* CSS Modules / Tailwind CSS，根据现有项目基础决定
* React hooks
* `useMemo`
* `useEffect`
* `useRef`

K 线使用：

```bash
npm install lightweight-charts
```

使用 TradingView 官方开源的 Lightweight Charts。

官方文档：

[Lightweight Charts Documentation](https://tradingview.github.io/lightweight-charts/?utm_source=chatgpt.com)

Lightweight Charts 是客户端图表库，负责图表渲染，不负责获取行情数据，因此行情数据必须由项目自己的 Data Provider 提供。

必须注意其 License 要求，公开页面需要保留 TradingView attribution notice 和 TradingView 链接。

---

# 3. 当前阶段明确不实现的功能

以下模块本阶段只保留 UI 占位，不实现真实业务：

* 下单
* 买入/卖出
* 仓位
* 当前订单
* 历史订单
* 账户资产
* 杠杆
* 保证金
* 止盈止损
* 钱包
* 用户登录
* API Key
* Private WebSocket
* Private REST API

例如页面可以预留：

```text
┌─────────────────────────────────────────────┐
│ Position                                    │
│                                             │
│ Coming Soon                                 │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Open Orders                                 │
│                                             │
│ Coming Soon                                 │
└─────────────────────────────────────────────┘
```

这些模块目前**不要接任何私有 API**。

---

# 4. 页面 URL 设计

必须使用多语言动态路由。

第一阶段支持：

```text
/zh-CN/trade/{symbol}
/en/trade/{symbol}
```

例如：

```text
/zh-CN/trade/BTC-USDT
/en/trade/BTC-USDT
```

后续要能够比较容易扩展：

```text
/ja/trade/BTC-USDT
/ko/trade/BTC-USDT
/zh-TW/trade/BTC-USDT
```

所以不要把语言逻辑写死成：

```typescript
if (pathname.startsWith('/zh-CN'))
```

而应该使用：

```text
/[locale]/trade/[symbol]
```

或等价的 Next.js App Router 动态路由结构。

推荐：

```text
app/
└── [locale]/
    └── trade/
        └── [symbol]/
            └── page.tsx
```

---

# 5. Symbol 规则

URL 中使用：

```text
BTC-USDT
ETH-USDT
SOL-USDT
```

这种 Spot Trading Pair。

例如：

```text
/zh-CN/trade/BTC-USDT
```

内部统一：

```typescript
type Symbol = string;
```

但是必须对 symbol 做基本校验，避免非法 symbol 导致请求异常。

---

# 6. 国际化

第一阶段只支持：

```text
zh-CN
en
```

建议结构：

```text
i18n/
├── zh-CN.json
└── en.json
```

至少包含：

```json
{
  "trade": {
    "chart": "K线",
    "orderBook": "订单簿",
    "recentTrades": "最新成交",
    "position": "仓位",
    "openOrders": "当前订单",
    "orders": "订单",
    "bids": "买盘",
    "asks": "卖盘",
    "price": "价格",
    "size": "数量",
    "time": "时间",
    "comingSoon": "即将推出"
  }
}
```

英文：

```json
{
  "trade": {
    "chart": "Chart",
    "orderBook": "Order Book",
    "recentTrades": "Recent Trades",
    "position": "Position",
    "openOrders": "Open Orders",
    "orders": "Orders",
    "bids": "Bids",
    "asks": "Asks",
    "price": "Price",
    "size": "Size",
    "time": "Time",
    "comingSoon": "Coming Soon"
  }
}
```

组件内部不要直接写：

```tsx
<h2>订单簿</h2>
```

应该：

```tsx
<h2>{t('trade.orderBook')}</h2>
```

---

# 7. 数据源架构原则

不要让 UI 组件直接调用外部 API。

错误：

```text
OrderBook
    ↓
fetch(...)
    ↓
External API
```

正确：

```text
                    ┌─────────────────┐
                    │ Trading Hall UI │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Market Data API │
                    │     Layer       │
                    └────────┬────────┘
                             │
             ┌───────────────┴────────────────┐
             │                                │
      ┌──────▼──────┐                  ┌──────▼──────┐
      │ REST Client │                  │ WS Client   │
      └──────┬──────┘                  └──────┬──────┘
             │                                │
             └──────────────┬─────────────────┘
                            │
                    External Public API
```

UI 只能依赖内部统一的数据类型。

---

# 8. 推荐项目目录

可以根据现有项目适当调整，但必须保持职责分离。

推荐：

```text
src/
├── app/
│   └── [locale]/
│       └── trade/
│           └── [symbol]/
│               └── page.tsx
│
├── components/
│   └── trading/
│       ├── TradingHall.tsx
│       ├── Chart/
│       │   ├── TradingChart.tsx
│       │   └── TimeframeSelector.tsx
│       │
│       ├── OrderBook/
│       │   └── OrderBook.tsx
│       │
│       ├── RecentTrades/
│       │   └── RecentTrades.tsx
│       │
│       └── Placeholder/
│           ├── Position.tsx
│           └── Orders.tsx
│
├── hooks/
│   ├── useMarketKlines.ts
│   ├── useOrderBook.ts
│   └── useRecentTrades.ts
│
├── lib/
│   ├── market-data/
│   │   ├── client.ts
│   │   ├── websocket.ts
│   │   ├── types.ts
│   │   ├── adapters/
│   │   │   └── marketDataAdapter.ts
│   │   └── endpoints.ts
│   │
│   └── utils/
│
├── i18n/
│   ├── zh-CN.json
│   └── en.json
│
└── styles/
```

注意：

`market-data` 是业务抽象层。

不要创建：

```text
kucoin/
kucoin-api/
kucoin-websocket/
kucoin-client/
kucoin-adapter/
```

等明显暴露具体数据源名称的目录。

---

# 9. 第一阶段：先实现数据源 API 清单

在真正开发三个 UI 模块之前，**必须先把 REST 和 WebSocket 数据接口封装完成**。

这一阶段不要求完成交易大厅 UI。

需要建立：

```text
Market Data Provider
```

统一抽象。

---

# 10. WebSocket 建连机制

Public WebSocket 不应该把固定 WebSocket URL 硬编码为唯一连接地址。

首先调用 Public Token：

```http
POST https://api.kucoin.com/api/v1/bullet-public
```

该接口返回：

```text
token
instanceServers
```

其中 `instanceServers` 会提供 WebSocket endpoint、pingInterval、pingTimeout 等连接参数。

所以推荐：

```text
POST Public Token
        ↓
获取 token
        ↓
获取 instanceServers
        ↓
建立 WebSocket
        ↓
subscribe
        ↓
receive messages
```

不要：

```typescript
new WebSocket('wss://xxx')
```

永久写死。

---

# 11. WebSocket 基础封装要求

你会提供一份现有的 Socket 基础封装代码。

Claude Code 必须：

1. 先阅读现有封装
2. 尽可能复用
3. 如果现有封装不能适配当前数据格式，可以修改
4. 不要无理由完全重写
5. 保留通用能力

至少支持：

```typescript
connect()
disconnect()
subscribe()
unsubscribe()
onMessage()
onError()
onOpen()
onClose()
```

还应该考虑：

```text
自动重连
心跳
连接状态
subscription 管理
symbol 切换
组件卸载自动 unsubscribe
```

---

# 12. WebSocket 心跳

服务端返回：

```text
pingInterval
pingTimeout
```

客户端应该根据服务端返回值维护心跳。

不能简单写死：

```typescript
setInterval(..., 18000)
```

应该使用 bootstrap 返回的配置。

KuCoin 当前公共 WebSocket 文档说明，服务器可能因为自动负载均衡主动断开 WebSocket，因此客户端必须具备重新建立连接的能力。

---

# 13. K线 WebSocket

Spot Kline topic：

```text
/market/candles:{symbol}_{type}
```

支持的周期包括：

```text
1min
3min
15min
30min
1hour
2hour
4hour
6hour
8hour
12hour
1day
1week
```

官方文档当前列出的 Kline WebSocket topic 和周期如上。

例如：

```text
/market/candles:BTC-USDT_1min
```

订阅消息：

```json
{
  "id": 1,
  "type": "subscribe",
  "topic": "/market/candles:BTC-USDT_1min",
  "response": true
}
```

Kline 数据：

```json
{
  "topic": "/market/candles:BTC-USDT_1hour",
  "type": "message",
  "subject": "trade.candles.update",
  "data": {
    "symbol": "BTC-USDT",
    "candles": [
      "1729839600",
      "67644.9",
      "67437.6",
      "67724.8",
      "67243.8",
      "44.88321441",
      "3027558.991928447"
    ]
  }
}
```

其中 candles 对应：

```text
[time, open, close, high, low, volume, amount]
```

官方文档示例采用该数据结构。

---

# 14. K线 HTTP 兜底接口

历史 K线使用：

```http
GET https://api.kucoin.com/api/v1/market/candles
```

参数：

```text
symbol
type
startAt
endAt
```

例如：

```text
GET /api/v1/market/candles
    ?symbol=BTC-USDT
    &type=1min
    &startAt=...
    &endAt=...
```

当前官方 Spot API 单次最多返回 1500 条 K线。

因此 K线初始化：

```text
HTTP REST
    ↓
获取历史 K线
    ↓
setData()
    ↓
WebSocket
    ↓
update()
```

而不是一开始只有 WebSocket。

---

# 15. K线 Timeframe Mapping

UI：

```text
1m
3m
15m
30m
1H
2H
4H
6H
8H
12H
1D
1W
```

内部转换：

```typescript
const timeframeMap = {
  '1m': '1min',
  '3m': '3min',
  '15m': '15min',
  '30m': '30min',
  '1H': '1hour',
  '2H': '2hour',
  '4H': '4hour',
  '6H': '6hour',
  '8H': '8hour',
  '12H': '12hour',
  '1D': '1day',
  '1W': '1week',
} as const;
```

UI 不允许直接依赖外部 API 的周期字符串。

---

# 16. 订单簿 WebSocket

Spot Order Book Incremental：

```text
/market/level2:{symbol}
```

例如：

```text
/market/level2:BTC-USDT
```

官方文档说明该频道提供订单簿增量数据，并包含 asks / bids 的价格、数量以及 sequence 信息。

订单簿不能简单地：

```text
收到一条 WebSocket
↓
直接替换整个 OrderBook
```

正确思路：

```text
REST Snapshot
      ↓
建立初始 OrderBook
      ↓
保存 sequence
      ↓
WebSocket incremental updates
      ↓
根据 sequence 应用变化
      ↓
维护本地 OrderBook
```

---

# 17. 订单簿 HTTP 兜底

优先使用部分订单簿：

```http
GET /api/v1/market/orderbook/level2_20
```

例如：

```text
GET https://api.kucoin.com/api/v1/market/orderbook/level2_20
    ?symbol=BTC-USDT
```

该接口返回聚合后的 bids / asks。

官方文档建议使用部分订单簿接口，因为响应更快、流量更低。

如果后续本地订单簿需要完整深度，可以使用：

```http
GET /api/v3/market/orderbook/level2
```

但当前第一版只需要实现交易大厅展示所需深度，不要无必要地请求完整订单簿。

---

# 18. 最新成交 WebSocket

Spot Trade WebSocket：

```text
/market/match:{symbol}
```

例如：

```text
/market/match:BTC-USDT
```

该频道实时推送撮合成交事件。官方文档的 Spot WebSocket 示例使用该 topic。

典型数据：

```json
{
  "topic": "/market/match:BTC-USDT",
  "type": "message",
  "subject": "trade.l3match",
  "data": {
    "makerOrderId": "...",
    "price": "67523",
    "sequence": "11067996711960577",
    "side": "buy",
    "size": "0.003",
    "symbol": "BTC-USDT",
    "takerOrderId": "...",
    "time": "1729843222921000000",
    "tradeId": "11067996711960577",
    "type": "match"
  }
}
```

第一版 UI 只需要：

```text
price
size
side
time
tradeId
```

不需要暴露 makerOrderId / takerOrderId。

---

# 19. 最新成交 HTTP 兜底

使用：

```http
GET https://api.kucoin.com/api/v1/market/histories
```

参数：

```text
symbol
```

例如：

```text
GET /api/v1/market/histories?symbol=BTC-USDT
```

该接口当前返回指定 Symbol 最近 100 笔公开成交记录。

初始化：

```text
HTTP
 ↓
Recent Trades initial data
 ↓
WebSocket
 ↓
prepend new trades
 ↓
限制最大展示数量
```

---

# 20. 统一数据类型

UI 不能直接使用外部 API 原始数据结构。

建立统一类型。

例如：

```typescript
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```

订单簿：

```typescript
export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  sequence: string | number;
  timestamp: number;
}
```

最新成交：

```typescript
export interface RecentTrade {
  id: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  timestamp: number;
}
```

这样 UI 完全不知道数据来自哪个交易所。

---

# 21. Adapter 层

建立：

```text
External API Raw Data
        ↓
Adapter
        ↓
Internal Market Data Model
        ↓
Hooks
        ↓
Components
```

例如：

```typescript
adaptCandle()
adaptOrderBookSnapshot()
adaptOrderBookIncrement()
adaptRecentTrade()
```

禁止：

```tsx
data.candles[1]
```

直接出现在 React Component 中。

---

# 22. K线组件要求

K线是第一个真正实现的 UI 模块。

使用：

```text
lightweight-charts
```

实现 Candlestick Chart。

必须支持：

* K线显示
* 十字光标
* 时间轴
* 价格轴
* 自动 Resize
* 深色交易大厅风格
* timeframe 切换
* WebSocket 实时更新
* REST 初始历史数据
* Symbol 动态切换

---

# 23. K线初始化流程

页面：

```text
/zh-CN/trade/BTC-USDT
```

初始化：

```text
1. 获取 symbol
2. 获取默认 timeframe = 1m
3. REST 获取历史 K线
4. 转换数据
5. 创建 Lightweight Chart
6. setData()
7. 建立 WebSocket
8. subscribe Kline
9. 收到新数据
10. update()
```

---

# 24. K线实时更新

不能每收到一个 WebSocket 数据就：

```typescript
setData(allData)
```

应该使用：

```typescript
series.update(candle)
```

如果 timestamp 相同：

```text
更新当前 K线
```

如果 timestamp 是新的：

```text
生成新的 K线
```

---

# 25. K线切换周期

用户点击：

```text
1m
15m
1H
4H
1D
```

必须：

```text
unsubscribe old timeframe
        ↓
clear / reset chart data
        ↓
REST 获取新 timeframe 历史数据
        ↓
setData()
        ↓
subscribe new timeframe
```

不能让旧 timeframe WebSocket 继续推送。

否则容易产生：

```text
memory leak
duplicate updates
wrong candle data
```

---

# 26. K线历史数据加载

第一版至少加载：

```text
500 ~ 1000 candles
```

具体数量可以根据接口限制和页面性能调整。

后续可以支持：

```text
用户向左拖动
        ↓
检测 visible range
        ↓
REST 加载更早数据
        ↓
prepend
```

但是：

**第一阶段不要求实现无限历史加载。**

如果实现，也必须在 K线模块内部完成，不影响其他模块。

---

# 27. Lightweight Charts 注意事项

当前官方文档版本为 5.x，使用当前 API，不要直接复制旧版 3.x / 4.x API 示例。

Lightweight Charts v5 是客户端库，因此不要在 Server Component 中直接创建 chart instance。

推荐：

```tsx
'use client';
```

然后：

```text
useEffect
  ↓
createChart
  ↓
createCandlestickSeries
```

组件卸载：

```text
chart.remove()
```

同时清理：

```text
WebSocket subscription
ResizeObserver
event listeners
```

---

# 28. 订单簿 UI

第二阶段实现。

推荐布局：

```text
┌───────────────────────────────┐
│ Order Book                    │
├───────────────────────────────┤
│ Price          Size           │
├───────────────────────────────┤
│ Ask                           │
│ 101.20         0.12           │
│ 101.10         0.53           │
│ 101.00         1.23           │
├───────────────────────────────┤
│ Spread                        │
├───────────────────────────────┤
│ Bid                           │
│ 100.90         0.82           │
│ 100.80         1.21           │
│ 100.70         3.12           │
└───────────────────────────────┘
```

具体视觉样式以用户提供的原型图为准。

---

# 29. 订单簿数据处理

必须维护本地状态：

```typescript
Map<price, size>
```

例如：

```typescript
bids = new Map<string, number>();
asks = new Map<string, number>();
```

收到增量：

```text
size > 0
    ↓
update level

size === 0
    ↓
delete level
```

然后：

```text
bids
↓
price descending

asks
↓
price ascending
```

最后只取 UI 需要的数量，例如：

```text
20 levels
```

不要每次 WebSocket 更新都产生大量无意义的 React state。

可以：

```text
WebSocket
 ↓
local order book structure
 ↓
throttled / batched UI update
 ↓
React
```

---

# 30. 订单簿 Sequence

这是订单簿最重要的稳定性要求之一。

必须处理：

```text
snapshot sequence
increment sequence
```

如果发现 sequence 不连续：

```text
sequence gap
       ↓
discard local state
       ↓
重新获取 REST snapshot
       ↓
重新订阅 / 恢复 incremental feed
```

不能继续使用已经可能失真的本地订单簿。

---

# 31. 最新成交 UI

第三阶段实现。

推荐：

```text
┌───────────────────────────────┐
│ Recent Trades                 │
├───────────────────────────────┤
│ Price       Size       Time   │
├───────────────────────────────┤
│ 100.20      0.12       12:32 │
│ 100.18      0.05       12:32 │
│ 100.15      0.42       12:31 │
│ 100.10      1.21       12:31 │
└───────────────────────────────┘
```

根据：

```text
side === buy
side === sell
```

显示不同颜色。

颜色以原型图为准。

---

# 32. 最新成交数据策略

初始化：

```text
REST Recent Trades
        ↓
sort by timestamp
        ↓
render
```

实时：

```text
WebSocket trade
        ↓
deduplicate by tradeId
        ↓
prepend
        ↓
limit N records
```

例如：

```typescript
const MAX_TRADES = 100;
```

避免数据无限增长。

---

# 33. WebSocket 公共数据统一管理

不要每个组件自己：

```typescript
new WebSocket()
```

例如：

```text
Chart
   └── new WebSocket ❌

OrderBook
   └── new WebSocket ❌

RecentTrades
   └── new WebSocket ❌
```

应该由统一的：

```text
MarketDataWebSocket
```

管理。

例如：

```text
MarketDataWebSocket
├── connect
├── subscribe
├── unsubscribe
├── reconnect
├── heartbeat
└── dispatch message
```

组件通过 hook 使用：

```text
useMarketKlines()
useOrderBook()
useRecentTrades()
```

---

# 34. Symbol 切换

必须支持：

```text
BTC-USDT
↓
ETH-USDT
```

发生时：

```text
old subscriptions
        ↓
unsubscribe
        ↓
clear old data
        ↓
new REST snapshot
        ↓
new WebSocket subscriptions
```

绝对不能出现：

```text
BTC-USDT data
+
ETH-USDT data
```

混在同一个组件状态中。

---

# 35. 错误处理

必须处理：

```text
REST request failed
WebSocket connection failed
WebSocket disconnected
subscription failed
invalid symbol
invalid response
sequence gap
empty response
malformed message
```

UI 至少显示：

```text
Loading...
```

```text
Connection lost
```

```text
Unable to load market data
```

但是不要把底层 API 原始错误直接显示给用户。

---

# 36. WebSocket 自动重连

基本策略：

```text
disconnect
   ↓
wait
   ↓
reconnect
   ↓
restore subscriptions
   ↓
REST refresh if necessary
```

建议 exponential backoff：

```text
1s
2s
4s
8s
16s
...
```

设置最大等待时间。

例如：

```text
30s
```

---

# 37. HTTP 兜底原则

REST 不是 WebSocket 的替代品，而是：

```text
initial snapshot
+
recovery
+
historical data
```

使用场景：

### K线

```text
REST = historical candles
WS = realtime candle
```

### Order Book

```text
REST = snapshot
WS = incremental update
REST = sequence gap recovery
```

### Recent Trades

```text
REST = initial 100 trades
WS = realtime trades
```

---

# 38. 性能要求

交易大厅属于高频实时数据 UI。

必须避免：

```text
每条 WS 消息
→
大量 React state 更新
→
整个 Trading Hall re-render
```

要求：

* React component 尽可能拆分
* 使用 memo
* 使用 useMemo
* 使用 useRef 保存非 UI 状态
* 高频数据尽量局部更新
* K线使用 chart API update
* OrderBook 控制更新频率
* RecentTrades 限制数据数量
* 不要频繁创建新的 WebSocket
* 不要频繁创建大量对象

---

# 39. Server Component / Client Component

页面结构可以：

```text
page.tsx
   ↓
TradingHall
   ↓
Client Components
```

真正需要实时数据的组件：

```text
TradingChart
OrderBook
RecentTrades
```

使用 Client Component。

不要在 Server Component 中操作：

```text
WebSocket
window
document
ResizeObserver
Lightweight Charts
```

---

# 40. 第一阶段任务：基础架构

Claude Code 第一步只做：

```text
1. 分析现有项目
2. 分析用户提供的原型图
3. 分析用户提供的 Socket 封装
4. 确认 Next.js 版本
5. 建立 i18n 路由
6. 建立 market-data abstraction
7. 建立 REST client
8. 建立 WebSocket client
9. 实现 Public Token 获取
10. 实现统一数据类型
11. 实现 API adapters
12. 完成 lint/typecheck/build
```

**不要开始实现 K线 UI。**

完成后停止。

输出：

```text
Phase 0 completed.
Waiting for acceptance.
```

等待用户验收。

---

# 41. Phase 1：K线

只有用户确认 Phase 0 后才能开始。

实现：

```text
Kline REST
+
Kline WebSocket
+
Lightweight Charts
+
Timeframe selector
+
i18n
+
symbol route
```

只实现 K线。

不要实现：

```text
OrderBook
RecentTrades
```

完成后停止。

输出：

```text
Phase 1 completed.
Kline module is ready for acceptance.
```

等待用户验收。

---

# 42. K线验收标准

用户验收至少检查：

### 页面

```text
/zh-CN/trade/BTC-USDT
/en/trade/BTC-USDT
```

都可以打开。

### 数据

必须看到真实市场数据：

```text
Kline
```

而不是 mock data。

### 时间周期

至少验证：

```text
1m
15m
1H
4H
1D
```

切换正常。

### 实时

等待几秒：

```text
当前 K线应该实时变化
```

### Symbol

测试：

```text
BTC-USDT
ETH-USDT
SOL-USDT
```

### 刷新

浏览器刷新：

```text
数据重新正常加载
```

### WebSocket

断开/恢复网络：

```text
能够自动恢复
```

### Console

不能存在：

```text
React error
WebSocket error
Unhandled promise rejection
```

---

# 43. Phase 2：订单簿

只有 K线验收通过后才能开始。

实现：

```text
REST snapshot
+
WebSocket incremental
+
sequence handling
+
recovery
+
OrderBook UI
```

完成后停止。

输出：

```text
Phase 2 completed.
Order Book module is ready for acceptance.
```

---

# 44. 订单簿验收标准

验证：

```text
Bids
Asks
```

数据持续变化。

测试：

```text
BTC-USDT
ETH-USDT
```

观察：

```text
价格排序
数量变化
实时更新
```

网络断开后：

```text
自动恢复
```

模拟 sequence gap：

```text
重新 snapshot
```

不能出现：

```text
价格乱序
负数量
重复数据
明显过期数据
```

---

# 45. Phase 3：最新成交

只有订单簿验收通过后才能开始。

实现：

```text
REST recent trades
+
WebSocket realtime trades
+
deduplication
+
max record limit
+
Recent Trades UI
```

完成后停止。

输出：

```text
Phase 3 completed.
Recent Trades module is ready for acceptance.
```

---

# 46. 最新成交验收标准

检查：

```text
Price
Size
Time
Side
```

实时成交持续进入列表。

必须：

```text
最新成交在顶部
```

数据不能无限增长。

例如：

```text
最多 100 条
```

重复 tradeId 不允许重复显示。

切换：

```text
BTC-USDT
ETH-USDT
```

正常。

---

# 47. Phase 4：三个模块整合

只有前三阶段全部验收通过后才开始。

最终：

```text
Trading Hall
│
├── Chart
│   ├── Kline
│   └── Timeframe
│
├── Order Book
│   ├── Asks
│   ├── Spread
│   └── Bids
│
├── Recent Trades
│
├── Position
│   └── Placeholder
│
└── Orders
    └── Placeholder
```

---

# 48. 最终页面结构

根据用户提供的原型图调整。

基础逻辑：

```text
┌───────────────────────────────────────────────────────────┐
│ Trading Pair / Header                                     │
├───────────────────────────────────┬───────────────────────┤
│                                   │                       │
│                                   │     Order Book        │
│                                   │                       │
│          Kline Chart              ├───────────────────────┤
│                                   │                       │
│                                   │    Recent Trades      │
│                                   │                       │
├───────────────────────────────────┴───────────────────────┤
│                                                           │
│ Position / Orders / Other Placeholder Modules             │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

实际布局必须优先遵循用户提供的原型图。

---

# 49. Mock Data 禁止规则

正式功能不能使用：

```text
Math.random()
fake candles
mock order book
mock trades
```

作为最终展示数据。

开发阶段可以临时 mock，但模块验收前必须切换到真实 Public Market Data。

---

# 50. 数据源隔离

这是项目非常重要的要求。

不要让未来的代码变成：

```text
Component
 ↓
Specific Exchange API
```

必须：

```text
Component
 ↓
Hook
 ↓
Market Data Provider
 ↓
Adapter
 ↓
External API
```

以后如果更换数据源，只需要替换：

```text
Provider / Adapter
```

而不是重写：

```text
Chart
OrderBook
RecentTrades
```

---

# 51. 代码命名要求

推荐：

```text
MarketDataClient
MarketDataWebSocket
MarketDataProvider
KlineService
OrderBookService
RecentTradesService
```

不要：

```text
SpecificExchangeClient
SpecificExchangeWebSocket
SpecificExchangeKlineService
```

具体数据源名称不要进入项目核心代码结构。

---

# 52. 环境变量

如果当前 Public API 不需要 API Key，则：

**不要要求用户配置 API Key。**

如有必要：

```env
NEXT_PUBLIC_MARKET_API_BASE_URL=
```

但是不要把具体品牌名写进变量名。

例如不要：

```env
NEXT_PUBLIC_KUCOIN_API_URL=
```

应该：

```env
NEXT_PUBLIC_MARKET_API_BASE_URL=
```

---

# 53. 安全要求

当前项目全部使用 Public Market Data。

禁止：

```text
Private API Key
Secret
Passphrase
Trading API
Withdrawal API
```

进入前端代码。

即使未来需要 private API，也应该通过 server-side API route / backend proxy 处理，而不是：

```text
NEXT_PUBLIC_API_SECRET
```

---

# 54. 日志要求

开发阶段可以：

```text
[MarketData]
[WebSocket]
[Kline]
[OrderBook]
[RecentTrades]
```

生产环境减少日志。

禁止把完整 WebSocket message 无限打印：

```typescript
console.log(message)
```

尤其是高频数据。

---

# 55. TypeScript 要求

开启：

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

禁止大量：

```typescript
any
```

特别是：

```typescript
message: any
response: any
data: any
```

WebSocket response 必须有类型定义。

---

# 56. 代码质量

每完成一个 Phase 必须运行：

```bash
npm run lint
npm run build
```

如果项目有：

```bash
npm run typecheck
```

也必须执行。

不能：

```text
功能看起来正常
但 build 有 error
```

然后交付。

---

# 57. 浏览器兼容

至少确保现代：

```text
Chrome
Safari
Edge
Firefox
```

正常运行。

尤其注意：

```text
WebSocket
ResizeObserver
Canvas
Lightweight Charts
```

---

# 58. React 生命周期

特别注意：

React Strict Mode 下开发环境 Effect 可能执行额外的 setup/cleanup。

因此不能写成：

```typescript
useEffect(() => {
  connect();
}, []);
```

然后完全不处理：

```text
cleanup
duplicate connection
duplicate subscription
```

必须：

```text
effect
 ↓
connect / subscribe
 ↓
cleanup
 ↓
disconnect / unsubscribe
```

保证开发环境不会产生多个重复 WebSocket subscription。

---

# 59. Symbol / Timeframe Effect

例如：

```typescript
useEffect(() => {
  // subscribe
  return () => {
    // unsubscribe
  };
}, [symbol, timeframe]);
```

当：

```text
symbol
```

或：

```text
timeframe
```

变化时，旧 subscription 必须被正确清理。

---

# 60. 验收原则

这是本项目最重要的执行原则。

**严格按照以下顺序执行：**

```text
Phase 0
基础架构 + REST + WebSocket
        ↓
用户验收
        ↓
Phase 1
K线
        ↓
用户验收
        ↓
Phase 2
订单簿
        ↓
用户验收
        ↓
Phase 3
最新成交
        ↓
用户验收
        ↓
Phase 4
整体整合
```

**绝对不要：**

```text
K线还没有验收
↓
继续做订单簿
```

也不要：

```text
订单簿还没有验收
↓
继续做最新成交
```

---

# 61. 每个 Phase 完成后的报告格式

Claude Code 每个阶段完成后，只需要汇报：

```text
## Phase X Completed

### Implemented

- xxx
- xxx
- xxx

### Files Changed

- xxx
- xxx
- xxx

### Validation

- npm run lint: PASS
- npm run build: PASS
- TypeScript: PASS

### Manual Test

- xxx
- xxx
- xxx

### Known Issues

- None

Waiting for acceptance before continuing.
```

然后停止。

---

# 62. 不允许擅自扩大需求

当前第一阶段不要擅自增加：

```text
Trading
Wallet
Login
Authentication
Portfolio
Leverage
Margin
Futures
Options
Bot
Copy Trading
Indicators
Drawing Tools
Advanced Chart
```

除非后续明确要求。

---

# 63. K线库选择说明

这里的“TradingView 开源库”指：

```text
Lightweight Charts
```

不是：

```text
TradingView Advanced Charts
```

Lightweight Charts 是开源 npm 图表库，可以由应用自己提供行情数据；Advanced Charts / Trading Platform 是不同产品，并不是普通 npm 开源包。

所以当前项目：

```text
Our REST API
        ↓
Our WebSocket
        ↓
Candle Data
        ↓
Lightweight Charts
```

不要嵌入 TradingView Widget，也不要使用 TradingView 自己的行情数据。

---

# 64. 第一版不实现指标

暂时不要实现：

```text
MA
EMA
MACD
RSI
BOLL
KDJ
```

先只实现：

```text
Candlestick
Volume
Timeframe
```

如果原型图包含 Volume，则实现 Volume；否则第一版只实现 K线。

---

# 65. 数据格式统一

外部数据：

```text
string
```

进入应用后根据需要转换：

```typescript
Number(price)
Number(size)
Number(timestamp)
```

但价格/数量在涉及展示精度时不要简单：

```typescript
toFixed(2)
```

因为：

```text
BTC
ETH
SOL
DOGE
```

不同交易对的精度不同。

第一版应该尽量保留数据源原始 precision。

---

# 66. 时间处理

外部 Kline 时间通常是 Unix timestamp。

内部统一：

```typescript
number
```

并明确：

```text
seconds
```

还是：

```text
milliseconds
```

避免：

```text
秒 → 毫秒 → 秒
```

混乱。

建议在 Adapter 层统一转换。

---

# 67. 最重要的最终架构

最终代码应该形成：

```text
                    ┌────────────────────┐
                    │ /[locale]/trade/   │
                    │      [symbol]      │
                    └─────────┬──────────┘
                              │
                       TradingHall
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
       Kline              OrderBook          RecentTrades
          │                   │                   │
          ▼                   ▼                   ▼
      Hook                  Hook                Hook
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
                    Market Data Provider
                              │
                ┌─────────────┴─────────────┐
                │                           │
             REST Client               WS Client
                │                           │
                └─────────────┬─────────────┘
                              │
                     Public Market API
```

---

# 68. 第一阶段必须先完成的 API 清单

最终 Claude Code 在 Phase 0 完成后，应该至少有以下 API 能力：

## WebSocket

### Bootstrap

```text
POST /api/v1/bullet-public
```

用途：

```text
获取 public websocket token + instance server
```

官方文档：[Public WebSocket Token API](https://www.kucoin.com/docs-new/websocket-api/base-info/get-public-token-spot-margin?utm_source=chatgpt.com)

### Kline

```text
/market/candles:{symbol}_{type}
```

官方文档：[Klines WebSocket](https://www.kucoin.com/docs-new/3470071w0?utm_source=chatgpt.com)

### Order Book

```text
/market/level2:{symbol}
```

官方文档：[Order Book Increment WebSocket](https://www.kucoin.com/docs-new/3470068w0?utm_source=chatgpt.com)

### Recent Trades

```text
/market/match:{symbol}
```

官方 Spot WebSocket 文档：[Trade WebSocket](https://www.kucoin.com/en-eu/docs-new/3470072w0?utm_source=chatgpt.com)

---

## REST

### Kline

```text
GET /api/v1/market/candles
```

最多 1500 条/请求。

### Order Book

```text
GET /api/v1/market/orderbook/level2_20
```

用于初始订单簿快照。

### Full Order Book

```text
GET /api/v3/market/orderbook/level2
```

作为后续需要更深订单簿时的备用接口。官方文档同时建议通过 WebSocket 增量流保持订单簿最新。

### Recent Trades

```text
GET /api/v1/market/histories
```

返回最近公开成交记录。

---

# 69. 最终执行命令

Claude Code 开始执行后：

```text
Step 1
读取项目

Step 2
读取用户提供的原型图

Step 3
读取用户提供的 Socket 封装

Step 4
检查 Next.js / TypeScript / package.json

Step 5
建立 locale 路由

Step 6
建立 Market Data Provider

Step 7
建立 REST Client

Step 8
建立 WebSocket Client

Step 9
实现 Public Token

Step 10
实现 Kline / OrderBook / RecentTrades 的数据 Adapter

Step 11
运行 lint / typecheck / build

Step 12
停止

等待用户验收
```

之后严格按照：

```text
Kline
→ Acceptance
→ OrderBook
→ Acceptance
→ Recent Trades
→ Acceptance
→ Integration
```

执行。

**任何一个阶段没有得到用户明确验收，都不得进入下一个阶段。**
