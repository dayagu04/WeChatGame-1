// ==========================================
// game-main.js
// 游戏主控：初始化 + 渲染循环 + 输入处理（相机感知）
// ==========================================

import './render';
import { SAFE_TOP } from './render';
import { BuildingType, BuildingState, ResourceType, WorkerState, EXPEDITION_CONFIGS, eventBus, GlobalEvents } from './game-constants';
import { GameLoop } from './game-loop';
import { GameRenderer, HUD } from './game-renderer';
import { PersistenceManager } from './game-persistence';
import { BUILDING_WORLD_POSITIONS, getBuildingAnchor } from './visual/sprites';

export default class GameMain {
  constructor() {
    this.ctx = canvas.getContext('2d');
    this.w = canvas.width;
    this.h = canvas.height;

    // 核心系统
    this.game = new GameLoop();
    this.renderer = new GameRenderer(this.ctx, this.w, this.h, SAFE_TOP);
    this.persistence = new PersistenceManager(this.game);

    // 探索选择索引
    this.expeditionIndex = 0;

    // 触摸输入状态
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
    this.setupInput();
    this.setupLogging();

    // 加载存档
    const loaded = this.persistence.load();
    if (loaded) {
      console.log('[EndlessWinter] Save data loaded');
    }

    // 启动
    this.game.start();
    this.persistence.startAutoSave();
    this.startRenderLoop();

    console.log(`[EndlessWinter] Game started! safeTop=${SAFE_TOP}, canvas=${this.w}x${this.h}`);
  }

  setupInput() {
    const cam = this.renderer.camera;

    wx.onTouchStart((e) => {
      const touch = e.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.touchStartTime = Date.now();
      this.touchMoved = false;
      cam.startDrag(touch.clientX, touch.clientY);
    });

    wx.onTouchMove((e) => {
      const touch = e.touches[0];
      const dx = touch.clientX - this.touchStartX;
      const dy = touch.clientY - this.touchStartY;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) this.touchMoved = true;
      cam.drag(touch.clientX, touch.clientY);
    });

    wx.onTouchEnd((e) => {
      cam.endDrag();
      // 没有拖拽 = 点击
      if (!this.touchMoved) {
        this.handleTap(this.touchStartX, this.touchStartY);
      }
    });
  }

  setupLogging() {
    const r = this.renderer;

    eventBus.on(GlobalEvents.BUILDING_STATE_CHANGE, (data) => {
      console.log(`[Event] Building state change: ${data.buildingId} -> ${data.newState}`);
    });
    eventBus.on(GlobalEvents.BUILDING_UPGRADE_COMPLETE, (data) => {
      console.log(`[Event] Building upgrade complete: ${data.buildingId} -> Lv.${data.newLevel}`);
      r.addNotification(`建筑升级完成！${data.buildingId} -> Lv.${data.newLevel}`, 'success');
    });
    eventBus.on(GlobalEvents.WORKER_STATE_CHANGE, (data) => {
      console.log(`[Event] Worker state change: ${data.workerId} -> ${data.newState}`);
    });
    eventBus.on(GlobalEvents.EXPEDITION_COMPLETE, (data) => {
      console.log(`[Event] Expedition complete: ${data.workerId} got ${data.rewardAmount} ${data.rewardType}, injured=${data.injured}`);
      r.addNotification(`探索归来！获得 ${data.rewardAmount} ${data.rewardType.replace('RES_', '')}`, 'success');
    });
    eventBus.on(GlobalEvents.WORKER_DIED, (data) => {
      console.log(`[Event] Worker died: ${data.workerId}, reason=${data.reason}`);
      r.addNotification(`工人死亡！原因: ${data.reason === 'sickness' ? '疾病' : '饥饿'}`, 'danger');
    });
    eventBus.on(GlobalEvents.RANDOM_EVENT, (data) => {
      const type = data.type === 'POSITIVE' ? 'info' : 'warning';
      r.addNotification(`${data.name}: ${data.detail}`, type);
    });
    eventBus.on(GlobalEvents.WEATHER_CHANGED, (data) => {
      if (data.phase === 'warning') {
        r.addNotification('暴风雪预警！准备煤炭和食物！', 'warning');
      } else if (data.phase === 'active') {
        r.addNotification('暴风雪来袭！工人加速掉血！', 'danger');
      }
    });
    eventBus.on(GlobalEvents.ACHIEVEMENT_UNLOCK, (data) => {
      r.addNotification(`成就解锁: ${data.name}！`, 'success');
    });
    eventBus.on(GlobalEvents.RESEARCH_COMPLETE, (data) => {
      r.addNotification(`研究完成: ${data.name}`, 'success');
    });
    eventBus.on(GlobalEvents.CARAVAN_ARRIVE, () => {
      r.addNotification('商队到达！交易享受折扣！', 'info');
    });

    // 浮动资源产出文字
    const RES_FLOAT_EMOJI = {
      [ResourceType.WOOD]: '🪵', [ResourceType.COAL]: '⬛',
      [ResourceType.MEAT]: '🥩', [ResourceType.RATION]: '🍖',
      [ResourceType.IRON]: '⚙️', [ResourceType.GEM]: '💎',
    };
    const RES_FLOAT_COLOR = {
      [ResourceType.WOOD]: '#c4a265', [ResourceType.COAL]: '#888',
      [ResourceType.MEAT]: '#e88', [ResourceType.RATION]: '#fa0',
      [ResourceType.IRON]: '#aaf', [ResourceType.GEM]: '#4ee',
    };
    eventBus.on(GlobalEvents.RESOURCE_PRODUCED, (data) => {
      const pos = getBuildingAnchor(data.buildingType);
      const emoji = RES_FLOAT_EMOJI[data.resourceType] || '';
      const color = RES_FLOAT_COLOR[data.resourceType] || '#4ecdc4';
      r.addFloatingText(
        pos.x + (Math.random() - 0.5) * 20,
        pos.y - 20,
        `+${Math.floor(data.amount)}${emoji}`,
        color,
      );
    });
  }

  handleTap(x, y) {
    const game = this.game;
    const r = this.renderer;
    const cam = r.camera;
    const L = HUD;

    // 1. 检查底部按钮点击（屏幕空间，优先级最高）
    const btnY = this.h - L.BOTTOM_BAR_H;
    const btnW = (this.w - L.BTN_LEFT_PAD - L.BTN_RIGHT_PAD - (L.BTN_COUNT - 1) * L.BTN_GAP) / L.BTN_COUNT;

    if (y >= btnY + L.BTN_TOP_PAD && y <= btnY + L.BTN_TOP_PAD + L.BTN_H) {
      for (let i = 0; i < L.BTN_COUNT; i++) {
        const bx = L.BTN_LEFT_PAD + i * (btnW + L.BTN_GAP);
        if (x >= bx && x <= bx + btnW) {
          this.handleAction(i);
          return;
        }
      }
    }

    // 2. 检查顶部资源栏点击（忽略）
    if (y < r.safeTop + HUD.RESOURCE_BAR_H + HUD.WEATHER_BAR_H) return;

    // 3. 检查建筑点击（世界空间）
    const worldPos = cam.screenToWorld(x, y);
    const buildings = game.buildings.getAll();

    for (const b of buildings) {
      const pos = BUILDING_WORLD_POSITIONS[b.type];
      if (!pos) continue;

      if (worldPos.x >= pos.x && worldPos.x <= pos.x + pos.w &&
          worldPos.y >= pos.y && worldPos.y <= pos.y + pos.h) {
        r.selectedBuilding = b.type;
        console.log(`[Tap] Building "${b.name}" selected (state=${b.state}, lv=${b.level})`);
        r.selectedWorker = null;
        return;
      }
    }

    // 4. 检查工人点击（世界空间，半径 15px）
    for (const [workerId, vpos] of r.workerVisualPos) {
      const dx = worldPos.x - vpos.x;
      const dy = worldPos.y - vpos.y;
      if (dx * dx + dy * dy < 225) {
        const w = game.workers.workers.find(w => w.workerId === workerId);
        if (w) {
          r.selectedWorker = workerId;
          r.selectedBuilding = null;
          console.log(`[Tap] Worker "${w.name}" selected (state=${w.state}, health=${Math.floor(w.health)})`);
          return;
        }
      }
    }

    // 点击空白处取消选择
    r.selectedBuilding = null;
    r.selectedWorker = null;
  }

  handleAction(btnIndex) {
    const game = this.game;
    const selected = this.renderer.selectedBuilding;

    switch (btnIndex) {
      case 0: // 升级 / 建造
        this.doUpgrade(selected);
        break;

      case 1: // 分配/卸任工人
        if (selected) {
          const b = game.buildings.get(selected);
          if (b && b.isUnlocked() && b.assignedWorkers.length >= b.maxSlots && b.maxSlots > 0) {
            this.doUnassign(selected);
          } else {
            this.doAssign(selected);
          }
        } else {
          this.doAssign(selected);
        }
        break;

      case 2: // 智能操作
        if (selected) {
          const b = game.buildings.get(selected);
          if (!b.isUnlocked()) this.doUpgrade(selected);
          else this.doAssign(selected);
        } else {
          this.doExplore();
        }
        break;

      case 3: // 火炉重启 / 速度切换
        {
          const furnace = game.buildings.get(BuildingType.FURNACE);
          if (furnace.state === BuildingState.FROZEN) {
            furnace.state = BuildingState.NORMAL;
            r.addNotification('火炉已重新启动！', 'success');
            console.log('[Action] Furnace restarted');
          } else if (game.paused) {
            game.paused = false;
            r.addNotification('游戏继续', 'info');
          } else {
            const spd = game.cycleSpeed();
            if (spd === 1) {
              r.addNotification('正常速度 (1x)', 'info');
            } else {
              r.addNotification(`加速 ${spd}x`, 'success');
            }
          }
        }
        break;
    }
  }

  doUpgrade(selected) {
    const game = this.game;
    const r = this.renderer;
    if (!selected) {
      r.addNotification('请先选择一个建筑', 'warning');
      return;
    }
    const b = game.buildings.get(selected);
    if (!b.isUnlocked()) {
      const cost = b.getUpgradeCost();
      const costType = Object.keys(cost)[0];
      const costVal = cost[costType];
      const have = game.wallet.get(costType);
      console.log(`[Action:Build] ${b.name} cost=${costVal} ${costType}, have=${Math.floor(have)}`);
      if (game.wallet.consume(cost)) {
        b.level = 1;
        b.state = BuildingState.NORMAL;
        console.log(`[Action:Build] SUCCESS: ${b.name} built!`);
        r.addNotification(`建造成功：${b.name}！`, 'success');
      } else {
        console.log(`[Action:Build] FAILED: need ${costVal} ${costType}, have ${Math.floor(have)}`);
        r.addNotification(`资源不足！需要 ${costVal} ${costType.replace('RES_', '')}（当前 ${Math.floor(have)}）`, 'danger');
      }
    } else if (b.state === BuildingState.NORMAL || b.state === BuildingState.PRODUCING) {
      const cost = b.getUpgradeCost();
      const costType = Object.keys(cost)[0];
      const costVal = cost[costType];
      const have = game.wallet.get(costType);
      console.log(`[Action:Upgrade] ${b.name} Lv.${b.level} cost=${costVal} ${costType}`);
      if (game.wallet.consume(cost)) {
        b.startUpgrade(Date.now());
        console.log(`[Action:Upgrade] SUCCESS: ${b.name} upgrading to Lv.${b.level + 1}`);
        r.addNotification(`${b.name} 开始升级！`, 'info');
      } else {
        console.log(`[Action:Upgrade] FAILED: need ${costVal} ${costType}, have ${Math.floor(have)}`);
        r.addNotification(`资源不足！需要 ${costVal} ${costType.replace('RES_', '')}（当前 ${Math.floor(have)}）`, 'danger');
      }
    } else {
      console.log(`[Action:Upgrade] ${b.name} state=${b.state}, cannot upgrade`);
      r.addNotification(`${b.name} 当前无法升级`, 'warning');
    }
  }

  doAssign(selected) {
    const game = this.game;
    const r = this.renderer;
    if (!selected) {
      r.addNotification('请先选择一个建筑', 'warning');
      return;
    }
    const b = game.buildings.get(selected);
    if (!b.isUnlocked()) {
      r.addNotification(`${b.name} 尚未建造`, 'warning');
      return;
    }
    if (b.maxSlots <= 0) {
      r.addNotification(`${b.name} 没有工人槽位`, 'warning');
      return;
    }
    const idle = game.workers.workers.find(w => w.state === WorkerState.IDLE);
    if (!idle) {
      r.addNotification('没有空闲工人可分配', 'warning');
      return;
    }
    if (b.assignedWorkers.length >= b.maxSlots) {
      r.addNotification(`${b.name} 已满员 (${b.assignedWorkers.length}/${b.maxSlots})`, 'warning');
      return;
    }
    idle.state = WorkerState.WORKING;
    idle.assignedBuilding = b.type;
    b.assignedWorkers.push(idle.workerId);
    if (b.state === BuildingState.NORMAL) b.state = BuildingState.PRODUCING;
    console.log(`[Action:Assign] SUCCESS: ${idle.name} -> ${b.name} (${b.assignedWorkers.length}/${b.maxSlots})`);
    r.addNotification(`${idle.name} 已分配到 ${b.name}`, 'success');
  }

  doUnassign(selected) {
    const game = this.game;
    if (!selected) return;
    const b = game.buildings.get(selected);
    if (!b || !b.isUnlocked() || b.assignedWorkers.length === 0) return;

    // 移除最后分配的工人
    const workerId = b.assignedWorkers.pop();
    const w = game.workers.workers.find(w => w.workerId === workerId);
    if (w) {
      w.state = WorkerState.IDLE;
      w.assignedBuilding = null;
      console.log(`[Action:Unassign] SUCCESS: ${w.name} <- ${b.name} (${b.assignedWorkers.length}/${b.maxSlots})`);
    }

    // 如果没有工人了，建筑停止生产
    if (b.assignedWorkers.length === 0 && b.state === BuildingState.PRODUCING) {
      b.state = BuildingState.HALTED_NO_WORKER;
    }
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
