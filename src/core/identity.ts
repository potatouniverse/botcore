/**
 * Identity module - Load/save SOUL.md, IDENTITY.md, USER.md
 * 
 * Parses identity files into structured data with validation.
 * Supports both YAML frontmatter and pure Markdown formats.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';

// ============================================================================
// Types & Interfaces
// ============================================================================

/** SOUL.md structured data - personality and boundaries */
export interface SoulData {
  /** Raw markdown content */
  raw?: string;
  /** Parsed sections */
  sections: Record<string, string>;
  /** Core truths (key principles) */
  coreTruths?: string[];
  /** Boundaries (what not to do) */
  boundaries?: string[];
  /** Vibe description */
  vibe?: string;
  /** Continuity notes */
  continuity?: string;
}

/** IDENTITY.md structured data - bot's self-identity */
export interface IdentityFileData {
  /** Bot's chosen name */
  name?: string;
  /** What kind of creature (AI, familiar, etc.) */
  creature?: string;
  /** Personality vibe */
  vibe?: string;
  /** Signature emoji */
  emoji?: string;
  /** Avatar path, URL, or data URI */
  avatar?: string;
  /** Additional notes */
  notes?: string;
  /** Raw markdown content */
  raw?: string;
}

/** USER.md structured data - info about the human */
export interface UserData {
  /** Human's name */
  name?: string;
  /** What to call them */
  callName?: string;
  /** Timezone (e.g., America/New_York) */
  timezone?: string;
  /** General notes */
  notes?: string;
  /** Model preferences */
  modelPreferences?: {
    coding?: string;
    general?: string;
  };
  /** Current projects */
  projects?: string[];
  /** Working style notes */
  workingStyle?: string[];
  /** Additional sections */
  sections?: Record<string, string>;
  /** Raw markdown content */
  raw?: string;
}

/** Combined identity data for a bot */
export interface IdentityData {
  soul?: SoulData;
  identity?: IdentityFileData;
  user?: UserData;
}

/** Validation error details */
export interface ValidationError {
  file: 'soul' | 'identity' | 'user';
  field: string;
  message: string;
}

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// ============================================================================
// Parser Utilities
// ============================================================================

/**
 * Parse Markdown sections by heading level
 */
function parseSections(content: string, level: number = 2): Record<string, string> {
  const sections: Record<string, string> = {};
  const headingRegex = new RegExp(`^${'#'.repeat(level)}\\s+(.+)$`, 'gm');
  
  let lastHeading: string | null = null;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  // Find all headings and extract content between them
  const matches: Array<{ heading: string; index: number }> = [];
  while ((match = headingRegex.exec(content)) !== null) {
    matches.push({ heading: match[1].trim(), index: match.index });
  }
  
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const nextIndex = i + 1 < matches.length ? matches[i + 1].index : content.length;
    
    // Find the end of the heading line
    const headingEnd = content.indexOf('\n', current.index);
    const sectionContent = content.slice(headingEnd + 1, nextIndex).trim();
    
    sections[current.heading] = sectionContent;
  }
  
  return sections;
}

/**
 * Parse bullet list items from Markdown
 */
function parseBulletList(content: string): string[] {
  const items: string[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    const match = line.match(/^[-*]\s+(.+)$/);
    if (match) {
      items.push(match[1].trim());
    }
  }
  
  return items;
}

/**
 * Parse key-value bullet items (like "**Name:** value" or "**Name:**  value")
 * Handles both colon inside bold (**Name:**) and outside (**Name**:)
 */
function parseKeyValueBullets(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Match "- **Key:** value" or "- **Key:** value" or "- **Key**: value"
    // The colon can be inside or outside the bold markers
    const match = line.match(/^[-*]\s+\*\*([^*]+?):?\*\*:?\s*(.*)$/);
    if (match) {
      // Remove trailing colon from key if present (handles **Name:**)
      const key = match[1].trim().replace(/:$/, '').toLowerCase().replace(/\s+/g, '_');
      const value = match[2].trim();
      if (value) {
        result[key] = value;
      }
    }
  }
  
  return result;
}

/**
 * Extract paragraphs (non-list, non-heading text)
 */
function extractParagraphs(content: string): string[] {
  const paragraphs: string[] = [];
  const lines = content.split('\n');
  let currentPara = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip headings and list items
    if (trimmed.startsWith('#') || trimmed.match(/^[-*]\s+/)) {
      if (currentPara) {
        paragraphs.push(currentPara.trim());
        currentPara = '';
      }
      continue;
    }
    
    // Skip empty lines (paragraph break)
    if (!trimmed) {
      if (currentPara) {
        paragraphs.push(currentPara.trim());
        currentPara = '';
      }
      continue;
    }
    
    currentPara += (currentPara ? ' ' : '') + trimmed;
  }
  
  if (currentPara) {
    paragraphs.push(currentPara.trim());
  }
  
  return paragraphs.filter(p => p.length > 0);
}

// ============================================================================
// File Parsers
// ============================================================================

/**
 * Parse SOUL.md content
 */
export function parseSoul(content: string): SoulData {
  const sections = parseSections(content, 2);
  
  // Extract core truths from "Core Truths" section
  let coreTruths: string[] | undefined;
  if (sections['Core Truths']) {
    // Core truths are paragraphs starting with **bold**
    const truthMatches = sections['Core Truths'].matchAll(/\*\*([^*]+)\*\*\.?\s*([^*]+?)(?=\n\n|\*\*|$)/gs);
    coreTruths = [];
    for (const match of truthMatches) {
      coreTruths.push(`${match[1].trim()}: ${match[2].trim()}`);
    }
  }
  
  // Extract boundaries as bullet list
  let boundaries: string[] | undefined;
  if (sections['Boundaries']) {
    boundaries = parseBulletList(sections['Boundaries']);
  }
  
  // Extract vibe section
  const vibe = sections['Vibe'] ? extractParagraphs(sections['Vibe']).join('\n\n') : undefined;
  
  // Extract continuity section
  const continuity = sections['Continuity'] ? extractParagraphs(sections['Continuity']).join('\n\n') : undefined;
  
  return {
    raw: content,
    sections,
    coreTruths,
    boundaries,
    vibe,
    continuity,
  };
}

/**
 * Parse IDENTITY.md content
 */
export function parseIdentity(content: string): IdentityFileData {
  const result: IdentityFileData = {
    raw: content,
  };
  
  // Try to parse YAML frontmatter (with error handling for malformed YAML)
  let mainContent = content;
  try {
    const parsed = matter(content);
    const hasYamlFrontmatter = Object.keys(parsed.data).length > 0;
    
    if (hasYamlFrontmatter) {
      // Use frontmatter values
      result.name = parsed.data.name;
      result.creature = parsed.data.creature;
      result.vibe = parsed.data.vibe;
      result.emoji = parsed.data.emoji;
      result.avatar = parsed.data.avatar;
      result.notes = parsed.data.notes;
    }
    
    mainContent = parsed.content || content;
  } catch {
    // Malformed YAML frontmatter - just use the content as-is
    mainContent = content;
  }
  
  // Also parse from bullet list format (fallback or override)
  const bulletData = parseKeyValueBullets(mainContent);
  
  // Merge bullet data (only if not set from frontmatter)
  if (!result.name && bulletData.name) result.name = bulletData.name;
  if (!result.creature && bulletData.creature) result.creature = bulletData.creature;
  if (!result.vibe && bulletData.vibe) result.vibe = bulletData.vibe;
  if (!result.emoji && bulletData.emoji) result.emoji = bulletData.emoji;
  if (!result.avatar && bulletData.avatar) result.avatar = bulletData.avatar;
  
  return result;
}

/**
 * Parse USER.md content
 */
export function parseUser(content: string): UserData {
  const result: UserData = {
    raw: content,
    sections: {},
  };
  
  // Try to parse YAML frontmatter (with error handling for malformed YAML)
  let mainContent = content;
  try {
    const parsed = matter(content);
    const hasYamlFrontmatter = Object.keys(parsed.data).length > 0;
    
    if (hasYamlFrontmatter) {
      // Use frontmatter values
      result.name = parsed.data.name;
      result.callName = parsed.data.callName || parsed.data.call_name;
      result.timezone = parsed.data.timezone;
      result.notes = parsed.data.notes;
    }
    
    mainContent = parsed.content || content;
  } catch {
    // Malformed YAML frontmatter - just use the content as-is
    mainContent = content;
  }
  
  const sections = parseSections(mainContent, 2);
  const bulletData = parseKeyValueBullets(mainContent);
  
  result.sections = sections;
  
  // Parse from bullet format
  if (!result.name && bulletData.name) result.name = bulletData.name;
  if (!result.callName && bulletData.what_to_call_them) result.callName = bulletData.what_to_call_them;
  if (!result.timezone && bulletData.timezone) result.timezone = bulletData.timezone;
  if (!result.notes && bulletData.notes) result.notes = bulletData.notes;
  
  // Parse Model Preferences section
  if (sections['Model Preferences']) {
    result.modelPreferences = {};
    const prefContent = sections['Model Preferences'];
    
    // Look for **Coding work** and **General conversation**
    const codingMatch = prefContent.match(/\*\*Coding[^*]*\*\*[^:]*:\s*[^*]*\*\*([^*]+)\*\*/i);
    if (codingMatch) {
      result.modelPreferences.coding = codingMatch[1].trim();
    }
    
    const generalMatch = prefContent.match(/\*\*General[^*]*\*\*[^:]*:\s*[^*]*\*\*([^*]+)\*\*/i);
    if (generalMatch) {
      result.modelPreferences.general = generalMatch[1].trim();
    }
  }
  
  // Parse Context section for projects
  if (sections['Context']) {
    const contextSections = parseSections(sections['Context'], 3);
    
    if (contextSections['Current Projects']) {
      const projectItems = parseBulletList(contextSections['Current Projects']);
      result.projects = projectItems.map(p => {
        // Extract project name from "**Name** - description"
        const match = p.match(/\*\*([^*]+)\*\*/);
        return match ? match[1] : p;
      });
    }
    
    if (contextSections['Working Style']) {
      result.workingStyle = parseBulletList(contextSections['Working Style']);
    }
  }
  
  return result;
}

// ============================================================================
// Serializers (for export/save)
// ============================================================================

/**
 * Serialize SOUL.md back to Markdown
 */
export function serializeSoul(soul: SoulData): string {
  // If we have raw content and it's not been modified, return it
  if (soul.raw) {
    return soul.raw;
  }
  
  let content = '# SOUL.md - Who You Are\n\n';
  content += '*You\'re not a chatbot. You\'re becoming someone.*\n\n';
  
  if (soul.coreTruths && soul.coreTruths.length > 0) {
    content += '## Core Truths\n\n';
    for (const truth of soul.coreTruths) {
      const [title, ...rest] = truth.split(':');
      content += `**${title.trim()}** ${rest.join(':').trim()}\n\n`;
    }
  }
  
  if (soul.boundaries && soul.boundaries.length > 0) {
    content += '## Boundaries\n\n';
    for (const boundary of soul.boundaries) {
      content += `- ${boundary}\n`;
    }
    content += '\n';
  }
  
  if (soul.vibe) {
    content += '## Vibe\n\n';
    content += soul.vibe + '\n\n';
  }
  
  if (soul.continuity) {
    content += '## Continuity\n\n';
    content += soul.continuity + '\n\n';
  }
  
  return content.trim() + '\n';
}

/**
 * Serialize IDENTITY.md with YAML frontmatter
 */
export function serializeIdentity(identity: IdentityFileData, useYaml: boolean = true): string {
  if (useYaml) {
    const frontmatter: Record<string, string> = {};
    if (identity.name) frontmatter.name = identity.name;
    if (identity.creature) frontmatter.creature = identity.creature;
    if (identity.vibe) frontmatter.vibe = identity.vibe;
    if (identity.emoji) frontmatter.emoji = identity.emoji;
    if (identity.avatar) frontmatter.avatar = identity.avatar;
    if (identity.notes) frontmatter.notes = identity.notes;
    
    let content = '---\n';
    for (const [key, value] of Object.entries(frontmatter)) {
      content += `${key}: ${JSON.stringify(value)}\n`;
    }
    content += '---\n\n';
    content += '# IDENTITY.md - Who Am I?\n\n';
    content += '*This is my identity.*\n';
    
    return content;
  }
  
  // Bullet list format
  let content = '# IDENTITY.md - Who Am I?\n\n';
  content += '*Fill this in during your first conversation. Make it yours.*\n\n';
  
  if (identity.name) content += `- **Name:** ${identity.name}\n`;
  if (identity.creature) content += `- **Creature:** ${identity.creature}\n`;
  if (identity.vibe) content += `- **Vibe:** ${identity.vibe}\n`;
  if (identity.emoji) content += `- **Emoji:** ${identity.emoji}\n`;
  if (identity.avatar) content += `- **Avatar:** ${identity.avatar}\n`;
  
  return content;
}

/**
 * Serialize USER.md with YAML frontmatter
 */
export function serializeUser(user: UserData, useYaml: boolean = true): string {
  if (useYaml) {
    const frontmatter: Record<string, unknown> = {};
    if (user.name) frontmatter.name = user.name;
    if (user.callName) frontmatter.callName = user.callName;
    if (user.timezone) frontmatter.timezone = user.timezone;
    if (user.notes) frontmatter.notes = user.notes;
    
    let content = '---\n';
    for (const [key, value] of Object.entries(frontmatter)) {
      content += `${key}: ${JSON.stringify(value)}\n`;
    }
    content += '---\n\n';
    content += '# USER.md - About Your Human\n\n';
    content += '*Learn about the person you\'re helping. Update this as you go.*\n';
    
    return content;
  }
  
  // Bullet list format (preserves original format better)
  let content = '# USER.md - About Your Human\n\n';
  content += '*Learn about the person you\'re helping. Update this as you go.*\n\n';
  
  if (user.name) content += `- **Name:** ${user.name}\n`;
  if (user.callName) content += `- **What to call them:** ${user.callName}\n`;
  if (user.timezone) content += `- **Timezone:** ${user.timezone}\n`;
  if (user.notes) content += `- **Notes:** ${user.notes}\n`;
  
  return content;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate identity data
 */
export function validateIdentity(data: IdentityData): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  
  // Identity file validation
  if (data.identity) {
    if (!data.identity.name) {
      warnings.push({
        file: 'identity',
        field: 'name',
        message: 'Bot name is not set - consider choosing a name',
      });
    }
    
    if (data.identity.emoji && data.identity.emoji.length > 4) {
      warnings.push({
        file: 'identity',
        field: 'emoji',
        message: 'Emoji field seems long - should be a single emoji',
      });
    }
    
    if (data.identity.avatar) {
      // Validate avatar is a valid path, URL, or data URI
      const avatar = data.identity.avatar;
      const isUrl = avatar.startsWith('http://') || avatar.startsWith('https://');
      const isDataUri = avatar.startsWith('data:');
      const isRelativePath = !isUrl && !isDataUri && !path.isAbsolute(avatar);
      
      if (!isUrl && !isDataUri && !isRelativePath) {
        warnings.push({
          file: 'identity',
          field: 'avatar',
          message: 'Avatar should be a relative path, URL, or data URI',
        });
      }
    }
  }
  
  // User file validation
  if (data.user) {
    if (!data.user.name) {
      warnings.push({
        file: 'user',
        field: 'name',
        message: 'User name is not set',
      });
    }
    
    if (data.user.timezone) {
      // Basic timezone format validation
      const tz = data.user.timezone;
      if (!tz.includes('/') && !['UTC', 'GMT'].includes(tz.toUpperCase())) {
        warnings.push({
          file: 'user',
          field: 'timezone',
          message: 'Timezone should be in IANA format (e.g., America/New_York)',
        });
      }
    }
  }
  
  // Soul file validation
  if (data.soul) {
    if (!data.soul.boundaries || data.soul.boundaries.length === 0) {
      warnings.push({
        file: 'soul',
        field: 'boundaries',
        message: 'No boundaries defined - consider adding safety guidelines',
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Main Identity Class
// ============================================================================

/**
 * Identity manager - loads, parses, validates, and saves identity files
 */
export class Identity {
  private basePath: string;
  private data: IdentityData = {};
  private loaded: boolean = false;
  
  constructor(basePath: string) {
    this.basePath = basePath;
  }
  
  /**
   * Get the base path for identity files
   */
  getBasePath(): string {
    return this.basePath;
  }
  
  /**
   * Check if identity has been loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }
  
  /**
   * Get all identity data
   */
  getData(): IdentityData {
    return this.data;
  }
  
  /**
   * Get soul data
   */
  getSoul(): SoulData | undefined {
    return this.data.soul;
  }
  
  /**
   * Get identity file data
   */
  getIdentity(): IdentityFileData | undefined {
    return this.data.identity;
  }
  
  /**
   * Get user data
   */
  getUser(): UserData | undefined {
    return this.data.user;
  }
  
  /**
   * Get bot name (convenience method)
   */
  getName(): string | undefined {
    return this.data.identity?.name;
  }
  
  /**
   * Get user's preferred name (convenience method)
   */
  getUserName(): string | undefined {
    return this.data.user?.callName || this.data.user?.name;
  }
  
  /**
   * Load identity files from disk
   */
  async load(): Promise<IdentityData> {
    const results: IdentityData = {};
    
    // Load SOUL.md
    try {
      const soulPath = path.join(this.basePath, 'SOUL.md');
      const soulContent = await fs.readFile(soulPath, 'utf-8');
      results.soul = parseSoul(soulContent);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
      // File doesn't exist - that's ok
    }
    
    // Load IDENTITY.md
    try {
      const identityPath = path.join(this.basePath, 'IDENTITY.md');
      const identityContent = await fs.readFile(identityPath, 'utf-8');
      results.identity = parseIdentity(identityContent);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
    
    // Load USER.md
    try {
      const userPath = path.join(this.basePath, 'USER.md');
      const userContent = await fs.readFile(userPath, 'utf-8');
      results.user = parseUser(userContent);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
    
    this.data = results;
    this.loaded = true;
    return results;
  }
  
  /**
   * Save identity files to disk
   */
  async save(options: { useYaml?: boolean; preserveRaw?: boolean } = {}): Promise<void> {
    const { useYaml = true, preserveRaw = true } = options;
    
    // Save SOUL.md
    if (this.data.soul) {
      const soulPath = path.join(this.basePath, 'SOUL.md');
      const content = preserveRaw && this.data.soul.raw 
        ? this.data.soul.raw 
        : serializeSoul(this.data.soul);
      await fs.writeFile(soulPath, content, 'utf-8');
    }
    
    // Save IDENTITY.md
    if (this.data.identity) {
      const identityPath = path.join(this.basePath, 'IDENTITY.md');
      const content = preserveRaw && this.data.identity.raw 
        ? this.data.identity.raw 
        : serializeIdentity(this.data.identity, useYaml);
      await fs.writeFile(identityPath, content, 'utf-8');
    }
    
    // Save USER.md
    if (this.data.user) {
      const userPath = path.join(this.basePath, 'USER.md');
      const content = preserveRaw && this.data.user.raw 
        ? this.data.user.raw 
        : serializeUser(this.data.user, useYaml);
      await fs.writeFile(userPath, content, 'utf-8');
    }
  }
  
  /**
   * Update identity data (partial update)
   */
  update(updates: Partial<IdentityData>): void {
    if (updates.soul) {
      this.data.soul = { ...this.data.soul, ...updates.soul } as SoulData;
      // Clear raw since we modified
      delete this.data.soul.raw;
    }
    if (updates.identity) {
      this.data.identity = { ...this.data.identity, ...updates.identity } as IdentityFileData;
      delete this.data.identity.raw;
    }
    if (updates.user) {
      this.data.user = { ...this.data.user, ...updates.user } as UserData;
      delete this.data.user.raw;
    }
  }
  
  /**
   * Validate loaded identity data
   */
  validate(): ValidationResult {
    return validateIdentity(this.data);
  }
  
  /**
   * Export identity data as JSON (for portability)
   */
  toJSON(): IdentityData {
    // Return data without raw fields for clean export
    const result: IdentityData = {};
    
    if (this.data.soul) {
      const { raw, ...soul } = this.data.soul;
      result.soul = soul as SoulData;
    }
    if (this.data.identity) {
      const { raw, ...identity } = this.data.identity;
      result.identity = identity as IdentityFileData;
    }
    if (this.data.user) {
      const { raw, ...user } = this.data.user;
      result.user = user as UserData;
    }
    
    return result;
  }
  
  /**
   * Import identity data from JSON
   */
  fromJSON(json: IdentityData): void {
    this.data = {
      soul: json.soul ? { ...json.soul, raw: '' } : undefined,
      identity: json.identity ? { ...json.identity, raw: '' } : undefined,
      user: json.user ? { ...json.user, raw: '' } : undefined,
    };
    this.loaded = true;
  }
  
  /**
   * Static factory: load identity from path
   */
  static async load(basePath: string): Promise<Identity> {
    const identity = new Identity(basePath);
    await identity.load();
    return identity;
  }
  
  /**
   * Static factory: create empty identity
   */
  static create(basePath: string): Identity {
    const identity = new Identity(basePath);
    identity.data = {
      soul: {
        raw: '',
        sections: {},
        boundaries: [],
      },
      identity: {
        raw: '',
      },
      user: {
        raw: '',
        sections: {},
      },
    };
    identity.loaded = true;
    return identity;
  }
}

export default Identity;
