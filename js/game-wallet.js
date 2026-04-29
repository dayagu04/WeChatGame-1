// ==========================================
// game-wallet.js
// 资源背包与仓库容量管理
// ==========================================

import { ResourceType, GlobalEvents, eventBus } from './game-constants';

const M_CAP = 1.5;

const RESOURCE_CONFIG = {
  [ResourceType.WOOD]:   { name: '木材', baseStorageCap: 2000 },
  [ResourceType.COAL]:   { name: '煤炭', baseStorageCap: 1000 },
  [ResourceType.MEAT]:   { name: '生肉', baseStorageCap: 500 },
  [ResourceType.RATION]: { name: '熟食', baseStorageCap: 500 },
  [ResourceType.IRON]:   { name: '铁矿', baseStorageCap: 500 },
  [ResourceType.GEM]:    { name: '钻石', baseStorageCap: 999999999 },
};

const INITIAL_RESOURCES = {
  [ResourceType.WOOD]: 500,
  [ResourceType.COAL]: 200,
  [ResourceType.MEAT]: 100,
  [ResourceType.RATION]: 50,
  [ResourceType.IRON]: 0,
  [ResourceType.GEM]: 100,
};

export class WalletManager {
  constructor() {
    this.resources = { ...INITIAL_RESOURCES };
    this.warehouseLevel = 1;
  }

  getStorageCap(type) {
    if (type === ResourceType.GEM) return 999999999;
    const base = RESOURCE_CONFIG[type]?.baseStorageCap || 0;
    return Math.floor(base * Math.pow(M_CAP, this.warehouseLevel - 1));
  }

  get(type) {
    return this.resources[type] || 0;
  }

  add(type, amount) {
    if (amount <= 0) return 0;
    const current = this.resources[type] || 0;
    const cap = this.getStorageCap(type);
    const actual = Math.min(current + amount, cap) - current;
    this.resources[type] = current + actual;

    eventBus.emit(GlobalEvents.RESOURCE_CHANGED, {
      type, diff: actual, total: this.resources[type],
    });
    return actual;
  }

  consume(costDict) {
    // 预检
    for (const type in costDict) {
      if ((this.resources[type] || 0) < costDict[type]) return false;
    }
    // 扣除
    for (const type in costDict) {
      this.resources[type] -= costDict[type];
      eventBus.emit(GlobalEvents.RESOURCE_CHANGED, {
        type, diff: -costDict[type], total: this.resources[type],
      });
    }
    return true;
  }

  canAfford(costDict) {
    for (const type in costDict) {
      if ((this.resources[type] || 0) < costDict[type]) return false;
    }
    return true;
  }
}
