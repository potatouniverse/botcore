/**
 * Import tool - Extract and install a bot package
 *
 * Extracts a .tar.gz archive and:
 * - Validates package structure and checksums
 * - Rewrites paths for the target platform
 * - Merges or overwrites existing files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { ExportManifest } from './export';

// ============================================================================
// Types
// ============================================================================

export interface ImportOptions {
  /** Destination path for the bot */
  dest: string;
  /** Target platform hint (auto-detected if not specified) */
  platform?: 'darwin' | 'linux' | 'win32';
  /** Overwrite existing files (default: false - merge) */
  overwrite?: boolean;
  /** Validate checksums (default: true) */
  validateChecksums?: boolean;
  /** Skip files that already exist (default: false) */
  skipExisting?: boolean;
  /** Dry run - don't actually write files */
  dryRun?: boolean;
  /** Verbose logging */
  verbose?: boolean;
  /** Files/patterns to exclude from import */
  exclude?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  manifest?: ExportManifest;
}

export interface ImportResult {
  /** Destination path */
  path: string;
  /** Number of files imported */
  fileCount: number;
  /** Number of files skipped */
  skippedCount: number;
  /** Number of files overwritten */
  overwrittenCount: number;
  /** Validation warnings */
  warnings: string[];
  /** The imported manifest */
  manifest: ExportManifest;
}

// ============================================================================
// TAR Parsing
// ============================================================================

interface TarEntry {
  name: string;
  size: number;
  mtime: number;
  isDir: boolean;
  content: Buffer;
}

/**
 * Parse a TAR archive into entries
 */
function parseTar(tarData: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset < tarData.length - 512) {
    // Read header
    const header = tarData.subarray(offset, offset + 512);

    // Check for end of archive (two zero blocks)
    if (header.every((b) => b === 0)) {
      break;
    }

    // Parse name (bytes 0-99, null-terminated)
    const nameEnd = header.indexOf(0, 0);
    const name = header.toString('utf-8', 0, Math.min(nameEnd, 100)).trim();

    if (!name) {
      offset += 512;
      continue;
    }

    // Parse size (bytes 124-135, octal)
    const sizeStr = header.toString('utf-8', 124, 136).replace(/\0/g, '').trim();
    const size = sizeStr ? parseInt(sizeStr, 8) : 0;

    // Parse mtime (bytes 136-147, octal)
    const mtimeStr = header.toString('utf-8', 136, 148).replace(/\0/g, '').trim();
    const mtime = mtimeStr ? parseInt(mtimeStr, 8) * 1000 : Date.now();

    // Parse type (byte 156)
    const type = String.fromCharCode(header[156]);
    const isDir = type === '5' || name.endsWith('/');

    // Read content
    offset += 512;
    const content = isDir ? Buffer.alloc(0) : tarData.subarray(offset, offset + size);

    entries.push({ name, size, mtime, isDir, content });

    // Move to next entry (content + padding to 512-byte boundary)
    if (size > 0) {
      offset += Math.ceil(size / 512) * 512;
    }
  }

  return entries;
}

// ============================================================================
// Path Rewriting
// ============================================================================

/**
 * Restore absolute paths from $BOTCORE_ROOT placeholder
 */
export function restorePaths(content: string, destPath: string): string {
  const normalizedDest = path.resolve(destPath);

  // Replace $BOTCORE_ROOT with destination path
  let result = content.replace(/\$BOTCORE_ROOT/g, normalizedDest);

  // Handle platform-specific path separators
  if (process.platform === 'win32') {
    // Convert forward slashes in paths to backslashes for Windows
    // But be careful not to convert URLs
    result = result.replace(
      /\$BOTCORE_ROOT([^"'\s]*)/g,
      (match, pathPart) => normalizedDest + pathPart.replace(/\//g, '\\')
    );
  }

  return result;
}

/**
 * Calculate SHA256 checksum
 */
function sha256(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a BotCore archive before importing
 *
 * @param archivePath - Path to the .tar.gz archive
 * @returns Validation result with errors and warnings
 */
export async function validateArchive(archivePath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check file exists
  if (!fs.existsSync(archivePath)) {
    return {
      valid: false,
      errors: [`Archive not found: ${archivePath}`],
      warnings: [],
    };
  }

  // Read and decompress
  let tarData: Buffer;
  try {
    const compressed = fs.readFileSync(archivePath);
    tarData = await new Promise<Buffer>((resolve, reject) => {
      zlib.gunzip(compressed, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  } catch (err) {
    return {
      valid: false,
      errors: [`Failed to decompress archive: ${err}`],
      warnings: [],
    };
  }

  // Parse TAR
  let entries: TarEntry[];
  try {
    entries = parseTar(tarData);
  } catch (err) {
    return {
      valid: false,
      errors: [`Failed to parse TAR archive: ${err}`],
      warnings: [],
    };
  }

  // Find manifest
  const manifestEntry = entries.find((e) => e.name === 'botcore.json');
  if (!manifestEntry) {
    return {
      valid: false,
      errors: ['Missing botcore.json manifest - not a valid BotCore archive'],
      warnings: [],
    };
  }

  // Parse manifest
  let manifest: ExportManifest;
  try {
    manifest = JSON.parse(manifestEntry.content.toString('utf-8'));
  } catch (err) {
    return {
      valid: false,
      errors: [`Invalid manifest JSON: ${err}`],
      warnings: [],
    };
  }

  // Validate manifest version
  if (manifest.version !== '1.0.0') {
    warnings.push(`Unknown manifest version: ${manifest.version} (expected 1.0.0)`);
  }

  // Validate checksums
  const fileEntries = entries.filter((e) => !e.isDir && e.name !== 'botcore.json');

  for (const entry of fileEntries) {
    const expectedChecksum = manifest.checksums[entry.name];
    if (!expectedChecksum) {
      warnings.push(`No checksum for file: ${entry.name}`);
      continue;
    }

    const actualChecksum = 'sha256:' + sha256(entry.content);
    if (actualChecksum !== expectedChecksum) {
      errors.push(
        `Checksum mismatch for ${entry.name}: expected ${expectedChecksum}, got ${actualChecksum}`
      );
    }
  }

  // Check for expected directories
  const expectedDirs = ['memory', 'identity', 'config'];
  for (const dir of expectedDirs) {
    const hasDir = entries.some((e) => e.name.startsWith(dir + '/') || e.name === dir + '/');
    if (!hasDir) {
      warnings.push(`Missing expected directory: ${dir}/`);
    }
  }

  // Check file count matches
  if (manifest.file_count !== fileEntries.length) {
    warnings.push(
      `File count mismatch: manifest says ${manifest.file_count}, archive has ${fileEntries.length}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    manifest,
  };
}

// ============================================================================
// Main Import Function
// ============================================================================

/**
 * Import a bot from a tar.gz archive
 *
 * @param archivePath - Path to the .tar.gz archive
 * @param options - Import options
 * @returns Import result
 *
 * @example
 * ```typescript
 * const result = await importBot('my-bot.tar.gz', {
 *   dest: '/path/to/new-bot',
 *   verbose: true
 * });
 * console.log(`Imported ${result.fileCount} files to ${result.path}`);
 * ```
 */
export async function importBot(
  archivePath: string,
  options: ImportOptions
): Promise<ImportResult> {
  const {
    dest,
    platform = process.platform as 'darwin' | 'linux' | 'win32',
    overwrite = false,
    validateChecksums = true,
    skipExisting = false,
    dryRun = false,
    verbose = false,
    exclude = [],
  } = options;

  // Validate archive first
  const validation = await validateArchive(archivePath);
  if (!validation.valid) {
    throw new Error(`Invalid archive:\n${validation.errors.join('\n')}`);
  }

  if (!validation.manifest) {
    throw new Error('Missing manifest after validation');
  }

  if (verbose) {
    console.log(`Importing from: ${archivePath}`);
    console.log(`Destination: ${dest}`);
    console.log(`Source: ${validation.manifest.source_name}`);
    console.log(`Created: ${validation.manifest.created}`);
    if (validation.warnings.length > 0) {
      console.log(`Warnings: ${validation.warnings.length}`);
      for (const warn of validation.warnings) {
        console.log(`  ! ${warn}`);
      }
    }
  }

  // Read and decompress
  const compressed = fs.readFileSync(archivePath);
  const tarData = await new Promise<Buffer>((resolve, reject) => {
    zlib.gunzip(compressed, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

  // Parse TAR
  const entries = parseTar(tarData);

  // Resolve destination path
  const resolvedDest = path.resolve(dest);

  // Create destination directory
  if (!dryRun && !fs.existsSync(resolvedDest)) {
    fs.mkdirSync(resolvedDest, { recursive: true });
  }

  let fileCount = 0;
  let skippedCount = 0;
  let overwrittenCount = 0;
  const warnings: string[] = [...validation.warnings];

  // Process entries
  for (const entry of entries) {
    // Skip manifest (we already processed it)
    if (entry.name === 'botcore.json') {
      continue;
    }

    // Check exclusion patterns
    let shouldExclude = false;
    for (const pattern of exclude) {
      if (pattern.startsWith('*')) {
        if (entry.name.endsWith(pattern.slice(1))) shouldExclude = true;
      } else if (pattern.endsWith('*')) {
        if (entry.name.startsWith(pattern.slice(0, -1))) shouldExclude = true;
      } else if (entry.name === pattern || entry.name.startsWith(pattern + '/')) {
        shouldExclude = true;
      }
    }

    if (shouldExclude) {
      if (verbose) {
        console.log(`  - ${entry.name} (excluded)`);
      }
      skippedCount++;
      continue;
    }

    const destPath = path.join(resolvedDest, entry.name);

    if (entry.isDir) {
      // Create directory
      if (!dryRun && !fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      continue;
    }

    // Check if file exists
    const exists = fs.existsSync(destPath);
    if (exists && skipExisting) {
      if (verbose) {
        console.log(`  - ${entry.name} (skipped - exists)`);
      }
      skippedCount++;
      continue;
    }

    if (exists && !overwrite) {
      // Merge strategy: only overwrite if checksums differ
      const existingContent = fs.readFileSync(destPath);
      const existingChecksum = sha256(existingContent);
      const newChecksum = sha256(entry.content);

      if (existingChecksum === newChecksum) {
        if (verbose) {
          console.log(`  = ${entry.name} (unchanged)`);
        }
        skippedCount++;
        continue;
      }

      warnings.push(`File differs: ${entry.name} (keeping existing, use --overwrite to replace)`);
      skippedCount++;
      continue;
    }

    // Process content (rewrite paths)
    let content = entry.content;
    const ext = path.extname(entry.name).toLowerCase();
    const textExtensions = ['.md', '.json', '.txt', '.yml', '.yaml', '.ts', '.js'];

    if (textExtensions.includes(ext)) {
      const textContent = content.toString('utf-8');
      const rewritten = restorePaths(textContent, resolvedDest);
      content = Buffer.from(rewritten, 'utf-8');
    }

    // Validate checksum if enabled
    if (validateChecksums && validation.manifest.checksums[entry.name]) {
      const expectedRaw = validation.manifest.checksums[entry.name];
      // Checksum was calculated on the path-rewritten content during export
      // So we need to compare against the original entry content, not the restored content
      const actualChecksum = 'sha256:' + sha256(entry.content);
      if (actualChecksum !== expectedRaw) {
        throw new Error(`Checksum mismatch for ${entry.name}`);
      }
    }

    // Write file
    if (!dryRun) {
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.writeFileSync(destPath, content);

      // Set modification time
      try {
        fs.utimesSync(destPath, new Date(), new Date(entry.mtime));
      } catch {
        // Ignore mtime errors
      }
    }

    if (exists) {
      overwrittenCount++;
      if (verbose) {
        console.log(`  * ${entry.name} (overwritten)`);
      }
    } else {
      fileCount++;
      if (verbose) {
        console.log(`  + ${entry.name}`);
      }
    }
  }

  // Write manifest to destination
  if (!dryRun) {
    const manifestPath = path.join(resolvedDest, '.botcore-import.json');
    const importInfo = {
      imported_from: path.basename(archivePath),
      imported_at: new Date().toISOString(),
      original_manifest: validation.manifest,
    };
    fs.writeFileSync(manifestPath, JSON.stringify(importInfo, null, 2));
  }

  if (verbose) {
    console.log(`\nImport ${dryRun ? '(dry run) ' : ''}complete!`);
    console.log(`  Files imported: ${fileCount}`);
    console.log(`  Files skipped: ${skippedCount}`);
    console.log(`  Files overwritten: ${overwrittenCount}`);
  }

  return {
    path: resolvedDest,
    fileCount,
    skippedCount,
    overwrittenCount,
    warnings,
    manifest: validation.manifest,
  };
}

/**
 * List contents of a BotCore archive without extracting
 *
 * @param archivePath - Path to the .tar.gz archive
 * @returns List of file paths in the archive
 */
export async function listArchive(
  archivePath: string
): Promise<{ files: string[]; manifest: ExportManifest }> {
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

  // Parse TAR
  const entries = parseTar(tarData);

  // Find and parse manifest
  const manifestEntry = entries.find((e) => e.name === 'botcore.json');
  if (!manifestEntry) {
    throw new Error('Missing botcore.json manifest');
  }
  const manifest = JSON.parse(manifestEntry.content.toString('utf-8')) as ExportManifest;

  // Get file list
  const files = entries
    .filter((e) => !e.isDir && e.name !== 'botcore.json')
    .map((e) => e.name)
    .sort();

  return { files, manifest };
}

export default importBot;
