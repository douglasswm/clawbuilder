export const DEPLOYMENT_NAME_REGEX = /^[a-z0-9-]{3,63}$/;

export const REGIONS = [
  'nyc1', 'nyc3', 'sfo3', 'ams3', 'sgp1', 'lon1', 'fra1', 'blr1', 'tor1'
] as const;

export const SIZES = [
  's-1vcpu-1gb', 's-1vcpu-2gb', 's-2vcpu-2gb', 's-2vcpu-4gb', 's-4vcpu-8gb'
] as const;

export const MODELS = ['anthropic', 'openai', 'gemini'] as const;

export type Region = typeof REGIONS[number];
export type Size = typeof SIZES[number];
export type Model = typeof MODELS[number];

export function validateDeploymentName(name: string): { valid: boolean; error?: string } {
  if (!name) return { valid: false, error: 'Name is required' };
  if (!DEPLOYMENT_NAME_REGEX.test(name)) {
    return { valid: false, error: 'Name must be 3-63 characters: lowercase letters, numbers, hyphens only' };
  }
  return { valid: true };
}

export function validateRegion(region: string): boolean {
  return (REGIONS as readonly string[]).includes(region);
}

export function validateSize(size: string): boolean {
  return (SIZES as readonly string[]).includes(size);
}

export function validateModel(model: string): boolean {
  return (MODELS as readonly string[]).includes(model);
}
