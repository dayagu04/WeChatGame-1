// ==========================================
// 00_Global_Enums.ts
// 全局核心枚举字典、常量与事件名定义
// ==========================================

// ==========================================
// 1. 资源与经济体系 (Resource & Economy)
// ==========================================
export enum ResourceType {
  WOOD = 'RES_WOOD',       // 木材：基础建筑材料
  COAL = 'RES_COAL',       // 煤炭：火炉燃烧核心消耗品
  MEAT = 'RES_MEAT',       // 生肉：食物来源
  RATION = 'RES_RATION',   // 熟食：由生肉加工，影响工人饱食度
  IRON = 'RES_IRON',       // 铁矿：中后期高级建筑材料
  GEM = 'RES_GEM',         // 钻石/点券：高级付费货币
}

// ==========================================
// 2. 建筑系统 (Building System)
// ==========================================
export enum BuildingType {
  FURNACE = 'BLD_FURNACE',           // 大火炉 (核心建筑，控制温度辐射)
  LUMBER_CAMP = 'BLD_LUMBER_CAMP',   // 伐木场
  COAL_MINE = 'BLD_COAL_MINE',       // 煤矿
  HUNTER_HUT = 'BLD_HUNTER_HUT',     // 猎人小屋
  COOKHOUSE = 'BLD_COOKHOUSE',       // 厨房 (生肉转熟食)
  CLINIC = 'BLD_CLINIC',             // 医疗站 (治疗生病工人)
  SHELTER = 'BLD_SHELTER',           // 庇护所 (提供工人床位)
}

export enum BuildingState {
  LOCKED = 0,             // 未解锁 (前置科技或等级未达到)
  NORMAL = 1,             // 正常运作/闲置中
  UPGRADING = 2,          // 升级中
  PRODUCING = 3,          // 生产中 (需分配工人)
  HALTED_NO_WORKER = 4,   // 停工：无工人
  HALTED_NO_MATERIAL = 5, // 停工：无原材料 (如厨房无生肉)
  FROZEN = 6,             // 冻结：温度过低导致建筑瘫痪
}

// ==========================================
// 3. NPC/工人状态机 (Worker State Machine)
// ==========================================
export enum WorkerState {
  IDLE = 'WK_IDLE',             // 空闲 (四处游荡)
  WORKING = 'WK_WORKING',       // 工作中 (在指派的建筑内产出资源)
  EATING = 'WK_EATING',         // 进食中 (前往厨房消耗熟食)
  SLEEPING = 'WK_SLEEPING',     // 睡眠中 (恢复精力)
  SICK = 'WK_SICK',             // 生病 (温度过低触发，停止工作)
  HEALING = 'WK_HEALING',       // 治疗中 (在医疗站内)
  PROTESTING = 'WK_PROTESTING', // 罢工抗议 (心情极度低下触发)
  DEAD = 'WK_DEAD',             // 死亡 (长时间生病或饥饿导致，将永久扣除人口)
}

// ==========================================
// 4. 英雄与战斗 (Hero & Combat)
// ==========================================
export enum HeroClass {
  INFANTRY = 'CLS_INFANTRY',   // 步兵 (高防低攻，前排)
  MARKSMAN = 'CLS_MARKSMAN',   // 射手 (高攻低防，后排)
  LANCER = 'CLS_LANCER',       // 枪兵 (克制特定兵种/野兽，中排)
}

// ==========================================
// 5. 环境与天气 (Environment & Weather)
// ==========================================
export enum WeatherType {
  CLEAR = 'WTH_CLEAR',       // 晴朗 (基础温度衰减正常)
  SNOW = 'WTH_SNOW',         // 下雪 (基础温度下降，煤炭消耗增加)
  BLIZZARD = 'WTH_BLIZZARD', // 暴风雪 (灾难事件，温度急剧下降，极高几率致病)
}

// ==========================================
// 6. 全局常量 (Global Constants)
// ==========================================
export const GAME_CONSTANTS = {
  // 时间基准
  TICK_INTERVAL_MS: 1000,       // 逻辑帧间隔：1000毫秒 = 1个逻辑Tick
  OFFLINE_MAX_HOURS: 8,         // 离线收益最大累积时长：8小时

  // 环境基准
  BASE_MAP_TEMPERATURE: -20,    // 初始地图基础温度 (摄氏度)
  BLIZZARD_TEMP_DROP: -30,      // 暴风雪额外降温惩罚

  // 网格与寻路系统 (Grid System)
  TILE_SIZE: 32,                // 地图基础网格大小 (用于建筑占地和NPC寻路计算)
  MAP_WIDTH_TILES: 100,         // 地图宽度 (网格数)
  MAP_HEIGHT_TILES: 100,        // 地图高度 (网格数)
} as const;

// ==========================================
// 7. 全局事件总线触发器 (Global Event Bus / Triggers)
// ==========================================
export enum GlobalEvents {
  // 资源事件
  RESOURCE_CHANGED = 'EVT_RESOURCE_CHANGED',

  // 建筑事件
  BUILDING_UPGRADE_COMPLETE = 'EVT_BUILDING_UPGRADE_COMPLETE',
  BUILDING_STATE_CHANGE = 'EVT_BUILDING_STATE_CHANGE',

  // 生存与NPC事件
  WORKER_STATE_CHANGE = 'EVT_WORKER_STATE_CHANGE',
  WORKER_DIED = 'EVT_WORKER_DIED',

  // 环境与系统事件
  TICK_UPDATE = 'EVT_TICK_UPDATE',
  WEATHER_CHANGED = 'EVT_WEATHER_CHANGED',
}

// ==========================================
// 8. 简易事件总线 (Simple Event Bus - Pub/Sub)
// ==========================================
export type EventPayload = Record<string, unknown>;

type EventHandler = (payload: EventPayload) => void;

class EventBus {
  private listeners: Map<string, Set<EventHandler>> = new Map();

  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, payload?: EventPayload): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload ?? {});
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const eventBus = new EventBus();
