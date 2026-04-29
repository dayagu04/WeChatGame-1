// ==========================================
// 10_Building_Base_Class.ts
// 建筑基类实体抽象与通用升级状态机
// ==========================================

import {
  BuildingState,
  BuildingType,
  GlobalEvents,
  ResourceType,
  WorkerState,
  eventBus,
} from '../00_Core/00_Global_Enums';

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 升级消耗配置项 */
export interface UpgradeCost {
  resourceType: ResourceType;
  amount: number;
}

/** 建筑通用基础数据 (所有具体建筑的父类) */
export interface BuildingBaseData {
  instanceId: string;           // 实例唯一ID (UUID)
  type: BuildingType;           // 建筑类型
  level: number;                // 当前等级 (0 表示未解锁)
  state: BuildingState;         // 当前状态

  // 工人分配相关
  maxWorkerSlots: number;       // 当前等级最大可分配工人数
  assignedWorkerIds: string[];  // 当前已分配到该建筑的工人ID列表

  // 升级状态相关
  upgradeStartTimeMs?: number;  // 升级开始的绝对时间戳
  upgradeDurationMs?: number;   // 升级所需的总时长 (毫秒)
}

/** 建筑等级配置 (基础参数) */
export interface BuildingLevelConfig {
  baseCost: number;        // 基础资源消耗量
  baseTimeSec: number;     // 基础升级耗时 (秒)
  baseWorkerSlots: number; // 基础工人槽位
  costResourceType: ResourceType; // 消耗的资源类型
}

// ==========================================
// 核心逻辑 (Core Logic)
// ==========================================

export class BuildingBase {
  data: BuildingBaseData;
  protected config: BuildingLevelConfig;

  constructor(data: BuildingBaseData, config: BuildingLevelConfig) {
    this.data = data;
    this.config = config;
  }

  // ---------- 4.1 建筑通用升级逻辑 ----------

  /**
   * 前置条件校验 (canUpgrade)
   * 检查建筑是否满足升级条件
   * @param currentResources 玩家当前资源字典
   * @returns { canUpgrade: boolean; costs: UpgradeCost[] }
   */
  canUpgrade(
    currentResources: Record<ResourceType, number>,
  ): { canUpgrade: boolean; costs: UpgradeCost[] } {
    // 条件1: 建筑当前状态必须为 NORMAL
    if (this.data.state !== BuildingState.NORMAL) {
      return { canUpgrade: false, costs: [] };
    }

    // 条件2: 计算升级消耗
    const costs = this.calculateUpgradeCosts();

    // 条件3: 校验资源是否充足
    for (const cost of costs) {
      if ((currentResources[cost.resourceType] ?? 0) < cost.amount) {
        return { canUpgrade: false, costs };
      }
    }

    return { canUpgrade: true, costs };
  }

  /**
   * 开始升级
   * 扣除资源，设置升级状态
   */
  startUpgrade(currentTimestamp: number): void {
    const durationMs = this.calculateUpgradeTimeMs();
    this.data.state = BuildingState.UPGRADING;
    this.data.upgradeStartTimeMs = currentTimestamp;
    this.data.upgradeDurationMs = durationMs;

    eventBus.emit(GlobalEvents.BUILDING_STATE_CHANGE, {
      buildingId: this.data.instanceId,
      oldState: BuildingState.NORMAL,
      newState: BuildingState.UPGRADING,
    });
  }

  /**
   * Tick推进校验 (update)
   * 在每个Tick中检查升级是否完成
   * @returns 是否升级完成
   */
  tickUpgrade(currentTimestamp: number): boolean {
    if (
      this.data.state !== BuildingState.UPGRADING ||
      this.data.upgradeStartTimeMs === undefined ||
      this.data.upgradeDurationMs === undefined
    ) {
      return false;
    }

    // 升级完成条件: t_current - upgradeStartTimeMs >= upgradeDurationMs
    if (currentTimestamp - this.data.upgradeStartTimeMs >= this.data.upgradeDurationMs) {
      this.completeUpgrade();
      return true;
    }

    return false;
  }

  // ---------- 4.2 数值公式 ----------

  /**
   * 资源消耗公式 (指数增长模型)
   * Cost(L→L+1) = floor(BaseCost × 1.5^(L-1))
   */
  calculateUpgradeCosts(): UpgradeCost[] {
    const L = this.data.level;
    const amount = Math.floor(this.config.baseCost * Math.pow(1.5, L - 1));
    return [
      { resourceType: this.config.costResourceType, amount },
    ];
  }

  /**
   * 升级耗时公式 (秒)
   * Time(L→L+1) = floor(BaseTime × 1.2^(L-1))
   */
  calculateUpgradeTimeMs(): number {
    const L = this.data.level;
    const timeSec = Math.floor(this.config.baseTimeSec * Math.pow(1.2, L - 1));
    return timeSec * 1000;
  }

  // ---------- 4.3 工人分配逻辑 ----------

  /**
   * 分配工人到建筑
   * @returns 是否分配成功
   */
  assignWorker(workerId: string, workerState: WorkerState): boolean {
    // 校验建筑状态
    if (
      this.data.state === BuildingState.UPGRADING ||
      this.data.state === BuildingState.LOCKED
    ) {
      return false;
    }

    // 校验工人状态
    if (workerState !== WorkerState.IDLE) {
      return false;
    }

    // 校验槽位
    if (this.data.assignedWorkerIds.length >= this.data.maxWorkerSlots) {
      return false;
    }

    // 防止重复分配
    if (this.data.assignedWorkerIds.includes(workerId)) {
      return false;
    }

    this.data.assignedWorkerIds.push(workerId);
    return true;
  }

  /**
   * 移除工人
   * @returns 移除后建筑是否需要切换状态
   */
  removeWorker(workerId: string): boolean {
    const idx = this.data.assignedWorkerIds.indexOf(workerId);
    if (idx === -1) return false;

    this.data.assignedWorkerIds.splice(idx, 1);

    // 移除后若无工人，且建筑依赖工人产出，切为 HALTED_NO_WORKER
    if (
      this.data.assignedWorkerIds.length === 0 &&
      this.data.state === BuildingState.PRODUCING
    ) {
      this.data.state = BuildingState.HALTED_NO_WORKER;
      eventBus.emit(GlobalEvents.BUILDING_STATE_CHANGE, {
        buildingId: this.data.instanceId,
        oldState: BuildingState.PRODUCING,
        newState: BuildingState.HALTED_NO_WORKER,
      });
      return true;
    }

    return false;
  }

  // ---------- 内部方法 ----------

  private completeUpgrade(): void {
    const oldState = this.data.state;
    this.data.level += 1;
    this.data.state = BuildingState.NORMAL;
    this.data.upgradeStartTimeMs = undefined;
    this.data.upgradeDurationMs = undefined;

    // 重新计算新等级下的属性
    this.recalculateLevelStats();

    eventBus.emit(GlobalEvents.BUILDING_STATE_CHANGE, {
      buildingId: this.data.instanceId,
      oldState,
      newState: BuildingState.NORMAL,
    });

    eventBus.emit(GlobalEvents.BUILDING_UPGRADE_COMPLETE, {
      buildingId: this.data.instanceId,
      type: this.data.type,
      newLevel: this.data.level,
    });
  }

  /** 重新计算等级相关属性 (子类可覆盖) */
  protected recalculateLevelStats(): void {
    this.data.maxWorkerSlots = this.config.baseWorkerSlots + Math.floor(this.data.level / 3);
  }
}
