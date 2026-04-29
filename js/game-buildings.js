// ==========================================
// game-buildings.js
// 建筑实例管理与升级状态机
// ==========================================

import {
  BuildingType, BuildingState, ResourceType,
  GlobalEvents, eventBus,
} from './game-constants';

const BUILDING_CONFIGS = {
  [BuildingType.FURNACE]: {
    name: '大火炉', emoji: '🔥',
    baseCost: 100, costType: ResourceType.WOOD, baseTimeSec: 30, baseSlots: 0,
  },
  [BuildingType.LUMBER_CAMP]: {
    name: '伐木场', emoji: '🪓',
    baseCost: 80, costType: ResourceType.WOOD, baseTimeSec: 20, baseSlots: 3,
  },
  [BuildingType.COAL_MINE]: {
    name: '煤矿', emoji: '⛏️',
    baseCost: 120, costType: ResourceType.WOOD, baseTimeSec: 25, baseSlots: 3,
  },
  [BuildingType.HUNTER_HUT]: {
    name: '猎人小屋', emoji: '🏹',
    baseCost: 100, costType: ResourceType.WOOD, baseTimeSec: 20, baseSlots: 2,
  },
  [BuildingType.COOKHOUSE]: {
    name: '厨房', emoji: '🍳',
    baseCost: 150, costType: ResourceType.WOOD, baseTimeSec: 30, baseSlots: 2,
  },
  [BuildingType.CLINIC]: {
    name: '医疗站', emoji: '🏥',
    baseCost: 200, costType: ResourceType.WOOD, baseTimeSec: 40, baseSlots: 2,
  },
  [BuildingType.SHELTER]: {
    name: '庇护所', emoji: '🏠',
    baseCost: 120, costType: ResourceType.WOOD, baseTimeSec: 25, baseSlots: 0,
  },
};

function calcUpgradeCost(baseCost, level) {
  return Math.floor(baseCost * Math.pow(1.5, level - 1));
}

function calcUpgradeTimeMs(baseTimeSec, level) {
  return Math.floor(baseTimeSec * Math.pow(1.2, level - 1)) * 1000;
}

export class Building {
  constructor(type, instanceId) {
    const cfg = BUILDING_CONFIGS[type];
    this.instanceId = instanceId;
    this.type = type;
    this.name = cfg.name;
    this.emoji = cfg.emoji;
    this.level = 0; // 0 = 未建造
    this.state = BuildingState.LOCKED;
    this.maxSlots = cfg.baseSlots;
    this.assignedWorkers = [];
    this.upgradeStartTimeMs = 0;
    this.upgradeDurationMs = 0;
    this.config = cfg;
  }

  isUnlocked() { return this.level > 0; }

  getUpgradeCost() {
    return { [this.config.costType]: calcUpgradeCost(this.config.baseCost, this.level + 1) };
  }

  getUpgradeTimeMs() {
    return calcUpgradeTimeMs(this.config.baseTimeSec, this.level + 1);
  }

  startUpgrade(now) {
    if (this.state !== BuildingState.NORMAL) return false;
    this.state = BuildingState.UPGRADING;
    this.upgradeStartTimeMs = now;
    this.upgradeDurationMs = this.getUpgradeTimeMs();
    eventBus.emit(GlobalEvents.BUILDING_STATE_CHANGE, {
      buildingId: this.instanceId, newState: BuildingState.UPGRADING,
    });
    return true;
  }

  tickUpgrade(now) {
    if (this.state !== BuildingState.UPGRADING) return false;
    if (now - this.upgradeStartTimeMs >= this.upgradeDurationMs) {
      this.level++;
      this.state = BuildingState.NORMAL;
      this.maxSlots = this.config.baseSlots + Math.floor(this.level / 3);
      eventBus.emit(GlobalEvents.BUILDING_UPGRADE_COMPLETE, {
        buildingId: this.instanceId, newLevel: this.level,
      });
      return true;
    }
    return false;
  }
}

export class BuildingManager {
  constructor() {
    this.buildings = {};
    // 初始化所有建筑（LOCKED状态）
    let idx = 0;
    for (const type of Object.values(BuildingType)) {
      this.buildings[type] = new Building(type, `bld_${idx++}`);
    }
    // 默认解锁大火炉（等级1）
    this.buildings[BuildingType.FURNACE].level = 1;
    this.buildings[BuildingType.FURNACE].state = BuildingState.NORMAL;
    // 默认解锁伐木场（等级1）
    this.buildings[BuildingType.LUMBER_CAMP].level = 1;
    this.buildings[BuildingType.LUMBER_CAMP].state = BuildingState.PRODUCING;
  }

  get(type) { return this.buildings[type]; }

  getAll() { return Object.values(this.buildings); }

  getUnlocked() { return this.getAll().filter(b => b.isUnlocked()); }

  tickAll(now) {
    for (const b of this.getAll()) {
      b.tickUpgrade(now);
    }
  }
}
