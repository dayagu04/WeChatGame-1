// ==========================================
// 20_Weather_Manager.ts
// 灾难管理器：暴风雪事件生命周期与全局惩罚
// ==========================================

import {
  GAME_CONSTANTS,
  GlobalEvents,
  WeatherType,
  eventBus,
} from '../00_Core/00_Global_Enums';

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 暴风雪事件生命周期状态 */
export enum BlizzardState {
  IDLE = 'BLZ_IDLE',         // 无暴风雪 (日常天气循环)
  WARNING = 'BLZ_WARNING',   // 暴风雪预警期 (倒计时显示在UI顶部)
  ACTIVE = 'BLZ_ACTIVE',     // 暴风雪爆发期 (施加全局降温与惩罚)
  RECOVERY = 'BLZ_RECOVERY', // 灾后恢复期 (温度逐渐回升)
}

/** 全局天气管理器数据 */
export interface WeatherManagerData {
  currentWeather: WeatherType;       // 当前基础天气
  globalTemperatureModifier: number; // 全局天气温度修正值

  // 暴风雪事件相关
  blizzardState: BlizzardState;
  blizzardTimerMs: number;     // 当前状态的倒计时计时器 (毫秒)
  nextBlizzardIndex: number;   // 第几次暴风雪 (用于难度递增)
}

/** 暴风雪配置表 (难度递增字典) */
export interface BlizzardConfig {
  index: number;                     // 第几次暴风雪
  warningDurationSec: number;        // 预警时长 (秒)
  activeDurationSec: number;         // 爆发时长 (秒)
  tempDrop: number;                  // 爆发期降温幅度 (负数)
  coalConsumptionMultiplier: number; // 爆发期煤炭消耗倍率
}

// ==========================================
// 默认暴风雪配置（难度递增）
// ==========================================
const DEFAULT_BLIZZARD_CONFIGS: BlizzardConfig[] = [
  { index: 1, warningDurationSec: 120, activeDurationSec: 300, tempDrop: -20, coalConsumptionMultiplier: 2.0 },
  { index: 2, warningDurationSec: 120, activeDurationSec: 420, tempDrop: -25, coalConsumptionMultiplier: 2.2 },
  { index: 3, warningDurationSec: 90,  activeDurationSec: 540, tempDrop: -30, coalConsumptionMultiplier: 2.5 },
  { index: 4, warningDurationSec: 90,  activeDurationSec: 600, tempDrop: -35, coalConsumptionMultiplier: 2.8 },
  { index: 5, warningDurationSec: 60,  activeDurationSec: 720, tempDrop: -40, coalConsumptionMultiplier: 3.0 },
];

// 暴风雪间隔时间 (24小时 = 86400000ms)
const BLIZZARD_INTERVAL_MS = 86400000;
// 恢复期时长 (120秒)
const RECOVERY_DURATION_SEC = 120;

// ==========================================
// 核心逻辑 (Core Logic)
// ==========================================

export class WeatherManager {
  data: WeatherManagerData;
  private configs: BlizzardConfig[];
  private lastBlizzardEndTimeMs: number = 0;

  constructor(
    initialData?: Partial<WeatherManagerData>,
    configs?: BlizzardConfig[],
  ) {
    this.data = {
      currentWeather: initialData?.currentWeather ?? WeatherType.CLEAR,
      globalTemperatureModifier: initialData?.globalTemperatureModifier ?? 0,
      blizzardState: initialData?.blizzardState ?? BlizzardState.IDLE,
      blizzardTimerMs: initialData?.blizzardTimerMs ?? 0,
      nextBlizzardIndex: initialData?.nextBlizzardIndex ?? 1,
    };
    this.configs = configs ?? DEFAULT_BLIZZARD_CONFIGS;

    // 监听Tick事件
    eventBus.on(GlobalEvents.TICK_UPDATE, () => this.tick());
  }

  // ---------- 4.1 全局温度计算 ----------

  /**
   * T_global = T_base + M_weather + M_blizzard
   */
  calculateGlobalTemperature(): number {
    const T_base = GAME_CONSTANTS.BASE_MAP_TEMPERATURE;
    const M_weather = this.getWeatherModifier();
    const M_blizzard = this.getBlizzardModifier();

    return T_base + M_weather + M_blizzard;
  }

  /** 获取当前暴风雪煤炭消耗倍率 */
  getCoalConsumptionMultiplier(): number {
    if (this.data.blizzardState === BlizzardState.ACTIVE) {
      const config = this.getCurrentBlizzardConfig();
      return config?.coalConsumptionMultiplier ?? 1;
    }
    return 1;
  }

  /** 获取当前暴风雪配置 */
  getCurrentBlizzardConfig(): BlizzardConfig | undefined {
    const idx = Math.min(this.data.nextBlizzardIndex, this.configs.length);
    return this.configs[idx - 1];
  }

  // ---------- 4.2 暴风雪状态机 ----------

  /** 每Tick调用，驱动天气状态机 */
  tick(): void {
    switch (this.data.blizzardState) {
      case BlizzardState.IDLE:
        this.tickIdle();
        break;
      case BlizzardState.WARNING:
        this.tickWarning();
        break;
      case BlizzardState.ACTIVE:
        this.tickActive();
        break;
      case BlizzardState.RECOVERY:
        this.tickRecovery();
        break;
    }
  }

  private tickIdle(): void {
    // 检查是否到达触发间隔
    const now = Date.now();
    if (now - this.lastBlizzardEndTimeMs >= BLIZZARD_INTERVAL_MS && this.lastBlizzardEndTimeMs > 0) {
      this.transitionTo(BlizzardState.WARNING);
    }
  }

  private tickWarning(): void {
    this.data.blizzardTimerMs -= GAME_CONSTANTS.TICK_INTERVAL_MS;
    if (this.data.blizzardTimerMs <= 0) {
      this.transitionTo(BlizzardState.ACTIVE);
    }
  }

  private tickActive(): void {
    this.data.blizzardTimerMs -= GAME_CONSTANTS.TICK_INTERVAL_MS;
    if (this.data.blizzardTimerMs <= 0) {
      this.transitionTo(BlizzardState.RECOVERY);
    }
  }

  private tickRecovery(): void {
    this.data.blizzardTimerMs -= GAME_CONSTANTS.TICK_INTERVAL_MS;
    if (this.data.blizzardTimerMs <= 0) {
      this.transitionTo(BlizzardState.IDLE);
      this.data.nextBlizzardIndex++;
    }
  }

  private transitionTo(newState: BlizzardState): void {
    const oldState = this.data.blizzardState;
    const config = this.getCurrentBlizzardConfig();

    switch (newState) {
      case BlizzardState.WARNING:
        this.data.currentWeather = WeatherType.SNOW;
        this.data.blizzardTimerMs = (config?.warningDurationSec ?? 120) * 1000;
        this.data.globalTemperatureModifier = -5;
        break;

      case BlizzardState.ACTIVE:
        this.data.currentWeather = WeatherType.BLIZZARD;
        this.data.blizzardTimerMs = (config?.activeDurationSec ?? 300) * 1000;
        this.data.globalTemperatureModifier = config?.tempDrop ?? GAME_CONSTANTS.BLIZZARD_TEMP_DROP;
        break;

      case BlizzardState.RECOVERY:
        this.data.currentWeather = WeatherType.SNOW;
        this.data.blizzardTimerMs = RECOVERY_DURATION_SEC * 1000;
        this.data.globalTemperatureModifier = -5;
        break;

      case BlizzardState.IDLE:
        this.data.currentWeather = WeatherType.CLEAR;
        this.data.globalTemperatureModifier = 0;
        this.lastBlizzardEndTimeMs = Date.now();
        break;
    }

    this.data.blizzardState = newState;

    eventBus.emit('EVT_BLIZZARD_STATE_CHANGE', {
      oldState,
      newState,
      timer: this.data.blizzardTimerMs,
    });

    if (oldState === BlizzardState.IDLE || oldState === BlizzardState.RECOVERY) {
      if (newState === BlizzardState.WARNING || newState === BlizzardState.ACTIVE) {
        eventBus.emit(GlobalEvents.WEATHER_CHANGED, {
          newWeather: this.data.currentWeather,
          duration: this.data.blizzardTimerMs / 1000,
        });
      }
    }

    eventBus.emit('EVT_GLOBAL_TEMP_CHANGED', {
      globalTemp: this.calculateGlobalTemperature(),
    });
  }

  // ---------- 辅助 ----------

  private getWeatherModifier(): number {
    switch (this.data.currentWeather) {
      case WeatherType.SNOW: return -5;
      case WeatherType.BLIZZARD: return 0; // 暴风雪的降温由 blizzardModifier 处理
      default: return 0;
    }
  }

  private getBlizzardModifier(): number {
    if (this.data.blizzardState === BlizzardState.ACTIVE) {
      return this.data.globalTemperatureModifier;
    }
    return 0;
  }

  /** 手动触发暴风雪（调试/测试用） */
  forceTriggerBlizzard(): void {
    this.lastBlizzardEndTimeMs = 0;
    this.data.blizzardTimerMs = 0;
  }
}
