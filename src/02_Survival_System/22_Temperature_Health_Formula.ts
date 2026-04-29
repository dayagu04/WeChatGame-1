// ==========================================
// 22_Temperature_Health_Formula.ts
// 空间体感温度映射公式与随机生病判定引擎
// ==========================================

import { WorkerState } from '../00_Core/00_Global_Enums';

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 温度环境分级枚举 (用于UI表现和生病概率映射) */
export enum TempComfortLevel {
  COMFORTABLE = 'COMFORTABLE', // 舒适 (>= 10°C)
  CHILLY = 'CHILLY',           // 微寒 (0°C ~ 9°C)
  COLD = 'COLD',               // 寒冷 (-15°C ~ -1°C)
  FREEZING = 'FREEZING',       // 极寒 (<= -16°C)
}

/** 温度与健康数值配置表 */
export const THERMAL_CONFIG = {
  SAFE_TEMP: 0,           // 绝对安全温度线 (摄氏度)
  BASE_DECAY_RATE: 0.5,   // 基础健康扣除系数

  // 不同温度级别的单次Tick生病概率 (万分比)
  SICKNESS_PROBABILITY: {
    [TempComfortLevel.COMFORTABLE]: 0,
    [TempComfortLevel.CHILLY]: 1,     // 0.01%
    [TempComfortLevel.COLD]: 50,      // 0.5%
    [TempComfortLevel.FREEZING]: 500, // 5%
  },
} as const;

/** 建筑保温值配置 */
export interface BuildingInsulation {
  buildingId: string;
  insulationValue: number; // I_bld，随等级提升
}

// ==========================================
// 核心逻辑 (Core Logic)
// ==========================================

export class TemperatureHealthEngine {
  private insulationMap: Map<string, number> = new Map();

  /** 注册/更新建筑保温值 */
  setInsulation(buildingId: string, value: number): void {
    this.insulationMap.set(buildingId, value);
  }

  /** 获取建筑保温值 */
  getInsulation(buildingId?: string): number {
    if (!buildingId) return 0;
    return this.insulationMap.get(buildingId) ?? 0;
  }

  // ---------- 4.1 体感温度结算公式 ----------

  /**
   * 计算工人体感温度
   *
   * 室内: T_eff = max(T_global + I_bld, T_target) + (I_bld × 0.5)
   * 室外: T_eff = T_target
   *
   * @param workerState 工人当前状态（判断室内/室外）
   * @param T_target 火炉辐射到该网格的温度
   * @param T_global 全局环境温度
   * @param buildingId 工人所在建筑ID（室内时有效）
   * @returns 体感温度
   */
  calculateEffectiveTemperature(
    workerState: WorkerState,
    T_target: number,
    T_global: number,
    buildingId?: string,
  ): number {
    const isIndoors =
      workerState === WorkerState.WORKING ||
      workerState === WorkerState.SLEEPING ||
      workerState === WorkerState.HEALING ||
      workerState === WorkerState.EATING;

    if (isIndoors) {
      const I_bld = this.getInsulation(buildingId);
      // T_eff = max(T_global + I_bld, T_target) + (I_bld × 0.5)
      return Math.max(T_global + I_bld, T_target) + I_bld * 0.5;
    }

    // 室外：完全依赖火炉辐射
    return T_target;
  }

  // ---------- 4.2 温度舒适度分级 ----------

  /**
   * 将体感温度映射为舒适度等级
   */
  getComfortLevel(T_eff: number): TempComfortLevel {
    if (T_eff >= 10) return TempComfortLevel.COMFORTABLE;
    if (T_eff >= 0) return TempComfortLevel.CHILLY;
    if (T_eff >= -15) return TempComfortLevel.COLD;
    return TempComfortLevel.FREEZING;
  }

  // ---------- 4.3 健康值衰减与恢复 ----------

  /**
   * 计算健康值变化量
   *
   * 扣减 (T_eff < SAFE_TEMP):
   *   ΔHealth = -(BASE_DECAY_RATE × |T_eff - SAFE_TEMP|)
   *
   * 恢复 (T_eff >= 10):
   *   ΔHealth = +2.0
   *
   * @returns 健康值变化量 (负数为扣减)
   */
  calculateHealthDelta(T_eff: number): number {
    if (T_eff >= 10) {
      // 舒适环境恢复
      return WORKER_STATS_CONFIG_INLINE.HEALTH_REGEN_RATE;
    }

    if (T_eff < THERMAL_CONFIG.SAFE_TEMP) {
      // 寒冷扣减
      const damage = THERMAL_CONFIG.BASE_DECAY_RATE * Math.abs(T_eff - THERMAL_CONFIG.SAFE_TEMP);
      return -damage;
    }

    // 微寒区间：不扣不加
    return 0;
  }

  // ---------- 4.4 随机生病判定引擎 ----------

  /**
   * Sickness RNG
   * 对处于 T_eff < SAFE_TEMP 的健康工人进行随机判定
   *
   * @param T_eff 工人体感温度
   * @param currentHealth 当前健康值
   * @returns { triggered: boolean, newHealth: number }
   *   - triggered=true 表示触发了暴击生病（强制健康值降至19）
   *   - triggered=false 未触发，newHealth 为正常衰减后的值
   */
  sicknessRNG(T_eff: number, currentHealth: number): { triggered: boolean; newHealth: number } {
    // 仅在寒冷环境下触发
    if (T_eff >= THERMAL_CONFIG.SAFE_TEMP) {
      return { triggered: false, newHealth: currentHealth };
    }

    const comfortLevel = this.getComfortLevel(T_eff);
    const probability = THERMAL_CONFIG.SICKNESS_PROBABILITY[comfortLevel];

    // 生成 0~10000 的随机整数
    const R = Math.floor(Math.random() * 10001);

    if (R < probability) {
      // 暴击生病：强制健康值降至19
      return { triggered: true, newHealth: 19 };
    }

    // 正常健康衰减
    const healthDelta = this.calculateHealthDelta(T_eff);
    const newHealth = Math.max(0, Math.min(100, currentHealth + healthDelta));

    return { triggered: false, newHealth };
  }

  /**
   * 综合结算：计算体感温度 + 健康值变化 + 生病判定
   * 供外部 WorkerAI 一步调用
   */
  processWorkerTemperature(
    workerState: WorkerState,
    currentHealth: number,
    T_target: number,
    T_global: number,
    buildingId?: string,
  ): {
    T_eff: number;
    comfortLevel: TempComfortLevel;
    newHealth: number;
    sicknessTriggered: boolean;
  } {
    const T_eff = this.calculateEffectiveTemperature(workerState, T_target, T_global, buildingId);
    const comfortLevel = this.getComfortLevel(T_eff);
    const { triggered, newHealth } = this.sicknessRNG(T_eff, currentHealth);

    return { T_eff, comfortLevel, newHealth, sicknessTriggered: triggered };
  }
}

// 内联常量，避免循环依赖
const WORKER_STATS_CONFIG_INLINE = {
  HEALTH_REGEN_RATE: 2.0,
};
