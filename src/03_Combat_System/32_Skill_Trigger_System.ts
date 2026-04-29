// ==========================================
// 32_Skill_Trigger_System.ts
// 怒气充能机制与 Buff/Debuff 附加生命周期
// ==========================================

import { HeroClass } from '../00_Core/00_Global_Enums';
import { CombatUnit, DamageEventLog, CombatEngine } from './31_Combat_Calculation';

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 状态效果枚举 */
export enum BuffType {
  ATK_UP = 'BUFF_ATK_UP',         // 攻击力提升
  DEF_DOWN = 'DEBUFF_DEF_DOWN',   // 防御力降低
  DOT_BURN = 'DEBUFF_BURN',       // 持续伤害 (燃烧)
  HOT_HEAL = 'BUFF_HEAL',         // 持续恢复
  STUN = 'DEBUFF_STUN',           // 眩晕 (跳过当前回合)
}

/** 技能目标选择逻辑枚举 */
export enum SkillTargetLogic {
  SELF = 'TARGET_SELF',
  ENEMY_FRONT_ROW = 'TARGET_ENEMY_FRONT',
  ENEMY_BACK_ROW = 'TARGET_ENEMY_BACK',
  ENEMY_LOWEST_HP = 'TARGET_ENEMY_LOWEST',
  ENEMY_ALL = 'TARGET_ENEMY_ALL',
  ALLY_LOWEST_HP = 'TARGET_ALLY_LOWEST',
}

/** 状态效果实例 */
export interface BuffInstance {
  buffId: string;
  type: BuffType;
  value: number;
  durationTurns: number;
  sourceUnitId: string;
}

/** 技能基础配置 */
export interface SkillConfig {
  skillId: string;
  targetLogic: SkillTargetLogic;
  damageMultiplier: number;
  applyBuffs?: {
    type: BuffType;
    value: number;
    duration: number;
    probability: number;
  }[];
}

/** 扩展战斗单元 (补充怒气和Buff) */
export interface CombatUnitExtended extends CombatUnit {
  currentRage: number;
  maxRage: number;
  activeBuffs: BuffInstance[];
}

// 常量
const RAGE_ATK_GAIN = 200;  // 普攻回怒
const RAGE_HIT_CAP = 500;   // 单次受击最大回怒
const RAGE_MAX = 1000;      // 怒气上限
const RAGE_SKILL_COST = 1000; // 释放技能消耗

// ==========================================
// 核心逻辑 (Core Logic)
// ==========================================

export class SkillTriggerSystem {
  private skillConfigs: Map<string, SkillConfig> = new Map();
  private buffIdCounter = 0;

  constructor(configs?: SkillConfig[]) {
    if (configs) {
      for (const c of configs) {
        this.skillConfigs.set(c.skillId, c);
      }
    }
  }

  // ---------- Public API ----------

  registerSkill(config: SkillConfig): void {
    this.skillConfigs.set(config.skillId, config);
  }

  /**
   * 将普通 CombatUnit 扩展为 CombatUnitExtended
   */
  extendUnit(unit: CombatUnit): CombatUnitExtended {
    return {
      ...unit,
      currentRage: 0,
      maxRage: RAGE_MAX,
      activeBuffs: [],
    };
  }

  // ---------- 4.1 怒气系统 ----------

  /**
   * 受击回怒
   * Rage_hit = min(500, floor(DamageTaken / MaxHp × 1000))
   */
  calculateRageOnHit(damageTaken: number, maxHp: number): number {
    return Math.min(RAGE_HIT_CAP, Math.floor((damageTaken / maxHp) * 1000));
  }

  /**
   * 增加怒气 (溢出处理)
   * CurrentRage = min(MaxRage, CurrentRage + Rage_add)
   */
  addRage(unit: CombatUnitExtended, amount: number): void {
    unit.currentRage = Math.min(unit.maxRage, unit.currentRage + amount);
  }

  // ---------- 4.2 回合生命周期 ----------

  /**
   * Phase A: 回合开始
   * 处理 DOT/HOT/STUN
   * @returns true 如果被眩晕跳过回合
   */
  processStartOfTurn(unit: CombatUnitExtended): boolean {
    // 检查眩晕
    const stun = unit.activeBuffs.find((b) => b.type === BuffType.STUN);
    if (stun) return true; // 跳过回合

    // 处理 DOT (燃烧)
    for (const buff of unit.activeBuffs) {
      if (buff.type === BuffType.DOT_BURN) {
        unit.currentHp = Math.max(0, unit.currentHp - buff.value);
        if (unit.currentHp <= 0) unit.isDead = true;
      }
      if (buff.type === BuffType.HOT_HEAL) {
        unit.currentHp = Math.min(unit.maxHp, unit.currentHp + buff.value);
      }
    }

    return false;
  }

  /**
   * Phase B: 行动判定
   * 怒气满则释放技能，否则普攻
   */
  processActionPhase(
    attacker: CombatUnitExtended,
    enemies: CombatUnitExtended[],
    allies: CombatUnitExtended[],
  ): DamageEventLog[] {
    const logs: DamageEventLog[] = [];

    if (attacker.currentRage >= RAGE_SKILL_COST) {
      // 释放技能
      attacker.currentRage -= RAGE_SKILL_COST;
      const skillLogs = this.executeSkill(attacker, enemies, allies);
      logs.push(...skillLogs);
    } else {
      // 普通攻击
      const target = this.findTarget(enemies);
      if (target) {
        const atk = this.getCombatAttack(attacker);
        const log = CombatEngine.calculateFinalDamage(
          { ...attacker, attack: atk },
          target,
        );
        logs.push(log);

        // 普攻回怒
        this.addRage(attacker, RAGE_ATK_GAIN);
        // 受击回怒
        if (!target.isDead) {
          this.addRage(target, this.calculateRageOnHit(log.damageAmount, target.maxHp));
        }
      }
    }

    return logs;
  }

  /**
   * Phase C: 回合结束
   * Buff 持续时间递减，移除过期 Buff
   */
  processEndOfTurn(unit: CombatUnitExtended): BuffInstance[] {
    const removed: BuffInstance[] = [];

    for (let i = unit.activeBuffs.length - 1; i >= 0; i--) {
      unit.activeBuffs[i].durationTurns--;
      if (unit.activeBuffs[i].durationTurns <= 0) {
        removed.push(unit.activeBuffs.splice(i, 1)[0]);
      }
    }

    return removed;
  }

  // ---------- 4.3 技能释放 ----------

  /**
   * 执行技能释放
   */
  executeSkill(
    caster: CombatUnitExtended,
    enemies: CombatUnitExtended[],
    allies: CombatUnitExtended[],
  ): DamageEventLog[] {
    // FIXME: 实际应从英雄配置获取 skillId，此处用 mock
    const skillId = 'DEFAULT_SKILL';
    const config = this.skillConfigs.get(skillId);

    if (!config) {
      // 无技能配置，执行普攻
      const target = this.findTarget(enemies);
      if (target) {
        return [CombatEngine.calculateFinalDamage(caster, target)];
      }
      return [];
    }

    // 根据目标逻辑选择目标
    const targets = this.selectTargets(config.targetLogic, caster, enemies, allies);
    const logs: DamageEventLog[] = [];

    for (const target of targets) {
      if (target.isDead) continue;

      // 动态属性结算 (叠加Buff)
      const atk = this.getCombatAttack(caster);
      const def = this.getCombatDefense(target);

      // 技能伤害
      const D_base =
        (atk * config.damageMultiplier) * (1 - CombatEngine.calculateMitigation(def));

      // 使用引擎计算最终伤害（含克制和暴击）
      const log = CombatEngine.calculateFinalDamage(
        { ...caster, attack: atk },
        { ...target, defense: def },
        config.damageMultiplier,
        true,
      );
      logs.push(log);

      // 受击回怒
      if (!target.isDead) {
        this.addRage(target, this.calculateRageOnHit(log.damageAmount, target.maxHp));
      }

      // 4.4 Buff 附加判定
      if (config.applyBuffs) {
        for (const buffConfig of config.applyBuffs) {
          const R_buff = Math.random();
          if (R_buff <= buffConfig.probability) {
            this.applyBuff(target, {
              buffId: `BUFF_${++this.buffIdCounter}`,
              type: buffConfig.type,
              value: buffConfig.value,
              durationTurns: buffConfig.duration,
              sourceUnitId: caster.unitId,
            });
          }
        }
      }
    }

    return logs;
  }

  // ---------- 4.4 Buff 附加 ----------

  /**
   * 附加 Buff (刷新机制：同类型同来源则刷新持续时间)
   */
  applyBuff(target: CombatUnitExtended, buff: BuffInstance): void {
    const existing = target.activeBuffs.find(
      (b) => b.type === buff.type && b.sourceUnitId === buff.sourceUnitId,
    );

    if (existing) {
      // 刷新持续时间
      existing.durationTurns = buff.durationTurns;
      existing.value = buff.value;
    } else {
      target.activeBuffs.push({ ...buff });
    }
  }

  removeBuff(target: CombatUnitExtended, buffId: string): boolean {
    const idx = target.activeBuffs.findIndex((b) => b.buffId === buffId);
    if (idx === -1) return false;
    target.activeBuffs.splice(idx, 1);
    return true;
  }

  // ---------- 辅助方法 ----------

  /**
   * 叠加 Buff 后的实时攻击力
   * A_combat = A_base × (1 + Σ V_buff)
   */
  private getCombatAttack(unit: CombatUnitExtended): number {
    let sumBuff = 0;
    for (const buff of unit.activeBuffs) {
      if (buff.type === BuffType.ATK_UP) {
        sumBuff += buff.value;
      }
    }
    return unit.attack * (1 + sumBuff);
  }

  /**
   * 叠加 Buff 后的实时防御力
   */
  private getCombatDefense(unit: CombatUnitExtended): number {
    let sumBuff = 0;
    for (const buff of unit.activeBuffs) {
      if (buff.type === BuffType.DEF_DOWN) {
        sumBuff -= buff.value;
      }
    }
    return unit.defense * (1 + sumBuff);
  }

  private selectTargets(
    logic: SkillTargetLogic,
    caster: CombatUnitExtended,
    enemies: CombatUnitExtended[],
    allies: CombatUnitExtended[],
  ): CombatUnitExtended[] {
    const aliveEnemies = enemies.filter((e) => !e.isDead);
    const aliveAllies = allies.filter((a) => !a.isDead);

    switch (logic) {
      case SkillTargetLogic.SELF:
        return [caster];

      case SkillTargetLogic.ENEMY_ALL:
        return aliveEnemies;

      case SkillTargetLogic.ENEMY_LOWEST_HP:
        if (aliveEnemies.length === 0) return [];
        return [aliveEnemies.reduce((min, e) => (e.currentHp < min.currentHp ? e : min))];

      case SkillTargetLogic.ALLY_LOWEST_HP:
        if (aliveAllies.length === 0) return [];
        return [aliveAllies.reduce((min, a) => (a.currentHp < min.currentHp ? a : min))];

      case SkillTargetLogic.ENEMY_FRONT_ROW:
        // 简化：取前2个
        return aliveEnemies.slice(0, 2);

      case SkillTargetLogic.ENEMY_BACK_ROW:
        // 简化：取后2个
        return aliveEnemies.slice(-2);

      default:
        return aliveEnemies.length > 0 ? [aliveEnemies[0]] : [];
    }
  }

  private findTarget(team: CombatUnitExtended[]): CombatUnitExtended | null {
    return team.find((u) => !u.isDead) ?? null;
  }
}
