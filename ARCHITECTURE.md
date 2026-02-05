# Architecture Comparison: Engram vs BotCore vs BotCoreBot vs Clawdbot

**Last Updated:** 2026-02-04

---

## 🏗️ Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           User's Bot                                │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     RUNTIME + CHANNELS                              │
│  ┌──────────────────┐              ┌──────────────────┐            │
│  │   Clawdbot       │              │   BotCoreBot     │            │
│  │                  │              │                  │            │
│  │  • Agent loop    │              │  • Agent loop    │            │
│  │  • LLM adapters  │              │  • LLM adapters  │            │
│  │  • Tool executor │              │  • Tool executor │            │
│  │  • Channels:     │              │  • Channels:     │            │
│  │    - Telegram    │              │    - Telegram    │            │
│  │    - Discord     │              │    - Discord     │            │
│  │    - WhatsApp    │              │    - WhatsApp    │            │
│  │  • Gateway       │              │  • Cloud runtime │            │
│  └──────────────────┘              └──────────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        BOT FRAMEWORK                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                        BotCore                               │  │
│  │                                                              │  │
│  │  • Memory wrapper     (calls Engram MCP)                    │  │
│  │  • Identity loader    (SOUL.md, IDENTITY.md, USER.md)       │  │
│  │  • GID integration    (task tracking, activity logging)     │  │
│  │  • Skills registry    (portable skill packages)             │  │
│  │  • Config manager     (models, permissions)                 │  │
│  │                                                              │  │
│  │  NOT included:                                               │  │
│  │  ✗ Runtime / Agent loop                                     │  │
│  │  ✗ LLM provider adapters                                    │  │
│  │  ✗ Channels (Telegram, Discord)                             │  │
│  │  ✗ Tool execution                                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        MEMORY ENGINE                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                        Engram                                │  │
│  │                                                              │  │
│  │  • ACT-R activation model                                   │  │
│  │  • Hebbian learning (co-activation)                         │  │
│  │  • Memory consolidation (working → long-term)               │  │
│  │  • Semantic search (vector + FTS5)                          │  │
│  │  • MCP server (JSON-RPC over stdio)                         │  │
│  │                                                              │  │
│  │  Stack: Python + SQLite                                     │  │
│  │  Interface: MCP protocol                                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Component Comparison Table

| Component | Engram | BotCore | BotCoreBot | Clawdbot |
|-----------|--------|---------|------------|----------|
| **Type** | Memory Engine | Bot Framework | Cloud Platform | Self-hosted Platform |
| **Language** | Python | TypeScript | TypeScript | TypeScript |
| **Memory** | ✅ Core feature | ✅ Wrapper | ✅ Via BotCore | ✅ Direct integration |
| **Identity** | ❌ | ✅ SOUL/IDENTITY/USER | ✅ Via BotCore | ✅ Direct files |
| **GID (Tasks)** | ❌ | ✅ Integration | ✅ Via BotCore | ✅ Direct MCP |
| **Skills** | ❌ | ✅ Registry | ✅ Via BotCore | ✅ Direct files |
| **Agent Loop** | ❌ | ❌ | ✅ Built-in | ✅ Built-in |
| **LLM Adapters** | ❌ | ❌ | ✅ Anthropic, OpenAI | ✅ Anthropic, OpenAI, Google |
| **Tools** | ❌ | ❌ | ✅ Basic set | ✅ Extensive (coding, web, nodes) |
| **Channels** | ❌ | ❌ | ✅ Telegram, Discord | ✅ Telegram, Discord, WhatsApp, Signal, Slack, Matrix |
| **Gateway** | ❌ | ❌ | ✅ Cloud runtime | ✅ Local LaunchAgent |
| **Export/Import** | ❌ | ✅ Core feature | ✅ Via BotCore | ⚠️ Manual |
| **Deployment** | pip install | npm install | Cloud (signup) | Self-host (openclaw start) |
| **Target User** | Developers | Bot creators | End users | Power users / Developers |

---

## 🎯 Detailed Breakdown

### Engram (Memory Engine Layer)

**What it is:**
- Pure memory system
- Python MCP server
- No knowledge of bots, channels, or agent loops

**What it does:**
```python
# Only these operations:
memory.add(content, type, importance)
memory.recall(query, limit, min_confidence)
memory.consolidate(days)
memory.forget(threshold)
memory.stats()
```

**Stack:**
```
Python 3.9+
├── SQLite (storage)
├── Sentence Transformers (embedding)
├── FTS5 (keyword search)
└── MCP protocol (interface)
```

**Used by:**
- BotCore (via MCP client)
- Clawdbot (via MCP client)
- Any agent that supports MCP

---

### BotCore (Bot Framework Layer)

**What it is:**
- TypeScript SDK for building portable bots
- Wraps Engram + adds Identity, GID, Skills, Config
- **Does NOT include runtime or channels**

**What it does:**
```typescript
const bot = await createBot({ workspace: './my-bot' });

// Memory (calls Engram MCP)
await bot.memory.store('Important fact', { type: 'factual' });
const memories = await bot.memory.recall('query');

// Identity
const identity = bot.identity.getIdentity();
const soul = bot.identity.getSoul();

// GID (task tracking)
const tasks = await bot.gid.getCurrentTasks();
bot.gid.recordActivity('src/api.ts', 'edit');

// Skills (registry only, execution elsewhere)
const skills = bot.skills.list();

// Config
const config = bot.config.get('model.default');
```

**File structure:**
```
my-bot/
├── memory/
│   └── engram.db               # Engram database
├── identity/
│   ├── SOUL.md                 # Personality
│   ├── IDENTITY.md             # Name, emoji, avatar
│   └── USER.md                 # Who they help
├── skills/                     # Bot-specific skills
├── config/
│   ├── models.json             # Model preferences
│   └── permissions.json        # What bot can do
├── .gid/
│   └── graph.yml               # Task graph (optional)
└── botcore.json                # Metadata
```

**Used by:**
- BotCoreBot (cloud platform)
- Custom bot implementations
- Not standalone (needs runtime)

---

### BotCoreBot (Cloud Platform Layer)

**What it is:**
- BotCore + Runtime + Channels
- Cloud-hosted (like Replit for bots)
- Multi-bot support

**Architecture:**
```
BotCoreBot
├── Dashboard (Next.js)
│   ├── Bot management UI
│   ├── Chat widget
│   └── Settings
├── Runtime (Node.js)
│   ├── Agent loop (agent-loop.ts)
│   ├── LLM adapters (Anthropic, OpenAI)
│   ├── Tool execution
│   └── Channel adapters
│       ├── Telegram
│       ├── Discord
│       └── HTTP API
└── BotCore SDK
    ├── Memory (Engram wrapper)
    ├── Identity
    ├── GID
    └── Skills
```

**Execution flow:**
```typescript
// User sends message via Telegram
1. Channel adapter receives message
   ↓
2. AgentLoop.run(input)
   ├─ Recall memories (BotCore Memory)
   ├─ Get identity (BotCore Identity)
   ├─ Build system prompt
   ├─ Call LLM (Anthropic)
   ├─ Execute tools (if any)
   └─ Store important info (BotCore Memory)
   ↓
3. Return response to channel
```

**Differentiators vs Clawdbot:**
- ✅ Cloud-hosted (no self-hosting)
- ✅ Portable by default (BotCore export/import)
- ✅ Multi-bot support (manage 5+ bots)
- ✅ API-first (HTTP endpoints)
- ❌ Fewer channels (Telegram, Discord only initially)
- ❌ Fewer tools (basic set, not coding-focused)

---

### Clawdbot (OpenClaw)

**What it is:**
- Self-hosted coding assistant
- Direct integration (no BotCore)
- Extensive channels and tools

**Architecture:**
```
Clawdbot (OpenClaw)
├── Gateway (LaunchAgent/systemd)
│   ├── Session manager
│   ├── Agent pool
│   └── Channel routers
├── Agent (Pi Embedded Runner)
│   ├── Agent loop (attempt.ts)
│   ├── Engram integration (direct MCP)
│   ├── GID integration (direct MCP)
│   ├── LLM adapters (Anthropic, OpenAI, Google)
│   └── Tools (extensive)
│       ├── exec (shell commands)
│       ├── read/write/edit (filesystem)
│       ├── browser (web automation)
│       ├── nodes (phone/desktop control)
│       ├── message (cross-platform messaging)
│       └── many more...
├── Channels (plugins)
│   ├── Telegram
│   ├── Discord
│   ├── WhatsApp
│   ├── Signal
│   ├── Slack
│   ├── Matrix
│   └── iMessage (via BlueBubbles)
└── Direct files (no BotCore)
    ├── AGENTS.md
    ├── SOUL.md
    ├── IDENTITY.md
    ├── USER.md
    ├── HEARTBEAT.md
    └── memory/ (daily logs)
```

**Differentiators vs BotCoreBot:**
- ✅ Self-hosted (full control)
- ✅ Coding-focused (exec, filesystem, git)
- ✅ More channels (WhatsApp, Signal, iMessage)
- ✅ More tools (browser, nodes, camera, screen)
- ✅ Local execution (no cloud latency)
- ❌ No portability (no BotCore export)
- ❌ Single bot (one instance per gateway)

---

## 🎭 Use Case Comparison

### When to use **Engram**

- You're building a custom agent
- You only need memory (no identity, skills, tasks)
- You want to integrate memory into existing system

**Example:**
```python
# Simple chatbot with memory
from engram import Memory

memory = Memory("./chatbot.db")

# On user message
memories = memory.recall(user_message)
prompt = f"{system_prompt}\n\nRelevant memories:\n{memories}\n\nUser: {user_message}"
response = llm.call(prompt)

# Store important info
if is_important(response):
    memory.add(extract_key_info(response))
```

---

### When to use **BotCore**

- You're building a bot framework/platform
- You need portability (export/import bots)
- You want standard structure (identity, memory, skills)
- You'll provide your own runtime

**Example:**
```typescript
// Import a bot someone else created
const bot = await createBot({ workspace: './imported-bot' });

// Use bot's memory
const memories = await bot.memory.recall('user preferences');

// Use bot's identity
const soul = bot.identity.getSoul();

// Provide your own runtime
const response = await myAgentLoop(bot, userMessage);
```

---

### When to use **BotCoreBot**

- You want a cloud-hosted bot
- You don't want to self-host
- You need multi-bot management
- You want API access to your bots

**Example:**
```bash
# Sign up at botcorebot.com
1. Create bot via web UI
2. Configure personality (SOUL.md wizard)
3. Deploy (1-click)

# Use via API
curl -X POST https://my-bot.botcorebot.com/api/chat \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"message": "Hello bot"}'
```

---

### When to use **Clawdbot (OpenClaw)**

- You want a personal coding assistant
- You need full control (self-hosted)
- You need extensive tools (exec, browser, nodes)
- You need many channels (Telegram, WhatsApp, Signal, etc.)

**Example:**
```bash
# Install on your Mac/Linux
npm install -g openclaw

# Start gateway
openclaw gateway start

# Chat via Telegram, Discord, WhatsApp, Signal...
# Bot has access to:
# - Your filesystem
# - Shell execution
# - Browser automation
# - Phone camera/screen (via nodes)
# - Git operations
# - And more...
```

---

## 🔄 Migration Paths

### Clawdbot → BotCore

**Currently:** Manual migration

1. Export Clawdbot state:
   ```bash
   tar -czf my-bot-backup.tar.gz \
     AGENTS.md SOUL.md IDENTITY.md USER.md \
     memory/ .gid/ config/
   ```

2. Import to BotCore format:
   ```bash
   botcore import my-bot-backup.tar.gz --dest ./my-bot
   ```

3. Use with any BotCore-compatible runtime

**Future:** One-click migration tool

---

### BotCore ↔ BotCoreBot

**Seamless:**

```bash
# Export from BotCoreBot
botcore export my-bot --output my-bot.tar.gz

# Import to local BotCore
botcore import my-bot.tar.gz --dest ./local-bot

# Or vice versa
botcore export ./local-bot --output local-bot.tar.gz
# Upload to BotCoreBot dashboard
```

---

## 🏆 Which Should You Use?

| You want... | Use |
|-------------|-----|
| Just memory for my custom agent | **Engram** |
| A framework to build portable bots | **BotCore** |
| A cloud-hosted bot with zero setup | **BotCoreBot** |
| A personal coding assistant | **Clawdbot** |
| To distribute bots to other users | **BotCore** → package → BotCoreBot/Clawdbot |
| Maximum control and extensibility | **Clawdbot** (self-host) |
| Maximum portability | **BotCore** (framework) |

---

## 📈 Future Roadmap

### Engram
- ✅ v1.0.0 released (semantic search, auto-fallback)
- [ ] Vector index optimization (FAISS/HNSW)
- [ ] Supabase backend support
- [ ] Multi-agent memory sharing

### BotCore
- [ ] v0.1.0 (Memory + Identity + GID complete)
- [ ] v0.2.0 (Skills + Config)
- [ ] v1.0.0 (Export/Import CLI)
- [ ] Platform adapters (Clawdbot, BotCoreBot)

### BotCoreBot
- [ ] Alpha (single bot, Telegram only)
- [ ] Beta (multi-bot, Discord)
- [ ] v1.0 (API, marketplace integration)

### Clawdbot
- ✅ v2026.2.3 (Engram Level 3 integration)
- [ ] BotCore compatibility layer
- [ ] One-click bot export

---

## 🎯 Summary

**Simple hierarchy:**

```
Engram       = Memory layer (pure, standalone)
BotCore      = Bot framework (Memory + Identity + GID + Skills + Config)
BotCoreBot   = BotCore + Cloud runtime + Channels
Clawdbot     = Direct integration + Self-hosted runtime + Extensive tools
```

**Dependency graph:**

```
BotCoreBot
    ↓
 BotCore
    ↓
  Engram

Clawdbot
    ↓
  Engram (direct MCP)
```

**Key insight:**
- Engram = Engine (reusable)
- BotCore = Framework (portable)
- BotCoreBot/Clawdbot = Runtime (different deployment models)

**Choose based on your deployment needs, not features!**
