import { describe, it, expect } from 'vitest';
import {
  validateDeploymentName,
  validateRegion,
  validateSize,
  validateModel,
  generateDeploymentName,
  DEPLOYMENT_NAME_REGEX,
  REGIONS,
  SIZES,
  MODELS,
  REGION_LABELS,
  SIZE_LABELS,
  MODEL_LABELS,
} from '../../src/lib/validation';
import type { Region, Size, Model } from '../../src/lib/validation';

describe('validateDeploymentName', () => {
  it('returns valid for a valid name', () => {
    expect(validateDeploymentName('my-agent')).toEqual({ valid: true });
  });

  it('returns valid for a name with numbers', () => {
    expect(validateDeploymentName('agent123')).toEqual({ valid: true });
  });

  it('returns valid for exactly 3 characters', () => {
    expect(validateDeploymentName('abc')).toEqual({ valid: true });
  });

  it('returns valid for exactly 63 characters', () => {
    expect(validateDeploymentName('a'.repeat(63))).toEqual({ valid: true });
  });

  it('returns valid for hyphens in the middle', () => {
    expect(validateDeploymentName('my-cool-agent')).toEqual({ valid: true });
  });

  it('returns invalid for empty string', () => {
    const result = validateDeploymentName('');
    expect(result.valid).toBe(false);
  });

  it('returns invalid for too short (2 chars)', () => {
    const result = validateDeploymentName('ab');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns invalid for too long (64 chars)', () => {
    const result = validateDeploymentName('a'.repeat(64));
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns invalid for uppercase letters', () => {
    const result = validateDeploymentName('MyAgent');
    expect(result.valid).toBe(false);
  });

  it('returns invalid for special characters', () => {
    const result = validateDeploymentName('my_agent!');
    expect(result.valid).toBe(false);
  });

  it('returns invalid for spaces', () => {
    const result = validateDeploymentName('my agent');
    expect(result.valid).toBe(false);
  });

  it('returns invalid for a name starting with a hyphen', () => {
    const result = validateDeploymentName('-myagent');
    expect(result.valid).toBe(false);
  });

  it('returns invalid for a name ending with a hyphen', () => {
    const result = validateDeploymentName('myagent-');
    expect(result.valid).toBe(false);
  });

  it('returns invalid for all hyphens', () => {
    const result = validateDeploymentName('---');
    expect(result.valid).toBe(false);
  });
});

describe('validateRegion', () => {
  it('returns true for every region in REGIONS', () => {
    for (const region of REGIONS) {
      expect(validateRegion(region)).toBe(true);
    }
  });

  it('returns false for an invalid region', () => {
    expect(validateRegion('us-west-9')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(validateRegion('')).toBe(false);
  });
});

describe('validateSize', () => {
  it('returns true for every size in SIZES', () => {
    for (const size of SIZES) {
      expect(validateSize(size)).toBe(true);
    }
  });

  it('returns false for an invalid size', () => {
    expect(validateSize('s-999vcpu-999gb')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(validateSize('')).toBe(false);
  });
});

describe('validateModel', () => {
  it('returns true for every model in MODELS', () => {
    for (const model of MODELS) {
      expect(validateModel(model)).toBe(true);
    }
  });

  it('returns true for anthropic', () => {
    expect(validateModel('anthropic')).toBe(true);
  });

  it('returns true for openai', () => {
    expect(validateModel('openai')).toBe(true);
  });

  it('returns true for gemini', () => {
    expect(validateModel('gemini')).toBe(true);
  });

  it('returns true for byteplus-arkmodel', () => {
    expect(validateModel('byteplus-arkmodel')).toBe(true);
  });

  it('returns false for an invalid model', () => {
    expect(validateModel('llama')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(validateModel('')).toBe(false);
  });
});

describe('DEPLOYMENT_NAME_REGEX', () => {
  it('matches valid lowercase name', () => {
    expect(DEPLOYMENT_NAME_REGEX.test('my-agent')).toBe(true);
  });

  it('does not match uppercase', () => {
    expect(DEPLOYMENT_NAME_REGEX.test('MyAgent')).toBe(false);
  });

  it('does not match fewer than 3 chars', () => {
    expect(DEPLOYMENT_NAME_REGEX.test('ab')).toBe(false);
  });

  it('does not match more than 63 chars', () => {
    expect(DEPLOYMENT_NAME_REGEX.test('a'.repeat(64))).toBe(false);
  });
});

describe('generateDeploymentName', () => {
  it('generates a name matching DEPLOYMENT_NAME_REGEX', () => {
    const name = generateDeploymentName();
    expect(DEPLOYMENT_NAME_REGEX.test(name)).toBe(true);
  });

  it('uses persona slug as prefix when provided', () => {
    const name = generateDeploymentName('customer-support');
    expect(name.startsWith('customer-support-')).toBe(true);
    expect(DEPLOYMENT_NAME_REGEX.test(name)).toBe(true);
  });

  it('generates random name without persona slug', () => {
    const name = generateDeploymentName();
    // Should be adjective-noun-number pattern
    const parts = name.split('-');
    expect(parts.length).toBe(3);
  });

  it('generates unique names across calls', () => {
    const names = new Set(Array.from({ length: 20 }, () => generateDeploymentName()));
    expect(names.size).toBeGreaterThan(1);
  });

  it('generates unique names with persona slug across calls', () => {
    const names = new Set(Array.from({ length: 20 }, () => generateDeploymentName('test')));
    expect(names.size).toBeGreaterThan(1);
  });
});

describe('label maps', () => {
  it('has a label for every region', () => {
    for (const region of REGIONS) {
      expect(REGION_LABELS[region]).toBeDefined();
    }
  });

  it('has a label for every size', () => {
    for (const size of SIZES) {
      expect(SIZE_LABELS[size]).toBeDefined();
    }
  });

  it('has a label for every model', () => {
    for (const model of MODELS) {
      expect(MODEL_LABELS[model]).toBeDefined();
    }
  });
});

describe('exported types', () => {
  it('Region type is assignable from a REGIONS value', () => {
    const region: Region = 'nyc1';
    expect(region).toBe('nyc1');
  });

  it('Size type is assignable from a SIZES value', () => {
    const size: Size = 's-1vcpu-1gb';
    expect(size).toBe('s-1vcpu-1gb');
  });

  it('Model type is assignable from a MODELS value', () => {
    const model: Model = 'anthropic';
    expect(model).toBe('anthropic');
  });
});
