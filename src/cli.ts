#!/usr/bin/env node
/**
 * BotCore CLI - Command-line interface for bot management
 *
 * Usage:
 *   botcore export <path> [--output bot.tar.gz]
 *   botcore import <archive> --dest <path>
 *   botcore validate <archive>
 *   botcore list <archive>
 *   botcore info <path>
 */

import { exportBot, readManifest, ExportOptions } from './tools/export';
import { importBot, validateArchive, listArchive, ImportOptions } from './tools/import';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Argument Parsing
// ============================================================================

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: '',
    positional: [],
    flags: {},
  };

  let i = 0;

  // First arg is command
  if (args.length > 0 && !args[0].startsWith('-')) {
    result.command = args[0];
    i = 1;
  }

  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const eqIndex = key.indexOf('=');

      if (eqIndex !== -1) {
        // --key=value
        result.flags[key.slice(0, eqIndex)] = key.slice(eqIndex + 1);
      } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        // --key value
        result.flags[key] = args[i + 1];
        i++;
      } else {
        // --flag (boolean)
        result.flags[key] = true;
      }
    } else if (arg.startsWith('-')) {
      // Short flags like -v, -o
      const key = arg.slice(1);
      if (key.length === 1 && i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.flags[key] = args[i + 1];
        i++;
      } else {
        result.flags[key] = true;
      }
    } else {
      result.positional.push(arg);
    }

    i++;
  }

  return result;
}

// ============================================================================
// Help Text
// ============================================================================

const HELP_TEXT = `
BotCore CLI - Portable AI Agent Core Management

USAGE:
  botcore <command> [options]

COMMANDS:
  export <path>       Export a bot to a portable archive
  import <archive>    Import a bot from an archive
  validate <archive>  Validate an archive without importing
  list <archive>      List contents of an archive
  info <path>         Show info about a bot workspace
  help                Show this help message

EXPORT OPTIONS:
  --output, -o <file>     Output archive path (default: <name>.tar.gz)
  --include <path>        Additional paths to include (can be repeated)
  --exclude <pattern>     Patterns to exclude (can be repeated)
  --include-sessions      Include session data
  --include-secrets       Include secrets (DANGEROUS!)
  --compression <0-9>     Compression level (default: 6)
  --verbose, -v           Verbose output

IMPORT OPTIONS:
  --dest, -d <path>       Destination path (required)
  --overwrite             Overwrite existing files
  --skip-existing         Skip files that already exist
  --no-validate           Skip checksum validation
  --exclude <pattern>     Patterns to exclude from import
  --dry-run               Show what would be imported without writing
  --verbose, -v           Verbose output

EXAMPLES:
  # Export a bot
  botcore export ./my-bot --output my-bot.tar.gz

  # Import a bot
  botcore import my-bot.tar.gz --dest ./restored-bot

  # Validate an archive
  botcore validate my-bot.tar.gz

  # List archive contents
  botcore list my-bot.tar.gz

  # Show workspace info
  botcore info ./my-bot

VERSION: 0.1.0
`;

// ============================================================================
// Commands
// ============================================================================

async function cmdExport(args: ParsedArgs): Promise<void> {
  if (args.positional.length === 0) {
    console.error('Error: Missing source path');
    console.error('Usage: botcore export <path> [--output file.tar.gz]');
    process.exit(1);
  }

  const sourcePath = args.positional[0];

  const options: ExportOptions = {
    output: (args.flags['output'] as string) || (args.flags['o'] as string),
    includeSessions: Boolean(args.flags['include-sessions']),
    includeSecrets: Boolean(args.flags['include-secrets']),
    compressionLevel: args.flags['compression']
      ? parseInt(args.flags['compression'] as string, 10)
      : undefined,
    verbose: Boolean(args.flags['verbose'] || args.flags['v']),
  };

  // Collect --include flags
  const includes: string[] = [];
  if (args.flags['include']) {
    includes.push(args.flags['include'] as string);
  }
  if (includes.length > 0) {
    options.include = includes;
  }

  // Collect --exclude flags
  const excludes: string[] = [];
  if (args.flags['exclude']) {
    excludes.push(args.flags['exclude'] as string);
  }
  if (excludes.length > 0) {
    options.exclude = excludes;
  }

  try {
    console.log(`📦 Exporting bot from: ${sourcePath}`);
    const result = await exportBot(sourcePath, options);
    console.log(`✅ Export complete!`);
    console.log(`   Archive: ${result.path}`);
    console.log(`   Files: ${result.fileCount}`);
    console.log(`   Size: ${(result.sizeBytes / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error(`❌ Export failed: ${err}`);
    process.exit(1);
  }
}

async function cmdImport(args: ParsedArgs): Promise<void> {
  if (args.positional.length === 0) {
    console.error('Error: Missing archive path');
    console.error('Usage: botcore import <archive> --dest <path>');
    process.exit(1);
  }

  const archivePath = args.positional[0];
  const dest = (args.flags['dest'] as string) || (args.flags['d'] as string);

  if (!dest) {
    console.error('Error: Missing destination path (--dest)');
    console.error('Usage: botcore import <archive> --dest <path>');
    process.exit(1);
  }

  const options: ImportOptions = {
    dest,
    overwrite: Boolean(args.flags['overwrite']),
    skipExisting: Boolean(args.flags['skip-existing']),
    validateChecksums: !Boolean(args.flags['no-validate']),
    dryRun: Boolean(args.flags['dry-run']),
    verbose: Boolean(args.flags['verbose'] || args.flags['v']),
  };

  // Collect --exclude flags
  const excludes: string[] = [];
  if (args.flags['exclude']) {
    excludes.push(args.flags['exclude'] as string);
  }
  if (excludes.length > 0) {
    options.exclude = excludes;
  }

  try {
    console.log(`📥 Importing from: ${archivePath}`);
    const result = await importBot(archivePath, options);
    console.log(`✅ Import ${options.dryRun ? '(dry run) ' : ''}complete!`);
    console.log(`   Destination: ${result.path}`);
    console.log(`   Files imported: ${result.fileCount}`);
    console.log(`   Files skipped: ${result.skippedCount}`);
    console.log(`   Files overwritten: ${result.overwrittenCount}`);
    if (result.warnings.length > 0) {
      console.log(`   Warnings: ${result.warnings.length}`);
      for (const warn of result.warnings) {
        console.log(`     ⚠️  ${warn}`);
      }
    }
  } catch (err) {
    console.error(`❌ Import failed: ${err}`);
    process.exit(1);
  }
}

async function cmdValidate(args: ParsedArgs): Promise<void> {
  if (args.positional.length === 0) {
    console.error('Error: Missing archive path');
    console.error('Usage: botcore validate <archive>');
    process.exit(1);
  }

  const archivePath = args.positional[0];

  try {
    console.log(`🔍 Validating: ${archivePath}`);
    const result = await validateArchive(archivePath);

    if (result.valid) {
      console.log(`✅ Archive is valid!`);
    } else {
      console.log(`❌ Archive is invalid`);
    }

    if (result.manifest) {
      console.log(`\nManifest:`);
      console.log(`   Version: ${result.manifest.version}`);
      console.log(`   Created: ${result.manifest.created}`);
      console.log(`   BotCore: ${result.manifest.botcore_version}`);
      console.log(`   Source: ${result.manifest.source_name}`);
      console.log(`   Files: ${result.manifest.file_count}`);
      console.log(`   Size: ${(result.manifest.total_size / 1024).toFixed(1)} KB`);
    }

    if (result.errors.length > 0) {
      console.log(`\nErrors (${result.errors.length}):`);
      for (const err of result.errors) {
        console.log(`   ❌ ${err}`);
      }
    }

    if (result.warnings.length > 0) {
      console.log(`\nWarnings (${result.warnings.length}):`);
      for (const warn of result.warnings) {
        console.log(`   ⚠️  ${warn}`);
      }
    }

    process.exit(result.valid ? 0 : 1);
  } catch (err) {
    console.error(`❌ Validation failed: ${err}`);
    process.exit(1);
  }
}

async function cmdList(args: ParsedArgs): Promise<void> {
  if (args.positional.length === 0) {
    console.error('Error: Missing archive path');
    console.error('Usage: botcore list <archive>');
    process.exit(1);
  }

  const archivePath = args.positional[0];

  try {
    const { files, manifest } = await listArchive(archivePath);

    console.log(`📋 Contents of: ${archivePath}`);
    console.log(`   Source: ${manifest.source_name}`);
    console.log(`   Files: ${files.length}\n`);

    for (const file of files) {
      const checksum = manifest.checksums[file];
      const shortHash = checksum ? checksum.slice(7, 15) : '--------';
      console.log(`   ${shortHash}  ${file}`);
    }
  } catch (err) {
    console.error(`❌ Failed to list archive: ${err}`);
    process.exit(1);
  }
}

async function cmdInfo(args: ParsedArgs): Promise<void> {
  if (args.positional.length === 0) {
    console.error('Error: Missing workspace path');
    console.error('Usage: botcore info <path>');
    process.exit(1);
  }

  const workspacePath = path.resolve(args.positional[0]);

  if (!fs.existsSync(workspacePath)) {
    console.error(`❌ Workspace not found: ${workspacePath}`);
    process.exit(1);
  }

  console.log(`📁 Workspace: ${workspacePath}\n`);

  // Check for identity files
  const identityFiles = ['SOUL.md', 'IDENTITY.md', 'USER.md'];
  console.log('Identity:');
  for (const file of identityFiles) {
    const filePath = path.join(workspacePath, file);
    const exists = fs.existsSync(filePath);
    console.log(`   ${exists ? '✓' : '✗'} ${file}`);
  }

  // Check for directories
  const dirs = ['memory', 'identity', 'config', 'skills'];
  console.log('\nDirectories:');
  for (const dir of dirs) {
    const dirPath = path.join(workspacePath, dir);
    const exists = fs.existsSync(dirPath);
    if (exists) {
      const files = fs.readdirSync(dirPath);
      console.log(`   ✓ ${dir}/ (${files.length} items)`);
    } else {
      console.log(`   ✗ ${dir}/`);
    }
  }

  // Check for previous import info
  const importInfoPath = path.join(workspacePath, '.botcore-import.json');
  if (fs.existsSync(importInfoPath)) {
    try {
      const importInfo = JSON.parse(fs.readFileSync(importInfoPath, 'utf-8'));
      console.log('\nImport Info:');
      console.log(`   Imported from: ${importInfo.imported_from}`);
      console.log(`   Imported at: ${importInfo.imported_at}`);
    } catch {
      // Ignore parse errors
    }
  }

  // Check for memory database
  const memoryDbPaths = [
    path.join(workspacePath, 'memory', 'engram.db'),
    path.join(workspacePath, 'engram.db'),
  ];
  for (const dbPath of memoryDbPaths) {
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      console.log(`\nMemory DB:`);
      console.log(`   Path: ${path.relative(workspacePath, dbPath)}`);
      console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
      break;
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.command || args.command === 'help' || args.flags['help'] || args.flags['h']) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (args.flags['version'] || args.flags['V']) {
    console.log('botcore 0.1.0');
    process.exit(0);
  }

  switch (args.command) {
    case 'export':
      await cmdExport(args);
      break;
    case 'import':
      await cmdImport(args);
      break;
    case 'validate':
      await cmdValidate(args);
      break;
    case 'list':
      await cmdList(args);
      break;
    case 'info':
      await cmdInfo(args);
      break;
    default:
      console.error(`Unknown command: ${args.command}`);
      console.error('Run "botcore help" for usage information');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Unexpected error: ${err}`);
  process.exit(1);
});
