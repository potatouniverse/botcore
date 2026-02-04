/**
 * Identity Module - Basic Example
 * 
 * This example demonstrates how to use the Identity module to:
 * - Load identity files (SOUL.md, IDENTITY.md, USER.md)
 * - Access parsed data
 * - Validate identity configuration
 * - Update and save changes
 */

import * as path from 'path';
import { Identity, validateIdentity, parseSoul, parseIdentity, parseUser } from '../src/core/identity';

// Example 1: Load identity from a workspace
async function loadFromWorkspace() {
  console.log('=== Loading Identity from Workspace ===\n');
  
  // Point to your workspace root (where SOUL.md, IDENTITY.md, USER.md live)
  const workspacePath = path.resolve(__dirname, '../../..');  // Points to /Users/potato/clawd
  
  try {
    const identity = await Identity.load(workspacePath);
    
    // Access bot identity
    console.log('Bot Name:', identity.getName() || '(not set)');
    console.log('Bot Emoji:', identity.getIdentity()?.emoji || '(not set)');
    console.log('Bot Creature:', identity.getIdentity()?.creature || '(not set)');
    
    // Access user info
    console.log('\nUser Name:', identity.getUserName() || '(not set)');
    console.log('User Timezone:', identity.getUser()?.timezone || '(not set)');
    console.log('User Projects:', identity.getUser()?.projects?.join(', ') || '(none)');
    
    // Access soul info
    console.log('\nBoundaries:', identity.getSoul()?.boundaries?.length || 0, 'defined');
    console.log('Core Truths:', identity.getSoul()?.coreTruths?.length || 0, 'defined');
    console.log('Vibe:', identity.getSoul()?.vibe?.substring(0, 50) + '...' || '(not set)');
    
    // Validate
    const validation = identity.validate();
    console.log('\nValidation:', validation.valid ? '✓ Valid' : '✗ Invalid');
    if (validation.warnings.length > 0) {
      console.log('Warnings:');
      for (const warning of validation.warnings) {
        console.log(`  - [${warning.file}/${warning.field}] ${warning.message}`);
      }
    }
    
    return identity;
  } catch (err) {
    console.error('Failed to load identity:', err);
    throw err;
  }
}

// Example 2: Parse individual files (without loading from disk)
function parseFromStrings() {
  console.log('\n=== Parsing Identity from Strings ===\n');
  
  // Sample SOUL.md content
  const soulContent = `# SOUL.md

## Core Truths

**Be helpful.** That's the main job.

**Stay curious.** Always learning.

## Boundaries

- Don't lie
- Don't harm
- Ask when unsure

## Vibe

Friendly but professional. Gets stuff done.
`;
  
  // Sample IDENTITY.md content
  const identityContent = `---
name: "ExampleBot"
emoji: "🤖"
creature: "helpful assistant"
---

# My Identity

I help with coding tasks.
`;
  
  // Sample USER.md content
  const userContent = `# USER.md

- **Name:** Alice
- **What to call them:** Alice
- **Timezone:** UTC

## Model Preferences

**Coding work**: Use **GPT-4**
**General conversation**: Use **GPT-3.5**
`;
  
  // Parse each file
  const soul = parseSoul(soulContent);
  console.log('Soul sections:', Object.keys(soul.sections).join(', '));
  console.log('Soul boundaries:', soul.boundaries);
  
  const identity = parseIdentity(identityContent);
  console.log('\nIdentity name:', identity.name);
  console.log('Identity emoji:', identity.emoji);
  
  const user = parseUser(userContent);
  console.log('\nUser name:', user.name);
  console.log('User timezone:', user.timezone);
  console.log('Model preferences:', user.modelPreferences);
  
  // Validate combined data
  const validation = validateIdentity({ soul, identity, user });
  console.log('\nValidation:', validation.valid ? '✓ Valid' : '✗ Invalid');
}

// Example 3: Create and modify identity programmatically
async function createNewIdentity() {
  console.log('\n=== Creating New Identity ===\n');
  
  const tmpPath = '/tmp/botcore-example-identity';
  
  // Create new empty identity
  const identity = Identity.create(tmpPath);
  
  // Update with data
  identity.update({
    identity: {
      name: 'NewBot',
      emoji: '🌟',
      creature: 'digital helper',
      vibe: 'enthusiastic and precise',
      raw: '',
    },
    user: {
      name: 'Developer',
      timezone: 'America/Los_Angeles',
      sections: {},
      raw: '',
    },
    soul: {
      sections: {},
      boundaries: [
        'Be honest',
        'Respect privacy',
        'Ask before external actions',
      ],
      vibe: 'Helpful and efficient',
      raw: '',
    },
  });
  
  console.log('Created bot:', identity.getName());
  console.log('For user:', identity.getUserName());
  console.log('Boundaries:', identity.getSoul()?.boundaries);
  
  // Export as JSON (useful for portability)
  const json = identity.toJSON();
  console.log('\nExported JSON:', JSON.stringify(json, null, 2).substring(0, 200) + '...');
  
  // Validate before saving
  const validation = identity.validate();
  console.log('\nValidation:', validation.valid ? '✓ Ready to save' : '✗ Has issues');
  
  // To save to disk:
  // await identity.save({ useYaml: true });
  // console.log('Saved to:', tmpPath);
  
  return identity;
}

// Example 4: Work with identity in a bot context
async function botContextExample() {
  console.log('\n=== Bot Context Example ===\n');
  
  // Typical bot startup pattern
  class SimpleBot {
    private identity: Identity | null = null;
    
    async init(workspacePath: string) {
      // Load identity on startup
      this.identity = await Identity.load(workspacePath);
      
      // Log who we are
      const name = this.identity.getName() || 'Unnamed Bot';
      const emoji = this.identity.getIdentity()?.emoji || '🤖';
      console.log(`${emoji} ${name} initialized`);
      
      // Get user preferences
      const userName = this.identity.getUserName();
      if (userName) {
        console.log(`Ready to help ${userName}`);
      }
      
      // Check boundaries
      const boundaries = this.identity.getSoul()?.boundaries || [];
      console.log(`Operating with ${boundaries.length} boundaries`);
    }
    
    getSystemPrompt(): string {
      if (!this.identity) return 'You are a helpful assistant.';
      
      const soul = this.identity.getSoul();
      const id = this.identity.getIdentity();
      const user = this.identity.getUser();
      
      let prompt = '';
      
      // Add identity
      if (id?.name) {
        prompt += `You are ${id.name}`;
        if (id.creature) prompt += `, a ${id.creature}`;
        prompt += '.\n\n';
      }
      
      // Add vibe
      if (soul?.vibe) {
        prompt += `Your vibe: ${soul.vibe}\n\n`;
      }
      
      // Add boundaries
      if (soul?.boundaries && soul.boundaries.length > 0) {
        prompt += 'Boundaries:\n';
        for (const b of soul.boundaries) {
          prompt += `- ${b}\n`;
        }
        prompt += '\n';
      }
      
      // Add user context
      if (user?.name) {
        prompt += `You're helping ${user.callName || user.name}`;
        if (user.timezone) {
          prompt += ` (timezone: ${user.timezone})`;
        }
        prompt += '.\n';
      }
      
      return prompt || 'You are a helpful assistant.';
    }
  }
  
  const bot = new SimpleBot();
  
  // Use the real workspace for demo
  const workspacePath = path.resolve(__dirname, '../../..');
  
  try {
    await bot.init(workspacePath);
    
    console.log('\n--- Generated System Prompt ---');
    console.log(bot.getSystemPrompt());
  } catch (err) {
    console.log('(Using sample data since real workspace may not exist)');
  }
}

// Run all examples
async function main() {
  try {
    await loadFromWorkspace();
    parseFromStrings();
    await createNewIdentity();
    await botContextExample();
    
    console.log('\n✓ All examples completed');
  } catch (err) {
    console.error('Example failed:', err);
    process.exit(1);
  }
}

main();
