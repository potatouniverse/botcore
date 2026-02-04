/**
 * GID (Graph Indexed Development) integration
 * 
 * Built-in task tracking and project graph management.
 * Designed for minimal overhead with aggressive caching.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// Types
// ============================================================================

export interface Task {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'done';
  tasks: string[];
  completedCount: number;
  totalCount: number;
}

export interface Activity {
  file: string;
  action: 'edit' | 'delete' | 'create';
  timestamp: number;
}

export interface GidMetrics {
  cacheHits: number;
  cacheMisses: number;
  avgLoadTimeMs: number;
  activitiesRecorded: number;
  contextInjections: number;
}

// ============================================================================
// Main Gid Class
// ============================================================================

export class Gid {
  private graphPath: string | null = null;
  private cachedTasks: Task[] | null = null;
  private cacheTime: number = 0;
  private activities: Activity[] = [];
  private activeTask: string | null = null;
  
  // Performance tracking
  private metrics: GidMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    avgLoadTimeMs: 0,
    activitiesRecorded: 0,
    contextInjections: 0,
  };
  
  // Configuration
  private readonly CACHE_TTL = 5 * 60 * 1000;  // 5 minutes
  private readonly MAX_ACTIVITIES = 10;
  
  /**
   * Check if GID is active for current project
   */
  get isActive(): boolean {
    return this.graphPath !== null;
  }
  
  /**
   * Load GID for a workspace (lazy, no parsing)
   */
  async load(workspace: string): Promise<void> {
    // Convert to absolute path
    const absoluteWorkspace = path.isAbsolute(workspace) 
      ? workspace 
      : path.resolve(process.cwd(), workspace);
    
    const graphPath = path.join(absoluteWorkspace, '.gid/graph.yml');
    
    if (fs.existsSync(graphPath)) {
      this.graphPath = graphPath;
    } else {
      this.graphPath = null;
    }
    
    // No YAML parsing here - that happens on first use
  }
  
  /**
   * Get current tasks (with caching)
   */
  async getCurrentTasks(): Promise<Task[]> {
    if (!this.isActive) return [];
    
    const now = Date.now();
    const cacheAge = now - this.cacheTime;
    
    // Use cache if fresh
    if (this.cachedTasks && cacheAge < this.CACHE_TTL) {
      this.metrics.cacheHits++;
      return this.cachedTasks;
    }
    
    // Cache miss - fetch from MCP
    this.metrics.cacheMisses++;
    const startTime = Date.now();
    
    try {
      const output = execSync(
        `mcporter call gid.gid_tasks graphPath="${this.graphPath}"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
      
      const tasks = this.parseTasksOutput(output);
      
      // Update cache
      this.cachedTasks = tasks;
      this.cacheTime = now;
      
      // Update metrics
      const loadTime = Date.now() - startTime;
      this.metrics.avgLoadTimeMs = 
        (this.metrics.avgLoadTimeMs * (this.metrics.cacheMisses - 1) + loadTime) / 
        this.metrics.cacheMisses;
      
      return tasks;
    } catch (error) {
      console.warn('Failed to load GID tasks:', error);
      return [];
    }
  }
  
  /**
   * Parse gid_tasks output into Task objects
   */
  private parseTasksOutput(output: string): Task[] {
    const tasks: Task[] = [];
    const lines = output.split('\n');
    
    let currentTask: Partial<Task> | null = null;
    
    for (const line of lines) {
      // Task header: "task-id [Type, status]"
      const headerMatch = line.match(/^(\S+)\s+\[.*,\s*(\w+)\]/);
      if (headerMatch) {
        if (currentTask) {
          tasks.push(currentTask as Task);
        }
        
        currentTask = {
          id: headerMatch[1],
          status: headerMatch[2] as Task['status'],
          tasks: [],
          completedCount: 0,
          totalCount: 0,
        };
        continue;
      }
      
      // Description line
      if (currentTask && line.match(/^\s+"[^"]+"/)) {
        currentTask.description = line.trim().replace(/^"|"$/g, '');
        continue;
      }
      
      // Tasks count line
      const tasksMatch = line.match(/Tasks:\s+(\d+)\/(\d+)/);
      if (currentTask && tasksMatch) {
        currentTask.completedCount = parseInt(tasksMatch[1]);
        currentTask.totalCount = parseInt(tasksMatch[2]);
        continue;
      }
      
      // Task items
      if (currentTask && line.match(/^\s+[☐☑✓✅]/)) {
        currentTask.tasks!.push(line.trim());
      }
    }
    
    if (currentTask) {
      tasks.push(currentTask as Task);
    }
    
    return tasks;
  }
  
  /**
   * Record activity (smart deduplication)
   */
  recordActivity(file: string, action: Activity['action']): void {
    if (!this.isActive) return;
    
    // Ignore non-code files
    if (!this.isCodeFile(file)) return;
    
    // Deduplicate consecutive edits to same file
    const lastActivity = this.activities[this.activities.length - 1];
    if (lastActivity?.file === file && lastActivity?.action === action) {
      lastActivity.timestamp = Date.now();
      return;
    }
    
    // Add new activity
    this.activities.push({
      file,
      action,
      timestamp: Date.now(),
    });
    
    this.metrics.activitiesRecorded++;
    
    // Keep only last N activities
    if (this.activities.length > this.MAX_ACTIVITIES) {
      this.activities.shift();
    }
  }
  
  /**
   * Check if file should be tracked
   */
  private isCodeFile(file: string): boolean {
    const codeExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h'];
    const codeDirs = ['src/', 'tests/', 'lib/', 'migrations/', 'test/', '__tests__/'];
    
    const ext = path.extname(file);
    
    // Check extension first
    if (codeExtensions.includes(ext)) {
      return true;
    }
    
    // Check if file is in a code directory
    for (const dir of codeDirs) {
      if (file.startsWith(dir) || file.includes(`/${dir}`)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get recent activities
   */
  getRecentActivities(): Activity[] {
    return [...this.activities];
  }
  
  /**
   * Clear all activities (for testing)
   */
  clearActivities(): void {
    this.activities = [];
  }
  
  /**
   * Set active task (for scoped operations)
   */
  setActiveTask(taskId: string | null): void {
    this.activeTask = taskId;
  }
  
  /**
   * Get active task
   */
  getActiveTask(): string | null {
    return this.activeTask;
  }
  
  /**
   * Get lightweight task summary for session start display
   */
  async getTaskSummary(): Promise<string> {
    if (!this.isActive) return 'No GID graph';
    
    const tasks = await this.getCurrentTasks();
    
    if (tasks.length === 0) {
      return 'No active tasks';
    }
    
    const inProgress = tasks.filter(t => t.status === 'active');
    const summary = inProgress.slice(0, 3).map(t => 
      `${t.id} [${t.completedCount}/${t.totalCount}]`
    ).join(', ');
    
    return `Current Tasks: ${summary}${inProgress.length > 3 ? ` (+${inProgress.length - 3} more)` : ''}`;
  }
  
  /**
   * Check if there are unfinished tasks
   */
  hasUnfinishedTasks(): boolean {
    return this.cachedTasks !== null && 
           this.cachedTasks.some(t => t.status === 'active' && t.completedCount < t.totalCount);
  }
  
  /**
   * Get performance metrics
   */
  getMetrics(): GidMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Invalidate cache (force reload on next access)
   */
  invalidateCache(): void {
    this.cachedTasks = null;
    this.cacheTime = 0;
  }
  
  /**
   * Get cache status
   */
  getCacheStatus(): { fresh: boolean; ageMs: number } {
    const ageMs = Date.now() - this.cacheTime;
    return {
      fresh: this.cachedTasks !== null && ageMs < this.CACHE_TTL,
      ageMs,
    };
  }
}
