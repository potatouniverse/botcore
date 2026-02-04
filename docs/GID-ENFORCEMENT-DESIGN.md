# GID Enforcement Design

## Problem

**现状：** 即使 TOOLS.md 明确要求 "ALWAYS use GID workflow before coding"，bot（和人）还是会忘记。

**后果：**
- Graph 过时，失去价值
- 任务状态不准确
- 依赖关系不清晰
- 无法追踪进度

**根本原因：**
1. GID check 不是强制的（只是文档规定）
2. 没有技术手段阻止违规
3. 事后才发现忘记了

---

## Solution: Multi-Layer Enforcement

### Layer 1: Pre-Coding Guard (Pre-flight Check)

**Concept:** 拦截编码操作，强制先 GID check

**Implementation:**

```typescript
// src/tools/gid-guard.ts
export class GidGuard {
  private lastGidCheckTime: number = 0;
  private lastGidCheckProject: string | null = null;
  
  /**
   * Check if GID tasks were consulted recently for this project
   */
  shouldBlockCoding(workingDir: string): boolean {
    const now = Date.now();
    const timeSinceCheck = now - this.lastGidCheckTime;
    const projectChanged = this.lastGidCheckProject !== workingDir;
    
    // Require GID check if:
    // 1. Never checked this session
    // 2. >30 minutes since last check
    // 3. Changed to different project
    return (
      this.lastGidCheckTime === 0 ||
      timeSinceCheck > 30 * 60 * 1000 ||
      projectChanged
    );
  }
  
  /**
   * Mark that GID was consulted
   */
  recordGidCheck(workingDir: string) {
    this.lastGidCheckTime = Date.now();
    this.lastGidCheckProject = workingDir;
  }
  
  /**
   * Intercept file edit operations
   */
  async beforeFileEdit(filePath: string): Promise<void> {
    const workingDir = getProjectRoot(filePath);
    
    if (this.shouldBlockCoding(workingDir)) {
      const graphPath = path.join(workingDir, '.gid/graph.yml');
      
      if (fs.existsSync(graphPath)) {
        throw new GidCheckRequiredError(
          `⚠️  GID check required before coding!\n\n` +
          `Run: mcporter call gid.gid_tasks graphPath=${graphPath}\n` +
          `Then mark tasks done after work.\n\n` +
          `To bypass (not recommended): Set GID_GUARD=off`
        );
      }
    }
  }
}
```

**Integration Points:**

```typescript
// In file write/edit operations
async function editFile(path: string, content: string) {
  if (process.env.GID_GUARD !== 'off') {
    await gidGuard.beforeFileEdit(path);
  }
  // ... proceed with edit
}

// In exec operations (git commit, npm install, etc.)
async function execCommand(cmd: string, cwd: string) {
  if (isCodingOperation(cmd) && process.env.GID_GUARD !== 'off') {
    await gidGuard.beforeCoding(cwd);
  }
  // ... proceed with exec
}
```

**Coding operations detected:**
- File edits in `src/`, `tests/`, `migrations/`
- `git commit`
- `npm run build`
- `npm test`

---

### Layer 2: Context Auto-Injection

**Concept:** 自动在每个 coding session 开始时注入 GID 任务列表

**Implementation:**

```typescript
// src/core/context-manager.ts
export class ContextManager {
  async buildContextForCodingSession(workingDir: string): Promise<string> {
    const graphPath = path.join(workingDir, '.gid/graph.yml');
    
    if (!fs.existsSync(graphPath)) {
      return ''; // No GID graph, skip
    }
    
    // Auto-fetch tasks
    const tasks = await mcpCall('gid.gid_tasks', { graphPath });
    
    return `
# Current Project Tasks (from GID)

${tasks}

**REMINDER:** Mark tasks done after completing work:
mcporter call gid.gid_task_update graphPath=${graphPath} node=... task="..." done=true
`;
  }
}
```

**Auto-injected into:**
1. Session start message
2. After every `cd` to project directory
3. Heartbeat reminders

---

### Layer 3: Post-Commit Validation

**Concept:** Git pre-commit hook 检查 graph 是否有更新

**Implementation:**

```bash
# .git/hooks/pre-commit (auto-installed by botcore)
#!/bin/bash

# Check if .gid/graph.yml exists
if [ ! -f .gid/graph.yml ]; then
  exit 0  # No GID, skip
fi

# Get files being committed
CHANGED_FILES=$(git diff --cached --name-only)

# Check if any code files changed
CODE_CHANGED=$(echo "$CHANGED_FILES" | grep -E '^(src/|tests/|migrations/)')

if [ -n "$CODE_CHANGED" ]; then
  # Code changed, check if graph also changed
  GRAPH_CHANGED=$(echo "$CHANGED_FILES" | grep '.gid/graph.yml')
  
  if [ -z "$GRAPH_CHANGED" ]; then
    echo "❌ Error: Code changed but .gid/graph.yml not updated!"
    echo ""
    echo "Did you forget to update GID tasks?"
    echo "Run: mcporter call gid.gid_tasks"
    echo ""
    echo "To bypass (not recommended): git commit --no-verify"
    exit 1
  fi
fi

exit 0
```

**Auto-install hook:**

```typescript
// src/tools/gid-setup.ts
export async function installGidHooks(projectRoot: string) {
  const hookPath = path.join(projectRoot, '.git/hooks/pre-commit');
  const hookScript = generatePreCommitHook();
  
  fs.writeFileSync(hookPath, hookScript, { mode: 0o755 });
  console.log('✅ GID pre-commit hook installed');
}
```

---

### Layer 4: Memory Reinforcement

**Concept:** 使用 Engram 记忆系统强化 GID workflow

**Implementation:**

```typescript
// After each GID violation
await memory.store(
  `GID workflow violation detected. Forgot to check tasks before coding.`,
  { type: 'episodic', importance: 0.9 }
);

// Before coding session
const lessons = await memory.recall('GID workflow', { limit: 3 });
if (lessons.length > 0) {
  console.log('💡 Reminder:', lessons[0].content);
}
```

**Reinforcement triggers:**
- When `GidCheckRequiredError` is thrown
- When pre-commit hook blocks commit
- Daily consolidation highlights violations

---

### Layer 5: CLI Assistant Mode

**Concept:** Interactive prompt 强制确认

**Implementation:**

```typescript
// When GID guard blocks operation
async function promptGidCheck(graphPath: string): Promise<void> {
  console.log('📋 GID tasks for this project:\n');
  
  const tasks = await mcpCall('gid.gid_tasks', { graphPath });
  console.log(tasks);
  
  console.log('\n❓ Have you reviewed the task list? (y/n)');
  
  const answer = await readUserInput();
  
  if (answer.toLowerCase() === 'y') {
    gidGuard.recordGidCheck(path.dirname(graphPath));
  } else {
    throw new Error('Please review GID tasks before proceeding');
  }
}
```

---

## Configuration

### Environment Variables

```bash
# Enforcement level
GID_GUARD=strict    # Block coding without GID check (default)
GID_GUARD=warn      # Warn but allow
GID_GUARD=off       # Disable (not recommended)

# Auto-inject tasks in context
GID_AUTO_INJECT=true  # Default

# Pre-commit hook
GID_HOOK=true  # Default
```

### Per-Project Config

```yaml
# .gid/config.yml
enforcement:
  guard: strict
  auto_inject: true
  pre_commit_hook: true
  check_interval_minutes: 30
```

---

## Rollout Plan

### Phase 1: Soft Enforcement (Warnings)
- Enable `GID_GUARD=warn` by default
- Log violations to console
- Track metrics: how often violated?

### Phase 2: Context Injection
- Auto-inject tasks at session start
- Heartbeat reminders every 30 min

### Phase 3: Pre-Commit Hooks
- Auto-install git hooks
- Block commits without graph update

### Phase 4: Hard Enforcement
- Enable `GID_GUARD=strict` by default
- Require GID check before file edits

### Phase 5: Memory-Based Learning
- Use Engram to learn violation patterns
- Proactive reminders based on past behavior

---

## Success Metrics

**Goal:** 100% compliance with GID workflow

**Track:**
- % of coding sessions with GID check
- % of commits with graph updates
- Time-to-first-GID-check (should be <1 min)
- Number of violations per week (should trend to 0)

---

## Alternative: Simpler "Nag Mode"

If full enforcement is too heavy, start with:

```typescript
// Simple nag reminder
setInterval(() => {
  if (hasRecentFileEdits() && !hasRecentGidCheck()) {
    console.log('\n💡 Reminder: Did you check GID tasks?\n');
  }
}, 15 * 60 * 1000); // Every 15 minutes
```

---

## Next Steps

1. ✅ Document this design
2. ⬜ Implement Layer 1 (Pre-flight Guard) in botcore
3. ⬜ Test with Clawd (me) for 1 week
4. ⬜ Enable Layer 2 (Context Injection)
5. ⬜ Add to botcore SDK as opt-in feature
6. ⬜ Write integration guide for other bots
7. ⬜ Collect metrics and iterate

---

## Open Questions

1. **Too strict?** Will constant blocking annoy users?
   - Solution: Configurable levels (strict/warn/off)

2. **False positives?** What if editing docs, not code?
   - Solution: Smarter detection (only block `src/`, `tests/`)

3. **Performance?** Will checks slow down operations?
   - Solution: Cache GID status, check max once per 30 min

4. **Adoption?** Will other bot devs enable it?
   - Solution: Make it easy (auto-setup), show value (metrics)
