// ==========================================
// game-loop.js
// 核心 Tick 心跳与游戏主循环
// ==========================================

import { GAME_CONSTANTS, ResourceType, BuildingType, BuildingState, WorkerState, eventBus, GlobalEvents } from './game-constants';
import { WalletManager } from './game-wallet';
import { BuildingManager } from './game-buildings';
import { WorkerManager } from './game-workers';
import { WeatherManager } from './game-weather';

export class GameLoop {
  constructor() {
    this.wallet = new WalletManager();
    this.buildings = new BuildingManager();
    this.workers = new WorkerManager();
    this.weather = new WeatherManager();

    this.tickCount = 0;
    this.lastSaveTs = Date.now();
    this.aniId = 0;
    this.paused = false;

    // 初始工人
    for (let i = 0; i < 3; i++) {
      this.workers.addWorker();
    }
    // 默认分配1个工人到伐木场
    const lumberCamp = this.buildings.get(BuildingType.LUMBER_CAMP);
    const idle = this.workers.workers.find(w => w.state === WorkerState.IDLE);
    if (idle && lumberCamp) {
      idle.state = WorkerState.WORKING;
      idle.assignedBuilding = BuildingType.LUMBER_CAMP;
      lumberCamp.assignedWorkers.push(idle.workerId);
    }

    // 监听Tick
    eventBus.on(GlobalEvents.TICK_UPDATE, () => this.onTick());
  }

  start() {
    this.aniId = setInterval(() => {
      if (!this.paused) {
        this.tickCount++;
        eventBus.emit(GlobalEvents.TICK_UPDATE, {
          currentTimestamp: Date.now(),
          deltaMs: GAME_CONSTANTS.TICK_INTERVAL_MS,
          tickCount: this.tickCount,
        });
      }
    }, GAME_CONSTANTS.TICK_INTERVAL_MS);
  }

  stop() {
    if (this.aniId) clearInterval(this.aniId);
  }

  onTick() {
    const now = Date.now();
    const temp = this.weather.getGlobalTemperature();
    const coalMult = this.weather.getCoalMultiplier();

    // Phase 1: 天气
    this.weather.tick();

    // Phase 1: 火炉煤炭消耗
    const furnace = this.buildings.get(BuildingType.FURNACE);
    if (furnace.isUnlocked() && furnace.state !== BuildingState.FROZEN) {
      const coalCost = (0.5 + furnace.level * 0.3) * coalMult;
      if (this.wallet.get(ResourceType.COAL) >= coalCost) {
        this.wallet.resources[ResourceType.COAL] -= coalCost;
      } else {
        furnace.state = BuildingState.FROZEN;
        eventBus.emit(GlobalEvents.BUILDING_STATE_CHANGE, {
          buildingId: furnace.instanceId, newState: BuildingState.FROZEN,
        });
      }
    }

    // Phase 2: 工人维生（传入庇护所等级）
    const shelter = this.buildings.get(BuildingType.SHELTER);
    const shelterLevel = shelter.isUnlocked() ? shelter.level : 0;
    this.workers.tickAll(temp, () => {
      if (this.wallet.get(ResourceType.RATION) > 0) {
        this.wallet.resources[ResourceType.RATION]--;
        return true;
      }
      return false;
    }, shelterLevel);

    // Phase 3: 建筑生产 + 特殊建筑逻辑
    for (const b of this.buildings.getUnlocked()) {
      b.tickUpgrade(now);

      // 停工恢复：有工人分配时自动恢复
      if (b.state === BuildingState.HALTED_NO_WORKER) {
        const hasWorker = this.workers.workers.some(
          w => w.assignedBuilding === b.type && w.state === WorkerState.WORKING
        );
        if (hasWorker) {
          b.state = BuildingState.PRODUCING;
        }
      }

      // 停工恢复：原材料充足时自动恢复
      if (b.state === BuildingState.HALTED_NO_MATERIAL) {
        if (b.type === BuildingType.COOKHOUSE) {
          if (this.wallet.get(ResourceType.MEAT) >= 1) {
            b.state = BuildingState.PRODUCING;
          }
        }
      }

      // 生产逻辑
      if (b.state === BuildingState.PRODUCING || b.state === BuildingState.NORMAL) {
        const workersHere = this.workers.workers.filter(
          w => w.assignedBuilding === b.type && w.state === WorkerState.WORKING
        );

        // 医疗站特殊逻辑：治愈生病工人
        if (b.type === BuildingType.CLINIC && workersHere.length > 0) {
          this.tickClinic(b, workersHere.length);
        }

        if (workersHere.length > 0) {
          const output = this.getBuildingOutput(b.type, workersHere.length);
          if (output) {
            const added = this.wallet.add(output.type, output.amount);
            // 厨房没原料时进入停工状态
            if (b.type === BuildingType.COOKHOUSE && added === 0 && output.amount > 0) {
              b.state = BuildingState.HALTED_NO_MATERIAL;
            }
          }
        } else if (b.maxSlots > 0 && b.assignedWorkers.length === 0) {
          // 有槽位但没工人 → 停工
          if (b.type !== BuildingType.FURNACE && b.type !== BuildingType.SHELTER) {
            b.state = BuildingState.HALTED_NO_WORKER;
          }
        }
      }
    }

    // Phase 4: 探索结算
    this.workers.tickExpeditions(this.wallet, this.weather);
  }

  // 医疗站治愈逻辑
  tickClinic(clinic, doctorCount) {
    const healCapacity = Math.max(1, doctorCount); // 每个医生治愈1人
    const sickWorkers = this.workers.workers.filter(w => w.state === WorkerState.SICK);
    let healed = 0;
    for (const w of sickWorkers) {
      if (healed >= healCapacity) break;
      w.state = WorkerState.HEALING;
      w.sickTimestampMs = 0;
      healed++;
      eventBus.emit(GlobalEvents.WORKER_STATE_CHANGE, {
        workerId: w.workerId, newState: WorkerState.HEALING,
      });
    }
  }

  getBuildingOutput(type, workerCount) {
    switch (type) {
      case BuildingType.LUMBER_CAMP:
        return { type: ResourceType.WOOD, amount: 2.0 * workerCount };
      case BuildingType.COAL_MINE:
        return { type: ResourceType.COAL, amount: 1.5 * workerCount };
      case BuildingType.HUNTER_HUT:
        return { type: ResourceType.MEAT, amount: 1.0 * workerCount };
      case BuildingType.COOKHOUSE:
        if (this.wallet.get(ResourceType.MEAT) >= 1 * workerCount) {
          this.wallet.resources[ResourceType.MEAT] -= 1 * workerCount;
          return { type: ResourceType.RATION, amount: 0.8 * workerCount };
        }
        return null;
      // 医疗站和庇护所不产出资源
      case BuildingType.CLINIC:
      case BuildingType.SHELTER:
        return null;
      default:
        return null;
    }
  }
}
