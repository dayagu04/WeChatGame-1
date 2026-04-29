// ==========================================
// 62_Monetization_Ads.ts
// 激励视频广告 (IAA) 接口封装与业务奖励分发
// ==========================================

import { ResourceType } from '../00_Core/00_Global_Enums';
import { LevelUpFormulaEngine } from '../04_Economy_System/41_Level_Up_Formula';

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 广告点位枚举 */
export enum AdPlacement {
  DOUBLE_OFFLINE_REWARD = 'AD_DOUBLE_OFFLINE', // 离线收益翻倍
  SKIP_BUILD_TIME = 'AD_SKIP_BUILD',           // 减少建筑升级倒计时
  FREE_GACHA = 'AD_FREE_GACHA',               // 免费英雄抽卡
  REVIVE_WORKER = 'AD_REVIVE_WORKER',         // 复活冻死的NPC
}

/** 广告奖励请求 */
export interface AdRewardPayload {
  placement: AdPlacement;
  customData?: {
    instanceId?: string;
    offlineGains?: Record<string, number>;
    [key: string]: unknown;
  };
}

/** 广告回调接口 */
export interface AdCallbacks {
  /** 扣除资源 */
  addResource?: (type: ResourceType, amount: number) => void;
  /** 修改建筑升级开始时间 */
  modifyUpgradeStartTime?: (instanceId: string, newStartTimeMs: number) => void;
  /** 复活工人 */
  reviveWorker?: (workerId: string) => void;
}

// ==========================================
// 常量
// ==========================================

const SKIP_BUILD_TIME_MS = 1800000; // 30分钟

// ==========================================
// 核心逻辑 (Core Logic)
// ==========================================

export class MonetizationManager {
  private isAdShowing: boolean = false;
  private callbacks: AdCallbacks;

  constructor(callbacks: AdCallbacks) {
    this.callbacks = callbacks;
  }

  // ---------- 4.1 激励视频单例与生命周期 ----------

  /**
   * 初始化广告单例 (游戏启动时调用)
   * TODO: 替换为 wx.createRewardedVideoAd({ adUnitId: 'xxx' })
   */
  initAd(): void {
    // wx.createRewardedVideoAd 模拟
    console.log('[Ad] RewardedVideoAd initialized');
  }

  /**
   * 展示广告 (防爆点并发锁)
   * @returns Promise<boolean> 是否完整观看
   */
  async showAd(placement: AdPlacement): Promise<boolean> {
    // 并发锁
    if (this.isAdShowing) {
      console.warn('[Ad] Ad is already showing, request blocked');
      return false;
    }

    this.isAdShowing = true;

    try {
      // TODO: 替换为实际的 ad.show() + onClose/onError 监听
      const isEnded = await this.mockAdShow();

      if (isEnded) {
        return true;
      } else {
        console.log('[Ad] User closed ad before completion');
        return false;
      }
    } catch (err) {
      // 降级策略 (Fallback)
      console.warn('[Ad] Ad error, applying fallback:', err);
      return false;
    } finally {
      this.isAdShowing = false;
    }
  }

  // ---------- 4.2 业务系统发奖路由 ----------

  /**
   * 广告验证通过后发放奖励
   */
  grantReward(payload: AdRewardPayload): void {
    switch (payload.placement) {
      case AdPlacement.DOUBLE_OFFLINE_REWARD:
        this.grantDoubleOfflineReward(payload);
        break;

      case AdPlacement.SKIP_BUILD_TIME:
        this.grantSkipBuildTime(payload);
        break;

      case AdPlacement.FREE_GACHA:
        this.grantFreeGacha();
        break;

      case AdPlacement.REVIVE_WORKER:
        this.grantReviveWorker(payload);
        break;
    }

    this.emitEvent('EVT_AD_REWARD_GRANTED', { placement: payload.placement });
  }

  /**
   * AD_DOUBLE_OFFLINE: 离线收益翻倍
   * Gain_final = Gain_theory × 2
   */
  private grantDoubleOfflineReward(payload: AdRewardPayload): void {
    const gains = payload.customData?.offlineGains;
    if (!gains) return;

    for (const [type, amount] of Object.entries(gains)) {
      const doubled = amount; // 已经是理论收益，此处表示额外再给一份
      this.callbacks.addResource?.(type as ResourceType, doubled);
      console.log(`[Ad] Double offline: +${doubled} ${type}`);
    }
  }

  /**
   * AD_SKIP_BUILD: 减少建筑升级倒计时
   * upgradeStartTimeMs_new = upgradeStartTimeMs_old - T_reduce
   */
  private grantSkipBuildTime(payload: AdRewardPayload): void {
    const instanceId = payload.customData?.instanceId;
    if (!instanceId) return;

    const now = Date.now();
    // 将 startTimeMs 向过去推移
    const newStartTimeMs = now - SKIP_BUILD_TIME_MS;
    this.callbacks.modifyUpgradeStartTime?.(instanceId, newStartTimeMs);
    console.log(`[Ad] Skip build: ${instanceId} reduced by ${SKIP_BUILD_TIME_MS}ms`);
  }

  /**
   * AD_FREE_GACHA: 免费英雄抽卡
   */
  private grantFreeGacha(): void {
    // TODO: 调用抽卡系统
    console.log('[Ad] Free gacha granted');
  }

  /**
   * AD_REVIVE_WORKER: 复活冻死的NPC
   */
  private grantReviveWorker(payload: AdRewardPayload): void {
    const workerId = payload.customData?.instanceId;
    if (!workerId) return;
    this.callbacks.reviveWorker?.(workerId);
    console.log(`[Ad] Worker revived: ${workerId}`);
  }

  // ---------- 辅助 ----------

  private emitEvent(event: string, payload: unknown): void {
    // TODO: 接入实际的事件总线
    console.log(`[Ad] Event: ${event}`, payload);
  }

  /** 模拟广告展示 (实际替换为 wx API) */
  private mockAdShow(): Promise<boolean> {
    return new Promise((resolve) => {
      // 模拟广告播放3秒后关闭
      setTimeout(() => resolve(true), 100);
    });
  }
}
