/**
 * GID Performance Test
 * 
 * Tests caching and smart tracking performance optimizations
 */

import { Gid } from '../gid';
import * as fs from 'fs';
import * as path from 'path';

describe('GID Performance Tests', () => {
  let gid: Gid;
  const testWorkspace = path.join(__dirname, '../../../'); // botcore root
  
  beforeEach(async () => {
    gid = new Gid();
    await gid.load(testWorkspace);
  });
  
  test('should load workspace without parsing graph', async () => {
    const startTime = Date.now();
    
    const gid2 = new Gid();
    await gid2.load(testWorkspace);
    
    const loadTime = Date.now() - startTime;
    
    expect(gid2.isActive).toBe(true);
    expect(loadTime).toBeLessThan(10); // Should be <10ms (no YAML parsing)
    
    console.log(`✅ Workspace load: ${loadTime}ms`);
  });
  
  test('should cache tasks for 5 minutes', async () => {
    if (!gid.isActive) {
      console.log('⏭️  Skipped: No GID graph in workspace');
      return;
    }
    
    // First call (cache miss)
    const start1 = Date.now();
    const tasks1 = await gid.getCurrentTasks();
    const time1 = Date.now() - start1;
    
    // Second call (cache hit)
    const start2 = Date.now();
    const tasks2 = await gid.getCurrentTasks();
    const time2 = Date.now() - start2;
    
    // Third call (cache hit)
    const start3 = Date.now();
    const tasks3 = await gid.getCurrentTasks();
    const time3 = Date.now() - start3;
    
    expect(tasks2).toEqual(tasks1);
    expect(tasks3).toEqual(tasks1);
    
    // Cache hits should be MUCH faster
    expect(time2).toBeLessThan(time1 / 10);
    expect(time3).toBeLessThan(time1 / 10);
    
    console.log(`✅ First call (miss): ${time1}ms`);
    console.log(`✅ Second call (hit): ${time2}ms`);
    console.log(`✅ Third call (hit): ${time3}ms`);
    console.log(`✅ Speedup: ${Math.round(time1 / time2)}x`);
    
    const metrics = gid.getMetrics();
    expect(metrics.cacheHits).toBe(2);
    expect(metrics.cacheMisses).toBe(1);
  });
  
  test('should deduplicate consecutive edits to same file', () => {
    // Edit same file 10 times
    for (let i = 0; i < 10; i++) {
      gid.recordActivity('src/api.ts', 'edit');
    }
    
    const activities = gid.getRecentActivities();
    
    // Should only record 1 activity (deduplicated)
    expect(activities.length).toBe(1);
    expect(activities[0].file).toBe('src/api.ts');
    
    console.log(`✅ 10 edits → 1 activity (deduplicated)`);
  });
  
  test('should track different files separately', () => {
    gid.recordActivity('src/api.ts', 'edit');
    gid.recordActivity('src/db.ts', 'edit');
    gid.recordActivity('src/api.ts', 'edit');
    
    const activities = gid.getRecentActivities();
    
    expect(activities.length).toBe(3);
    
    console.log(`✅ 3 different edits → 3 activities`);
  });
  
  test('should ignore non-code files', () => {
    gid.recordActivity('README.md', 'edit');
    gid.recordActivity('.gitignore', 'edit');
    gid.recordActivity('docs/guide.md', 'edit');
    
    const activities = gid.getRecentActivities();
    
    expect(activities.length).toBe(0);
    
    console.log(`✅ 3 non-code edits → 0 activities (ignored)`);
  });
  
  test('should limit activity history to 10 entries', () => {
    // Record 20 activities
    for (let i = 0; i < 20; i++) {
      gid.recordActivity(`src/file${i}.ts`, 'edit');
    }
    
    const activities = gid.getRecentActivities();
    
    expect(activities.length).toBe(10);
    expect(activities[0].file).toBe('src/file10.ts'); // Oldest kept
    expect(activities[9].file).toBe('src/file19.ts'); // Newest
    
    console.log(`✅ 20 activities → 10 kept (FIFO)`);
  });
  
  test('should provide accurate cache status', async () => {
    if (!gid.isActive) {
      console.log('⏭️  Skipped: No GID graph');
      return;
    }
    
    // Before first call
    let status = gid.getCacheStatus();
    expect(status.fresh).toBe(false);
    
    // After first call
    await gid.getCurrentTasks();
    status = gid.getCacheStatus();
    expect(status.fresh).toBe(true);
    expect(status.ageMs).toBeLessThan(1000);
    
    // Invalidate cache
    gid.invalidateCache();
    status = gid.getCacheStatus();
    expect(status.fresh).toBe(false);
    
    console.log(`✅ Cache status tracking works`);
  });
  
  test('should measure average load time', async () => {
    if (!gid.isActive) {
      console.log('⏭️  Skipped: No GID graph');
      return;
    }
    
    // Force 3 cache misses
    for (let i = 0; i < 3; i++) {
      gid.invalidateCache();
      await gid.getCurrentTasks();
    }
    
    const metrics = gid.getMetrics();
    
    expect(metrics.cacheMisses).toBe(3);
    expect(metrics.avgLoadTimeMs).toBeGreaterThan(0);
    
    console.log(`✅ Average load time: ${Math.round(metrics.avgLoadTimeMs)}ms`);
  });
  
  test('BENCHMARK: 100 file edits with caching', async () => {
    if (!gid.isActive) {
      console.log('⏭️  Skipped: No GID graph');
      return;
    }
    
    const startTime = Date.now();
    
    // Simulate 100 file edits
    for (let i = 0; i < 100; i++) {
      await gid.getCurrentTasks();  // Cache hit after first call
      gid.recordActivity(`src/file${i % 10}.ts`, 'edit');
    }
    
    const totalTime = Date.now() - startTime;
    const avgPerEdit = totalTime / 100;
    
    const metrics = gid.getMetrics();
    
    console.log(`\n📊 BENCHMARK RESULTS (100 edits):`);
    console.log(`   Total time: ${totalTime}ms`);
    console.log(`   Avg per edit: ${avgPerEdit.toFixed(2)}ms`);
    console.log(`   Cache hits: ${metrics.cacheHits}`);
    console.log(`   Cache misses: ${metrics.cacheMisses}`);
    console.log(`   Activities recorded: ${metrics.activitiesRecorded}`);
    
    // Performance targets
    expect(totalTime).toBeLessThan(1000); // <1s for 100 edits
    expect(avgPerEdit).toBeLessThan(10);   // <10ms per edit
    expect(metrics.cacheHits).toBeGreaterThan(90); // >90% cache hit rate
  });
});
