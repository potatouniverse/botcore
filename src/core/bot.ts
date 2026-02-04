/**
 * BotCore unified interface
 * 
 * Provides a single entry point that initializes all core modules:
 * - Identity
 * - Memory  
 * - Config
 * - GID
 */

import { Identity } from './identity';
import { Memory, createMemory } from './memory';  // Using original MCP server approach
import { Config, createConfig } from './config';
import { Gid } from './gid';
import { FileSystemTools, createFileSystemTools } from '../tools/filesystem';

export interface Bot {
  identity: Identity;
  memory: Memory;
  config: Config;
  gid: Gid;
  tools: {
    fs: FileSystemTools;
  };
  
  /** Workspace root directory */
  workspace: string;
}

export interface CreateBotOptions {
  /** Workspace directory (required) */
  workspace: string;
  
  /** Memory options */
  memory?: {
    dbPath?: string;
    logDir?: string;
    enableLogs?: boolean;
  };
  
  /** Config options */
  config?: {
    path?: string;
  };
  
  /** Display GID summary on init */
  displayGidSummary?: boolean;
}

/**
 * Create a Bot instance with all core modules initialized
 * 
 * @example
 * ```typescript
 * const bot = await createBot({
 *   workspace: '/path/to/project'
 * });
 * 
 * // GID auto-loaded and tasks displayed
 * await bot.gid.getCurrentTasks();
 * 
 * // Memory available
 * await bot.memory.store('Important fact', { type: 'factual' });
 * ```
 */
export async function createBot(options: CreateBotOptions): Promise<Bot> {
  const { workspace, displayGidSummary = true } = options;
  
  // Load identity
  const identity = new Identity(workspace);
  await identity.load();
  
  // Load memory
  const dbPath = options.memory?.dbPath || `${workspace}/engram.db`;
  const logDir = (options.memory?.enableLogs ?? true) 
    ? options.memory?.logDir || `${workspace}/memory`
    : undefined;
  
  // Try to find PYTHONPATH from environment or use default engram location
  const pythonPath = process.env.ENGRAM_PYTHONPATH || 
                     process.env.PYTHONPATH ||
                     '/Users/potato/clawd/projects/agent-memory-prototype';
  
  const memory = createMemory(dbPath, logDir, pythonPath);
  
  // Load config
  const configPath = options.config?.path || `${workspace}/config.yml`;
  const config = await createConfig(configPath);
  
  // Load GID (lightweight, no parsing yet)
  const gid = new Gid();
  await gid.load(workspace);
  
  // Create filesystem tools with GID tracking
  const fs = createFileSystemTools({ gid, workspace });
  
  // Display GID summary at session start (minimal Strategy 2)
  if (displayGidSummary && gid.isActive) {
    try {
      const summary = await gid.getTaskSummary();
      console.log(`\n📋 ${summary}\n`);
    } catch (error) {
      console.log(`\n📋 GID graph found but tasks could not be loaded\n`);
    }
  }
  
  return {
    identity,
    memory,
    config,
    gid,
    tools: { fs },
    workspace,
  };
}
