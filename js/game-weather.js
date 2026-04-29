// ==========================================
// game-weather.js
// 天气管理器：暴风雪状态机与全局温度
// ==========================================

import {
  WeatherType, BlizzardState, GAME_CONSTANTS,
  GlobalEvents, eventBus,
} from './game-constants';

const BLIZZARD_CONFIGS = [
  { idx: 1, warnSec: 120, activeSec: 300, tempDrop: -20, coalMult: 2.0 },
  { idx: 2, warnSec: 120, activeSec: 420, tempDrop: -25, coalMult: 2.2 },
  { idx: 3, warnSec: 90,  activeSec: 540, tempDrop: -30, coalMult: 2.5 },
];

export class WeatherManager {
  constructor() {
    this.currentWeather = WeatherType.CLEAR;
    this.blizzardState = BlizzardState.IDLE;
    this.blizzardTimerMs = 0;
    this.nextIndex = 0;
    this.tempModifier = 0;
    this.coalMultiplier = 1;
    this.lastEndTimeMs = Date.now();
    this.blizzardIntervalMs = 300000; // 测试用：5分钟一次（正式应为86400000）
  }

  getConfig() {
    return BLIZZARD_CONFIGS[Math.min(this.nextIndex, BLIZZARD_CONFIGS.length - 1)];
  }

  getGlobalTemperature() {
    let T = GAME_CONSTANTS.BASE_MAP_TEMPERATURE;
    if (this.currentWeather === WeatherType.SNOW) T += -5;
    if (this.blizzardState === BlizzardState.ACTIVE) T += this.tempModifier;
    return T;
  }

  getCoalMultiplier() {
    return this.blizzardState === BlizzardState.ACTIVE ? this.coalMultiplier : 1;
  }

  tick() {
    const dt = GAME_CONSTANTS.TICK_INTERVAL_MS;
    const cfg = this.getConfig();

    switch (this.blizzardState) {
      case BlizzardState.IDLE:
        if (Date.now() - this.lastEndTimeMs >= this.blizzardIntervalMs) {
          this.blizzardState = BlizzardState.WARNING;
          this.currentWeather = WeatherType.SNOW;
          this.blizzardTimerMs = cfg.warnSec * 1000;
          this.tempModifier = -5;
          eventBus.emit(GlobalEvents.WEATHER_CHANGED, {
            newWeather: WeatherType.SNOW, phase: 'warning',
          });
        }
        break;

      case BlizzardState.WARNING:
        this.blizzardTimerMs -= dt;
        if (this.blizzardTimerMs <= 0) {
          this.blizzardState = BlizzardState.ACTIVE;
          this.currentWeather = WeatherType.BLIZZARD;
          this.blizzardTimerMs = cfg.activeSec * 1000;
          this.tempModifier = cfg.tempDrop;
          this.coalMultiplier = cfg.coalMult;
          eventBus.emit(GlobalEvents.WEATHER_CHANGED, {
            newWeather: WeatherType.BLIZZARD, phase: 'active',
          });
        }
        break;

      case BlizzardState.ACTIVE:
        this.blizzardTimerMs -= dt;
        if (this.blizzardTimerMs <= 0) {
          this.blizzardState = BlizzardState.RECOVERY;
          this.currentWeather = WeatherType.SNOW;
          this.blizzardTimerMs = 120000;
          this.tempModifier = -5;
          this.coalMultiplier = 1;
        }
        break;

      case BlizzardState.RECOVERY:
        this.blizzardTimerMs -= dt;
        if (this.blizzardTimerMs <= 0) {
          this.blizzardState = BlizzardState.IDLE;
          this.currentWeather = WeatherType.CLEAR;
          this.tempModifier = 0;
          this.nextIndex++;
          this.lastEndTimeMs = Date.now();
        }
        break;
    }
  }
}
