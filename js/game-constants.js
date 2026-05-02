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
  WORKSHOP: 'BLD_WORKSHOP',
  TRADING_POST: 'BLD_TRADING_POST',
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
  RESEARCH_START: 'EVT_RESEARCH_START',
  RESEARCH_COMPLETE: 'EVT_RESEARCH_COMPLETE',
  TECH_STATE_CHANGE: 'EVT_TECH_STATE_CHANGE',
  RANDOM_EVENT: 'EVT_RANDOM_EVENT',
  TRADE_COMPLETE: 'EVT_TRADE_COMPLETE',
  CARAVAN_ARRIVE: 'EVT_CARAVAN_ARRIVE',
  CARAVAN_DEPART: 'EVT_CARAVAN_DEPART',
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

// ---- 科技状态 ----
export const TechState = {
  LOCKED: 0,
  AVAILABLE: 1,
  RESEARCHING: 2,
  DONE: 3,
};

// ---- 科技树配置 ----
export const TECH_CONFIGS = [
  {
    id: 'TECH_WORKSHOP',
    name: '研究工坊',
    description: '解锁研究工坊建筑',
    category: 'UNLOCK',
    cost: { [ResourceType.WOOD]: 300, [ResourceType.COAL]: 200 },
    durationMs: 30000,
    prerequisites: [],
    effect: { type: 'UNLOCK_BUILDING', target: BuildingType.WORKSHOP },
  },
  {
    id: 'TECH_EFFICIENT_LUMBER',
    name: '高效伐木',
    description: '伐木场产量 +30%',
    category: 'PRODUCTION',
    cost: { [ResourceType.WOOD]: 200, [ResourceType.GEM]: 5 },
    durationMs: 60000,
    prerequisites: [],
    effect: { type: 'BUILDING_OUTPUT_MULT', target: BuildingType.LUMBER_CAMP, value: 0.3 },
  },
  {
    id: 'TECH_DEEP_MINING',
    name: '深层开采',
    description: '煤矿产量 +30%',
    category: 'PRODUCTION',
    cost: { [ResourceType.COAL]: 300, [ResourceType.GEM]: 8 },
    durationMs: 90000,
    prerequisites: [],
    effect: { type: 'BUILDING_OUTPUT_MULT', target: BuildingType.COAL_MINE, value: 0.3 },
  },
  {
    id: 'TECH_EFFICIENT_HUNT',
    name: '精准狩猎',
    description: '猎人小屋产量 +30%',
    category: 'PRODUCTION',
    cost: { [ResourceType.MEAT]: 150, [ResourceType.WOOD]: 100, [ResourceType.GEM]: 5 },
    durationMs: 60000,
    prerequisites: [],
    effect: { type: 'BUILDING_OUTPUT_MULT', target: BuildingType.HUNTER_HUT, value: 0.3 },
  },
  {
    id: 'TECH_ADVANCED_COOK',
    name: '高级烹饪',
    description: '厨房效率 +50%',
    category: 'PRODUCTION',
    cost: { [ResourceType.RATION]: 200, [ResourceType.GEM]: 10 },
    durationMs: 90000,
    prerequisites: ['TECH_WORKSHOP'],
    effect: { type: 'BUILDING_OUTPUT_MULT', target: BuildingType.COOKHOUSE, value: 0.5 },
  },
  {
    id: 'TECH_INSULATION',
    name: '保暖技术',
    description: '工人低温掉血 -20%',
    category: 'SURVIVAL',
    cost: { [ResourceType.WOOD]: 400, [ResourceType.COAL]: 100 },
    durationMs: 60000,
    prerequisites: [],
    effect: { type: 'WORKER_BUFF', target: 'COLD_RESIST', value: 0.2 },
  },
  {
    id: 'TECH_HERBAL_MEDICINE',
    name: '草药学',
    description: '医疗站治愈速度 +50%',
    category: 'SURVIVAL',
    cost: { [ResourceType.MEAT]: 200, [ResourceType.GEM]: 15 },
    durationMs: 90000,
    prerequisites: ['TECH_INSULATION'],
    effect: { type: 'WORKER_BUFF', target: 'HEAL_SPEED', value: 0.5 },
  },
];

// ---- 随机事件配置 ----
export const RANDOM_EVENT_CONFIGS = [
  {
    id: 'EVT_SUPPLY_DROP',
    name: '补给空投',
    description: '一架飞机投下了物资箱！',
    type: 'POSITIVE',
    probability: 0.08,
    effect: { type: 'ADD_RESOURCE', resource: ResourceType.RATION, min: 10, max: 30 },
  },
  {
    id: 'EVT_WANDERER',
    name: '流浪者',
    description: '一个流浪者请求加入你的营地。',
    type: 'POSITIVE',
    probability: 0.05,
    effect: { type: 'ADD_WORKER' },
  },
  {
    id: 'EVT_MILD_WEATHER',
    name: '暖流',
    description: '一股暖流经过，温度暂时上升。',
    type: 'POSITIVE',
    probability: 0.10,
    effect: { type: 'TEMP_BOOST', value: 10, durationTicks: 30 },
  },
  {
    id: 'EVT_DISEASE',
    name: '瘟疫',
    description: '疾病在营地中蔓延！',
    type: 'NEGATIVE',
    probability: 0.04,
    effect: { type: 'SICK_WORKERS', count: 2 },
  },
  {
    id: 'EVT_EQUIPMENT_BREAK',
    name: '设备损坏',
    description: '一台设备因严寒损坏了。',
    type: 'NEGATIVE',
    probability: 0.06,
    effect: { type: 'RANDOM_BUILDING_HALT' },
  },
  {
    id: 'EVT_WOLF_ATTACK',
    name: '狼群袭击',
    description: '狼群袭击了营地！',
    type: 'NEGATIVE',
    probability: 0.03,
    effect: { type: 'DAMAGE_WORKERS', damage: 15 },
  },
  {
    id: 'EVT_RESOURCE_VEIN',
    name: '矿脉发现',
    description: '探索中发现了一处矿脉！',
    type: 'POSITIVE',
    probability: 0.06,
    effect: { type: 'ADD_RESOURCE', resource: ResourceType.IRON, min: 5, max: 20 },
  },
];
