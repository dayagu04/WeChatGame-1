// ==========================================
// game-loop.js
// 核心 Tick 心跳与游戏主循环
// ==========================================

import { GAME_CONSTANTS, ResourceType, BuildingType, BuildingState, WorkerState, eventBus, GlobalEvents, RANDOM_EVENT_CONFIGS } from './game-constants';
import { WalletManager } from './game-wallet';
import { BuildingManager } from './game-buildings';
import { WorkerManager } from './game-workers';
import { WeatherManager } from './game-weather';
import { ResearchManager } from './game-research';
import { TradingManager } from './game-trading';

export class GameLoop {
  constructor() {
    this.wallet = new WalletManager();
    this.buildings = new BuildingManager();
    this.workers = new WorkerManager();
    this.weather = new WeatherManager();
    this.research = new ResearchManager();
    this.trading = new TradingManager();

    this.tickCount = 0;
    this.lastSaveTs = Date.now();
    this.aniId = 0;
    this.paused = false;

    // 随机事件状态
    this.activeTempBoost = 0;
    this.tempBoostTicks = 0;
    this.eventLog = [];

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
    const envTemp = this.weather.getGlobalTemperature();
    const coalMult = this.weather.getCoalMultiplier();

    // Phase 1: 天气
    this.weather.tick();

    // 温度加成（随机事件暖流）
    if (this.tempBoostTicks > 0) {
      this.tempBoostTicks--;
      if (this.tempBoostTicks <= 0) this.activeTempBoost = 0;
    }

    // Phase 1: 火炉煤炭消耗 + 温度加成
    const furnace = this.buildings.get(BuildingType.FURNACE);
    let warmth = 0;
    if (furnace.isUnlocked() && furnace.state !== BuildingState.FROZEN) {
      const coalCost = (0.5 + furnace.level * 0.3) * coalMult;
      if (this.wallet.get(ResourceType.COAL) >= coalCost) {
        this.wallet.resources[ResourceType.COAL] -= coalCost;
        warmth = furnace.level * 2;
      } else {
        furnace.state = BuildingState.FROZEN;
        eventBus.emit(GlobalEvents.BUILDING_STATE_CHANGE, {
          buildingId: furnace.instanceId, newState: BuildingState.FROZEN,
        });
      }
    }

    // Phase 2: 工人维生（应用研究保暖buff + 庇护所等级）
    const shelter = this.buildings.get(BuildingType.SHELTER);
    const shelterLevel = shelter.isUnlocked() ? shelter.level : 0;
    const coldResist = this.research.getWorkerBuff('COLD_RESIST');
    const effectiveTemp = envTemp + warmth + this.activeTempBoost;
    this.workers.tickAll(effectiveTemp, () => {
      if (this.wallet.get(ResourceType.RATION) > 0) {
        this.wallet.resources[ResourceType.RATION]--;
        return true;
      }
      return false;
    }, shelterLevel, coldResist);

    // Phase 3: 建筑生产 + 特殊建筑逻辑 + 研究
    for (const b of this.buildings.getUnlocked()) {
      b.tickUpgrade(now);

      // 停工恢复
      if (b.state === BuildingState.HALTED_NO_WORKER) {
        const hasWorker = this.workers.workers.some(
          w => w.assignedBuilding === b.type && w.state === WorkerState.WORKING
        );
        if (hasWorker) b.state = BuildingState.PRODUCING;
      }
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

        if (b.type === BuildingType.CLINIC && workersHere.length > 0) {
          const healSpeedBonus = this.research.getWorkerBuff('HEAL_SPEED');
          this.tickClinic(b, workersHere.length, healSpeedBonus);
        }

        if (workersHere.length > 0) {
          const output = this.getBuildingOutput(b.type, workersHere.length);
          if (output) {
            const added = this.wallet.add(output.type, output.amount);
            if (b.type === BuildingType.COOKHOUSE && added === 0 && output.amount > 0) {
              b.state = BuildingState.HALTED_NO_MATERIAL;
            }
          }
        } else if (b.maxSlots > 0 && b.assignedWorkers.length === 0) {
          if (b.type !== BuildingType.FURNACE && b.type !== BuildingType.SHELTER) {
            b.state = BuildingState.HALTED_NO_WORKER;
          }
        }
      }
    }

    // Phase 3.5: 研究推进 + 交易站
    this.research.tick(this.wallet, this.buildings);
    this.trading.tick();

    // Phase 4: 探索结算
    this.workers.tickExpeditions(this.wallet, this.weather);

    // Phase 5: 随机事件
    this.tickRandomEvents();

    this.tickCount++;
  }

  // 医疗站治愈逻辑
  tickClinic(clinic, doctorCount, healSpeedBonus) {
    const bonus = healSpeedBonus || 0;
    const healCapacity = Math.max(1, Math.floor(doctorCount * (1 + bonus)));
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
    const mult = this.research.getOutputMultiplier(type);
    switch (type) {
      case BuildingType.LUMBER_CAMP:
        return { type: ResourceType.WOOD, amount: 2.0 * workerCount * mult };
      case BuildingType.COAL_MINE:
        return { type: ResourceType.COAL, amount: 1.5 * workerCount * mult };
      case BuildingType.HUNTER_HUT:
        return { type: ResourceType.MEAT, amount: 1.0 * workerCount * mult };
      case BuildingType.COOKHOUSE:
        if (this.wallet.get(ResourceType.MEAT) >= 1 * workerCount) {
          this.wallet.resources[ResourceType.MEAT] -= 1 * workerCount;
          return { type: ResourceType.RATION, amount: 0.8 * workerCount * mult };
        }
        return null;
      case BuildingType.CLINIC:
      case BuildingType.SHELTER:
      case BuildingType.WORKSHOP:
      case BuildingType.TRADING_POST:
        return null;
      default:
        return null;
    }
  }

  // 随机事件系统
  tickRandomEvents() {
    for (const evt of RANDOM_EVENT_CONFIGS) {
      if (Math.random() > evt.probability) continue;

      const eff = evt.effect;
      let detail = '';

      switch (eff.type) {
        case 'ADD_RESOURCE': {
          const amount = eff.min + Math.random() * (eff.max - eff.min);
          this.wallet.add(eff.resource, Math.floor(amount));
          detail = `获得 ${Math.floor(amount)} ${eff.resource}`;
          break;
        }
        case 'ADD_WORKER': {
          const w = this.workers.addWorker();
          detail = `${w.name} 加入了营地`;
          break;
        }
        case 'TEMP_BOOST': {
          this.activeTempBoost = eff.value;
          this.tempBoostTicks = eff.durationTicks;
          detail = `温度 +${eff.value}°C，持续 ${eff.durationTicks} tick`;
          break;
        }
        case 'SICK_WORKERS': {
          const alive = this.workers.getAlive().filter(w => w.state === WorkerState.WORKING || w.state === WorkerState.IDLE);
          const toInfect = Math.min(eff.count, alive.length);
          for (let i = 0; i < toInfect; i++) {
            alive[i].state = WorkerState.SICK;
          }
          detail = `${toInfect} 名工人患病`;
          break;
        }
        case 'RANDOM_BUILDING_HALT': {
          const producing = this.buildings.getUnlocked().filter(
            b => b.state === BuildingState.PRODUCING && b.type !== BuildingType.FURNACE
          );
          if (producing.length > 0) {
            const target = producing[Math.floor(Math.random() * producing.length)];
            target.state = BuildingState.HALTED_NO_WORKER;
            detail = `${target.name} 停工`;
          }
          break;
        }
        case 'DAMAGE_WORKERS': {
          const alive = this.workers.getAlive();
          for (const w of alive) {
            w.health = Math.max(0, w.health - eff.damage);
            if (w.health <= 0) {
              w.state = WorkerState.DEAD;
            } else if (w.health < 20) {
              w.state = WorkerState.SICK;
            }
          }
          detail = `全员受伤 -${eff.damage}HP`;
          break;
        }
      }

      const logEntry = { tick: this.tickCount, ...evt, detail };
      this.eventLog.push(logEntry);
      if (this.eventLog.length > 50) this.eventLog.shift();

      eventBus.emit(GlobalEvents.RANDOM_EVENT, {
        eventId: evt.id, name: evt.name, description: evt.description,
        type: evt.type, detail,
      });
    }
  }
}
