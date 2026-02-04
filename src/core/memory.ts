/**
 * Memory module - Engram integration + file-based logs
 *
 * Provides a TypeScript wrapper around the Engram MCP server for
 * neuroscience-grounded memory operations (ACT-R activation, Hebbian learning,
 * memory consolidation).
 *
 * Also supports file-based daily logs for transparency and manual review.
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ============================================================================
// Types
// ============================================================================

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

export interface SessionRecallOptions extends RecallOptions {
  sessionId?: string;
}

export interface MemoryResult {
  id: string;
  content: string;
  type: MemoryType;
  confidence: number;
  confidenceLabel: string;
  strength: number;
  ageDays: number;
}

export interface SessionRecallResult {
  results: MemoryResult[];
  sessionId: string;
  fullRecallTriggered: boolean;
  workingMemorySize: number;
  reason: 'empty_wm' | 'topic_change' | 'topic_continuous';
}

export interface MemoryStats {
  totalMemories: number;
  layers: Record<string, number>;
  pinned: number;
  types?: Record<string, number>;
}

export interface MemoryEntry {
  id: string;
  content: string;
  type: MemoryType;
  layer: string;
  importance: number;
  strength: number;
  stability: number;
  accessCount: number;
  createdAt: string | null;
  lastAccessed: string | null;
  pinned: boolean;
  source: string;
  tags: string[];
}

export interface DailyLogEntry {
  timestamp: string;
  type: 'store' | 'recall' | 'consolidate' | 'forget' | 'reward' | 'note';
  content: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// MCP Client (lightweight JSON-RPC over stdio)
// ============================================================================

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

class McpClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private rl: readline.Interface | null = null;
  private initialized = false;

  constructor(
    private command: string,
    private args: string[],
    private env: Record<string, string> = {}
  ) {}

  async start(): Promise<void> {
    if (this.process) return;

    this.process = spawn(this.command, this.args, {
      env: { ...process.env, ...this.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!this.process.stdout || !this.process.stdin) {
      throw new Error('Failed to spawn MCP server');
    }

    this.rl = readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity,
    });

    this.rl.on('line', (line) => {
      try {
        const response = JSON.parse(line) as JsonRpcResponse;
        const pending = this.pending.get(response.id);
        if (pending) {
          this.pending.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
      } catch {
        // Ignore non-JSON lines (server logs, etc.)
      }
    });

    this.process.on('error', (err) => {
      console.error('MCP server error:', err);
    });

    this.process.on('close', (code) => {
      if (code !== 0) {
        console.error(`MCP server exited with code ${code}`);
      }
      this.process = null;
      this.rl = null;
    });

    // Initialize MCP connection
    await this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;

    // Send initialize request
    await this.call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'botcore', version: '0.1.0' },
    });

    // Send initialized notification
    this.notify('notifications/initialized', {});
    this.initialized = true;
  }

  private notify(method: string, params: Record<string, unknown>): void {
    if (!this.process?.stdin) {
      throw new Error('MCP server not running');
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.process.stdin.write(JSON.stringify(notification) + '\n');
  }

  async call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.process?.stdin) {
      throw new Error('MCP server not running');
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process!.stdin!.write(JSON.stringify(request) + '\n');

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP call timed out: ${method}`));
        }
      }, 30000);
    });
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const result = await this.call('tools/call', { name, arguments: args });
    // MCP tools return { content: [{ type: 'text', text: '...' }] }
    const content = (result as { content?: Array<{ type: string; text: string }> })?.content;
    if (content && content.length > 0 && content[0].type === 'text') {
      try {
        const parsed = JSON.parse(content[0].text);
        // Handle nested result structure from Engram MCP
        // Format: { content: [...], structuredContent: { result: [...] }, isError: false }
        if (parsed && typeof parsed === 'object') {
          // Check if there's a structured result (preferred)
          if (parsed.structuredContent && Array.isArray(parsed.structuredContent.result)) {
            return parsed.structuredContent.result;
          }
          // Fallback to content array
          if (Array.isArray(parsed.content)) {
            return parsed.content;
          }
          // Return as-is if neither format matches
          return parsed;
        }
        return parsed;
      } catch (error) {
        // If JSON parsing fails, the content might be an error message
        console.error('[MCP] Failed to parse tool response:', content[0].text);
        throw new Error(`MCP tool ${name} returned invalid JSON: ${content[0].text.substring(0, 100)}`);
      }
    }
    return result;
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    this.initialized = false;
  }
}

// ============================================================================
// Daily Log Manager
// ============================================================================

class DailyLogManager {
  constructor(private logDir: string) {}

  private getLogPath(date?: Date): string {
    const d = date || new Date();
    const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `${dateStr}.md`);
  }

  async ensureDir(): Promise<void> {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  async append(entry: DailyLogEntry): Promise<void> {
    await this.ensureDir();
    const logPath = this.getLogPath();

    // Format entry as markdown
    const time = new Date().toISOString().split('T')[1].split('.')[0]; // HH:MM:SS
    let line = `- **${time}** [${entry.type}] ${entry.content}`;
    if (entry.metadata) {
      line += ` (${JSON.stringify(entry.metadata)})`;
    }
    line += '\n';

    // Append to file (create with header if new)
    if (!fs.existsSync(logPath)) {
      const header = `# Memory Log - ${new Date().toISOString().split('T')[0]}\n\n`;
      fs.writeFileSync(logPath, header);
    }
    fs.appendFileSync(logPath, line);
  }

  async read(date?: Date): Promise<DailyLogEntry[]> {
    const logPath = this.getLogPath(date);
    if (!fs.existsSync(logPath)) {
      return [];
    }

    const content = fs.readFileSync(logPath, 'utf-8');
    const entries: DailyLogEntry[] = [];

    // Parse markdown entries
    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^- \*\*(\d{2}:\d{2}:\d{2})\*\* \[(\w+)\] (.+?)(?:\s*\(({.+})\))?$/);
      if (match) {
        const [, time, type, content, metadata] = match;
        entries.push({
          timestamp: time,
          type: type as DailyLogEntry['type'],
          content,
          metadata: metadata ? JSON.parse(metadata) : undefined,
        });
      }
    }

    return entries;
  }

  async listDates(): Promise<string[]> {
    await this.ensureDir();
    const files = fs.readdirSync(this.logDir);
    return files
      .filter((f) => f.match(/^\d{4}-\d{2}-\d{2}\.md$/))
      .map((f) => f.replace('.md', ''))
      .sort()
      .reverse();
  }
}

// ============================================================================
// Memory Class
// ============================================================================

export interface MemoryOptions {
  /** Path to the Engram database file */
  dbPath: string;
  /** Path to daily log directory (optional) */
  logDir?: string;
  /** Python command (default: python3) */
  pythonCommand?: string;
  /** PYTHONPATH for engram module (required if engram not installed globally) */
  pythonPath?: string;
  /** Whether to auto-start the MCP server */
  autoStart?: boolean;
  /** Whether to log operations to daily files */
  enableLogs?: boolean;
}

export class Memory {
  private client: McpClient | null = null;
  private logManager: DailyLogManager | null = null;
  private started = false;

  public readonly dbPath: string;
  public readonly logDir: string | null;
  public readonly pythonCommand: string;
  public readonly pythonPath: string | null;
  public readonly enableLogs: boolean;

  constructor(options: MemoryOptions | string) {
    // Handle legacy single-arg constructor
    if (typeof options === 'string') {
      options = { dbPath: options };
    }

    this.dbPath = options.dbPath;
    this.logDir = options.logDir || null;
    this.pythonCommand = options.pythonCommand || 'python3';
    this.pythonPath = options.pythonPath || null;
    this.enableLogs = options.enableLogs ?? true;

    if (this.logDir && this.enableLogs) {
      this.logManager = new DailyLogManager(this.logDir);
    }

    // Create MCP client with PYTHONPATH if provided
    const env: Record<string, string> = {
      ENGRAM_DB_PATH: this.dbPath,
    };
    
    if (this.pythonPath) {
      env.PYTHONPATH = this.pythonPath;
    }
    
    this.client = new McpClient(this.pythonCommand, ['-m', 'engram.mcp_server'], env);
  }

  /**
   * Start the Engram MCP server connection.
   * Must be called before using memory operations.
   */
  async start(): Promise<void> {
    if (this.started) return;
    if (!this.client) {
      throw new Error('Memory client not initialized');
    }
    await this.client.start();
    this.started = true;
  }

  /**
   * Stop the Engram MCP server connection.
   */
  async stop(): Promise<void> {
    if (this.client) {
      await this.client.stop();
      this.started = false;
    }
  }

  private async ensureStarted(): Promise<void> {
    if (!this.started) {
      await this.start();
    }
  }

  private async log(entry: DailyLogEntry): Promise<void> {
    if (this.logManager && this.enableLogs) {
      await this.logManager.append(entry);
    }
  }

  // --------------------------------------------------------------------------
  // Core Memory Operations
  // --------------------------------------------------------------------------

  /**
   * Store a new memory in the Engram system.
   *
   * @param content - The content to remember
   * @param options - Storage options (type, importance, source)
   * @returns The stored memory entry
   */
  async store(content: string, options: StoreOptions = {}): Promise<{ id: string; layer: string }> {
    await this.ensureStarted();

    const result = (await this.client!.callTool('store', {
      content,
      type: options.type || 'factual',
      importance: options.importance,
      source: options.source || '',
    })) as { id: string; content: string; type: string; layer: string };

    await this.log({
      timestamp: new Date().toISOString(),
      type: 'store',
      content: content.slice(0, 100) + (content.length > 100 ? '...' : ''),
      metadata: { type: options.type, importance: options.importance, id: result.id },
    });

    return { id: result.id, layer: result.layer };
  }

  /**
   * Recall relevant memories using neuroscience-based activation retrieval.
   *
   * @param query - Natural language query
   * @param options - Recall options (limit, types, minConfidence)
   * @returns Ranked list of matching memories
   */
  async recall(query: string, options: RecallOptions = {}): Promise<MemoryResult[]> {
    await this.ensureStarted();

    const result = (await this.client!.callTool('recall', {
      query,
      limit: options.limit || 5,
      types: options.types,
      min_confidence: options.minConfidence || 0.0,
    })) as Array<{
      id: string;
      content: string;
      type: string;
      confidence: number;
      confidence_label: string;
      strength: number;
      age_days: number;
    }>;

    // Validate result is an array
    if (!Array.isArray(result)) {
      console.warn('[Memory] Recall returned non-array:', result);
      return [];
    }

    await this.log({
      timestamp: new Date().toISOString(),
      type: 'recall',
      content: query,
      metadata: { count: result.length, limit: options.limit },
    });

    return result.map((r) => ({
      id: r.id,
      content: r.content,
      type: r.type as MemoryType,
      confidence: r.confidence,
      confidenceLabel: r.confidence_label,
      strength: r.strength,
      ageDays: r.age_days,
    }));
  }

  /**
   * Session-aware recall — only retrieves when topic changes.
   * Reduces API calls by 70-80% for continuous conversation topics.
   *
   * @param query - Natural language query
   * @param options - Session recall options
   * @returns Results with session metadata
   */
  async sessionRecall(query: string, options: SessionRecallOptions = {}): Promise<SessionRecallResult> {
    await this.ensureStarted();

    const result = (await this.client!.callTool('session_recall', {
      query,
      session_id: options.sessionId || 'default',
      limit: options.limit || 5,
      types: options.types,
      min_confidence: options.minConfidence || 0.0,
    })) as {
      results: Array<{
        id: string;
        content: string;
        type: string;
        confidence: number;
        confidence_label: string;
        strength: number;
        age_days: number;
        from_working_memory: boolean;
      }>;
      session_id: string;
      full_recall_triggered: boolean;
      working_memory_size: number;
      reason: string;
    };

    return {
      results: result.results.map((r) => ({
        id: r.id,
        content: r.content,
        type: r.type as MemoryType,
        confidence: r.confidence,
        confidenceLabel: r.confidence_label,
        strength: r.strength,
        ageDays: r.age_days,
      })),
      sessionId: result.session_id,
      fullRecallTriggered: result.full_recall_triggered,
      workingMemorySize: result.working_memory_size,
      reason: result.reason as SessionRecallResult['reason'],
    };
  }

  /**
   * Run memory consolidation (sleep cycle) to strengthen and organize memories.
   *
   * @param days - Simulated days of sleep (default: 1.0)
   */
  async consolidate(days: number = 1.0): Promise<MemoryStats> {
    await this.ensureStarted();

    const result = (await this.client!.callTool('consolidate', { days })) as {
      consolidated: boolean;
      stats: { total_memories: number; layers: Record<string, number>; pinned: number };
    };

    await this.log({
      timestamp: new Date().toISOString(),
      type: 'consolidate',
      content: `Consolidation complete (${days} day${days !== 1 ? 's' : ''})`,
      metadata: result.stats,
    });

    return {
      totalMemories: result.stats.total_memories,
      layers: result.stats.layers,
      pinned: result.stats.pinned,
    };
  }

  /**
   * Forget a specific memory or prune weak ones below threshold.
   *
   * @param memoryId - Specific memory ID to forget (optional)
   * @param threshold - Strength threshold for pruning (default: 0.01)
   */
  async forget(memoryId?: string, threshold: number = 0.01): Promise<{ forgottenCount: number; prunedIds: string[] }> {
    await this.ensureStarted();

    const result = (await this.client!.callTool('forget', {
      memory_id: memoryId,
      threshold,
    })) as { forgotten_count: number; pruned_ids: string[] };

    await this.log({
      timestamp: new Date().toISOString(),
      type: 'forget',
      content: memoryId ? `Forgot memory ${memoryId}` : `Pruned ${result.forgotten_count} weak memories`,
      metadata: { threshold, count: result.forgotten_count },
    });

    return {
      forgottenCount: result.forgotten_count,
      prunedIds: result.pruned_ids,
    };
  }

  /**
   * Apply reward feedback to adjust memory weights.
   *
   * @param feedback - Positive or negative feedback text
   * @param recentN - Number of recent memories to affect (default: 3)
   */
  async reward(feedback: string, recentN: number = 3): Promise<{ polarity: string; confidence: number }> {
    await this.ensureStarted();

    const result = (await this.client!.callTool('reward', {
      feedback,
      recent_n: recentN,
    })) as { polarity: string; confidence: number; affected_memories: number };

    await this.log({
      timestamp: new Date().toISOString(),
      type: 'reward',
      content: feedback,
      metadata: { polarity: result.polarity, confidence: result.confidence },
    });

    return {
      polarity: result.polarity,
      confidence: result.confidence,
    };
  }

  /**
   * Get memory system statistics.
   */
  async stats(): Promise<MemoryStats> {
    await this.ensureStarted();

    const result = (await this.client!.callTool('stats')) as {
      total_memories: number;
      layers: Record<string, number>;
      pinned: number;
      types?: Record<string, number>;
    };

    return {
      totalMemories: result.total_memories,
      layers: result.layers,
      pinned: result.pinned,
      types: result.types,
    };
  }

  /**
   * Get a specific memory by ID.
   */
  async get(memoryId: string): Promise<MemoryEntry | null> {
    await this.ensureStarted();

    const result = (await this.client!.callTool('get', { memory_id: memoryId })) as MemoryEntry & {
      error?: string;
      created_at?: string;
      last_accessed?: string;
      access_count?: number;
    };

    if (result.error) {
      return null;
    }

    return {
      id: result.id,
      content: result.content,
      type: result.type as MemoryType,
      layer: result.layer,
      importance: result.importance,
      strength: result.strength,
      stability: result.stability,
      accessCount: result.access_count || 0,
      createdAt: result.created_at || null,
      lastAccessed: result.last_accessed || null,
      pinned: result.pinned,
      source: result.source,
      tags: result.tags,
    };
  }

  /**
   * Pin a memory to prevent forgetting.
   */
  async pin(memoryId: string): Promise<boolean> {
    await this.ensureStarted();
    const result = (await this.client!.callTool('pin', { memory_id: memoryId })) as { pinned?: boolean; error?: string };
    return result.pinned === true;
  }

  /**
   * Unpin a memory to allow normal forgetting.
   */
  async unpin(memoryId: string): Promise<boolean> {
    await this.ensureStarted();
    const result = (await this.client!.callTool('unpin', { memory_id: memoryId })) as { pinned?: boolean; error?: string };
    return result.pinned === false;
  }

  /**
   * Get Hebbian associations for a memory.
   */
  async hebbianLinks(memoryId: string): Promise<Array<{ id: string; content: string }>> {
    await this.ensureStarted();

    const result = (await this.client!.callTool('hebbian_links', { memory_id: memoryId })) as {
      source_id: string;
      links: Array<{ id: string; content: string }>;
      total_links: number;
    };

    return result.links;
  }

  // --------------------------------------------------------------------------
  // Export/Import
  // --------------------------------------------------------------------------

  /**
   * Export the memory database to a file.
   *
   * @param exportPath - Destination path for the export
   */
  async export(exportPath: string): Promise<{ path: string; sizeBytes: number }> {
    await this.ensureStarted();

    const result = (await this.client!.callTool('export', { path: exportPath })) as {
      exported_to: string;
      size_bytes: number;
    };

    return {
      path: result.exported_to,
      sizeBytes: result.size_bytes,
    };
  }

  /**
   * Import a memory database from a file.
   * This stops the current connection, copies the file, and restarts.
   *
   * @param importPath - Path to the database file to import
   * @param validate - Whether to validate the imported database (default: true)
   */
  async import(importPath: string, validate: boolean = true): Promise<{ imported: boolean; stats?: MemoryStats }> {
    if (!fs.existsSync(importPath)) {
      throw new Error(`Import file not found: ${importPath}`);
    }

    // Stop the current connection
    await this.stop();

    // Backup existing database if it exists
    if (fs.existsSync(this.dbPath)) {
      const backupPath = `${this.dbPath}.backup.${Date.now()}`;
      fs.copyFileSync(this.dbPath, backupPath);
    }

    // Copy the imported database
    fs.copyFileSync(importPath, this.dbPath);

    // Restart and validate
    await this.start();

    if (validate) {
      try {
        const stats = await this.stats();
        return { imported: true, stats };
      } catch (err) {
        throw new Error(`Imported database validation failed: ${err}`);
      }
    }

    return { imported: true };
  }

  // --------------------------------------------------------------------------
  // Daily Logs
  // --------------------------------------------------------------------------

  /**
   * Read today's memory log.
   */
  async readTodayLog(): Promise<DailyLogEntry[]> {
    if (!this.logManager) {
      return [];
    }
    return this.logManager.read();
  }

  /**
   * Read a specific day's memory log.
   *
   * @param date - Date to read (YYYY-MM-DD string or Date object)
   */
  async readLog(date: string | Date): Promise<DailyLogEntry[]> {
    if (!this.logManager) {
      return [];
    }
    const d = typeof date === 'string' ? new Date(date) : date;
    return this.logManager.read(d);
  }

  /**
   * List all available log dates.
   */
  async listLogDates(): Promise<string[]> {
    if (!this.logManager) {
      return [];
    }
    return this.logManager.listDates();
  }

  /**
   * Add a manual note to today's log.
   *
   * @param note - Note content
   */
  async addNote(note: string): Promise<void> {
    if (this.logManager) {
      await this.logManager.append({
        timestamp: new Date().toISOString(),
        type: 'note',
        content: note,
      });
    }
  }

  // --------------------------------------------------------------------------
  // Session Management
  // --------------------------------------------------------------------------

  /**
   * Get session working memory status.
   */
  async sessionStatus(sessionId: string = 'default'): Promise<{
    sessionId: string;
    size: number;
    capacity: number;
    activeMemories: Array<{ id: string; content: string }>;
  }> {
    await this.ensureStarted();

    const result = (await this.client!.callTool('session_status', { session_id: sessionId })) as {
      session_id: string;
      size: number;
      capacity: number;
      decay_seconds: number;
      active_memory_ids: string[];
      active_memories: Array<{ id: string; content: string }>;
    };

    return {
      sessionId: result.session_id,
      size: result.size,
      capacity: result.capacity,
      activeMemories: result.active_memories,
    };
  }

  /**
   * Clear a session's working memory.
   */
  async sessionClear(sessionId: string = 'default'): Promise<{ cleared: boolean; itemsRemoved: number }> {
    await this.ensureStarted();

    const result = (await this.client!.callTool('session_clear', { session_id: sessionId })) as {
      session_id: string;
      cleared: boolean;
      items_removed: number;
    };

    return {
      cleared: result.cleared,
      itemsRemoved: result.items_removed,
    };
  }

  /**
   * List all active sessions.
   */
  async sessionList(): Promise<Array<{ sessionId: string; size: number }>> {
    await this.ensureStarted();

    const result = (await this.client!.callTool('session_list')) as {
      sessions: Array<{ session_id: string; size: number }>;
      total: number;
    };

    return result.sessions.map((s) => ({
      sessionId: s.session_id,
      size: s.size,
    }));
  }
}

// ============================================================================
// Convenience Factory
// ============================================================================

/**
 * Create a Memory instance with common defaults.
 *
 * @param dbPath - Path to the Engram database
 * @param logDir - Optional path to daily log directory
 */
export function createMemory(dbPath: string, logDir?: string, pythonPath?: string): Memory {
  return new Memory({
    dbPath,
    logDir,
    pythonPath,
    enableLogs: !!logDir,
  });
}
