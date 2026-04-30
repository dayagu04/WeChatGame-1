// ==========================================
// game-main.js
// 游戏主控：初始化 + 渲染循环 + 输入处理
// ==========================================

import './render';
import { SAFE_TOP } from './render';
import { BuildingType, BuildingState, ResourceType, WorkerState, EXPEDITION_CONFIGS, eventBus, GlobalEvents } from './game-constants';
import { GameLoop } from './game-loop';
import { GameRenderer } from './game-renderer';

export default class GameMain {
  constructor() {
    this.ctx = canvas.getContext('2d');
    this.w = canvas.width;
    this.h = canvas.height;

    // 核心系统
    this.game = new GameLoop();
    this.renderer = new GameRenderer(this.ctx, this.w, this.h, SAFE_TOP);

    // 探索选择索引
    this.expeditionIndex = 0;

    // 触摸输入
    this.touchStartY = 0;
    this.setupInput();
    this.setupLogging();

    // 启动
    this.game.start();
    this.startRenderLoop();

    console.log(`[EndlessWinter] Game started! safeTop=${SAFE_TOP}, canvas=${this.w}x${this.h}`);
  }

  setupInput() {
    wx.onTouchStart((e) => {
      const touch = e.touches[0];
      this.touchStartY = touch.clientY;
      this.handleTap(touch.clientX, touch.clientY);
    });

    wx.onTouchMove((e) => {
      const touch = e.touches[0];
      const dy = touch.clientY - this.touchStartY;
      this.renderer.scrollY = Math.max(0, this.renderer.scrollY - dy);
      this.touchStartY = touch.clientY;
    });
  }

  setupLogging() {
    // 监听关键事件并输出日志
    eventBus.on(GlobalEvents.BUILDING_STATE_CHANGE, (data) => {
      console.log(`[Event] Building state change: ${data.buildingId} -> ${data.newState}`);
    });
    eventBus.on(GlobalEvents.BUILDING_UPGRADE_COMPLETE, (data) => {
      console.log(`[Event] Building upgrade complete: ${data.buildingId} -> Lv.${data.newLevel}`);
    });
    eventBus.on(GlobalEvents.WORKER_STATE_CHANGE, (data) => {
      console.log(`[Event] Worker state change: ${data.workerId} -> ${data.newState}`);
    });
    eventBus.on(GlobalEvents.EXPEDITION_COMPLETE, (data) => {
      console.log(`[Event] Expedition complete: ${data.workerId} got ${data.rewardAmount} ${data.rewardType}, injured=${data.injured}`);
    });
    eventBus.on(GlobalEvents.WORKER_DIED, (data) => {
      console.log(`[Event] Worker died: ${data.workerId}, reason=${data.reason}`);
    });
  }

  handleTap(x, y) {
    const game = this.game;
    const r = this.renderer;
    const safeTop = r.safeTop;

    // 检查底部按钮点击（优先级更高）
    const btnY = this.h - 55;
    const btnW = (this.w - 40) / 4;
    const btnGap = 5;

    if (y >= btnY + 8 && y <= btnY + 43) {
      for (let i = 0; i < 4; i++) {
        const bx = 10 + i * (btnW + btnGap);
        if (x >= bx && x <= bx + btnW) {
          this.handleAction(i);
          return;
        }
      }
    }

    // 检查建筑卡片点击（Y 坐标含 safeTop 偏移）
    const startY = safeTop + 115;
    const cardW = (this.w - 30) / 2;
    const cardH = 70;
    const gap = 5;
    const buildings = game.buildings.getAll();

    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = 10 + col * (cardW + gap);
      const by = startY + row * (cardH + gap) - r.scrollY;

      if (x >= bx && x <= bx + cardW && y >= by && y <= by + cardH) {
        r.selectedBuilding = b.type;
        console.log(`[Tap] Building "${b.name}" selected (state=${b.state}, lv=${b.level})`);
        return;
      }
    }

    r.selectedBuilding = null;
  }

  handleAction(btnIndex) {
    const game = this.game;
    const selected = this.renderer.selectedBuilding;

    switch (btnIndex) {
      case 0: // 升级 / 建造
        this.doUpgrade(selected);
        break;

      case 1: // 分配工人
        this.doAssign(selected);
        break;

      case 2: // 智能操作：有选中建筑→建造/升级，无选中→探索
        if (selected) {
          const b = game.buildings.get(selected);
          if (!b.isUnlocked()) {
            this.doUpgrade(selected);
          } else {
            this.doAssign(selected);
          }
        } else {
          this.doExplore();
        }
        break;

      case 3: // 火炉重启 / 暂停
        {
          const furnace = game.buildings.get(BuildingType.FURNACE);
          if (furnace.state === BuildingState.FROZEN) {
            furnace.state = BuildingState.NORMAL;
            console.log('[Action] Furnace restarted');
          } else {
            game.paused = !game.paused;
            console.log(`[Action] ${game.paused ? 'Paused' : 'Resumed'}`);
          }
        }
        break;
    }
  }

  doUpgrade(selected) {
    const game = this.game;
    if (!selected) {
      console.log('[Action:Upgrade] No building selected');
      return;
    }
    const b = game.buildings.get(selected);
    if (!b.isUnlocked()) {
      const cost = b.getUpgradeCost();
      console.log(`[Action:Build] ${b.name} cost=${JSON.stringify(cost)}, wallet wood=${Math.floor(game.wallet.get(ResourceType.WOOD))}`);
      if (game.wallet.consume(cost)) {
        b.level = 1;
        b.state = BuildingState.NORMAL;
        console.log(`[Action:Build] SUCCESS: ${b.name} built!`);
      } else {
        console.log(`[Action:Build] FAILED: not enough resources`);
      }
    } else if (b.state === BuildingState.NORMAL || b.state === BuildingState.PRODUCING) {
      const cost = b.getUpgradeCost();
      console.log(`[Action:Upgrade] ${b.name} Lv.${b.level} cost=${JSON.stringify(cost)}`);
      if (game.wallet.consume(cost)) {
        b.startUpgrade(Date.now());
        console.log(`[Action:Upgrade] SUCCESS: ${b.name} upgrading to Lv.${b.level + 1}`);
      } else {
        console.log(`[Action:Upgrade] FAILED: not enough resources`);
      }
    } else {
      console.log(`[Action:Upgrade] ${b.name} state=${b.state}, cannot upgrade`);
    }
  }

  doAssign(selected) {
    const game = this.game;
    if (!selected) {
      console.log('[Action:Assign] No building selected');
      return;
    }
    const b = game.buildings.get(selected);
    if (!b.isUnlocked()) {
      console.log(`[Action:Assign] ${b.name} is locked (level=${b.level})`);
      return;
    }
    if (b.maxSlots <= 0) {
      console.log(`[Action:Assign] ${b.name} has no worker slots`);
      return;
    }
    const idle = game.workers.workers.find(w => w.state === WorkerState.IDLE);
    if (!idle) {
      console.log(`[Action:Assign] No idle workers (total=${game.workers.workers.length}, alive=${game.workers.getAlive().length})`);
      return;
    }
    if (b.assignedWorkers.length >= b.maxSlots) {
      console.log(`[Action:Assign] ${b.name} is full (${b.assignedWorkers.length}/${b.maxSlots})`);
      return;
    }
    idle.state = WorkerState.WORKING;
    idle.assignedBuilding = b.type;
    b.assignedWorkers.push(idle.workerId);
    if (b.state === BuildingState.NORMAL) b.state = BuildingState.PRODUCING;
    console.log(`[Action:Assign] SUCCESS: ${idle.name} -> ${b.name} (${b.assignedWorkers.length}/${b.maxSlots})`);
  }

  doExplore() {
    const game = this.game;
    const temp = game.weather.getGlobalTemperature();
    if (temp < -30) {
      console.log(`[Action:Explore] Too cold (${temp.toFixed(1)}°C), exploration unavailable`);
      return;
    }
    const idle = game.workers.workers.find(w => w.state === WorkerState.IDLE);
    if (!idle) {
      console.log(`[Action:Explore] No idle workers available`);
      return;
    }
    const config = EXPEDITION_CONFIGS[this.expeditionIndex % EXPEDITION_CONFIGS.length];
    this.expeditionIndex++;
    if (game.workers.startExpedition(idle.workerId, config.id)) {
      console.log(`[Action:Explore] SUCCESS: ${idle.name} -> "${config.name}" (${config.durationMs / 1000}s, reward=${config.minReward}-${config.maxReward} ${config.rewardType})`);
    }
  }

  startRenderLoop() {
    const loop = () => {
      this.renderer.render(this.game);
      this.aniId = requestAnimationFrame(loop);
    };
    this.aniId = requestAnimationFrame(loop);
  }
}
