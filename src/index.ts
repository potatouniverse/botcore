// BotCore SDK - Main entry point
export * from './core/memory';
export * from './core/identity';
export * from './core/config';
export * from './core/skills';

// CLI tools
export * from './tools/export';
export * from './tools/import';

// Types
export interface BotCorePackage {
  version: string;
  created: string;
  memory?: {
    engramDb?: string;
    dailyLogs?: string[];
  };
  identity?: {
    soul?: string;
    identity?: string;
    user?: string;
  };
  skills?: string[];
  config?: {
    models?: any;
    permissions?: any;
  };
  sessions?: string[];
}
