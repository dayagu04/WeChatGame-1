# 42_Trading_Post.md — 交易站与资源交换系统

## 1. 模块目标
在基地中增加"交易站"建筑，玩家可以按动态汇率交换资源，增加经济策略深度。

## 2. 依赖项
- `game-constants.js`: 新增 `BuildingType.TRADING_POST`
- `game-buildings.js`: 交易站建筑定义
- `game-wallet.js`: 资源交换操作
- `game-loop.js`: 汇率波动 tick

## 3. 数据结构

```javascript
// 交易站配置
{
  type: BuildingType.TRADING_POST,
  name: '交易站',
  emoji: '🏪',
  baseCost: 200, costType: ResourceType.WOOD,
  baseTimeSec: 35, baseSlots: 1,
}

// 市场汇率（动态）
{
  [ResourceType.WOOD]: 1.0,    // 基准
  [ResourceType.COAL]: 1.5,    // 1煤 = 1.5木
  [ResourceType.MEAT]: 2.0,    // 1肉 = 2木
  [ResourceType.RATION]: 3.0,  // 1食 = 3木
  [ResourceType.IRON]: 4.0,    // 1铁 = 4木
  [ResourceType.GEM]: 10.0,    // 1钻 = 10木
}
```

## 4. 核心逻辑

### 交易规则
1. 交易站已建造且有工人分配
2. 玩家选择卖出资源和买入资源
3. 计算汇率：`amount_out = amount_in * (rate_in / rate_out)`
4. 扣除卖出资源，增加买入资源
5. 每次交易收取 10% 手续费（实际到账 90%）

### 汇率波动
每 tick 汇率在 ±5% 范围内随机波动：
```
rate[i] *= (0.95 + Math.random() * 0.10)
```
设置上下限防止极端值：`rate ∈ [0.5, 5.0]`

### 商队事件
每 50 tick 有 20% 概率触发商队到达：
- 提供特价交易（汇率优惠 30%）
- 持续 10 tick 后消失

## 5. 事件总线接口
- `EVT_TRADE_COMPLETE { sellType, sellAmount, buyType, buyAmount }` — 交易完成
- `EVT_CARAVAN_ARRIVE { duration, discount }` — 商队到达
- `EVT_CARAVAN_DEPART` — 商队离开
