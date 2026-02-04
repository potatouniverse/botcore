/**
 * Tests for FileSystemTools with GID tracking
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileSystemTools, createFileSystemTools } from '../filesystem';
import { Gid } from '../../core/gid';

describe('FileSystemTools', () => {
  const testDir = path.join(__dirname, 'test-workspace');
  let tools: FileSystemTools;
  let gid: Gid;
  
  beforeEach(async () => {
    // Create test workspace
    await fs.mkdir(testDir, { recursive: true });
    
    // Create a dummy GID graph to activate GID
    const gidDir = path.join(testDir, '.gid');
    await fs.mkdir(gidDir, { recursive: true });
    await fs.writeFile(
      path.join(gidDir, 'graph.yml'),
      'domain: test\nnodes: []\nedges: []\n',
      'utf-8'
    );
    
    // Create GID instance and load it
    gid = new Gid();
    await gid.load(testDir);
    
    // Create tools
    tools = createFileSystemTools({ gid, workspace: testDir });
  });
  
  afterEach(async () => {
    // Cleanup test workspace
    await fs.rm(testDir, { recursive: true, force: true });
  });
  
  describe('write', () => {
    it('should create a new file and record "create" activity', async () => {
      const filePath = 'test.ts';  // Use code file extension
      const content = 'export const x = 1;';
      
      await tools.write(filePath, content);
      
      // Verify file was created
      const fullPath = path.join(testDir, filePath);
      const readContent = await fs.readFile(fullPath, 'utf-8');
      expect(readContent).toBe(content);
      
      // Verify activity was recorded
      const activities = gid.getRecentActivities();
      expect(activities).toHaveLength(1);
      expect(activities[0]).toMatchObject({
        file: filePath,
        action: 'create',
      });
    });
    
    it('should overwrite existing file and record "edit" activity', async () => {
      const filePath = 'test.ts';  // Use code file extension
      
      // Create file first
      await tools.write(filePath, 'export const x = 1;');
      
      // Clear activities
      gid.clearActivities();
      
      // Overwrite file
      await tools.write(filePath, 'export const x = 2;');
      
      // Verify activity was recorded as "edit"
      const activities = gid.getRecentActivities();
      expect(activities).toHaveLength(1);
      expect(activities[0].action).toBe('edit');
    });
    
    it('should create nested directories automatically', async () => {
      const filePath = 'src/core/test.ts';
      const content = 'export const x = 1;';
      
      await tools.write(filePath, content);
      
      // Verify file was created
      const fullPath = path.join(testDir, filePath);
      const exists = await fs.access(fullPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });
  
  describe('edit', () => {
    it('should replace text and record "edit" activity', async () => {
      const filePath = 'test.ts';
      const original = 'const x = 1;\nconst y = 2;';
      
      // Create file first (this will record 'create' activity)
      await tools.write(filePath, original);
      
      // Verify first activity is 'create'
      let activities = gid.getRecentActivities();
      expect(activities[0].action).toBe('create');
      
      // Edit file
      await tools.edit(filePath, 'const x = 1;', 'const x = 100;');
      
      // Verify content was changed
      const fullPath = path.join(testDir, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      expect(content).toBe('const x = 100;\nconst y = 2;');
      
      // Verify edit activity was recorded (should have 2 activities total: create + edit)
      activities = gid.getRecentActivities();
      expect(activities).toHaveLength(2);
      expect(activities[1].action).toBe('edit');
    });
    
    it('should throw error if oldText not found', async () => {
      const filePath = 'test.ts';
      await tools.write(filePath, 'const x = 1;');
      
      await expect(
        tools.edit(filePath, 'const y = 2;', 'const y = 3;')
      ).rejects.toThrow('Old text not found');
    });
  });
  
  describe('delete', () => {
    it('should delete file and record "delete" activity', async () => {
      const filePath = 'test.ts';  // Use code file extension
      
      // Create file first (this records 'create' activity)
      await tools.write(filePath, 'export const x = 1;');
      
      // Delete file
      await tools.delete(filePath);
      
      // Verify file was deleted
      const fullPath = path.join(testDir, filePath);
      const exists = await fs.access(fullPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
      
      // Verify activities were recorded (create + delete)
      const activities = gid.getRecentActivities();
      expect(activities).toHaveLength(2);
      expect(activities[0].action).toBe('create');
      expect(activities[1].action).toBe('delete');
    });
  });
  
  describe('read', () => {
    it('should read file content', async () => {
      const filePath = 'test.ts';  // Use code file extension
      const content = 'export const x = 1;';
      
      // Create file first
      await tools.write(filePath, content);
      
      // Read file (doesn't record activity)
      const readContent = await tools.read(filePath);
      expect(readContent).toBe(content);
    });
  });
  
  describe('exists', () => {
    it('should return true for existing file', async () => {
      const filePath = 'test.txt';
      await tools.write(filePath, 'Content');
      
      const exists = await tools.exists(filePath);
      expect(exists).toBe(true);
    });
    
    it('should return false for non-existing file', async () => {
      const exists = await tools.exists('nonexistent.txt');
      expect(exists).toBe(false);
    });
  });
  
  describe('list', () => {
    it('should list directory contents', async () => {
      // Create some files
      await tools.write('file1.txt', 'Content 1');
      await tools.write('file2.txt', 'Content 2');
      await tools.write('subdir/file3.txt', 'Content 3');
      
      // List root directory
      const files = await tools.list('.');
      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.txt');
      expect(files).toContain('subdir');
    });
  });
  
  describe('Activity deduplication', () => {
    it('should deduplicate consecutive edits to same file', async () => {
      const filePath = 'test.ts';
      
      // Create file
      await tools.write(filePath, 'const x = 1;');
      
      // Edit multiple times
      await tools.edit(filePath, 'const x = 1;', 'const x = 2;');
      await tools.edit(filePath, 'const x = 2;', 'const x = 3;');
      await tools.edit(filePath, 'const x = 3;', 'const x = 4;');
      
      // Should have only 2 activities: 1 create + 1 edit (deduplicated)
      const activities = gid.getRecentActivities();
      expect(activities.length).toBeLessThanOrEqual(2);
    });
  });
  
  describe('Non-code file filtering', () => {
    it('should not track non-code files', async () => {
      // Create non-code files
      await tools.write('README.md', '# Readme');
      await tools.write('data.json', '{}');
      await tools.write('image.png', 'binary data');
      
      // Activities should be empty (filtered out)
      const activities = gid.getRecentActivities();
      expect(activities).toHaveLength(0);
    });
    
    it('should track code files', async () => {
      // Create code files
      await tools.write('src/index.ts', 'export const x = 1;');
      
      // Activity should be recorded
      const activities = gid.getRecentActivities();
      expect(activities).toHaveLength(1);
    });
  });
});
