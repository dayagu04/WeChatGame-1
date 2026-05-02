// ==========================================
// game-research.js
// 科技树研究系统
// ==========================================

import { TECH_CONFIGS, TechState, GlobalEvents, eventBus } from './game-constants';

export class TechNode {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.category = config.category;
    this.cost = { ...config.cost };
    this.durationMs = config.durationMs;
    this.prerequisites = [...config.prerequisites];
    this.effect = { ...config.effect };
    this.state = TechState.LOCKED;
    this.progressMs = 0;
    this.startMs = 0;
  }
}

export class ResearchManager {
  constructor() {
    this.techs = new Map();
    for (const cfg of TECH_CONFIGS) {
      this.techs.set(cfg.id, new TechNode(cfg));
    }
    // 无前置的科技初始为 AVAILABLE
    for (const [, tech] of this.techs) {
      if (tech.prerequisites.length === 0) {
        tech.state = TechState.AVAILABLE;
      }
    }
  }

  get(techId) {
    return this.techs.get(techId);
  }

  getAll() {
    return Array.from(this.techs.values());
  }

  getAvailable() {
    return this.getAll().filter(t => t.state === TechState.AVAILABLE);
  }

  getCompleted() {
    return this.getAll().filter(t => t.state === TechState.DONE);
  }

  getResearching() {
    return this.getAll().filter(t => t.state === TechState.RESEARCHING);
  }

  // 检查前置是否满足
  checkPrerequisites(tech) {
    for (const preId of tech.prerequisites) {
      const pre = this.techs.get(preId);
      if (!pre || pre.state !== TechState.DONE) return false;
    }
    return true;
  }

  // 刷新所有 LOCKED 科技的状态
  refreshAvailable() {
    for (const [, tech] of this.techs) {
      if (tech.state === TechState.LOCKED && this.checkPrerequisites(tech)) {
        tech.state = TechState.AVAILABLE;
        eventBus.emit(GlobalEvents.TECH_STATE_CHANGE, {
          techId: tech.id, newState: TechState.AVAILABLE,
        });
      }
    }
  }

  // 开始研究
  startResearch(techId, wallet) {
    const tech = this.techs.get(techId);
    if (!tech || tech.state !== TechState.AVAILABLE) return false;
    if (!wallet.canAfford(tech.cost)) return false;
    wallet.consume(tech.cost);
    tech.state = TechState.RESEARCHING;
    tech.startMs = Date.now();
    tech.progressMs = 0;
    eventBus.emit(GlobalEvents.RESEARCH_START, { techId: tech.id });
    eventBus.emit(GlobalEvents.TECH_STATE_CHANGE, {
      techId: tech.id, newState: TechState.RESEARCHING,
    });
    return true;
  }

  // 每 tick 推进研究
  tick(wallet, buildings) {
    for (const [, tech] of this.techs) {
      if (tech.state !== TechState.RESEARCHING) continue;

      // 检查工坊是否还在运行
      if (buildings) {
        const workshop = buildings.get('BLD_WORKSHOP');
        if (!workshop || !workshop.isUnlocked()) {
          // 工坊不存在，暂停研究
          continue;
        }
      }

      tech.progressMs += 1000; // TICK_INTERVAL_MS
      if (tech.progressMs >= tech.durationMs) {
        tech.state = TechState.DONE;
        this.applyEffect(tech, wallet, buildings);
        eventBus.emit(GlobalEvents.RESEARCH_COMPLETE, {
          techId: tech.id, effect: tech.effect,
        });
        eventBus.emit(GlobalEvents.TECH_STATE_CHANGE, {
          techId: tech.id, newState: TechState.DONE,
        });
        // 完成后刷新可用科技
        this.refreshAvailable();
      }
    }
  }

  // 应用科技效果
  applyEffect(tech, wallet, buildings) {
    const eff = tech.effect;
    switch (eff.type) {
      case 'UNLOCK_BUILDING':
        if (buildings) {
          const b = buildings.get(eff.target);
          if (b && b.state === 0 /* LOCKED */) {
            // 不直接解锁，只是标记为可建造（降低费用或解锁前置条件）
            // 实际效果：将建筑的 unlockTech 设为已完成
            b._techUnlocked = true;
          }
        }
        break;
      case 'BUILDING_OUTPUT_MULT':
        // 效果通过 getOutputMultiplier 查询
        break;
      case 'WORKER_BUFF':
        // 效果通过 getWorkerBuff 查询
        break;
    }
  }

  // 获取建筑产出乘法加成
  getOutputMultiplier(buildingType) {
    let mult = 0;
    for (const [, tech] of this.techs) {
      if (tech.state === TechState.DONE &&
          tech.effect.type === 'BUILDING_OUTPUT_MULT' &&
          tech.effect.target === buildingType) {
        mult += tech.effect.value;
      }
    }
    return 1 + mult;
  }

  // 获取工人 buff
  getWorkerBuff(buffType) {
    let total = 0;
    for (const [, tech] of this.techs) {
      if (tech.state === TechState.DONE &&
          tech.effect.type === 'WORKER_BUFF' &&
          tech.effect.target === buffType) {
        total += tech.effect.value;
      }
    }
    return total;
  }

  // 序列化（存档用）
  serialize() {
    const data = {};
    for (const [id, tech] of this.techs) {
      data[id] = {
        state: tech.state,
        progressMs: tech.progressMs,
        startMs: tech.startMs,
      };
    }
    return data;
  }

  // 反序列化（读档用）
  deserialize(data) {
    if (!data) return;
    for (const [id, saved] of Object.entries(data)) {
      const tech = this.techs.get(id);
      if (tech) {
        tech.state = saved.state;
        tech.progressMs = saved.progressMs;
        tech.startMs = saved.startMs;
      }
    }
    this.refreshAvailable();
  }
}
