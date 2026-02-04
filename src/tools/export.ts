/**
 * Export tool - Package a bot into a portable archive
 *
 * Creates a .tar.gz archive containing:
 * - botcore.json manifest with checksums
 * - memory/ (engram.db, daily logs)
 * - identity/ (SOUL.md, IDENTITY.md, USER.md)
 * - config/ (models.json, permissions.json, config.json)
 * - skills/ (optional custom skills)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { pipeline } from 'stream/promises';

// ============================================================================
// Types
// ============================================================================

export interface ExportOptions {
  /** Output archive path (default: <sourceName>.tar.gz) */
  output?: string;
  /** Include session data (default: false) */
  includeSessions?: boolean;
  /** Include secrets/API keys (default: false - DANGEROUS) */
  includeSecrets?: boolean;
  /** Custom files/folders to include */
  include?: string[];
  /** Files/patterns to exclude */
  exclude?: string[];
  /** Compression level 0-9 (default: 6) */
  compressionLevel?: number;
  /** Verbose logging */
  verbose?: boolean;
}

export interface ExportManifest {
  /** Manifest format version */
  version: '1.0.0';
  /** ISO timestamp of creation */
  created: string;
  /** BotCore version that created this package */
  botcore_version: string;
  /** Source path (sanitized, no absolute paths) */
  source_name: string;
  /** SHA256 checksums for all files */
  checksums: Record<string, string>;
  /** Total uncompressed size in bytes */
  total_size: number;
  /** File count */
  file_count: number;
  /** Export options used */
  options: {
    includeSessions: boolean;
    includeSecrets: boolean;
    include?: string[];
    exclude?: string[];
  };
  /** Platform info */
  platform: {
    os: string;
    node: string;
  };
}

export interface ExportResult {
  /** Output archive path */
  path: string;
  /** Archive size in bytes */
  sizeBytes: number;
  /** Number of files included */
  fileCount: number;
  /** Manifest data */
  manifest: ExportManifest;
}

// ============================================================================
// TAR Implementation (minimal, no external deps)
// ============================================================================

/**
 * Create a TAR header for a file entry
 */
function createTarHeader(
  name: string,
  size: number,
  mtime: number,
  isDir: boolean = false
): Buffer {
  const header = Buffer.alloc(512);

  // Name (100 bytes)
  header.write(name.slice(0, 99), 0, 'utf-8');

  // Mode (8 bytes) - octal
  const mode = isDir ? '0000755' : '0000644';
  header.write(mode + ' \0', 100, 'utf-8');

  // UID (8 bytes)
  header.write('0000000\0', 108, 'utf-8');

  // GID (8 bytes)
  header.write('0000000\0', 116, 'utf-8');

  // Size (12 bytes) - octal
  const sizeOctal = isDir ? '00000000000' : size.toString(8).padStart(11, '0');
  header.write(sizeOctal + ' ', 124, 'utf-8');

  // Mtime (12 bytes) - octal
  const mtimeOctal = Math.floor(mtime / 1000).toString(8).padStart(11, '0');
  header.write(mtimeOctal + ' ', 136, 'utf-8');

  // Placeholder for checksum (8 spaces)
  header.write('        ', 148, 'utf-8');

  // Type flag (1 byte)
  header.write(isDir ? '5' : '0', 156, 'utf-8');

  // Link name (100 bytes) - empty
  // Magic (6 bytes)
  header.write('ustar ', 257, 'utf-8');

  // Version (2 bytes)
  header.write('00', 263, 'utf-8');

  // Calculate checksum
  let checksum = 0;
  for (let i = 0; i < 512; i++) {
    checksum += header[i];
  }
  const checksumOctal = checksum.toString(8).padStart(6, '0') + '\0 ';
  header.write(checksumOctal, 148, 'utf-8');

  return header;
}

/**
 * Pad data to 512-byte blocks
 */
function padToBlock(data: Buffer): Buffer {
  const remainder = data.length % 512;
  if (remainder === 0) return data;
  const padding = Buffer.alloc(512 - remainder);
  return Buffer.concat([data, padding]);
}

// ============================================================================
// Path Rewriting
// ============================================================================

/**
 * Rewrite absolute paths in content to relative paths
 */
export function rewritePaths(content: string, sourcePath: string): string {
  // Normalize the source path
  const normalizedSource = path.resolve(sourcePath);

  // Replace absolute paths with relative placeholder
  let result = content;

  // Match the source path and replace with $BOTCORE_ROOT
  const escapedPath = normalizedSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pathRegex = new RegExp(escapedPath, 'g');
  result = result.replace(pathRegex, '$BOTCORE_ROOT');

  // Also handle paths with forward slashes (for cross-platform)
  const forwardSlashPath = normalizedSource.replace(/\\/g, '/');
  if (forwardSlashPath !== normalizedSource) {
    const escapedForward = forwardSlashPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const forwardRegex = new RegExp(escapedForward, 'g');
    result = result.replace(forwardRegex, '$BOTCORE_ROOT');
  }

  return result;
}

/**
 * Calculate SHA256 checksum of data
 */
function sha256(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ============================================================================
// File Collection
// ============================================================================

interface FileEntry {
  /** Relative path in archive */
  archivePath: string;
  /** Absolute path on disk */
  diskPath: string;
  /** File size */
  size: number;
  /** Modification time */
  mtime: number;
  /** Is directory */
  isDir: boolean;
}

/**
 * Default directories to export
 */
const DEFAULT_DIRS = ['memory', 'identity', 'config', 'skills'];

/**
 * Default files to export (at root)
 */
const DEFAULT_FILES = [
  'SOUL.md',
  'IDENTITY.md',
  'USER.md',
  'AGENTS.md',
  'MEMORY.md',
  'TOOLS.md',
];

/**
 * Patterns to always exclude (secrets, temp files)
 */
const ALWAYS_EXCLUDE = [
  '.git',
  '.DS_Store',
  'node_modules',
  '*.log',
  '.env',
  '.env.*',
  'secrets',
  '*.key',
  '*.pem',
  'credentials.json',
  '.clawdbot/secrets',
];

/**
 * Check if a path matches any exclude pattern
 */
function shouldExclude(
  relativePath: string,
  excludePatterns: string[],
  includeSecrets: boolean
): boolean {
  const patterns = includeSecrets
    ? excludePatterns
    : [...ALWAYS_EXCLUDE, ...excludePatterns];

  for (const pattern of patterns) {
    // Simple glob matching
    if (pattern.startsWith('*')) {
      if (relativePath.endsWith(pattern.slice(1))) return true;
    } else if (pattern.endsWith('*')) {
      if (relativePath.startsWith(pattern.slice(0, -1))) return true;
    } else if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      if (regex.test(relativePath)) return true;
    } else {
      // Exact match or directory match
      if (relativePath === pattern || relativePath.startsWith(pattern + '/')) {
        return true;
      }
      // Also match basename
      if (path.basename(relativePath) === pattern) return true;
    }
  }

  return false;
}

/**
 * Recursively collect files from a directory
 */
function collectFiles(
  dirPath: string,
  basePath: string,
  archivePrefix: string,
  excludePatterns: string[],
  includeSecrets: boolean
): FileEntry[] {
  const entries: FileEntry[] = [];

  if (!fs.existsSync(dirPath)) {
    return entries;
  }

  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    return entries;
  }

  // Add directory entry
  const dirRelative = path.relative(basePath, dirPath);
  const archiveDirPath = archivePrefix
    ? path.posix.join(archivePrefix, dirRelative)
    : dirRelative;

  if (archiveDirPath && !shouldExclude(archiveDirPath, excludePatterns, includeSecrets)) {
    entries.push({
      archivePath: archiveDirPath + '/',
      diskPath: dirPath,
      size: 0,
      mtime: stat.mtimeMs,
      isDir: true,
    });
  }

  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const relativePath = path.relative(basePath, itemPath);
    const archivePath = archivePrefix
      ? path.posix.join(archivePrefix, relativePath)
      : relativePath;

    // Check exclusion
    if (shouldExclude(archivePath, excludePatterns, includeSecrets)) {
      continue;
    }

    const itemStat = fs.statSync(itemPath);

    if (itemStat.isDirectory()) {
      entries.push(
        ...collectFiles(itemPath, basePath, archivePrefix, excludePatterns, includeSecrets)
      );
    } else if (itemStat.isFile()) {
      entries.push({
        archivePath: archivePath.replace(/\\/g, '/'),
        diskPath: itemPath,
        size: itemStat.size,
        mtime: itemStat.mtimeMs,
        isDir: false,
      });
    }
  }

  return entries;
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Export a bot to a portable tar.gz archive
 *
 * @param sourcePath - Path to the bot workspace
 * @param options - Export options
 * @returns Export result with manifest
 *
 * @example
 * ```typescript
 * const result = await exportBot('/path/to/my-bot', {
 *   output: 'my-bot.tar.gz',
 *   verbose: true
 * });
 * console.log(`Exported ${result.fileCount} files to ${result.path}`);
 * ```
 */
export async function exportBot(
  sourcePath: string,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const {
    includeSessions = false,
    includeSecrets = false,
    include = [],
    exclude = [],
    compressionLevel = 6,
    verbose = false,
  } = options;

  // Resolve source path
  const resolvedSource = path.resolve(sourcePath);
  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Source path does not exist: ${resolvedSource}`);
  }

  // Generate output path
  const sourceName = path.basename(resolvedSource);
  const output = options.output || `${sourceName}.tar.gz`;
  const resolvedOutput = path.resolve(output);

  if (verbose) {
    console.log(`Exporting bot from: ${resolvedSource}`);
    console.log(`Output: ${resolvedOutput}`);
  }

  // Collect files to export
  const allEntries: FileEntry[] = [];
  const checksums: Record<string, string> = {};
  let totalSize = 0;

  // Collect default directories
  for (const dir of DEFAULT_DIRS) {
    const dirPath = path.join(resolvedSource, dir);
    const entries = collectFiles(dirPath, resolvedSource, '', exclude, includeSecrets);
    allEntries.push(...entries);
  }

  // Collect default root files
  for (const file of DEFAULT_FILES) {
    const filePath = path.join(resolvedSource, file);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (!shouldExclude(file, exclude, includeSecrets)) {
        allEntries.push({
          archivePath: file,
          diskPath: filePath,
          size: stat.size,
          mtime: stat.mtimeMs,
          isDir: false,
        });
      }
    }
  }

  // Collect custom includes
  for (const inc of include) {
    const incPath = path.join(resolvedSource, inc);
    if (fs.existsSync(incPath)) {
      const stat = fs.statSync(incPath);
      if (stat.isDirectory()) {
        const entries = collectFiles(incPath, resolvedSource, '', exclude, includeSecrets);
        allEntries.push(...entries);
      } else {
        allEntries.push({
          archivePath: inc.replace(/\\/g, '/'),
          diskPath: incPath,
          size: stat.size,
          mtime: stat.mtimeMs,
          isDir: false,
        });
      }
    }
  }

  // Deduplicate entries by archive path
  const seen = new Set<string>();
  const uniqueEntries = allEntries.filter((entry) => {
    if (seen.has(entry.archivePath)) return false;
    seen.add(entry.archivePath);
    return true;
  });

  // Sort entries (directories first, then alphabetically)
  uniqueEntries.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.archivePath.localeCompare(b.archivePath);
  });

  if (verbose) {
    console.log(`Found ${uniqueEntries.length} files to export`);
  }

  // Build TAR archive in memory
  const tarChunks: Buffer[] = [];

  for (const entry of uniqueEntries) {
    if (entry.isDir) {
      // Directory header
      const header = createTarHeader(entry.archivePath, 0, entry.mtime, true);
      tarChunks.push(header);
    } else {
      // Read file content
      let content = fs.readFileSync(entry.diskPath);

      // Rewrite paths in text files
      const ext = path.extname(entry.diskPath).toLowerCase();
      const textExtensions = ['.md', '.json', '.txt', '.yml', '.yaml', '.ts', '.js'];
      if (textExtensions.includes(ext)) {
        const textContent = content.toString('utf-8');
        const rewritten = rewritePaths(textContent, resolvedSource);
        content = Buffer.from(rewritten, 'utf-8');
      }

      // Calculate checksum
      checksums[entry.archivePath] = 'sha256:' + sha256(content);
      totalSize += content.length;

      // File header and content
      const header = createTarHeader(entry.archivePath, content.length, entry.mtime, false);
      tarChunks.push(header);
      tarChunks.push(padToBlock(content));

      if (verbose) {
        console.log(`  + ${entry.archivePath} (${content.length} bytes)`);
      }
    }
  }

  // Create manifest
  const manifest: ExportManifest = {
    version: '1.0.0',
    created: new Date().toISOString(),
    botcore_version: '0.1.0',
    source_name: sourceName,
    checksums,
    total_size: totalSize,
    file_count: uniqueEntries.filter((e) => !e.isDir).length,
    options: {
      includeSessions,
      includeSecrets,
      include: include.length > 0 ? include : undefined,
      exclude: exclude.length > 0 ? exclude : undefined,
    },
    platform: {
      os: process.platform,
      node: process.version,
    },
  };

  // Add manifest to TAR
  const manifestContent = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
  checksums['botcore.json'] = 'sha256:' + sha256(manifestContent);
  const manifestHeader = createTarHeader('botcore.json', manifestContent.length, Date.now(), false);
  tarChunks.unshift(padToBlock(manifestContent));
  tarChunks.unshift(manifestHeader);

  // Add end-of-archive markers (two 512-byte zero blocks)
  tarChunks.push(Buffer.alloc(1024));

  // Combine TAR chunks
  const tarData = Buffer.concat(tarChunks);

  // Compress with gzip
  const gzipOptions: zlib.ZlibOptions = { level: compressionLevel };
  const compressedData = await new Promise<Buffer>((resolve, reject) => {
    zlib.gzip(tarData, gzipOptions, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

  // Write output file
  const outputDir = path.dirname(resolvedOutput);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(resolvedOutput, compressedData);

  if (verbose) {
    console.log(`\nArchive created: ${resolvedOutput}`);
    console.log(`  Uncompressed: ${(totalSize / 1024).toFixed(1)} KB`);
    console.log(`  Compressed: ${(compressedData.length / 1024).toFixed(1)} KB`);
    console.log(`  Ratio: ${((1 - compressedData.length / totalSize) * 100).toFixed(1)}%`);
  }

  return {
    path: resolvedOutput,
    sizeBytes: compressedData.length,
    fileCount: manifest.file_count,
    manifest,
  };
}

/**
 * Read the manifest from a BotCore archive without extracting
 *
 * @param archivePath - Path to the .tar.gz archive
 * @returns The manifest data
 */
export async function readManifest(archivePath: string): Promise<ExportManifest> {
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Archive not found: ${archivePath}`);
  }

  // Read and decompress
  const compressed = fs.readFileSync(archivePath);
  const tarData = await new Promise<Buffer>((resolve, reject) => {
    zlib.gunzip(compressed, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

  // Read first file (should be botcore.json)
  // TAR header is 512 bytes
  const nameEnd = tarData.indexOf(0, 0);
  const name = tarData.toString('utf-8', 0, nameEnd);

  if (name !== 'botcore.json') {
    throw new Error(`Invalid BotCore archive: expected botcore.json, found ${name}`);
  }

  // Parse size from header (bytes 124-135, octal)
  const sizeStr = tarData.toString('utf-8', 124, 136).trim();
  const size = parseInt(sizeStr, 8);

  // Read content (starts at byte 512)
  const content = tarData.toString('utf-8', 512, 512 + size);

  return JSON.parse(content) as ExportManifest;
}

export default exportBot;
