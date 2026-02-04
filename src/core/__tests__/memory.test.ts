/**
 * Memory module tests
 *
 * Tests the Engram integration and file-based logging.
 * Mocks the MCP server subprocess for testing without Engram installed.
 */

import { Memory, createMemory, MemoryResult, MemoryStats } from '../memory';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';

// ============================================================================
// Mock MCP Server
// ============================================================================

// Store memories for cross-test consistency
const mockMemoryStore = new Map<string, {
  id: string;
  content: string;
  type: string;
  layer: string;
  importance: number;
  strength: number;
  stability: number;
  accessCount: number;
  createdAt: string;
  lastAccessed: string;
  pinned: boolean;
  source: string;
  tags: string[];
}>();

let mockRequestId = 0;
let mockMemoryIdCounter = 0;

function generateMemoryId(): string {
  return `mem-${++mockMemoryIdCounter}-${Date.now()}`;
}

function handleMcpRequest(request: {
  method: string;
  params?: Record<string, unknown>;
  id: number;
}): unknown {
  const { method, params, id } = request;

  // Handle initialize
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'engram-mock', version: '1.0.0' },
      },
    };
  }

  // Handle tools/call
  if (method === 'tools/call') {
    const toolName = (params as { name: string })?.name;
    const toolArgs = (params as { arguments?: Record<string, unknown> })?.arguments || {};

    const result = handleToolCall(toolName, toolArgs);
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      },
    };
  }

  // Unknown method
  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

function handleToolCall(toolName: string, args: Record<string, unknown>): unknown {
  switch (toolName) {
    case 'store': {
      const id = generateMemoryId();
      const content = args.content as string;
      const type = (args.type as string) || 'factual';
      const importance = (args.importance as number) || 0.5;
      const source = (args.source as string) || '';
      
      const memory = {
        id,
        content,
        type,
        layer: importance >= 0.7 ? 'stable' : 'transient',
        importance,
        strength: importance,
        stability: 0.5,
        accessCount: 0,
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        pinned: false,
        source,
        tags: [],
      };
      mockMemoryStore.set(id, memory);
      
      return { id, content, type, layer: memory.layer };
    }

    case 'recall': {
      const query = (args.query as string).toLowerCase();
      const limit = (args.limit as number) || 5;
      const types = args.types as string[] | undefined;
      
      const results: Array<{
        id: string;
        content: string;
        type: string;
        confidence: number;
        confidence_label: string;
        strength: number;
        age_days: number;
      }> = [];
      
      for (const [, memory] of mockMemoryStore) {
        // Simple fuzzy match
        const matchesContent = memory.content.toLowerCase().includes(query) ||
          query.split(' ').some(word => memory.content.toLowerCase().includes(word));
        const matchesType = !types || types.includes(memory.type);
        
        if (matchesContent && matchesType) {
          results.push({
            id: memory.id,
            content: memory.content,
            type: memory.type,
            confidence: 0.8,
            confidence_label: 'high',
            strength: memory.strength,
            age_days: 0,
          });
          
          // Update access count
          memory.accessCount++;
          memory.lastAccessed = new Date().toISOString();
        }
        
        if (results.length >= limit) break;
      }
      
      return results;
    }

    case 'session_recall': {
      const query = (args.query as string).toLowerCase();
      const sessionId = (args.session_id as string) || 'default';
      const limit = (args.limit as number) || 5;
      
      // Simulate recall with session tracking
      const results: Array<{
        id: string;
        content: string;
        type: string;
        confidence: number;
        confidence_label: string;
        strength: number;
        age_days: number;
        from_working_memory: boolean;
      }> = [];
      
      for (const [, memory] of mockMemoryStore) {
        const matchesContent = memory.content.toLowerCase().includes(query) ||
          query.split(' ').some(word => memory.content.toLowerCase().includes(word));
        
        if (matchesContent) {
          results.push({
            id: memory.id,
            content: memory.content,
            type: memory.type,
            confidence: 0.8,
            confidence_label: 'high',
            strength: memory.strength,
            age_days: 0,
            from_working_memory: false,
          });
        }
        
        if (results.length >= limit) break;
      }
      
      return {
        results,
        session_id: sessionId,
        full_recall_triggered: true,
        working_memory_size: results.length,
        reason: 'empty_wm',
      };
    }

    case 'consolidate': {
      return {
        consolidated: true,
        stats: {
          total_memories: mockMemoryStore.size,
          layers: { stable: Math.floor(mockMemoryStore.size / 2), transient: Math.ceil(mockMemoryStore.size / 2) },
          pinned: Array.from(mockMemoryStore.values()).filter(m => m.pinned).length,
        },
      };
    }

    case 'stats': {
      const types: Record<string, number> = {};
      for (const memory of mockMemoryStore.values()) {
        types[memory.type] = (types[memory.type] || 0) + 1;
      }
      
      return {
        total_memories: mockMemoryStore.size,
        layers: { stable: Math.floor(mockMemoryStore.size / 2), transient: Math.ceil(mockMemoryStore.size / 2) },
        pinned: Array.from(mockMemoryStore.values()).filter(m => m.pinned).length,
        types,
      };
    }

    case 'get': {
      const memoryId = args.memory_id as string;
      const memory = mockMemoryStore.get(memoryId);
      
      if (!memory) {
        return { error: 'Memory not found' };
      }
      
      return {
        id: memory.id,
        content: memory.content,
        type: memory.type,
        layer: memory.layer,
        importance: memory.importance,
        strength: memory.strength,
        stability: memory.stability,
        access_count: memory.accessCount,
        created_at: memory.createdAt,
        last_accessed: memory.lastAccessed,
        pinned: memory.pinned,
        source: memory.source,
        tags: memory.tags,
      };
    }

    case 'pin': {
      const memoryId = args.memory_id as string;
      const memory = mockMemoryStore.get(memoryId);
      
      if (memory) {
        memory.pinned = true;
        return { pinned: true };
      }
      return { error: 'Memory not found' };
    }

    case 'unpin': {
      const memoryId = args.memory_id as string;
      const memory = mockMemoryStore.get(memoryId);
      
      if (memory) {
        memory.pinned = false;
        return { pinned: false };
      }
      return { error: 'Memory not found' };
    }

    case 'reward': {
      const feedback = (args.feedback as string).toLowerCase();
      const polarity = feedback.includes('good') || feedback.includes('great') || feedback.includes('job')
        ? 'positive'
        : 'negative';
      
      return {
        polarity,
        confidence: 0.85,
        affected_memories: args.recent_n || 3,
      };
    }

    case 'forget': {
      const memoryId = args.memory_id as string;
      const threshold = (args.threshold as number) || 0.01;
      
      if (memoryId) {
        const deleted = mockMemoryStore.delete(memoryId);
        return {
          forgotten_count: deleted ? 1 : 0,
          pruned_ids: deleted ? [memoryId] : [],
        };
      }
      
      // Prune weak memories
      const toDelete: string[] = [];
      for (const [id, memory] of mockMemoryStore) {
        if (memory.strength < threshold && !memory.pinned) {
          toDelete.push(id);
        }
      }
      
      for (const id of toDelete) {
        mockMemoryStore.delete(id);
      }
      
      return {
        forgotten_count: toDelete.length,
        pruned_ids: toDelete,
      };
    }

    case 'export': {
      const exportPath = args.path as string;
      // Create a mock export file
      fs.writeFileSync(exportPath, JSON.stringify(Array.from(mockMemoryStore.entries())));
      const stats = fs.statSync(exportPath);
      
      return {
        exported_to: exportPath,
        size_bytes: stats.size,
      };
    }

    case 'session_status': {
      const sessionId = (args.session_id as string) || 'default';
      const activeMemories = Array.from(mockMemoryStore.values())
        .slice(0, 5)
        .map(m => ({ id: m.id, content: m.content }));
      
      return {
        session_id: sessionId,
        size: activeMemories.length,
        capacity: 7,
        decay_seconds: 300,
        active_memory_ids: activeMemories.map(m => m.id),
        active_memories: activeMemories,
      };
    }

    case 'session_clear': {
      const sessionId = (args.session_id as string) || 'default';
      return {
        session_id: sessionId,
        cleared: true,
        items_removed: 3,
      };
    }

    case 'session_list': {
      return {
        sessions: [
          { session_id: 'default', size: 3 },
          { session_id: 'test-session', size: 2 },
        ],
        total: 2,
      };
    }

    case 'hebbian_links': {
      return {
        source_id: args.memory_id,
        links: [],
        total_links: 0,
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// Track active mock processes for cleanup
const activeMockProcesses: Array<{ stdout: Readable; stderr: Readable; stdin: Writable }> = [];

// Mock child_process.spawn
jest.mock('child_process', () => {
  const originalModule = jest.requireActual('child_process');
  const { Readable, Writable } = require('stream');
  const { EventEmitter } = require('events');
  
  return {
    ...originalModule,
    spawn: jest.fn((command: string, args: string[], options: unknown) => {
      // Only mock engram MCP server calls
      if (args?.includes('-m') && args?.includes('engram.mcp_server')) {
        // Create a proper readable stream for stdout
        const mockStdout = new Readable({
          read() {} // No-op, we push data manually
        });
        
        // Create stderr as well
        const mockStderr = new Readable({
          read() {}
        });
        
        // Create stdin as a writable stream
        const mockStdin = new Writable({
          write(chunk: Buffer | string, encoding: string, callback: (error?: Error | null) => void) {
            const data = chunk.toString();
            // Parse JSON-RPC request and respond
            try {
              const request = JSON.parse(data.trim());
              
              // Skip notifications (no id)
              if (request.id === undefined) {
                callback();
                return;
              }
              
              const response = handleMcpRequest(request);
              
              // Push response to stdout asynchronously
              setImmediate(() => {
                mockStdout.push(JSON.stringify(response) + '\n');
              });
            } catch (e) {
              // Ignore parse errors
            }
            callback();
          }
        });
        
        const mockProcess = new EventEmitter();
        mockProcess.stdout = mockStdout;
        mockProcess.stderr = mockStderr;
        mockProcess.stdin = mockStdin;
        mockProcess.kill = jest.fn(() => {
          // Properly end the streams
          if (!mockStdout.destroyed) {
            mockStdout.push(null); // End the stream
            mockStdout.destroy();
          }
          if (!mockStderr.destroyed) {
            mockStderr.push(null);
            mockStderr.destroy();
          }
          if (!mockStdin.destroyed) {
            mockStdin.destroy();
          }
          mockProcess.emit('close', 0);
        });
        
        // Track for cleanup
        activeMockProcesses.push({ stdout: mockStdout, stderr: mockStderr, stdin: mockStdin });
        
        return mockProcess;
      }
      
      // Fall back to original for other commands
      return originalModule.spawn(command, args, options);
    }),
  };
});

// Test configuration
const TEST_TIMEOUT = 10000; // Reduced since we're mocking

describe('Memory', () => {
  let memory: Memory;
  let testDir: string;
  let dbPath: string;
  let logDir: string;

  beforeAll(async () => {
    // Reset mock state
    mockMemoryStore.clear();
    mockMemoryIdCounter = 0;
    
    // Create temp directory for tests
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botcore-memory-test-'));
    dbPath = path.join(testDir, 'test-memory.db');
    logDir = path.join(testDir, 'logs');

    memory = new Memory({
      dbPath,
      logDir,
      enableLogs: true,
    });

    // Start the memory system
    await memory.start();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Stop the memory system
    await memory.stop();

    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
    
    // Clean up any remaining mock streams
    for (const proc of activeMockProcesses) {
      if (!proc.stdout.destroyed) proc.stdout.destroy();
      if (!proc.stderr.destroyed) proc.stderr.destroy();
      if (!proc.stdin.destroyed) proc.stdin.destroy();
    }
    activeMockProcesses.length = 0;
  });

  describe('store()', () => {
    it('should store a factual memory', async () => {
      const result = await memory.store('The capital of France is Paris', {
        type: 'factual',
        importance: 0.8,
      });

      expect(result).toHaveProperty('id');
      expect(result.id).toBeTruthy();
      expect(result.layer).toBeDefined();
    }, TEST_TIMEOUT);

    it('should store a relational memory', async () => {
      const result = await memory.store('User prefers concise answers', {
        type: 'relational',
        importance: 0.7,
        source: 'test',
      });

      expect(result).toHaveProperty('id');
      expect(result.id).toBeTruthy();
    }, TEST_TIMEOUT);

    it('should store with default options', async () => {
      const result = await memory.store('Simple memory without options');
      expect(result).toHaveProperty('id');
    }, TEST_TIMEOUT);
  });

  describe('recall()', () => {
    it('should recall stored memories', async () => {
      // First store some memories
      await memory.store('TypeScript is a typed superset of JavaScript', {
        type: 'factual',
        importance: 0.8,
      });

      // Then recall
      const results = await memory.recall('TypeScript JavaScript', { limit: 5 });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('content');
      expect(results[0]).toHaveProperty('confidence');
      expect(results[0]).toHaveProperty('confidenceLabel');
    }, TEST_TIMEOUT);

    it('should respect limit option', async () => {
      const results = await memory.recall('memory', { limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    }, TEST_TIMEOUT);

    it('should filter by type', async () => {
      await memory.store('Procedural test memory', {
        type: 'procedural',
        importance: 0.6,
      });

      const results = await memory.recall('procedural test', {
        types: ['procedural'],
        limit: 10,
      });

      // All results should be procedural type
      results.forEach((r) => {
        expect(r.type).toBe('procedural');
      });
    }, TEST_TIMEOUT);
  });

  describe('sessionRecall()', () => {
    it('should perform session-aware recall', async () => {
      const result = await memory.sessionRecall('user preferences', {
        sessionId: 'test-session',
        limit: 5,
      });

      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('fullRecallTriggered');
      expect(result).toHaveProperty('workingMemorySize');
      expect(result).toHaveProperty('reason');
      expect(result.sessionId).toBe('test-session');
    }, TEST_TIMEOUT);

    it('should cache results for continuous topics', async () => {
      // First recall triggers full retrieval
      const first = await memory.sessionRecall('TypeScript', {
        sessionId: 'topic-test',
        limit: 5,
      });

      expect(first.fullRecallTriggered).toBe(true);

      // Second recall with similar topic should use cache
      const second = await memory.sessionRecall('TypeScript features', {
        sessionId: 'topic-test',
        limit: 5,
      });

      // Note: Whether this is cached depends on Engram's topic similarity detection
      expect(second).toHaveProperty('reason');
    }, TEST_TIMEOUT);
  });

  describe('consolidate()', () => {
    it('should run memory consolidation', async () => {
      const stats = await memory.consolidate(0.5);

      expect(stats).toHaveProperty('totalMemories');
      expect(stats).toHaveProperty('layers');
      expect(stats).toHaveProperty('pinned');
      expect(stats.totalMemories).toBeGreaterThan(0);
    }, TEST_TIMEOUT);
  });

  describe('stats()', () => {
    it('should return memory statistics', async () => {
      const stats = await memory.stats();

      expect(stats).toHaveProperty('totalMemories');
      expect(stats).toHaveProperty('layers');
      expect(stats).toHaveProperty('pinned');
      expect(typeof stats.totalMemories).toBe('number');
    }, TEST_TIMEOUT);
  });

  describe('get()', () => {
    it('should get a specific memory by ID', async () => {
      const stored = await memory.store('Memory to retrieve', {
        type: 'factual',
        importance: 0.5,
      });

      const retrieved = await memory.get(stored.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(stored.id);
      expect(retrieved?.content).toBe('Memory to retrieve');
      expect(retrieved?.type).toBe('factual');
    }, TEST_TIMEOUT);

    it('should return null for non-existent memory', async () => {
      const result = await memory.get('non-existent-id-12345');
      expect(result).toBeNull();
    }, TEST_TIMEOUT);
  });

  describe('pin() / unpin()', () => {
    it('should pin and unpin a memory', async () => {
      const stored = await memory.store('Memory to pin', {
        type: 'factual',
        importance: 0.5,
      });

      // Pin it
      const pinned = await memory.pin(stored.id);
      expect(pinned).toBe(true);

      // Verify it's pinned
      const entry = await memory.get(stored.id);
      expect(entry?.pinned).toBe(true);

      // Unpin it
      const unpinned = await memory.unpin(stored.id);
      expect(unpinned).toBe(true);

      // Verify it's unpinned
      const entry2 = await memory.get(stored.id);
      expect(entry2?.pinned).toBe(false);
    }, TEST_TIMEOUT);
  });

  describe('reward()', () => {
    it('should apply positive feedback', async () => {
      const result = await memory.reward('good job!', 3);

      expect(result).toHaveProperty('polarity');
      expect(result).toHaveProperty('confidence');
      expect(result.polarity).toBe('positive');
    }, TEST_TIMEOUT);

    it('should apply negative feedback', async () => {
      const result = await memory.reward('that was wrong', 3);

      expect(result).toHaveProperty('polarity');
      expect(result.polarity).toBe('negative');
    }, TEST_TIMEOUT);
  });

  describe('forget()', () => {
    it('should prune weak memories', async () => {
      const result = await memory.forget(undefined, 0.0001);

      expect(result).toHaveProperty('forgottenCount');
      expect(result).toHaveProperty('prunedIds');
      expect(Array.isArray(result.prunedIds)).toBe(true);
    }, TEST_TIMEOUT);
  });

  describe('export() / import()', () => {
    it('should export the database', async () => {
      const exportPath = path.join(testDir, 'exported-memory.db');
      const result = await memory.export(exportPath);

      expect(result.path).toBe(exportPath);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(fs.existsSync(exportPath)).toBe(true);
    }, TEST_TIMEOUT);

    it('should import a database', async () => {
      // First export
      const exportPath = path.join(testDir, 'to-import.db');
      await memory.export(exportPath);

      // Create new memory instance with different path
      const newDbPath = path.join(testDir, 'imported-memory.db');
      const newMemory = new Memory({ dbPath: newDbPath });
      await newMemory.start();

      // Import
      const result = await newMemory.import(exportPath, true);

      expect(result.imported).toBe(true);
      expect(result.stats).toBeDefined();
      expect(result.stats?.totalMemories).toBeGreaterThan(0);

      await newMemory.stop();
    }, TEST_TIMEOUT);
  });

  describe('Daily Logs', () => {
    it('should create daily log entries', async () => {
      // Store triggers a log entry
      await memory.store('Logged memory entry', { type: 'factual' });

      // Read today's log
      const entries = await memory.readTodayLog();

      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[entries.length - 1]).toHaveProperty('type');
      expect(entries[entries.length - 1]).toHaveProperty('content');
    }, TEST_TIMEOUT);

    it('should list log dates', async () => {
      const dates = await memory.listLogDates();

      expect(Array.isArray(dates)).toBe(true);
      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }, TEST_TIMEOUT);

    it('should add manual notes', async () => {
      await memory.addNote('This is a manual note');

      const entries = await memory.readTodayLog();
      const noteEntry = entries.find((e) => e.type === 'note');

      expect(noteEntry).toBeDefined();
      expect(noteEntry?.content).toContain('manual note');
    }, TEST_TIMEOUT);
  });

  describe('Session Management', () => {
    it('should get session status', async () => {
      const status = await memory.sessionStatus('test-session');

      expect(status).toHaveProperty('sessionId');
      expect(status).toHaveProperty('size');
      expect(status).toHaveProperty('capacity');
      expect(status).toHaveProperty('activeMemories');
    }, TEST_TIMEOUT);

    it('should clear session working memory', async () => {
      // First populate the session
      await memory.sessionRecall('something', { sessionId: 'clear-test' });

      // Then clear it
      const result = await memory.sessionClear('clear-test');

      expect(result).toHaveProperty('cleared');
      expect(result).toHaveProperty('itemsRemoved');
    }, TEST_TIMEOUT);

    it('should list sessions', async () => {
      const sessions = await memory.sessionList();

      expect(Array.isArray(sessions)).toBe(true);
      sessions.forEach((s) => {
        expect(s).toHaveProperty('sessionId');
        expect(s).toHaveProperty('size');
      });
    }, TEST_TIMEOUT);
  });
});

describe('createMemory() factory', () => {
  it('should create a Memory instance', () => {
    const mem = createMemory('/tmp/test.db', '/tmp/logs');
    expect(mem).toBeInstanceOf(Memory);
    expect(mem.dbPath).toBe('/tmp/test.db');
    expect(mem.logDir).toBe('/tmp/logs');
  });

  it('should disable logs when logDir is not provided', () => {
    const mem = createMemory('/tmp/test.db');
    expect(mem.enableLogs).toBe(false);
  });
});

describe('Memory class construction', () => {
  it('should accept legacy string constructor', () => {
    const mem = new Memory('/tmp/legacy.db');
    expect(mem.dbPath).toBe('/tmp/legacy.db');
  });

  it('should accept options object', () => {
    const mem = new Memory({
      dbPath: '/tmp/options.db',
      logDir: '/tmp/logs',
      pythonCommand: 'python3',
      enableLogs: true,
    });
    expect(mem.dbPath).toBe('/tmp/options.db');
    expect(mem.logDir).toBe('/tmp/logs');
    expect(mem.pythonCommand).toBe('python3');
    expect(mem.enableLogs).toBe(true);
  });
});
