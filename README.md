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

## Development Status

- [x] Design phase
- [ ] Core modules (memory, identity, config)
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
