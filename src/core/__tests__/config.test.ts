/**
 * Config module tests
 *
 * Tests configuration loading, validation, and persistence.
 */

import { Config, createConfig, ConfigData, DEFAULT_CONFIG, ConfigDataSchema } from '../config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Config', () => {
  let testDir: string;
  let configDir: string;

  beforeEach(() => {
    // Create temp directory for each test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botcore-config-test-'));
    configDir = path.join(testDir, 'config');
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should create a Config instance', () => {
      const config = new Config(testDir);
      expect(config).toBeInstanceOf(Config);
      expect(config.getBasePath()).toBe(testDir);
      expect(config.getConfigDir()).toBe(path.join(testDir, 'config'));
    });

    it('should accept custom config subdirectory', () => {
      const config = new Config(testDir, 'settings');
      expect(config.getConfigDir()).toBe(path.join(testDir, 'settings'));
    });

    it('should start unloaded', () => {
      const config = new Config(testDir);
      expect(config.isLoaded()).toBe(false);
    });
  });

  describe('load()', () => {
    it('should load defaults when no config file exists', async () => {
      const config = new Config(testDir);
      await config.load();

      expect(config.isLoaded()).toBe(true);
      expect(config.getData()).toMatchObject(DEFAULT_CONFIG);
    });

    it('should load and merge config file with defaults', async () => {
      // Create config file
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'config.json'),
        JSON.stringify({
          models: { default: 'gpt-4' },
          permissions: { canSendEmails: true },
        })
      );

      const config = new Config(testDir);
      await config.load();

      expect(config.getDefaultModel()).toBe('gpt-4');
      expect(config.hasPermission('canSendEmails')).toBe(true);
      // Merged defaults
      expect(config.hasPermission('canAccessFiles')).toBe(true);
      expect(config.getDeployment()).toBe('local');
    });

    it('should load without merging defaults when specified', async () => {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'config.json'),
        JSON.stringify({
          models: { default: 'claude-3' },
        })
      );

      const config = new Config(testDir);
      await config.load({ mergeDefaults: false });

      expect(config.getDefaultModel()).toBe('claude-3');
      expect(config.getPermissions()).toBeUndefined();
    });

    it('should throw on invalid JSON', async () => {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'config.json'), 'not json');

      const config = new Config(testDir);
      await expect(config.load()).rejects.toThrow('Failed to load config');
    });

    it('should throw on invalid schema when validation enabled', async () => {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'config.json'),
        JSON.stringify({
          platform: { deployment: 'invalid-deployment-type' },
        })
      );

      const config = new Config(testDir);
      await expect(config.load()).rejects.toThrow('Config validation failed');
    });

    it('should skip validation when disabled', async () => {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'config.json'),
        JSON.stringify({
          custom: { field: 'allowed without strict validation' },
        })
      );

      const config = new Config(testDir);
      // This should not throw since we skip validation
      await config.load({ validate: false });
      expect(config.isLoaded()).toBe(true);
    });

    it('should load from custom file name', async () => {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'production.json'),
        JSON.stringify({
          models: { default: 'production-model' },
        })
      );

      const config = new Config(testDir);
      await config.load({ fileName: 'production.json' });

      expect(config.getDefaultModel()).toBe('production-model');
    });
  });

  describe('loadSync()', () => {
    it('should load synchronously', () => {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'config.json'),
        JSON.stringify({ models: { default: 'sync-model' } })
      );

      const config = new Config(testDir);
      config.loadSync();

      expect(config.getDefaultModel()).toBe('sync-model');
      expect(config.isLoaded()).toBe(true);
    });
  });

  describe('save()', () => {
    it('should save config to disk', async () => {
      const config = new Config(testDir);
      config.set('models.default', 'saved-model');
      config.set('permissions.canSendEmails', true);

      await config.save();

      const savedPath = path.join(configDir, 'config.json');
      expect(fs.existsSync(savedPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(savedPath, 'utf-8'));
      expect(content.models.default).toBe('saved-model');
      expect(content.permissions.canSendEmails).toBe(true);
    });

    it('should create directory if missing', async () => {
      const config = new Config(testDir, 'new-config-dir');
      config.set('models.default', 'test');

      await config.save();

      expect(fs.existsSync(path.join(testDir, 'new-config-dir', 'config.json'))).toBe(true);
    });

    it('should save to custom file name', async () => {
      const config = new Config(testDir);
      config.set('models.default', 'custom-file-model');

      await config.save({ fileName: 'custom.json' });

      expect(fs.existsSync(path.join(configDir, 'custom.json'))).toBe(true);
    });

    it('should save minified JSON when pretty is false', async () => {
      const config = new Config(testDir);
      config.set('models.default', 'minified');

      await config.save({ pretty: false });

      const content = fs.readFileSync(path.join(configDir, 'config.json'), 'utf-8');
      expect(content.includes('\n')).toBe(false);
    });
  });

  describe('saveSync()', () => {
    it('should save synchronously', () => {
      const config = new Config(testDir);
      config.set('models.default', 'sync-saved');

      config.saveSync();

      expect(fs.existsSync(path.join(configDir, 'config.json'))).toBe(true);
    });
  });

  describe('get() / set()', () => {
    let config: Config;

    beforeEach(() => {
      config = Config.create(testDir);
    });

    it('should get top-level values', () => {
      expect(config.get('models')).toBeDefined();
      expect(config.get('permissions')).toBeDefined();
    });

    it('should get nested values by dot notation', () => {
      config.set('models.default', 'test-model');
      expect(config.get('models.default')).toBe('test-model');
    });

    it('should return undefined for missing paths', () => {
      expect(config.get('nonexistent')).toBeUndefined();
      expect(config.get('models.nonexistent')).toBeUndefined();
      expect(config.get('deep.nested.path')).toBeUndefined();
    });

    it('should set top-level values', () => {
      config.set('models', { default: 'new-model', fallbacks: ['backup'] });
      expect(config.getModels()?.default).toBe('new-model');
      expect(config.getModels()?.fallbacks).toContain('backup');
    });

    it('should set deeply nested values', () => {
      config.set('models.preferences.temperature', 0.7);
      expect(config.get('models.preferences.temperature')).toBe(0.7);
    });

    it('should create intermediate objects when setting nested values', () => {
      config.clear();
      config.set('deep.nested.value', 'test');
      expect(config.get('deep.nested.value')).toBe('test');
    });
  });

  describe('convenience methods', () => {
    describe('getDefaultModel()', () => {
      it('should return default model', () => {
        const config = Config.create(testDir);
        config.set('models.default', 'claude-3-opus');
        expect(config.getDefaultModel()).toBe('claude-3-opus');
      });

      it('should return undefined when not set', () => {
        const config = Config.create(testDir);
        expect(config.getDefaultModel()).toBeUndefined();
      });
    });

    describe('getFallbackModels()', () => {
      it('should return fallback models', () => {
        const config = Config.create(testDir);
        config.set('models.fallbacks', ['gpt-4', 'claude-2']);
        expect(config.getFallbackModels()).toEqual(['gpt-4', 'claude-2']);
      });

      it('should return empty array when not set', () => {
        const config = Config.create(testDir);
        expect(config.getFallbackModels()).toEqual([]);
      });
    });

    describe('hasPermission()', () => {
      it('should check boolean permissions', () => {
        const config = Config.create(testDir);
        config.set('permissions.canSendEmails', true);
        config.set('permissions.canExecuteCode', false);

        expect(config.hasPermission('canSendEmails')).toBe(true);
        expect(config.hasPermission('canExecuteCode')).toBe(false);
        expect(config.hasPermission('canAccessFiles')).toBe(true); // default
      });

      it('should check allowedDomains as array permission', () => {
        const config = Config.create(testDir);
        expect(config.hasPermission('allowedDomains')).toBe(false);
        
        config.set('permissions.allowedDomains', ['example.com']);
        expect(config.hasPermission('allowedDomains')).toBe(true);
      });
    });

    describe('isSkillEnabled()', () => {
      it('should return true by default', () => {
        const config = Config.create(testDir);
        expect(config.isSkillEnabled('any-skill')).toBe(true);
      });

      it('should return false for disabled skills', () => {
        const config = Config.create(testDir);
        config.set('skills.disabled', ['blocked-skill']);
        expect(config.isSkillEnabled('blocked-skill')).toBe(false);
        expect(config.isSkillEnabled('other-skill')).toBe(true);
      });

      it('should respect enabled list', () => {
        const config = Config.create(testDir);
        config.set('skills.enabled', ['allowed-skill']);
        expect(config.isSkillEnabled('allowed-skill')).toBe(true);
        expect(config.isSkillEnabled('not-listed')).toBe(false);
      });

      it('should prioritize disabled over enabled', () => {
        const config = Config.create(testDir);
        config.set('skills.enabled', ['skill-a']);
        config.set('skills.disabled', ['skill-a']);
        expect(config.isSkillEnabled('skill-a')).toBe(false);
      });
    });

    describe('getDeployment()', () => {
      it('should return deployment type', () => {
        const config = Config.create(testDir);
        config.set('platform.deployment', 'cloud');
        expect(config.getDeployment()).toBe('cloud');
      });

      it('should return local by default', () => {
        const config = Config.create(testDir);
        expect(config.getDeployment()).toBe('local');
      });
    });

    describe('getChannels()', () => {
      it('should return channels list', () => {
        const config = Config.create(testDir);
        config.set('platform.channels', ['telegram', 'discord']);
        expect(config.getChannels()).toEqual(['telegram', 'discord']);
      });

      it('should return empty array when not set', () => {
        const config = Config.create(testDir);
        expect(config.getChannels()).toEqual([]);
      });
    });
  });

  describe('validate()', () => {
    it('should validate correct config', () => {
      const config = Config.create(testDir);
      const result = config.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should catch invalid deployment type', () => {
      const config = new Config(testDir);
      config.set('platform.deployment', 'invalid');

      const result = config.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].path).toContain('deployment');
    });

    it('should validate static data', () => {
      const valid = Config.validate({
        models: { default: 'gpt-4' },
        platform: { deployment: 'cloud' },
      });
      expect(valid.valid).toBe(true);

      const invalid = Config.validate({
        platform: { deployment: 'invalid' },
      });
      expect(invalid.valid).toBe(false);
    });
  });

  describe('export() / import()', () => {
    it('should export to JSON string', () => {
      const config = Config.create(testDir);
      config.set('models.default', 'export-test');

      const json = config.toJSON();
      const parsed = JSON.parse(json);

      expect(parsed.models.default).toBe('export-test');
    });

    it('should export to file', async () => {
      const config = Config.create(testDir);
      config.set('models.default', 'file-export');

      const exportPath = path.join(testDir, 'exported.json');
      await config.export(exportPath);

      expect(fs.existsSync(exportPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
      expect(content.models.default).toBe('file-export');
    });

    it('should import from JSON string', () => {
      const config = Config.create(testDir);
      const json = JSON.stringify({
        models: { default: 'imported-model' },
        permissions: { canExecuteCode: true },
      });

      config.fromJSON(json);

      expect(config.getDefaultModel()).toBe('imported-model');
      expect(config.hasPermission('canExecuteCode')).toBe(true);
    });

    it('should merge on import by default', () => {
      const config = Config.create(testDir);
      config.set('platform.name', 'original');

      config.fromJSON(JSON.stringify({ models: { default: 'new-model' } }));

      expect(config.getDefaultModel()).toBe('new-model');
      expect(config.get('platform.name')).toBe('original');
    });

    it('should replace on import when merge is false', () => {
      const config = Config.create(testDir);
      config.set('platform.name', 'original');

      config.fromJSON(JSON.stringify({ models: { default: 'new-model' } }), false);

      expect(config.getDefaultModel()).toBe('new-model');
      expect(config.get('platform.name')).toBeUndefined();
    });

    it('should import from file', async () => {
      // Create import file
      const importPath = path.join(testDir, 'import.json');
      fs.writeFileSync(
        importPath,
        JSON.stringify({ models: { default: 'file-import' } })
      );

      const config = Config.create(testDir);
      await config.import(importPath);

      expect(config.getDefaultModel()).toBe('file-import');
    });

    it('should throw on import file not found', async () => {
      const config = Config.create(testDir);
      await expect(config.import('/nonexistent/path.json')).rejects.toThrow(
        'Import file not found'
      );
    });

    it('should throw on import with invalid schema', () => {
      const config = Config.create(testDir);
      const invalidJson = JSON.stringify({
        platform: { deployment: 'invalid-value' },
      });

      expect(() => config.fromJSON(invalidJson)).toThrow('Import validation failed');
    });
  });

  describe('update() / reset() / clear()', () => {
    it('should update config partially', () => {
      const config = Config.create(testDir);
      const originalDeployment = config.getDeployment(); // Should be 'local' from defaults
      
      config.update({
        models: { default: 'updated' },
      });

      expect(config.getDefaultModel()).toBe('updated');
      // Other defaults preserved
      expect(config.getDeployment()).toBe(originalDeployment);
    });

    it('should reset to defaults', () => {
      const config = Config.create(testDir);
      config.set('models.default', 'custom');
      config.set('platform.deployment', 'cloud');

      config.reset();

      // After reset, should match DEFAULT_CONFIG
      expect(config.getDefaultModel()).toBe(DEFAULT_CONFIG.models?.default);
      expect(config.getDeployment()).toBe(DEFAULT_CONFIG.platform?.deployment || 'local');
    });

    it('should clear all data', () => {
      const config = Config.create(testDir);
      config.set('models.default', 'something');

      config.clear();

      expect(config.getData()).toEqual({});
    });
  });

  describe('static factories', () => {
    it('Config.load() should create and load', async () => {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'config.json'),
        JSON.stringify({ models: { default: 'factory-loaded' } })
      );

      const config = await Config.load(testDir);

      expect(config.isLoaded()).toBe(true);
      expect(config.getDefaultModel()).toBe('factory-loaded');
    });

    it('Config.create() should create with defaults', () => {
      const config = Config.create(testDir);

      expect(config.isLoaded()).toBe(true);
      expect(config.getData()).toMatchObject(DEFAULT_CONFIG);
    });

    it('Config.fromData() should create from data', () => {
      const data: ConfigData = {
        models: { default: 'from-data' },
        platform: { deployment: 'cloud' },
      };

      const config = Config.fromData(testDir, data);

      expect(config.isLoaded()).toBe(true);
      expect(config.getDefaultModel()).toBe('from-data');
      expect(config.getDeployment()).toBe('cloud');
      // Merged with defaults
      expect(config.hasPermission('canAccessFiles')).toBe(true);
    });
  });

  describe('createConfig() factory', () => {
    it('should create a Config instance', () => {
      const config = createConfig(testDir);
      expect(config).toBeInstanceOf(Config);
      expect(config.getBasePath()).toBe(testDir);
    });

    it('should accept custom config subdir', () => {
      const config = createConfig(testDir, 'custom-config');
      expect(config.getConfigDir()).toBe(path.join(testDir, 'custom-config'));
    });
  });
});

describe('ConfigDataSchema', () => {
  it('should validate complete valid config', () => {
    const data: ConfigData = {
      models: {
        default: 'claude-3',
        fallbacks: ['gpt-4', 'claude-2'],
        preferences: { temperature: 0.7 },
      },
      permissions: {
        canSendEmails: true,
        canExecuteCode: true,
        canAccessFiles: true,
        allowedDomains: ['example.com', 'test.org'],
      },
      platform: {
        name: 'TestPlatform',
        deployment: 'hybrid',
        channels: ['telegram', 'discord'],
      },
      skills: {
        enabled: ['web_search', 'file_ops'],
        disabled: ['dangerous_skill'],
      },
    };

    const result = ConfigDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should validate minimal config', () => {
    const result = ConfigDataSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate partial config', () => {
    const result = ConfigDataSchema.safeParse({
      models: { default: 'gpt-4' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid deployment type', () => {
    const result = ConfigDataSchema.safeParse({
      platform: { deployment: 'invalid' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-boolean permissions', () => {
    const result = ConfigDataSchema.safeParse({
      permissions: { canSendEmails: 'yes' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-array fallbacks', () => {
    const result = ConfigDataSchema.safeParse({
      models: { fallbacks: 'not-an-array' },
    });
    expect(result.success).toBe(false);
  });
});

describe('DEFAULT_CONFIG', () => {
  it('should have all required sections', () => {
    expect(DEFAULT_CONFIG.models).toBeDefined();
    expect(DEFAULT_CONFIG.permissions).toBeDefined();
    expect(DEFAULT_CONFIG.platform).toBeDefined();
    expect(DEFAULT_CONFIG.skills).toBeDefined();
  });

  it('should have expected permission defaults', () => {
    // Test that permissions exist and are booleans
    expect(typeof DEFAULT_CONFIG.permissions?.canSendEmails).toBe('boolean');
    expect(typeof DEFAULT_CONFIG.permissions?.canExecuteCode).toBe('boolean');
    expect(typeof DEFAULT_CONFIG.permissions?.canAccessFiles).toBe('boolean');
  });

  it('should have valid deployment type', () => {
    const validDeployments = ['local', 'cloud', 'hybrid'];
    expect(validDeployments).toContain(DEFAULT_CONFIG.platform?.deployment);
  });
});
