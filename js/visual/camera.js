// ==========================================
// camera.js - 世界相机系统
// 支持拖拽平移、边界限制、坐标变换
// ==========================================

export class Camera {
  constructor(worldW, worldH, screenW, screenH) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.screenW = screenW;
    this.screenH = screenH;
    this.x = 0;
    this.y = 0;
    this.dragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragCamStartX = 0;
    this.dragCamStartY = 0;
    this.dragMoved = false;
  }

  // 居中到某个世界坐标
  centerOn(wx, wy) {
    this.x = wx - this.screenW / 2;
    this.y = wy - this.screenH / 2;
    this.clamp();
  }

  // 限制相机在世界范围内
  clamp() {
    this.x = Math.max(0, Math.min(this.worldW - this.screenW, this.x));
    this.y = Math.max(0, Math.min(this.worldH - this.screenH, this.y));
  }

  // 世界坐标 → 屏幕坐标
  worldToScreen(wx, wy) {
    return { x: wx - this.x, y: wy - this.y };
  }

  // 屏幕坐标 → 世界坐标
  screenToWorld(sx, sy) {
    return { x: sx + this.x, y: sy + this.y };
  }

  // 开始拖拽
  startDrag(sx, sy) {
    this.dragging = true;
    this.dragMoved = false;
    this.dragStartX = sx;
    this.dragStartY = sy;
    this.dragCamStartX = this.x;
    this.dragCamStartY = this.y;
  }

  // 拖拽移动
  drag(sx, sy) {
    if (!this.dragging) return;
    const dx = sx - this.dragStartX;
    const dy = sy - this.dragStartY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) this.dragMoved = true;
    this.x = this.dragCamStartX - dx;
    this.y = this.dragCamStartY - dy;
    this.clamp();
  }

  // 结束拖拽
  endDrag() {
    this.dragging = false;
  }

  // 是否在拖拽（用于区分点击和拖拽）
  wasDragging() {
    return this.dragMoved;
  }

  // 调整屏幕大小
  resize(screenW, screenH) {
    this.screenW = screenW;
    this.screenH = screenH;
    this.clamp();
  }
}
