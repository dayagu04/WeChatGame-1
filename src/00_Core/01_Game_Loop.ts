// ==========================================
// 01_Game_Loop.ts
// 核心心跳机制 (Tick System) 与离线收益算法
// ==========================================

import {
  GAME_CONSTANTS,
  GlobalEvents,
  ResourceType,
  eventBus,
} from './00_Global_Enums';

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 游戏循环状态记录 (用于存档和计算时间差) */
export interface GameLoopState {
  lastSaveTimestamp: number;    // 上次成功存档/Tick的绝对时间戳 (ms)
  accumulatedTimeMs: number;    // 未处理的累积时间 (用于处理卡顿或低帧率情况)
  isOfflineCalculated: boolean; // 标记本次启动是否已完成离线结算
}

/** 离线收益报告 (用于UI弹窗展示) */
export interface OfflineReport {
  offlineDurationSec: number;                 // 实际离线有效时长 (秒)
  resourcesGained: Partial<Record<ResourceType, number>>; // 获取的资源字典
  coalDepletedTimeSec?: number;               // 离线期间煤炭耗尽发生的时间点
  workersSick: number;                        // 离线期间生病的工人数量
  workersDied: number;                        // 离线期间死亡的工人数量
}

/** 单项资源的离线产出配置 */
export interface ResourceProductionRate {
  resourceType: ResourceType;
  ratePerSec: number; // 每秒产出率
}

// ==========================================
// 核心逻辑
// ==========================================

export class GameLoop {
  private state: GameLoopState;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private tickCount: number = 0;

  constructor(initialState?: Partial<GameLoopState>) {
    this.state = {
      lastSaveTimestamp: initialState?.lastSaveTimestamp ?? Date.now(),
      accumulatedTimeMs: initialState?.accumulatedTimeMs ?? 0,
      isOfflineCalculated: initialState?.isOfflineCalculated ?? false,
    };
  }

  // ---------- Public API ----------

  getState(): Readonly<GameLoopState> {
    return this.state;
  }

  /** 启动在线心跳 */
  start(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      this.executeTick();
    }, GAME_CONSTANTS.TICK_INTERVAL_MS);
  }

  /** 停止心跳 */
  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  /** 更新存档时间戳（由持久化模块调用） */
  saveCheckpoint(): void {
    this.state.lastSaveTimestamp = Date.now();
  }

  // ==========================================
  // 离线结算算法 (Offline Progression Logic)
  // ==========================================

  /**
   * 计算离线收益。
   * @param currentTimestamp 当前时间戳 (ms)
   * @param coalTotal 离线时煤炭总库存
   * @param coalCostPerSec 火炉每秒煤炭消耗率
   * @param productionRates 各资源每秒产出率列表
   * @param blizzardActiveDurationSec 离线期间暴风雪活跃时长(秒)，默认0
   * @param blizzardCoalMultiplier 暴风雪期间煤炭消耗倍率，默认1
   * @returns OfflineReport
   */
  calculateOfflineRewards(
    currentTimestamp: number,
    coalTotal: number,
    coalCostPerSec: number,
    productionRates: ResourceProductionRate[],
    blizzardActiveDurationSec: number = 0,
    blizzardCoalMultiplier: number = 1,
  ): OfflineReport {
    const M = GAME_CONSTANTS.OFFLINE_MAX_HOURS * 3600; // 最大离线秒数

    // 5.1 有效离线时间计算
    // Δt = min((t_current - t_last_save) / 1000, M × 3600)
    const deltaT = Math.min(
      (currentTimestamp - this.state.lastSaveTimestamp) / 1000,
      M,
    );

    // 如果离线时间 < 60秒，不触发离线收益面板
    if (deltaT < 60) {
      this.state.isOfflineCalculated = true;
      return {
        offlineDurationSec: deltaT,
        resourcesGained: {},
        workersSick: 0,
        workersDied: 0,
      };
    }

    // 5.2 煤炭耗尽分段计算
    // T_coal = C_total / R_coal
    // 暴风雪期间消耗倍率需加权
    const normalCoalCost = coalCostPerSec;
    const blizzardCoalCost = coalCostPerSec * blizzardCoalMultiplier;

    // 计算加权平均消耗率（考虑暴风雪时段）
    const normalDurationSec = Math.max(0, deltaT - blizzardActiveDurationSec);
    const totalCoalNeeded =
      normalDurationSec * normalCoalCost +
      blizzardActiveDurationSec * blizzardCoalCost;

    let T_coal: number; // 煤炭可支撑时间
    if (totalCoalNeeded <= coalTotal) {
      // 情况A：煤炭充足
      T_coal = deltaT;
    } else {
      // 煤炭中途耗尽，计算耗尽时间点
      // 先消耗正常时段
      const coalForNormal = normalDurationSec * normalCoalCost;
      if (coalTotal <= coalForNormal) {
        // 在正常阶段就耗尽了
        T_coal = coalTotal / normalCoalCost;
      } else {
        // 正常阶段够用，暴风雪阶段耗尽
        const remainingCoal = coalTotal - coalForNormal;
        T_coal = normalDurationSec + remainingCoal / blizzardCoalCost;
      }
    }

    // 产出衰减系数 β（火炉熄灭后）
    const beta = 0.2;
    const resourcesGained: Partial<Record<ResourceType, number>> = {};

    for (const pr of productionRates) {
      // Gain = R × T_coal + R × β × (Δt - T_coal)
      const gain = pr.ratePerSec * T_coal + pr.ratePerSec * beta * Math.max(0, deltaT - T_coal);
      if (gain > 0) {
        resourcesGained[pr.resourceType] = gain;
      }
    }

    // 煤炭自身的消耗
    const coalConsumed =
      Math.min(T_coal, normalDurationSec) * normalCoalCost +
      Math.max(0, T_coal - normalDurationSec) * blizzardCoalCost;
    resourcesGained[ResourceType.COAL] = -coalConsumed;

    // 离线期间生病/死亡评估（简化模型）
    const coalDepletedTimeSec = T_coal < deltaT ? T_coal : undefined;
    let workersSick = 0;
    let workersDied = 0;

    if (coalDepletedTimeSec !== undefined) {
      const frozenDuration = deltaT - coalDepletedTimeSec;
      // 煤炭耗尽后每小时约10%人生病
      workersSick = Math.ceil(frozenDuration * 0.01);
      // 超过1小时未治疗开始死亡
      if (frozenDuration > 3600) {
        workersDied = Math.ceil((frozenDuration - 3600) * 0.005);
      }
    }

    this.state.isOfflineCalculated = true;

    return {
      offlineDurationSec: deltaT,
      resourcesGained,
      coalDepletedTimeSec,
      workersSick,
      workersDied,
    };
  }

  // ==========================================
  // 在线 Tick 更新流水线 (Online Tick Pipeline)
  // ==========================================

  private executeTick(): void {
    this.tickCount++;
    const now = Date.now();
    const deltaMs = GAME_CONSTANTS.TICK_INTERVAL_MS;

    // Phase 1: 环境层 - 由 WeatherManager 和 Furnace 监听 TICK_UPDATE 自行处理
    // Phase 2: 实体验证层 - 由 WorkerAI 监听 TICK_UPDATE 自行处理
    // Phase 3: 生产与消耗层 - 由 ProductionBuildings 监听 TICK_UPDATE 自行处理
    // Phase 4: 结算与广播层 - 广播 TICK_UPDATE，各子系统自行结算

    eventBus.emit(GlobalEvents.TICK_UPDATE, {
      currentTimestamp: now,
      deltaMs,
      tickCount: this.tickCount,
    });

    // 保存时间戳
    this.state.lastSaveTimestamp = now;
  }

  // ==========================================
  // 工具方法
  // ==========================================

  getTickCount(): number {
    return this.tickCount;
  }

  /** 手动推进一次Tick（用于测试或离线加速） */
  manualTick(): void {
    this.executeTick();
  }
}
