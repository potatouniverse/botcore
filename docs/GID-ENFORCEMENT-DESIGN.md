# GID Integration Design (Revised)

## Problem Statement

**Previous approach:** Rely on bot memory + reminders to "remember" to use GID workflow.

**Fundamental issue:** Even with memory/reminders, bots (and humans) will forget. This creates quality problems:
- Graphs become stale
- Task status inaccurate
- Dependencies unclear
- Progress untrackable

**Root cause:** GID is external to the development flow. It requires conscious effort to:
1. Remember to check tasks
2. Remember to update graph
3. Remember to mark tasks done

**Every step is a potential failure point.**

---

## Solution: Structural Integration

**New approach:** Make GID a first-class part of botcore SDK, not an optional external tool.

**Core principle:** Don't rely on memory — **write it into the code.**

Just like:
- Git doesn't rely on developers "remembering" to commit
- TypeScript doesn't rely on developers "remembering" to check types
- **Code itself enforces the workflow**

---

## Architecture

### Layer 1: Botcore SDK Built-in GID

**Make GID a core module, not an optional add-on.**

```typescript
// src/index.ts
export interface BotCore {
  identity: Identity;
  memory: Memory;
  config: Config;
  gid: Gid;  // ← Built-in, always available
}

export async function createBot(workspace: string): Promise<BotCore> {
  const gid = await loadGid(workspace);  // Auto-load if .gid/ exists
  
  return {
    identity: await loadIdentity(workspace),
    memory: await loadMemory(workspace),
    config: await loadConfig(workspace),
    gid,  // Always available
  };
}
```

**Key features:**
- ✅ GID auto-loads on bot init
- ✅ No need to "remember" to load it
- ✅ Always available in bot.gid
- ✅ Gracefully handles projects without GID

---

### Layer 2: GID-Aware Tools

**All botcore tools automatically integrate with GID.**

#### File Edit Tool

```typescript
// src/tools/edit.ts
export class EditTool {
  constructor(private bot: BotCore) {}
  
  async execute(filePath: string, content: string): Promise<void> {
    // 1. Auto-inject GID context
    if (this.bot.gid.isActive) {
      const tasks = await this.bot.gid.getCurrentTasks();
      
      // Add to LLM context automatically
      this.bot.context.addSystemMessage(
        `Current GID tasks:\n${formatTasks(tasks)}\n` +
        `Active task: ${this.bot.gid.activeTask || 'none'}`
      );
    }
    
    // 2. Record activity
    await this.bot.gid.recordActivity({
      file: filePath,
      action: 'edit',
      timestamp: Date.now(),
    });
    
    // 3. Execute edit
    await fs.writeFile(filePath, content);
    
    // 4. Track pending updates
    if (isCodeFile(filePath)) {
      this.bot.gid.markPendingUpdate(filePath);
    }
  }
}
```

#### Git Commit Tool

```typescript
// src/tools/git.ts
export class GitTool {
  async commit(message: string): Promise<void> {
    // 1. Check if graph needs update
    const changedFiles = await git.diff(['--cached', '--name-only']);
    const hasCodeChanges = changedFiles.some(isCodeFile);
    
    if (hasCodeChanges && this.bot.gid.isActive) {
      const graphChanged = changedFiles.includes('.gid/graph.yml');
      
      if (!graphChanged) {
        // Soft reminder (not blocking)
        console.log('\n⚠️  Code changed but .gid/graph.yml not updated');
        console.log('💡 Consider updating task status\n');
        
        // Or strict mode (blocking)
        if (this.bot.config.gid.strict) {
          throw new Error('Graph must be updated when code changes');
        }
      }
    }
    
    // 2. Proceed with commit
    await git.commit(['-m', message]);
  }
}
```

---

### Layer 3: Workflow API (High-Level)

**Declarative task execution with automatic GID management.**

```typescript
// src/workflow/task-runner.ts
export class TaskRunner {
  /**
   * Run a task with automatic GID integration
   */
  async runTask(
    taskId: string,
    fn: (ctx: TaskContext) => Promise<void>
  ): Promise<void> {
    // 1. Load task from graph
    const task = await this.bot.gid.getTask(taskId);
    
    if (!task) {
      throw new Error(`Task ${taskId} not found in graph`);
    }
    
    // 2. Mark as active
    await this.bot.gid.setActiveTask(taskId);
    
    // 3. Create context with task info
    const ctx = new TaskContext(task, this.bot);
    
    // 4. Run user code
    // All operations in this scope auto-associate with task
    await fn(ctx);
    
    // 5. Auto-update graph
    await this.bot.gid.updateTask(taskId, {
      status: 'done',
      completedAt: new Date().toISOString(),
    });
    
    // 6. Auto-commit graph
    await this.bot.tools.git.add('.gid/graph.yml');
    await this.bot.tools.git.commit(`GID: Complete task ${taskId}`);
    
    // 7. Clear active task
    await this.bot.gid.setActiveTask(null);
  }
}

// Usage example
await bot.workflow.runTask('task-build-api', async (task) => {
  // All edits auto-associate with this task
  await task.edit('src/api.ts', apiCode);
  await task.commit('Add error handling');
  
  // Task auto-marked done on completion
});
```

---

### Layer 4: Context Auto-Injection

**GID tasks automatically appear in LLM context.**

```typescript
// src/core/context-manager.ts
export class ContextManager {
  async buildSystemContext(): Promise<string> {
    const parts = [];
    
    // ... identity, memory, etc.
    
    // Auto-inject GID tasks
    if (this.bot.gid.isActive) {
      const tasks = await this.bot.gid.getCurrentTasks();
      parts.push(
        `## Current Project Tasks (GID)\n\n` +
        formatTasks(tasks) +
        `\n**Active task:** ${this.bot.gid.activeTask || 'none'}\n`
      );
    }
    
    return parts.join('\n\n');
  }
}
```

**Result:** LLM always sees current tasks, no explicit loading needed.

---

## Implementation Details

### GID Module API

```typescript
// src/core/gid.ts
export class Gid {
  private graph: Graph | null = null;
  private activeTask: string | null = null;
  private activities: Activity[] = [];
  
  /**
   * Load graph from workspace
   */
  async load(workspace: string): Promise<void> {
    const graphPath = path.join(workspace, '.gid/graph.yml');
    
    if (fs.existsSync(graphPath)) {
      this.graph = await loadGraph(graphPath);
    }
  }
  
  /**
   * Check if GID is active for this project
   */
  get isActive(): boolean {
    return this.graph !== null;
  }
  
  /**
   * Get current tasks (from gid.gid_tasks)
   */
  async getCurrentTasks(): Promise<Task[]> {
    if (!this.isActive) return [];
    
    return await mcpCall('gid.gid_tasks', {
      graphPath: this.graph!.path,
    });
  }
  
  /**
   * Get specific task details
   */
  async getTask(taskId: string): Promise<Task | null> {
    if (!this.isActive) return null;
    
    return await mcpCall('gid.gid_read', {
      graphPath: this.graph!.path,
      node: taskId,
    });
  }
  
  /**
   * Record activity (for tracking)
   */
  async recordActivity(activity: Activity): Promise<void> {
    this.activities.push(activity);
  }
  
  /**
   * Mark task as done
   */
  async updateTask(taskId: string, updates: TaskUpdate): Promise<void> {
    await mcpCall('gid.gid_task_update', {
      graphPath: this.graph!.path,
      node: taskId,
      ...updates,
    });
  }
  
  /**
   * Set active task (for scoped operations)
   */
  async setActiveTask(taskId: string | null): Promise<void> {
    this.activeTask = taskId;
  }
  
  /**
   * Mark that graph needs update
   */
  markPendingUpdate(file: string): void {
    // Track files that triggered changes
    // Used by pre-commit hook
  }
}
```

---

## Configuration

### Per-Bot Config

```typescript
// config.yml
gid:
  enabled: true
  auto_inject_context: true
  strict_mode: false  # Block commits without graph update
  auto_load: true     # Auto-load on bot init
```

### Environment Variables

```bash
GID_STRICT=true   # Enforce graph updates
GID_AUTO=true     # Auto-load (default)
```

---

## Migration Path

### Phase 1: Core Integration (Week 1)
- ✅ Implement Gid module in botcore
- ✅ Auto-load in createBot()
- ✅ Add to BotCore interface

### Phase 2: Tool Integration (Week 2)
- ✅ EditTool GID-aware
- ✅ GitTool GID-aware
- ✅ Context auto-injection

### Phase 3: Workflow API (Week 3)
- ✅ TaskRunner implementation
- ✅ TaskContext helpers
- ✅ Documentation + examples

### Phase 4: Self-Dogfooding (Week 4)
- ✅ Migrate Clawd to use new API
- ✅ Test with real projects (suitedbot, botcore)
- ✅ Collect metrics

### Phase 5: Release (Week 5)
- ✅ Publish botcore v0.2.0
- ✅ Write migration guide
- ✅ Update templates

---

## Success Metrics

**Goal:** 100% GID compliance with zero conscious effort

**Track:**
- % of sessions with accurate GID context
- % of commits with graph updates
- Time from task start to graph update
- Developer satisfaction (friction vs. value)

**Expected results:**
- Week 1: 60% compliance (baseline with reminders)
- Week 2: 85% compliance (with auto-injection)
- Week 4: 95% compliance (with workflow API)
- Week 8: 100% compliance (fully automated)

---

## Why This Works

### Previous Approach (Memory-Based)
```
Bot session start
  ↓
See GID reminder ← Requires attention
  ↓
Remember to check tasks ← Can forget
  ↓
Remember to update graph ← Can forget
  ↓
Remember to commit graph ← Can forget
```
**4 failure points**

### New Approach (Code-Based)
```
Bot session start
  ↓
GID auto-loads ← Automatic
  ↓
Tasks in context ← Automatic
  ↓
Activity tracked ← Automatic
  ↓
Graph updated ← API handles it
```
**0 failure points**

---

## Comparison with Other Systems

### Git
- Doesn't rely on "remembering to version control"
- Commands like `git commit` enforce the workflow
- **GID should work the same way**

### TypeScript
- Doesn't rely on "remembering to check types"
- Compiler enforces it automatically
- **GID should work the same way**

### Pytest
- Doesn't rely on "remembering to test"
- CI/CD enforces it automatically
- **GID should work the same way**

---

## FAQ

### Q: What if a project doesn't have GID?
**A:** `bot.gid.isActive` returns false, all GID operations no-op gracefully.

### Q: Does this slow down operations?
**A:** Minimal overhead (<10ms per operation). GID loads once on init, then cached.

### Q: Can I still use GID manually?
**A:** Yes! You can call `mcporter call gid.*` directly. But the SDK makes it automatic.

### Q: What about existing bots?
**A:** Backward compatible. Old bots can still use manual GID workflow. New bots get automatic integration.

---

## Next Steps

1. ✅ Update design doc (this file)
2. ⬜ Update botcore graph (feat-gid-enforcement tasks)
3. ⬜ Implement Gid module (src/core/gid.ts)
4. ⬜ Integrate into createBot()
5. ⬜ Update EditTool, GitTool
6. ⬜ Test with Clawd
7. ⬜ Write migration guide
8. ⬜ Release botcore v0.2.0

---

## Appendix: Engram Considerations

**Q: Does Engram (memory system) need changes?**

**A: No.** Engram is a general-purpose memory system. It doesn't need to know about GID.

However:
- **Clawd's workflow** (AGENTS.md, HEARTBEAT.md) should be updated
- Remove manual "check GID" reminders
- Replace with "use botcore API" instructions

**Separation of concerns:**
- Engram = Long-term memory storage
- GID = Task/project tracking
- Botcore SDK = Integrates both seamlessly
