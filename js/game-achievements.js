// ==========================================
// game-achievements.js
// 成就系统：里程碑检测与奖励发放
// ==========================================

import { ResourceType, GlobalEvents, eventBus } from './game-constants';

export const ACHIEVEMENT_CONFIGS = [
  {
    id: 'ACH_FIRST_BUILD',
    name: '基地初成',
    description: '建造任意建筑',
    reward: { [ResourceType.WOOD]: 50 },
    check: (game) => game.buildings.getUnlocked().length >= 3, // 火炉+伐木场+1
  },
  {
    id: 'ACH_ALL_BUILDINGS',
    name: '百废待兴',
    description: '解锁所有建筑',
    reward: { [ResourceType.GEM]: 10 },
    check: (game) => {
      const all = game.buildings.getAll();
      return all.every(b => b.isUnlocked());
    },
  },
  {
    id: 'ACH_POPULATION_10',
    name: '人丁兴旺',
    description: '幸存者达到 10 人',
    reward: { [ResourceType.MEAT]: 100 },
    check: (game) => game.workers.getAlive().length >= 10,
  },
  {
    id: 'ACH_RESEARCH_5',
    name: '学者',
    description: '完成 5 项科技',
    reward: { [ResourceType.GEM]: 20 },
    check: (game) => game.research.getCompleted().length >= 5,
  },
  {
    id: 'ACH_TRADE_10',
    name: '商业大亨',
    description: '完成 10 次交易',
    reward: { [ResourceType.IRON]: 50 },
    check: (game) => game.trading.totalTrades >= 10,
  },
  {
    id: 'ACH_SURVIVE_BLIZZARD',
    name: '风雪无阻',
    description: '存活过一场暴风雪',
    reward: { [ResourceType.COAL]: 200 },
    check: (game) => game._blizzardSurvived === true,
  },
  {
    id: 'ACH_DAY_10',
    name: '十日求生',
    description: '存活 10 天',
    reward: { [ResourceType.WOOD]: 500 },
    check: (game) => game.tickCount >= game.dayLength * 10,
  },
  {
    id: 'ACH_ALL_RESEARCH',
    name: '全知全能',
    description: '完成所有科技',
    reward: { [ResourceType.GEM]: 50 },
    check: (game) => {
      const all = game.research.getAll();
      return all.length > 0 && all.every(t => t.state === 3 /* DONE */);
    },
  },
  {
    id: 'ACH_UPGRADE_5',
    name: '精益求精',
    description: '将任意建筑升至5级',
    reward: { [ResourceType.IRON]: 30 },
    check: (game) => game.buildings.getUnlocked().some(b => b.level >= 5),
  },
  {
    id: 'ACH_RESOURCE_STOCKPILE',
    name: '未雨绸缪',
    description: '同时拥有500木材和500煤炭',
    reward: { [ResourceType.GEM]: 15 },
    check: (game) => game.wallet.get(ResourceType.WOOD) >= 500 && game.wallet.get(ResourceType.COAL) >= 500,
  },
  {
    id: 'ACH_MORALE_90',
    name: '众志成城',
    description: '营地士气达到90',
    reward: { [ResourceType.RATION]: 50 },
    check: (game) => game.campMorale >= 90,
  },
  {
    id: 'ACH_DAY_30',
    name: '月度 survivor',
    description: '存活30天',
    reward: { [ResourceType.GEM]: 30 },
    check: (game) => game.tickCount >= game.dayLength * 30,
  },
  {
    id: 'ACH_SPEED_3X',
    name: '快节奏',
    description: '使用3倍速游戏',
    reward: { [ResourceType.WOOD]: 100 },
    check: (game) => game.gameSpeed === 3,
  },
  {
    id: 'ACH_ALL_WORKERS_ALIVE',
    name: '零伤亡',
    description: '保持10名工人全部存活',
    reward: { [ResourceType.MEAT]: 200 },
    check: (game) => game.workers.getAlive().length >= 10 && game.workers.workers.filter(w => w.state === 'WRK_DEAD').length === 0,
  },
];

export class AchievementManager {
  constructor() {
    this.achievements = new Map();
    for (const cfg of ACHIEVEMENT_CONFIGS) {
      this.achievements.set(cfg.id, {
        id: cfg.id,
        name: cfg.name,
        description: cfg.description,
        reward: cfg.reward,
        unlocked: false,
        check: cfg.check,
      });
    }
    this.unlockCount = 0;
  }

  get(id) {
    return this.achievements.get(id);
  }

  getAll() {
    return Array.from(this.achievements.values());
  }

  getUnlocked() {
    return this.getAll().filter(a => a.unlocked);
  }

  getLocked() {
    return this.getAll().filter(a => !a.unlocked);
  }

  // 每 tick 检查所有未完成成就
  tick(game) {
    for (const [, ach] of this.achievements) {
      if (ach.unlocked) continue;
      try {
        if (ach.check(game)) {
          ach.unlocked = true;
          this.unlockCount++;
          // 发放奖励
          if (game.wallet && ach.reward) {
            for (const [res, amount] of Object.entries(ach.reward)) {
              game.wallet.add(res, amount);
            }
          }
          eventBus.emit(GlobalEvents.ACHIEVEMENT_UNLOCK, {
            achievementId: ach.id,
            name: ach.name,
            description: ach.description,
            reward: ach.reward,
          });
        }
      } catch (e) {
        // 检查函数出错不影响其他成就
      }
    }
  }

  serialize() {
    const data = {};
    for (const [id, ach] of this.achievements) {
      data[id] = { unlocked: ach.unlocked };
    }
    return { achievements: data, unlockCount: this.unlockCount };
  }

  deserialize(data) {
    if (!data || !data.achievements) return;
    for (const [id, saved] of Object.entries(data.achievements)) {
      const ach = this.achievements.get(id);
      if (ach) ach.unlocked = saved.unlocked;
    }
    this.unlockCount = data.unlockCount || this.getUnlocked().length;
  }
}
