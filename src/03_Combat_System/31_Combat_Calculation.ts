// ==========================================
// 31_Combat_Calculation.ts
// 回合制自动战斗：护甲衰减模型、伤害计算与兵种克制
// ==========================================

import { HeroClass } from '../00_Core/00_Global_Enums';
import { SquadData, HeroInstanceData } from './30_Hero_Entity';

// ==========================================
// 数据结构 (Data Schemas)
// ==========================================

/** 战斗单元运行态数据 */
export interface CombatUnit {
  unitId: string;
  heroClass: HeroClass;

  // 战斗属性快照
  maxHp: number;
  attack: number;
  defense: number;
  critRate: number;
  critDamageModifier: number;

  // 动态状态
  currentHp: number;
  isDead: boolean;
}

/** 单次伤害结算日志 */
export interface DamageEventLog {
  attackerId: string;
  defenderId: string;
  damageAmount: number;
  isCrit: boolean;
  isCounter: boolean;
  isSkill: boolean;
  defenderRemainedHp: number;
}

/** 战斗结算报告 */
export interface BattleReport {
  isAttackerWin: boolean;
  totalTurns: number;
  survivorTroops: number;
  eventLogs: DamageEventLog[];
}

// 常量
const C_ARMOR = 1000;       // 护甲常数
const MIN_DAMAGE_RATIO = 0.05; // 最低伤害比例 (5%)
const MAX_TURNS = 100;      // 最大回合数

// ==========================================
// 兵种克制体系
// ==========================================

/**
 * 获取兵种克制系数
 * INFANTRY 克制 LANCER -> LANCER 克制 MARKSMAN -> MARKSMAN 克制 INFANTRY
 */
function getClassAdvantage(attacker: HeroClass, defender: HeroClass): { multiplier: number; isCounter: boolean } {
  if (attacker === defender) return { multiplier: 1.0, isCounter: false };

  const advantageMap: Record<HeroClass, HeroClass> = {
    [HeroClass.INFANTRY]: HeroClass.LANCER,   // 步兵克制枪兵
    [HeroClass.LANCER]: HeroClass.MARKSMAN,   // 枪兵克制射手
    [HeroClass.MARKSMAN]: HeroClass.INFANTRY, // 射手克制步兵
  };

  if (advantageMap[attacker] === defender) {
    return { multiplier: 1.2, isCounter: true }; // 克制 +20%
  }

  return { multiplier: 0.8, isCounter: false }; // 被克制 -20%
}

// ==========================================
// 核心逻辑 (Core Logic)
// ==========================================

export class CombatEngine {
  // ---------- 4.2 基础伤害计算公式 ----------

  /**
   * 防御减伤率
   * R_mitigation = Def / (Def + C_armor)
   */
  static calculateMitigation(defense: number): number {
    return defense / (defense + C_ARMOR);
  }

  /**
   * 基础伤害
   * D_base = Atk × (1 - R_mitigation)
   * 最低保底: Atk × 0.05
   */
  static calculateBaseDamage(attack: number, defense: number): number {
    const mitigation = this.calculateMitigation(defense);
    const damage = attack * (1 - mitigation);
    const minDamage = attack * MIN_DAMAGE_RATIO;
    return Math.max(damage, minDamage);
  }

  // ---------- 4.3 暴击与最终伤害结算 ----------

  /**
   * 最终伤害计算
   * D_final = floor(D_base × M_class × M_crit)
   */
  static calculateFinalDamage(
    attacker: CombatUnit,
    defender: CombatUnit,
    damageMultiplier: number = 1.0,
    isSkill: boolean = false,
  ): DamageEventLog {
    // 基础伤害
    const D_base = this.calculateBaseDamage(attacker.attack, defender.defense) * damageMultiplier;

    // 兵种克制
    const { multiplier: M_class, isCounter } = getClassAdvantage(attacker.heroClass, defender.heroClass);

    // 暴击判定
    const R_crit = Math.random();
    const isCrit = R_crit <= attacker.critRate;
    const M_crit = isCrit ? attacker.critDamageModifier : 1.0;

    // 最终伤害
    const D_final = Math.floor(D_base * M_class * M_crit);

    // 扣血
    defender.currentHp = Math.max(0, defender.currentHp - D_final);
    if (defender.currentHp <= 0) {
      defender.isDead = true;
    }

    return {
      attackerId: attacker.unitId,
      defenderId: defender.unitId,
      damageAmount: D_final,
      isCrit,
      isCounter,
      isSkill,
      defenderRemainedHp: defender.currentHp,
    };
  }

  // ---------- 4.4 战斗主循环 ----------

  /**
   * 执行战斗沙盒运算
   * @param attackerHeroes 攻方英雄数据列表
   * @param defenderHeroes 守方英雄数据列表
   * @param attackerTroops 攻方兵力
   * @param defenderTroops 守方兵力
   * @returns BattleReport
   */
  static executeBattle(
    attackerHeroes: HeroInstanceData[],
    defenderHeroes: HeroInstanceData[],
    attackerTroops: number,
    defenderTroops: number,
  ): BattleReport {
    // 初始化战斗单元
    const teamA = attackerHeroes.map((h) => this.createCombatUnit(h, attackerTroops));
    const teamB = defenderHeroes.map((h) => this.createCombatUnit(h, defenderTroops));

    const eventLogs: DamageEventLog[] = [];
    let turn = 0;

    // 顺序回合制: A1 -> B1 -> A2 -> B2 -> ...
    while (turn < MAX_TURNS) {
      turn++;

      // 交替出手
      const maxLen = Math.max(teamA.length, teamB.length);
      for (let i = 0; i < maxLen; i++) {
        // A队攻击
        if (i < teamA.length && !teamA[i].isDead) {
          const target = this.findTarget(teamB);
          if (target) {
            const log = this.calculateFinalDamage(teamA[i], target);
            eventLogs.push(log);
            if (this.isTeamDead(teamB)) {
              return this.buildReport(true, turn, teamA, eventLogs);
            }
          }
        }

        // B队攻击
        if (i < teamB.length && !teamB[i].isDead) {
          const target = this.findTarget(teamA);
          if (target) {
            const log = this.calculateFinalDamage(teamB[i], target);
            eventLogs.push(log);
            if (this.isTeamDead(teamA)) {
              return this.buildReport(false, turn, teamB, eventLogs);
            }
          }
        }
      }
    }

    // 超过最大回合，防守方胜利
    return this.buildReport(false, turn, teamB, eventLogs);
  }

  // ---------- 4.5 伤兵结算 ----------

  /**
   * 计算胜利方存活兵力比例
   * P_survive = Σ CurrentHp / Σ MaxHp
   */
  static calculateSurvivorRatio(team: CombatUnit[]): number {
    let totalCurrentHp = 0;
    let totalMaxHp = 0;
    for (const unit of team) {
      totalCurrentHp += unit.currentHp;
      totalMaxHp += unit.maxHp;
    }
    return totalMaxHp > 0 ? totalCurrentHp / totalMaxHp : 0;
  }

  // ---------- 内部辅助 ----------

  private static createCombatUnit(hero: HeroInstanceData, troopCount: number): CombatUnit {
    // 简化：士兵HP叠加到英雄HP上
    const soldierHpBonus = troopCount * 10;
    const soldierAtkBonus = troopCount * 1;
    const soldierDefBonus = troopCount * 0.5;

    // FIXME: heroClass 需要从 HeroBaseConfig 获取，此处用 mock
    return {
      unitId: hero.instanceId,
      heroClass: HeroClass.INFANTRY, // FIXME: import from config later
      maxHp: hero.finalHp + soldierHpBonus,
      attack: hero.finalAttack + soldierAtkBonus,
      defense: hero.finalDefense + soldierDefBonus,
      critRate: 0.15,
      critDamageModifier: 1.5,
      currentHp: hero.finalHp + soldierHpBonus,
      isDead: false,
    };
  }

  private static findTarget(team: CombatUnit[]): CombatUnit | null {
    // 优先攻击存活的序号靠前的单位
    return team.find((u) => !u.isDead) ?? null;
  }

  private static isTeamDead(team: CombatUnit[]): boolean {
    return team.every((u) => u.isDead);
  }

  private static buildReport(
    isAttackerWin: boolean,
    totalTurns: number,
    winnerTeam: CombatUnit[],
    eventLogs: DamageEventLog[],
  ): BattleReport {
    return {
      isAttackerWin,
      totalTurns,
      survivorTroops: this.calculateSurvivorRatio(winnerTeam),
      eventLogs,
    };
  }
}
