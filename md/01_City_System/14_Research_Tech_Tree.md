# 14_Research_Tech_Tree.md — 科技树与研究系统

## 1. 模块目标
为基地增加"研究工坊"建筑和科技树，玩家消耗资源解锁被动增益、新建筑、高级配方，提升长期目标感和策略深度。

## 2. 依赖项
- `game-constants.js`: 新增 `BuildingType.WORKSHOP`、`TECH_CONFIGS`
- `game-buildings.js`: 工坊建筑定义
- `game-wallet.js`: 研究费用扣除
- `game-loop.js`: Phase 3 中增加研究 tick

## 3. 数据结构

```javascript
// 科技节点配置
{
  id: 'TECH_EFFICIENT_LUMBER',
  name: '高效伐木',
  description: '伐木场产量 +30%',
  category: 'PRODUCTION',
  cost: { RES_WOOD: 200, RES_GEM: 5 },
  durationMs: 60000,        // 研究耗时
  prerequisites: [],        // 前置科技 ID 列表
  effect: { type: 'BUILDING_OUTPUT_MULT', target: 'BLD_LUMBER_CAMP', value: 0.3 },
  unlockBuilding: null,     // 解锁的建筑类型
}

// 科技状态
TECH_LOCKED   // 前置未满足
TECH_AVAILABLE // 可研究
TECH_RESEARCHING // 研究中
TECH_DONE     // 已完成
```

## 4. 科技树配置

### 生产类
| ID | 名称 | 费用 | 耗时 | 前置 | 效果 |
|---|---|---|---|---|---|
| TECH_EFFICIENT_LUMBER | 高效伐木 | 200木+5钻 | 60s | 无 | 伐木+30% |
| TECH_DEEP_MINING | 深层开采 | 300煤+8钻 | 90s | 无 | 煤矿+30% |
| TECH_EFFICIENT_HUNT | 精准狩猎 | 150肉+100木+5钻 | 60s | 无 | 狩猎+30% |

### 解锁类
| ID | 名称 | 费用 | 耗时 | 前置 | 效果 |
|---|---|---|---|---|---|
| TECH_WORKSHOP | 研究工坊 | 300木+200煤 | 30s | 无 | 解锁工坊建筑 |
| TECH_ADVANCED_COOK | 高级烹饪 | 200食+10钻 | 90s | TECH_WORKSHOP | 厨房效率+50% |

### 生存类
| ID | 名称 | 费用 | 耗时 | 前置 | 效果 |
|---|---|---|---|---|---|
| TECH_INSULATION | 保暖技术 | 400木+100煤 | 60s | 无 | 工人低温掉血-20% |
| TECH_HERBAL_MEDICINE | 草药学 | 200肉+15钻 | 90s | TECH_INSULATION | 医疗站治愈速度+50% |

## 5. 核心逻辑

### 研究流程
1. 工坊建筑已建造且有工人分配
2. 玩家选择一个 `AVAILABLE` 科技
3. 扣除资源，状态变为 `RESEARCHING`
4. 每 tick 推进进度，完成后状态变 `DONE`
5. 立即应用效果（乘法加成或建筑解锁）

### 前置检查
```
isAvailable(tech):
  if tech.state != LOCKED: return false
  for pre in tech.prerequisites:
    if get(pre).state != DONE: return false
  return true
```

### 效果应用
- `BUILDING_OUTPUT_MULT`: 在 `getBuildingOutput` 中乘以 `(1 + totalMult)`
- `UNLOCK_BUILDING`: 将目标建筑 `state` 从 LOCKED 设为 NORMAL
- `WORKER_BUFF`: 修改 `GAME_CONSTANTS` 中的衰减系数

## 6. 事件总线接口
- `EVT_RESEARCH_START { techId }` — 研究开始
- `EVT_RESEARCH_COMPLETE { techId, effect }` — 研究完成
- `EVT_TECH_STATE_CHANGE { techId, newState }` — 科技状态变更
