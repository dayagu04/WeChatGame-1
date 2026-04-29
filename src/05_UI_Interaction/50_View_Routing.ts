// ==========================================
// 50_View_Routing.ts
// 基于栈管理 (Stack) 的 UI 弹窗层级分配与焦点拦截
// ==========================================

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 视图层级分类 (决定基础 z-index) */
export enum ViewLayer {
  SCENE = 'LAYER_SCENE',   // 3D/2D 场景层 (最底层)
  HUD = 'LAYER_HUD',       // 常驻信息层
  PANEL = 'LAYER_PANEL',   // 半屏/全屏业务面板
  MODAL = 'LAYER_MODAL',   // 强弹窗层
  GUIDE = 'LAYER_GUIDE',   // 新手引导层
  TOAST = 'LAYER_TOAST',   // 弱提示层 (最顶层)
}

/** 视图面板配置字典 */
export interface ViewConfig {
  viewId: string;
  layer: ViewLayer;
  isFullScreen: boolean;
  closeOnMaskClick: boolean;
}

/** UI 路由栈状态 */
export interface RouteState {
  activeScene: string;
  panelStack: string[];
}

/** 面板实例运行时数据 */
interface PanelInstance {
  viewId: string;
  config: ViewConfig;
  zIndex: number;
  payload?: unknown;
}

// 基础层级映射 Z_base
const Z_BASE: Record<ViewLayer, number> = {
  [ViewLayer.SCENE]: 0,
  [ViewLayer.HUD]: 100,
  [ViewLayer.PANEL]: 200,
  [ViewLayer.MODAL]: 1000,
  [ViewLayer.GUIDE]: 5000,
  [ViewLayer.TOAST]: 9000,
};

// ==========================================
// 核心逻辑 (Core Logic)
// ==========================================

export class UIManager {
  private viewConfigs: Map<string, ViewConfig> = new Map();
  private panelStack: PanelInstance[] = [];
  private activeScene: string = 'Scene_City';
  private inputLocked: boolean = false;

  constructor(configs?: ViewConfig[]) {
    if (configs) {
      for (const c of configs) {
        this.viewConfigs.set(c.viewId, c);
      }
    }
  }

  // ---------- Public API ----------

  getState(): RouteState {
    return {
      activeScene: this.activeScene,
      panelStack: this.panelStack.map((p) => p.viewId),
    };
  }

  isInputLocked(): boolean {
    return this.inputLocked;
  }

  getStackDepth(): number {
    return this.panelStack.length;
  }

  // ---------- 4.1 Z-Index 动态计算 ----------

  /**
   * Z_final = Z_base + (Index × 10)
   */
  calculateZIndex(layer: ViewLayer, stackIndex: number): number {
    return Z_BASE[layer] + stackIndex * 10;
  }

  // ---------- 4.2 路由压栈与出栈 ----------

  /**
   * 打开面板 pushView
   * @returns 是否成功打开
   */
  pushView(viewId: string, payload?: unknown): boolean {
    const config = this.viewConfigs.get(viewId);
    if (!config) {
      console.warn(`[UIManager] viewId "${viewId}" not found in ViewConfig dictionary`);
      return false;
    }

    // 检查是否已存在
    const existingIdx = this.panelStack.findIndex((p) => p.viewId === viewId);
    if (existingIdx !== -1) {
      // 已存在，移到栈顶
      const [existing] = this.panelStack.splice(existingIdx, 1);
      this.panelStack.push(existing);
      existing.zIndex = this.calculateZIndex(config.layer, this.panelStack.length - 1);
      return true;
    }

    // 计算 z-index
    const zIndex = this.calculateZIndex(config.layer, this.panelStack.length);

    // 推入栈
    const instance: PanelInstance = { viewId, config, zIndex, payload };
    this.panelStack.push(instance);

    // 焦点穿透防御
    this.updateInputLock();

    // 全屏面板优化
    if (config.isFullScreen) {
      this.emitEvent('EVT_VIEW_FULLSCREEN_OPENED', { viewId });
    }

    this.emitEvent('EVT_VIEW_OPENED', { viewId });
    return true;
  }

  /**
   * 关闭面板 popView
   * @returns 被关闭的 viewId
   */
  popView(viewId?: string): string | null {
    if (this.panelStack.length === 0) return null;

    let removed: PanelInstance | undefined;

    if (viewId) {
      const idx = this.panelStack.findIndex((p) => p.viewId === viewId);
      if (idx === -1) return null;
      removed = this.panelStack.splice(idx, 1)[0];
    } else {
      removed = this.panelStack.pop();
    }

    if (!removed) return null;

    // 检查是否还有全屏面板
    const hasFullScreen = this.panelStack.some((p) => p.config.isFullScreen);
    if (removed.config.isFullScreen && !hasFullScreen) {
      this.emitEvent('EVT_VIEW_FULLSCREEN_CLOSED', {});
    }

    this.updateInputLock();
    this.emitEvent('EVT_VIEW_CLOSED', { viewId: removed.viewId });
    return removed.viewId;
  }

  /** 清空所有面板 */
  clearStack(): void {
    while (this.panelStack.length > 0) {
      this.popView();
    }
  }

  // ---------- 4.3 场景切换 ----------

  /**
   * 场景切换
   * 1. 锁定交互
   * 2. 清空面板栈
   * 3. 切换场景
   * 4. 解除锁定
   */
  switchScene(targetScene: string): void {
    if (targetScene === this.activeScene) return;

    // 1. 锁定
    this.inputLocked = true;
    this.emitEvent('EVT_SCENE_TRANSITION_START', {
      from: this.activeScene,
      to: targetScene,
    });

    // 2. 清空面板
    this.clearStack();

    // 3. 切换
    this.activeScene = targetScene;

    // 4. 解除锁定
    this.inputLocked = false;
    this.emitEvent('EVT_SCENE_TRANSITION_END', { scene: targetScene });
  }

  // ---------- 4.4 焦点穿透防御 ----------

  private updateInputLock(): void {
    // 当栈中有阻断型面板时，锁定输入
    this.inputLocked = this.panelStack.some(
      (p) =>
        p.config.layer === ViewLayer.MODAL ||
        p.config.layer === ViewLayer.GUIDE ||
        p.config.isFullScreen,
    );
  }

  /** 检查点击是否落在面板区域内 (Hit-Test) */
  isClickOnPanel(clickX: number, clickY: number): boolean {
    // 简化实现：有面板在栈中就认为点击被拦截
    // 实际应检查每个面板的包围盒
    return this.panelStack.length > 0 && this.inputLocked;
  }

  // ---------- 事件发送 (Mock) ----------

  private emitEvent(event: string, payload: unknown): void {
    // TODO: 接入实际的事件总线
    console.log(`[UIManager] Event: ${event}`, payload);
  }
}
