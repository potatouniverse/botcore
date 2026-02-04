/**
 * BotCore Memory Module - Basic Example
 *
 * Demonstrates the core memory operations using the Engram integration.
 *
 * Requirements:
 *   pip install engramai
 *
 * Usage:
 *   npx ts-node examples/memory-basic.ts
 */

import { Memory, createMemory, MemoryResult } from '../src/core/memory';
import * as path from 'path';

async function main() {
  console.log('🧠 BotCore Memory Module - Basic Example\n');

  // Create a memory instance with file logging
  const memory = new Memory({
    dbPath: './example-memory.db',
    logDir: './example-logs',
    enableLogs: true,
  });

  try {
    // Start the Engram MCP connection
    console.log('Starting Engram MCP server...');
    await memory.start();
    console.log('✅ Connected!\n');

    // =========================================================================
    // 1. Store Memories
    // =========================================================================
    console.log('📝 Storing memories...\n');

    // Store different types of memories
    const factual = await memory.store('TypeScript is a typed superset of JavaScript', {
      type: 'factual',
      importance: 0.8,
    });
    console.log(`  Stored factual memory: ${factual.id} (layer: ${factual.layer})`);

    const relational = await memory.store('User prefers detailed explanations with examples', {
      type: 'relational',
      importance: 0.9,
    });
    console.log(`  Stored relational memory: ${relational.id} (layer: ${relational.layer})`);

    const procedural = await memory.store('To deploy: run tests first, then npm run build, then npm publish', {
      type: 'procedural',
      importance: 0.7,
    });
    console.log(`  Stored procedural memory: ${procedural.id} (layer: ${procedural.layer})`);

    // =========================================================================
    // 2. Recall Memories
    // =========================================================================
    console.log('\n🔍 Recalling memories...\n');

    const results = await memory.recall('TypeScript JavaScript programming', { limit: 5 });
    console.log(`  Found ${results.length} memories:\n`);

    for (const r of results) {
      console.log(`  [${r.confidenceLabel}] ${r.content.slice(0, 60)}...`);
      console.log(`    → confidence: ${(r.confidence * 100).toFixed(1)}%, strength: ${r.strength.toFixed(3)}\n`);
    }

    // =========================================================================
    // 3. Session-Aware Recall
    // =========================================================================
    console.log('🎯 Session-aware recall (reduces API calls)...\n');

    // First recall triggers full retrieval
    const session1 = await memory.sessionRecall('user preferences', {
      sessionId: 'demo-session',
      limit: 3,
    });
    console.log(`  Session recall 1: ${session1.results.length} results`);
    console.log(`    → Full recall triggered: ${session1.fullRecallTriggered}`);
    console.log(`    → Reason: ${session1.reason}`);
    console.log(`    → Working memory size: ${session1.workingMemorySize}\n`);

    // Second recall on similar topic may use cache
    const session2 = await memory.sessionRecall('what does the user prefer', {
      sessionId: 'demo-session',
      limit: 3,
    });
    console.log(`  Session recall 2: ${session2.results.length} results`);
    console.log(`    → Full recall triggered: ${session2.fullRecallTriggered}`);
    console.log(`    → Reason: ${session2.reason}\n`);

    // =========================================================================
    // 4. Get Specific Memory
    // =========================================================================
    console.log('📋 Getting specific memory...\n');

    const entry = await memory.get(factual.id);
    if (entry) {
      console.log(`  Memory ${entry.id}:`);
      console.log(`    Content: ${entry.content}`);
      console.log(`    Type: ${entry.type}`);
      console.log(`    Layer: ${entry.layer}`);
      console.log(`    Importance: ${entry.importance}`);
      console.log(`    Strength: ${entry.strength.toFixed(3)}`);
      console.log(`    Pinned: ${entry.pinned}\n`);
    }

    // =========================================================================
    // 5. Pin/Unpin Memory
    // =========================================================================
    console.log('📌 Pin/unpin operations...\n');

    await memory.pin(relational.id);
    console.log(`  Pinned memory ${relational.id}`);

    const pinnedEntry = await memory.get(relational.id);
    console.log(`  Verified pinned: ${pinnedEntry?.pinned}`);

    await memory.unpin(relational.id);
    console.log(`  Unpinned memory ${relational.id}\n`);

    // =========================================================================
    // 6. Reward Feedback
    // =========================================================================
    console.log('⭐ Reward feedback...\n');

    const reward = await memory.reward('That was really helpful!', 2);
    console.log(`  Applied feedback: ${reward.polarity} (confidence: ${(reward.confidence * 100).toFixed(0)}%)\n`);

    // =========================================================================
    // 7. Memory Stats
    // =========================================================================
    console.log('📊 Memory statistics...\n');

    const stats = await memory.stats();
    console.log(`  Total memories: ${stats.totalMemories}`);
    console.log(`  Layers: ${JSON.stringify(stats.layers)}`);
    console.log(`  Pinned: ${stats.pinned}\n`);

    // =========================================================================
    // 8. Consolidation
    // =========================================================================
    console.log('💤 Running consolidation (sleep cycle)...\n');

    const consolidated = await memory.consolidate(0.5);
    console.log(`  Consolidation complete!`);
    console.log(`  Total memories: ${consolidated.totalMemories}`);
    console.log(`  Layers: ${JSON.stringify(consolidated.layers)}\n`);

    // =========================================================================
    // 9. Daily Logs
    // =========================================================================
    console.log('📓 Daily log operations...\n');

    await memory.addNote('Example run completed successfully');

    const dates = await memory.listLogDates();
    console.log(`  Available log dates: ${dates.join(', ')}`);

    const todayLog = await memory.readTodayLog();
    console.log(`  Today's log has ${todayLog.length} entries`);
    if (todayLog.length > 0) {
      console.log(`  Latest entry: [${todayLog[todayLog.length - 1].type}] ${todayLog[todayLog.length - 1].content.slice(0, 50)}...\n`);
    }

    // =========================================================================
    // 10. Export
    // =========================================================================
    console.log('💾 Exporting database...\n');

    const exportResult = await memory.export('./example-memory-export.db');
    console.log(`  Exported to: ${exportResult.path}`);
    console.log(`  Size: ${(exportResult.sizeBytes / 1024).toFixed(1)} KB\n`);

    // =========================================================================
    // Done!
    // =========================================================================
    console.log('✅ Example complete!\n');
    console.log('Files created:');
    console.log('  - ./example-memory.db (Engram database)');
    console.log('  - ./example-logs/ (Daily markdown logs)');
    console.log('  - ./example-memory-export.db (Exported copy)');
  } finally {
    // Always stop the memory system
    await memory.stop();
    console.log('\n👋 Engram MCP server stopped.');
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
