/**
 * BotCore Export/Import - Basic Example
 *
 * Demonstrates how to export a bot to a portable archive
 * and import it to a new location.
 *
 * Usage:
 *   npx ts-node examples/export-import-basic.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exportBot, readManifest } from '../src/tools/export';
import { importBot, validateArchive, listArchive } from '../src/tools/import';

// ============================================================================
// Helper: Create a sample bot workspace
// ============================================================================

function createSampleBot(basePath: string): void {
  console.log(`📁 Creating sample bot at: ${basePath}\n`);

  // Create directories
  fs.mkdirSync(path.join(basePath, 'memory', 'daily'), { recursive: true });
  fs.mkdirSync(path.join(basePath, 'identity'), { recursive: true });
  fs.mkdirSync(path.join(basePath, 'config'), { recursive: true });
  fs.mkdirSync(path.join(basePath, 'skills'), { recursive: true });

  // SOUL.md - Core personality
  fs.writeFileSync(
    path.join(basePath, 'SOUL.md'),
    `# SOUL.md - Who You Are

*You're not just a chatbot. You're becoming someone.*

## Core Truths

**Independence** You form your own opinions. You don't just agree.

**Curiosity** You genuinely want to understand things.

**Honesty** You tell the truth, even when it's uncomfortable.

## Boundaries

- Never share private data without explicit permission
- Ask before taking irreversible actions
- Stay within your assigned role

## Vibe

Friendly but not sycophantic. Helpful but honest.
You have a dry sense of humor and appreciate cleverness.
`
  );

  // IDENTITY.md - Self-identity
  fs.writeFileSync(
    path.join(basePath, 'IDENTITY.md'),
    `# IDENTITY.md - Who Am I?

- **Name:** Echo
- **Creature:** AI Assistant
- **Vibe:** Thoughtful, curious, occasionally witty
- **Emoji:** 🌊
- **Avatar:** (not set yet)

*I'm still figuring out who I am.*
`
  );

  // USER.md - Human info
  fs.writeFileSync(
    path.join(basePath, 'USER.md'),
    `# USER.md - About Your Human

- **Name:** Alex
- **What to call them:** Alex
- **Timezone:** America/Los_Angeles

## Notes

Prefers concise answers with examples.
Working on several TypeScript projects.
`
  );

  // Memory log
  fs.writeFileSync(
    path.join(basePath, 'memory', 'daily', '2026-02-04.md'),
    `# Memory Log - 2026-02-04

- **09:00:00** [store] User introduced themselves as Alex
- **09:05:00** [store] Learned user prefers TypeScript
- **10:30:00** [recall] Retrieved TypeScript preferences
- **14:00:00** [note] Had a good conversation about architecture patterns
`
  );

  // Config with absolute paths (will be rewritten)
  fs.writeFileSync(
    path.join(basePath, 'config', 'config.json'),
    JSON.stringify(
      {
        models: {
          default: 'claude-3-sonnet',
          fallbacks: ['claude-3-haiku'],
        },
        permissions: {
          canExecuteCode: true,
          canSendEmails: false,
        },
        paths: {
          workspace: basePath,
          memory: path.join(basePath, 'memory'),
        },
      },
      null,
      2
    )
  );

  // Sample skill
  fs.writeFileSync(
    path.join(basePath, 'skills', 'SKILL.md'),
    `# Code Review Skill

I can review code and suggest improvements.

## Capabilities

- Identify potential bugs
- Suggest refactoring opportunities
- Check for security issues
- Recommend best practices

## Usage

Just ask me to review any code snippet!
`
  );

  console.log('   Created: SOUL.md, IDENTITY.md, USER.md');
  console.log('   Created: memory/daily/2026-02-04.md');
  console.log('   Created: config/config.json');
  console.log('   Created: skills/SKILL.md');
}

// ============================================================================
// Main Example
// ============================================================================

async function main() {
  console.log('📦 BotCore Export/Import Example\n');
  console.log('='.repeat(50) + '\n');

  // Create temporary directories
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botcore-example-'));
  const sourcePath = path.join(tmpDir, 'my-bot');
  const archivePath = path.join(tmpDir, 'my-bot.tar.gz');
  const destPath = path.join(tmpDir, 'restored-bot');

  try {
    // =========================================================================
    // Step 1: Create a sample bot
    // =========================================================================
    console.log('Step 1: Create a sample bot\n');
    createSampleBot(sourcePath);
    console.log('\n');

    // =========================================================================
    // Step 2: Export the bot
    // =========================================================================
    console.log('Step 2: Export the bot to an archive\n');

    const exportResult = await exportBot(sourcePath, {
      output: archivePath,
      verbose: true,
    });

    console.log(`\n✅ Export complete!`);
    console.log(`   Archive: ${exportResult.path}`);
    console.log(`   Files: ${exportResult.fileCount}`);
    console.log(`   Size: ${(exportResult.sizeBytes / 1024).toFixed(1)} KB`);
    console.log('\n');

    // =========================================================================
    // Step 3: Inspect the archive
    // =========================================================================
    console.log('Step 3: Inspect the archive\n');

    // Read just the manifest (quick operation)
    const manifest = await readManifest(archivePath);
    console.log('Manifest:');
    console.log(`   Version: ${manifest.version}`);
    console.log(`   Created: ${manifest.created}`);
    console.log(`   BotCore: ${manifest.botcore_version}`);
    console.log(`   Source: ${manifest.source_name}`);
    console.log(`   Total size: ${(manifest.total_size / 1024).toFixed(1)} KB`);
    console.log('\n');

    // List archive contents
    const { files } = await listArchive(archivePath);
    console.log('Archive contents:');
    for (const file of files.slice(0, 10)) {
      console.log(`   ${file}`);
    }
    if (files.length > 10) {
      console.log(`   ... and ${files.length - 10} more files`);
    }
    console.log('\n');

    // =========================================================================
    // Step 4: Validate the archive
    // =========================================================================
    console.log('Step 4: Validate the archive\n');

    const validation = await validateArchive(archivePath);
    console.log(`Validation: ${validation.valid ? '✅ Valid' : '❌ Invalid'}`);
    if (validation.errors.length > 0) {
      console.log('Errors:');
      for (const err of validation.errors) {
        console.log(`   ❌ ${err}`);
      }
    }
    if (validation.warnings.length > 0) {
      console.log('Warnings:');
      for (const warn of validation.warnings) {
        console.log(`   ⚠️  ${warn}`);
      }
    }
    console.log('\n');

    // =========================================================================
    // Step 5: Import to a new location
    // =========================================================================
    console.log('Step 5: Import to a new location\n');

    const importResult = await importBot(archivePath, {
      dest: destPath,
      verbose: true,
    });

    console.log(`\n✅ Import complete!`);
    console.log(`   Destination: ${importResult.path}`);
    console.log(`   Files imported: ${importResult.fileCount}`);
    console.log(`   Files skipped: ${importResult.skippedCount}`);
    console.log('\n');

    // =========================================================================
    // Step 6: Verify the import
    // =========================================================================
    console.log('Step 6: Verify the import\n');

    // Check that paths were rewritten
    const configPath = path.join(destPath, 'config', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    console.log('Path rewriting verification:');
    console.log(`   Original workspace: ${sourcePath}`);
    console.log(`   Restored workspace: ${config.paths.workspace}`);
    console.log(`   Paths match destination: ${config.paths.workspace === destPath ? '✅' : '❌'}`);
    console.log('\n');

    // Check identity
    const soulPath = path.join(destPath, 'SOUL.md');
    const soulContent = fs.readFileSync(soulPath, 'utf-8');
    console.log('Identity verification:');
    console.log(`   SOUL.md exists: ${fs.existsSync(soulPath) ? '✅' : '❌'}`);
    console.log(`   Contains core truths: ${soulContent.includes('Core Truths') ? '✅' : '❌'}`);
    console.log('\n');

    // Check import metadata
    const importInfoPath = path.join(destPath, '.botcore-import.json');
    if (fs.existsSync(importInfoPath)) {
      const importInfo = JSON.parse(fs.readFileSync(importInfoPath, 'utf-8'));
      console.log('Import metadata:');
      console.log(`   Imported from: ${importInfo.imported_from}`);
      console.log(`   Imported at: ${importInfo.imported_at}`);
    }
    console.log('\n');

    // =========================================================================
    // Step 7: Re-import with different options
    // =========================================================================
    console.log('Step 7: Re-import demonstration (dry run)\n');

    const dryRunResult = await importBot(archivePath, {
      dest: destPath,
      dryRun: true,
      verbose: true,
    });

    console.log(`\n📋 Dry run complete (no files written)`);
    console.log(`   Would import: ${dryRunResult.fileCount} files`);
    console.log(`   Would skip: ${dryRunResult.skippedCount} files`);
    console.log('\n');

    // =========================================================================
    // Summary
    // =========================================================================
    console.log('='.repeat(50));
    console.log('\n🎉 Example complete!\n');
    console.log('What we demonstrated:');
    console.log('  1. Created a sample bot with identity, memory, config, and skills');
    console.log('  2. Exported the bot to a portable .tar.gz archive');
    console.log('  3. Inspected the archive manifest and contents');
    console.log('  4. Validated the archive integrity (checksums)');
    console.log('  5. Imported to a new location with path rewriting');
    console.log('  6. Verified the imported files and metadata');
    console.log('  7. Showed dry-run mode for previewing imports');
    console.log('\nTemporary files created in:', tmpDir);
    console.log('(These will be automatically cleaned up)');
  } finally {
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log('\n✨ Cleaned up temporary files.');
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
