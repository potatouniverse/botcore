/**
 * Memory stub (temporarily disabled)
 * 
 * This is a no-op implementation to allow testing other BotCore features
 * while we fix the Memory module integration issues.
 */

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

export class Memory {
  async start(): Promise<void> {
    console.log('[Memory] Using stub (disabled for testing)');
  }
  
  async stop(): Promise<void> {}
  
  async store(content: string, options: StoreOptions = {}): Promise<{ id: string; layer: string }> {
    return { id: 'stub', layer: 'working' };
  }
  
  async recall(query: string, options: RecallOptions = {}): Promise<MemoryResult[]> {
    return [];
  }
  
  async consolidate(): Promise<void> {}
}

export function createMemory(dbPath: string, logDir?: string): Memory {
  return new Memory();
}
