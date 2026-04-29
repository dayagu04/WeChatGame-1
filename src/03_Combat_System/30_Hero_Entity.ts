// ==========================================
// 30_Hero_Entity.ts
// 英雄数据结构、星级机制与小队 (Squad) 编组
// ==========================================

import { HeroClass } from '../00_Core/00_Global_Enums';

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 英雄基础配置表 (静态数据，由策划配置表导出) */
export interface HeroBaseConfig {
  heroId: string;
  name: string;
  rarity: 'R' | 'SR' | 'SSR';
  heroClass: HeroClass;

  // 初始战斗属性
  baseHp: number;
  baseAttack: number;
  baseDefense: number;

  // 专属技能与城市增益
  skillId: string;
  cityBuffType?: 'GATHER_SPEED' | 'FURNACE_COST_DOWN' | 'HEAL_SPEED';
  baseCityBuffValue: number;
}

/** 玩家拥有的英雄实例数据 (动态数据，存入数据库) */
export interface HeroInstanceData {
  instanceId: string;
  heroId: string;
  level: number;
  currentExp: number;
  starLevel: number;

  // 计算后的最终战斗属性 (缓存)
  finalHp: number;
  finalAttack: number;
  finalDefense: number;
}

/** 战斗编队数据 */
export interface SquadData {
  squadId: string;
  name: string;
  heroIds: string[];
  troopCount: number;
  totalPower: number;
}

/** 稀有度对应的等级成长系数 */
const RARITY_GROWTH: Record<string, number> = {
  R: 5,
  SR: 10,
  SSR: 15,
};

/** 每个英雄基础带兵量 */
const BASE_TROOP_CAPACITY = 10;
/** 编队最大英雄数 */
const MAX_SQUAD_HEROES = 5;

// ==========================================
// 核心逻辑 (Core Logic)
// ==========================================

export class HeroManager {
  private configs: Map<string, HeroBaseConfig> = new Map();
  private instances: Map<string, HeroInstanceData> = new Map();

  constructor(configs?: HeroBaseConfig[]) {
    if (configs) {
      for (const c of configs) {
        this.configs.set(c.heroId, c);
      }
    }
  }

  // ---------- Public API ----------

  getConfig(heroId: string): HeroBaseConfig | undefined {
    return this.configs.get(heroId);
  }

  getInstance(instanceId: string): HeroInstanceData | undefined {
    return this.instances.get(instanceId);
  }

  addInstance(instance: HeroInstanceData): void {
    this.instances.set(instance.instanceId, instance);
  }

  getAllInstances(): HeroInstanceData[] {
    return Array.from(this.instances.values());
  }

  // ---------- 4.1 英雄属性成长计算 ----------

  /**
   * 最终属性计算公式:
   * A_final = (A_base + G_level × (L - 1)) × M_star
   * 其中 M_star = 1 + S × 0.2
   */
  calculateFinalStat(baseStat: number, level: number, starLevel: number, rarity: string): number {
    const G_level = RARITY_GROWTH[rarity] ?? 5;
    const M_star = 1 + starLevel * 0.2;
    return Math.floor((baseStat + G_level * (level - 1)) * M_star);
  }

  /** 重新计算英雄实例的最终属性 */
  recalculateHeroStats(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    const config = this.configs.get(instance.heroId);
    if (!config) return;

    instance.finalHp = this.calculateFinalStat(config.baseHp, instance.level, instance.starLevel, config.rarity);
    instance.finalAttack = this.calculateFinalStat(config.baseAttack, instance.level, instance.starLevel, config.rarity);
    instance.finalDefense = this.calculateFinalStat(config.baseDefense, instance.level, instance.starLevel, config.rarity);
  }

  // ---------- 4.2 升级与升星逻辑 ----------

  /**
   * 英雄经验升级模型 (来自 41_Level_Up_Formula)
   * Exp(L) = floor(50 × (L^1.5 + 0.1 × L^2.5))
   */
  getExpRequired(level: number): number {
    return Math.floor(50 * (Math.pow(level, 1.5) + 0.1 * Math.pow(level, 2.5)));
  }

  /**
   * 升级：消耗经验值提升等级
   * @param instanceId 英雄实例ID
   * @param expToAdd 要添加的经验值
   * @param maxLevel 等级上限 (大火炉等级)
   * @returns 实际升级数
   */
  addExp(instanceId: string, expToAdd: number, maxLevel: number): number {
    const instance = this.instances.get(instanceId);
    if (!instance) return 0;

    let levelsGained = 0;
    instance.currentExp += expToAdd;

    while (instance.level < maxLevel) {
      const required = this.getExpRequired(instance.level);
      if (instance.currentExp >= required) {
        instance.currentExp -= required;
        instance.level++;
        levelsGained++;
      } else {
        break;
      }
    }

    if (levelsGained > 0) {
      this.recalculateHeroStats(instanceId);
    }

    return levelsGained;
  }

  /**
   * 升星消耗公式: Req_shard = 10 × 2^S
   */
  getStarUpShardCost(currentStar: number): number {
    return 10 * Math.pow(2, currentStar);
  }

  /**
   * 升星
   * @returns 是否升星成功
   */
  starUp(instanceId: string, availableShards: number): { success: boolean; cost: number } {
    const instance = this.instances.get(instanceId);
    if (!instance) return { success: false, cost: 0 };

    const cost = this.getStarUpShardCost(instance.starLevel);
    if (availableShards < cost) return { success: false, cost };

    instance.starLevel++;
    this.recalculateHeroStats(instanceId);
    return { success: true, cost };
  }

  // ---------- 4.3 编队组建逻辑 ----------

  /**
   * 计算英雄带兵量上限
   * troopCapacity = Level × BASE_TROOP_CAPACITY
   */
  getHeroTroopCapacity(instanceId: string): number {
    const instance = this.instances.get(instanceId);
    if (!instance) return 0;
    return instance.level * BASE_TROOP_CAPACITY;
  }

  /**
   * 计算编队总带兵量上限
   */
  getSquadMaxTroopCount(heroIds: string[]): number {
    let total = 0;
    for (const id of heroIds) {
      total += this.getHeroTroopCapacity(id);
    }
    return total;
  }

  /**
   * 综合战力计算
   * Power = (Σ A_final) × 1.5 + (TroopCount × 0.5)
   */
  calculateSquadPower(heroIds: string[], troopCount: number): number {
    let sumFinal = 0;
    for (const id of heroIds) {
      const instance = this.instances.get(id);
      if (instance) {
        sumFinal += instance.finalHp + instance.finalAttack + instance.finalDefense;
      }
    }
    return Math.floor(sumFinal * 1.5 + troopCount * 0.5);
  }

  /**
   * 创建/更新编队
   */
  createSquad(squadId: string, name: string, heroIds: string[], troopCount: number): SquadData {
    if (heroIds.length > MAX_SQUAD_HEROES) {
      heroIds = heroIds.slice(0, MAX_SQUAD_HEROES);
    }

    const maxTroops = this.getSquadMaxTroopCount(heroIds);
    const actualTroops = Math.min(troopCount, maxTroops);
    const totalPower = this.calculateSquadPower(heroIds, actualTroops);

    return {
      squadId,
      name,
      heroIds,
      troopCount: actualTroops,
      totalPower,
    };
  }
}
