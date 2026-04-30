// ==========================================
// game-constants.js
// 全局枚举、常量与事件总线
// ==========================================

// ---- 资源类型 ----
export const ResourceType = {
  WOOD: 'RES_WOOD',
  COAL: 'RES_COAL',
  MEAT: 'RES_MEAT',
  RATION: 'RES_RATION',
  IRON: 'RES_IRON',
  GEM: 'RES_GEM',
};

// ---- 建筑类型 ----
export const BuildingType = {
  FURNACE: 'BLD_FURNACE',
  LUMBER_CAMP: 'BLD_LUMBER_CAMP',
  COAL_MINE: 'BLD_COAL_MINE',
  HUNTER_HUT: 'BLD_HUNTER_HUT',
  COOKHOUSE: 'BLD_COOKHOUSE',
  CLINIC: 'BLD_CLINIC',
  SHELTER: 'BLD_SHELTER',
};

// ---- 建筑状态 ----
export const BuildingState = {
  LOCKED: 0,
  NORMAL: 1,
  UPGRADING: 2,
  PRODUCING: 3,
  HALTED_NO_WORKER: 4,
  HALTED_NO_MATERIAL: 5,
  FROZEN: 6,
};

// ---- 工人状态 ----
export const WorkerState = {
  IDLE: 'WK_IDLE',
  WORKING: 'WK_WORKING',
  EATING: 'WK_EATING',
  SLEEPING: 'WK_SLEEPING',
  SICK: 'WK_SICK',
  HEALING: 'WK_HEALING',
  PROTESTING: 'WK_PROTESTING',
  EXPLORING: 'WK_EXPLORING',
  DEAD: 'WK_DEAD',
};

// ---- 天气类型 ----
export const WeatherType = {
  CLEAR: 'WTH_CLEAR',
  SNOW: 'WTH_SNOW',
  BLIZZARD: 'WTH_BLIZZARD',
};

// ---- 暴风雪状态 ----
export const BlizzardState = {
  IDLE: 'BLZ_IDLE',
  WARNING: 'BLZ_WARNING',
  ACTIVE: 'BLZ_ACTIVE',
  RECOVERY: 'BLZ_RECOVERY',
};

// ---- 全局常量 ----
export const GAME_CONSTANTS = {
  TICK_INTERVAL_MS: 1000,
  OFFLINE_MAX_HOURS: 8,
  BASE_MAP_TEMPERATURE: -20,
  BLIZZARD_TEMP_DROP: -30,
  TILE_SIZE: 32,
  MAP_WIDTH_TILES: 100,
  MAP_HEIGHT_TILES: 100,
};

// ---- 全局事件名 ----
export const GlobalEvents = {
  RESOURCE_CHANGED: 'EVT_RESOURCE_CHANGED',
  BUILDING_UPGRADE_COMPLETE: 'EVT_BUILDING_UPGRADE_COMPLETE',
  BUILDING_STATE_CHANGE: 'EVT_BUILDING_STATE_CHANGE',
  WORKER_STATE_CHANGE: 'EVT_WORKER_STATE_CHANGE',
  WORKER_DIED: 'EVT_WORKER_DIED',
  TICK_UPDATE: 'EVT_TICK_UPDATE',
  WEATHER_CHANGED: 'EVT_WEATHER_CHANGED',
  EXPEDITION_COMPLETE: 'EVT_EXPEDITION_COMPLETE',
};

// ==========================================
// 简易事件总线 (Pub/Sub)
// ==========================================
class EventBus {
  constructor() {
    this._listeners = {};
  }

  on(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }

  off(event, handler) {
    const list = this._listeners[event];
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  }

  emit(event, payload) {
    const list = this._listeners[event];
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      list[i](payload || {});
    }
  }

  clear() {
    this._listeners = {};
  }
}

export const eventBus = new EventBus();

// ---- 探险任务配置 ----
export const EXPEDITION_CONFIGS = [
  { id: 'EXP_WOOD',  name: '伐木远征', durationMs: 30000,  rewardType: ResourceType.WOOD,  minReward: 30, maxReward: 80,  risk: 0.05 },
  { id: 'EXP_COAL',  name: '矿洞探索', durationMs: 60000,  rewardType: ResourceType.COAL,  minReward: 20, maxReward: 50,  risk: 0.10 },
  { id: 'EXP_MEAT',  name: '狩猎行动', durationMs: 45000,  rewardType: ResourceType.MEAT,  minReward: 15, maxReward: 40,  risk: 0.08 },
  { id: 'EXP_IRON',  name: '废墟挖掘', durationMs: 90000,  rewardType: ResourceType.IRON,  minReward: 10, maxReward: 30,  risk: 0.15 },
  { id: 'EXP_GEM',   name: '冰原寻宝', durationMs: 120000, rewardType: ResourceType.GEM,   minReward: 3,  maxReward: 10,  risk: 0.20 },
];
