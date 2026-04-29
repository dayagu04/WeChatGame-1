// ==========================================
// game-renderer.js
// Canvas 渲染：城市视图 + 资源栏 + 状态面板
// ==========================================

import { ResourceType, BuildingState, WeatherType, WorkerState } from './game-constants';

// 资源图标映射
const RES_EMOJI = {
  [ResourceType.WOOD]: '🪵',
  [ResourceType.COAL]: '�ite',
  [ResourceType.MEAT]: '🥩',
  [ResourceType.RATION]: '🍖',
  [ResourceType.IRON]: '⚙️',
  [ResourceType.GEM]: '💎',
};
// 修正煤炭图标
RES_EMOJI[ResourceType.COAL] = '⬛';

const WEATHER_EMOJI = {
  [WeatherType.CLEAR]: '☀️',
  [WeatherType.SNOW]: '🌨️',
  [WeatherType.BLIZZARD]: '🌪️',
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

export class GameRenderer {
  constructor(ctx, width, height) {
    this.ctx = ctx;
    this.w = width;
    this.h = height;
    this.selectedBuilding = null;
    this.scrollY = 0;
  }

  render(gameLoop) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    // 背景：冷色调渐变
    const grad = ctx.createLinearGradient(0, 0, 0, this.h);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(1, '#16213e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.w, this.h);

    this.drawResourceBar(gameLoop);
    this.drawWeatherInfo(gameLoop);
    this.drawBuildingGrid(gameLoop);
    this.drawWorkerPanel(gameLoop);
    this.drawBottomBar(gameLoop);
  }

  // ---- 顶部资源栏 ----
  drawResourceBar(gameLoop) {
    const ctx = this.ctx;
    const y = 10;
    const resources = [
      { type: ResourceType.WOOD, label: '木材' },
      { type: ResourceType.COAL, label: '煤炭' },
      { type: ResourceType.MEAT, label: '生肉' },
      { type: ResourceType.RATION, label: '熟食' },
      { type: ResourceType.IRON, label: '铁矿' },
      { type: ResourceType.GEM, label: '钻石' },
    ];

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(5, y, this.w - 10, 55);

    ctx.font = '12px monospace';
    const colW = (this.w - 20) / 3;

    for (let i = 0; i < resources.length; i++) {
      const r = resources[i];
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 10 + col * colW;
      const ry = y + 10 + row * 25;
      const val = Math.floor(gameLoop.wallet.get(r.type));
      const cap = gameLoop.wallet.getStorageCap(r.type);
      const pct = Math.min(100, Math.floor(val / cap * 100));

      ctx.fillStyle = pct >= 90 ? '#ff6b6b' : '#e0e0e0';
      ctx.fillText(`${RES_EMOJI[r.type]} ${r.label}: ${val}/${cap} (${pct}%)`, x, ry);
    }
  }

  // ---- 天气信息 ----
  drawWeatherInfo(gameLoop) {
    const ctx = this.ctx;
    const y = 75;
    const w = gameLoop.weather;
    const emoji = WEATHER_EMOJI[w.currentWeather] || '☀️';
    const temp = w.getGlobalTemperature();

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(5, y, this.w - 10, 30);

    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = temp < -30 ? '#ff4444' : temp < -10 ? '#ffaa00' : '#44ff44';
    ctx.fillText(`${emoji} 温度: ${temp.toFixed(1)}°C  |  暴风雪: ${w.blizzardState}  |  Tick: ${gameLoop.tickCount}`, 15, y + 20);
  }

  // ---- 建筑网格 ----
  drawBuildingGrid(gameLoop) {
    const ctx = this.ctx;
    const startY = 115;
    const cardW = (this.w - 30) / 2;
    const cardH = 70;
    const gap = 5;
    const buildings = gameLoop.buildings.getAll();

    ctx.font = '13px monospace';

    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 10 + col * (cardW + gap);
      const y = startY + row * (cardH + gap) - this.scrollY;

      // 卡片背景
      const isSelected = this.selectedBuilding === b.type;
      ctx.fillStyle = isSelected ? 'rgba(100,149,237,0.3)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeStyle = isSelected ? '#6495ed' : 'rgba(255,255,255,0.15)';
      ctx.strokeRect(x, y, cardW, cardH);

      // 建筑信息
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`${b.emoji} ${b.name} Lv.${b.level}`, x + 8, y + 20);

      ctx.font = '11px monospace';
      ctx.fillStyle = '#aaa';
      const stateText = STATE_NAMES[b.state] || '未知';
      ctx.fillText(`${stateText}  工人: ${b.assignedWorkers.length}/${b.maxSlots}`, x + 8, y + 38);

      // 升级进度条
      if (b.state === BuildingState.UPGRADING) {
        const elapsed = Date.now() - b.upgradeStartTimeMs;
        const pct = Math.min(1, elapsed / b.upgradeDurationMs);
        const barW = cardW - 16;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x + 8, y + 48, barW, 8);
        ctx.fillStyle = '#4ecdc4';
        ctx.fillRect(x + 8, y + 48, barW * pct, 8);
        ctx.fillStyle = '#fff';
        ctx.font = '9px monospace';
        const remainSec = Math.ceil((b.upgradeDurationMs - elapsed) / 1000);
        ctx.fillText(`${remainSec}s`, x + 8 + barW / 2 - 10, y + 55);
      }

      // 升级费用
      if (b.isUnlocked() && b.state === BuildingState.NORMAL) {
        const cost = b.getUpgradeCost();
        const costType = Object.keys(cost)[0];
        const costVal = cost[costType];
        ctx.font = '10px monospace';
        ctx.fillStyle = gameLoop.wallet.canAfford(cost) ? '#4ecdc4' : '#ff6b6b';
        ctx.fillText(`升级: ${costVal} ${costType.replace('RES_', '')}`, x + 8, y + 62);
      }
    }
  }

  // ---- 工人面板 ----
  drawWorkerPanel(gameLoop) {
    const ctx = this.ctx;
    const buildings = gameLoop.buildings.getAll();
    const gridRows = Math.ceil(buildings.length / 2);
    const startY = 115 + gridRows * 75 + 10;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(5, startY, this.w - 10, 100);

    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#fff';
    const alive = gameLoop.workers.getAlive();
    const working = gameLoop.workers.getWorkingCount();
    const sick = gameLoop.workers.getSickCount();
    ctx.fillText(`👷 幸存者: ${alive.length}  工作中: ${working}  生病: ${sick}`, 15, startY + 20);

    ctx.font = '11px monospace';
    let yy = startY + 38;
    for (const w of alive.slice(0, 5)) {
      const stateEmoji = w.state === WorkerState.WORKING ? '⚒️'
        : w.state === WorkerState.SICK ? '🤒'
        : w.state === WorkerState.HEALING ? '💊'
        : w.state === WorkerState.EATING ? '🍽️'
        : '🚶';
      ctx.fillStyle = w.health < 30 ? '#ff6b6b' : '#ccc';
      ctx.fillText(
        `${stateEmoji} ${w.name} | ❤️${Math.floor(w.health)} 🍖${Math.floor(w.hunger)} 😊${Math.floor(w.mood)}`,
        15, yy
      );
      yy += 15;
    }
  }

  // ---- 底部操作栏 ----
  drawBottomBar(gameLoop) {
    const ctx = this.ctx;
    const y = this.h - 55;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, y, this.w, 55);

    // 操作按钮
    const buttons = [
      { label: '🔨 升级', action: 'upgrade' },
      { label: '👷 分配工人', action: 'assign' },
      { label: '🔥 开启火炉', action: 'furnace' },
      { label: '⏸️ 暂停', action: 'pause' },
    ];

    const btnW = (this.w - 40) / 4;
    ctx.font = 'bold 12px monospace';

    for (let i = 0; i < buttons.length; i++) {
      const bx = 10 + i * (btnW + 5);
      ctx.fillStyle = 'rgba(100,149,237,0.3)';
      ctx.fillRect(bx, y + 8, btnW, 35);
      ctx.strokeStyle = '#6495ed';
      ctx.strokeRect(bx, y + 8, btnW, 35);

      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(buttons[i].label, bx + btnW / 2, y + 30);
      ctx.textAlign = 'left';
    }
  }
}
