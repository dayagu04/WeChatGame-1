// ==========================================
// game-renderer.js
// LOL 风格全屏 2D 世界渲染器
// 天空、远景山脉、地面、建筑精灵、工人动画、天气粒子、HUD
// ==========================================

import { ResourceType, BuildingState, WeatherType, WorkerState, BuildingType } from './game-constants';
import { ParticleSystem } from './visual/particles';
import {
  drawBuildingSprite, drawWorker, drawSky, drawExpeditionBar,
  drawWorldGround, drawWorldTrees, drawWorldRocks, drawWorldBuilding,
  drawWorldWorker, drawWorldMountains, drawWorldLockedBuilding,
  BUILDING_WORLD_POSITIONS, getBuildingAnchor,
} from './visual/sprites';
import { Camera } from './visual/camera';

const RES_EMOJI = {
  [ResourceType.WOOD]: '🪵', [ResourceType.COAL]: '⬛',
  [ResourceType.MEAT]: '🥩', [ResourceType.RATION]: '🍖',
  [ResourceType.IRON]: '⚙️', [ResourceType.GEM]: '💎',
};

const WEATHER_EMOJI = {
  [WeatherType.CLEAR]: '☀️', [WeatherType.SNOW]: '🌨️', [WeatherType.BLIZZARD]: '🌪️',
};

const BLIZZARD_NAMES = {
  'BLZ_IDLE': '平静', 'BLZ_WARNING': '预警中',
  'BLZ_ACTIVE': '肆虐中', 'BLZ_RECOVERY': '消退中',
};

// HUD 布局常量
export const HUD = {
  RESOURCE_BAR_H: 56,
  WEATHER_BAR_H: 26,
  BOTTOM_BAR_H: 50,
  BTN_LEFT_PAD: 8,
  BTN_RIGHT_PAD: 8,
  BTN_GAP: 4,
  BTN_COUNT: 4,
  BTN_TOP_PAD: 6,
  BTN_H: 34,
};

// 世界参数
const WORLD_W = 2400;
const WORLD_H = 1000;
const HORIZON_RATIO = 0.35; // 地平线在屏幕高度的 35% 处

// 工人行走速度（像素/帧，约 60fps）
const WORKER_WALK_SPEED = 1.5;

export class GameRenderer {
  constructor(ctx, width, height, safeTop) {
    this.ctx = ctx;
    this.w = width;
    this.h = height;
    this.safeTop = safeTop || 0;
    this.selectedBuilding = null;
    this.selectedWorker = null;
    this.animTime = 0;

    // 相机系统
    this.camera = new Camera(WORLD_W, WORLD_H, width, height);
    // 初始居中到火炉位置
    const furnacePos = BUILDING_WORLD_POSITIONS[BuildingType.FURNACE];
    if (furnacePos) {
      this.camera.centerOn(furnacePos.x + furnacePos.w / 2, furnacePos.y + furnacePos.h / 2);
    }

    // 粒子系统
    this.particles = new ParticleSystem(width, height);

    // 工人视觉位置缓存 { workerId -> { x, y } }
    this.workerVisualPos = new Map();

    // 地平线 Y（屏幕空间）
    this.horizonY = Math.floor(this.h * HORIZON_RATIO);

    // 通知队列
    this.notifications = [];
    this.maxNotifications = 4;
    this.notifDuration = 4000; // 4秒

    // 浮动文字队列
    this.floatingTexts = [];
    this.floatingDuration = 2000; // 2秒
  }

  render(gameLoop) {
    const ctx = this.ctx;
    this.animTime = Date.now() / 1000;
    const cam = this.camera;

    // 更新粒子
    this.particles.update(gameLoop.weather);

    // 温度计算
    const temp = gameLoop.weather.getGlobalTemperature();
    const furnace = gameLoop.buildings.get(BuildingType.FURNACE);
    const furnaceLv = furnace.isUnlocked() ? furnace.level : 0;
    const warmth = furnaceLv > 0 && furnace.state !== BuildingState.FROZEN ? furnaceLv * 2 : 0;
    const effectiveTemp = temp + warmth;

    ctx.clearRect(0, 0, this.w, this.h);

    // === 1. 天空（全屏背景） ===
    drawSky(ctx, this.w, this.h, effectiveTemp, gameLoop.getTimeOfDay());

    // === 2. 远景山脉（视差滚动） ===
    drawWorldMountains(ctx, cam.x, this.w, this.horizonY);

    // === 3. 地面 ===
    drawWorldGround(ctx, cam.x, cam.y, this.w, this.h, WORLD_H, this.horizonY);

    // === 4. 装饰（树木、岩石） ===
    ctx.save();
    drawWorldTrees(ctx, cam.x, cam.y, this.w, this.h);
    drawWorldRocks(ctx, cam.x, cam.y, this.w, this.h);
    ctx.restore();

    // === 5. 建筑地面效果（火炉光芒等） ===
    this.drawWorldAmbientEffects(gameLoop, cam);

    // === 6. 建筑 ===
    const buildings = gameLoop.buildings.getAll();
    for (const b of buildings) {
      const pos = BUILDING_WORLD_POSITIONS[b.type];
      if (!pos) continue;

      const screenPos = cam.worldToScreen(pos.x, pos.y);
      // 视锥剔除
      if (screenPos.x + pos.w < -20 || screenPos.x > this.w + 20) continue;
      if (screenPos.y + pos.h < -20 || screenPos.y > this.h + 20) continue;

      const isSelected = this.selectedBuilding === b.type;

      if (b.isUnlocked()) {
        drawWorldBuilding(ctx, b.type, screenPos.x, screenPos.y, pos.w, pos.h,
          b.state, b.level, b.name, b.emoji, isSelected);

        // 升级动画：脚手架 + 粒子
        if (b.state === BuildingState.UPGRADING) {
          this.drawUpgradeEffect(ctx, screenPos.x, screenPos.y, pos.w, pos.h, b);
        }
      } else {
        drawWorldLockedBuilding(ctx, screenPos.x, screenPos.y, pos.w, pos.h,
          b.name, b.getUpgradeCost(), gameLoop.wallet.canAfford(b.getUpgradeCost()));
      }
    }

    // === 6. 工人 ===
    this.drawWorldWorkers(gameLoop, cam);

    // === 7. 天气粒子 ===
    this.particles.draw(ctx, gameLoop.weather);

    // === 8. 日夜循环遮罩 ===
    const timeOfDay = gameLoop.getTimeOfDay();
    this.drawDayNightOverlay(ctx, timeOfDay, gameLoop);

    // === 9. 暴风雪遮罩 ===
    if (gameLoop.weather.blizzardState === 'BLZ_ACTIVE') {
      ctx.fillStyle = 'rgba(200,210,230,0.1)';
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // === 9. HUD ===
    this.drawResourceBar(gameLoop);
    this.drawWeatherInfo(gameLoop, effectiveTemp, warmth);
    this.drawBottomBar(gameLoop);

    // === 10. 小地图 ===
    this.drawMinimap(gameLoop, cam);

    // === 11. 建筑/工人信息面板 ===
    if (this.selectedBuilding) {
      this.drawBuildingInfoPanel(gameLoop);
    }
    if (this.selectedWorker) {
      this.drawWorkerInfoPanel(gameLoop);
    }

    // === 12. 通知 ===
    this.drawNotifications();

    // === 13. 浮动文字 ===
    this.drawFloatingTexts(cam);
  }

  // 添加通知
  addNotification(text, type) {
    this.notifications.push({
      text,
      type: type || 'info', // info, success, warning, danger
      ts: Date.now(),
    });
    if (this.notifications.length > this.maxNotifications) {
      this.notifications.shift();
    }
  }

  drawNotifications() {
    const ctx = this.ctx;
    const now = Date.now();
    const baseY = this.safeTop + HUD.RESOURCE_BAR_H + HUD.WEATHER_BAR_H + 4;
    const notifH = 22;
    const gap = 4;

    // 清除过期通知
    this.notifications = this.notifications.filter(n => now - n.ts < this.notifDuration);

    for (let i = 0; i < this.notifications.length; i++) {
      const n = this.notifications[i];
      const age = now - n.ts;
      const fadeOut = age > this.notifDuration - 500 ? (this.notifDuration - age) / 500 : 1;
      const y = baseY + i * (notifH + gap);

      ctx.globalAlpha = fadeOut * 0.9;

      const colors = {
        info: 'rgba(50,100,150,0.85)',
        success: 'rgba(40,120,80,0.85)',
        warning: 'rgba(150,100,30,0.85)',
        danger: 'rgba(150,40,40,0.85)',
      };
      ctx.fillStyle = colors[n.type] || colors.info;
      roundRect(ctx, 8, y, this.w - 16, notifH, 4);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(n.text, this.w / 2, y + 15);
      ctx.textAlign = 'left';

      ctx.globalAlpha = 1;
    }
  }

  // 添加浮动文字（世界坐标）
  addFloatingText(worldX, worldY, text, color) {
    this.floatingTexts.push({
      x: worldX, y: worldY, text,
      color: color || '#4ecdc4',
      ts: Date.now(),
    });
  }

  drawFloatingTexts(cam) {
    const ctx = this.ctx;
    const now = Date.now();

    this.floatingTexts = this.floatingTexts.filter(ft => now - ft.ts < this.floatingDuration);

    for (const ft of this.floatingTexts) {
      const age = now - ft.ts;
      const progress = age / this.floatingDuration;
      const fadeOut = progress > 0.7 ? (1 - progress) / 0.3 : 1;
      const rise = progress * 30; // 向上漂浮 30px

      const sp = cam.worldToScreen(ft.x, ft.y - rise);
      if (sp.x < -50 || sp.x > this.w + 50 || sp.y < -20 || sp.y > this.h + 20) continue;

      ctx.globalAlpha = fadeOut * 0.9;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, sp.x, sp.y);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }
  }

  // ---- 世界环境效果 ----
  drawWorldAmbientEffects(gameLoop, cam) {
    const ctx = this.ctx;

    // 火炉温暖光芒（扩散到地面）
    const furnace = gameLoop.buildings.get(BuildingType.FURNACE);
    if (furnace.isUnlocked() && furnace.state !== BuildingState.FROZEN) {
      const pos = BUILDING_WORLD_POSITIONS[BuildingType.FURNACE];
      const sp = cam.worldToScreen(pos.x + pos.w / 2, pos.y + pos.h);
      if (sp.x > -100 && sp.x < this.w + 100 && sp.y > -100 && sp.y < this.h + 100) {
        const t = this.animTime;
        const glowR = 60 + Math.sin(t * 2) * 10 + furnace.level * 8;
        const grad = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, glowR);
        grad.addColorStop(0, `rgba(255,150,50,${0.12 + furnace.level * 0.02})`);
        grad.addColorStop(0.5, 'rgba(255,100,30,0.05)');
        grad.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(sp.x - glowR, sp.y - glowR, glowR * 2, glowR * 2);
      }
    }

    // 烟囱烟雾粒子（火炉和厨房）
    const smokeBuildings = [
      { type: BuildingType.FURNACE, offsetX: 0, offsetY: -10 },
      { type: BuildingType.COOKHOUSE, offsetX: 10, offsetY: -5 },
    ];
    for (const sb of smokeBuildings) {
      const b = gameLoop.buildings.get(sb.type);
      if (!b.isUnlocked() || b.state === BuildingState.FROZEN) continue;
      if (b.state !== BuildingState.PRODUCING && b.state !== BuildingState.NORMAL) continue;

      const pos = BUILDING_WORLD_POSITIONS[sb.type];
      const sp = cam.worldToScreen(pos.x + pos.w / 2 + sb.offsetX, pos.y + sb.offsetY);
      if (sp.x < -20 || sp.x > this.w + 20 || sp.y < -40 || sp.y > this.h + 20) continue;

      const t = this.animTime;
      ctx.fillStyle = 'rgba(180,180,190,0.25)';
      for (let i = 0; i < 4; i++) {
        const ox = Math.sin(t * 1.5 + i * 1.8) * (4 + i * 2);
        const oy = -i * 8 - Math.abs(Math.sin(t + i)) * 3;
        const r = 3 + i * 1.5;
        ctx.beginPath();
        ctx.arc(sp.x + ox, sp.y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 猎人小屋附近的兔子（生产时）
    const hunter = gameLoop.buildings.get(BuildingType.HUNTER_HUT);
    if (hunter.isUnlocked() && hunter.state === BuildingState.PRODUCING) {
      const pos = BUILDING_WORLD_POSITIONS[BuildingType.HUNTER_HUT];
      const sp = cam.worldToScreen(pos.x + pos.w + 15, pos.y + pos.h - 5);
      if (sp.x > -20 && sp.x < this.w + 20) {
        const t = this.animTime;
        const hop = Math.abs(Math.sin(t * 3)) * 4;
        ctx.fillStyle = '#bbb';
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y - hop, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ddd';
        ctx.beginPath();
        ctx.ellipse(sp.x + 3, sp.y - hop - 3, 2, 4, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---- 工人世界渲染 ----
  drawWorldWorkers(gameLoop, cam) {
    const ctx = this.ctx;
    const workers = gameLoop.workers.workers.filter(w => w.state !== WorkerState.DEAD);

    for (const w of workers) {
      // 确定目标位置
      let targetX, targetY;
      if (w.state === WorkerState.EXPLORING) {
        // 探索中的工人在地图边缘走动
        const t = this.animTime;
        targetX = 200 + Math.sin(t * 0.3 + w.workerId.charCodeAt(3)) * 100;
        targetY = 500 + Math.cos(t * 0.2 + w.workerId.charCodeAt(3)) * 50;
      } else if (w.assignedBuilding) {
        const anchor = getBuildingAnchor(w.assignedBuilding);
        // 多个工人在同一建筑时分散站位
        const b = gameLoop.buildings.get(w.assignedBuilding);
        const idx = b ? b.assignedWorkers.indexOf(w.workerId) : 0;
        targetX = anchor.x + (idx - 1) * 20;
        targetY = anchor.y;
      } else {
        // 空闲工人在火炉附近闲逛
        const furnaceAnchor = getBuildingAnchor(BuildingType.FURNACE);
        const idleOffset = parseInt(w.workerId.replace('wk_', '')) || 0;
        targetX = furnaceAnchor.x + 40 + (idleOffset % 5) * 25;
        targetY = furnaceAnchor.y + 10 + Math.floor(idleOffset / 5) * 15;
      }

      // 获取或初始化视觉位置
      let vpos = this.workerVisualPos.get(w.workerId);
      if (!vpos) {
        vpos = { x: targetX, y: targetY };
        this.workerVisualPos.set(w.workerId, vpos);
      }

      // 平滑移动到目标
      const dx = targetX - vpos.x;
      const dy = targetY - vpos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        const speed = Math.min(WORKER_WALK_SPEED, dist);
        vpos.x += (dx / dist) * speed;
        vpos.y += (dy / dist) * speed;
      }

      // 转换到屏幕坐标
      const screenPos = cam.worldToScreen(vpos.x, vpos.y);
      // 视锥剔除
      if (screenPos.x < -30 || screenPos.x > this.w + 30) continue;
      if (screenPos.y < -30 || screenPos.y > this.h + 30) continue;

      drawWorldWorker(ctx, w, screenPos.x, screenPos.y, targetX, targetY);
    }
  }

  // ---- HUD: 资源栏 ----
  drawResourceBar(gameLoop) {
    const ctx = this.ctx;
    const y = this.safeTop + 4;
    const H = HUD.RESOURCE_BAR_H;
    const resources = [
      { type: ResourceType.WOOD, label: '木' },
      { type: ResourceType.COAL, label: '煤' },
      { type: ResourceType.MEAT, label: '肉' },
      { type: ResourceType.RATION, label: '食' },
      { type: ResourceType.IRON, label: '铁' },
      { type: ResourceType.GEM, label: '钻' },
    ];

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, 4, y, this.w - 8, H - 4, 6);
    ctx.fill();

    ctx.font = '11px monospace';
    const colW = (this.w - 16) / 3;

    for (let i = 0; i < resources.length; i++) {
      const r = resources[i];
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 8 + col * colW;
      const ry = y + 14 + row * 20;
      const val = Math.floor(gameLoop.wallet.get(r.type));
      const cap = gameLoop.wallet.getStorageCap(r.type);
      const pct = Math.min(100, Math.floor(val / cap * 100));

      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, ry + 3, colW - 8, 7);
      ctx.fillStyle = pct >= 90 ? 'rgba(255,100,100,0.4)' : 'rgba(100,200,180,0.3)';
      ctx.fillRect(x, ry + 3, (colW - 8) * pct / 100, 7);

      ctx.fillStyle = pct >= 90 ? '#ff6b6b' : '#e0e0e0';
      ctx.fillText(`${RES_EMOJI[r.type]}${r.label}:${val}/${cap}`, x, ry);
    }
  }

  // ---- HUD: 天气信息 ----
  drawWeatherInfo(gameLoop, effectiveTemp, warmth) {
    const ctx = this.ctx;
    const y = this.safeTop + HUD.RESOURCE_BAR_H;
    const w = gameLoop.weather;
    const emoji = WEATHER_EMOJI[w.currentWeather] || '☀️';

    const tod = gameLoop.getTimeOfDay();
    const hour = Math.floor(tod * 24);
    const timeStr = `${String(hour).padStart(2, '0')}:00`;
    const timeEmoji = (tod < 0.2 || tod > 0.85) ? '🌙' : (tod < 0.3 || tod > 0.7) ? '🌅' : '☀️';
    const eff = gameLoop.getWorkerEfficiency();
    const effStr = eff < 1 ? ` 效率${Math.floor(eff * 100)}%` : '';

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, 4, y, this.w - 8, HUD.WEATHER_BAR_H, 4);
    ctx.fill();

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = effectiveTemp < -30 ? '#ff4444' : effectiveTemp < -10 ? '#ffaa00' : '#44ff44';
    const blizName = BLIZZARD_NAMES[w.blizzardState] || w.blizzardState;
    const warmthStr = warmth > 0 ? ` (+${warmth}🔥)` : '';
    ctx.fillText(`${emoji}${effectiveTemp.toFixed(1)}°C${warmthStr} ${timeEmoji}${timeStr}${effStr} 暴风雪:${blizName}`, 10, y + 18);
  }

  // ---- HUD: 底部操作栏 ----
  drawBottomBar(gameLoop) {
    const ctx = this.ctx;
    const H = HUD.BOTTOM_BAR_H;
    const y = this.h - H;
    const BLP = HUD.BTN_LEFT_PAD, BRP = HUD.BTN_RIGHT_PAD;
    const BG = HUD.BTN_GAP, BC = HUD.BTN_COUNT;
    const BTP = HUD.BTN_TOP_PAD, BH = HUD.BTN_H;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, y, this.w, H);

    const furnace = gameLoop.buildings.get(BuildingType.FURNACE);
    const btn3Label = furnace && furnace.state === BuildingState.FROZEN
      ? '🔥 重启火炉'
      : (gameLoop.paused ? '▶️ 继续' : '⏸️ 暂停');

    let btn2Label = '🧭 探索';
    if (this.selectedBuilding) {
      const sel = gameLoop.buildings.get(this.selectedBuilding);
      if (sel && !sel.isUnlocked()) btn2Label = '🏗️ 建造';
      else if (sel && sel.isUnlocked()) btn2Label = '👷 分配';
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

  // ---- 小地图 ----
  drawMinimap(gameLoop, cam) {
    const ctx = this.ctx;
    const mmW = 80, mmH = 40;
    const mmX = this.w - mmW - 8;
    const mmY = this.safeTop + HUD.RESOURCE_BAR_H + HUD.WEATHER_BAR_H + 4;

    // 小地图背景
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mmX, mmY, mmW, mmH);

    // 建筑点
    const buildings = gameLoop.buildings.getAll();
    for (const b of buildings) {
      if (!b.isUnlocked()) continue;
      const pos = BUILDING_WORLD_POSITIONS[b.type];
      if (!pos) continue;
      const dotX = mmX + (pos.x / WORLD_W) * mmW;
      const dotY = mmY + (pos.y / WORLD_H) * mmH;
      ctx.fillStyle = b.type === BuildingType.FURNACE ? '#ff6644' : '#4ecdc4';
      ctx.fillRect(dotX - 1, dotY - 1, 3, 3);
    }

    // 相机视野框
    const vpX = mmX + (cam.x / WORLD_W) * mmW;
    const vpY = mmY + (cam.y / WORLD_H) * mmH;
    const vpW = (cam.screenW / WORLD_W) * mmW;
    const vpH = (cam.screenH / WORLD_H) * mmH;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(vpX, vpY, vpW, vpH);
  }

  // ---- 日夜遮罩 ----
  drawDayNightOverlay(ctx, timeOfDay, gameLoop) {
    // 计算夜晚强度（0=白天，1=深夜）
    let nightAlpha = 0;
    if (timeOfDay < 0.2 || timeOfDay > 0.85) {
      nightAlpha = 0.35; // 深夜
    } else if (timeOfDay < 0.3) {
      nightAlpha = 0.35 * (1 - (timeOfDay - 0.2) / 0.1); // 黎明过渡
    } else if (timeOfDay > 0.7) {
      nightAlpha = 0.35 * ((timeOfDay - 0.7) / 0.15); // 黄昏过渡
    }

    if (nightAlpha <= 0) return;

    // 夜晚遮罩
    ctx.fillStyle = `rgba(10,15,30,${nightAlpha})`;
    ctx.fillRect(0, 0, this.w, this.h);

    // 建筑窗户灯光（在夜晚时发光）
    const cam = this.camera;
    const buildings = gameLoop.buildings.getAll();
    for (const b of buildings) {
      if (!b.isUnlocked()) continue;
      if (b.state === BuildingState.FROZEN || b.state === BuildingState.LOCKED) continue;

      const pos = BUILDING_WORLD_POSITIONS[b.type];
      if (!pos) continue;
      const sp = cam.worldToScreen(pos.x, pos.y);
      if (sp.x + pos.w < 0 || sp.x > this.w) continue;

      // 窗户光芒
      const glowAlpha = nightAlpha * 0.6 * (0.8 + Math.sin(this.animTime * 1.5) * 0.2);
      const windowColor = b.type === BuildingType.FURNACE
        ? `rgba(255,150,50,${glowAlpha})`
        : `rgba(255,220,120,${glowAlpha * 0.7})`;

      // 画两个小窗户
      const wy = sp.y + pos.h * 0.3;
      ctx.fillStyle = windowColor;
      ctx.fillRect(sp.x + pos.w * 0.2, wy, 8, 6);
      ctx.fillRect(sp.x + pos.w * 0.6, wy, 8, 6);

      // 灯光扩散光晕
      const grad = ctx.createRadialGradient(
        sp.x + pos.w / 2, sp.y + pos.h / 2, 0,
        sp.x + pos.w / 2, sp.y + pos.h / 2, pos.w * 0.8,
      );
      grad.addColorStop(0, `rgba(255,200,100,${glowAlpha * 0.15})`);
      grad.addColorStop(1, 'rgba(255,200,100,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(sp.x - pos.w * 0.3, sp.y - pos.h * 0.3, pos.w * 1.6, pos.h * 1.6);
    }
  }

  // ---- 升级动画效果 ----
  drawUpgradeEffect(ctx, x, y, w, h, building) {
    const t = this.animTime;
    const elapsed = Date.now() - building.upgradeStartTimeMs;
    const pct = Math.min(1, elapsed / building.upgradeDurationMs);

    // 脚手架（竖条）
    ctx.strokeStyle = 'rgba(139,119,101,0.6)';
    ctx.lineWidth = 2;
    // 左侧脚手架
    ctx.beginPath();
    ctx.moveTo(x + 4, y);
    ctx.lineTo(x + 4, y + h);
    ctx.moveTo(x + 12, y);
    ctx.lineTo(x + 12, y + h);
    ctx.moveTo(x + 4, y + h * 0.3);
    ctx.lineTo(x + 12, y + h * 0.3);
    ctx.moveTo(x + 4, y + h * 0.7);
    ctx.lineTo(x + 12, y + h * 0.7);
    ctx.stroke();
    // 右侧脚手架
    ctx.beginPath();
    ctx.moveTo(x + w - 4, y);
    ctx.lineTo(x + w - 4, y + h);
    ctx.moveTo(x + w - 12, y);
    ctx.lineTo(x + w - 12, y + h);
    ctx.moveTo(x + w - 12, y + h * 0.3);
    ctx.lineTo(x + w - 4, y + h * 0.3);
    ctx.moveTo(x + w - 12, y + h * 0.7);
    ctx.lineTo(x + w - 4, y + h * 0.7);
    ctx.stroke();

    // 锤子敲击动画
    const hammerPhase = (t * 4) % 1;
    if (hammerPhase < 0.3) {
      const hx = x + w / 2 + Math.sin(t * 8) * 10;
      const hy = y + 10;
      ctx.fillStyle = '#888';
      ctx.fillRect(hx - 3, hy - 8, 6, 8);
      ctx.fillStyle = '#6b4226';
      ctx.fillRect(hx - 1, hy, 2, 10);
    }

    // 建筑粉尘粒子
    ctx.fillStyle = 'rgba(200,190,170,0.4)';
    for (let i = 0; i < 6; i++) {
      const px = x + 10 + Math.sin(t * 2 + i * 1.2) * (w / 2 - 10);
      const py = y + h * 0.5 + Math.cos(t * 3 + i * 0.8) * (h * 0.3);
      const size = 1.5 + Math.sin(t * 4 + i) * 0.5;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 进度条
    const barW = w - 16;
    const barY = y + h + 4;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x + 8, barY, barW, 8);
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(x + 8, barY, barW * pct, 8);
    ctx.fillStyle = '#fff';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.floor(pct * 100)}%`, x + w / 2, barY + 7);
    ctx.textAlign = 'left';
  }

  // ---- 建筑信息面板（选中时显示） ----
  drawBuildingInfoPanel(gameLoop) {
    const ctx = this.ctx;
    const b = gameLoop.buildings.get(this.selectedBuilding);
    if (!b) return;

    const panelW = 200;
    const panelH = 160;
    const px = this.w - panelW - 8;
    const py = this.safeTop + HUD.RESOURCE_BAR_H + HUD.WEATHER_BAR_H + 40;

    // 面板背景
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    roundRect(ctx, px, py, panelW, panelH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(100,149,237,0.5)';
    ctx.lineWidth = 1;
    roundRect(ctx, px, py, panelW, panelH, 8);
    ctx.stroke();

    let ty = py + 16;

    // 建筑名称 + emoji
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${b.emoji} ${b.name}`, px + 10, ty);
    ty += 18;

    // 等级
    ctx.fillStyle = '#ffd700';
    ctx.font = '11px monospace';
    ctx.fillText(`等级: ${b.level > 0 ? 'Lv.' + b.level : '未建造'}`, px + 10, ty);
    ty += 16;

    // 状态
    const STATE_LABELS = {
      0: '🔒 未解锁', 1: '✅ 空闲', 2: '🔨 升级中',
      3: '⚙️ 生产中', 4: '❌ 缺人', 5: '❌ 缺料', 6: '🧊 冻结',
    };
    ctx.fillStyle = b.state === 6 ? '#66ccff' : b.state >= 4 ? '#ff6b6b' : '#aaa';
    ctx.fillText(`状态: ${STATE_LABELS[b.state] || '未知'}`, px + 10, ty);
    ty += 16;

    // 工人槽位
    if (b.maxSlots > 0) {
      ctx.fillStyle = '#aaa';
      ctx.fillText(`工人: ${b.assignedWorkers.length}/${b.maxSlots}`, px + 10, ty);
      ty += 16;
    }

    // 升级进度
    if (b.state === BuildingState.UPGRADING) {
      const elapsed = Date.now() - b.upgradeStartTimeMs;
      const pct = Math.min(1, elapsed / b.upgradeDurationMs);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(px + 10, ty, panelW - 20, 10);
      ctx.fillStyle = '#4ecdc4';
      ctx.fillRect(px + 10, ty, (panelW - 20) * pct, 10);
      ctx.fillStyle = '#fff';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`升级中 ${Math.floor(pct * 100)}%`, px + panelW / 2, ty + 9);
      ctx.textAlign = 'left';
      ty += 16;
    }

    // 升级费用
    if (b.isUnlocked() && b.state !== BuildingState.UPGRADING) {
      const cost = b.getUpgradeCost();
      const costType = Object.keys(cost)[0];
      const costVal = cost[costType];
      const canAfford = gameLoop.wallet.canAfford(cost);
      ctx.fillStyle = canAfford ? '#4ecdc4' : '#ff6b6b';
      ctx.fillText(`升级费用: ${costVal} ${costType.replace('RES_', '')}`, px + 10, ty);
      ty += 14;
      const timeSec = Math.floor(b.getUpgradeTimeMs() / 1000);
      ctx.fillStyle = '#888';
      ctx.fillText(`升级时间: ${timeSec}秒`, px + 10, ty);
    }

    // 建造费用
    if (!b.isUnlocked()) {
      const cost = b.getUpgradeCost();
      const costType = Object.keys(cost)[0];
      const costVal = cost[costType];
      const canAfford = gameLoop.wallet.canAfford(cost);
      ctx.fillStyle = canAfford ? '#4ecdc4' : '#ff6b6b';
      ctx.fillText(`建造费用: ${costVal} ${costType.replace('RES_', '')}`, px + 10, ty);
    }
  }

  // ---- 工人信息面板 ----
  drawWorkerInfoPanel(gameLoop) {
    const ctx = this.ctx;
    const w = gameLoop.workers.workers.find(w => w.workerId === this.selectedWorker);
    if (!w) { this.selectedWorker = null; return; }

    const panelW = 180;
    const panelH = 130;
    const px = 8;
    const py = this.safeTop + HUD.RESOURCE_BAR_H + HUD.WEATHER_BAR_H + 40;

    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    roundRect(ctx, px, py, panelW, panelH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(100,200,150,0.5)';
    ctx.lineWidth = 1;
    roundRect(ctx, px, py, panelW, panelH, 8);
    ctx.stroke();

    let ty = py + 16;

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`👷 ${w.name}`, px + 10, ty);
    ty += 18;

    const STATE_LABELS = {
      'WK_IDLE': '空闲', 'WK_WORKING': '工作中', 'WK_EATING': '进食中',
      'WK_SICK': '生病', 'WK_HEALING': '治疗中', 'WK_EXPLORING': '探索中', 'WK_DEAD': '死亡',
    };
    ctx.fillStyle = w.state === 'WK_SICK' ? '#ff6b6b' : w.state === 'WK_WORKING' ? '#4ecdc4' : '#aaa';
    ctx.font = '11px monospace';
    ctx.fillText(`状态: ${STATE_LABELS[w.state] || w.state}`, px + 10, ty);
    ty += 15;

    // 健康条
    ctx.fillStyle = '#aaa';
    ctx.fillText('健康:', px + 10, ty);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(px + 50, ty - 8, 110, 10);
    ctx.fillStyle = w.health > 50 ? '#4ecdc4' : w.health > 25 ? '#ffaa00' : '#ff4444';
    ctx.fillRect(px + 50, ty - 8, 110 * (w.health / 100), 10);
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.fillText(`${Math.floor(w.health)}%`, px + 105, ty);
    ty += 14;

    // 饱食条
    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';
    ctx.fillText('饱食:', px + 10, ty);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(px + 50, ty - 8, 110, 10);
    ctx.fillStyle = w.hunger > 50 ? '#4ecdc4' : w.hunger > 25 ? '#ffaa00' : '#ff4444';
    ctx.fillRect(px + 50, ty - 8, 110 * (w.hunger / 100), 10);
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.fillText(`${Math.floor(w.hunger)}%`, px + 105, ty);
    ty += 14;

    // 心情
    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';
    ctx.fillText(`心情: ${Math.floor(w.mood)}`, px + 10, ty);
    ty += 14;

    // 所属建筑
    if (w.assignedBuilding) {
      const b = gameLoop.buildings.get(w.assignedBuilding);
      ctx.fillStyle = '#888';
      ctx.fillText(`分配至: ${b ? b.name : w.assignedBuilding}`, px + 10, ty);
    }
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
