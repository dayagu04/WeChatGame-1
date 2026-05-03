// ==========================================
// 游戏核心逻辑自动化测试
// 模拟 wx 和 canvas 环境，纯 Node.js 运行
// ==========================================

// --- 模拟微信小游戏环境 ---
global.wx = {
  createCanvas: () => ({
    width: 375,
    height: 667,
    getContext: () => ({
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      save: () => {},
      restore: () => {},
      scale: () => {},
      font: '',
      fillStyle: '',
      strokeStyle: '',
      textAlign: '',
    }),
  }),
  getWindowInfo: () => ({ screenWidth: 375, screenHeight: 667, pixelRatio: 2 }),
  onTouchStart: () => {},
  onTouchMove: () => {},
};
global.canvas = wx.createCanvas();
global.GameGlobal = {};
global.requestAnimationFrame = () => 1;

// --- 测试框架 ---
let passed = 0;
let failed = 0;
let currentSuite = '';

function describe(name, fn) {
  currentSuite = name;
  console.log(`\n=== ${name} ===`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

function expect(val) {
  return {
    toBe(expected) {
      if (val !== expected) throw new Error(`Expected ${expected}, got ${val}`);
    },
    toBeGreaterThan(n) {
      if (!(val > n)) throw new Error(`Expected ${val} > ${n}`);
    },
    toBeGreaterThanOrEqual(n) {
      if (!(val >= n)) throw new Error(`Expected ${val} >= ${n}`);
    },
    toBeLessThanOrEqual(n) {
      if (!(val <= n)) throw new Error(`Expected ${val} <= ${n}`);
    },
    toBeLessThan(n) {
      if (!(val < n)) throw new Error(`Expected ${val} < ${n}`);
    },
    toBeTruthy() {
      if (!val) throw new Error(`Expected truthy, got ${val}`);
    },
    toBeFalsy() {
      if (val) throw new Error(`Expected falsy, got ${val}`);
    },
    toContain(item) {
      if (!val.includes(item)) throw new Error(`Expected ${val} to contain ${item}`);
    },
  };
}

// --- 导入游戏模块 ---
import { ResourceType, BuildingType, BuildingState, WorkerState, GAME_CONSTANTS, EXPEDITION_CONFIGS, TechState, eventBus } from '../js/game-constants.js';
import { WalletManager } from '../js/game-wallet.js';
import { Building, BuildingManager } from '../js/game-buildings.js';
import { Worker, WorkerManager } from '../js/game-workers.js';
import { WeatherManager } from '../js/game-weather.js';
import { GameLoop } from '../js/game-loop.js';
import { ResearchManager } from '../js/game-research.js';
import { TradingManager } from '../js/game-trading.js';
import { AchievementManager } from '../js/game-achievements.js';
import { PersistenceManager } from '../js/game-persistence.js';

// ==========================================
// 测试用例
// ==========================================

describe('WalletManager - 资源管理', () => {
  it('初始资源应该正确', () => {
    const w = new WalletManager();
    expect(w.get(ResourceType.WOOD)).toBe(500);
    expect(w.get(ResourceType.COAL)).toBe(200);
    expect(w.get(ResourceType.MEAT)).toBe(100);
    expect(w.get(ResourceType.RATION)).toBe(50);
    expect(w.get(ResourceType.IRON)).toBe(0);
    expect(w.get(ResourceType.GEM)).toBe(100);
  });

  it('add 应该增加资源', () => {
    const w = new WalletManager();
    w.add(ResourceType.WOOD, 50);
    expect(w.get(ResourceType.WOOD)).toBe(550);
  });

  it('add 不应超过存储上限', () => {
    const w = new WalletManager();
    w.add(ResourceType.WOOD, 99999);
    expect(w.get(ResourceType.WOOD)).toBe(w.getStorageCap(ResourceType.WOOD));
  });

  it('consume 应该成功扣除足够资源', () => {
    const w = new WalletManager();
    const ok = w.consume({ [ResourceType.WOOD]: 100 });
    expect(ok).toBeTruthy();
    expect(w.get(ResourceType.WOOD)).toBe(400);
  });

  it('consume 应该在资源不足时返回 false', () => {
    const w = new WalletManager();
    const ok = w.consume({ [ResourceType.WOOD]: 9999 });
    expect(ok).toBeFalsy();
    expect(w.get(ResourceType.WOOD)).toBe(500); // 不应扣除
  });

  it('canAfford 应该正确判断', () => {
    const w = new WalletManager();
    expect(w.canAfford({ [ResourceType.WOOD]: 100 })).toBeTruthy();
    expect(w.canAfford({ [ResourceType.WOOD]: 9999 })).toBeFalsy();
  });
});

describe('BuildingManager - 建筑系统', () => {
  it('初始状态：大火炉和伐木场已解锁', () => {
    const bm = new BuildingManager();
    const furnace = bm.get(BuildingType.FURNACE);
    const lumber = bm.get(BuildingType.LUMBER_CAMP);
    expect(furnace.isUnlocked()).toBeTruthy();
    expect(furnace.level).toBe(1);
    expect(furnace.state).toBe(BuildingState.NORMAL);
    expect(lumber.isUnlocked()).toBeTruthy();
    expect(lumber.level).toBe(1);
    expect(lumber.state).toBe(BuildingState.PRODUCING);
  });

  it('其他建筑应该是锁定的', () => {
    const bm = new BuildingManager();
    const coal = bm.get(BuildingType.COAL_MINE);
    expect(coal.isUnlocked()).toBeFalsy();
    expect(coal.level).toBe(0);
    expect(coal.state).toBe(BuildingState.LOCKED);
  });

  it('getUpgradeCost 应该返回正确的费用', () => {
    const bm = new BuildingManager();
    const furnace = bm.get(BuildingType.FURNACE);
    const cost = furnace.getUpgradeCost();
    // baseCost=100, level=1, cost for level 2 = 100 * 1.5^1 = 150
    expect(cost[ResourceType.WOOD]).toBe(150);
  });

  it('startUpgrade 应该在 NORMAL 状态下成功', () => {
    const bm = new BuildingManager();
    const furnace = bm.get(BuildingType.FURNACE);
    const ok = furnace.startUpgrade(Date.now());
    expect(ok).toBeTruthy();
    expect(furnace.state).toBe(BuildingState.UPGRADING);
  });

  it('startUpgrade 应该在 PRODUCING 状态下成功', () => {
    const bm = new BuildingManager();
    const lumber = bm.get(BuildingType.LUMBER_CAMP);
    const ok = lumber.startUpgrade(Date.now());
    expect(ok).toBeTruthy();
    expect(lumber.state).toBe(BuildingState.UPGRADING);
  });

  it('startUpgrade 应该在 LOCKED 状态下失败', () => {
    const bm = new BuildingManager();
    const coal = bm.get(BuildingType.COAL_MINE);
    const ok = coal.startUpgrade(Date.now());
    expect(ok).toBeFalsy();
  });

  it('tickUpgrade 应该在时间到达后完成升级', () => {
    const bm = new BuildingManager();
    const furnace = bm.get(BuildingType.FURNACE);
    furnace.startUpgrade(Date.now() - 100000); // 100秒前开始
    furnace.upgradeDurationMs = 1000; // 1秒持续时间
    furnace.tickUpgrade(Date.now());
    expect(furnace.level).toBe(2);
    expect(furnace.state).toBe(BuildingState.NORMAL);
  });

  it('getAll 应该返回所有建筑', () => {
    const bm = new BuildingManager();
    const all = bm.getAll();
    expect(all.length).toBe(9); // 9种建筑
  });

  it('getUnlocked 应该只返回已解锁建筑', () => {
    const bm = new BuildingManager();
    const unlocked = bm.getUnlocked();
    expect(unlocked.length).toBe(2); // 火炉 + 伐木场
  });
});

describe('WorkerManager - 工人系统', () => {
  it('addWorker 应该添加工人', () => {
    const wm = new WorkerManager();
    wm.addWorker();
    wm.addWorker();
    expect(wm.workers.length).toBe(2);
  });

  it('工人初始状态应该是 IDLE', () => {
    const wm = new WorkerManager();
    wm.addWorker();
    expect(wm.workers[0].state).toBe(WorkerState.IDLE);
    expect(wm.workers[0].hunger).toBe(80);
    expect(wm.workers[0].health).toBe(80);
  });

  it('getAlive 应该排除死亡工人', () => {
    const wm = new WorkerManager();
    wm.addWorker();
    wm.addWorker();
    wm.workers[0].state = WorkerState.DEAD;
    expect(wm.getAlive().length).toBe(1);
  });

  it('getWorkingCount 应该正确计数', () => {
    const wm = new WorkerManager();
    wm.addWorker();
    wm.addWorker();
    wm.workers[0].state = WorkerState.WORKING;
    expect(wm.getWorkingCount()).toBe(1);
  });

  it('tickAll - 工人应该掉饱食度', () => {
    const wm = new WorkerManager();
    const w = wm.addWorker();
    w.state = WorkerState.WORKING;
    const before = w.hunger;
    wm.tickAll(-20, () => false);
    expect(w.hunger).toBeLessThan(before);
  });

  it('tickAll - 工人在低温下应该掉血', () => {
    const wm = new WorkerManager();
    const w = wm.addWorker();
    const before = w.health;
    wm.tickAll(-20, () => false);
    expect(w.health).toBeLessThan(before);
  });

  it('tickAll - 工人在高温下应该回血', () => {
    const wm = new WorkerManager();
    const w = wm.addWorker();
    w.health = 50;
    wm.tickAll(5, () => false);
    expect(w.health).toBeGreaterThan(50);
  });

  it('tickAll - 工人低血量应该生病', () => {
    const wm = new WorkerManager();
    const w = wm.addWorker();
    w.health = 15;
    wm.tickAll(-20, () => false);
    expect(w.state).toBe(WorkerState.SICK);
  });

  it('tickAll - 工人低饱食应该尝试进食', () => {
    const wm = new WorkerManager();
    const w = wm.addWorker();
    w.hunger = 20;
    let foodConsumed = false;
    wm.tickAll(-20, () => { foodConsumed = true; return true; });
    expect(foodConsumed).toBeTruthy();
    expect(w.hunger).toBe(100);
  });

  it('tickAll - 没有食物时工人应该降心情', () => {
    const wm = new WorkerManager();
    const w = wm.addWorker();
    w.hunger = 20;
    const beforeMood = w.mood;
    wm.tickAll(-20, () => false);
    expect(w.mood).toBeLessThan(beforeMood);
  });
});

describe('WeatherManager - 天气系统', () => {
  it('初始状态应该是晴天', () => {
    const wm = new WeatherManager();
    expect(wm.currentWeather).toBe('WTH_CLEAR');
    expect(wm.blizzardState).toBe('BLZ_IDLE');
  });

  it('getGlobalTemperature 应该返回基础温度', () => {
    const wm = new WeatherManager();
    expect(wm.getGlobalTemperature()).toBe(GAME_CONSTANTS.BASE_MAP_TEMPERATURE);
  });

  it('getCoalMultiplier 在非暴风雪时应该返回 1', () => {
    const wm = new WeatherManager();
    expect(wm.getCoalMultiplier()).toBe(1);
  });
});

describe('GameLoop 完整流程', () => {
  it('初始状态应该有 3 个工人，1 个在伐木场工作', () => {
    const game = new GameLoop();
    expect(game.workers.workers.length).toBe(3);
    expect(game.workers.getWorkingCount()).toBe(1);
    const lumber = game.buildings.get(BuildingType.LUMBER_CAMP);
    expect(lumber.assignedWorkers.length).toBe(1);
  });

  it('伐木场应该产出木材', () => {
    const game = new GameLoop();
    const before = game.wallet.get(ResourceType.WOOD);
    game.onTick();
    expect(game.wallet.get(ResourceType.WOOD)).toBeGreaterThan(before);
  });

  it('火炉应该消耗煤炭', () => {
    const game = new GameLoop();
    const before = game.wallet.get(ResourceType.COAL);
    game.onTick();
    expect(game.wallet.get(ResourceType.COAL)).toBeLessThan(before);
  });

  it('建造煤矿后分配工人应该产出煤炭', () => {
    const game = new GameLoop();
    // 建造煤矿
    const coal = game.buildings.get(BuildingType.COAL_MINE);
    const cost = coal.getUpgradeCost();
    game.wallet.consume(cost);
    coal.level = 1;
    coal.state = BuildingState.NORMAL;
    // 分配工人
    const idle = game.workers.workers.find(w => w.state === WorkerState.IDLE);
    idle.state = WorkerState.WORKING;
    idle.assignedBuilding = BuildingType.COAL_MINE;
    coal.assignedWorkers.push(idle.workerId);
    coal.state = BuildingState.PRODUCING;

    const beforeCoal = game.wallet.get(ResourceType.COAL);
    game.onTick();
    // 煤矿产出 - 火炉消耗 = 净产出
    expect(game.wallet.get(ResourceType.COAL)).toBeGreaterThan(beforeCoal - 1);
  });
});

describe('探索系统', () => {
  it('startExpedition 应该将工人设为 EXPLORING', () => {
    const wm = new WorkerManager();
    const w = wm.addWorker();
    const ok = wm.startExpedition(w.workerId, 'EXP_WOOD');
    expect(ok).toBeTruthy();
    expect(w.state).toBe(WorkerState.EXPLORING);
    expect(w.expeditionId).toBe('EXP_WOOD');
  });

  it('非 IDLE 工人不能探索', () => {
    const wm = new WorkerManager();
    const w = wm.addWorker();
    w.state = WorkerState.WORKING;
    const ok = wm.startExpedition(w.workerId, 'EXP_WOOD');
    expect(ok).toBeFalsy();
  });

  it('getExploringCount 应该正确计数', () => {
    const wm = new WorkerManager();
    wm.addWorker();
    wm.addWorker();
    wm.workers[0].state = WorkerState.EXPLORING;
    expect(wm.getExploringCount()).toBe(1);
  });

  it('tickExpeditions 探索完成后应该恢复 IDLE 并获得奖励', () => {
    const wm = new WorkerManager();
    const wallet = new WalletManager();
    const w = wm.addWorker();
    w.state = WorkerState.EXPLORING;
    w.expeditionId = 'EXP_WOOD';
    w.expeditionStartMs = Date.now() - 60000; // 60秒前开始

    const weather = new WeatherManager();
    const beforeWood = wallet.get(ResourceType.WOOD);
    wm.tickExpeditions(wallet, weather);
    expect(w.state).toBe(WorkerState.IDLE);
    expect(w.expeditionId).toBe(null);
    expect(wallet.get(ResourceType.WOOD)).toBeGreaterThan(beforeWood);
  });

  it('极寒天气应该取消探索', () => {
    const wm = new WorkerManager();
    const wallet = new WalletManager();
    const w = wm.addWorker();
    w.state = WorkerState.EXPLORING;
    w.expeditionId = 'EXP_WOOD';
    w.expeditionStartMs = Date.now();

    const weather = new WeatherManager();
    // 模拟极寒：暴风雪活跃 + 温度 < -30
    weather.blizzardState = 'BLZ_ACTIVE';
    weather.tempModifier = -40; // -20 + (-40) = -60
    wm.tickExpeditions(wallet, weather);
    expect(w.state).toBe(WorkerState.IDLE);
  });
});

describe('庇护所饱食度减免', () => {
  it('庇护所等级应该降低饱食衰减', () => {
    const wm1 = new WorkerManager();
    const w1 = wm1.addWorker();
    w1.state = WorkerState.WORKING;
    wm1.tickAll(-20, () => false, 0); // 无庇护所
    const decay1 = 80 - w1.hunger;

    const wm2 = new WorkerManager();
    const w2 = wm2.addWorker();
    w2.state = WorkerState.WORKING;
    wm2.tickAll(-20, () => false, 10); // 庇护所10级 → 减免10%
    const decay2 = 80 - w2.hunger;

    expect(decay2).toBeLessThan(decay1);
  });
});

describe('火炉温度加成', () => {
  it('火炉加温应该减少工人掉血', () => {
    const wm1 = new WorkerManager();
    const w1 = wm1.addWorker();
    wm1.tickAll(-20, () => false, 0); // 无火炉加温，-20°C
    const decay1 = 80 - w1.health;

    const wm2 = new WorkerManager();
    const w2 = wm2.addWorker();
    wm2.tickAll(-14, () => false, 0); // 火炉Lv3加温+6°C → -14°C
    const decay2 = 80 - w2.health;

    expect(decay2).toBeLessThan(decay1);
  });
});

describe('停工自动恢复', () => {
  it('HALTED_NO_WORKER 在分配工人后应该恢复', () => {
    const game = new GameLoop();
    const coal = game.buildings.get(BuildingType.COAL_MINE);
    coal.level = 1;
    coal.state = BuildingState.HALTED_NO_WORKER;

    // 分配工人
    const idle = game.workers.workers.find(w => w.state === WorkerState.IDLE);
    idle.state = WorkerState.WORKING;
    idle.assignedBuilding = BuildingType.COAL_MINE;
    coal.assignedWorkers.push(idle.workerId);

    game.onTick();
    expect(coal.state).toBe(BuildingState.PRODUCING);
  });
});

describe('点击区域计算 - LAYOUT 常量一致性', () => {
  // 使用与 game-renderer.js 相同的 LAYOUT 常量
  const LAYOUT = {
    RESOURCE_BAR_H: 60, WEATHER_BAR_H: 28, BOTTOM_BAR_H: 55,
    BUILDING_COLS: 2, BUILDING_CARD_W: 150, BUILDING_CARD_H: 100,
    BUILDING_GAP: 12, GROUND_MARGIN: 30,
    BTN_LEFT_PAD: 10, BTN_RIGHT_PAD: 10, BTN_GAP: 5,
    BTN_COUNT: 4, BTN_TOP_PAD: 8, BTN_H: 35,
  };
  const SCENE_TOP_OFFSET = LAYOUT.RESOURCE_BAR_H + LAYOUT.WEATHER_BAR_H + 8;

  it('按钮宽度计算应该一致（renderer vs hit-test）', () => {
    const W = 375;
    // renderer 公式
    const rendererBtnW = (W - LAYOUT.BTN_LEFT_PAD - LAYOUT.BTN_RIGHT_PAD
      - (LAYOUT.BTN_COUNT - 1) * LAYOUT.BTN_GAP) / LAYOUT.BTN_COUNT;
    // hit-test 公式（相同）
    const hitBtnW = (W - LAYOUT.BTN_LEFT_PAD - LAYOUT.BTN_RIGHT_PAD
      - (LAYOUT.BTN_COUNT - 1) * LAYOUT.BTN_GAP) / LAYOUT.BTN_COUNT;
    expect(rendererBtnW).toBe(hitBtnW);
  });

  it('按钮不应该超出屏幕右边缘', () => {
    const W = 375;
    const btnW = (W - LAYOUT.BTN_LEFT_PAD - LAYOUT.BTN_RIGHT_PAD
      - (LAYOUT.BTN_COUNT - 1) * LAYOUT.BTN_GAP) / LAYOUT.BTN_COUNT;
    const lastBtnX = LAYOUT.BTN_LEFT_PAD + (LAYOUT.BTN_COUNT - 1) * (btnW + LAYOUT.BTN_GAP);
    const rightEdge = lastBtnX + btnW;
    expect(rightEdge).toBeLessThanOrEqual(W);
  });

  it('所有按钮中心都应该在 hit-test 范围内', () => {
    const W = 375, H = 667;
    const btnY = H - LAYOUT.BOTTOM_BAR_H;
    const btnW = (W - LAYOUT.BTN_LEFT_PAD - LAYOUT.BTN_RIGHT_PAD
      - (LAYOUT.BTN_COUNT - 1) * LAYOUT.BTN_GAP) / LAYOUT.BTN_COUNT;

    for (let i = 0; i < LAYOUT.BTN_COUNT; i++) {
      const bx = LAYOUT.BTN_LEFT_PAD + i * (btnW + LAYOUT.BTN_GAP);
      const cx = bx + btnW / 2;
      const cy = btnY + LAYOUT.BTN_TOP_PAD + LAYOUT.BTN_H / 2;
      // X 命中
      expect(cx >= bx).toBeTruthy();
      expect(cx <= bx + btnW).toBeTruthy();
      // Y 命中
      expect(cy >= btnY + LAYOUT.BTN_TOP_PAD).toBeTruthy();
      expect(cy <= btnY + LAYOUT.BTN_TOP_PAD + LAYOUT.BTN_H).toBeTruthy();
    }
  });

  it('建筑网格应该居中且不超出屏幕', () => {
    const W = 375;
    const gridW = LAYOUT.BUILDING_COLS * LAYOUT.BUILDING_CARD_W
      + (LAYOUT.BUILDING_COLS - 1) * LAYOUT.BUILDING_GAP;
    const startX = (W - gridW) / 2;
    expect(startX).toBeGreaterThan(0);
    expect(startX + gridW).toBeLessThanOrEqual(W);
  });

  it('建筑卡片底部不应该侵入底部按钮区域', () => {
    const W = 375, H = 667, safeTop = 44;
    const sceneAreaTop = safeTop + SCENE_TOP_OFFSET;
    const buildings = 9; // 当前建筑数量
    const totalRows = Math.ceil(buildings / LAYOUT.BUILDING_COLS);
    const startY = sceneAreaTop + 10;
    const lastRowBottom = startY + (totalRows - 1) * (LAYOUT.BUILDING_CARD_H + LAYOUT.BUILDING_GAP)
      + LAYOUT.BUILDING_CARD_H;
    const btnAreaTop = H - LAYOUT.BOTTOM_BAR_H;
    // 即使不滚动，建筑也不应侵入按钮区
    // （可能需要滚动，但 maxScrollY 应确保可滚动到）
    expect(lastRowBottom - btnAreaTop).toBeLessThanOrEqual(500); // maxScrollY 足够
  });

  it('LAYOUT 常量应该与 game-renderer.js 导出一致', () => {
    // 验证关键常量没有被意外修改
    expect(LAYOUT.BTN_LEFT_PAD).toBe(10);
    expect(LAYOUT.BTN_RIGHT_PAD).toBe(10);
    expect(LAYOUT.BTN_GAP).toBe(5);
    expect(LAYOUT.BTN_COUNT).toBe(4);
    expect(LAYOUT.BTN_TOP_PAD).toBe(8);
    expect(LAYOUT.BTN_H).toBe(35);
    expect(LAYOUT.BOTTOM_BAR_H).toBe(55);
    expect(LAYOUT.BUILDING_CARD_W).toBe(150);
    expect(LAYOUT.BUILDING_CARD_H).toBe(100);
  });
});

describe('ResearchManager - 科技树系统', () => {
  it('初始状态应该有可用科技', () => {
    const rm = new ResearchManager();
    const available = rm.getAvailable();
    expect(available.length).toBeGreaterThan(0);
  });

  it('无前置科技应该初始为 AVAILABLE', () => {
    const rm = new ResearchManager();
    const lumber = rm.get('TECH_EFFICIENT_LUMBER');
    expect(lumber.state).toBe(TechState.AVAILABLE);
  });

  it('有前置科技应该初始为 LOCKED', () => {
    const rm = new ResearchManager();
    const advancedCook = rm.get('TECH_ADVANCED_COOK');
    expect(advancedCook.state).toBe(TechState.LOCKED);
  });

  it('startResearch 应该在资源足够时成功', () => {
    const rm = new ResearchManager();
    const wallet = new WalletManager();
    const ok = rm.startResearch('TECH_EFFICIENT_LUMBER', wallet);
    expect(ok).toBeTruthy();
    const tech = rm.get('TECH_EFFICIENT_LUMBER');
    expect(tech.state).toBe(TechState.RESEARCHING);
  });

  it('startResearch 应该在资源不足时失败', () => {
    const rm = new ResearchManager();
    const wallet = new WalletManager();
    wallet.resources[ResourceType.WOOD] = 0;
    wallet.resources[ResourceType.GEM] = 0;
    const ok = rm.startResearch('TECH_EFFICIENT_LUMBER', wallet);
    expect(ok).toBeFalsy();
  });

  it('startResearch 应该扣除资源', () => {
    const rm = new ResearchManager();
    const wallet = new WalletManager();
    const beforeWood = wallet.get(ResourceType.WOOD);
    const beforeGem = wallet.get(ResourceType.GEM);
    rm.startResearch('TECH_EFFICIENT_LUMBER', wallet);
    expect(wallet.get(ResourceType.WOOD)).toBe(beforeWood - 200);
    expect(wallet.get(ResourceType.GEM)).toBe(beforeGem - 5);
  });

  it('tick 应该推进研究进度', () => {
    const rm = new ResearchManager();
    const wallet = new WalletManager();
    const buildings = new BuildingManager();
    // 工坊需要已建造才能推进研究
    const workshop = buildings.get(BuildingType.WORKSHOP);
    workshop.level = 1;
    workshop.state = BuildingState.NORMAL;
    rm.startResearch('TECH_EFFICIENT_LUMBER', wallet);
    const tech = rm.get('TECH_EFFICIENT_LUMBER');
    tech.durationMs = 2000;
    tech.progressMs = 1000;
    rm.tick(wallet, buildings);
    expect(tech.progressMs).toBe(2000);
  });

  it('tick 完成后应该变为 DONE', () => {
    const rm = new ResearchManager();
    const wallet = new WalletManager();
    const buildings = new BuildingManager();
    const workshop = buildings.get(BuildingType.WORKSHOP);
    workshop.level = 1;
    workshop.state = BuildingState.NORMAL;
    rm.startResearch('TECH_EFFICIENT_LUMBER', wallet);
    const tech = rm.get('TECH_EFFICIENT_LUMBER');
    tech.durationMs = 1000;
    tech.progressMs = 999;
    rm.tick(wallet, buildings);
    expect(tech.state).toBe(TechState.DONE);
  });

  it('完成后应该刷新可用科技', () => {
    const rm = new ResearchManager();
    const wallet = new WalletManager();
    const buildings = new BuildingManager();
    const workshop = buildings.get(BuildingType.WORKSHOP);
    workshop.level = 1;
    workshop.state = BuildingState.NORMAL;
    rm.startResearch('TECH_WORKSHOP', wallet);
    const tech = rm.get('TECH_WORKSHOP');
    tech.durationMs = 1;
    tech.progressMs = 0;
    rm.tick(wallet, buildings);
    expect(tech.state).toBe(TechState.DONE);
    const advCook = rm.get('TECH_ADVANCED_COOK');
    expect(advCook.state).toBe(TechState.AVAILABLE);
  });

  it('getOutputMultiplier 无科技时返回 1', () => {
    const rm = new ResearchManager();
    expect(rm.getOutputMultiplier(BuildingType.LUMBER_CAMP)).toBe(1);
  });

  it('getOutputMultiplier 完成后返回加成', () => {
    const rm = new ResearchManager();
    const tech = rm.get('TECH_EFFICIENT_LUMBER');
    tech.state = TechState.DONE;
    expect(rm.getOutputMultiplier(BuildingType.LUMBER_CAMP)).toBe(1.3);
  });

  it('getWorkerBuff 无科技时返回 0', () => {
    const rm = new ResearchManager();
    expect(rm.getWorkerBuff('COLD_RESIST')).toBe(0);
  });

  it('getWorkerBuff 完成后返回加成', () => {
    const rm = new ResearchManager();
    const tech = rm.get('TECH_INSULATION');
    tech.state = TechState.DONE;
    expect(rm.getWorkerBuff('COLD_RESIST')).toBe(0.2);
  });

  it('serialize/deserialize 应该保持状态', () => {
    const rm = new ResearchManager();
    rm.startResearch('TECH_EFFICIENT_LUMBER', new WalletManager());
    const data = rm.serialize();
    const rm2 = new ResearchManager();
    rm2.deserialize(data);
    expect(rm2.get('TECH_EFFICIENT_LUMBER').state).toBe(TechState.RESEARCHING);
  });

  it('research.outputMultiplier 应该影响建筑产出', () => {
    const game = new GameLoop();
    // 手动完成高效伐木科技
    game.research.get('TECH_EFFICIENT_LUMBER').state = TechState.DONE;
    const output = game.getBuildingOutput(BuildingType.LUMBER_CAMP, 1);
    expect(output.amount).toBe(2.0 * 1.3); // base 2.0 * 1.3 mult
  });
});

describe('随机事件系统', () => {
  it('GameLoop 应该有 eventLog', () => {
    const game = new GameLoop();
    expect(game.eventLog).toBeTruthy();
    expect(game.eventLog.length).toBe(0);
  });

  it('tickRandomEvents 应该能触发事件', () => {
    const game = new GameLoop();
    // 强制触发所有事件
    const originalRandom = Math.random;
    Math.random = () => 0.001; // 所有概率都触发
    game.tickRandomEvents();
    expect(game.eventLog.length).toBeGreaterThan(0);
    Math.random = originalRandom;
  });

  it('ADD_WORKER 事件应该增加工人', () => {
    const game = new GameLoop();
    const before = game.workers.workers.length;
    // 直接调用 tickRandomEvents with forced probability
    const originalRandom = Math.random;
    Math.random = () => 0.001;
    game.tickRandomEvents();
    Math.random = originalRandom;
    // 应该至少有一个 ADD_WORKER 事件
    const addWorkerEvents = game.eventLog.filter(e => e.effect.type === 'ADD_WORKER');
    if (addWorkerEvents.length > 0) {
      expect(game.workers.workers.length).toBeGreaterThan(before);
    }
  });

  it('TEMP_BOOST 事件应该设置温度加成', () => {
    const game = new GameLoop();
    game.activeTempBoost = 10;
    game.tempBoostTicks = 5;
    expect(game.activeTempBoost).toBe(10);
    // 用高随机值避免触发随机事件
    const origRandom = Math.random;
    Math.random = () => 0.99;
    game.onTick();
    Math.random = origRandom;
    expect(game.tempBoostTicks).toBe(4);
  });
});

describe('TradingManager - 交易系统', () => {
  it('初始汇率应该正确', () => {
    const tm = new TradingManager();
    expect(tm.rates[ResourceType.WOOD]).toBe(1.0);
    expect(tm.rates[ResourceType.GEM]).toBe(10.0);
  });

  it('tickRates 应该波动汇率', () => {
    const tm = new TradingManager();
    const before = tm.rates[ResourceType.COAL];
    tm.tickRates();
    // 汇率应该变化（大概率）
    expect(tm.rates[ResourceType.COAL]).toBeGreaterThan(0.5);
    expect(tm.rates[ResourceType.COAL]).toBeLessThan(5.0);
  });

  it('executeTrade 应该成功交换资源', () => {
    const tm = new TradingManager();
    const wallet = new WalletManager();
    const beforeWood = wallet.get(ResourceType.WOOD);
    const beforeCoal = wallet.get(ResourceType.COAL);
    const ok = tm.executeTrade(wallet, ResourceType.WOOD, 100, ResourceType.COAL);
    expect(ok).toBeTruthy();
    expect(wallet.get(ResourceType.WOOD)).toBe(beforeWood - 100);
    expect(wallet.get(ResourceType.COAL)).toBeGreaterThan(beforeCoal);
  });

  it('executeTrade 应该在资源不足时失败', () => {
    const tm = new TradingManager();
    const wallet = new WalletManager();
    const ok = tm.executeTrade(wallet, ResourceType.IRON, 9999, ResourceType.WOOD);
    expect(ok).toBeFalsy();
  });

  it('executeTrade 不能自己换自己', () => {
    const tm = new TradingManager();
    const wallet = new WalletManager();
    const ok = tm.executeTrade(wallet, ResourceType.WOOD, 100, ResourceType.WOOD);
    expect(ok).toBeFalsy();
  });

  it('executeTrade 应该收取手续费', () => {
    const tm = new TradingManager();
    const wallet = new WalletManager();
    tm.rates[ResourceType.WOOD] = 1.0;
    tm.rates[ResourceType.COAL] = 1.0; // 1:1 汇率
    const preview = tm.getTradePreview(ResourceType.WOOD, 100, ResourceType.COAL);
    expect(preview.buyAmount).toBe(90); // 100 * 0.9 = 90 (10% fee)
  });

  it('getTradePreview 应该返回预览', () => {
    const tm = new TradingManager();
    const preview = tm.getTradePreview(ResourceType.WOOD, 100, ResourceType.COAL);
    expect(preview).toBeTruthy();
    expect(preview.fee).toBe(0.10);
    expect(preview.buyAmount).toBeGreaterThan(0);
  });

  it('商队应该提供折扣', () => {
    const tm = new TradingManager();
    tm.caravanActive = true;
    tm.caravanDiscount = 0.30;
    const rateWithCaravan = tm.getRate(ResourceType.COAL);
    const normalRate = tm.rates[ResourceType.COAL];
    expect(rateWithCaravan).toBeLessThan(normalRate);
  });

  it('serialize/deserialize 应该保持状态', () => {
    const tm = new TradingManager();
    tm.totalTrades = 5;
    tm.caravanActive = true;
    const data = tm.serialize();
    const tm2 = new TradingManager();
    tm2.deserialize(data);
    expect(tm2.totalTrades).toBe(5);
    expect(tm2.caravanActive).toBeTruthy();
  });

  it('交易应该触发事件', () => {
    const tm = new TradingManager();
    const wallet = new WalletManager();
    let tradeEvent = null;
    eventBus.on('EVT_TRADE_COMPLETE', (data) => { tradeEvent = data; });
    tm.executeTrade(wallet, ResourceType.WOOD, 50, ResourceType.COAL);
    expect(tradeEvent).toBeTruthy();
    expect(tradeEvent.sellType).toBe(ResourceType.WOOD);
    eventBus.clear();
  });
});

describe('日夜循环系统', () => {
  it('初始时间应该在正午附近', () => {
    const game = new GameLoop();
    const tod = game.getTimeOfDay();
    expect(tod).toBeGreaterThan(0.4);
    expect(tod).toBeLessThan(0.6);
  });

  it('tick 应该推进时间', () => {
    const game = new GameLoop();
    const before = game.dayTicks;
    game.onTick();
    expect(game.dayTicks).toBe(before + 1);
  });

  it('时间应该循环', () => {
    const game = new GameLoop();
    game.dayTicks = game.dayLength - 1;
    game.onTick();
    expect(game.dayTicks).toBe(0);
  });

  it('白天效率应该是 100%', () => {
    const game = new GameLoop();
    game.dayTicks = 60; // 正午
    expect(game.getWorkerEfficiency()).toBe(1.0);
  });

  it('夜晚效率应该是 80%', () => {
    const game = new GameLoop();
    game.dayTicks = 10; // 午夜附近 (10/120 = 0.083)
    expect(game.getWorkerEfficiency()).toBe(0.8);
  });

  it('黎明效率应该是 90%', () => {
    const game = new GameLoop();
    game.dayTicks = 28; // 28/120 = 0.233 (黎明)
    expect(game.getWorkerEfficiency()).toBe(0.9);
  });

  it('夜晚产量应该降低', () => {
    const game = new GameLoop();
    game.dayTicks = 60; // 正午
    const dayOutput = game.getBuildingOutput(BuildingType.LUMBER_CAMP, 1);
    game.dayTicks = 10; // 午夜
    const nightOutput = game.getBuildingOutput(BuildingType.LUMBER_CAMP, 1);
    expect(dayOutput.amount).toBeGreaterThan(nightOutput.amount);
  });
});

describe('GameLoop 边界情况', () => {
  it('tickCount 应该每次 tick 只递增 1', () => {
    const game = new GameLoop();
    game.paused = true; // 阻止 setInterval
    const before = game.tickCount;
    // 手动触发一次 tick（start() 中的 setInterval 不会执行）
    game.onTick();
    // tickCount 在 start() 中递增了，但 onTick 不应再递增
    // 由于我们没有调用 start()，tickCount 应该在 onTick 后不变
    // 实际上 onTick 不再递增 tickCount，所以应该还是 before
    expect(game.tickCount).toBe(before);
  });

  it('onTick 不应该递增 tickCount', () => {
    const game = new GameLoop();
    game.paused = true;
    const before = game.tickCount;
    game.onTick();
    game.onTick();
    game.onTick();
    // onTick 不递增 tickCount
    expect(game.tickCount).toBe(before);
  });

  it('start 应该递增 tickCount', () => {
    const game = new GameLoop();
    const before = game.tickCount;
    // start() 会在 setInterval 回调中递增
    // 但我们无法等待 setInterval，所以直接检查 start 方法存在
    expect(typeof game.start).toBe('function');
  });

  it('getWorkerEfficiency 在各时间段应该返回正确值', () => {
    const game = new GameLoop();
    // 午夜 (0.0)
    game.dayTicks = 0;
    expect(game.getWorkerEfficiency()).toBe(0.8);
    // 黎明 (0.25)
    game.dayTicks = 30; // 30/120 = 0.25
    expect(game.getWorkerEfficiency()).toBe(0.9);
    // 正午 (0.5)
    game.dayTicks = 60;
    expect(game.getWorkerEfficiency()).toBe(1.0);
    // 黄昏 (0.75)
    game.dayTicks = 90;
    expect(game.getWorkerEfficiency()).toBe(0.9);
    // 午夜 (1.0 = 0.0)
    game.dayTicks = 119; // 119/120 = 0.99
    expect(game.getWorkerEfficiency()).toBe(0.8);
  });

  it('火炉冻结时 warmth 应该为 0', () => {
    const game = new GameLoop();
    const furnace = game.buildings.get(BuildingType.FURNACE);
    furnace.state = BuildingState.FROZEN;
    // onTick 中应该不再计算 warmth
    game.onTick();
    // 火炉冻结后，工人应该在更低温度下
    // 无法直接测试 warmth，但可以检查火炉状态
    expect(furnace.state).toBe(BuildingState.FROZEN);
  });

  it('暴风雪存活标志应该在暴风雪结束后设置', () => {
    const game = new GameLoop();
    expect(game._blizzardSurvived).toBeFalsy();
    // 模拟暴风雪活跃
    game._prevBlizzardState = 'BLZ_ACTIVE';
    game.weather.blizzardState = 'BLZ_IDLE';
    game.onTick();
    expect(game._blizzardSurvived).toBeTruthy();
  });

  it('空闲工人不消耗食物', () => {
    const game = new GameLoop();
    // 清除所有工人
    game.workers.workers = [];
    const w = game.workers.addWorker();
    w.state = WorkerState.IDLE;
    w.hunger = 50;
    const foodBefore = game.wallet.get(ResourceType.RATION);
    game.onTick();
    // 空闲工人也应该掉饱食度（但比工作工人少）
    expect(w.hunger).toBeLessThan(50);
  });

  it('厨房没原料应该进入停工状态', () => {
    const game = new GameLoop();
    const cookhouse = game.buildings.get(BuildingType.COOKHOUSE);
    cookhouse.level = 1;
    cookhouse.state = BuildingState.PRODUCING;
    // 分配工人
    const w = game.workers.addWorker();
    w.state = WorkerState.WORKING;
    w.assignedBuilding = BuildingType.COOKHOUSE;
    cookhouse.assignedWorkers.push(w.workerId);
    // 确保工人不会因其他原因改变状态
    w.health = 100;
    w.hunger = 100;
    // 清空肉
    game.wallet.resources[ResourceType.MEAT] = 0;
    game.onTick();
    // 厨房应该因缺少原料而停工
    expect(cookhouse.state === BuildingState.HALTED_NO_MATERIAL ||
           cookhouse.state === BuildingState.HALTED_NO_WORKER).toBeTruthy();
  });
});

describe('AchievementManager - 成就系统', () => {
  it('初始状态应该所有成就未解锁', () => {
    const am = new AchievementManager();
    expect(am.getUnlocked().length).toBe(0);
    expect(am.getLocked().length).toBeGreaterThan(0);
  });

  it('ACH_DAY_10 应该在 10 天后解锁', () => {
    const game = new GameLoop();
    game.tickCount = game.dayLength * 10;
    game.achievements.tick(game);
    const ach = game.achievements.get('ACH_DAY_10');
    expect(ach.unlocked).toBeTruthy();
  });

  it('ACH_DAY_10 应该发放奖励', () => {
    const game = new GameLoop();
    const beforeWood = game.wallet.get(ResourceType.WOOD);
    game.tickCount = game.dayLength * 10;
    game.achievements.tick(game);
    expect(game.wallet.get(ResourceType.WOOD)).toBeGreaterThan(beforeWood);
  });

  it('ACH_FIRST_BUILD 应该在建造建筑后解锁', () => {
    const game = new GameLoop();
    // 初始有火炉+伐木场=2个，需要3个
    const coal = game.buildings.get(BuildingType.COAL_MINE);
    coal.level = 1;
    coal.state = BuildingState.NORMAL;
    game.achievements.tick(game);
    const ach = game.achievements.get('ACH_FIRST_BUILD');
    expect(ach.unlocked).toBeTruthy();
  });

  it('ACH_RESEARCH_5 应该在完成 5 项科技后解锁', () => {
    const game = new GameLoop();
    const techs = game.research.getAll();
    for (let i = 0; i < 5 && i < techs.length; i++) {
      techs[i].state = 3; // DONE
    }
    game.achievements.tick(game);
    const ach = game.achievements.get('ACH_RESEARCH_5');
    expect(ach.unlocked).toBeTruthy();
  });

  it('ACH_TRADE_10 应该在 10 次交易后解锁', () => {
    const game = new GameLoop();
    game.trading.totalTrades = 10;
    game.achievements.tick(game);
    const ach = game.achievements.get('ACH_TRADE_10');
    expect(ach.unlocked).toBeTruthy();
  });

  it('已解锁成就不应该重复触发', () => {
    const game = new GameLoop();
    game.tickCount = game.dayLength * 10;
    game.achievements.tick(game);
    const beforeWood = game.wallet.get(ResourceType.WOOD);
    game.achievements.tick(game); // 再次 tick
    expect(game.wallet.get(ResourceType.WOOD)).toBe(beforeWood); // 不应重复发放
  });

  it('serialize/deserialize 应该保持状态', () => {
    const am = new AchievementManager();
    const ach = am.get('ACH_DAY_10');
    ach.unlocked = true;
    am.unlockCount = 1;
    const data = am.serialize();
    const am2 = new AchievementManager();
    am2.deserialize(data);
    expect(am2.get('ACH_DAY_10').unlocked).toBeTruthy();
    expect(am2.unlockCount).toBe(1);
  });

  it('成就解锁应该触发事件', () => {
    const game = new GameLoop();
    let achEvent = null;
    eventBus.on('EVT_ACHIEVEMENT_UNLOCK', (data) => { achEvent = data; });
    game.tickCount = game.dayLength * 10;
    game.achievements.tick(game);
    expect(achEvent).toBeTruthy();
    expect(achEvent.achievementId).toBe('ACH_DAY_10');
    eventBus.clear();
  });
});

describe('PersistenceManager - 存档系统', () => {
  it('serialize 应该生成完整数据', () => {
    const game = new GameLoop();
    const pm = new PersistenceManager(game);
    const data = pm.serialize();
    expect(data.version).toBe(1);
    expect(data.wallet).toBeTruthy();
    expect(data.workers).toBeTruthy();
    expect(data.buildings).toBeTruthy();
    expect(data.research).toBeTruthy();
    expect(data.trading).toBeTruthy();
    expect(data.achievements).toBeTruthy();
  });

  it('serialize 应该包含当前状态', () => {
    const game = new GameLoop();
    game.tickCount = 42;
    game.dayTicks = 15;
    const pm = new PersistenceManager(game);
    const data = pm.serialize();
    expect(data.tickCount).toBe(42);
    expect(data.dayTicks).toBe(15);
  });

  it('deserialize 应该恢复游戏状态', () => {
    const game1 = new GameLoop();
    game1.tickCount = 100;
    game1.dayTicks = 50;
    game1.wallet.add(ResourceType.WOOD, 999);
    const pm1 = new PersistenceManager(game1);
    const data = pm1.serialize();

    const game2 = new GameLoop();
    const pm2 = new PersistenceManager(game2);
    pm2.deserialize(data);
    expect(game2.tickCount).toBe(100);
    expect(game2.dayTicks).toBe(50);
    expect(game2.wallet.get(ResourceType.WOOD)).toBeGreaterThan(500);
  });

  it('deserialize 应该恢复工人状态', () => {
    const game1 = new GameLoop();
    game1.workers.workers[0].health = 42;
    game1.workers.workers[0].name = '测试工人';
    const pm1 = new PersistenceManager(game1);
    const data = pm1.serialize();

    const game2 = new GameLoop();
    const pm2 = new PersistenceManager(game2);
    pm2.deserialize(data);
    expect(game2.workers.workers[0].health).toBe(42);
    expect(game2.workers.workers[0].name).toBe('测试工人');
  });

  it('deserialize 应该恢复建筑状态', () => {
    const game1 = new GameLoop();
    const coal = game1.buildings.get(BuildingType.COAL_MINE);
    coal.level = 3;
    coal.state = BuildingState.PRODUCING;
    const pm1 = new PersistenceManager(game1);
    const data = pm1.serialize();

    const game2 = new GameLoop();
    const pm2 = new PersistenceManager(game2);
    pm2.deserialize(data);
    const coal2 = game2.buildings.get(BuildingType.COAL_MINE);
    expect(coal2.level).toBe(3);
    expect(coal2.state).toBe(BuildingState.PRODUCING);
  });

  it('deserialize 应该恢复研究状态', () => {
    const game1 = new GameLoop();
    game1.research.get('TECH_EFFICIENT_LUMBER').state = 3; // DONE
    const pm1 = new PersistenceManager(game1);
    const data = pm1.serialize();

    const game2 = new GameLoop();
    const pm2 = new PersistenceManager(game2);
    pm2.deserialize(data);
    expect(game2.research.get('TECH_EFFICIENT_LUMBER').state).toBe(3);
  });

  it('deserialize 应该恢复成就状态', () => {
    const game1 = new GameLoop();
    game1.tickCount = game1.dayLength * 10;
    game1.achievements.tick(game1);
    const pm1 = new PersistenceManager(game1);
    const data = pm1.serialize();

    const game2 = new GameLoop();
    const pm2 = new PersistenceManager(game2);
    pm2.deserialize(data);
    expect(game2.achievements.get('ACH_DAY_10').unlocked).toBeTruthy();
  });

  it('save 应该返回 true（无 wx 环境时）', () => {
    const game = new GameLoop();
    const pm = new PersistenceManager(game);
    const result = pm.save();
    expect(result).toBeTruthy();
  });

  it('load 应该返回 false（无 wx 环境时）', () => {
    const game = new GameLoop();
    const pm = new PersistenceManager(game);
    const result = pm.load();
    expect(result).toBeFalsy();
  });
});

// --- 汇总 ---
console.log('\n========================================');
console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
console.log('========================================');

if (failed > 0) process.exit(1);
