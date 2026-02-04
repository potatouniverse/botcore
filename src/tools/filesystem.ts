/**
 * Filesystem tools with GID activity tracking
 * 
 * Wraps fs operations to automatically record GID activities.
 * Use these instead of raw fs when you want activity tracking.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Gid } from '../core/gid';

export interface FileSystemToolsOptions {
  /** GID instance for activity tracking */
  gid?: Gid;
  
  /** Workspace root (for relative path resolution) */
  workspace: string;
}

export class FileSystemTools {
  private gid?: Gid;
  private workspace: string;
  
  constructor(options: FileSystemToolsOptions) {
    this.gid = options.gid;
    this.workspace = options.workspace;
  }
  
  /**
   * Read file content
   */
  async read(filePath: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    return fs.readFile(fullPath, 'utf-8');
  }
  
  /**
   * Write content to file (create or overwrite)
   * Records 'create' or 'edit' activity based on file existence
   */
  async write(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    const exists = await this.exists(filePath);
    
    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Write file
    await fs.writeFile(fullPath, content, 'utf-8');
    
    // Record activity
    const relativePath = path.relative(this.workspace, fullPath);
    this.gid?.recordActivity(relativePath, exists ? 'edit' : 'create');
  }
  
  /**
   * Edit file by replacing text (precise surgical edit)
   * Records 'edit' activity
   */
  async edit(filePath: string, oldText: string, newText: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    
    // Read current content
    const content = await fs.readFile(fullPath, 'utf-8');
    
    // Check if oldText exists
    if (!content.includes(oldText)) {
      throw new Error(
        `Old text not found in ${filePath}. ` +
        `Make sure oldText matches exactly (including whitespace).`
      );
    }
    
    // Replace text
    const newContent = content.replace(oldText, newText);
    
    // Write back
    await fs.writeFile(fullPath, newContent, 'utf-8');
    
    // Record activity
    const relativePath = path.relative(this.workspace, fullPath);
    this.gid?.recordActivity(relativePath, 'edit');
  }
  
  /**
   * Delete file
   * Records 'delete' activity
   */
  async delete(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    
    // Delete file
    await fs.unlink(fullPath);
    
    // Record activity
    const relativePath = path.relative(this.workspace, fullPath);
    this.gid?.recordActivity(relativePath, 'delete');
  }
  
  /**
   * Check if file exists
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = this.resolvePath(filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * List directory contents
   */
  async list(dirPath: string): Promise<string[]> {
    const fullPath = this.resolvePath(dirPath);
    return fs.readdir(fullPath);
  }
  
  /**
   * Resolve path (handle relative/absolute)
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.workspace, filePath);
  }
}

/**
 * Create FileSystemTools instance
 */
export function createFileSystemTools(options: FileSystemToolsOptions): FileSystemTools {
  return new FileSystemTools(options);
}
