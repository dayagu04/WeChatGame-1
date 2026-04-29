// ==========================================
// 41_Level_Up_Formula.ts
// 平滑升级公式与加速道具/钻石的时间换算逻辑
// ==========================================

import { ResourceType } from '../00_Core/00_Global_Enums';

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 升级需求基础结构 */
export interface UpgradeRequirement {
  targetLevel: number;
  resourceCosts: Record<string, number>;
  timeCostMs: number;
}

/** 加速道具类型枚举 */
export enum SpeedupItemType {
  GENERAL = 'SPEEDUP_GENERAL',
  BUILDING = 'SPEEDUP_BUILDING',
  HEALING = 'SPEEDUP_HEALING',
}

/** 时间加速请求参数 */
export interface SpeedupRequest {
  targetInstanceId: string;
  speedupItemType: SpeedupItemType;
  reduceTimeMs: number;
}

// ==========================================
// 核心逻辑 (Core Logic)
// ==========================================

export class LevelUpFormulaEngine {
  // ---------- 4.1 建筑升级资源消耗与时间模型 ----------

  /**
   * 资源消耗公式 (二次方+指数混合模型)
   * Cost(L) = floor(C_base × (1 + 0.15×L + 0.05×L²) × 1.08^(L-1))
   */
  static calculateBuildingCost(C_base: number, level: number): number {
    const polynomial = 1 + 0.15 * level + 0.05 * level * level;
    const exponential = Math.pow(1.08, level - 1);
    return Math.floor(C_base * polynomial * exponential);
  }

  /**
   * 升级耗时公式 (时间墙限制)
   * Time(L) = floor(T_base × (1 + 0.2×L) × 1.1^(L-1))
   * @returns 毫秒
   */
  static calculateBuildingTimeMs(T_base: number, level: number): number {
    const timeSec = T_base * (1 + 0.2 * level) * Math.pow(1.1, level - 1);
    return Math.floor(timeSec * 1000);
  }

  /**
   * 获取建筑升级完整需求
   */
  static getBuildingUpgradeRequirement(
    C_base: number,
    T_base: number,
    targetLevel: number,
    costResourceType: ResourceType,
  ): UpgradeRequirement {
    const costs: Record<string, number> = {};
    costs[costResourceType] = this.calculateBuildingCost(C_base, targetLevel);

    return {
      targetLevel,
      resourceCosts: costs,
      timeCostMs: this.calculateBuildingTimeMs(T_base, targetLevel),
    };
  }

  // ---------- 4.2 英雄经验升级模型 ----------

  /**
   * 英雄升级经验公式 (立方式平滑曲线)
   * Exp(L) = floor(E_base × (L^1.5 + 0.1×L^2.5))
   */
  static calculateHeroExpRequired(level: number): number {
    const E_base = 50;
    return Math.floor(E_base * (Math.pow(level, 1.5) + 0.1 * Math.pow(level, 2.5)));
  }

  /**
   * 总经验差值计算 (一键升级)
   * TotalExp = Σ Exp(k), k from L_start to L_target-1
   */
  static calculateTotalExpForRange(L_start: number, L_target: number): number {
    let total = 0;
    for (let k = L_start; k < L_target; k++) {
      total += this.calculateHeroExpRequired(k);
    }
    return total;
  }

  // ---------- 4.3 加速与钻石折算逻辑 ----------

  /**
   * 使用加速道具
   * 将 upgradeStartTimeMs 向过去推移
   * upgradeStartTimeMs_new = upgradeStartTimeMs_old - T_reduce
   */
  static applySpeedup(
    upgradeStartTimeMs: number,
    T_reduce: number,
  ): number {
    return upgradeStartTimeMs - T_reduce;
  }

  /**
   * 计算剩余时间
   * Time_rem = upgradeDurationMs - (t_current - upgradeStartTimeMs)
   */
  static calculateRemainingTimeMs(
    upgradeStartTimeMs: number,
    upgradeDurationMs: number,
    currentTimestamp: number,
  ): number {
    return Math.max(0, upgradeDurationMs - (currentTimestamp - upgradeStartTimeMs));
  }

  /**
   * 钻石立即完成：分段计费公式
   * M = ceil(Time_rem / 60000)
   *
   * M ≤ 60:      Cost_gem = M × 2
   * 60 < M ≤ 1440: Cost_gem = 120 + (M - 60) × 1.5
   * M > 1440:    Cost_gem = 2190 + (M - 1440) × 1.0
   */
  static calculateInstantFinishGemCost(remainingTimeMs: number): number {
    if (remainingTimeMs <= 0) return 0;

    const M = Math.ceil(remainingTimeMs / 60000); // 折算为分钟

    if (M <= 60) {
      return Math.ceil(M * 2);
    } else if (M <= 1440) {
      return Math.ceil(120 + (M - 60) * 1.5);
    } else {
      return Math.ceil(2190 + (M - 1440) * 1.0);
    }
  }

  /**
   * 强制完成升级的时间戳设置
   * 设置 upgradeStartTimeMs = t_current - upgradeDurationMs
   * 使其在下一毫秒立即完成
   */
  static getInstantFinishTimestamp(upgradeDurationMs: number, currentTimestamp: number): number {
    return currentTimestamp - upgradeDurationMs;
  }
}
