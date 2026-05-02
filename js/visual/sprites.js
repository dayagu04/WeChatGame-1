// ==========================================
// sprites.js - 建筑与工人精灵渲染
// 使用 Canvas 形状图元绘制，无需外部图片
// ==========================================

import { BuildingType, BuildingState, WorkerState } from '../game-constants';

// ---- 建筑精灵绘制 ----

export function drawBuildingSprite(ctx, type, x, y, w, h, state, level) {
  switch (type) {
    case BuildingType.FURNACE: return drawFurnace(ctx, x, y, w, h, state, level);
    case BuildingType.LUMBER_CAMP: return drawLumberCamp(ctx, x, y, w, h, state, level);
    case BuildingType.COAL_MINE: return drawCoalMine(ctx, x, y, w, h, state, level);
    case BuildingType.HUNTER_HUT: return drawHunterHut(ctx, x, y, w, h, state, level);
    case BuildingType.COOKHOUSE: return drawCookhouse(ctx, x, y, w, h, state, level);
    case BuildingType.CLINIC: return drawClinic(ctx, x, y, w, h, state, level);
    case BuildingType.SHELTER: return drawShelter(ctx, x, y, w, h, state, level);
  }
}

function drawFurnace(ctx, x, y, w, h, state, level) {
  const cx = x + w / 2;
  const baseY = y + h - 8;

  // 烟囱
  ctx.fillStyle = '#555';
  ctx.fillRect(cx - 4, y + 6, 8, 18);

  // 烟雾（运行中时动态）
  if (state === BuildingState.PRODUCING || state === BuildingState.NORMAL) {
    ctx.fillStyle = 'rgba(180,180,180,0.4)';
    const t = Date.now() / 1000;
    for (let i = 0; i < 3; i++) {
      const ox = Math.sin(t * 2 + i) * 4;
      const oy = -i * 6;
      ctx.beginPath();
      ctx.arc(cx + ox, y + 4 + oy, 3 + i, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 主体（砖红色方块）
  ctx.fillStyle = state === BuildingState.FROZEN ? '#4a6a8a' : '#8b4513';
  ctx.fillRect(cx - 18, y + 24, 36, h - 32);

  // 砖纹
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 0.5;
  for (let r = 0; r < 3; r++) {
    const ry = y + 28 + r * 10;
    ctx.beginPath();
    ctx.moveTo(cx - 16, ry);
    ctx.lineTo(cx + 16, ry);
    ctx.stroke();
    const off = r % 2 === 0 ? 0 : 8;
    for (let c = 0; c < 3; c++) {
      const rx = cx - 12 + off + c * 12;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx, ry + 10);
      ctx.stroke();
    }
  }

  // 炉口
  ctx.fillStyle = '#222';
  ctx.fillRect(cx - 8, baseY - 14, 16, 12);

  // 火焰（动态）
  if (state !== BuildingState.FROZEN && state !== BuildingState.LOCKED) {
    drawFire(ctx, cx, baseY - 14, 8 + level, Date.now());
  }

  // 冰冻效果
  if (state === BuildingState.FROZEN) {
    ctx.fillStyle = 'rgba(100,180,255,0.3)';
    ctx.fillRect(cx - 20, y + 22, 40, h - 28);
    drawIceCrystals(ctx, cx, y + h / 2, 16);
  }

  // 等级标记
  drawLevelBadge(ctx, x + 2, y + 2, level);
}

function drawLumberCamp(ctx, x, y, w, h, state, level) {
  const cx = x + w / 2;
  const baseY = y + h - 8;

  // 木屋主体
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(cx - 20, y + 20, 40, h - 28);

  // 屋顶（三角形）
  ctx.fillStyle = '#4a2c0a';
  ctx.beginPath();
  ctx.moveTo(cx - 24, y + 22);
  ctx.lineTo(cx, y + 4);
  ctx.lineTo(cx + 24, y + 22);
  ctx.closePath();
  ctx.fill();

  // 木头纹理横线
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 4; i++) {
    const ly = y + 28 + i * 8;
    ctx.beginPath();
    ctx.moveTo(cx - 18, ly);
    ctx.lineTo(cx + 18, ly);
    ctx.stroke();
  }

  // 门前堆放的原木
  ctx.fillStyle = '#8b6914';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(cx - 10 + i * 10, baseY - 2, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 斧头
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + 14, y + 10);
  ctx.lineTo(cx + 22, y + 28);
  ctx.stroke();
  ctx.fillStyle = '#aaa';
  ctx.fillRect(cx + 18, y + 8, 8, 5);

  // 生产动画：木屑飞溅
  if (state === BuildingState.PRODUCING) {
    const t = Date.now() / 500;
    ctx.fillStyle = '#c4a265';
    for (let i = 0; i < 4; i++) {
      const angle = t + i * 1.5;
      const ox = Math.cos(angle) * 12;
      const oy = Math.sin(angle) * 8 - 10;
      ctx.fillRect(cx + ox, y + 30 + oy, 2, 2);
    }
  }

  drawLevelBadge(ctx, x + 2, y + 2, level);
}

function drawCoalMine(ctx, x, y, w, h, state, level) {
  const cx = x + w / 2;
  const baseY = y + h - 8;

  // 矿山（梯形）
  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath();
  ctx.moveTo(cx - 24, baseY);
  ctx.lineTo(cx - 16, y + 10);
  ctx.lineTo(cx + 16, y + 10);
  ctx.lineTo(cx + 24, baseY);
  ctx.closePath();
  ctx.fill();

  // 矿道入口
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(cx, baseY - 10, 10, Math.PI, 0);
  ctx.lineTo(cx + 10, baseY);
  ctx.lineTo(cx - 10, baseY);
  ctx.closePath();
  ctx.fill();

  // 支撑木架
  ctx.strokeStyle = '#6b4226';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 8, baseY);
  ctx.lineTo(cx - 8, baseY - 16);
  ctx.moveTo(cx + 8, baseY);
  ctx.lineTo(cx + 8, baseY - 16);
  ctx.moveTo(cx - 10, baseY - 14);
  ctx.lineTo(cx + 10, baseY - 14);
  ctx.stroke();

  // 煤矿石点缀
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(cx - 6, y + 16, 2, 0, Math.PI * 2);
  ctx.arc(cx + 4, y + 14, 2.5, 0, Math.PI * 2);
  ctx.arc(cx + 8, y + 18, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // 矿灯闪烁
  if (state === BuildingState.PRODUCING) {
    const blink = Math.sin(Date.now() / 300) > 0;
    if (blink) {
      ctx.fillStyle = '#ffdd44';
      ctx.beginPath();
      ctx.arc(cx, baseY - 16, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawLevelBadge(ctx, x + 2, y + 2, level);
}

function drawHunterHut(ctx, x, y, w, h, state, level) {
  const cx = x + w / 2;
  const baseY = y + h - 8;

  // 小木屋
  ctx.fillStyle = '#7a5c3a';
  ctx.fillRect(cx - 16, y + 18, 32, h - 26);

  // 尖顶
  ctx.fillStyle = '#5a3c1a';
  ctx.beginPath();
  ctx.moveTo(cx - 20, y + 20);
  ctx.lineTo(cx, y + 2);
  ctx.lineTo(cx + 20, y + 20);
  ctx.closePath();
  ctx.fill();

  // 门
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(cx - 5, baseY - 14, 10, 14);

  // 窗户
  ctx.fillStyle = '#ffd700';
  ctx.globalAlpha = 0.6;
  ctx.fillRect(cx - 14, y + 24, 7, 7);
  ctx.fillRect(cx + 7, y + 24, 7, 7);
  ctx.globalAlpha = 1;

  // 弓挂在墙上
  ctx.strokeStyle = '#6b4226';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx + 18, y + 30, 8, -0.8, 0.8);
  ctx.stroke();

  // 兔子皮晾晒
  if (state === BuildingState.PRODUCING) {
    ctx.fillStyle = '#bbb';
    ctx.fillRect(cx - 22, y + 14, 4, 8);
    ctx.fillStyle = '#999';
    ctx.fillRect(cx - 22, y + 22, 4, 3);
  }

  drawLevelBadge(ctx, x + 2, y + 2, level);
}

function drawCookhouse(ctx, x, y, w, h, state, level) {
  const cx = x + w / 2;
  const baseY = y + h - 8;

  // 建筑主体
  ctx.fillStyle = '#5a4a3a';
  ctx.fillRect(cx - 18, y + 16, 36, h - 24);

  // 平顶
  ctx.fillStyle = '#4a3a2a';
  ctx.fillRect(cx - 22, y + 12, 44, 6);

  // 烟囱 + 蒸汽
  ctx.fillStyle = '#666';
  ctx.fillRect(cx + 10, y + 2, 6, 12);
  if (state === BuildingState.PRODUCING) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    const t = Date.now() / 800;
    for (let i = 0; i < 3; i++) {
      const ox = Math.sin(t + i) * 3;
      ctx.beginPath();
      ctx.arc(cx + 13 + ox, y - 2 - i * 5, 3 + i, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 大锅
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(cx, baseY - 6, 10, Math.PI, 0);
  ctx.lineTo(cx + 10, baseY);
  ctx.lineTo(cx - 10, baseY);
  ctx.closePath();
  ctx.fill();

  // 锅内食物
  if (state === BuildingState.PRODUCING) {
    ctx.fillStyle = '#c44';
    ctx.beginPath();
    ctx.arc(cx, baseY - 8, 7, Math.PI, 0);
    ctx.fill();
    // 气泡
    const t = Date.now() / 400;
    ctx.fillStyle = 'rgba(255,200,150,0.5)';
    for (let i = 0; i < 2; i++) {
      const bx = cx - 3 + Math.sin(t + i * 2) * 4;
      const by = baseY - 10 - Math.abs(Math.sin(t + i)) * 4;
      ctx.beginPath();
      ctx.arc(bx, by, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawLevelBadge(ctx, x + 2, y + 2, level);
}

function drawClinic(ctx, x, y, w, h, state, level) {
  const cx = x + w / 2;
  const baseY = y + h - 8;

  // 白色建筑
  ctx.fillStyle = '#ddd';
  ctx.fillRect(cx - 18, y + 14, 36, h - 22);
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 18, y + 14, 36, h - 22);

  // 红十字
  ctx.fillStyle = '#e44';
  ctx.fillRect(cx - 3, y + 18, 6, 14);
  ctx.fillRect(cx - 7, y + 22, 14, 6);

  // 门
  ctx.fillStyle = '#888';
  ctx.fillRect(cx - 5, baseY - 12, 10, 12);

  // 窗户
  ctx.fillStyle = '#aee';
  ctx.fillRect(cx - 16, y + 20, 6, 6);
  ctx.fillRect(cx + 10, y + 20, 6, 6);

  // 治愈光环
  if (state === BuildingState.PRODUCING) {
    const t = Date.now() / 600;
    ctx.strokeStyle = 'rgba(100,255,100,0.3)';
    ctx.lineWidth = 2;
    const r = 14 + Math.sin(t) * 3;
    ctx.beginPath();
    ctx.arc(cx, y + h / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawLevelBadge(ctx, x + 2, y + 2, level);
}

function drawShelter(ctx, x, y, w, h, state, level) {
  const cx = x + w / 2;
  const baseY = y + h - 8;

  // 帐篷形状
  ctx.fillStyle = '#6a7a5a';
  ctx.beginPath();
  ctx.moveTo(cx - 22, baseY);
  ctx.lineTo(cx, y + 4);
  ctx.lineTo(cx + 22, baseY);
  ctx.closePath();
  ctx.fill();

  // 帐篷纹理
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx, y + 4);
  ctx.lineTo(cx, baseY);
  ctx.stroke();

  // 入口
  ctx.fillStyle = '#3a4a2a';
  ctx.beginPath();
  ctx.moveTo(cx - 6, baseY);
  ctx.lineTo(cx, baseY - 12);
  ctx.lineTo(cx + 6, baseY);
  ctx.closePath();
  ctx.fill();

  // 温暖光芒
  ctx.fillStyle = 'rgba(255,200,100,0.15)';
  ctx.beginPath();
  ctx.arc(cx, baseY - 6, 12, 0, Math.PI * 2);
  ctx.fill();

  drawLevelBadge(ctx, x + 2, y + 2, level);
}

// ---- 通用装饰 ----

function drawFire(ctx, cx, baseY, size, time) {
  const t = time / 200;
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const flicker = Math.sin(t + i * 1.3) * 2;
    const fh = size * (0.5 + 0.5 * Math.sin(t * 1.5 + i));
    const hue = 30 + i * 8 + Math.sin(t + i) * 10;
    ctx.fillStyle = `hsla(${hue}, 100%, ${50 + i * 8}%, ${0.8 - i * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(cx + flicker, baseY - fh / 2, size * 0.4 + i, fh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 内焰高光
  ctx.fillStyle = 'rgba(255,255,200,0.6)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY - size * 0.2, size * 0.15, size * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawIceCrystals(ctx, cx, cy, radius) {
  ctx.strokeStyle = 'rgba(150,220,255,0.6)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const x1 = cx + Math.cos(angle) * radius * 0.3;
    const y1 = cy + Math.sin(angle) * radius * 0.3;
    const x2 = cx + Math.cos(angle) * radius;
    const y2 = cy + Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    // 小分支
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const pa = angle + Math.PI / 3;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + Math.cos(pa) * 4, my + Math.sin(pa) * 4);
    ctx.stroke();
  }
}

function drawLevelBadge(ctx, x, y, level) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x, y, 22, 14);
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`Lv${level}`, x + 11, y + 10);
  ctx.textAlign = 'left';
}

// ---- 工人角色渲染 ----

export function drawWorker(ctx, worker, x, y, scale) {
  const s = scale || 1;
  const t = Date.now() / 1000;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  switch (worker.state) {
    case WorkerState.WORKING:
      drawWorkingWorker(ctx, t);
      break;
    case WorkerState.SICK:
      drawSickWorker(ctx, t);
      break;
    case WorkerState.HEALING:
      drawHealingWorker(ctx, t);
      break;
    case WorkerState.EXPLORING:
      drawExploringWorker(ctx, t);
      break;
    case WorkerState.DEAD:
      drawDeadWorker(ctx);
      break;
    default: // IDLE, EATING
      drawIdleWorker(ctx, t);
  }

  ctx.restore();
}

function drawWorkerBody(ctx, bodyColor, headColor) {
  // 身体
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-4, 0, 8, 10);
  // 头
  ctx.fillStyle = headColor;
  ctx.beginPath();
  ctx.arc(0, -3, 4, 0, Math.PI * 2);
  ctx.fill();
  // 帽子
  ctx.fillStyle = '#555';
  ctx.fillRect(-5, -7, 10, 3);
}

function drawIdleWorker(ctx, t) {
  const breathe = Math.sin(t * 2) * 0.5;
  drawWorkerBody(ctx, '#4a7a9a', '#e8c090');
  // 手臂自然下垂
  ctx.strokeStyle = '#4a7a9a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, 2);
  ctx.lineTo(-6, 8 + breathe);
  ctx.moveTo(4, 2);
  ctx.lineTo(6, 8 + breathe);
  ctx.stroke();
}

function drawWorkingWorker(ctx, t) {
  const swing = Math.sin(t * 6) * 15;
  drawWorkerBody(ctx, '#6a5a3a', '#e8c090');
  // 挥动工具的手臂
  ctx.save();
  ctx.translate(4, 2);
  ctx.rotate((swing * Math.PI) / 180);
  ctx.strokeStyle = '#6a5a3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(6, 10);
  ctx.stroke();
  // 工具
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(6, 10);
  ctx.lineTo(6, 16);
  ctx.stroke();
  ctx.restore();
  // 汗水
  if (Math.sin(t * 3) > 0.5) {
    ctx.fillStyle = 'rgba(100,180,255,0.6)';
    ctx.beginPath();
    ctx.arc(-5, -6, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSickWorker(ctx, t) {
  const sway = Math.sin(t * 1.5) * 2;
  ctx.save();
  ctx.translate(sway, 0);
  drawWorkerBody(ctx, '#6a6a6a', '#c0a080');
  // 弯腰
  ctx.strokeStyle = '#6a6a6a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, 2);
  ctx.lineTo(-8, 6);
  ctx.moveTo(4, 2);
  ctx.lineTo(2, 8);
  ctx.stroke();
  ctx.restore();
  // 病菌符号
  ctx.fillStyle = 'rgba(100,255,100,0.5)';
  const bob = Math.sin(t * 2) * 2;
  ctx.font = '8px monospace';
  ctx.fillText('🦠', -5, -12 + bob);
}

function drawHealingWorker(ctx, t) {
  drawWorkerBody(ctx, '#4a9a6a', '#e8c090');
  // 恢复光环
  ctx.strokeStyle = `rgba(100,255,100,${0.3 + Math.sin(t * 3) * 0.2})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 3, 10 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
  ctx.stroke();
  // 绷带
  ctx.fillStyle = '#fff';
  ctx.fillRect(-2, -5, 4, 2);
}

function drawExploringWorker(ctx, t) {
  const walk = Math.sin(t * 5) * 3;
  drawWorkerBody(ctx, '#5a6a3a', '#e8c090');
  // 走动的腿
  ctx.strokeStyle = '#5a6a3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-2, 10);
  ctx.lineTo(-2 + walk, 16);
  ctx.moveTo(2, 10);
  ctx.lineTo(2 - walk, 16);
  ctx.stroke();
  // 背包
  ctx.fillStyle = '#7a5a2a';
  ctx.fillRect(-7, 0, 3, 7);
  // 指南针闪烁
  ctx.fillStyle = `rgba(255,215,0,${0.5 + Math.sin(t * 4) * 0.3})`;
  ctx.beginPath();
  ctx.arc(7, 1, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawDeadWorker(ctx) {
  ctx.globalAlpha = 0.5;
  drawWorkerBody(ctx, '#555', '#999');
  ctx.globalAlpha = 1;
  // X 眼睛
  ctx.strokeStyle = '#c00';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-3, -4);
  ctx.lineTo(-1, -2);
  ctx.moveTo(-1, -4);
  ctx.lineTo(-3, -2);
  ctx.moveTo(1, -4);
  ctx.lineTo(3, -2);
  ctx.moveTo(3, -4);
  ctx.lineTo(1, -2);
  ctx.stroke();
}

// ---- 地面与背景 ----

// 星星缓存（避免每帧重新随机）
let starCache = null;
function getStars(w, h) {
  if (starCache && starCache.w === w && starCache.h === h) return starCache.stars;
  const stars = [];
  for (let i = 0; i < 60; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h * 0.35,
      size: 0.5 + Math.random() * 1.5,
      twinkleSpeed: 1 + Math.random() * 3,
      phase: Math.random() * Math.PI * 2,
    });
  }
  starCache = { w, h, stars };
  return stars;
}

export function drawSky(ctx, w, h, temperature, timeOfDay) {
  const t = timeOfDay || 0.5; // 0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk
  const cold = Math.min(1, Math.max(0, (-temperature - 10) / 40));

  // 根据时间计算天空颜色
  let skyR, skyG, skyB;
  if (t < 0.2 || t > 0.85) {
    // 夜晚
    skyR = 8 + cold * 5;
    skyG = 10 + cold * 3;
    skyB = 25 - cold * 10;
  } else if (t < 0.3) {
    // 黎明
    const f = (t - 0.2) / 0.1;
    skyR = lerp(8, 60, f) + cold * 5;
    skyG = lerp(10, 40, f) + cold * 3;
    skyB = lerp(25, 80, f) - cold * 10;
  } else if (t < 0.7) {
    // 白天
    const f = t < 0.5 ? (t - 0.3) / 0.2 : (0.7 - t) / 0.2;
    skyR = lerp(60, 30, 1 - f) + cold * 10;
    skyG = lerp(40, 50, f) + cold * 5;
    skyB = lerp(80, 90, f) - cold * 15;
  } else if (t < 0.85) {
    // 黄昏
    const f = (t - 0.7) / 0.15;
    skyR = lerp(50, 8, f) + cold * 5;
    skyG = lerp(30, 10, f) + cold * 3;
    skyB = lerp(60, 25, f) - cold * 10;
  } else {
    skyR = 8 + cold * 5;
    skyG = 10 + cold * 3;
    skyB = 25 - cold * 10;
  }

  const grad = ctx.createLinearGradient(0, 0, 0, h * 0.4);
  grad.addColorStop(0, `rgb(${Math.floor(skyR)},${Math.floor(skyG)},${Math.floor(skyB)})`);
  grad.addColorStop(1, `rgb(${Math.floor(skyR + 15)},${Math.floor(skyG + 15)},${Math.floor(skyB + 20)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h * 0.4);

  // 夜晚星星
  if (t < 0.22 || t > 0.82) {
    const stars = getStars(w, h);
    const now = Date.now() / 1000;
    ctx.fillStyle = '#fff';
    for (const s of stars) {
      const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(now * s.twinkleSpeed + s.phase));
      ctx.globalAlpha = twinkle * 0.8;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 黎明/黄昏暖色光晕
  if ((t > 0.18 && t < 0.32) || (t > 0.68 && t < 0.87)) {
    const horizonY = h * 0.38;
    const glowGrad = ctx.createRadialGradient(w / 2, horizonY, 0, w / 2, horizonY, w * 0.6);
    glowGrad.addColorStop(0, 'rgba(255,120,50,0.15)');
    glowGrad.addColorStop(0.5, 'rgba(255,80,30,0.05)');
    glowGrad.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h * 0.5);
  }
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function drawMountains(ctx, w, groundY) {
  // 远山
  ctx.fillStyle = '#1a2a3a';
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(w * 0.1, groundY - 60);
  ctx.lineTo(w * 0.2, groundY - 30);
  ctx.lineTo(w * 0.35, groundY - 80);
  ctx.lineTo(w * 0.5, groundY - 40);
  ctx.lineTo(w * 0.65, groundY - 70);
  ctx.lineTo(w * 0.8, groundY - 25);
  ctx.lineTo(w * 0.9, groundY - 55);
  ctx.lineTo(w, groundY - 35);
  ctx.lineTo(w, groundY);
  ctx.closePath();
  ctx.fill();

  // 雪顶
  ctx.fillStyle = 'rgba(200,210,220,0.4)';
  ctx.beginPath();
  ctx.moveTo(w * 0.33, groundY - 75);
  ctx.lineTo(w * 0.35, groundY - 80);
  ctx.lineTo(w * 0.37, groundY - 73);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.63, groundY - 65);
  ctx.lineTo(w * 0.65, groundY - 70);
  ctx.lineTo(w * 0.67, groundY - 63);
  ctx.closePath();
  ctx.fill();
}

export function drawGround(ctx, w, h, groundY) {
  // 地面
  const grad = ctx.createLinearGradient(0, groundY, 0, h);
  grad.addColorStop(0, '#e8e8f0');
  grad.addColorStop(0.3, '#d0d0dd');
  grad.addColorStop(1, '#b0b0c0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, groundY, w, h - groundY);

  // 雪地纹理
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  for (let i = 0; i < 12; i++) {
    const sx = (i * 37 + 13) % w;
    const sy = groundY + 5 + (i * 17) % (h - groundY - 20);
    ctx.beginPath();
    ctx.ellipse(sx, sy, 8 + (i % 4) * 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- 探索进度条 ----

export function drawExpeditionBar(ctx, x, y, w, pct, name) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x, y, w, 10);
  ctx.fillStyle = '#4ecdc4';
  ctx.fillRect(x + 1, y + 1, (w - 2) * pct, 8);
  ctx.fillStyle = '#fff';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(name, x + w / 2, y + 8);
  ctx.textAlign = 'left';
}
