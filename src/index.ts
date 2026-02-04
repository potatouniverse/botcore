// BotCore SDK - Main entry point

// Unified Bot interface (recommended)
export * from './core/bot';

// Individual modules (for advanced use)
export * from './core/memory';
export * from './core/identity';
export * from './core/gid';

// Re-export config with explicit types to avoid naming conflicts
export {
  Config,
  createConfig,
  ConfigData,
  ConfigDataSchema,
  ConfigLoadOptions,
  ConfigSaveOptions,
  ConfigValidationError,
  ConfigValidationResult,
  DEFAULT_CONFIG,
  ModelsConfig,
  ModelsSchema,
  PermissionsConfig,
  PermissionsSchema,
  PlatformConfig,
  PlatformSchema,
  SkillsConfig,
  SkillsSchema,
} from './core/config';

export * from './core/skills';

// CLI tools - selective exports to avoid naming conflicts
export {
  exportBot,
  readManifest,
  rewritePaths,
  ExportOptions,
  ExportManifest,
  ExportResult,
} from './tools/export';

export {
  importBot,
  validateArchive,
  listArchive,
  restorePaths,
  ImportOptions,
  ImportResult,
  // Rename to avoid conflict with identity's ValidationResult
  ValidationResult as ImportValidationResult,
} from './tools/import';

// Types

/**
 * BotCorePackage - Represents a portable bot package
 *
 * This is the in-memory representation of a bot's state,
 * which can be serialized to/from a .tar.gz archive using
 * the export/import tools.
 *
 * @example
 * ```typescript
 * // Export a bot
 * const result = await exportBot('/path/to/bot', {
 *   output: 'my-bot.tar.gz'
 * });
 *
 * // Import a bot
 * await importBot('my-bot.tar.gz', {
 *   dest: '/path/to/new-location'
 * });
 * ```
 */
export interface BotCorePackage {
  /** Package format version */
  version: string;
  /** ISO timestamp of creation */
  created: string;
  /** Memory data */
  memory?: {
    /** Path to engram database */
    engramDb?: string;
    /** List of daily log files */
    dailyLogs?: string[];
  };
  /** Identity files */
  identity?: {
    /** SOUL.md content or path */
    soul?: string;
    /** IDENTITY.md content or path */
    identity?: string;
    /** USER.md content or path */
    user?: string;
  };
  /** List of skill paths */
  skills?: string[];
  /** Configuration data */
  config?: {
    /** Model preferences */
    models?: Record<string, unknown>;
    /** Permission settings */
    permissions?: Record<string, unknown>;
  };
  /** Session data (optional) */
  sessions?: string[];
}
