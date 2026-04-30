// ==========================================
// game-workers.js
// 幸存者工人管理与行为树 + 探索系统
// ==========================================

import { WorkerState, GlobalEvents, eventBus, EXPEDITION_CONFIGS } from './game-constants';

const NAMES = ['张三', '李四', '王五', '赵六', '陈七', '刘八', '周九', '吴十',
  '孙大', '钱二', '郑甲', '冯乙', '何丙', '许丁', '朱戊'];

let workerIdSeq = 0;

export class Worker {
  constructor(name) {
    this.workerId = `wk_${workerIdSeq++}`;
    this.name = name || NAMES[Math.floor(Math.random() * NAMES.length)];
    this.hunger = 80;
    this.health = 80;
    this.mood = 60;
    this.state = WorkerState.IDLE;
    this.assignedBuilding = null;
    this.sickTimestampMs = 0;
    this.zeroHungerTs = 0;
    // 探索相关
    this.expeditionId = null;
    this.expeditionStartMs = 0;
  }
}

export class WorkerManager {
  constructor() {
    this.workers = [];
  }

  addWorker(name) {
    const w = new Worker(name);
    this.workers.push(w);
    return w;
  }

  getAlive() {
    return this.workers.filter(w => w.state !== WorkerState.DEAD);
  }

  getWorkingCount() {
    return this.workers.filter(w => w.state === WorkerState.WORKING).length;
  }

  getSickCount() {
    return this.workers.filter(w =>
      w.state === WorkerState.SICK || w.state === WorkerState.HEALING
    ).length;
  }

  getExploringCount() {
    return this.workers.filter(w => w.state === WorkerState.EXPLORING).length;
  }

  getIdleWorkers() {
    return this.workers.filter(w => w.state === WorkerState.IDLE);
  }

  assignToBuilding(workerId, buildingType) {
    const w = this.workers.find(w => w.workerId === workerId);
    if (!w || w.state !== WorkerState.IDLE) return false;
    w.state = WorkerState.WORKING;
    w.assignedBuilding = buildingType;
    return true;
  }

  // --- 探索系统 ---
  startExpedition(workerId, expeditionId) {
    const w = this.workers.find(w => w.workerId === workerId);
    if (!w || w.state !== WorkerState.IDLE) return false;
    const config = EXPEDITION_CONFIGS.find(e => e.id === expeditionId);
    if (!config) return false;

    w.state = WorkerState.EXPLORING;
    w.expeditionId = expeditionId;
    w.expeditionStartMs = Date.now();
    return true;
  }

  tickExpeditions(wallet, weather) {
    const now = Date.now();
    const isBlizzard = weather && weather.blizzardState === 'BLZ_ACTIVE';
    const isExtremeCold = weather && weather.getGlobalTemperature() < -30;

    for (const w of this.workers) {
      if (w.state !== WorkerState.EXPLORING) continue;

      const config = EXPEDITION_CONFIGS.find(e => e.id === w.expeditionId);
      if (!config) {
        w.state = WorkerState.IDLE;
        w.expeditionId = null;
        continue;
      }

      // 极寒天气取消探索
      if (isExtremeCold) {
        w.state = WorkerState.IDLE;
        w.expeditionId = null;
        w.expeditionStartMs = 0;
        eventBus.emit(GlobalEvents.WORKER_STATE_CHANGE, {
          workerId: w.workerId, newState: WorkerState.IDLE, reason: 'extreme_cold',
        });
        continue;
      }

      // 检查探索是否完成
      if (now - w.expeditionStartMs >= config.durationMs) {
        const effectiveRisk = isBlizzard ? config.risk * 2 : config.risk;
        const injured = Math.random() < effectiveRisk;

        // 计算奖励
        const reward = Math.floor(
          config.minReward + Math.random() * (config.maxReward - config.minReward)
        );
        const actual = wallet.add(config.rewardType, reward);

        // 受伤判定
        if (injured) {
          w.health = Math.max(0, w.health - 20);
        }

        // 恢复状态
        w.state = WorkerState.IDLE;
        w.expeditionId = null;
        w.expeditionStartMs = 0;

        eventBus.emit(GlobalEvents.EXPEDITION_COMPLETE, {
          workerId: w.workerId,
          expeditionId: config.id,
          rewardType: config.rewardType,
          rewardAmount: actual,
          injured,
        });
      }
    }
  }

  // --- 主 Tick ---
  tickAll(tileTemp, consumeFood, shelterLevel) {
    const now = Date.now();
    // 庇护所减免：每级减 1% 饱食衰减，最多减 50%
    const shelterReduction = Math.min(0.5, (shelterLevel || 0) * 0.01);

    for (const w of this.workers) {
      if (w.state === WorkerState.DEAD) continue;

      // 探索中的工人跳过大部分逻辑（但仍然掉饱食和健康）
      const isExploring = w.state === WorkerState.EXPLORING;

      // 饱食度衰减（受庇护所减免）
      let decay = w.state === WorkerState.WORKING ? 0.15 : 0.08;
      decay *= (1 - shelterReduction);
      w.hunger = Math.max(0, w.hunger - decay);

      // hunger=0 计时
      if (w.hunger <= 0 && !w.zeroHungerTs) w.zeroHungerTs = now;
      else if (w.hunger > 0) w.zeroHungerTs = 0;

      // 健康度结算（探索中工人也结算）
      const T = tileTemp || -20;
      if (T >= 0) {
        w.health = Math.min(100, w.health + 0.3);
      } else {
        w.health = Math.max(0, w.health - 0.02 * Math.abs(T));
      }

      // 医疗站治愈：SICK 工人自动变为 HEALING
      // （由 game-loop.js 中的 clinic tick 处理）

      // HEALING 工人恢复健康
      if (w.state === WorkerState.HEALING) {
        w.health = Math.min(100, w.health + 0.5);
        if (w.health >= 60) {
          w.state = w.assignedBuilding ? WorkerState.WORKING : WorkerState.IDLE;
          w.sickTimestampMs = 0;
          eventBus.emit(GlobalEvents.WORKER_STATE_CHANGE, {
            workerId: w.workerId, newState: w.state,
          });
        }
        continue; // HEALING 工人不处理后续逻辑
      }

      // 心情
      if (w.health < 30) w.mood = Math.max(0, w.mood - 0.1);
      else if (w.hunger > 70 && w.health > 70) w.mood = Math.min(100, w.mood + 0.05);

      // Priority 1: 死亡
      if (w.state === WorkerState.SICK && w.sickTimestampMs && now - w.sickTimestampMs > 3600000) {
        this.killWorker(w, 'sickness');
        continue;
      }
      if (w.zeroHungerTs && now - w.zeroHungerTs > 7200000) {
        this.killWorker(w, 'starvation');
        continue;
      }

      // Priority 2: 生病
      if (w.health < 20 && w.state !== WorkerState.SICK && w.state !== WorkerState.HEALING) {
        // 如果在探索中生病，取消探索
        if (isExploring) {
          w.expeditionId = null;
          w.expeditionStartMs = 0;
        }
        w.state = WorkerState.SICK;
        w.sickTimestampMs = now;
        eventBus.emit(GlobalEvents.WORKER_STATE_CHANGE, {
          workerId: w.workerId, newState: WorkerState.SICK,
        });
        continue;
      }

      // Priority 3: 进食（探索中也进食）
      if (w.hunger < 30 && w.state !== WorkerState.SICK && w.state !== WorkerState.HEALING) {
        if (consumeFood && consumeFood()) {
          w.hunger = 100;
          w.mood = Math.min(100, w.mood + 10);
        } else {
          w.hunger = Math.min(100, w.hunger + 15);
          w.mood = Math.max(0, w.mood - 10);
        }
      }

      // Priority 4: 日常状态恢复（不影响探索中和特殊状态的工人）
      if (w.state === WorkerState.EATING || w.state === WorkerState.SICK ||
          w.state === WorkerState.HEALING || w.state === WorkerState.PROTESTING ||
          w.state === WorkerState.EXPLORING) continue;
      w.state = w.assignedBuilding ? WorkerState.WORKING : WorkerState.IDLE;
    }
  }

  killWorker(w, reason) {
    w.state = WorkerState.DEAD;
    w.assignedBuilding = null;
    w.expeditionId = null;
    w.expeditionStartMs = 0;
    eventBus.emit(GlobalEvents.WORKER_DIED, { workerId: w.workerId, reason });
    for (const other of this.workers) {
      if (other.state !== WorkerState.DEAD) other.mood = Math.max(0, other.mood - 20);
    }
  }
}
