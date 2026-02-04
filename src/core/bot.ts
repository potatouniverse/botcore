/**
 * BotCore unified interface
 * 
 * Provides a single entry point that initializes all core modules:
 * - Identity
 * - Memory  
 * - Config
 * - GID
 */

import { Identity, createIdentity } from './identity';
import { Memory, createMemory } from './memory';
import { Config, createConfig } from './config';
import { Gid } from './gid';

export interface Bot {
  identity: Identity;
  memory: Memory;
  config: Config;
  gid: Gid;
  
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
  const identity = await createIdentity(workspace);
  
  // Load memory
  const memoryOptions = {
    dbPath: options.memory?.dbPath || `${workspace}/engram.db`,
    logDir: options.memory?.logDir || `${workspace}/memory`,
    enableLogs: options.memory?.enableLogs ?? true,
  };
  const memory = createMemory(memoryOptions);
  
  // Load config
  const configPath = options.config?.path || `${workspace}/config.yml`;
  const config = await createConfig(configPath);
  
  // Load GID (lightweight, no parsing yet)
  const gid = new Gid();
  await gid.load(workspace);
  
  // Display GID summary at session start (minimal Strategy 2)
  if (displayGidSummary && gid.isActive) {
    const summary = await gid.getTaskSummary();
    console.log(`\n📋 ${summary}\n`);
  }
  
  return {
    identity,
    memory,
    config,
    gid,
    workspace,
  };
}
