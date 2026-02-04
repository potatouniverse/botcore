/**
 * Config Module - Basic Example
 *
 * This example demonstrates how to use the Config module to:
 * - Load configuration from disk
 * - Access and modify config values
 * - Validate configuration
 * - Export and import configs
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  Config,
  createConfig,
  ConfigData,
  DEFAULT_CONFIG,
  ConfigDataSchema,
} from '../src/core/config';

// Example 1: Create and use config with defaults
function useDefaults() {
  console.log('=== Example 1: Using Default Config ===\n');

  // Create config with defaults (no disk load)
  const config = Config.create('/path/to/workspace');

  // Access values
  console.log('Default model:', config.getDefaultModel() || '(not set)');
  console.log('Fallback models:', config.getFallbackModels());
  console.log('Deployment type:', config.getDeployment());

  // Check permissions
  console.log('\nPermissions:');
  console.log('  Can send emails:', config.hasPermission('canSendEmails'));
  console.log('  Can execute code:', config.hasPermission('canExecuteCode'));
  console.log('  Can access files:', config.hasPermission('canAccessFiles'));

  // Check skills
  console.log('\nSkill checks:');
  console.log('  web_search enabled:', config.isSkillEnabled('web_search'));
  console.log('  dangerous_skill enabled:', config.isSkillEnabled('dangerous_skill'));

  return config;
}

// Example 2: Load config from disk
async function loadFromDisk() {
  console.log('\n=== Example 2: Loading Config from Disk ===\n');

  // Create a temporary directory with a config file
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botcore-config-example-'));
  const configDir = path.join(tmpDir, 'config');
  fs.mkdirSync(configDir, { recursive: true });

  // Write a sample config file
  const sampleConfig: ConfigData = {
    models: {
      default: 'claude-3-opus',
      fallbacks: ['gpt-4', 'claude-3-sonnet'],
      preferences: {
        temperature: 0.7,
        maxTokens: 4096,
      },
    },
    permissions: {
      canSendEmails: true,
      canExecuteCode: false,
      allowedDomains: ['github.com', 'docs.anthropic.com'],
    },
    platform: {
      name: 'MyBot',
      deployment: 'cloud',
      channels: ['telegram', 'discord'],
    },
    skills: {
      enabled: ['web_search', 'file_ops', 'calendar'],
      disabled: ['unsafe_skill'],
    },
  };

  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify(sampleConfig, null, 2)
  );

  // Load config
  const config = await Config.load(tmpDir);

  console.log('Loaded from:', tmpDir);
  console.log('Default model:', config.getDefaultModel());
  console.log('Fallbacks:', config.getFallbackModels());
  console.log('Deployment:', config.getDeployment());
  console.log('Channels:', config.getChannels());

  console.log('\nModel preferences:', config.get('models.preferences'));

  // Validate
  const validation = config.validate();
  console.log('\nValidation:', validation.valid ? '✓ Valid' : '✗ Invalid');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });

  return config;
}

// Example 3: Modify and save config
async function modifyAndSave() {
  console.log('\n=== Example 3: Modify and Save Config ===\n');

  // Create temp directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botcore-config-save-'));

  try {
    // Create config with defaults
    const config = Config.create(tmpDir);

    // Modify using set()
    config.set('models.default', 'claude-3-opus');
    config.set('models.fallbacks', ['gpt-4-turbo', 'claude-3-sonnet']);
    config.set('permissions.canSendEmails', true);
    config.set('platform.name', 'ProductionBot');
    config.set('platform.deployment', 'cloud');

    // Modify using update()
    config.update({
      skills: {
        enabled: ['web_search', 'browser', 'code_execution'],
        disabled: ['unsafe_admin'],
      },
    });

    console.log('Modified config:');
    console.log('  Model:', config.getDefaultModel());
    console.log('  Fallbacks:', config.getFallbackModels());
    console.log('  Can email:', config.hasPermission('canSendEmails'));
    console.log('  Platform:', config.get('platform.name'));

    // Save to disk
    await config.save();

    // Verify by reading back
    const savedPath = path.join(tmpDir, 'config', 'config.json');
    console.log('\nSaved to:', savedPath);
    console.log('File contents:');
    console.log(fs.readFileSync(savedPath, 'utf-8'));

  } finally {
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Example 4: Validate config data
function validateConfig() {
  console.log('\n=== Example 4: Config Validation ===\n');

  // Valid config
  const validData: ConfigData = {
    models: { default: 'gpt-4' },
    platform: { deployment: 'local' },
  };

  const validResult = Config.validate(validData);
  console.log('Valid config:', validResult.valid ? '✓' : '✗');

  // Invalid config (wrong deployment type)
  const invalidData = {
    platform: { deployment: 'serverless' }, // Invalid!
  };

  const invalidResult = Config.validate(invalidData);
  console.log('Invalid config:', invalidResult.valid ? '✓' : '✗');
  if (!invalidResult.valid) {
    console.log('Errors:');
    for (const error of invalidResult.errors) {
      console.log(`  - ${error.path}: ${error.message}`);
    }
  }

  // Using Zod schema directly
  console.log('\nDirect Zod validation:');
  const zodResult = ConfigDataSchema.safeParse({
    permissions: { canSendEmails: 'yes' }, // Wrong type!
  });

  if (!zodResult.success) {
    console.log('Zod errors:', zodResult.error.issues.map((issue: { message: string }) => issue.message));
  }
}

// Example 5: Export and import configs
async function exportImport() {
  console.log('\n=== Example 5: Export/Import Config ===\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botcore-config-export-'));

  try {
    // Create config with custom values
    const original = Config.create(tmpDir);
    original.set('models.default', 'my-custom-model');
    original.set('platform.name', 'ExportedBot');

    // Export to JSON string
    const jsonString = original.toJSON();
    console.log('Exported JSON:');
    console.log(jsonString.substring(0, 200) + '...\n');

    // Export to file
    const exportPath = path.join(tmpDir, 'backup.json');
    await original.export(exportPath);
    console.log('Exported to file:', exportPath);

    // Import into new config
    const imported = Config.create(tmpDir);
    imported.fromJSON(jsonString);
    console.log('\nImported model:', imported.getDefaultModel());
    console.log('Imported platform:', imported.get('platform.name'));

    // Import from file (with merge)
    const another = Config.create(tmpDir);
    another.set('platform.deployment', 'hybrid'); // Pre-existing value
    await another.import(exportPath, true); // Merge

    console.log('\nMerged import:');
    console.log('  Model:', another.getDefaultModel()); // From import
    console.log('  Deployment:', another.getDeployment()); // Pre-existing

    // Import from file (replace)
    const replaced = Config.create(tmpDir);
    replaced.set('platform.deployment', 'hybrid');
    await replaced.import(exportPath, false); // Replace

    console.log('\nReplaced import:');
    console.log('  Model:', replaced.getDefaultModel()); // From import
    console.log('  Deployment:', replaced.getDeployment()); // From import (default)

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Example 6: Bot context pattern
function botContext() {
  console.log('\n=== Example 6: Bot Context Pattern ===\n');

  // Typical bot startup pattern
  class SimpleBot {
    private config: Config;

    constructor(workspacePath: string) {
      this.config = Config.create(workspacePath);
    }

    async init(configPath?: string): Promise<void> {
      if (configPath) {
        await this.config.import(configPath);
      }

      console.log(`Bot initialized with model: ${this.config.getDefaultModel() || 'default'}`);
      console.log(`Deployment: ${this.config.getDeployment()}`);
      console.log(`Channels: ${this.config.getChannels().join(', ') || 'none'}`);
    }

    canDo(action: 'email' | 'code' | 'files'): boolean {
      switch (action) {
        case 'email':
          return this.config.hasPermission('canSendEmails');
        case 'code':
          return this.config.hasPermission('canExecuteCode');
        case 'files':
          return this.config.hasPermission('canAccessFiles');
        default:
          return false;
      }
    }

    useSkill(skillName: string): boolean {
      if (!this.config.isSkillEnabled(skillName)) {
        console.log(`Skill '${skillName}' is disabled`);
        return false;
      }
      console.log(`Using skill: ${skillName}`);
      return true;
    }

    getModelForTask(task: string): string {
      const prefs = this.config.get<Record<string, unknown>>('models.preferences');
      if (prefs && typeof prefs[task] === 'string') {
        return prefs[task] as string;
      }
      return this.config.getDefaultModel() || 'default-model';
    }
  }

  // Use the bot
  const bot = new SimpleBot('/path/to/workspace');
  
  // Configure it
  bot['config'].update({
    models: {
      default: 'claude-3-sonnet',
      preferences: {
        coding: 'claude-3-opus',
        chat: 'claude-3-haiku',
      },
    },
    permissions: {
      canSendEmails: true,
      canExecuteCode: true,
      canAccessFiles: true,
    },
    skills: {
      enabled: ['web_search', 'code_review'],
      disabled: ['admin_tasks'],
    },
  });

  console.log('Bot permissions:');
  console.log('  Can send email:', bot.canDo('email'));
  console.log('  Can run code:', bot.canDo('code'));
  console.log('  Can access files:', bot.canDo('files'));

  console.log('\nModel selection:');
  console.log('  For coding:', bot.getModelForTask('coding'));
  console.log('  For chat:', bot.getModelForTask('chat'));
  console.log('  For other:', bot.getModelForTask('other'));

  console.log('\nSkill usage:');
  bot.useSkill('web_search');
  bot.useSkill('admin_tasks');
}

// Example 7: Environment-specific configs
async function environmentConfigs() {
  console.log('\n=== Example 7: Environment-Specific Configs ===\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botcore-config-env-'));
  const configDir = path.join(tmpDir, 'config');
  fs.mkdirSync(configDir, { recursive: true });

  try {
    // Create different config files for different environments
    const baseConfig: ConfigData = {
      models: { default: 'claude-3-sonnet' },
      permissions: { canAccessFiles: true },
    };

    const devConfig: ConfigData = {
      ...baseConfig,
      platform: { deployment: 'local' },
      permissions: {
        ...baseConfig.permissions,
        canExecuteCode: true, // More permissive in dev
      },
    };

    const prodConfig: ConfigData = {
      ...baseConfig,
      models: { default: 'claude-3-opus' }, // Better model in prod
      platform: { deployment: 'cloud' },
      permissions: {
        ...baseConfig.permissions,
        canExecuteCode: false, // More restrictive in prod
      },
    };

    fs.writeFileSync(
      path.join(configDir, 'development.json'),
      JSON.stringify(devConfig, null, 2)
    );

    fs.writeFileSync(
      path.join(configDir, 'production.json'),
      JSON.stringify(prodConfig, null, 2)
    );

    // Load based on environment
    const env = process.env.NODE_ENV || 'development';
    const config = new Config(tmpDir);
    await config.load({ fileName: `${env}.json` });

    console.log(`Environment: ${env}`);
    console.log('Model:', config.getDefaultModel());
    console.log('Deployment:', config.getDeployment());
    console.log('Can execute code:', config.hasPermission('canExecuteCode'));

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Run all examples
async function main() {
  try {
    useDefaults();
    await loadFromDisk();
    await modifyAndSave();
    validateConfig();
    await exportImport();
    botContext();
    await environmentConfigs();

    console.log('\n✓ All examples completed successfully');
  } catch (err) {
    console.error('Example failed:', err);
    process.exit(1);
  }
}

main();
