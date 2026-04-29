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
      }
    }

    // Phase 2: 工人维生
    this.workers.tickAll(temp, () => {
      if (this.wallet.get(ResourceType.RATION) > 0) {
        this.wallet.resources[ResourceType.RATION]--;
        return true;
      }
      return false;
    });

    // Phase 3: 建筑生产
    for (const b of this.buildings.getUnlocked()) {
      b.tickUpgrade(now);

      if (b.state === BuildingState.PRODUCING || b.state === BuildingState.NORMAL) {
        const workersHere = this.workers.workers.filter(
          w => w.assignedBuilding === b.type && w.state === WorkerState.WORKING
        );
        if (workersHere.length > 0) {
          const output = this.getBuildingOutput(b.type, workersHere.length);
          if (output) {
            this.wallet.add(output.type, output.amount);
          }
        }
      }
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
        // 加工：消耗生肉产出熟食
        if (this.wallet.get(ResourceType.MEAT) >= 1 * workerCount) {
          this.wallet.resources[ResourceType.MEAT] -= 1 * workerCount;
          return { type: ResourceType.RATION, amount: 0.8 * workerCount };
        }
        return null;
      default:
        return null;
    }
  }
}
