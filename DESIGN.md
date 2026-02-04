# BotCore - Portable AI Agent Core

**Version:** 0.1.0  
**Status:** Design Phase  
**Created:** 2026-02-04

## Vision

A framework-agnostic, portable core for AI agents that separates the "essence" of a bot (memory, identity, skills, configuration) from the platform it runs on (Clawdbot, custom servers, cloud services).

## Problem Statement

Current AI agents are tightly coupled to their platforms:
- **Memory** is scattered (files, databases, context)
- **Identity** is configuration, not portable data
- **Skills** are platform-specific
- **Migration** requires rebuilding from scratch

**Result:** You can't easily:
- Move a bot between platforms (Clawdbot → Suited Bot → custom)
- Share a bot with someone else
- Back up a complete bot state
- Run the same bot in multiple places

## Solution: BotCore

A **portable bot package** that contains everything needed to recreate a bot:

```
my-bot/
├── memory/
│   ├── engram.db              # Engram cognitive memory
│   └── daily/YYYY-MM-DD.md    # Daily logs
├── identity/
│   ├── SOUL.md                # Personality, tone, boundaries
│   ├── IDENTITY.md            # Name, emoji, avatar
│   └── USER.md                # Who they help
├── skills/
│   └── custom-skill/          # Bot-specific skills
├── config/
│   ├── models.json            # Model preferences
│   └── permissions.json       # What the bot can do
├── sessions/                  # Optional: conversation history
└── botcore.json               # Metadata (version, created, etc.)
```

## Core Components

### 1. Memory System
- **Engram** (SQLite) — Cognitive dynamics (ACT-R, Hebbian, consolidation)
- **File-based** (Markdown) — Human-readable logs, transparency
- **Hybrid mode** — Best of both worlds

**API:**
```typescript
import { Memory } from 'botcore';

const mem = new Memory('./my-bot/memory/engram.db');
await mem.store('User prefers concise answers', { type: 'relational', importance: 0.8 });
const results = await mem.recall('user preferences', { limit: 5 });
await mem.consolidate();
```

### 2. Identity
- **SOUL.md** — Persona, values, boundaries
- **IDENTITY.md** — Name, emoji, avatar
- **USER.md** — Who they serve, preferences

**API:**
```typescript
import { Identity } from 'botcore';

const id = Identity.load('./my-bot/identity');
console.log(id.name);        // "Clawd"
console.log(id.emoji);       // "🐾"
console.log(id.soul.vibe);   // "Concise, resourceful, opinionated"
```

### 3. Skills
- **Skill registry** — Load from `skills/` directory
- **Metadata** — Each skill has `SKILL.md` with description, dependencies
- **Portable** — Skills work across platforms (MCP, native, HTTP)

**API:**
```typescript
import { Skills } from 'botcore';

const skills = Skills.load('./my-bot/skills');
const weather = skills.get('weather');
await weather.getCurrentWeather('San Francisco');
```

### 4. Configuration
- **Model preferences** — Which models to use, when
- **Permissions** — What actions are allowed
- **Platform hints** — Optional platform-specific config

**API:**
```typescript
import { Config } from 'botcore';

const config = Config.load('./my-bot/config');
console.log(config.defaultModel);  // "anthropic/claude-sonnet-4-5"
console.log(config.permissions.canSendEmails);  // false
```

### 5. Sessions (Optional)
- **Conversation history** — JSONL transcripts
- **Portable format** — Platform-agnostic message schema
- **Privacy** — Can be excluded from exports

### 6. Export/Import Tools
**Export:**
```bash
botcore export ./my-bot --output my-bot.tar.gz
# Options:
#   --include-sessions   Include conversation history
#   --include-secrets    Include API keys (use with caution)
```

**Import:**
```bash
botcore import my-bot.tar.gz --dest ./new-bot
# Automatically:
# - Rewrites file paths
# - Updates database references
# - Validates structure
```

## Design Principles

### 1. Framework-Agnostic
- No dependencies on Clawdbot, Langchain, AutoGen, etc.
- Core is pure TypeScript + Python (for Engram)
- Adapters for specific platforms (optional)

### 2. Portable
- **One folder = complete bot**
- Can be zipped, moved, shared
- Relative paths only (no `/Users/potato/...`)

### 3. Modular
- Use only what you need:
  - Memory-only: Just Engram
  - Identity-only: Just SOUL.md + IDENTITY.md
  - Full bot: Everything

### 4. Human-Readable
- Configuration is JSON/YAML
- Memory logs are Markdown
- Skill metadata is Markdown
- **Principle:** "If I open this folder, I should understand it"

### 5. Privacy-First
- Secrets separate from core (never in exports by default)
- Sessions optional (can export without history)
- Clear documentation on what gets shared

## Architecture

```
┌─────────────────────────────────────────────┐
│           Platform (Clawdbot, etc.)         │
└─────────────────┬───────────────────────────┘
                  │
          ┌───────▼────────┐
          │  BotCore SDK   │
          └───────┬────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼───┐    ┌───▼────┐    ┌──▼───┐
│Memory │    │Identity│    │Skills│
└───┬───┘    └───┬────┘    └──┬───┘
    │            │            │
┌───▼────────────▼────────────▼───┐
│      Bot Package (folder)       │
│  memory/ identity/ skills/ ...  │
└──────────────────────────────────┘
```

## Technology Stack

- **Core:** TypeScript (Node.js)
- **Memory Engine:** Python (Engram) + TypeScript wrapper
- **Storage:** SQLite (Engram), Markdown (logs)
- **Task Management:** GID (optional integration)
- **Deployment:** npm package + CLI tool

## Roadmap

### Phase 1: Core (MVP)
- [ ] Memory module (Engram wrapper + file sync)
- [ ] Identity module (load/save SOUL.md, etc.)
- [ ] Config module (schema + defaults)
- [ ] Export/Import CLI
- [ ] Basic TypeScript SDK

### Phase 2: Skills & Sessions
- [ ] Skill loader + registry
- [ ] Session format + storage
- [ ] GID integration (task tracking)

### Phase 3: Platform Adapters
- [ ] Clawdbot adapter
- [ ] Suited Bot adapter
- [ ] Generic HTTP API adapter

### Phase 4: Cloud Sync (Future)
- [ ] Remote backup
- [ ] Multi-device sync
- [ ] Collaboration (shared bots)

## Success Criteria

1. **User can export their Clawdbot workspace to a portable package**
2. **User can import that package into Suited Bot and it "just works"**
3. **User can share a bot folder with someone else (minus secrets)**
4. **Developer can build a new platform using BotCore SDK**

## Non-Goals

- Not a full agent framework (no orchestration, no runtime)
- Not a hosting service (no cloud infrastructure)
- Not a UI (just core + CLI)

## Open Questions

1. **Versioning:** How to handle schema changes across BotCore versions?
2. **Secrets:** Where do API keys live? (Answer: Separate keychain, not in core)
3. **Platform differences:** How much platform-specific config to allow?
4. **GID integration:** Core dependency or optional plugin?

## References

- **Clawdbot Architecture:** `/opt/homebrew/lib/node_modules/clawdbot/docs/concepts/`
- **Engram:** `projects/agent-memory-prototype/`
- **GID:** MCP server for task/project graph management
- **Mem0, Letta, memU:** Existing memory systems (for comparison)
