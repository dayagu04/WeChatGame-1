// ==========================================
// 11_Furnace_Logic.ts
// 大火炉系统：网格空间温度辐射衰减算法与煤炭消耗模型
// ==========================================

import {
  BuildingState,
  BuildingType,
  GlobalEvents,
  WeatherType,
  eventBus,
} from '../00_Core/00_Global_Enums';
import { BuildingBase, BuildingBaseData, BuildingLevelConfig } from './10_Building_Base_Class';

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 火炉特有的运行模式枚举 */
export enum FurnacePowerMode {
  OFF = 0,       // 熄火状态 (无煤炭或玩家手动关闭)
  NORMAL = 1,    // 正常模式 (基础热量，基础消耗)
  OVERDRIVE = 2, // 超频模式 (对抗暴风雪：热量增加，煤炭消耗急剧增加)
}

/** 大火炉数据模型 (继承自 BuildingBaseData) */
export interface FurnaceData extends BuildingBaseData {
  type: BuildingType.FURNACE;
  powerMode: FurnacePowerMode;

  // 以下数值随等级(level)变化，需从配置表读取，此处记录当前计算值
  currentCoreTemp: number;        // 当前核心提供温度 (正数)
  currentRadiationRadius: number; // 当前有效辐射半径 (Tile网格数)
  coalCostPerTick: number;        // 当前每Tick(秒)消耗的煤炭量
}

/** 火炉等级配置 */
export interface FurnaceLevelConfig extends BuildingLevelConfig {
  baseCoreTemp: number;          // 基础核心温度
  baseRadiationRadius: number;   // 基础辐射半径
  baseCoalCostPerTick: number;   // 基础每Tick煤炭消耗
  radiationDecayAlpha: number;   // 辐射衰减系数 α
}

// ==========================================
// 核心逻辑 (Core Logic)
// ==========================================

export class Furnace extends BuildingBase {
  declare data: FurnaceData;
  protected declare config: FurnaceLevelConfig;

  constructor(data: FurnaceData, config: FurnaceLevelConfig) {
    super(data, config);
    this.data = data;
    this.config = config;
  }

  // ---------- 4.1 Tick 更新逻辑 (Phase 1: 环境层更新) ----------

  /**
   * 每Tick执行的火炉逻辑
   * @returns 本Tick消耗的煤炭量，供外部资源管理器扣除
   */
  tickFurnace(): number {
    // 1. 检查运行状态
    if (this.data.powerMode === FurnacePowerMode.OFF) {
      return 0;
    }

    // 2. 计算本Tick煤炭消耗
    let coalCost = this.data.coalCostPerTick;
    if (this.data.powerMode === FurnacePowerMode.OVERDRIVE) {
      coalCost *= 2.0; // 超频模式双倍消耗
    }

    // 返回消耗量，由外部资源管理器执行扣除
    // 如果外部资源不足，调用 forceShutdown()
    return coalCost;
  }

  /**
   * 煤炭不足时强制熄火
   */
  forceShutdown(): void {
    const oldMode = this.data.powerMode;
    this.data.powerMode = FurnacePowerMode.OFF;
    this.data.state = BuildingState.FROZEN;

    eventBus.emit('EVT_FURNACE_POWER_CHANGED', {
      buildingId: this.data.instanceId,
      oldMode,
      newMode: FurnacePowerMode.OFF,
    });

    eventBus.emit('EVT_COAL_DEPLETED', {
      buildingId: this.data.instanceId,
    });
  }

  /**
   * 切换功率模式
   */
  setPowerMode(newMode: FurnacePowerMode): void {
    const oldMode = this.data.powerMode;
    if (oldMode === newMode) return;

    this.data.powerMode = newMode;

    // 恢复运行时，状态从 FROZEN 切回 NORMAL
    if (newMode !== FurnacePowerMode.OFF && this.data.state === BuildingState.FROZEN) {
      this.data.state = BuildingState.NORMAL;
    }

    eventBus.emit('EVT_FURNACE_POWER_CHANGED', {
      buildingId: this.data.instanceId,
      oldMode,
      newMode,
    });
  }

  // ---------- 4.2 温度场辐射衰减算法 ----------

  /**
   * 计算核心温度输出
   * NORMAL: H_out = BaseCoreTemp × 1.0
   * OVERDRIVE: H_out = BaseCoreTemp × 1.5
   */
  getCoreHeatOutput(): number {
    if (this.data.powerMode === FurnacePowerMode.OFF) return 0;

    const base = this.data.currentCoreTemp;
    if (this.data.powerMode === FurnacePowerMode.OVERDRIVE) {
      return base * 1.5;
    }
    return base * 1.0;
  }

  /**
   * 温度辐射衰减算法
   * 计算目标网格 (x1, y1) 的实际温度
   *
   * T_target = T_env + max(0, H_out - α × d)
   * 其中 d = sqrt((x1-x0)² + (y1-y0)²)
   *
   * @param furnaceX 火炉中心X坐标
   * @param furnaceY 火炉中心Y坐标
   * @param targetX 目标网格X坐标
   * @param targetY 目标网格Y坐标
   * @param envTemperature 当前环境全局温度 T_env
   * @returns 目标网格的实际温度
   */
  calculateTileTemperature(
    furnaceX: number,
    furnaceY: number,
    targetX: number,
    targetY: number,
    envTemperature: number,
  ): number {
    // 步骤1: 计算欧几里得距离
    const dx = targetX - furnaceX;
    const dy = targetY - furnaceY;
    const d = Math.sqrt(dx * dx + dy * dy);

    // 超出辐射范围
    if (d > this.data.currentRadiationRadius) {
      return envTemperature;
    }

    // 步骤2: 计算目标网格温度
    const H_out = this.getCoreHeatOutput();
    const alpha = this.config.radiationDecayAlpha;

    // T_target = T_env + max(0, H_out - α × d)
    return envTemperature + Math.max(0, H_out - alpha * d);
  }

  // ---------- 等级属性重算 ----------

  protected override recalculateLevelStats(): void {
    super.recalculateLevelStats();
    const L = this.data.level;
    this.data.currentCoreTemp = this.config.baseCoreTemp + (L - 1) * 2;
    this.data.currentRadiationRadius = this.config.baseRadiationRadius + (L - 1) * 0.5;
    this.data.coalCostPerTick = this.config.baseCoalCostPerTick + (L - 1) * 0.3;
  }
}
