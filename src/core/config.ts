// Config module - Model preferences, permissions, etc.
export interface ConfigData {
  defaultModel?: string;
  permissions?: {
    canSendEmails?: boolean;
    canExecuteCode?: boolean;
    canAccessFiles?: boolean;
  };
  platform?: {
    name?: string;
    version?: string;
  };
}

export class Config {
  static load(path: string): ConfigData {
    // TODO: Load from config/ folder
    throw new Error('Not implemented');
  }

  static save(path: string, data: ConfigData): void {
    // TODO: Save to config/ folder
    throw new Error('Not implemented');
  }
}
