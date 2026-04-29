// ==========================================
// 60_Persistence_SaveLoad.ts
// 玩家数据本地缓存 (wx.setStorage) 与版本清洗机制
// ==========================================

import { ResourceType, GlobalEvents, eventBus } from '../00_Core/00_Global_Enums';

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 当前存档版本号 */
export const CURRENT_SAVE_VERSION = '1.0.0';

/** 游戏总存档根节点 (Mock 类型，实际需聚合各子系统) */
export interface PlayerSaveData {
  saveVersion: string;
  lastSaveTimestampMs: number;

  // 子系统数据聚合切片 (使用 unknown 避免循环依赖)
  walletData: Record<string, unknown>;
  cityData: Record<string, unknown>;
  workersData: unknown[];
  heroesData: unknown[];
  tutorialProgress: number;
}

/** 存档回调接口 */
export interface SaveCallbacks {
  /** 收集所有子系统数据 */
  collectSaveData: () => Omit<PlayerSaveData, 'saveVersion' | 'lastSaveTimestampMs'>;
  /** 将存档数据注入各子系统 */
  loadSaveData: (data: PlayerSaveData) => void;
}

// ==========================================
// 常量
// ==========================================

const SAVE_KEY = 'GAME_SAVE';
const THROTTLE_INTERVAL_MS = 30000; // 30秒常规节流

// ==========================================
// 核心逻辑 (Core Logic)
// ==========================================

export class SaveManager {
  private callbacks: SaveCallbacks;
  private throttleTimerMs: number = 0;
  private isSaving: boolean = false;
  private currentData: PlayerSaveData | null = null;

  constructor(callbacks: SaveCallbacks) {
    this.callbacks = callbacks;

    // 监听 Tick 驱动节流计时器
    eventBus.on(GlobalEvents.TICK_UPDATE, (payload) => {
      this.throttleTimerMs += (payload.deltaMs as number) ?? 1000;
      if (this.throttleTimerMs >= THROTTLE_INTERVAL_MS) {
        this.asyncSave();
        this.throttleTimerMs = 0;
      }
    });
  }

  // ---------- 4.1 自动存档触发策略 ----------

  /** 模式1: 常规节流存档 (异步) */
  private asyncSave(): void {
    if (this.isSaving) return;
    this.isSaving = true;

    try {
      const data = this.collectSaveData();
      this.writeToStorage(data, false);
    } finally {
      this.isSaving = false;
    }
  }

  /** 模式2: 高危行为强制写盘 (同步) */
  forceSyncSave(): void {
    const data = this.collectSaveData();
    this.writeToStorage(data, true);
  }

  /** 模式3: 生命周期抢救 (onHide/onError 时调用) */
  emergencySave(): void {
    const data = this.collectSaveData();
    this.writeToStorage(data, true);
  }

  // ---------- 4.2 脏数据清洗与版本迁移 ----------

  /**
   * 游戏冷启动时调用
   * @returns 是否成功加载存档
   */
  loadFromStorage(): boolean {
    try {
      // wx.getStorageSync 模拟
      const raw = this.storageRead(SAVE_KEY);
      if (!raw) return false;

      const saveData: PlayerSaveData = JSON.parse(raw);

      // 版本对比与迁移
      if (saveData.saveVersion !== CURRENT_SAVE_VERSION) {
        this.migrateData(saveData);
      }

      // 注入各子系统
      this.callbacks.loadSaveData(saveData);
      this.currentData = saveData;

      eventBus.emit('EVT_GAME_LOADED', { saveVersion: saveData.saveVersion });
      return true;
    } catch (err) {
      console.error('[SaveManager] Load failed:', err);
      return false;
    }
  }

  /**
   * 迁移管线
   * 处理旧版本存档的字段缺失
   */
  private migrateData(data: PlayerSaveData): void {
    // 示例: 0.9.0 缺少 IRON 铁矿记录
    const wallet = data.walletData as Record<ResourceType, number>;
    if (wallet && wallet[ResourceType.IRON] === undefined) {
      wallet[ResourceType.IRON] = 0;
    }

    // 更新版本号
    data.saveVersion = CURRENT_SAVE_VERSION;
    console.log(`[SaveManager] Migrated save data to ${CURRENT_SAVE_VERSION}`);
  }

  // ---------- 内部方法 ----------

  private collectSaveData(): PlayerSaveData {
    const subData = this.callbacks.collectSaveData();
    return {
      ...subData,
      saveVersion: CURRENT_SAVE_VERSION,
      lastSaveTimestampMs: Date.now(),
    };
  }

  private writeToStorage(data: PlayerSaveData, sync: boolean): void {
    try {
      const json = JSON.stringify(data);
      if (sync) {
        this.storageWriteSync(SAVE_KEY, json);
      } else {
        this.storageWrite(SAVE_KEY, json);
      }
      this.currentData = data;
      eventBus.emit('EVT_GAME_SAVED', { timestamp: data.lastSaveTimestampMs });
    } catch (err) {
      console.error('[SaveManager] Save failed:', err);
    }
  }

  // ---------- wx API 模拟 (实际接入时替换) ----------

  private storageRead(key: string): string | null {
    // TODO: 替换为 wx.getStorageSync(key)
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return null;
  }

  private storageWrite(key: string, value: string): void {
    // TODO: 替换为 wx.setStorage({ key, data: value })
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  }

  private storageWriteSync(key: string, value: string): void {
    // TODO: 替换为 wx.setStorageSync(key, value)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  }
}
