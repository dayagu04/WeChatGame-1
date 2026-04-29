// ==========================================
// 21_Worker_AI_State.ts
// 幸存者 NPC 行为树（饥饿、健康、工作、生病状态转换）
// ==========================================

import {
  BuildingType,
  GAME_CONSTANTS,
  GlobalEvents,
  ResourceType,
  WorkerState,
  eventBus,
} from '../00_Core/00_Global_Enums';

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 工人核心维生属性阈值常量 */
export const WORKER_STATS_CONFIG = {
  MAX_STAT_VALUE: 100,
  HUNGER_THRESHOLD_EAT: 30,   // 饱食度低于30时，触发寻食行为
  HEALTH_THRESHOLD_SICK: 20,  // 健康度低于20时，进入生病状态
  DEATH_COUNTDOWN_MS: 3600000,// 生病状态无医疗干预下的死亡倒计时 (1小时)
  HUNGER_DECAY_RATE_WORK: 0.8,  // 工作时饱食度衰减速率 (每Tick)
  HUNGER_DECAY_RATE_IDLE: 0.5,  // 空闲时饱食度衰减速率 (每Tick)
  HEALTH_HEAL_RATE: 2.0,        // 舒适环境下每Tick恢复的健康值
  COLD_DAMAGE_GAMMA: 0.5,       // 寒冷伤害系数 γ
} as const;

/** 幸存者个体数据模型 */
export interface WorkerData {
  workerId: string;
  name: string;

  // 维生属性 (0 ~ 100)
  hunger: number;
  health: number;
  mood: number;

  // 状态与调度
  currentState: WorkerState;
  assignedBuildingId?: string;

  // 空间位置 (用于寻路和温度采样)
  positionX: number;
  positionY: number;

  // 异常状态记录
  sickTimestampMs?: number;
  zeroHungerTimestampMs?: number; // hunger=0 开始的时间戳
}

/** 食物结算结果 */
export interface FoodConsumeResult {
  consumed: boolean;
  resourceType?: ResourceType;
  hungerRestored: number;
  moodChange: number;
}

// ==========================================
// 核心逻辑 (Core Logic)
// ==========================================

export class WorkerAI {
  private workers: Map<string, WorkerData> = new Map();

  constructor(initialWorkers?: WorkerData[]) {
    if (initialWorkers) {
      for (const w of initialWorkers) {
        this.workers.set(w.workerId, w);
      }
    }
  }

  // ---------- Public API ----------

  getWorker(id: string): WorkerData | undefined {
    return this.workers.get(id);
  }

  getAllWorkers(): WorkerData[] {
    return Array.from(this.workers.values());
  }

  getAliveWorkers(): WorkerData[] {
    return this.getAllWorkers().filter((w) => w.currentState !== WorkerState.DEAD);
  }

  addWorker(worker: WorkerData): void {
    this.workers.set(worker.workerId, worker);
  }

  removeWorker(id: string): boolean {
    return this.workers.delete(id);
  }

  // ---------- 4.1 维生属性衰减 (Phase 2: 每Tick调用) ----------

  /**
   * 驱动所有工人的维生属性更新和状态机流转
   * @param getTileTemp 获取指定坐标的实际温度的函数
   * @param consumeFood 消耗食物的函数 (返回是否成功)
   */
  tickAllWorkers(
    getTileTemp: (x: number, y: number) => number,
    consumeFood: (type: ResourceType, amount: number) => boolean,
  ): void {
    for (const worker of this.workers.values()) {
      if (worker.currentState === WorkerState.DEAD) continue;
      this.updateVitalStats(worker, getTileTemp);
      this.processStateMachine(worker, consumeFood);
    }
  }

  /** 获取群体平均心情 */
  getAverageMood(): number {
    const alive = this.getAliveWorkers();
    if (alive.length === 0) return 100;
    return alive.reduce((sum, w) => sum + w.mood, 0) / alive.length;
  }

  // ---------- 维生属性更新 ----------

  private updateVitalStats(
    worker: WorkerData,
    getTileTemp: (x: number, y: number) => number,
  ): void {
    // 饱食度衰减
    const isWorking = worker.currentState === WorkerState.WORKING;
    const decayRate = isWorking
      ? WORKER_STATS_CONFIG.HUNGER_DECAY_RATE_WORK
      : WORKER_STATS_CONFIG.HUNGER_DECAY_RATE_IDLE;
    worker.hunger = Math.max(0, worker.hunger - decayRate);

    // 记录 hunger=0 的起始时间
    if (worker.hunger <= 0 && worker.zeroHungerTimestampMs === undefined) {
      worker.zeroHungerTimestampMs = Date.now();
    } else if (worker.hunger > 0) {
      worker.zeroHungerTimestampMs = undefined;
    }

    // 健康度结算
    const T_target = getTileTemp(worker.positionX, worker.positionY);
    const T_safe = 0; // 安全温度线

    if (T_target >= T_safe) {
      // 舒适环境：恢复健康
      worker.health = Math.min(
        WORKER_STATS_CONFIG.MAX_STAT_VALUE,
        worker.health + WORKER_STATS_CONFIG.HEALTH_HEAL_RATE,
      );
    } else {
      // 寒冷环境：扣除健康
      const damage = WORKER_STATS_CONFIG.COLD_DAMAGE_GAMMA * Math.abs(T_target - T_safe);
      worker.health = Math.max(0, worker.health - damage);
    }

    // 心情随健康和饱食度波动
    if (worker.health < 30) {
      worker.mood = Math.max(0, worker.mood - 0.5);
    } else if (worker.hunger > 70 && worker.health > 70) {
      worker.mood = Math.min(100, worker.mood + 0.2);
    }
  }

  // ---------- 4.2 状态机流转 ----------

  private processStateMachine(
    worker: WorkerData,
    consumeFood: (type: ResourceType, amount: number) => boolean,
  ): void {
    const now = Date.now();

    // Priority 1: 死亡判定
    if (this.checkDeath(worker, now)) return;

    // Priority 2: 生病与罢工强制中断
    if (this.checkSickness(worker, now)) return;

    // Priority 3: 进食行为
    if (this.checkEating(worker, consumeFood)) return;

    // Priority 4: 日常工作
    this.checkNormalRoutine(worker);
  }

  /** Priority 1: 死亡判定 */
  private checkDeath(worker: WorkerData, now: number): boolean {
    // 生病超时死亡
    if (
      worker.currentState === WorkerState.SICK &&
      worker.sickTimestampMs !== undefined &&
      now - worker.sickTimestampMs >= WORKER_STATS_CONFIG.DEATH_COUNTDOWN_MS
    ) {
      this.killWorker(worker, 'sickness');
      return true;
    }

    // 长期饥饿死亡 (hunger=0 超过2小时)
    if (
      worker.zeroHungerTimestampMs !== undefined &&
      now - worker.zeroHungerTimestampMs >= 7200000
    ) {
      this.killWorker(worker, 'starvation');
      return true;
    }

    return false;
  }

  /** Priority 2: 生病判定 */
  private checkSickness(worker: WorkerData, now: number): boolean {
    if (
      worker.health < WORKER_STATS_CONFIG.HEALTH_THRESHOLD_SICK &&
      worker.currentState !== WorkerState.SICK &&
      worker.currentState !== WorkerState.HEALING
    ) {
      const oldState = worker.currentState;
      worker.currentState = WorkerState.SICK;
      worker.sickTimestampMs = now;

      eventBus.emit(GlobalEvents.WORKER_STATE_CHANGE, {
        workerId: worker.workerId,
        oldState,
        newState: WorkerState.SICK,
      });

      // 尝试前往医疗站 (简化：直接进入HEALING)
      // TODO: 实际应检查医疗站是否有空位
      worker.currentState = WorkerState.HEALING;

      return true;
    }

    // 治愈判定
    if (worker.currentState === WorkerState.HEALING && worker.health >= 60) {
      const oldState = worker.currentState;
      worker.currentState = worker.assignedBuildingId
        ? WorkerState.WORKING
        : WorkerState.IDLE;
      worker.sickTimestampMs = undefined;

      eventBus.emit(GlobalEvents.WORKER_STATE_CHANGE, {
        workerId: worker.workerId,
        oldState,
        newState: worker.currentState,
      });
    }

    // 罢工判定 (群体心情极低)
    if (
      worker.currentState === WorkerState.WORKING &&
      this.getAverageMood() < 10 &&
      Math.random() < 0.05 // 5% 概率触发
    ) {
      const oldState = worker.currentState;
      worker.currentState = WorkerState.PROTESTING;

      eventBus.emit(GlobalEvents.WORKER_STATE_CHANGE, {
        workerId: worker.workerId,
        oldState,
        newState: WorkerState.PROTESTING,
      });
    }

    // 罢工恢复 (心情回升)
    if (worker.currentState === WorkerState.PROTESTING && this.getAverageMood() >= 20) {
      const oldState = worker.currentState;
      worker.currentState = worker.assignedBuildingId
        ? WorkerState.WORKING
        : WorkerState.IDLE;

      eventBus.emit(GlobalEvents.WORKER_STATE_CHANGE, {
        workerId: worker.workerId,
        oldState,
        newState: worker.currentState,
      });
    }

    return false;
  }

  /** Priority 3: 进食行为 */
  private checkEating(
    worker: WorkerData,
    consumeFood: (type: ResourceType, amount: number) => boolean,
  ): boolean {
    if (
      worker.hunger < WORKER_STATS_CONFIG.HUNGER_THRESHOLD_EAT &&
      worker.currentState !== WorkerState.SICK &&
      worker.currentState !== WorkerState.HEALING &&
      worker.currentState !== WorkerState.EATING
    ) {
      const oldState = worker.currentState;
      worker.currentState = WorkerState.EATING;

      // 尝试消耗熟食
      const ateRation = consumeFood(ResourceType.RATION, 1);
      if (ateRation) {
        worker.hunger = WORKER_STATS_CONFIG.MAX_STAT_VALUE;
        worker.mood = Math.min(100, worker.mood + 10);
      } else {
        // 退而求其次消耗生肉
        const ateMeat = consumeFood(ResourceType.MEAT, 1);
        if (ateMeat) {
          worker.hunger = Math.min(100, worker.hunger + 20);
          worker.mood = Math.max(0, worker.mood - 15);
        }
      }

      // 进食完毕，恢复原状态
      worker.currentState = worker.assignedBuildingId
        ? WorkerState.WORKING
        : WorkerState.IDLE;

      eventBus.emit(GlobalEvents.WORKER_STATE_CHANGE, {
        workerId: worker.workerId,
        oldState,
        newState: worker.currentState,
      });

      return true;
    }

    return false;
  }

  /** Priority 4: 日常工作 */
  private checkNormalRoutine(worker: WorkerData): void {
    if (
      worker.currentState === WorkerState.EATING ||
      worker.currentState === WorkerState.SICK ||
      worker.currentState === WorkerState.HEALING ||
      worker.currentState === WorkerState.PROTESTING ||
      worker.currentState === WorkerState.DEAD
    ) {
      return;
    }

    const desiredState = worker.assignedBuildingId
      ? WorkerState.WORKING
      : WorkerState.IDLE;

    if (worker.currentState !== desiredState) {
      const oldState = worker.currentState;
      worker.currentState = desiredState;

      eventBus.emit(GlobalEvents.WORKER_STATE_CHANGE, {
        workerId: worker.workerId,
        oldState,
        newState: desiredState,
      });
    }
  }

  // ---------- 辅助 ----------

  private killWorker(worker: WorkerData, reason: string): void {
    const oldState = worker.currentState;
    worker.currentState = WorkerState.DEAD;
    worker.assignedBuildingId = undefined;

    eventBus.emit(GlobalEvents.WORKER_STATE_CHANGE, {
      workerId: worker.workerId,
      oldState,
      newState: WorkerState.DEAD,
    });

    eventBus.emit(GlobalEvents.WORKER_DIED, {
      workerId: worker.workerId,
      reason,
    });

    // 全局心情下降
    for (const w of this.workers.values()) {
      if (w.currentState !== WorkerState.DEAD) {
        w.mood = Math.max(0, w.mood - 20);
      }
    }
  }
}
