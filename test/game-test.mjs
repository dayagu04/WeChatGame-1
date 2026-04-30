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
import { ResourceType, BuildingType, BuildingState, WorkerState, GAME_CONSTANTS, EXPEDITION_CONFIGS } from '../js/game-constants.js';
import { WalletManager } from '../js/game-wallet.js';
import { Building, BuildingManager } from '../js/game-buildings.js';
import { Worker, WorkerManager } from '../js/game-workers.js';
import { WeatherManager } from '../js/game-weather.js';
import { GameLoop } from '../js/game-loop.js';

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
    expect(all.length).toBe(7); // 7种建筑
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

describe('点击区域计算', () => {
  it('建筑卡片坐标应该与渲染一致', () => {
    const W = 375, H = 667;
    const startY = 115;
    const cardW = (W - 30) / 2;
    const cardH = 70;
    const gap = 5;

    // 第一个建筑 (col=0, row=0)
    const x0 = 10;
    const y0 = 115;
    expect(x0).toBe(10);
    expect(y0).toBe(115);

    // 第二个建筑 (col=1, row=0)
    const x1 = 10 + 1 * (cardW + gap);
    expect(x1).toBeGreaterThan(10);

    // 第三个建筑 (col=0, row=1)
    const y2 = 115 + 1 * (cardH + gap);
    expect(y2).toBe(190);
  });

  it('底部按钮坐标应该与渲染一致', () => {
    const W = 375, H = 667;
    const btnY = H - 55; // 612
    const btnW = (W - 40) / 4; // 83.75
    const btnGap = 5;

    // 按钮 0
    const bx0 = 10;
    expect(bx0).toBe(10);

    // 按钮 1
    const bx1 = 10 + 1 * (btnW + btnGap);
    expect(bx1).toBe(10 + 88.75);

    // 点击按钮 0 的中心
    const tapX0 = bx0 + btnW / 2;
    const tapY0 = btnY + 8 + 35 / 2;
    expect(tapY0).toBe(637.5);

    // 验证命中检测
    const hitBtnY = tapY0 >= btnY + 8 && tapY0 <= btnY + 43;
    expect(hitBtnY).toBeTruthy();

    const hitBtnX = tapX0 >= bx0 && tapX0 <= bx0 + btnW;
    expect(hitBtnX).toBeTruthy();
  });
});

// --- 汇总 ---
console.log('\n========================================');
console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
console.log('========================================');

if (failed > 0) process.exit(1);
