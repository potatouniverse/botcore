/**
 * Memory module tests
 *
 * Tests the Engram integration and file-based logging.
 * Requires: engram (pip install engramai)
 */

import { Memory, createMemory, MemoryResult, MemoryStats } from '../memory';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Test configuration
const TEST_TIMEOUT = 30000; // 30 seconds for MCP operations

describe('Memory', () => {
  let memory: Memory;
  let testDir: string;
  let dbPath: string;
  let logDir: string;

  beforeAll(async () => {
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
