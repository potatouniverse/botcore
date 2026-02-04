/**
 * Memory module using mcporter (simplified)
 * 
 * This version uses the existing mcporter CLI instead of spawning
 * its own MCP server. Much simpler and more reliable.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export type MemoryType =
  | 'factual'
  | 'episodic'
  | 'relational'
  | 'emotional'
  | 'procedural'
  | 'opinion';

export interface StoreOptions {
  type?: MemoryType;
  importance?: number;
  source?: string;
}

export interface RecallOptions {
  limit?: number;
  types?: MemoryType[];
  minConfidence?: number;
}

export interface MemoryResult {
  id: string;
  content: string;
  type: MemoryType;
  confidence: number;
  strength: number;
}

export interface MemoryOptions {
  dbPath: string;
  logDir?: string;
  enableLogs?: boolean;
}

/**
 * Memory class using mcporter
 */
export class Memory {
  private dbPath: string;
  private logDir: string | null;
  private enableLogs: boolean;
  
  constructor(options: MemoryOptions) {
    this.dbPath = options.dbPath;
    this.logDir = options.logDir || null;
    this.enableLogs = options.enableLogs ?? true;
    
    // Create log directory if needed
    if (this.logDir && this.enableLogs) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }
  
  /**
   * Start - no-op for mcporter version (mcporter is already running)
   */
  async start(): Promise<void> {
    // No-op - mcporter handles the connection
  }
  
  /**
   * Stop - no-op for mcporter version
   */
  async stop(): Promise<void> {
    // No-op
  }
  
  /**
   * Store a memory
   */
  async store(content: string, options: StoreOptions = {}): Promise<{ id: string; layer: string }> {
    const cmd = `mcporter call engram.store content="${this.escapeShell(content)}" type=${options.type || 'factual'} importance=${options.importance || 0.5}`;
    
    try {
      const output = execSync(cmd, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      
      const result = JSON.parse(output);
      
      // Log
      if (this.enableLogs && this.logDir) {
        await this.log('store', content.substring(0, 100), { id: result.id, type: options.type });
      }
      
      return { id: result.id, layer: result.layer || 'working' };
    } catch (error) {
      console.warn('[Memory] Store failed:', error);
      return { id: '', layer: 'working' };
    }
  }
  
  /**
   * Recall memories
   */
  async recall(query: string, options: RecallOptions = {}): Promise<MemoryResult[]> {
    const limit = options.limit || 5;
    const cmd = `mcporter call engram.recall query="${this.escapeShell(query)}" limit=${limit}`;
    
    try {
      const output = execSync(cmd, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      
      const results = JSON.parse(output);
      
      // Log
      if (this.enableLogs && this.logDir) {
        await this.log('recall', query, { count: results.length });
      }
      
      return results.map((r: any) => ({
        id: r.id,
        content: r.content,
        type: r.type,
        confidence: r.confidence,
        strength: r.strength,
      }));
    } catch (error) {
      console.warn('[Memory] Recall failed:', error);
      return [];
    }
  }
  
  /**
   * Consolidate memories
   */
  async consolidate(): Promise<void> {
    try {
      execSync('mcporter call engram.consolidate', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      
      if (this.enableLogs && this.logDir) {
        await this.log('consolidate', 'Memory consolidation complete', {});
      }
    } catch (error) {
      console.warn('[Memory] Consolidate failed:', error);
    }
  }
  
  /**
   * Escape shell arguments
   */
  private escapeShell(str: string): string {
    return str.replace(/"/g, '\\"').replace(/\n/g, ' ');
  }
  
  /**
   * Write to daily log
   */
  private async log(type: string, content: string, metadata: any): Promise<void> {
    if (!this.logDir || !this.enableLogs) return;
    
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logDir, `${date}.md`);
    
    const entry = `## ${new Date().toTimeString().split(' ')[0]} - ${type}\n${content}\n${JSON.stringify(metadata)}\n\n`;
    
    try {
      fs.appendFileSync(logFile, entry, 'utf-8');
    } catch (error) {
      // Ignore log errors
    }
  }
}

/**
 * Create a Memory instance
 */
export function createMemory(dbPath: string, logDir?: string): Memory {
  return new Memory({
    dbPath,
    logDir,
    enableLogs: !!logDir,
  });
}
