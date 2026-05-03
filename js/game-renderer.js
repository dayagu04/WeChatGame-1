// ==========================================
// game-renderer.js
// 动态 2D 场景渲染器：天空、山脉、建筑精灵、工人动画、天气粒子
// ==========================================

import { ResourceType, BuildingState, WeatherType, WorkerState, EXPEDITION_CONFIGS, BuildingType } from './game-constants';
import { ParticleSystem } from './visual/particles';
import { drawBuildingSprite, drawWorker, drawSky, drawMountains, drawGround, drawExpeditionBar } from './visual/sprites';

const RES_EMOJI = {
  [ResourceType.WOOD]: '🪵',
  [ResourceType.COAL]: '⬛',
  [ResourceType.MEAT]: '🥩',
  [ResourceType.RATION]: '🍖',
  [ResourceType.IRON]: '⚙️',
  [ResourceType.GEM]: '💎',
};

const WEATHER_EMOJI = {
  [WeatherType.CLEAR]: '☀️',
  [WeatherType.SNOW]: '🌨️',
  [WeatherType.BLIZZARD]: '🌪️',
};

const BLIZZARD_NAMES = {
  'BLZ_IDLE': '平静',
  'BLZ_WARNING': '预警中',
  'BLZ_ACTIVE': '肆虐中',
  'BLZ_RECOVERY': '消退中',
};

const STATE_NAMES = {
  [BuildingState.LOCKED]: '🔒 未解锁',
  [BuildingState.NORMAL]: '✅ 空闲',
  [BuildingState.UPGRADING]: '🔨 升级中',
  [BuildingState.PRODUCING]: '⚙️ 生产中',
  [BuildingState.HALTED_NO_WORKER]: '❌ 缺人',
  [BuildingState.HALTED_NO_MATERIAL]: '❌ 缺料',
  [BuildingState.FROZEN]: '🧊 冻结',
};

// 场景布局常量（导出供 game-main.js 共享）
export const LAYOUT = {
  RESOURCE_BAR_H: 60,
  WEATHER_BAR_H: 28,
  BOTTOM_BAR_H: 55,
  BUILDING_COLS: 2,
  BUILDING_CARD_W: 150,
  BUILDING_CARD_H: 100,
  BUILDING_GAP: 12,
  GROUND_MARGIN: 30,
  // 按钮布局
  BTN_LEFT_PAD: 10,
  BTN_RIGHT_PAD: 10,
  BTN_GAP: 5,
  BTN_COUNT: 4,
  BTN_TOP_PAD: 8,
  BTN_H: 35,
};

const SCENE_TOP_OFFSET = LAYOUT.RESOURCE_BAR_H + LAYOUT.WEATHER_BAR_H + 8;

export class GameRenderer {
  constructor(ctx, width, height, safeTop) {
    this.ctx = ctx;
    this.w = width;
    this.h = height;
    this.safeTop = safeTop || 0;
    this.selectedBuilding = null;
    this.scrollY = 0;
    this.maxScrollY = 500; // 合理默认值，首帧渲染后更新

    // 粒子系统
    this.particles = new ParticleSystem(width, height);

    // 工人位置缓存（用于动画平滑移动）
    this.workerPositions = new Map();
    this.animTime = 0;
  }

  render(gameLoop) {
    const ctx = this.ctx;
    this.animTime = Date.now() / 1000;

    // 更新粒子
    this.particles.update(gameLoop.weather);

    // 计算场景布局
    const groundY = this.h * 0.42;
    const sceneAreaTop = this.safeTop + SCENE_TOP_OFFSET;
    const sceneAreaBottom = this.h - LAYOUT.BOTTOM_BAR_H;
    const sceneH = sceneAreaBottom - sceneAreaTop;

    ctx.clearRect(0, 0, this.w, this.h);

    // === 1. 天空 ===
    const temp = gameLoop.weather.getGlobalTemperature();
    const furnace = gameLoop.buildings.get(BuildingType.FURNACE);
    const furnaceLv = furnace.isUnlocked() ? furnace.level : 0;
    const warmth = furnaceLv > 0 && furnace.state !== BuildingState.FROZEN ? furnaceLv * 2 : 0;
    const effectiveTemp = temp + warmth;

    drawSky(ctx, this.w, this.h, effectiveTemp, gameLoop.getTimeOfDay());

    // === 2. 远山 ===
    drawMountains(ctx, this.w, groundY);

    // === 3. 地面 ===
    drawGround(ctx, this.w, this.h, groundY);

    // === 4. 建筑精灵 + 工人（可滚动区域）===
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, sceneAreaTop, this.w, sceneH);
    ctx.clip();

    this.drawBuildingScene(gameLoop, groundY, sceneAreaTop);

    ctx.restore();

    // === 5. 天气粒子覆盖 ===
    this.particles.draw(ctx, gameLoop.weather);

    // === 6. 暴风雪屏幕遮罩 ===
    if (gameLoop.weather.blizzardState === 'BLZ_ACTIVE') {
      ctx.fillStyle = 'rgba(200,210,230,0.08)';
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // === 7. UI 层 ===
    this.drawResourceBar(gameLoop);
    this.drawWeatherInfo(gameLoop, effectiveTemp, warmth);
    this.drawBottomBar(gameLoop);
  }

  // ---- 建筑场景 ----
  drawBuildingScene(gameLoop, groundY, sceneAreaTop) {
    const ctx = this.ctx;
    const buildings = gameLoop.buildings.getAll();
    const { BUILDING_COLS: COLS, BUILDING_CARD_W: CW, BUILDING_CARD_H: CH, BUILDING_GAP: GAP, BOTTOM_BAR_H: BBH, GROUND_MARGIN: GM } = LAYOUT;
    const totalRows = Math.ceil(buildings.length / COLS);
    const gridW = COLS * CW + (COLS - 1) * GAP;
    const startX = (this.w - gridW) / 2;
    const startY = sceneAreaTop + 10 - this.scrollY;

    // 更新最大滚动
    const contentH = totalRows * (CH + GAP) + GM;
    const sceneH = this.h - BBH - sceneAreaTop;
    this.maxScrollY = Math.max(0, contentH - sceneH);

    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const bx = startX + col * (CW + GAP);
      const by = startY + row * (CH + GAP);

      // 选中高亮
      const isSelected = this.selectedBuilding === b.type;

      // 建筑底座阴影
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(bx + CW / 2, by + CH + 2, CW / 2 - 5, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // 建筑精灵
      if (b.isUnlocked()) {
        drawBuildingSprite(ctx, b.type, bx, by, CW, CH, b.state, b.level);
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(bx + 10, by + 10, CW - 20, CH - 20);
        ctx.setLineDash([]);
        ctx.fillStyle = '#666';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🔒 ' + b.name, bx + CW / 2, by + CH / 2 - 4);
        const cost = b.getUpgradeCost();
        const costType = Object.keys(cost)[0];
        const costVal = cost[costType];
        ctx.fillStyle = gameLoop.wallet.canAfford(cost) ? '#4ecdc4' : '#ff6b6b';
        ctx.font = '10px monospace';
        ctx.fillText(`${costVal} ${costType.replace('RES_', '')}`, bx + CW / 2, by + CH / 2 + 12);
        ctx.textAlign = 'left';
      }

      // 选中边框
      if (isSelected) {
        ctx.strokeStyle = '#6495ed';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx - 1, by - 1, CW + 2, CH + 2);
      }

      // 建筑名称标签
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx + 24, by + CH - 18, CW - 28, 16);
      ctx.fillStyle = '#fff';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      const stateText = STATE_NAMES[b.state] || '';
      ctx.fillText(`${b.emoji} ${b.name} ${stateText}`, bx + CW / 2, by + CH - 6);
      ctx.textAlign = 'left';

      // 升级进度条
      if (b.state === BuildingState.UPGRADING) {
        const elapsed = Date.now() - b.upgradeStartTimeMs;
        const pct = Math.min(1, elapsed / b.upgradeDurationMs);
        drawExpeditionBar(ctx, bx + 8, by + CH + 4, CW - 16, pct, '升级中');
      }

      // 分配工人数量指示
      if (b.isUnlocked() && b.maxSlots > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx + CW - 28, by + 2, 26, 14);
        ctx.fillStyle = '#fff';
        ctx.font = '9px monospace';
        ctx.fillText(`👷${b.assignedWorkers.length}/${b.maxSlots}`, bx + CW - 26, by + 12);
      }

      this.drawAssignedWorkers(gameLoop, b, bx, by);
    }
  }

  // ---- 在建筑旁绘制工人角色 ----
  drawAssignedWorkers(gameLoop, building, bx, by) {
    if (!building.isUnlocked()) return;
    const ctx = this.ctx;

    const workers = gameLoop.workers.workers.filter(
      w => w.assignedBuilding === building.type && w.state !== WorkerState.DEAD
    );

    for (let i = 0; i < workers.length; i++) {
      const w = workers[i];
      const wx = bx + 20 + i * 22;
      const wy = by + LAYOUT.BUILDING_CARD_H - 4;
      drawWorker(ctx, w, wx, wy, 0.8);

      // 健康状态条
      if (w.health < 50) {
        const barW = 16;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(wx - barW / 2, wy - 12, barW, 3);
        ctx.fillStyle = w.health < 25 ? '#ff4444' : '#ffaa00';
        ctx.fillRect(wx - barW / 2, wy - 12, barW * (w.health / 100), 3);
      }
    }
  }

  // ---- 顶部资源栏 ----
  drawResourceBar(gameLoop) {
    const ctx = this.ctx;
    const y = this.safeTop + 4;
    const resources = [
      { type: ResourceType.WOOD, label: '木' },
      { type: ResourceType.COAL, label: '煤' },
      { type: ResourceType.MEAT, label: '肉' },
      { type: ResourceType.RATION, label: '食' },
      { type: ResourceType.IRON, label: '铁' },
      { type: ResourceType.GEM, label: '钻' },
    ];

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, 4, y, this.w - 8, LAYOUT.RESOURCE_BAR_H - 4, 6);
    ctx.fill();

    ctx.font = '11px monospace';
    const colW = (this.w - 16) / 3;

    for (let i = 0; i < resources.length; i++) {
      const r = resources[i];
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 8 + col * colW;
      const ry = y + 14 + row * 22;
      const val = Math.floor(gameLoop.wallet.get(r.type));
      const cap = gameLoop.wallet.getStorageCap(r.type);
      const pct = Math.min(100, Math.floor(val / cap * 100));

      // 进度条背景
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, ry + 3, colW - 8, 8);
      ctx.fillStyle = pct >= 90 ? 'rgba(255,100,100,0.4)' : 'rgba(100,200,180,0.3)';
      ctx.fillRect(x, ry + 3, (colW - 8) * pct / 100, 8);

      ctx.fillStyle = pct >= 90 ? '#ff6b6b' : '#e0e0e0';
      ctx.fillText(`${RES_EMOJI[r.type]}${r.label}:${val}/${cap}`, x, ry);
    }
  }

  // ---- 天气信息 ----
  drawWeatherInfo(gameLoop, effectiveTemp, warmth) {
    const ctx = this.ctx;
    const y = this.safeTop + LAYOUT.RESOURCE_BAR_H;
    const w = gameLoop.weather;
    const emoji = WEATHER_EMOJI[w.currentWeather] || '☀️';

    // 日夜时间
    const tod = gameLoop.getTimeOfDay();
    const hour = Math.floor(tod * 24);
    const timeStr = `${String(hour).padStart(2, '0')}:00`;
    const timeEmoji = (tod < 0.2 || tod > 0.85) ? '🌙' : (tod < 0.3 || tod > 0.7) ? '🌅' : '☀️';
    const eff = gameLoop.getWorkerEfficiency();
    const effStr = eff < 1 ? ` 效率${Math.floor(eff * 100)}%` : '';

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, 4, y, this.w - 8, LAYOUT.WEATHER_BAR_H, 4);
    ctx.fill();

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = effectiveTemp < -30 ? '#ff4444' : effectiveTemp < -10 ? '#ffaa00' : '#44ff44';
    const blizName = BLIZZARD_NAMES[w.blizzardState] || w.blizzardState;
    const warmthStr = warmth > 0 ? ` (+${warmth}🔥)` : '';
    ctx.fillText(`${emoji}${effectiveTemp.toFixed(1)}°C${warmthStr} ${timeEmoji}${timeStr}${effStr} 暴风雪:${blizName}`, 10, y + 18);
  }

  // ---- 底部操作栏 ----
  drawBottomBar(gameLoop) {
    const ctx = this.ctx;
    const { BOTTOM_BAR_H: BBH, BTN_LEFT_PAD: BLP, BTN_RIGHT_PAD: BRP, BTN_GAP: BG,
            BTN_COUNT: BC, BTN_TOP_PAD: BTP, BTN_H: BH } = LAYOUT;
    const y = this.h - BBH;

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, y, this.w, BBH);

    const furnace = gameLoop.buildings.get(BuildingType.FURNACE);
    const btn3Label = furnace && furnace.state === BuildingState.FROZEN
      ? '🔥 重启火炉'
      : (gameLoop.paused ? '▶️ 继续' : '⏸️ 暂停');

    let btn2Label = '🧭 探索';
    if (this.selectedBuilding) {
      const sel = gameLoop.buildings.get(this.selectedBuilding);
      if (sel && !sel.isUnlocked()) {
        btn2Label = '🏗️ 建造';
      } else if (sel && sel.isUnlocked()) {
        btn2Label = '👷 分配';
      }
    }

    const buttons = [
      { label: '🔨 升级' },
      { label: '👷 分配' },
      { label: btn2Label },
      { label: btn3Label },
    ];

    const btnW = (this.w - BLP - BRP - (BC - 1) * BG) / BC;
    ctx.font = 'bold 11px monospace';

    ctx.save();
    for (let i = 0; i < buttons.length; i++) {
      const bx = BLP + i * (btnW + BG);
      ctx.fillStyle = 'rgba(100,149,237,0.25)';
      roundRect(ctx, bx, y + BTP, btnW, BH, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(100,149,237,0.6)';
      ctx.lineWidth = 1;
      roundRect(ctx, bx, y + BTP, btnW, BH, 6);
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(buttons[i].label, bx + btnW / 2, y + BTP + BH / 2 + 4);
    }
    ctx.restore();
  }
}

// ---- 工具函数 ----

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
