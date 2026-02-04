/**
 * Memory Integration Tests
 *
 * Tests real Engram MCP server integration.
 * Requires: Engram MCP server installed (pip install engramai)
 * Run with: npm run test:integration
 */

import { Memory, createMemory, MemoryResult, MemoryStats } from '../memory';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

// ============================================================================
// Setup & Helpers
// ============================================================================

let testDir: string;
let testDbPath: string;
let memory: Memory;

function checkEngramAvailable(): boolean {
  try {
    // Check if python3 is available
    execSync('which python3', { stdio: 'ignore' });
    
    // Check if engram package is installed
    execSync('python3 -c "import engram.mcp_server"', { 
      stdio: 'ignore'
    });
    
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  // Check if Engram is available
  if (!checkEngramAvailable()) {
    console.warn('⚠️  Skipping integration tests: Engram not available');
    console.warn('   Install with: pip install engramai');
  }
  
  // Create temp test directory
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botcore-integration-'));
  testDbPath = path.join(testDir, 'engram-test.db');
  
  // Create memory instance
  memory = new Memory({
    dbPath: testDbPath,
    logDir: path.join(testDir, 'memory'),
    enableLogs: true,
  });
  
  // Start if available
  if (checkEngramAvailable()) {
    await memory.start();
  }
});

afterAll(async () => {
  // Cleanup
  if (checkEngramAvailable()) {
    await memory.stop();
  }
  
  // Remove temp directory
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Memory Integration Tests', () => {
  // Skip all tests if Engram not available
  const engramAvailable = checkEngramAvailable();
  
  test('should store and recall factual memory', async () => {
    if (!engramAvailable) {
      console.log('⏭️  Skipped: Engram not available');
      return;
    }

    // Store a fact
    const storeResult = await memory.store('The user prefers Python for scripting', {
      type: 'factual',
      importance: 0.8,
    });

    expect(storeResult).toBeDefined();
    expect(storeResult.id).toBeDefined();
    expect(typeof storeResult.id).toBe('string');

    // Recall the fact
    const recalled = await memory.recall('user programming preferences', {
      limit: 5,
    });

    expect(Array.isArray(recalled)).toBe(true);
    expect(recalled.length).toBeGreaterThan(0);
    
    // Should find our stored fact
    const foundFact = recalled.find(m => 
      m.content.includes('Python')
    );
    expect(foundFact).toBeDefined();
    expect(foundFact?.type).toBe('factual');
  }, 15000);

  test('should store and recall relational memory', async () => {
    if (!engramAvailable) {
      console.log('⏭️  Skipped: Engram not available');
      return;
    }

    const storeResult = await memory.store('potato is working on AgentVerse project', {
      type: 'relational',
      importance: 0.9,
    });

    expect(storeResult.id).toBeDefined();

    const recalled = await memory.recall('what is potato working on', {
      limit: 3,
    });

    expect(recalled.length).toBeGreaterThan(0);
    
    const foundRelation = recalled.find(m =>
      m.content.includes('AgentVerse')
    );
    expect(foundRelation).toBeDefined();
    expect(foundRelation?.type).toBe('relational');
  }, 15000);

  test('should store procedural knowledge', async () => {
    if (!engramAvailable) {
      console.log('⏭️  Skipped: Engram not available');
      return;
    }

    const storeResult = await memory.store('To deploy: run npm build, then vercel deploy', {
      type: 'procedural',
      importance: 0.85,
    });

    expect(storeResult.id).toBeDefined();

    const recalled = await memory.recall('how to deploy', {
      limit: 3,
    });

    expect(recalled.length).toBeGreaterThan(0);
    const foundProcedure = recalled.find(m =>
      m.content.includes('vercel deploy')
    );
    expect(foundProcedure).toBeDefined();
    expect(foundProcedure?.type).toBe('procedural');
  }, 15000);

  test('should get memory statistics', async () => {
    if (!engramAvailable) {
      console.log('⏭️  Skipped: Engram not available');
      return;
    }

    const stats = await memory.stats();

    expect(stats).toBeDefined();
    expect(stats.totalMemories).toBeGreaterThanOrEqual(0);
    expect(stats.layers).toBeDefined();
    expect(typeof stats.layers).toBe('object');
    expect(typeof stats.pinned).toBe('number');
  }, 15000);

  test('should consolidate memories', async () => {
    if (!engramAvailable) {
      console.log('⏭️  Skipped: Engram not available');
      return;
    }

    // Store multiple memories
    await memory.store('User likes TypeScript', {
      type: 'relational',
      importance: 0.7,
    });

    await memory.store('User dislikes Java', {
      type: 'relational',
      importance: 0.6,
    });

    // Consolidate
    const stats = await memory.consolidate(1.0);

    expect(stats).toBeDefined();
    expect(stats.totalMemories).toBeGreaterThan(0);
  }, 15000);

  test('should pin and unpin memories', async () => {
    if (!engramAvailable) {
      console.log('⏭️  Skipped: Engram not available');
      return;
    }

    // Store a memory
    const storeResult = await memory.store('Critical system password: do not forget', {
      type: 'factual',
      importance: 1.0,
    });

    const memoryId = storeResult.id;

    // Pin it
    const pinned = await memory.pin(memoryId);
    expect(pinned).toBe(true);

    // Verify stats show pinned count
    const statsAfterPin = await memory.stats();
    expect(statsAfterPin.pinned).toBeGreaterThan(0);

    // Unpin it
    const unpinned = await memory.unpin(memoryId);
    expect(unpinned).toBe(true);
  }, 15000);

  test('should forget low-strength memories', async () => {
    if (!engramAvailable) {
      console.log('⏭️  Skipped: Engram not available');
      return;
    }

    // Store a weak memory
    await memory.store('Temporary test data - should be forgotten', {
      type: 'factual',
      importance: 0.1,
    });

    // Get initial count
    const statsBefore = await memory.stats();
    const countBefore = statsBefore.totalMemories;

    // Forget weak memories (using threshold, no query needed)
    const forgetResult = await memory.forget(undefined, 0.5);
    expect(forgetResult).toBeDefined();
    expect(forgetResult.forgottenCount).toBeGreaterThanOrEqual(0);

    // Count should decrease or stay same
    const statsAfter = await memory.stats();
    const countAfter = statsAfter.totalMemories;
    expect(countAfter).toBeLessThanOrEqual(countBefore);
  }, 15000);

  test('should reward memories on positive feedback', async () => {
    if (!engramAvailable) {
      console.log('⏭️  Skipped: Engram not available');
      return;
    }

    // Store a memory
    const storeResult = await memory.store('Helpful suggestion that worked well', {
      type: 'procedural',
      importance: 0.7,
    });

    const memoryId = storeResult.id;

    // Reward it (feedback text only, rewards recent memories)
    const rewardResult = await memory.reward('This was helpful!', 1);

    expect(rewardResult).toBeDefined();
    expect(rewardResult.polarity).toBeDefined();

    // Get the memory and check it exists
    const retrieved = await memory.get(memoryId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.content).toContain('Helpful suggestion');
  }, 15000);

  test('should handle memory export', async () => {
    if (!engramAvailable) {
      console.log('⏭️  Skipped: Engram not available');
      return;
    }

    const exportPath = path.join(testDir, 'export.db');
    const exportResult = await memory.export(exportPath);

    expect(exportResult).toBeDefined();
    expect(exportResult.path).toBe(exportPath);
    expect(exportResult.sizeBytes).toBeGreaterThanOrEqual(0);
    
    // Check file exists
    expect(fs.existsSync(exportPath)).toBe(true);
    
    // Clean up
    fs.unlinkSync(exportPath);
  }, 15000);

  test('should maintain ACT-R activation over multiple recalls', async () => {
    if (!engramAvailable) {
      console.log('⏭️  Skipped: Engram not available');
      return;
    }

    // Store a memory
    const storeResult = await memory.store('Testing ACT-R activation decay', {
      type: 'factual',
      importance: 0.8,
    });

    const memoryId = storeResult.id;

    // Recall it multiple times to boost activation
    for (let i = 0; i < 3; i++) {
      await memory.recall('ACT-R activation', {
        limit: 5,
      });
    }

    // Get the memory and check stats
    const retrieved = await memory.get(memoryId);
    expect(retrieved).toBeDefined();
    expect(retrieved).not.toBeNull();
    
    // Access count should reflect recalls
    expect(retrieved!.accessCount).toBeGreaterThan(1);
  }, 15000);

  test('should write daily memory log to file', async () => {
    if (!engramAvailable) {
      console.log('⏭️  Skipped: Engram not available');
      return;
    }

    // Store a memory (triggers log write)
    await memory.store('Test memory for file logging', {
      type: 'factual',
      importance: 0.5,
    });

    // Wait a bit for async write
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check memory directory exists
    const memoryDir = path.join(testDir, 'memory');
    expect(fs.existsSync(memoryDir)).toBe(true);

    // Check today's log file exists
    const today = new Date().toISOString().split('T')[0];
    const logPath = path.join(memoryDir, `${today}.md`);
    expect(fs.existsSync(logPath)).toBe(true);

    // Check content
    const logContent = fs.readFileSync(logPath, 'utf-8');
    expect(logContent).toContain('Test memory for file logging');
  }, 15000);

  test('should use session-aware recall', async () => {
    if (!engramAvailable) {
      console.log('⏭️  Skipped: Engram not available');
      return;
    }

    // Store a memory
    await memory.store('Session recall test memory', {
      type: 'factual',
      importance: 0.7,
    });

    // First recall (should trigger full recall)
    const result1 = await memory.sessionRecall('session recall test', {
      sessionId: 'test-session',
      limit: 5,
    });

    expect(result1).toBeDefined();
    expect(result1.sessionId).toBe('test-session');
    expect(result1.fullRecallTriggered).toBe(true);
    expect(Array.isArray(result1.results)).toBe(true);

    // Second recall with same topic (should use working memory)
    const result2 = await memory.sessionRecall('session recall again', {
      sessionId: 'test-session',
      limit: 5,
    });

    expect(result2.sessionId).toBe('test-session');
    // Working memory should be populated
    expect(result2.workingMemorySize).toBeGreaterThanOrEqual(0);
  }, 15000);
});
