// ==========================================
// game-workers.js
// 幸存者工人管理与行为树
// ==========================================

import { WorkerState, GlobalEvents, eventBus } from './game-constants';

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

  assignToBuilding(workerId, buildingType) {
    const w = this.workers.find(w => w.workerId === workerId);
    if (!w || w.state !== WorkerState.IDLE) return false;
    w.state = WorkerState.WORKING;
    w.assignedBuilding = buildingType;
    return true;
  }

  tickAll(tileTemp, consumeFood) {
    const now = Date.now();
    for (const w of this.workers) {
      if (w.state === WorkerState.DEAD) continue;

      // 饱食度衰减
      const decay = w.state === WorkerState.WORKING ? 0.15 : 0.08;
      w.hunger = Math.max(0, w.hunger - decay);

      // hunger=0 计时
      if (w.hunger <= 0 && !w.zeroHungerTs) w.zeroHungerTs = now;
      else if (w.hunger > 0) w.zeroHungerTs = 0;

      // 健康度结算
      const T = tileTemp || -20;
      if (T >= 0) {
        w.health = Math.min(100, w.health + 0.3);
      } else {
        w.health = Math.max(0, w.health - 0.02 * Math.abs(T));
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
        w.state = WorkerState.SICK;
        w.sickTimestampMs = now;
        eventBus.emit(GlobalEvents.WORKER_STATE_CHANGE, {
          workerId: w.workerId, newState: WorkerState.SICK,
        });
        continue;
      }

      // 治愈恢复
      if (w.state === WorkerState.HEALING && w.health >= 60) {
        w.state = w.assignedBuilding ? WorkerState.WORKING : WorkerState.IDLE;
        w.sickTimestampMs = 0;
      }

      // Priority 3: 进食
      if (w.hunger < 30 && w.state !== WorkerState.SICK && w.state !== WorkerState.HEALING) {
        if (consumeFood && consumeFood()) {
          w.hunger = 100;
          w.mood = Math.min(100, w.mood + 10);
        } else {
          w.hunger = Math.min(100, w.hunger + 15);
          w.mood = Math.max(0, w.mood - 10);
        }
      }

      // Priority 4: 日常
      if (w.state === WorkerState.EATING || w.state === WorkerState.SICK ||
          w.state === WorkerState.HEALING || w.state === WorkerState.PROTESTING) continue;
      w.state = w.assignedBuilding ? WorkerState.WORKING : WorkerState.IDLE;
    }
  }

  killWorker(w, reason) {
    w.state = WorkerState.DEAD;
    w.assignedBuilding = null;
    eventBus.emit(GlobalEvents.WORKER_DIED, { workerId: w.workerId, reason });
    // 全局心情下降
    for (const other of this.workers) {
      if (other.state !== WorkerState.DEAD) other.mood = Math.max(0, other.mood - 20);
    }
  }
}
