// ==========================================
// game-persistence.js
// 存档系统：wx.setStorage 持久化 + 自动保存
// ==========================================

const SAVE_KEY = 'endless_winter_save';
const SAVE_VERSION = 1;
const AUTO_SAVE_INTERVAL = 30000; // 30秒

export class PersistenceManager {
  constructor(gameLoop) {
    this.game = gameLoop;
    this.autoSaveTimer = null;
    this.lastSaveTs = 0;
  }

  // 启动自动保存
  startAutoSave() {
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
    this.autoSaveTimer = setInterval(() => {
      this.save();
    }, AUTO_SAVE_INTERVAL);
  }

  // 停止自动保存
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // 序列化游戏状态
  serialize() {
    const game = this.game;
    return {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      tickCount: game.tickCount,
      dayTicks: game.dayTicks,
      dayLength: game.dayLength,
      paused: game.paused,
      activeTempBoost: game.activeTempBoost,
      tempBoostTicks: game.tempBoostTicks,
      blizzardSurvived: game._blizzardSurvived,

      wallet: game.wallet.serialize(),
      workers: this.serializeWorkers(),
      buildings: this.serializeBuildings(),
      weather: game.weather.serialize ? game.weather.serialize() : null,
      research: game.research.serialize(),
      trading: game.trading.serialize(),
      achievements: game.achievements.serialize(),
    };
  }

  serializeWorkers() {
    const game = this.game;
    return game.workers.workers.map(w => ({
      workerId: w.workerId,
      name: w.name,
      hunger: w.hunger,
      health: w.health,
      mood: w.mood,
      state: w.state,
      assignedBuilding: w.assignedBuilding,
      sickTimestampMs: w.sickTimestampMs,
      expeditionId: w.expeditionId,
      expeditionStartMs: w.expeditionStartMs,
    }));
  }

  serializeBuildings() {
    const game = this.game;
    const data = {};
    for (const b of game.buildings.getAll()) {
      data[b.type] = {
        level: b.level,
        state: b.state,
        assignedWorkers: [...b.assignedWorkers],
        upgradeStartTimeMs: b.upgradeStartTimeMs,
        upgradeDurationMs: b.upgradeDurationMs,
      };
    }
    return data;
  }

  // 保存到 wx.setStorage
  save() {
    try {
      const data = this.serialize();
      const json = JSON.stringify(data);
      if (typeof wx !== 'undefined' && wx.setStorage) {
        wx.setStorage({ key: SAVE_KEY, data: json });
      }
      this.lastSaveTs = Date.now();
      console.log(`[Save] Game saved (${json.length} bytes, tick=${this.game.tickCount})`);
      return true;
    } catch (e) {
      console.error('[Save] Failed:', e.message);
      return false;
    }
  }

  // 从 wx.setStorage 加载
  load() {
    try {
      if (typeof wx === 'undefined' || !wx.getStorageSync) {
        console.log('[Load] No wx environment, skipping load');
        return false;
      }
      const json = wx.getStorageSync(SAVE_KEY);
      if (!json) {
        console.log('[Load] No save data found');
        return false;
      }
      const data = JSON.parse(json);
      if (data.version !== SAVE_VERSION) {
        console.log(`[Load] Version mismatch: save=${data.version}, current=${SAVE_VERSION}`);
        // 未来可以做版本迁移
        return false;
      }
      this.deserialize(data);
      console.log(`[Load] Game loaded (tick=${this.game.tickCount})`);
      return true;
    } catch (e) {
      console.error('[Load] Failed:', e.message);
      return false;
    }
  }

  // 反序列化游戏状态
  deserialize(data) {
    const game = this.game;

    game.tickCount = data.tickCount || 0;
    game.dayTicks = data.dayTicks || 0;
    game.dayLength = data.dayLength || 120;
    game.paused = data.paused || false;
    game.activeTempBoost = data.activeTempBoost || 0;
    game.tempBoostTicks = data.tempBoostTicks || 0;
    game._blizzardSurvived = data.blizzardSurvived || false;

    // 钱包
    if (data.wallet) game.wallet.deserialize(data.wallet);

    // 工人
    if (data.workers) {
      game.workers.workers = [];
      for (const wd of data.workers) {
        const w = game.workers.addWorker(wd.name);
        Object.assign(w, wd);
      }
    }

    // 建筑
    if (data.buildings) {
      for (const [type, saved] of Object.entries(data.buildings)) {
        const b = game.buildings.get(type);
        if (b) {
          b.level = saved.level;
          b.state = saved.state;
          b.assignedWorkers = saved.assignedWorkers || [];
          b.upgradeStartTimeMs = saved.upgradeStartTimeMs || 0;
          b.upgradeDurationMs = saved.upgradeDurationMs || 0;
        }
      }
    }

    // 天气
    if (data.weather && game.weather.deserialize) {
      game.weather.deserialize(data.weather);
    }

    // 研究
    if (data.research) game.research.deserialize(data.research);

    // 交易
    if (data.trading) game.trading.deserialize(data.trading);

    // 成就
    if (data.achievements) game.achievements.deserialize(data.achievements);
  }

  // 删除存档
  clearSave() {
    try {
      if (typeof wx !== 'undefined' && wx.removeStorage) {
        wx.removeStorage({ key: SAVE_KEY });
      }
      console.log('[Save] Save data cleared');
    } catch (e) {
      console.error('[Clear] Failed:', e.message);
    }
  }
}
