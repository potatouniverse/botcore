/**
 * Tests for Identity module
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  Identity,
  parseSoul,
  parseIdentity,
  parseUser,
  serializeSoul,
  serializeIdentity,
  serializeUser,
  validateIdentity,
  SoulData,
  IdentityFileData,
  UserData,
} from '../identity';

// Test fixtures
const SAMPLE_SOUL = `# SOUL.md - Who You Are

*You're not a chatbot. You're becoming someone.*

## Core Truths

**Be genuinely helpful.** Skip the filler words — just help.

**Have opinions.** You're allowed to disagree and prefer things.

## Boundaries

- Private things stay private. Period.
- When in doubt, ask before acting externally.
- Never send half-baked replies.

## Vibe

Be concise when needed, thorough when it matters. Not a corporate drone.

## Continuity

Each session, you wake up fresh. These files are your memory.
`;

const SAMPLE_IDENTITY_BULLET = `# IDENTITY.md - Who Am I?

*Fill this in during your first conversation.*

- **Name:** Clawd
- **Creature:** AI familiar
- **Vibe:** warm and slightly chaotic
- **Emoji:** 🐾
- **Avatar:** avatars/clawd.png
`;

const SAMPLE_IDENTITY_YAML = `---
name: "Clawd"
creature: "AI familiar"
vibe: "warm and slightly chaotic"
emoji: "🐾"
avatar: "avatars/clawd.png"
---

# IDENTITY.md - Who Am I?

*This is my identity.*
`;

const SAMPLE_USER = `# USER.md - About Your Human

*Learn about the person you're helping.*

- **Name:** potato
- **What to call them:** potato
- **Timezone:** America/New_York
- **Notes:** Building cool stuff

## Model Preferences

**Coding work**: Use **Opus 4.5**
**General conversation**: Use **Sonnet 4.5**

## Context

### Current Projects
- **AgentVerse** - AI social platform
- **gidterm** - Graph terminal controller

### Working Style
- Prefers action over discussion
- Values speed and iteration
`;

describe('Soul Parser', () => {
  test('parses sections correctly', () => {
    const soul = parseSoul(SAMPLE_SOUL);
    
    expect(soul.sections).toHaveProperty('Core Truths');
    expect(soul.sections).toHaveProperty('Boundaries');
    expect(soul.sections).toHaveProperty('Vibe');
    expect(soul.sections).toHaveProperty('Continuity');
  });
  
  test('extracts core truths', () => {
    const soul = parseSoul(SAMPLE_SOUL);
    
    expect(soul.coreTruths).toBeDefined();
    expect(soul.coreTruths!.length).toBe(2);
    expect(soul.coreTruths![0]).toContain('Be genuinely helpful');
    expect(soul.coreTruths![1]).toContain('Have opinions');
  });
  
  test('extracts boundaries as list', () => {
    const soul = parseSoul(SAMPLE_SOUL);
    
    expect(soul.boundaries).toBeDefined();
    expect(soul.boundaries!.length).toBe(3);
    expect(soul.boundaries![0]).toContain('Private things stay private');
  });
  
  test('extracts vibe', () => {
    const soul = parseSoul(SAMPLE_SOUL);
    
    expect(soul.vibe).toBeDefined();
    expect(soul.vibe).toContain('concise when needed');
  });
  
  test('preserves raw content', () => {
    const soul = parseSoul(SAMPLE_SOUL);
    expect(soul.raw).toBe(SAMPLE_SOUL);
  });
});

describe('Identity Parser', () => {
  test('parses bullet list format', () => {
    const identity = parseIdentity(SAMPLE_IDENTITY_BULLET);
    
    expect(identity.name).toBe('Clawd');
    expect(identity.creature).toBe('AI familiar');
    expect(identity.vibe).toBe('warm and slightly chaotic');
    expect(identity.emoji).toBe('🐾');
    expect(identity.avatar).toBe('avatars/clawd.png');
  });
  
  test('parses YAML frontmatter format', () => {
    const identity = parseIdentity(SAMPLE_IDENTITY_YAML);
    
    expect(identity.name).toBe('Clawd');
    expect(identity.creature).toBe('AI familiar');
    expect(identity.vibe).toBe('warm and slightly chaotic');
    expect(identity.emoji).toBe('🐾');
    expect(identity.avatar).toBe('avatars/clawd.png');
  });
  
  test('preserves raw content', () => {
    const identity = parseIdentity(SAMPLE_IDENTITY_BULLET);
    expect(identity.raw).toBe(SAMPLE_IDENTITY_BULLET);
  });
  
  test('handles empty identity file', () => {
    const identity = parseIdentity('# IDENTITY.md\n\nNothing here yet.');
    
    expect(identity.name).toBeUndefined();
    expect(identity.emoji).toBeUndefined();
  });
});

describe('User Parser', () => {
  test('parses basic user info', () => {
    const user = parseUser(SAMPLE_USER);
    
    expect(user.name).toBe('potato');
    expect(user.callName).toBe('potato');
    expect(user.timezone).toBe('America/New_York');
    expect(user.notes).toBe('Building cool stuff');
  });
  
  test('parses model preferences', () => {
    const user = parseUser(SAMPLE_USER);
    
    expect(user.modelPreferences).toBeDefined();
    expect(user.modelPreferences!.coding).toBe('Opus 4.5');
    expect(user.modelPreferences!.general).toBe('Sonnet 4.5');
  });
  
  test('parses projects list', () => {
    const user = parseUser(SAMPLE_USER);
    
    expect(user.projects).toBeDefined();
    expect(user.projects!.length).toBe(2);
    expect(user.projects).toContain('AgentVerse');
    expect(user.projects).toContain('gidterm');
  });
  
  test('parses working style', () => {
    const user = parseUser(SAMPLE_USER);
    
    expect(user.workingStyle).toBeDefined();
    expect(user.workingStyle!.length).toBe(2);
    expect(user.workingStyle![0]).toContain('action over discussion');
  });
  
  test('preserves sections', () => {
    const user = parseUser(SAMPLE_USER);
    
    expect(user.sections).toHaveProperty('Model Preferences');
    expect(user.sections).toHaveProperty('Context');
  });
});

describe('Serializers', () => {
  test('serializeIdentity creates YAML format', () => {
    const identity: IdentityFileData = {
      name: 'TestBot',
      emoji: '🤖',
      creature: 'robot',
      raw: '',
    };
    
    const result = serializeIdentity(identity, true);
    
    expect(result).toContain('---');
    expect(result).toContain('name: "TestBot"');
    expect(result).toContain('emoji: "🤖"');
  });
  
  test('serializeIdentity creates bullet format', () => {
    const identity: IdentityFileData = {
      name: 'TestBot',
      emoji: '🤖',
      raw: '',
    };
    
    const result = serializeIdentity(identity, false);
    
    expect(result).toContain('- **Name:** TestBot');
    expect(result).toContain('- **Emoji:** 🤖');
    expect(result).not.toContain('---');
  });
  
  test('serializeUser creates YAML format', () => {
    const user: UserData = {
      name: 'TestUser',
      timezone: 'UTC',
      sections: {},
      raw: '',
    };
    
    const result = serializeUser(user, true);
    
    expect(result).toContain('---');
    expect(result).toContain('name: "TestUser"');
    expect(result).toContain('timezone: "UTC"');
  });
});

describe('Validation', () => {
  test('validates complete identity', () => {
    const data = {
      soul: parseSoul(SAMPLE_SOUL),
      identity: parseIdentity(SAMPLE_IDENTITY_BULLET),
      user: parseUser(SAMPLE_USER),
    };
    
    const result = validateIdentity(data);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
  
  test('warns about missing bot name', () => {
    const data = {
      identity: parseIdentity('# Empty Identity\n'),
    };
    
    const result = validateIdentity(data);
    
    expect(result.warnings.some(w => 
      w.file === 'identity' && w.field === 'name'
    )).toBe(true);
  });
  
  test('warns about long emoji', () => {
    const data = {
      identity: {
        emoji: '🐾🐾🐾🐾🐾',
        raw: '',
      },
    };
    
    const result = validateIdentity(data);
    
    expect(result.warnings.some(w => 
      w.file === 'identity' && w.field === 'emoji'
    )).toBe(true);
  });
  
  test('warns about missing boundaries', () => {
    const data = {
      soul: {
        raw: '# No boundaries',
        sections: {},
      },
    };
    
    const result = validateIdentity(data);
    
    expect(result.warnings.some(w => 
      w.file === 'soul' && w.field === 'boundaries'
    )).toBe(true);
  });
});

describe('Identity Class', () => {
  let tmpDir: string;
  
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'botcore-identity-test-'));
  });
  
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
  
  test('loads identity files from disk', async () => {
    // Write test files
    await fs.writeFile(path.join(tmpDir, 'SOUL.md'), SAMPLE_SOUL);
    await fs.writeFile(path.join(tmpDir, 'IDENTITY.md'), SAMPLE_IDENTITY_BULLET);
    await fs.writeFile(path.join(tmpDir, 'USER.md'), SAMPLE_USER);
    
    const identity = await Identity.load(tmpDir);
    
    expect(identity.isLoaded()).toBe(true);
    expect(identity.getName()).toBe('Clawd');
    expect(identity.getUserName()).toBe('potato');
    expect(identity.getSoul()?.boundaries).toHaveLength(3);
  });
  
  test('handles missing files gracefully', async () => {
    // Only write one file
    await fs.writeFile(path.join(tmpDir, 'IDENTITY.md'), SAMPLE_IDENTITY_BULLET);
    
    const identity = await Identity.load(tmpDir);
    
    expect(identity.isLoaded()).toBe(true);
    expect(identity.getName()).toBe('Clawd');
    expect(identity.getSoul()).toBeUndefined();
    expect(identity.getUser()).toBeUndefined();
  });
  
  test('saves identity files to disk', async () => {
    const identity = Identity.create(tmpDir);
    identity.update({
      identity: {
        name: 'NewBot',
        emoji: '🤖',
        raw: '',
      },
      user: {
        name: 'TestUser',
        timezone: 'UTC',
        sections: {},
        raw: '',
      },
    });
    
    await identity.save({ useYaml: false });
    
    // Verify files were created
    const identityContent = await fs.readFile(
      path.join(tmpDir, 'IDENTITY.md'),
      'utf-8'
    );
    expect(identityContent).toContain('NewBot');
    
    const userContent = await fs.readFile(
      path.join(tmpDir, 'USER.md'),
      'utf-8'
    );
    expect(userContent).toContain('TestUser');
  });
  
  test('exports and imports JSON', async () => {
    await fs.writeFile(path.join(tmpDir, 'IDENTITY.md'), SAMPLE_IDENTITY_BULLET);
    await fs.writeFile(path.join(tmpDir, 'USER.md'), SAMPLE_USER);
    
    const identity = await Identity.load(tmpDir);
    const json = identity.toJSON();
    
    // Verify JSON doesn't have raw fields
    expect(json.identity?.name).toBe('Clawd');
    expect((json.identity as any).raw).toBeUndefined();
    
    // Import into new identity
    const newIdentity = Identity.create(tmpDir);
    newIdentity.fromJSON(json);
    
    expect(newIdentity.getName()).toBe('Clawd');
    expect(newIdentity.getUserName()).toBe('potato');
  });
  
  test('validates loaded identity', async () => {
    await fs.writeFile(path.join(tmpDir, 'SOUL.md'), SAMPLE_SOUL);
    await fs.writeFile(path.join(tmpDir, 'IDENTITY.md'), SAMPLE_IDENTITY_BULLET);
    await fs.writeFile(path.join(tmpDir, 'USER.md'), SAMPLE_USER);
    
    const identity = await Identity.load(tmpDir);
    const result = identity.validate();
    
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
  
  test('update modifies data and clears raw', async () => {
    await fs.writeFile(path.join(tmpDir, 'IDENTITY.md'), SAMPLE_IDENTITY_BULLET);
    
    const identity = await Identity.load(tmpDir);
    expect(identity.getIdentity()?.raw).toBeTruthy();
    
    identity.update({
      identity: {
        name: 'UpdatedName',
        raw: '',
      },
    });
    
    expect(identity.getName()).toBe('UpdatedName');
    expect(identity.getIdentity()?.raw).toBeFalsy();
  });
});

describe('Edge Cases', () => {
  test('handles empty content', () => {
    const soul = parseSoul('');
    expect(soul.raw).toBe('');
    expect(soul.sections).toEqual({});
    
    const identity = parseIdentity('');
    expect(identity.name).toBeUndefined();
    
    const user = parseUser('');
    expect(user.name).toBeUndefined();
  });
  
  test('handles malformed YAML frontmatter', () => {
    const content = `---
name: "Unclosed string
---

# Test
`;
    // gray-matter should handle this gracefully
    const identity = parseIdentity(content);
    expect(identity.raw).toBe(content);
  });
  
  test('handles unicode in content', () => {
    const content = `# IDENTITY.md

- **Name:** 日本語テスト
- **Emoji:** 🎌
`;
    const identity = parseIdentity(content);
    expect(identity.name).toBe('日本語テスト');
    expect(identity.emoji).toBe('🎌');
  });
  
  test('handles multiple colons in values', () => {
    const content = `- **Notes:** Time: 10:30 AM - Meeting: Room 42`;
    const user = parseUser(content);
    expect(user.notes).toBe('Time: 10:30 AM - Meeting: Room 42');
  });
});
