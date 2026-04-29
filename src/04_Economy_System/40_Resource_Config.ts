// ==========================================
// 40_Resource_Config.ts
// 经济原子操作 API、动态仓库容量上限约束与爆仓逻辑
// ==========================================

import {
  GlobalEvents,
  ResourceType,
  eventBus,
} from '../00_Core/00_Global_Enums';

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 玩家全局背包/钱包数据结构 */
export interface PlayerWalletData {
  uid: string;
  resources: Record<ResourceType, number>;
  lastUpdatedMs: number;
}

/** 资源基础配置表 */
export interface ResourceConfig {
  type: ResourceType;
  name: string;
  isTradable: boolean;
  baseStorageCap: number;
}

/** 全局初始经济常量 */
export const INITIAL_ECONOMY_STATE: Record<ResourceType, number> = {
  [ResourceType.WOOD]: 500,
  [ResourceType.COAL]: 200,
  [ResourceType.MEAT]: 100,
  [ResourceType.RATION]: 50,
  [ResourceType.IRON]: 0,
  [ResourceType.GEM]: 100,
};

/** 资源静态配置字典 */
export const RESOURCE_DICTIONARY: Record<ResourceType, ResourceConfig> = {
  [ResourceType.WOOD]: { type: ResourceType.WOOD, name: '木材', isTradable: true, baseStorageCap: 2000 },
  [ResourceType.COAL]: { type: ResourceType.COAL, name: '煤炭', isTradable: true, baseStorageCap: 1000 },
  [ResourceType.MEAT]: { type: ResourceType.MEAT, name: '生肉', isTradable: true, baseStorageCap: 500 },
  [ResourceType.RATION]: { type: ResourceType.RATION, name: '熟食', isTradable: false, baseStorageCap: 500 },
  [ResourceType.IRON]: { type: ResourceType.IRON, name: '铁矿', isTradable: true, baseStorageCap: 500 },
  [ResourceType.GEM]: { type: ResourceType.GEM, name: '钻石', isTradable: false, baseStorageCap: 999999999 },
};

// 容量成长系数
const M_CAP = 1.5;

// ==========================================
// 核心逻辑 (Core Logic)
// ==========================================

export class WalletManager {
  private wallet: PlayerWalletData;
  private warehouseLevel: number = 1; // 仓库/主城等级

  constructor(uid: string, initialResources?: Partial<Record<ResourceType, number>>) {
    const resources = { ...INITIAL_ECONOMY_STATE, ...initialResources };
    this.wallet = {
      uid,
      resources: resources as Record<ResourceType, number>,
      lastUpdatedMs: Date.now(),
    };
  }

  // ---------- Public API ----------

  getWallet(): Readonly<PlayerWalletData> {
    return this.wallet;
  }

  getResource(type: ResourceType): number {
    return this.wallet.resources[type] ?? 0;
  }

  setWarehouseLevel(level: number): void {
    this.warehouseLevel = level;
  }

  // ---------- 4.1 仓库容量上限计算 ----------

  /**
   * 动态存储上限公式
   * Capacity_max = floor(C_base × M_cap^(L-1))
   * GEM 不受限制
   */
  getStorageCap(type: ResourceType): number {
    if (type === ResourceType.GEM) {
      return RESOURCE_DICTIONARY[type].baseStorageCap; // 999999999
    }
    const C_base = RESOURCE_DICTIONARY[type].baseStorageCap;
    return Math.floor(C_base * Math.pow(M_CAP, this.warehouseLevel - 1));
  }

  // ---------- 4.2 资源收支事务管理 ----------

  /**
   * 收入 API
   * @returns 实际入库量 (可能因爆仓被截断)
   */
  addResource(type: ResourceType, amount: number): number {
    if (amount <= 0) return 0;

    const current = this.wallet.resources[type] ?? 0;
    const cap = this.getStorageCap(type);
    const newAmount = Math.min(current + amount, cap);
    const actualGain = newAmount - current;

    this.wallet.resources[type] = newAmount;
    this.wallet.lastUpdatedMs = Date.now();

    // 触发事件
    eventBus.emit(GlobalEvents.RESOURCE_CHANGED, {
      type,
      diff: actualGain,
      total: newAmount,
    });

    // 边缘触发：爆仓
    if (newAmount >= cap && type !== ResourceType.GEM) {
      eventBus.emit('EVT_STORAGE_FULL', { type });
    }

    return actualGain;
  }

  /**
   * 支出 API (事务性：全有或全无)
   * @returns 是否扣除成功
   */
  consumeResource(costDict: Partial<Record<ResourceType, number>>): boolean {
    // 预检
    for (const [type, amount] of Object.entries(costDict)) {
      if (amount === undefined || amount <= 0) continue;
      const current = this.wallet.resources[type as ResourceType] ?? 0;
      if (current < amount) {
        return false; // 资源不足
      }
    }

    // 扣除
    for (const [type, amount] of Object.entries(costDict)) {
      if (amount === undefined || amount <= 0) continue;
      const resourceType = type as ResourceType;
      this.wallet.resources[resourceType] -= amount;

      eventBus.emit(GlobalEvents.RESOURCE_CHANGED, {
        type: resourceType,
        diff: -amount,
        total: this.wallet.resources[resourceType],
      });
    }

    this.wallet.lastUpdatedMs = Date.now();
    return true;
  }

  /**
   * 检查资源是否足够 (不扣除)
   */
  canAfford(costDict: Partial<Record<ResourceType, number>>): boolean {
    for (const [type, amount] of Object.entries(costDict)) {
      if (amount === undefined || amount <= 0) continue;
      const current = this.wallet.resources[type as ResourceType] ?? 0;
      if (current < amount) return false;
    }
    return true;
  }

  // ---------- 4.3 离线爆仓结算补偿 ----------

  /**
   * 离线收益入库（含爆仓检查）
   * @returns { actualGain, wasted }
   */
  addOfflineGain(type: ResourceType, gainTheory: number): { actualGain: number; wasted: number } {
    const current = this.wallet.resources[type] ?? 0;
    const cap = this.getStorageCap(type);

    // Gain_actual = min(Gain_theory, Capacity_max - R_start)
    const actualGain = Math.min(gainTheory, Math.max(0, cap - current));
    const wasted = gainTheory - actualGain;

    if (actualGain > 0) {
      this.wallet.resources[type] = current + actualGain;
    }

    this.wallet.lastUpdatedMs = Date.now();

    eventBus.emit(GlobalEvents.RESOURCE_CHANGED, {
      type,
      diff: actualGain,
      total: this.wallet.resources[type],
    });

    if (wasted > 0) {
      eventBus.emit('EVT_STORAGE_FULL', { type });
    }

    return { actualGain, wasted };
  }

  /** 导出存档数据 */
  serialize(): PlayerWalletData {
    return { ...this.wallet, resources: { ...this.wallet.resources } };
  }
}
