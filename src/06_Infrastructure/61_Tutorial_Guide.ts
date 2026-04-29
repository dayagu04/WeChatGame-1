// ==========================================
// 61_Tutorial_Guide.ts
// 强新手引导状态机与屏幕镂空遮罩控制
// ==========================================

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 引导步骤配置字典 */
export interface TutorialStep {
  stepId: number;
  targetNodePath: string;    // 需高亮的 UI 节点路径/ID
  dialogueText: string;      // 屏幕上显示的提示文本
  isBlocking: boolean;       // true: 屏幕其余部分拦截点击
  completionCondition: {
    eventName: string;       // 需监听的完成事件
    validateFunc?: (payload: unknown) => boolean;
  };
}

/** 引导状态枚举 */
export enum TutorialState {
  INACTIVE = 'INACTIVE',   // 未激活 (新手已完成或被跳过)
  ACTIVE = 'ACTIVE',       // 引导进行中
  PAUSED = 'PAUSED',       // 暂停 (如切后台)
}

/** 高亮区域矩形 */
export interface HighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ==========================================
// 核心逻辑 (Core Logic)
// ==========================================

export class TutorialGuide {
  private steps: TutorialStep[];
  private currentStepIndex: number = 0;
  private state: TutorialState = TutorialState.INACTIVE;
  private eventCleanupFn?: () => void;

  constructor(steps: TutorialStep[]) {
    this.steps = steps.sort((a, b) => a.stepId - b.stepId);
  }

  // ---------- Public API ----------

  getState(): TutorialState {
    return this.state;
  }

  getCurrentStep(): TutorialStep | null {
    if (this.state !== TutorialState.ACTIVE) return null;
    return this.steps[this.currentStepIndex] ?? null;
  }

  getProgress(): number {
    return this.currentStepIndex;
  }

  /** 启动引导 (从指定步骤或从头) */
  start(startStep: number = 0): void {
    this.currentStepIndex = startStep;
    this.state = TutorialState.ACTIVE;
    this.activateStep();
  }

  /** 跳过整个引导 */
  skip(): void {
    this.cleanup();
    this.state = TutorialState.INACTIVE;
    this.currentStepIndex = this.steps.length;
    this.emitEvent('EVT_TUTORIAL_COMPLETED', {});
  }

  // ---------- 4.1 遮罩镂空与事件穿透判定 ----------

  /**
   * Hit-Test: 点击是否落在高亮区域内
   * IsHitTarget = (P_x >= X) ∧ (P_x <= X + W) ∧ (P_y >= Y) ∧ (P_y <= Y + H)
   */
  isClickOnHighlight(
    clickX: number,
    clickY: number,
    highlight: HighlightRect,
  ): boolean {
    return (
      clickX >= highlight.x &&
      clickX <= highlight.x + highlight.width &&
      clickY >= highlight.y &&
      clickY <= highlight.y + highlight.height
    );
  }

  /**
   * 处理点击事件
   * @returns true 如果点击被引导拦截（需阻止穿透）
   */
  handleClick(clickX: number, clickY: number, highlight: HighlightRect): boolean {
    const step = this.getCurrentStep();
    if (!step) return false;

    const isOnTarget = this.isClickOnHighlight(clickX, clickY, highlight);

    if (isOnTarget) {
      // 点击在高亮区域：分发给下层目标组件
      return false; // 不拦截
    }

    if (step.isBlocking) {
      // 阻断模式：丢弃点击，播放提示动画
      // TODO: 播放箭头抖动动画
      console.log('[Tutorial] Please click on the highlighted area');
      return true; // 拦截
    }

    return false;
  }

  // ---------- 4.2 步骤驱动状态机 ----------

  private activateStep(): void {
    const step = this.getCurrentStep();
    if (!step) {
      // 全部完成
      this.skip();
      return;
    }

    // TODO: 渲染遮罩和高亮区域
    console.log(`[Tutorial] Step ${step.stepId}: ${step.dialogueText}`);

    // 动态注册 completionCondition 事件监听
    this.registerCompletionListener(step);
  }

  private registerCompletionListener(step: TutorialStep): void {
    // 清理上一步的监听器
    if (this.eventCleanupFn) {
      this.eventCleanupFn();
    }

    const handler = (payload: unknown) => {
      const { validateFunc } = step.completionCondition;
      if (!validateFunc || validateFunc(payload)) {
        this.onStepCompleted();
      }
    };

    // 使用事件总线监听
    // TODO: 接入实际 eventBus
    const eventName = step.completionCondition.eventName;
    console.log(`[Tutorial] Listening for: ${eventName}`);

    this.eventCleanupFn = () => {
      console.log(`[Tutorial] Unsubscribed from: ${eventName}`);
    };
  }

  private onStepCompleted(): void {
    const step = this.getCurrentStep();
    if (!step) return;

    // 清理当前监听器
    if (this.eventCleanupFn) {
      this.eventCleanupFn();
      this.eventCleanupFn = undefined;
    }

    this.emitEvent('EVT_TUTORIAL_STEP_FINISHED', { stepId: step.stepId });

    // 推进到下一步
    this.currentStepIndex++;

    if (this.currentStepIndex >= this.steps.length) {
      // 全部完成
      this.state = TutorialState.INACTIVE;
      this.emitEvent('EVT_TUTORIAL_COMPLETED', {});
      // TODO: 销毁遮罩，解锁所有受限 UI
    } else {
      this.activateStep();
    }
  }

  private cleanup(): void {
    if (this.eventCleanupFn) {
      this.eventCleanupFn();
      this.eventCleanupFn = undefined;
    }
  }

  private emitEvent(event: string, payload: unknown): void {
    // TODO: 接入实际的事件总线
    console.log(`[Tutorial] Event: ${event}`, payload);
  }
}
