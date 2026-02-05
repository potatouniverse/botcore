# BotCore 🤖

**Portable AI agent core with memory, identity, skills, and task management**

[![Status](https://img.shields.io/badge/status-design%20phase-yellow)](DESIGN.md)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## What is BotCore?

BotCore separates the **essence of an AI agent** (memory, personality, skills) from the **platform it runs on** (Clawdbot, custom servers, cloud services).

**Think of it like:**
- Docker for AI agents
- A "save file" for your bot
- Portable identity + memory

## Features

- 🧠 **Memory System** — Engram (cognitive dynamics) + file-based logs
- 🎭 **Identity** — Personality (SOUL.md), name, avatar
- 🛠️ **Skills** — Portable, reusable capabilities
- 📦 **Export/Import** — Move bots between platforms
- 🔒 **Privacy-First** — Secrets separate, sessions optional

## Quick Start

```bash
# Install
npm install -g botcore

# Create a new bot
botcore init my-bot

# Export your bot
botcore export ./my-bot --output my-bot.tar.gz

# Import to a new location
botcore import my-bot.tar.gz --dest ./new-bot
```

## Project Structure

```
my-bot/
├── memory/
│   ├── engram.db              # Cognitive memory (Engram)
│   └── daily/YYYY-MM-DD.md    # Daily logs
├── identity/
│   ├── SOUL.md                # Personality, tone
│   ├── IDENTITY.md            # Name, emoji, avatar
│   └── USER.md                # Who they help
├── skills/                    # Bot-specific skills
├── config/                    # Model preferences, permissions
└── botcore.json               # Metadata
```

## Use Cases

### 1. Migrate Between Platforms
```bash
# Export from Clawdbot
cd ~/clawd
botcore export . --output clawd-backup.tar.gz

# Import to Suited Bot
botcore import clawd-backup.tar.gz --platform suitedbot
```

### 2. Share a Bot Template
```bash
# Export without sessions (privacy-safe)
botcore export ./my-bot --exclude-sessions --output bot-template.tar.gz

# Someone else imports it
botcore import bot-template.tar.gz --dest ./their-bot
```

### 3. Backup & Restore
```bash
# Daily backup
botcore export ./my-bot --output backups/bot-$(date +%Y-%m-%d).tar.gz

# Restore
botcore import backups/bot-2026-02-01.tar.gz --dest ./restored-bot
```

## Architecture

See [DESIGN.md](DESIGN.md) for full architecture and roadmap.

## Memory Module

The Memory module wraps [Engram](https://github.com/tonitangpotato/neuromemory-ai), a neuroscience-grounded memory system with ACT-R activation, Hebbian learning, and cognitive consolidation.

### Requirements

**BotCore requires Engram (AI memory system) to be installed:**

```bash
# Option 1: Install from PyPI (recommended)
pip install engramai

# Option 2: Install with semantic search support (multilingual)
pip install "engramai[sentence-transformers]"

# Option 3: Install all optional features
pip install "engramai[all]"
```

**For development:**

```bash
# Clone and install locally
git clone https://github.com/tonitangpotato/engramai.git
cd engramai
pip install -e ".[sentence-transformers]"
```

**Verify installation:**

```bash
python3 -c "import engram; print('✅ Engram installed')"
```

### Usage

```typescript
import { Memory } from 'botcore';

// Create memory instance
const memory = new Memory({
  dbPath: './agent-memory.db',
  logDir: './memory-logs',  // Optional: daily markdown logs
  enableLogs: true,
});

// Start the Engram MCP connection
await memory.start();

// Store memories
await memory.store('User prefers detailed explanations', {
  type: 'relational',
  importance: 0.8,
});

// Recall memories
const results = await memory.recall('user preferences', { limit: 5 });
for (const r of results) {
  console.log(`[${r.confidenceLabel}] ${r.content}`);
}

// Session-aware recall (reduces API calls by 70-80%)
const session = await memory.sessionRecall('user preferences', {
  sessionId: 'chat-123',
  limit: 5,
});

// Run consolidation (daily maintenance)
await memory.consolidate();

// Cleanup
await memory.stop();
```

### Memory Types

- `factual` — Facts and knowledge
- `episodic` — Events and experiences
- `relational` — Relationships and preferences
- `emotional` — Emotional moments
- `procedural` — How-to knowledge
- `opinion` — Beliefs and opinions

### Running Tests

```bash
# Unit tests (no MCP server needed)
npm test

# Full integration tests (requires Engram)
# Terminal 1: Start the MCP server
cd /path/to/engram && uv run python -m engram.mcp_server

# Terminal 2: Run tests
npm run test:memory
```

## Development Status

- [x] Design phase
- [x] Core modules: Memory ✅
- [ ] Core modules: Identity, Config, Skills
- [ ] Export/Import CLI
- [ ] TypeScript SDK
- [ ] Platform adapters (Clawdbot, Suited Bot)

## Contributing

BotCore is in early design phase. See [DESIGN.md](DESIGN.md) for the vision.

## License

MIT

## Links

- **Engram (Memory):** [neuromemory-ai](https://github.com/tonitangpotato/neuromemory-ai)
- **GID (Task Management):** MCP server
- **Clawdbot:** [clawdbot](https://github.com/clawdbot/clawdbot)
