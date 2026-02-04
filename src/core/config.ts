/**
 * Config module - Model preferences, permissions, platform settings
 *
 * Manages bot configuration with:
 * - JSON schema validation (via Zod)
 * - Load/save from config/ folder
 * - Merge defaults with user config
 * - Export/import functionality
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

// ============================================================================
// Zod Schemas
// ============================================================================

/** Model preferences schema */
export const ModelsSchema = z.object({
  default: z.string().optional(),
  fallbacks: z.array(z.string()).optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
});

/** Permissions schema */
export const PermissionsSchema = z.object({
  canSendEmails: z.boolean().optional(),
  canExecuteCode: z.boolean().optional(),
  canAccessFiles: z.boolean().optional(),
  allowedDomains: z.array(z.string()).optional(),
});

/** Platform hints schema */
export const PlatformSchema = z.object({
  name: z.string().optional(),
  deployment: z.enum(['local', 'cloud', 'hybrid']).optional(),
  channels: z.array(z.string()).optional(),
});

/** Skills configuration schema */
export const SkillsSchema = z.object({
  enabled: z.array(z.string()).optional(),
  disabled: z.array(z.string()).optional(),
});

/** Complete config schema */
export const ConfigDataSchema = z.object({
  models: ModelsSchema.optional(),
  permissions: PermissionsSchema.optional(),
  platform: PlatformSchema.optional(),
  skills: SkillsSchema.optional(),
});

// ============================================================================
// Types (inferred from schemas)
// ============================================================================

export type ModelsConfig = z.infer<typeof ModelsSchema>;
export type PermissionsConfig = z.infer<typeof PermissionsSchema>;
export type PlatformConfig = z.infer<typeof PlatformSchema>;
export type SkillsConfig = z.infer<typeof SkillsSchema>;
export type ConfigData = z.infer<typeof ConfigDataSchema>;

/** Config validation error details */
export interface ConfigValidationError {
  path: string;
  message: string;
  code: string;
}

/** Config validation result */
export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  data?: ConfigData;
}

/** Options for loading config */
export interface ConfigLoadOptions {
  /** Merge with defaults (default: true) */
  mergeDefaults?: boolean;
  /** Validate after loading (default: true) */
  validate?: boolean;
  /** Config file name (default: config.json) */
  fileName?: string;
}

/** Options for saving config */
export interface ConfigSaveOptions {
  /** Pretty print JSON (default: true) */
  pretty?: boolean;
  /** Config file name (default: config.json) */
  fileName?: string;
  /** Create directory if missing (default: true) */
  createDir?: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

/** Default configuration values */
export const DEFAULT_CONFIG: ConfigData = {
  models: {
    default: undefined,
    fallbacks: [],
    preferences: {},
  },
  permissions: {
    canSendEmails: false,
    canExecuteCode: false,
    canAccessFiles: true,
    allowedDomains: [],
  },
  platform: {
    name: undefined,
    deployment: 'local',
    channels: [],
  },
  skills: {
    enabled: [],
    disabled: [],
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Deep clone a value (handles objects, arrays, primitives)
 */
function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  
  if (Array.isArray(value)) {
    return value.map(item => deepClone(item)) as T;
  }
  
  const result: Record<string, unknown> = {};
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      result[key] = deepClone((value as Record<string, unknown>)[key]);
    }
  }
  return result as T;
}

/**
 * Deep merge two objects (source into target)
 * Creates a new object, does not mutate inputs
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  // Start with a deep clone of target
  const result = deepClone(target);
  
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = result[key];
      
      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        // Recursively merge objects
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        ) as T[typeof key];
      } else if (sourceValue !== undefined) {
        // Deep clone and override with source value
        result[key] = deepClone(sourceValue) as T[typeof key];
      }
    }
  }
  
  return result;
}

/**
 * Parse Zod errors into friendly format
 */
function parseZodErrors(error: z.ZodError): ConfigValidationError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || 'root',
    message: issue.message,
    code: issue.code,
  }));
}

// ============================================================================
// Config Class
// ============================================================================

/**
 * Configuration manager for BotCore
 *
 * Handles loading, validation, and persistence of bot configuration.
 * Uses Zod for schema validation.
 *
 * @example
 * ```typescript
 * const config = new Config('/path/to/workspace');
 * await config.load();
 *
 * // Access config values
 * const model = config.get('models.default');
 * const canEmail = config.get('permissions.canSendEmails');
 *
 * // Update config
 * config.set('models.default', 'claude-3-opus');
 * await config.save();
 * ```
 */
export class Config {
  private basePath: string;
  private configDir: string;
  private data: ConfigData;
  private loaded: boolean = false;

  constructor(basePath: string, configSubdir: string = 'config') {
    this.basePath = basePath;
    this.configDir = path.join(basePath, configSubdir);
    this.data = deepMerge({} as ConfigData, DEFAULT_CONFIG);
  }

  // --------------------------------------------------------------------------
  // Static Factory Methods
  // --------------------------------------------------------------------------

  /**
   * Create a Config instance and load from disk
   */
  static async load(basePath: string, options?: ConfigLoadOptions): Promise<Config> {
    const config = new Config(basePath);
    await config.load(options);
    return config;
  }

  /**
   * Create a Config instance with default values only
   */
  static create(basePath: string): Config {
    const config = new Config(basePath);
    config.data = deepMerge({} as ConfigData, DEFAULT_CONFIG);
    config.loaded = true;
    return config;
  }

  /**
   * Create a Config instance from a ConfigData object
   */
  static fromData(basePath: string, data: ConfigData): Config {
    const config = new Config(basePath);
    config.data = deepMerge(DEFAULT_CONFIG, data);
    config.loaded = true;
    return config;
  }

  // --------------------------------------------------------------------------
  // Path Accessors
  // --------------------------------------------------------------------------

  /** Get the workspace base path */
  getBasePath(): string {
    return this.basePath;
  }

  /** Get the config directory path */
  getConfigDir(): string {
    return this.configDir;
  }

  /** Check if config has been loaded */
  isLoaded(): boolean {
    return this.loaded;
  }

  // --------------------------------------------------------------------------
  // Data Accessors
  // --------------------------------------------------------------------------

  /** Get the full config data */
  getData(): ConfigData {
    return this.data;
  }

  /** Get models configuration */
  getModels(): ModelsConfig | undefined {
    return this.data.models;
  }

  /** Get permissions configuration */
  getPermissions(): PermissionsConfig | undefined {
    return this.data.permissions;
  }

  /** Get platform configuration */
  getPlatform(): PlatformConfig | undefined {
    return this.data.platform;
  }

  /** Get skills configuration */
  getSkills(): SkillsConfig | undefined {
    return this.data.skills;
  }

  /**
   * Get a nested value by dot-notation path
   *
   * @param path - Dot-notation path (e.g., 'models.default', 'permissions.canSendEmails')
   * @returns The value at the path, or undefined if not found
   *
   * @example
   * ```typescript
   * config.get('models.default'); // 'claude-3-opus'
   * config.get('permissions.canSendEmails'); // false
   * config.get('platform.deployment'); // 'local'
   * ```
   */
  get<T = unknown>(keyPath: string): T | undefined {
    const keys = keyPath.split('.');
    let current: unknown = this.data;

    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return current as T | undefined;
  }

  /**
   * Set a nested value by dot-notation path
   *
   * @param path - Dot-notation path (e.g., 'models.default', 'permissions.canSendEmails')
   * @param value - The value to set
   *
   * @example
   * ```typescript
   * config.set('models.default', 'claude-3-opus');
   * config.set('permissions.canSendEmails', true);
   * ```
   */
  set(keyPath: string, value: unknown): void {
    const keys = keyPath.split('.');
    let current: Record<string, unknown> = this.data as Record<string, unknown>;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (current[key] === undefined || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    current[keys[keys.length - 1]] = value;
  }

  // --------------------------------------------------------------------------
  // Convenience Methods
  // --------------------------------------------------------------------------

  /** Get the default model name */
  getDefaultModel(): string | undefined {
    return this.data.models?.default;
  }

  /** Get fallback model names */
  getFallbackModels(): string[] {
    return this.data.models?.fallbacks || [];
  }

  /** Check if a permission is granted */
  hasPermission(permission: keyof PermissionsConfig): boolean {
    if (permission === 'allowedDomains') {
      // allowedDomains is an array, not a boolean
      return (this.data.permissions?.allowedDomains?.length ?? 0) > 0;
    }
    return this.data.permissions?.[permission] === true;
  }

  /** Check if a skill is enabled */
  isSkillEnabled(skillName: string): boolean {
    const skills = this.data.skills;
    if (!skills) return true; // Default: all enabled

    // Explicitly disabled takes priority
    if (skills.disabled?.includes(skillName)) {
      return false;
    }

    // If enabled list exists, skill must be in it
    if (skills.enabled && skills.enabled.length > 0) {
      return skills.enabled.includes(skillName);
    }

    return true; // Default: enabled
  }

  /** Get the deployment type */
  getDeployment(): 'local' | 'cloud' | 'hybrid' {
    return this.data.platform?.deployment || 'local';
  }

  /** Get configured channels */
  getChannels(): string[] {
    return this.data.platform?.channels || [];
  }

  // --------------------------------------------------------------------------
  // Load / Save
  // --------------------------------------------------------------------------

  /**
   * Load configuration from disk
   *
   * @param options - Load options
   * @returns The loaded config data
   */
  async load(options: ConfigLoadOptions = {}): Promise<ConfigData> {
    const {
      mergeDefaults = true,
      validate = true,
      fileName = 'config.json',
    } = options;

    const configPath = path.join(this.configDir, fileName);

    // Start with defaults if merging
    if (mergeDefaults) {
      this.data = deepMerge({} as ConfigData, DEFAULT_CONFIG);
    } else {
      this.data = {} as ConfigData;
    }

    // Try to load from file
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(content);

        if (mergeDefaults) {
          this.data = deepMerge(this.data, parsed);
        } else {
          this.data = parsed;
        }
      } catch (err) {
        throw new Error(`Failed to load config from ${configPath}: ${err}`);
      }
    }

    // Validate if requested
    if (validate) {
      const result = this.validate();
      if (!result.valid) {
        const errorMessages = result.errors.map((e) => `${e.path}: ${e.message}`).join(', ');
        throw new Error(`Config validation failed: ${errorMessages}`);
      }
    }

    this.loaded = true;
    return this.data;
  }

  /**
   * Load configuration synchronously
   */
  loadSync(options: ConfigLoadOptions = {}): ConfigData {
    const {
      mergeDefaults = true,
      validate = true,
      fileName = 'config.json',
    } = options;

    const configPath = path.join(this.configDir, fileName);

    // Start with defaults if merging
    if (mergeDefaults) {
      this.data = deepMerge({} as ConfigData, DEFAULT_CONFIG);
    } else {
      this.data = {} as ConfigData;
    }

    // Try to load from file
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content);

      if (mergeDefaults) {
        this.data = deepMerge(this.data, parsed);
      } else {
        this.data = parsed;
      }
    }

    // Validate if requested
    if (validate) {
      const result = this.validate();
      if (!result.valid) {
        const errorMessages = result.errors.map((e) => `${e.path}: ${e.message}`).join(', ');
        throw new Error(`Config validation failed: ${errorMessages}`);
      }
    }

    this.loaded = true;
    return this.data;
  }

  /**
   * Save configuration to disk
   *
   * @param options - Save options
   */
  async save(options: ConfigSaveOptions = {}): Promise<void> {
    const { pretty = true, fileName = 'config.json', createDir = true } = options;

    // Ensure config directory exists
    if (createDir && !fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    const configPath = path.join(this.configDir, fileName);
    const content = pretty
      ? JSON.stringify(this.data, null, 2)
      : JSON.stringify(this.data);

    fs.writeFileSync(configPath, content, 'utf-8');
  }

  /**
   * Save configuration synchronously
   */
  saveSync(options: ConfigSaveOptions = {}): void {
    const { pretty = true, fileName = 'config.json', createDir = true } = options;

    // Ensure config directory exists
    if (createDir && !fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    const configPath = path.join(this.configDir, fileName);
    const content = pretty
      ? JSON.stringify(this.data, null, 2)
      : JSON.stringify(this.data);

    fs.writeFileSync(configPath, content, 'utf-8');
  }

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  /**
   * Validate current config data against the schema
   *
   * @returns Validation result with errors if any
   */
  validate(): ConfigValidationResult {
    const result = ConfigDataSchema.safeParse(this.data);

    if (result.success) {
      return {
        valid: true,
        errors: [],
        data: result.data,
      };
    }

    return {
      valid: false,
      errors: parseZodErrors(result.error),
    };
  }

  /**
   * Validate a config data object without loading
   *
   * @param data - Config data to validate
   * @returns Validation result
   */
  static validate(data: unknown): ConfigValidationResult {
    const result = ConfigDataSchema.safeParse(data);

    if (result.success) {
      return {
        valid: true,
        errors: [],
        data: result.data,
      };
    }

    return {
      valid: false,
      errors: parseZodErrors(result.error),
    };
  }

  // --------------------------------------------------------------------------
  // Export / Import
  // --------------------------------------------------------------------------

  /**
   * Export config to JSON string
   *
   * @param pretty - Pretty print (default: true)
   * @returns JSON string representation
   */
  toJSON(pretty: boolean = true): string {
    return pretty
      ? JSON.stringify(this.data, null, 2)
      : JSON.stringify(this.data);
  }

  /**
   * Export config to a file
   *
   * @param exportPath - Destination file path
   * @param pretty - Pretty print (default: true)
   */
  async export(exportPath: string, pretty: boolean = true): Promise<void> {
    const content = this.toJSON(pretty);
    const dir = path.dirname(exportPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(exportPath, content, 'utf-8');
  }

  /**
   * Import config from JSON string
   *
   * @param json - JSON string to import
   * @param merge - Merge with existing config (default: true)
   * @throws Error if JSON is invalid or doesn't match schema
   */
  fromJSON(json: string, merge: boolean = true): ConfigData {
    const parsed = JSON.parse(json);
    const validation = Config.validate(parsed);

    if (!validation.valid) {
      const errorMessages = validation.errors.map((e) => `${e.path}: ${e.message}`).join(', ');
      throw new Error(`Import validation failed: ${errorMessages}`);
    }

    if (merge) {
      this.data = deepMerge(this.data, parsed);
    } else {
      this.data = parsed;
    }

    this.loaded = true;
    return this.data;
  }

  /**
   * Import config from a file
   *
   * @param importPath - Source file path
   * @param merge - Merge with existing config (default: true)
   * @returns The imported config data
   * @throws Error if file doesn't exist or is invalid
   */
  async import(importPath: string, merge: boolean = true): Promise<ConfigData> {
    if (!fs.existsSync(importPath)) {
      throw new Error(`Import file not found: ${importPath}`);
    }

    const content = fs.readFileSync(importPath, 'utf-8');
    return this.fromJSON(content, merge);
  }

  // --------------------------------------------------------------------------
  // Update Methods
  // --------------------------------------------------------------------------

  /**
   * Update config data (partial update, merged with existing)
   *
   * @param updates - Partial config data to merge
   */
  update(updates: Partial<ConfigData>): void {
    this.data = deepMerge(this.data, updates as ConfigData);
  }

  /**
   * Reset config to defaults
   */
  reset(): void {
    this.data = deepMerge({} as ConfigData, DEFAULT_CONFIG);
  }

  /**
   * Clear all config data
   */
  clear(): void {
    this.data = {} as ConfigData;
  }
}

// ============================================================================
// Convenience Factory
// ============================================================================

/**
 * Create a Config instance with common defaults
 *
 * @param basePath - Path to the workspace
 * @param configSubdir - Subdirectory for config files (default: 'config')
 */
export function createConfig(basePath: string, configSubdir: string = 'config'): Config {
  return new Config(basePath, configSubdir);
}

export default Config;
