# 52_Achievement_System.md — 成就系统

## 1. 模块目标
为游戏添加成就系统，玩家达成特定里程碑后获得奖励（资源、钻石），增强长期目标感和成就感。

## 2. 依赖项
- `game-constants.js`: 新增 `ACHIEVEMENT_CONFIGS`
- `game-wallet.js`: 发放奖励
- `game-loop.js`: 每 tick 检查成就条件

## 3. 成就配置

| ID | 名称 | 条件 | 奖励 |
|---|---|---|---|
| ACH_FIRST_BUILD | 基地初成 | 建造任意建筑 | 50 木 |
| ACH_ALL_BUILDINGS | 百废待兴 | 解锁所有建筑 | 10 钻 |
| ACH_POPULATION_10 | 人丁兴旺 | 幸存者达到 10 人 | 100 肉 |
| ACH_RESEARCH_5 | 学者 | 完成 5 项科技 | 20 钻 |
| ACH_TRADE_10 | 商业大亨 | 完成 10 次交易 | 50 铁 |
| ACH_SURVIVE_BLIZZARD | 风雪无阻 | 存活过一场暴风雪 | 200 煤 |
| ACH_DAY_10 | 十日求生 | 存活 10 天 | 500 木 |
| ACH_ALL_RESEARCH | 全知全能 | 完成所有科技 | 50 钻 |

## 4. 核心逻辑
- 每 tick 遍历未完成成就，检查条件
- 条件满足后标记为 DONE，发放奖励到钱包
- 事件总线广播 `EVT_ACHIEVEMENT_UNLOCK`
- 序列化/反序列化支持存档
