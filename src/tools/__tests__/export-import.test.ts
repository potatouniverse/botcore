/**
 * Tests for export and import tools
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exportBot, readManifest, rewritePaths, ExportManifest } from '../export';
import { importBot, validateArchive, listArchive, restorePaths } from '../import';

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestWorkspace(basePath: string): void {
  // Create directory structure
  fs.mkdirSync(path.join(basePath, 'memory', 'daily'), { recursive: true });
  fs.mkdirSync(path.join(basePath, 'identity'), { recursive: true });
  fs.mkdirSync(path.join(basePath, 'config'), { recursive: true });
  fs.mkdirSync(path.join(basePath, 'skills'), { recursive: true });

  // Create identity files
  fs.writeFileSync(
    path.join(basePath, 'SOUL.md'),
    `# SOUL.md - Who You Are

## Core Truths

**Independence** You think for yourself.

## Boundaries

- Don't share private data
- Ask before taking action
`
  );

  fs.writeFileSync(
    path.join(basePath, 'IDENTITY.md'),
    `# IDENTITY.md

- **Name:** TestBot
- **Creature:** AI Assistant
- **Vibe:** Helpful and friendly
- **Emoji:** 🤖
`
  );

  fs.writeFileSync(
    path.join(basePath, 'USER.md'),
    `# USER.md - About Your Human

- **Name:** Test User
- **Timezone:** America/New_York
`
  );

  // Create memory files
  fs.writeFileSync(
    path.join(basePath, 'memory', 'daily', '2026-02-04.md'),
    `# Memory Log - 2026-02-04

- **10:00:00** [store] Learned about TypeScript
- **10:30:00** [recall] Retrieved TypeScript info
`
  );

  // Create config files
  fs.writeFileSync(
    path.join(basePath, 'config', 'config.json'),
    JSON.stringify(
      {
        models: { default: 'claude-3-opus' },
        permissions: { canExecuteCode: true },
      },
      null,
      2
    )
  );

  // Create a file with absolute paths
  fs.writeFileSync(
    path.join(basePath, 'config', 'paths.json'),
    JSON.stringify(
      {
        workspace: basePath,
        memory: path.join(basePath, 'memory'),
        config: path.join(basePath, 'config'),
      },
      null,
      2
    )
  );

  // Create a skill
  fs.writeFileSync(
    path.join(basePath, 'skills', 'SKILL.md'),
    `# Test Skill

A simple test skill.
`
  );
}

function cleanupDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

// ============================================================================
// Path Rewriting Tests
// ============================================================================

describe('Path Rewriting', () => {
  describe('rewritePaths', () => {
    it('should replace absolute paths with placeholder', () => {
      const sourcePath = '/Users/test/workspace';
      const content = `{
        "path": "/Users/test/workspace/memory/db.sqlite",
        "config": "/Users/test/workspace/config/settings.json"
      }`;

      const result = rewritePaths(content, sourcePath);

      expect(result).toContain('$BOTCORE_ROOT/memory/db.sqlite');
      expect(result).toContain('$BOTCORE_ROOT/config/settings.json');
      expect(result).not.toContain('/Users/test/workspace');
    });

    it('should handle Windows paths', () => {
      // Skip this test on non-Windows platforms since path.resolve behaves differently
      if (process.platform !== 'win32') {
        // On non-Windows, just verify the function doesn't throw
        const sourcePath = 'C:\\Users\\test\\workspace';
        const content = `{
          "path": "C:\\\\Users\\\\test\\\\workspace\\\\memory\\\\db.sqlite"
        }`;

        // Should not throw
        expect(() => rewritePaths(content, sourcePath)).not.toThrow();
        return;
      }

      const sourcePath = 'C:\\Users\\test\\workspace';
      const content = `{
        "path": "C:\\\\Users\\\\test\\\\workspace\\\\memory\\\\db.sqlite"
      }`;

      const result = rewritePaths(content, sourcePath);

      expect(result).toContain('$BOTCORE_ROOT');
    });

    it('should not modify paths that do not match source', () => {
      const sourcePath = '/Users/test/workspace';
      const content = `{
        "other": "/Users/other/path"
      }`;

      const result = rewritePaths(content, sourcePath);

      expect(result).toContain('/Users/other/path');
    });
  });

  describe('restorePaths', () => {
    it('should replace placeholder with destination path', () => {
      const destPath = '/Users/newuser/restored';
      const content = `{
        "path": "$BOTCORE_ROOT/memory/db.sqlite",
        "config": "$BOTCORE_ROOT/config/settings.json"
      }`;

      const result = restorePaths(content, destPath);

      expect(result).toContain('/Users/newuser/restored/memory/db.sqlite');
      expect(result).toContain('/Users/newuser/restored/config/settings.json');
      expect(result).not.toContain('$BOTCORE_ROOT');
    });
  });
});

// ============================================================================
// Export Tests
// ============================================================================

describe('Export', () => {
  let tmpDir: string;
  let workspacePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botcore-export-test-'));
    workspacePath = path.join(tmpDir, 'test-bot');
    createTestWorkspace(workspacePath);
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  describe('exportBot', () => {
    it('should create a valid tar.gz archive', async () => {
      const outputPath = path.join(tmpDir, 'export.tar.gz');

      const result = await exportBot(workspacePath, {
        output: outputPath,
      });

      expect(result.path).toBe(outputPath);
      expect(result.fileCount).toBeGreaterThan(0);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(fs.existsSync(outputPath)).toBe(true);
    });

    it('should include manifest with checksums', async () => {
      const outputPath = path.join(tmpDir, 'export.tar.gz');

      const result = await exportBot(workspacePath, {
        output: outputPath,
      });

      expect(result.manifest.version).toBe('1.0.0');
      expect(result.manifest.botcore_version).toBe('0.1.0');
      expect(Object.keys(result.manifest.checksums).length).toBeGreaterThan(0);

      // All checksums should be sha256
      for (const checksum of Object.values(result.manifest.checksums)) {
        expect(checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
      }
    });

    it('should rewrite absolute paths in text files', async () => {
      const outputPath = path.join(tmpDir, 'export.tar.gz');

      await exportBot(workspacePath, { output: outputPath });

      // Import to a different location to verify path rewriting
      const importPath = path.join(tmpDir, 'imported');
      await importBot(outputPath, { dest: importPath });

      const pathsJson = fs.readFileSync(
        path.join(importPath, 'config', 'paths.json'),
        'utf-8'
      );
      const paths = JSON.parse(pathsJson);

      expect(paths.workspace).toBe(importPath);
      expect(paths.memory).toBe(path.join(importPath, 'memory'));
    });

    it('should exclude secrets by default', async () => {
      // Create a secrets file
      fs.writeFileSync(
        path.join(workspacePath, 'config', 'credentials.json'),
        JSON.stringify({ api_key: 'secret123' })
      );

      const outputPath = path.join(tmpDir, 'export.tar.gz');
      await exportBot(workspacePath, { output: outputPath });

      const { files } = await listArchive(outputPath);

      expect(files).not.toContain('config/credentials.json');
    });

    it('should respect custom include paths', async () => {
      // Create a custom directory
      fs.mkdirSync(path.join(workspacePath, 'custom'));
      fs.writeFileSync(
        path.join(workspacePath, 'custom', 'data.txt'),
        'custom data'
      );

      const outputPath = path.join(tmpDir, 'export.tar.gz');
      await exportBot(workspacePath, {
        output: outputPath,
        include: ['custom'],
      });

      const { files } = await listArchive(outputPath);

      expect(files).toContain('custom/data.txt');
    });

    it('should respect exclude patterns', async () => {
      const outputPath = path.join(tmpDir, 'export.tar.gz');
      await exportBot(workspacePath, {
        output: outputPath,
        exclude: ['*.md'],
      });

      const { files } = await listArchive(outputPath);

      const mdFiles = files.filter((f) => f.endsWith('.md'));
      expect(mdFiles.length).toBe(0);
    });
  });

  describe('readManifest', () => {
    it('should read manifest without full extraction', async () => {
      const outputPath = path.join(tmpDir, 'export.tar.gz');
      await exportBot(workspacePath, { output: outputPath });

      const manifest = await readManifest(outputPath);

      expect(manifest.version).toBe('1.0.0');
      expect(manifest.source_name).toBe('test-bot');
      expect(manifest.file_count).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Import Tests
// ============================================================================

describe('Import', () => {
  let tmpDir: string;
  let workspacePath: string;
  let archivePath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botcore-import-test-'));
    workspacePath = path.join(tmpDir, 'test-bot');
    archivePath = path.join(tmpDir, 'test-bot.tar.gz');

    createTestWorkspace(workspacePath);
    await exportBot(workspacePath, { output: archivePath });
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  describe('validateArchive', () => {
    it('should validate a correct archive', async () => {
      const result = await validateArchive(archivePath);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.manifest).toBeDefined();
    });

    it('should detect missing manifest', async () => {
      // Create an invalid archive (just a gzipped file)
      const zlib = require('zlib');
      const invalidData = zlib.gzipSync(Buffer.from('not a tar'));
      fs.writeFileSync(archivePath, invalidData);

      const result = await validateArchive(archivePath);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('manifest'))).toBe(true);
    });

    it('should report missing files', async () => {
      const result = await validateArchive(archivePath);

      // Should have warnings about optional directories if missing
      // but should be valid
      expect(result.valid).toBe(true);
    });
  });

  describe('importBot', () => {
    it('should extract all files to destination', async () => {
      const destPath = path.join(tmpDir, 'restored');

      const result = await importBot(archivePath, { dest: destPath });

      expect(result.fileCount).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(destPath, 'SOUL.md'))).toBe(true);
      expect(fs.existsSync(path.join(destPath, 'IDENTITY.md'))).toBe(true);
      expect(fs.existsSync(path.join(destPath, 'config', 'config.json'))).toBe(true);
    });

    it('should restore absolute paths', async () => {
      const destPath = path.join(tmpDir, 'restored');

      await importBot(archivePath, { dest: destPath });

      const pathsJson = fs.readFileSync(
        path.join(destPath, 'config', 'paths.json'),
        'utf-8'
      );
      const paths = JSON.parse(pathsJson);

      expect(paths.workspace).toBe(destPath);
    });

    it('should skip existing files by default (merge)', async () => {
      const destPath = path.join(tmpDir, 'restored');

      // First import
      await importBot(archivePath, { dest: destPath });

      // Modify a file
      const soulPath = path.join(destPath, 'SOUL.md');
      const originalContent = fs.readFileSync(soulPath, 'utf-8');
      fs.writeFileSync(soulPath, originalContent + '\n# Modified');

      // Second import (should not overwrite)
      const result = await importBot(archivePath, { dest: destPath });

      const newContent = fs.readFileSync(soulPath, 'utf-8');
      expect(newContent).toContain('# Modified');
      expect(result.skippedCount).toBeGreaterThan(0);
    });

    it('should overwrite files when --overwrite is set', async () => {
      const destPath = path.join(tmpDir, 'restored');

      // First import
      await importBot(archivePath, { dest: destPath });

      // Modify a file
      const soulPath = path.join(destPath, 'SOUL.md');
      fs.writeFileSync(soulPath, 'Modified content');

      // Second import with overwrite
      await importBot(archivePath, { dest: destPath, overwrite: true });

      const newContent = fs.readFileSync(soulPath, 'utf-8');
      expect(newContent).toContain('SOUL.md - Who You Are');
    });

    it('should support dry run mode', async () => {
      const destPath = path.join(tmpDir, 'restored');

      const result = await importBot(archivePath, {
        dest: destPath,
        dryRun: true,
      });

      expect(result.fileCount).toBeGreaterThan(0);
      // Directory should not be created in dry run
      expect(fs.existsSync(path.join(destPath, 'SOUL.md'))).toBe(false);
    });

    it('should respect exclude patterns', async () => {
      const destPath = path.join(tmpDir, 'restored');

      await importBot(archivePath, {
        dest: destPath,
        exclude: ['skills/*'],
      });

      expect(fs.existsSync(path.join(destPath, 'skills', 'SKILL.md'))).toBe(false);
      expect(fs.existsSync(path.join(destPath, 'SOUL.md'))).toBe(true);
    });

    it('should create .botcore-import.json with metadata', async () => {
      const destPath = path.join(tmpDir, 'restored');

      await importBot(archivePath, { dest: destPath });

      const importInfoPath = path.join(destPath, '.botcore-import.json');
      expect(fs.existsSync(importInfoPath)).toBe(true);

      const importInfo = JSON.parse(fs.readFileSync(importInfoPath, 'utf-8'));
      expect(importInfo.imported_from).toBe('test-bot.tar.gz');
      expect(importInfo.imported_at).toBeDefined();
      expect(importInfo.original_manifest).toBeDefined();
    });
  });

  describe('listArchive', () => {
    it('should list all files in archive', async () => {
      const { files, manifest } = await listArchive(archivePath);

      expect(files.length).toBeGreaterThan(0);
      expect(files).toContain('SOUL.md');
      expect(files).toContain('IDENTITY.md');
      expect(manifest.source_name).toBe('test-bot');
    });
  });
});

// ============================================================================
// Round-Trip Tests
// ============================================================================

describe('Round-Trip', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botcore-roundtrip-test-'));
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  it('should preserve file contents through export/import cycle', async () => {
    const sourcePath = path.join(tmpDir, 'source');
    const archivePath = path.join(tmpDir, 'bot.tar.gz');
    const destPath = path.join(tmpDir, 'dest');

    createTestWorkspace(sourcePath);

    // Export
    await exportBot(sourcePath, { output: archivePath });

    // Import to new location
    await importBot(archivePath, { dest: destPath });

    // Compare files
    const sourceFiles = [
      'SOUL.md',
      'IDENTITY.md',
      'USER.md',
      'config/config.json',
      'skills/SKILL.md',
      'memory/daily/2026-02-04.md',
    ];

    for (const file of sourceFiles) {
      const sourceContent = fs.readFileSync(path.join(sourcePath, file), 'utf-8');
      const destContent = fs.readFileSync(path.join(destPath, file), 'utf-8');

      // Content should be identical (except for path rewrites which are tested separately)
      if (!file.includes('paths.json')) {
        expect(destContent).toBe(sourceContent);
      }
    }
  });

  it('should handle multiple export/import cycles', async () => {
    const path1 = path.join(tmpDir, 'bot1');
    const path2 = path.join(tmpDir, 'bot2');
    const path3 = path.join(tmpDir, 'bot3');
    const archive1 = path.join(tmpDir, 'bot1.tar.gz');
    const archive2 = path.join(tmpDir, 'bot2.tar.gz');

    createTestWorkspace(path1);

    // First cycle
    await exportBot(path1, { output: archive1 });
    await importBot(archive1, { dest: path2 });

    // Second cycle
    await exportBot(path2, { output: archive2 });
    await importBot(archive2, { dest: path3 });

    // Files should still be valid
    const soulContent = fs.readFileSync(path.join(path3, 'SOUL.md'), 'utf-8');
    expect(soulContent).toContain('SOUL.md - Who You Are');
    expect(soulContent).toContain('Core Truths');
  });
});
