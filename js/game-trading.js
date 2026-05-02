// ==========================================
// game-trading.js
// 交易站与资源交换系统
// ==========================================

import { ResourceType, GlobalEvents, eventBus } from './game-constants';

// 基础汇率（以木材为基准）
const BASE_RATES = {
  [ResourceType.WOOD]: 1.0,
  [ResourceType.COAL]: 1.5,
  [ResourceType.MEAT]: 2.0,
  [ResourceType.RATION]: 3.0,
  [ResourceType.IRON]: 4.0,
  [ResourceType.GEM]: 10.0,
};

const TRADE_FEE = 0.10; // 10% 手续费
const RATE_DRIFT = 0.05; // 每 tick ±5% 波动
const RATE_MIN = 0.5;
const RATE_MAX = 5.0;

const CARAVAN_INTERVAL = 50; // 每 50 tick 检查商队
const CARAVAN_CHANCE = 0.20;
const CARAVAN_DURATION = 10; // 持续 10 tick
const CARAVAN_DISCOUNT = 0.30; // 优惠 30%

export class TradingManager {
  constructor() {
    // 当前汇率
    this.rates = { ...BASE_RATES };
    // 商队状态
    this.caravanActive = false;
    this.caravanTicksLeft = 0;
    this.caravanDiscount = CARAVAN_DISCOUNT;
    // 交易统计
    this.totalTrades = 0;
    this.tickCounter = 0;
  }

  // 汇率波动
  tickRates() {
    for (const res of Object.keys(this.rates)) {
      if (res === ResourceType.WOOD) continue; // 木材是基准，不变
      const drift = 1 - RATE_DRIFT + Math.random() * RATE_DRIFT * 2;
      this.rates[res] = Math.max(RATE_MIN, Math.min(RATE_MAX, this.rates[res] * drift));
    }
  }

  // 商队逻辑
  tickCaravan() {
    this.tickCounter++;

    if (this.caravanActive) {
      this.caravanTicksLeft--;
      if (this.caravanTicksLeft <= 0) {
        this.caravanActive = false;
        eventBus.emit(GlobalEvents.CARAVAN_DEPART, {});
      }
      return;
    }

    // 每 CARAVAN_INTERVAL tick 检查是否触发商队
    if (this.tickCounter % CARAVAN_INTERVAL === 0) {
      if (Math.random() < CARAVAN_CHANCE) {
        this.caravanActive = true;
        this.caravanTicksLeft = CARAVAN_DURATION;
        this.caravanDiscount = CARAVAN_DISCOUNT;
        eventBus.emit(GlobalEvents.CARAVAN_ARRIVE, {
          duration: CARAVAN_DURATION,
          discount: CARAVAN_DISCOUNT,
        });
      }
    }
  }

  // 主 tick
  tick() {
    this.tickRates();
    this.tickCaravan();
  }

  // 获取当前汇率（含商队折扣）
  getRate(resourceType) {
    let rate = this.rates[resourceType] || 1.0;
    if (this.caravanActive) {
      // 商队优惠：买入更便宜
      rate *= (1 - this.caravanDiscount);
    }
    return rate;
  }

  // 执行交易
  executeTrade(wallet, sellType, sellAmount, buyType) {
    if (sellType === buyType) return false;
    if (sellAmount <= 0) return false;
    if (!wallet.canAfford({ [sellType]: sellAmount })) return false;

    const sellRate = this.getRate(sellType);
    const buyRate = this.getRate(buyType);
    const rawBuyAmount = sellAmount * (sellRate / buyRate);
    const actualBuyAmount = rawBuyAmount * (1 - TRADE_FEE);

    if (actualBuyAmount < 1) return false;

    wallet.consume({ [sellType]: sellAmount });
    const added = wallet.add(buyType, Math.floor(actualBuyAmount));

    this.totalTrades++;

    eventBus.emit(GlobalEvents.TRADE_COMPLETE, {
      sellType, sellAmount,
      buyType, buyAmount: added,
    });

    return true;
  }

  // 获取交易预览（不执行）
  getTradePreview(sellType, sellAmount, buyType) {
    if (sellType === buyType || sellAmount <= 0) return null;
    const sellRate = this.getRate(sellType);
    const buyRate = this.getRate(buyType);
    const rawBuyAmount = sellAmount * (sellRate / buyRate);
    const actualBuyAmount = Math.floor(rawBuyAmount * (1 - TRADE_FEE));
    return { buyAmount: actualBuyAmount, fee: TRADE_FEE };
  }

  // 序列化
  serialize() {
    return {
      rates: { ...this.rates },
      caravanActive: this.caravanActive,
      caravanTicksLeft: this.caravanTicksLeft,
      totalTrades: this.totalTrades,
      tickCounter: this.tickCounter,
    };
  }

  // 反序列化
  deserialize(data) {
    if (!data) return;
    Object.assign(this.rates, data.rates);
    this.caravanActive = data.caravanActive || false;
    this.caravanTicksLeft = data.caravanTicksLeft || 0;
    this.totalTrades = data.totalTrades || 0;
    this.tickCounter = data.tickCounter || 0;
  }
}
