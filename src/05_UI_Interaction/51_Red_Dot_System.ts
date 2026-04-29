// ==========================================
// 51_Red_Dot_System.ts
// 自底向上 (Bottom-Up) 的红点逻辑冒泡计算与去抖机制
// ==========================================

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 红点节点类型 */
export enum RedDotNodeType {
  LEAF = 'NODE_LEAF',     // 叶子节点 (具体逻辑运算)
  PARENT = 'NODE_PARENT', // 父节点 (汇总子节点状态)
}

/** 红点树节点配置数据 */
export interface RedDotNode {
  nodeId: string;
  type: RedDotNodeType;
  parentId?: string;
  childrenIds: string[];

  isActive: boolean;
  value?: number;

  // 叶子节点的条件判定函数
  evaluateCondition?: () => boolean;
}

/** 红点更新事件 */
export interface RedDotUpdateEvent {
  nodeId: string;
  isActive: boolean;
  value?: number;
}

// ==========================================
// 核心逻辑 (Core Logic)
// ==========================================

export class RedDotSystem {
  private nodes: Map<string, RedDotNode> = new Map();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private debounceMs: number = 200;

  // 事件 -> 需要重算的叶子节点ID列表 (依赖注入映射)
  private eventToLeafMap: Map<string, Set<string>> = new Map();

  constructor(configs?: RedDotNode[]) {
    if (configs) {
      for (const c of configs) {
        this.nodes.set(c.nodeId, { ...c });
      }
    }
  }

  // ---------- Public API ----------

  getNode(nodeId: string): RedDotNode | undefined {
    return this.nodes.get(nodeId);
  }

  isActive(nodeId: string): boolean {
    return this.nodes.get(nodeId)?.isActive ?? false;
  }

  /** 注册节点 */
  registerNode(node: RedDotNode): void {
    this.nodes.set(node.nodeId, { ...node });
  }

  /** 绑定事件到叶子节点 (依赖注入映射) */
  bindEventToLeaf(eventName: string, leafNodeId: string): void {
    if (!this.eventToLeafMap.has(eventName)) {
      this.eventToLeafMap.set(eventName, new Set());
    }
    this.eventToLeafMap.get(eventName)!.add(leafNodeId);
  }

  // ---------- 4.2 叶子节点计算与向上冒泡 ----------

  /**
   * 步骤1: 叶子节点条件重算
   * 仅唤醒绑定的叶子节点执行 evaluateCondition()
   */
  evaluateLeaf(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node || node.type !== RedDotNodeType.LEAF) return;

    const oldActive = node.isActive;
    node.isActive = node.evaluateCondition?.() ?? false;

    // 如果状态变化，触发冒泡
    if (node.isActive !== oldActive) {
      this.propagateUp(nodeId);
    }
  }

  /**
   * 步骤2: 布尔代数向上冒泡 (Boolean OR Propagation)
   * S_parent = C1.isActive ∨ C2.isActive ∨ ... ∨ Cn.isActive
   */
  private propagateUp(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node || !node.parentId) return;

    const parent = this.nodes.get(node.parentId);
    if (!parent) return;

    const oldParentActive = parent.isActive;

    // 计算所有子节点的逻辑或
    parent.isActive = parent.childrenIds.some((childId) => {
      const child = this.nodes.get(childId);
      return child?.isActive ?? false;
    });

    // 递归冒泡限制：仅在状态改变时继续
    if (parent.isActive !== oldParentActive) {
      this.emitUpdate(parent.nodeId, parent.isActive, parent.value);
      this.propagateUp(parent.nodeId);
    }
  }

  /**
   * 处理全局事件 (带去抖)
   * 当收到 EVT_RESOURCE_CHANGED 等事件时调用
   */
  onGlobalEvent(eventName: string): void {
    const leafIds = this.eventToLeafMap.get(eventName);
    if (!leafIds) return;

    for (const leafId of leafIds) {
      this.debounceEvaluate(leafId);
    }
  }

  // ---------- 4.3 去抖机制 ----------

  /**
   * 去抖 (Debounce)
   * 同一叶子节点在 debounceMs 内的多次重算请求合并为一次
   */
  private debounceEvaluate(nodeId: string): void {
    const existing = this.debounceTimers.get(nodeId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.evaluateLeaf(nodeId);
      this.debounceTimers.delete(nodeId);
    }, this.debounceMs);

    this.debounceTimers.set(nodeId, timer);
  }

  // ---------- 红点消除 ----------

  /**
   * 点击即消除 (Click-to-Clear)
   * 强制将叶子节点置为 false
   */
  clearLeaf(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node || node.type !== RedDotNodeType.LEAF) return;

    const oldActive = node.isActive;
    node.isActive = false;

    if (node.isActive !== oldActive) {
      this.emitUpdate(nodeId, false, node.value);
      this.propagateUp(nodeId);
    }
  }

  /**
   * 强制刷新整棵树 (慎用，仅在存档加载后调用)
   */
  evaluateAll(): void {
    // 先重算所有叶子节点
    for (const node of this.nodes.values()) {
      if (node.type === RedDotNodeType.LEAF) {
        node.isActive = node.evaluateCondition?.() ?? false;
      }
    }

    // 自底向上冒泡：按深度从深到浅处理
    const sorted = Array.from(this.nodes.values()).sort((a, b) => {
      const depthA = this.getDepth(a.nodeId);
      const depthB = this.getDepth(b.nodeId);
      return depthB - depthA;
    });

    for (const node of sorted) {
      if (node.type === RedDotNodeType.PARENT) {
        node.isActive = node.childrenIds.some((childId) => {
          const child = this.nodes.get(childId);
          return child?.isActive ?? false;
        });
      }
    }
  }

  // ---------- 辅助 ----------

  private getDepth(nodeId: string): number {
    let depth = 0;
    let current = this.nodes.get(nodeId);
    while (current?.parentId) {
      depth++;
      current = this.nodes.get(current.parentId);
    }
    return depth;
  }

  private emitUpdate(nodeId: string, isActive: boolean, value?: number): void {
    // TODO: 接入实际的事件总线
    // eventBus.emit('EVT_RED_DOT_UPDATED', { nodeId, isActive, value });
    console.log(`[RedDot] ${nodeId}: ${isActive}`, value !== undefined ? `value=${value}` : '');
  }

  /** 清理所有去抖定时器 */
  dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
