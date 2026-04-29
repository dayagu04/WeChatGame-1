// ==========================================
// 12_Production_Buildings.ts
// 资源产出与加工类建筑的效率因子与吞吐逻辑
// ==========================================

import {
  BuildingState,
  BuildingType,
  GlobalEvents,
  ResourceType,
  WorkerState,
  eventBus,
} from '../00_Core/00_Global_Enums';
import { BuildingBase, BuildingBaseData, BuildingLevelConfig } from './10_Building_Base_Class';

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 工人实例引用（用于计算个人效率） */
export interface WorkerRef {
  workerId: string;
  state: WorkerState;
  health: number;
  mood: number;
}

/** 基础产出建筑数据 (如伐木场、煤矿) */
export interface ProductionBuildingData extends BuildingBaseData {
  outputResourceType: ResourceType;   // 产出的资源类型
  baseOutputPerWorkerTick: number;    // 每个工人在1个Tick内的基础产出量

  // 内部状态累计池 (用于处理浮点数产出，满 1.0 时推入全局背包)
  accumulatedOutputPool: number;
}

/** 加工类建筑数据 (如厨房：消耗生肉产出熟食) */
export interface ProcessingBuildingData extends BuildingBaseData {
  inputResourceType: ResourceType;    // 需要消耗的原材料类型
  outputResourceType: ResourceType;   // 产出的成品类型

  inputCostPerWorkerTick: number;     // 每个工人每Tick消耗的原材料量
  outputPerWorkerTick: number;        // 每个工人每Tick产出的成品量

  accumulatedInputPool: number;       // 待消耗池
  accumulatedOutputPool: number;      // 待产出池
}

/** 产出建筑等级配置 */
export interface ProductionBuildingLevelConfig extends BuildingLevelConfig {
  baseOutputPerWorkerTick: number;
  outputResourceType: ResourceType;
}

/** 加工建筑等级配置 */
export interface ProcessingBuildingLevelConfig extends BuildingLevelConfig {
  inputResourceType: ResourceType;
  outputResourceType: ResourceType;
  baseInputCostPerWorkerTick: number;
  baseOutputPerWorkerTick: number;
}

/** Tick产出结算结果 */
export interface TickProductionResult {
  resourceType: ResourceType;
  amount: number;          // 整数产出量
  inputConsumed?: { type: ResourceType; amount: number }; // 加工建筑的原材料消耗
}

// ==========================================
// 基础产出建筑 (Production Building)
// ==========================================

export class ProductionBuilding extends BuildingBase {
  declare data: ProductionBuildingData;
  protected declare config: ProductionBuildingLevelConfig;

  constructor(data: ProductionBuildingData, config: ProductionBuildingLevelConfig) {
    super(data, config);
    this.data = data;
    this.config = config;
  }

  /**
   * 4.1 通用工人效率因子计算
   * E_w = 1.0 (WORKING且健康) | 0 (SICK/HEALING) | 0.5 (低心情)
   * C_eff = Σ E_w
   */
  calculateEffectiveWorkers(workers: WorkerRef[]): number {
    let C_eff = 0;
    for (const w of workers) {
      if (w.state === WorkerState.WORKING) {
        if (w.health >= 20) {
          // 心情影响效率
          C_eff += w.mood < 10 ? 0.5 : 1.0;
        }
        // health < 20 的工人不应处于 WORKING 状态（由 WorkerAI 强制中断）
      }
      // SICK, HEALING, EATING 等状态不提供产能
    }
    return C_eff;
  }

  /**
   * 4.2 基础产出建筑结算逻辑
   * Out_tick = R_base × C_eff × M_tech
   *
   * @returns 结算结果（整数产出量）
   */
  tickProduction(
    workers: WorkerRef[],
    techMultiplier: number = 1.0,
  ): TickProductionResult {
    const C_eff = this.calculateEffectiveWorkers(workers);
    const R_base = this.data.baseOutputPerWorkerTick;

    // 本Tick新增产出
    const Out_tick = R_base * C_eff * techMultiplier;

    // 累加到浮点池
    this.data.accumulatedOutputPool += Out_tick;

    // 提取整数部分
    const N = Math.floor(this.data.accumulatedOutputPool);
    if (N > 0) {
      this.data.accumulatedOutputPool -= N;
    }

    return {
      resourceType: this.data.outputResourceType,
      amount: N,
    };
  }

  /** 停工与复工判定 */
  checkHaltResume(workers: WorkerRef[]): void {
    const hasHealthyWorker = workers.some(
      (w) => w.state === WorkerState.WORKING && w.health >= 20,
    );

    if (!hasHealthyWorker && this.data.state === BuildingState.PRODUCING) {
      this.data.state = BuildingState.HALTED_NO_WORKER;
      eventBus.emit(GlobalEvents.BUILDING_STATE_CHANGE, {
        buildingId: this.data.instanceId,
        oldState: BuildingState.PRODUCING,
        newState: BuildingState.HALTED_NO_WORKER,
      });
    } else if (
      hasHealthyWorker &&
      this.data.state === BuildingState.HALTED_NO_WORKER
    ) {
      this.data.state = BuildingState.PRODUCING;
      eventBus.emit(GlobalEvents.BUILDING_STATE_CHANGE, {
        buildingId: this.data.instanceId,
        oldState: BuildingState.HALTED_NO_WORKER,
        newState: BuildingState.PRODUCING,
      });
    }
  }
}

// ==========================================
// 加工类建筑 (Processing Building)
// ==========================================

export class ProcessingBuilding extends BuildingBase {
  declare data: ProcessingBuildingData;
  protected declare config: ProcessingBuildingLevelConfig;

  constructor(data: ProcessingBuildingData, config: ProcessingBuildingLevelConfig) {
    super(data, config);
    this.data = data;
    this.config = config;
  }

  /**
   * 4.3 加工类建筑结算逻辑
   * 步骤1: 需求校验 - In_req = Cost_base × C_eff
   * 步骤2: 产出结算 - Out_tick = Out_base × C_eff × M_tech
   *
   * @param workers 当前分配的工人列表
   * @param currentInputStock 当前全局背包中原材料数量
   * @param techMultiplier 科技加成乘区
   * @returns 结算结果
   */
  tickProduction(
    workers: WorkerRef[],
    currentInputStock: number,
    techMultiplier: number = 1.0,
  ): { result: TickProductionResult | null; inputConsumed: number } {
    const C_eff = this.calculateEffectiveWorkers(workers);

    // 步骤1: 需求校验
    const In_req = this.data.inputCostPerWorkerTick * C_eff;

    if (currentInputStock < In_req || In_req <= 0) {
      // 原材料不足，切换状态
      if (this.data.state === BuildingState.PRODUCING) {
        this.data.state = BuildingState.HALTED_NO_MATERIAL;
        eventBus.emit(GlobalEvents.BUILDING_STATE_CHANGE, {
          buildingId: this.data.instanceId,
          oldState: BuildingState.PRODUCING,
          newState: BuildingState.HALTED_NO_MATERIAL,
        });
      }
      return { result: null, inputConsumed: 0 };
    }

    // 步骤2: 产出结算
    const Out_tick = this.data.outputPerWorkerTick * C_eff * techMultiplier;

    this.data.accumulatedOutputPool += Out_tick;

    const N = Math.floor(this.data.accumulatedOutputPool);
    if (N > 0) {
      this.data.accumulatedOutputPool -= N;
    }

    // 恢复生产状态
    if (this.data.state === BuildingState.HALTED_NO_MATERIAL) {
      this.data.state = BuildingState.PRODUCING;
      eventBus.emit(GlobalEvents.BUILDING_STATE_CHANGE, {
        buildingId: this.data.instanceId,
        oldState: BuildingState.HALTED_NO_MATERIAL,
        newState: BuildingState.PRODUCING,
      });
    }

    return {
      result: N > 0
        ? { resourceType: this.data.outputResourceType, amount: N }
        : null,
      inputConsumed: In_req,
    };
  }

  /** 停工与复工判定（工人维度） */
  checkHaltResume(workers: WorkerRef[], currentInputStock: number): void {
    const hasHealthyWorker = workers.some(
      (w) => w.state === WorkerState.WORKING && w.health >= 20,
    );

    if (!hasHealthyWorker && this.data.state === BuildingState.PRODUCING) {
      this.data.state = BuildingState.HALTED_NO_WORKER;
      eventBus.emit(GlobalEvents.BUILDING_STATE_CHANGE, {
        buildingId: this.data.instanceId,
        oldState: BuildingState.PRODUCING,
        newState: BuildingState.HALTED_NO_WORKER,
      });
    } else if (hasHealthyWorker && this.data.state === BuildingState.HALTED_NO_WORKER) {
      // 有人了，但还需检查原材料
      if (currentInputStock > 0) {
        this.data.state = BuildingState.PRODUCING;
        eventBus.emit(GlobalEvents.BUILDING_STATE_CHANGE, {
          buildingId: this.data.instanceId,
          oldState: BuildingState.HALTED_NO_WORKER,
          newState: BuildingState.PRODUCING,
        });
      }
    }
  }
}
