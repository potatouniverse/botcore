# BotCore Agents Module - Implementation Plan

## 目标
将 AGENTS.md, TOOLS.md, HEARTBEAT.md, BOOTSTRAP.md 加入 BotCore，标准化 bot 的操作配置。

---

## Phase 1: 标准化格式（1-2 天）

### 任务：定义文件规范

**1.1 研究现有实现**
```bash
# 分析 Clawd 当前的文件
- AGENTS.md (535 lines) - 工作流、规则、文件系统规范
- TOOLS.md (104 lines) - 本地工具配置
- HEARTBEAT.md (23 lines) - 心跳检查清单
- BOOTSTRAP.md (55 lines) - 初始化脚本
```

**1.2 提取核心结构**

创建 4 个规范文件：
- `docs/spec/AGENTS-SPEC.md` - AGENTS.md 标准格式
- `docs/spec/TOOLS-SPEC.md` - TOOLS.md 标准格式
- `docs/spec/HEARTBEAT-SPEC.md` - HEARTBEAT.md 标准格式
- `docs/spec/BOOTSTRAP-SPEC.md` - BOOTSTRAP.md 标准格式

**关键问题：**
- 哪些部分是**必需**的？哪些是**可选**的？
- 如何区分**通用规则**（所有 bot 共享）vs **个性化规则**（特定 bot）？
- TOOLS.md 应该如何处理**环境特定**配置（不应导出）？

**交付物：**
```
docs/spec/
├── AGENTS-SPEC.md      # Section headings, required fields, examples
├── TOOLS-SPEC.md       # Tool categories, config format
├── HEARTBEAT-SPEC.md   # Check format, scheduling hints
└── BOOTSTRAP-SPEC.md   # Conversation flow, step format
```

---

## Phase 2: 解析器实现（2-3 天）

### 任务：实现 `src/core/agents.ts`

**2.1 类型定义**
```typescript
export interface AgentsData {
  // AGENTS.md
  rules?: AgentsRules;
  workflow?: AgentsWorkflow;
  memory?: MemoryConfig;
  safety?: string[];
  
  // TOOLS.md
  tools?: ToolsConfig;
  
  // HEARTBEAT.md
  heartbeat?: HeartbeatConfig;
  
  // BOOTSTRAP.md
  bootstrap?: BootstrapScript;
}

export interface AgentsRules {
  corePrinciples?: string[];
  toolCallStyle?: 'narrate' | 'silent' | 'auto';
  responseRules?: string[];
}

export interface AgentsWorkflow {
  onSessionStart?: string[];  // Steps to run every session
  onHeartbeat?: string[];     // Steps to run on heartbeat
  memoryMaintenance?: string[];
}

export interface MemoryConfig {
  dailyLogs?: { path: string; format: string };
  longTerm?: { path: string; type: 'file' | 'engram' | 'hybrid' };
  selfGraph?: { path: string };
}

export interface ToolsConfig {
  mcp?: Record<string, MCPToolConfig>;
  local?: Record<string, LocalToolConfig>;
  environment?: Record<string, string>;
}

export interface HeartbeatConfig {
  checks?: HeartbeatCheck[];
  schedule?: string;  // e.g., "every 30 minutes"
}

export interface HeartbeatCheck {
  name: string;
  command?: string;
  frequency?: string;  // e.g., "2-4 times daily"
  condition?: string;  // e.g., "not between 23:00-08:00"
}

export interface BootstrapScript {
  steps?: BootstrapStep[];
  onComplete?: string[];  // Actions to take after bootstrap
}

export interface BootstrapStep {
  type: 'ask' | 'explain' | 'update' | 'delete';
  content: string;
  target?: string;  // File to update/delete
}
```

**2.2 解析器函数**
```typescript
export function parseAgents(content: string): AgentsRules & AgentsWorkflow;
export function parseTools(content: string): ToolsConfig;
export function parseHeartbeat(content: string): HeartbeatConfig;
export function parseBootstrap(content: string): BootstrapScript;
```

**2.3 Agents 类**
```typescript
export class Agents {
  private basePath: string;
  private data: AgentsData = {};
  
  constructor(basePath: string) {
    this.basePath = basePath;
  }
  
  async load(): Promise<AgentsData> {
    // Load AGENTS.md
    // Load TOOLS.md
    // Load HEARTBEAT.md
    // Load BOOTSTRAP.md
    return this.data;
  }
  
  async save(options?: { preserveRaw?: boolean }): Promise<void> {
    // Save all 4 files
  }
  
  // Accessors
  getRules(): AgentsRules | undefined { ... }
  getWorkflow(): AgentsWorkflow | undefined { ... }
  getTools(): ToolsConfig | undefined { ... }
  getHeartbeat(): HeartbeatConfig | undefined { ... }
  getBootstrap(): BootstrapScript | undefined { ... }
  
  // Validation
  validate(): ValidationResult { ... }
  
  // Export/Import
  toJSON(): AgentsData { ... }
  fromJSON(json: AgentsData): void { ... }
  
  static async load(basePath: string): Promise<Agents> { ... }
}
```

**交付物：**
```
src/core/
├── agents.ts           # Main Agents class
└── __tests__/
    └── agents.test.ts  # Parser + validation tests
```

---

## Phase 3: 集成到 Bot（1 天）

### 任务：更新 `src/core/bot.ts`

**3.1 加入 Agents 模块**
```typescript
import { Agents } from './agents';

export interface Bot {
  identity: Identity;
  memory: Memory;
  config: Config;
  gid: Gid;
  agents: Agents;  // 新增
  tools: { fs: FileSystemTools };
  workspace: string;
}

export async function createBot(options: CreateBotOptions): Promise<Bot> {
  // ... existing code ...
  
  // Load agents configuration
  const agents = new Agents(workspace);
  await agents.load();
  
  return {
    identity,
    memory,
    config,
    gid,
    agents,  // 新增
    tools: { fs },
    workspace,
  };
}
```

**3.2 执行 Session Workflow**

新增可选钩子：
```typescript
export interface CreateBotOptions {
  // ... existing ...
  
  /** Execute session start workflow from AGENTS.md */
  executeSessionWorkflow?: boolean;
  
  /** Execute heartbeat checks from HEARTBEAT.md */
  executeHeartbeat?: boolean;
}
```

**交付物：**
- Updated `bot.ts` with agents integration
- Session workflow executor (optional)

---

## Phase 4: Export/Import 支持（1 天）

### 任务：更新导出/导入逻辑

**4.1 Export 时处理 TOOLS.md**
```typescript
// TOOLS.md 是环境特定的 - 提供选项
export interface ExportOptions {
  includeTools?: boolean;  // default: false (不导出环境配置)
  includeSessions?: boolean;
  includeSecrets?: boolean;
}
```

**4.2 Import 时验证 Agents 配置**
```typescript
// Import 后验证所有配置文件
const validation = bot.agents.validate();
if (!validation.valid) {
  console.warn('Agents configuration has warnings:', validation.warnings);
}
```

**交付物：**
- Updated export/import logic
- Documentation on TOOLS.md portability

---

## Phase 5: Dogfooding - Clawd 实现（2-3 天）

### 任务：用 Clawd 测试完整流程

**5.1 迁移 Clawd 到 BotCore Agents**
```bash
# 在 Clawd workspace
cd /Users/potato/clawd

# 验证当前文件符合规范
botcore validate .

# 测试导出
botcore export . --output clawd-backup.tar.gz

# 测试导入到新位置
botcore import clawd-backup.tar.gz --dest /tmp/clawd-test
```

**5.2 测试 Session Workflow**
```typescript
// 在 Clawdbot 中使用 BotCore
import { createBot } from 'botcore';

const bot = await createBot({
  workspace: '/Users/potato/clawd',
  executeSessionWorkflow: true,  // 自动执行 AGENTS.md 启动流程
});

// 验证所有文件都被读取
console.log(bot.agents.getRules());
console.log(bot.agents.getWorkflow());
```

**5.3 收集反馈 + 迭代**
- Agents parser 是否正确解析了所有内容？
- Workflow 执行是否符合预期？
- TOOLS.md 的环境特定配置处理是否合理？

**交付物：**
- Working Clawd instance using BotCore Agents
- Bug fixes + refinements
- Real-world usage examples

---

## Phase 6: 文档 + CLI（1-2 天）

### 任务：完善用户体验

**6.1 文档**
```
docs/
├── AGENTS-MODULE.md        # Agents 模块使用指南
├── STANDARD-FILES.md       # 标准文件规范总览
└── examples/
    └── custom-bot/
        ├── AGENTS.md       # 示例 AGENTS.md
        ├── TOOLS.md
        ├── HEARTBEAT.md
        └── BOOTSTRAP.md
```

**6.2 CLI 命令**
```bash
# 初始化时创建标准文件
botcore init my-bot --template full
# 生成：SOUL.md, IDENTITY.md, USER.md, AGENTS.md, TOOLS.md, HEARTBEAT.md, BOOTSTRAP.md

# 验证配置
botcore validate ./my-bot
# 检查所有文件格式 + 给出建议

# 升级旧 bot
botcore migrate ./old-bot --from clawdbot --to botcore
# 自动转换 clawdbot workspace → BotCore 标准格式
```

**交付物：**
- Complete documentation
- CLI commands for init/validate/migrate
- Example bots

---

## 技术决策点

### Q1: AGENTS.md 应该多严格？
**Option A: 严格格式（YAML frontmatter + 固定 sections）**
- ✅ 易于解析
- ✅ 强制一致性
- ❌ 限制灵活性

**Option B: 松散格式（Markdown + 约定 headings）**
- ✅ 灵活性高
- ✅ 人类友好
- ❌ 解析复杂

**建议：Option B + Schema Validation**
- Markdown 格式（人类优先）
- 定义"推荐 sections"但不强制
- 提供 `validate()` 给出建议

---

### Q2: TOOLS.md 环境特定配置如何处理？
**Option A: 完全不导出 TOOLS.md**
- ✅ 简单
- ❌ 丢失所有工具配置

**Option B: 区分通用 vs 环境特定**
```markdown
## Tools (Portable - will be exported)
- engram: MCP server for memory
- gid: MCP server for task management

## Environment (Local - will NOT be exported)
- ENGRAM_DB_PATH: /Users/potato/clawd/engram.db
- PYTHONPATH: /Users/potato/clawd/agent-memory-prototype
```

**建议：Option B**
- 两个 section：Tools (portable) + Environment (local)
- Export 时只包含 Tools section
- Import 时提示用户配置 Environment

---

### Q3: Heartbeat 执行由谁负责？
**Option A: BotCore 自带 scheduler**
- ✅ 完整解决方案
- ❌ 增加复杂度（需要后台进程）

**Option B: 只提供配置，平台负责执行**
- ✅ 简单（BotCore 只管数据）
- ✅ 灵活（每个平台可以自己实现）
- ❌ 没有开箱即用的 heartbeat

**建议：Option B**
- BotCore 提供 `bot.agents.getHeartbeat()` 返回配置
- 平台（Clawdbot, BotCoreBot）负责 scheduling + execution
- 提供 helper: `await bot.agents.executeHeartbeatCheck('email')`

---

## 时间估算

| Phase | 任务 | 时间 |
|-------|------|------|
| 1 | 标准化格式 | 1-2 天 |
| 2 | 解析器实现 | 2-3 天 |
| 3 | 集成到 Bot | 1 天 |
| 4 | Export/Import | 1 天 |
| 5 | Dogfooding (Clawd) | 2-3 天 |
| 6 | 文档 + CLI | 1-2 天 |
| **总计** | | **8-12 天** |

---

## 成功标准

- ✅ Clawd 能用 BotCore Agents 模块完整运行
- ✅ Export Clawd → Import 到新位置 → 行为一致
- ✅ TOOLS.md 环境配置正确区分 portable vs local
- ✅ HEARTBEAT.md 被正确解析并能被平台执行
- ✅ BOOTSTRAP.md 能指导新 bot 完成初始化对话
- ✅ 文档完整，其他开发者能用 BotCore 创建自己的 bot

---

## 风险 + 缓解

**风险 1: 过度标准化 → 限制创新**
- **缓解：** 采用"推荐但不强制"的格式，validate() 只给警告不报错

**风险 2: Clawd 的 AGENTS.md 太特殊，难以泛化**
- **缓解：** Phase 1 先研究，提取**核心**部分标准化，**特殊**部分放入 sections

**风险 3: 各平台对 Heartbeat 的实现差异大**
- **缓解：** BotCore 只提供配置接口，不强制实现方式

---

## 下一步行动

1. **现在：讨论 Phase 1** - 你觉得这 4 个文件的标准格式应该包含哪些核心部分？
2. **明天：开始实现 Phase 1** - 创建 `docs/spec/` 规范文件
3. **本周：完成 Phase 2-3** - 解析器 + 集成
4. **下周：Dogfooding** - 用 Clawd 测试完整流程

---

**你觉得这个计划如何？有没有哪部分需要调整？**
