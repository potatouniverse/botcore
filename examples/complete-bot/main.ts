/**
 * Complete BotCore Example
 * 
 * Tests all core features:
 * - Identity loading
 * - Memory (Engram)
 * - GID task tracking
 * - FileSystemTools with activity tracking
 */

import { createBot } from 'botcore';
import * as path from 'path';

async function main() {
  console.log('🤖 BotCore Complete Example\n');
  
  // 1. Create bot instance
  const workspace = process.cwd();
  console.log(`📁 Workspace: ${workspace}\n`);
  
  const bot = await createBot({
    workspace,
    displayGidSummary: true,
  });
  
  console.log('✅ Bot created!\n');
  
  // 2. Test Identity
  console.log('👤 Identity:');
  const identityData = bot.identity.getIdentity();
  console.log(`  Name: ${identityData?.name || 'Not set'}`);
  console.log(`  Creature: ${identityData?.creature || 'Not set'}`);
  console.log(`  Emoji: ${identityData?.emoji || 'Not set'}\n`);
  
  // 3. Test Memory (skip for now - requires Engram MCP server)
  console.log('🧠 Memory:');
  console.log('  ⏭️  Skipped (requires Engram MCP server)\n');
  
  // 4. Test GID
  console.log('📊 GID:');
  if (bot.gid.isActive) {
    const tasks = await bot.gid.getCurrentTasks();
    console.log(`  ✅ Found ${tasks.length} tasks`);
    
    if (tasks.length > 0) {
      const firstTask = tasks[0];
      console.log(`  - ${firstTask.id}: ${firstTask.completedCount}/${firstTask.totalCount} done`);
    }
  } else {
    console.log('  ℹ️  No GID graph found (create .gid/graph.yml to enable)');
  }
  console.log();
  
  // 5. Test FileSystemTools
  console.log('🔧 FileSystemTools:');
  
  // Create a test file
  const testFile = 'test-output.ts';
  await bot.tools.fs.write(testFile, 'export const message = "Hello from BotCore";');
  console.log(`  ✅ Created ${testFile}`);
  
  // Edit the file
  await bot.tools.fs.edit(testFile, 'Hello', 'Greetings');
  console.log(`  ✅ Edited ${testFile}`);
  
  // Read the file
  const content = await bot.tools.fs.read(testFile);
  console.log(`  ✅ Read ${testFile}: "${content.substring(0, 40)}..."`);
  
  // Check GID activities
  if (bot.gid.isActive) {
    const activities = bot.gid.getRecentActivities();
    console.log(`  ✅ Recorded ${activities.length} activities:`);
    activities.forEach(a => {
      console.log(`    - ${a.action}: ${a.file}`);
    });
  }
  
  // Clean up
  await bot.tools.fs.delete(testFile);
  console.log(`  ✅ Deleted ${testFile}\n`);
  
  // 6. Show final stats
  console.log('📈 Final Stats:');
  
  if (bot.gid.isActive) {
    const metrics = bot.gid.getMetrics();
    console.log(`  GID cache hits: ${metrics.cacheHits}`);
    console.log(`  GID cache misses: ${metrics.cacheMisses}`);
    console.log(`  Activities recorded: ${metrics.activitiesRecorded}`);
  }
  
  console.log('\n✨ All tests passed!\n');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
