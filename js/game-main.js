// ==========================================
// game-main.js
// 游戏主控：初始化 + 渲染循环 + 输入处理
// ==========================================

import { BuildingType, BuildingState, ResourceType } from './game-constants';
import { GameLoop } from './game-loop';
import { GameRenderer } from './game-renderer';

export default class GameMain {
  constructor() {
    // Canvas 初始化
    this.ctx = canvas.getContext('2d');
    this.w = canvas.width;
    this.h = canvas.height;

    // 核心系统
    this.game = new GameLoop();
    this.renderer = new GameRenderer(this.ctx, this.w, this.h);

    // 触摸输入
    this.touchStartY = 0;
    this.setupInput();

    // 启动
    this.game.start();
    this.startRenderLoop();

    console.log('[EndlessWinter] Game started!');
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

  handleTap(x, y) {
    const game = this.game;
    const r = this.renderer;

    // 检查建筑卡片点击
    const startY = 115;
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
        return;
      }
    }

    // 检查底部按钮点击
    const btnY = this.h - 55;
    if (y >= btnY + 8 && y <= btnY + 43) {
      const btnW = (this.w - 40) / 4;
      const btnIndex = Math.floor((x - 10) / (btnW + 5));
      this.handleAction(btnIndex);
      return;
    }

    r.selectedBuilding = null;
  }

  handleAction(btnIndex) {
    const game = this.game;
    const selected = this.renderer.selectedBuilding;

    switch (btnIndex) {
      case 0: // 升级
        if (selected) {
          const b = game.buildings.get(selected);
          if (!b.isUnlocked()) {
            // 建造
            const cost = b.getUpgradeCost();
            if (game.wallet.consume(cost)) {
              b.level = 1;
              b.state = BuildingState.NORMAL;
              console.log(`[Build] ${b.name} built!`);
            }
          } else if (b.state === BuildingState.NORMAL) {
            const cost = b.getUpgradeCost();
            if (game.wallet.consume(cost)) {
              b.startUpgrade(Date.now());
              console.log(`[Upgrade] ${b.name} upgrading to Lv.${b.level + 1}`);
            }
          }
        }
        break;

      case 1: // 分配工人
        if (selected) {
          const b = game.buildings.get(selected);
          if (b.isUnlocked() && b.maxSlots > 0) {
            const idle = game.workers.workers.find(w => w.state === WorkerState.IDLE);
            if (idle && b.assignedWorkers.length < b.maxSlots) {
              idle.state = 'WK_WORKING';
              idle.assignedBuilding = b.type;
              b.assignedWorkers.push(idle.workerId);
              if (b.state === BuildingState.NORMAL) b.state = BuildingState.PRODUCING;
              console.log(`[Assign] ${idle.name} -> ${b.name}`);
            }
          }
        }
        break;

      case 2: // 开启火炉
        {
          const furnace = game.buildings.get(BuildingType.FURNACE);
          if (furnace.state === BuildingState.FROZEN) {
            furnace.state = BuildingState.NORMAL;
            console.log('[Furnace] Restarted');
          }
        }
        break;

      case 3: // 暂停
        game.paused = !game.paused;
        console.log(game.paused ? '[Paused]' : '[Resumed]');
        break;
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
