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

  // 云朵（白天和黄昏可见）
  if (t > 0.2 && t < 0.88) {
    const cloudAlpha = t < 0.3 ? (t - 0.2) / 0.1 : t > 0.75 ? (0.88 - t) / 0.13 : 1;
    const cloudBright = t > 0.7 ? 0.4 : 0.6; // 黄昏云更暗
    ctx.fillStyle = `rgba(200,210,220,${cloudAlpha * cloudBright * 0.3})`;
    const now = Date.now() / 1000;
    const clouds = [
      { x: 0.1, y: 0.08, w: 80, h: 20 },
      { x: 0.35, y: 0.12, w: 100, h: 25 },
      { x: 0.6, y: 0.06, w: 70, h: 18 },
      { x: 0.8, y: 0.15, w: 90, h: 22 },
    ];
    for (const c of clouds) {
      const drift = (now * 2 + c.x * 100) % (w + 200) - 100;
      const cx = (c.x * w + drift) % (w + 200) - 100;
      ctx.beginPath();
      ctx.ellipse(cx, h * c.y, c.w, c.h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx - c.w * 0.3, h * c.y + 4, c.w * 0.6, c.h * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + c.w * 0.35, h * c.y + 3, c.w * 0.5, c.h * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
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

// ==========================================
// 世界空间渲染（LOL 风格大地图）
// ==========================================

// 世界地面渲染（相机空间）
export function drawWorldGround(ctx, camX, camY, screenW, screenH, worldH, horizonY) {
  // 地面渐变（从地平线向下，带微妙的蓝色调）
  const grad = ctx.createLinearGradient(0, horizonY, 0, screenH);
  grad.addColorStop(0, '#b8bcc5');
  grad.addColorStop(0.1, '#c8ccd5');
  grad.addColorStop(0.3, '#d5d8e0');
  grad.addColorStop(0.6, '#dde0e6');
  grad.addColorStop(1, '#d0d3da');
  ctx.fillStyle = grad;
  ctx.fillRect(0, horizonY, screenW, screenH - horizonY);

  // 地平线雾气
  const fogGrad = ctx.createLinearGradient(0, horizonY, 0, horizonY + 30);
  fogGrad.addColorStop(0, 'rgba(180,190,210,0.4)');
  fogGrad.addColorStop(1, 'rgba(180,190,210,0)');
  ctx.fillStyle = fogGrad;
  ctx.fillRect(0, horizonY, screenW, 30);

  // 雪堆（较大的白色隆起）
  ctx.fillStyle = 'rgba(240,243,248,0.5)';
  const drifts = [
    [200, 580, 40, 6], [500, 620, 50, 8], [800, 590, 35, 5],
    [1100, 640, 45, 7], [1400, 600, 55, 9], [1700, 630, 40, 6],
    [2000, 610, 48, 7], [300, 550, 30, 4], [950, 560, 38, 5],
    [1550, 570, 42, 6], [1850, 600, 35, 5], [2200, 650, 50, 8],
  ];
  for (const [dx, dy, dw, dh] of drifts) {
    const sx = dx - camX;
    const sy = dy - camY;
    if (sx < -60 || sx > screenW + 60 || sy < horizonY - 10 || sy > screenH + 10) continue;
    ctx.beginPath();
    ctx.ellipse(sx, sy, dw, dh, 0, 0, Math.PI * 2);
    ctx.fill();
    // 雪堆高光
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(sx - dw * 0.1, sy - dh * 0.3, dw * 0.7, dh * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(240,243,248,0.5)';
  }

  // 雪地纹理点（散落的雪斑）
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  for (let i = 0; i < 50; i++) {
    const wx = (i * 67 + 23) % 2400;
    const wy = (i * 43 + 17) % (worldH - horizonY) + horizonY;
    const sx = wx - camX;
    const sy = wy - camY;
    if (sx < -20 || sx > screenW + 20 || sy < horizonY || sy > screenH + 20) continue;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 5 + (i % 5) * 2, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 路径（连接建筑的雪地小路，带阴影）
  const paths = [
    [[600, 580], [900, 600]],
    [[900, 600], [1100, 650]],
    [[1200, 560], [1500, 620]],
    [[1500, 620], [1700, 590]],
    [[1200, 560], [1400, 680]],
    [[1700, 590], [1900, 640]],
    [[1900, 640], [2100, 610]],
    [[2100, 610], [2200, 660]],
  ];
  // 路径阴影
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [p1, p2] of paths) {
    const s1x = p1[0] - camX, s1y = p1[1] - camY + 2;
    const s2x = p2[0] - camX, s2y = p2[1] - camY + 2;
    if (Math.max(s1x, s2x) < -50 || Math.min(s1x, s2x) > screenW + 50) continue;
    if (Math.max(s1y, s2y) < -50 || Math.min(s1y, s2y) > screenH + 50) continue;
    ctx.beginPath();
    ctx.moveTo(s1x, s1y);
    ctx.lineTo(s2x, s2y);
    ctx.stroke();
  }
  // 路径本体
  ctx.strokeStyle = 'rgba(200,205,215,0.5)';
  ctx.lineWidth = 10;
  for (const [p1, p2] of paths) {
    const s1x = p1[0] - camX, s1y = p1[1] - camY;
    const s2x = p2[0] - camX, s2y = p2[1] - camY;
    if (Math.max(s1x, s2x) < -50 || Math.min(s1x, s2x) > screenW + 50) continue;
    if (Math.max(s1y, s2y) < -50 || Math.min(s1y, s2y) > screenH + 50) continue;
    ctx.beginPath();
    ctx.moveTo(s1x, s1y);
    ctx.lineTo(s2x, s2y);
    ctx.stroke();
  }
  // 路径脚印痕迹
  ctx.fillStyle = 'rgba(170,175,185,0.25)';
  for (const [p1, p2] of paths) {
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.floor(len / 25);
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const fx = p1[0] + dx * t - camX;
      const fy = p1[1] + dy * t - camY;
      if (fx < -10 || fx > screenW + 10 || fy < horizonY || fy > screenH + 10) continue;
      ctx.beginPath();
      ctx.ellipse(fx + (s % 2 ? 3 : -3), fy, 3, 1.5, (s * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.lineCap = 'butt';
}

// 装饰性树木
const WORLD_TREES = [];
function getWorldTrees() {
  if (WORLD_TREES.length > 0) return WORLD_TREES;
  const positions = [
    [100, 520], [200, 540], [350, 500], [480, 530],
    [700, 510], [850, 550], [1050, 530], [1300, 510],
    [1600, 500], [1850, 540], [2050, 520], [2300, 550],
    [150, 570], [400, 590], [750, 570], [1150, 590],
    [1450, 570], [1750, 600], [2000, 580], [2350, 570],
  ];
  for (const [x, y] of positions) {
    WORLD_TREES.push({
      x, y,
      height: 25 + Math.random() * 20,
      width: 12 + Math.random() * 8,
      snow: 0.3 + Math.random() * 0.4,
    });
  }
  return WORLD_TREES;
}

export function drawWorldTrees(ctx, camX, camY, screenW, screenH) {
  const trees = getWorldTrees();
  for (const t of trees) {
    const sx = t.x - camX;
    const sy = t.y - camY;
    if (sx < -50 || sx > screenW + 50 || sy < -80 || sy > screenH + 20) continue;

    // 树影
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(sx + 5, sy + 2, t.width * 0.4, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // 树干
    ctx.fillStyle = '#4a2a10';
    ctx.fillRect(sx - 2, sy - t.height * 0.35, 4, t.height * 0.35);
    // 树干纹理
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(sx - 1, sy - t.height * 0.2);
    ctx.lineTo(sx + 1, sy - t.height * 0.2);
    ctx.moveTo(sx - 1, sy - t.height * 0.1);
    ctx.lineTo(sx + 1, sy - t.height * 0.1);
    ctx.stroke();

    // 第三层树冠（最底层，最宽）
    ctx.fillStyle = '#1a4a1a';
    ctx.beginPath();
    ctx.moveTo(sx, sy - t.height * 0.65);
    ctx.lineTo(sx - t.width * 0.65, sy - t.height * 0.1);
    ctx.lineTo(sx + t.width * 0.65, sy - t.height * 0.1);
    ctx.closePath();
    ctx.fill();

    // 第二层树冠
    ctx.fillStyle = '#245524';
    ctx.beginPath();
    ctx.moveTo(sx, sy - t.height * 0.8);
    ctx.lineTo(sx - t.width * 0.5, sy - t.height * 0.35);
    ctx.lineTo(sx + t.width * 0.5, sy - t.height * 0.35);
    ctx.closePath();
    ctx.fill();

    // 第一层树冠（最顶层）
    ctx.fillStyle = '#2a5a2a';
    ctx.beginPath();
    ctx.moveTo(sx, sy - t.height);
    ctx.lineTo(sx - t.width * 0.35, sy - t.height * 0.55);
    ctx.lineTo(sx + t.width * 0.35, sy - t.height * 0.55);
    ctx.closePath();
    ctx.fill();

    // 雪顶（每层树冠都有雪）
    ctx.fillStyle = `rgba(225,235,245,${t.snow})`;
    // 顶层雪
    ctx.beginPath();
    ctx.moveTo(sx, sy - t.height);
    ctx.lineTo(sx - t.width * 0.2, sy - t.height * 0.7);
    ctx.lineTo(sx + t.width * 0.2, sy - t.height * 0.7);
    ctx.closePath();
    ctx.fill();
    // 中层雪
    ctx.beginPath();
    ctx.moveTo(sx - t.width * 0.1, sy - t.height * 0.75);
    ctx.lineTo(sx - t.width * 0.35, sy - t.height * 0.55);
    ctx.lineTo(sx + t.width * 0.15, sy - t.height * 0.55);
    ctx.closePath();
    ctx.fill();
    // 底层雪
    ctx.fillStyle = `rgba(225,235,245,${t.snow * 0.7})`;
    ctx.beginPath();
    ctx.moveTo(sx - t.width * 0.15, sy - t.height * 0.6);
    ctx.lineTo(sx - t.width * 0.5, sy - t.height * 0.35);
    ctx.lineTo(sx + t.width * 0.05, sy - t.height * 0.35);
    ctx.closePath();
    ctx.fill();
  }
}

// 岩石装饰
const WORLD_ROCKS = [];
function getWorldRocks() {
  if (WORLD_ROCKS.length > 0) return WORLD_ROCKS;
  const positions = [
    [300, 560], [500, 610], [800, 590], [1200, 620],
    [1600, 610], [1900, 650], [2200, 600], [250, 540],
  ];
  for (const [x, y] of positions) {
    WORLD_ROCKS.push({
      x, y,
      w: 10 + Math.random() * 15,
      h: 6 + Math.random() * 8,
      shade: Math.random() * 0.3,
    });
  }
  return WORLD_ROCKS;
}

export function drawWorldRocks(ctx, camX, camY, screenW, screenH) {
  const rocks = getWorldRocks();
  for (const r of rocks) {
    const sx = r.x - camX;
    const sy = r.y - camY;
    if (sx < -30 || sx > screenW + 30 || sy < -20 || sy > screenH + 10) continue;

    ctx.fillStyle = `rgb(${130 + r.shade * 40},${130 + r.shade * 40},${135 + r.shade * 40})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy, r.w, r.h, 0, 0, Math.PI * 2);
    ctx.fill();

    // 雪覆盖
    ctx.fillStyle = 'rgba(230,235,240,0.5)';
    ctx.beginPath();
    ctx.ellipse(sx, sy - r.h * 0.3, r.w * 0.8, r.h * 0.4, 0, Math.PI, 0);
    ctx.fill();
  }
}

// 世界空间建筑绘制（带名牌和选中高亮）
export function drawWorldBuilding(ctx, type, x, y, w, h, state, level, name, emoji, isSelected) {
  // 阴影
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h + 2, w / 2 + 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // 建筑本体
  drawBuildingSprite(ctx, type, x, y, w, h, state, level);

  // 选中高亮
  if (isSelected) {
    ctx.strokeStyle = '#6495ed';
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);

    // 选中光晕
    ctx.shadowColor = '#6495ed';
    ctx.shadowBlur = 10;
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
    ctx.shadowBlur = 0;
  }

  // 名牌（建筑名 + 状态）
  const STATE_LABELS = {
    0: '🔒', 1: '✅', 2: '🔨', 3: '⚙️',
    4: '❌缺人', 5: '❌缺料', 6: '🧊',
  };
  const label = STATE_LABELS[state] || '';
  const nameText = `${emoji} ${name} ${label}`;
  ctx.font = 'bold 11px monospace';
  const tw = ctx.measureText(nameText).width;
  const px = x + w / 2;
  const py = y - 10;

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRectPath(ctx, px - tw / 2 - 4, py - 10, tw + 8, 16, 4);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(nameText, px, py + 2);
  ctx.textAlign = 'left';

  // 等级角标
  if (level > 0) {
    drawLevelBadge(ctx, x, y, level);
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
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

// 世界空间工人绘制（带行走动画）
export function drawWorldWorker(ctx, worker, x, y, targetX, targetY) {
  const isWalking = targetX !== null && targetY !== null &&
    (Math.abs(x - targetX) > 2 || Math.abs(y - targetY) > 2);
  const t = Date.now() / 1000;
  const s = 1.2; // 世界空间工人缩放

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  // 朝向（根据移动方向翻转）
  if (isWalking && targetX < x) ctx.scale(-1, 1);

  switch (worker.state) {
    case WorkerState.WORKING:
      if (isWalking) drawWalkingWorker(ctx, t);
      else drawWorkingWorker(ctx, t);
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
    default:
      if (isWalking) drawWalkingWorker(ctx, t);
      else drawIdleWorker(ctx, t);
  }

  ctx.restore();

  // 名字标签
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.font = '9px monospace';
  const nw = ctx.measureText(worker.name).width;
  roundRectPath(ctx, x - nw / 2 - 2, y + 16, nw + 4, 12, 3);
  ctx.fill();
  ctx.fillStyle = '#ddd';
  ctx.textAlign = 'center';
  ctx.fillText(worker.name, x, y + 25);
  ctx.textAlign = 'left';
}

function drawWalkingWorker(ctx, t) {
  const walk = Math.sin(t * 8) * 4;
  drawWorkerBody(ctx, '#5a6a8a', '#e8c090');
  // 行走的腿
  ctx.strokeStyle = '#5a6a8a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-2, 10);
  ctx.lineTo(-2 + walk, 16);
  ctx.moveTo(2, 10);
  ctx.lineTo(2 - walk, 16);
  ctx.stroke();
  // 摆臂
  ctx.beginPath();
  ctx.moveTo(-4, 2);
  ctx.lineTo(-6 - walk, 8);
  ctx.moveTo(4, 2);
  ctx.lineTo(6 + walk, 8);
  ctx.stroke();
}

function drawWalkingWorkerFn(ctx, t) {
  const walk = Math.sin(t * 8) * 4;
  drawWorkerBody(ctx, '#5a6a8a', '#e8c090');
  ctx.strokeStyle = '#5a6a8a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-2, 10);
  ctx.lineTo(-2 + walk, 16);
  ctx.moveTo(2, 10);
  ctx.lineTo(2 - walk, 16);
  ctx.stroke();
}

// 远景山脉（视差滚动）
export function drawWorldMountains(ctx, camX, screenW, horizonY) {
  const parallax = camX * 0.1; // 远景慢速视差

  ctx.fillStyle = '#1a2a3a';
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  const peaks = [
    [0.05, -70], [0.12, -40], [0.22, -90], [0.35, -50],
    [0.45, -80], [0.55, -35], [0.65, -75], [0.78, -45],
    [0.88, -65], [0.95, -30],
  ];
  for (const [px, py] of peaks) {
    const sx = (px * screenW * 2 - parallax) % (screenW * 2);
    ctx.lineTo(sx, horizonY + py);
  }
  ctx.lineTo(screenW, horizonY);
  ctx.closePath();
  ctx.fill();

  // 雪顶
  ctx.fillStyle = 'rgba(200,210,220,0.35)';
  for (const [px, py] of peaks) {
    if (py > -50) continue;
    const sx = (px * screenW * 2 - parallax) % (screenW * 2);
    ctx.beginPath();
    ctx.moveTo(sx - 8, horizonY + py + 10);
    ctx.lineTo(sx, horizonY + py);
    ctx.lineTo(sx + 8, horizonY + py + 10);
    ctx.closePath();
    ctx.fill();
  }
}

// 建筑世界位置配置
export const BUILDING_WORLD_POSITIONS = {
  'BLD_FURNACE':      { x: 550,  y: 540, w: 130, h: 100 },
  'BLD_LUMBER_CAMP':  { x: 830,  y: 560, w: 110, h: 85 },
  'BLD_COAL_MINE':    { x: 1050, y: 580, w: 110, h: 85 },
  'BLD_HUNTER_HUT':   { x: 1350, y: 550, w: 100, h: 80 },
  'BLD_COOKHOUSE':    { x: 1550, y: 570, w: 100, h: 80 },
  'BLD_CLINIC':       { x: 1750, y: 590, w: 100, h: 80 },
  'BLD_SHELTER':      { x: 1300, y: 630, w: 100, h: 80 },
  'BLD_WORKSHOP':     { x: 1950, y: 570, w: 100, h: 80 },
  'BLD_TRADING_POST': { x: 2100, y: 610, w: 100, h: 80 },
  'BLD_WATCHTOWER':   { x: 400,  y: 500, w: 80, h: 120 },
  'BLD_LIBRARY':      { x: 2250, y: 560, w: 110, h: 85 },
};

// 获取建筑在世界中的锚点（底部中心，用于工人站位）
export function getBuildingAnchor(type) {
  const pos = BUILDING_WORLD_POSITIONS[type];
  if (!pos) return { x: 600, y: 600 };
  return { x: pos.x + pos.w / 2, y: pos.y + pos.h + 5 };
}

// 未解锁建筑绘制（世界空间）
export function drawWorldLockedBuilding(ctx, x, y, w, h, name, cost, canAfford, emoji) {
  const t = Date.now() / 1000;

  // 背景框
  ctx.fillStyle = 'rgba(30,30,40,0.6)';
  ctx.fillRect(x + 4, y + 4, w - 8, h - 8);

  // 边框（虚线）
  ctx.strokeStyle = canAfford ? `rgba(78,205,196,${0.4 + Math.sin(t * 3) * 0.2})` : 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
  ctx.setLineDash([]);

  // 建筑名称
  ctx.fillStyle = '#778899';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('🔒 ' + name, x + w / 2, y + h / 2 - 10);

  // 建筑描述（如果有emoji）
  if (emoji) {
    ctx.font = '20px sans-serif';
    ctx.fillText(emoji, x + w / 2, y + h / 2 + 10);
  }

  // 费用
  const costType = Object.keys(cost)[0];
  const costVal = cost[costType];
  ctx.fillStyle = canAfford ? '#4ecdc4' : '#ff6b6b';
  ctx.font = '11px monospace';
  ctx.fillText(`${costVal} ${costType.replace('RES_', '')}`, x + w / 2, y + h / 2 + 28);

  // 可建造提示（脉冲效果）
  if (canAfford) {
    const pulse = Math.sin(t * 4) * 0.3 + 0.7;
    ctx.fillStyle = `rgba(78,205,196,${pulse})`;
    ctx.font = '10px monospace';
    ctx.fillText('点击建造', x + w / 2, y + h - 8);
  }

  ctx.textAlign = 'left';
}
