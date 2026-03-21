export const DEPLOYMENT_NAME_REGEX = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;

export const REGIONS = [
  'nyc1', 'nyc3', 'sfo3', 'ams3', 'sgp1', 'lon1', 'fra1', 'blr1', 'tor1'
] as const;

export const SIZES = [
  's-1vcpu-1gb', 's-1vcpu-2gb', 's-2vcpu-2gb', 's-2vcpu-4gb', 's-4vcpu-8gb'
] as const;

export const PROVIDERS = ['digitalocean', 'aws-lightsail', 'byteplus'] as const;

export const MODELS = ['anthropic', 'openai', 'gemini', 'byteplus-arkmodel'] as const;

export type Region = typeof REGIONS[number];
export type Size = typeof SIZES[number];
export type Provider = typeof PROVIDERS[number];
export type Model = typeof MODELS[number];

export const PROVIDER_LABELS: Record<string, string> = {
  'digitalocean': 'DigitalOcean',
  'aws-lightsail': 'AWS Lightsail',
  'byteplus': 'BytePlus',
};

export const REGION_LABELS: Record<string, string> = {
  nyc1: 'New York 1', nyc3: 'New York 3', sfo3: 'San Francisco 3',
  ams3: 'Amsterdam 3', sgp1: 'Singapore 1', lon1: 'London 1',
  fra1: 'Frankfurt 1', blr1: 'Bangalore 1', tor1: 'Toronto 1',
};

export const SIZE_LABELS: Record<string, string> = {
  's-1vcpu-1gb': '1 vCPU / 1 GB', 's-1vcpu-2gb': '1 vCPU / 2 GB',
  's-2vcpu-2gb': '2 vCPU / 2 GB', 's-2vcpu-4gb': '2 vCPU / 4 GB',
  's-4vcpu-8gb': '4 vCPU / 8 GB',
};

export const MODEL_LABELS: Record<string, string> = {
  anthropic: 'Claude (Anthropic)', openai: 'GPT (OpenAI)', gemini: 'Gemini (Google)',
  'byteplus-arkmodel': 'ArkModel (BytePlus)',
};

const ADJECTIVES = [
  'brave', 'calm', 'eager', 'swift', 'bold', 'keen', 'wise', 'fair',
  'warm', 'cool', 'sharp', 'prime', 'noble', 'vivid', 'lucid',
];

const NOUNS = [
  'falcon', 'tiger', 'phoenix', 'lynx', 'raven', 'panda', 'otter',
  'cobra', 'eagle', 'bison', 'cedar', 'spark', 'pulse', 'nexus', 'prism',
];

export function generateDeploymentName(personaSlug?: string): string {
  const num = Math.floor(Math.random() * 90) + 10; // 10-99
  if (personaSlug) {
    return `${personaSlug}-${num}`;
  }
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}-${num}`;
}

export function validateDeploymentName(name: string): { valid: boolean; error?: string } {
  if (!name) return { valid: false, error: 'Name is required' };
  if (!DEPLOYMENT_NAME_REGEX.test(name)) {
    return { valid: false, error: 'Name must be 3-63 characters: lowercase letters, numbers, hyphens only. Must start and end with a letter or number.' };
  }
  return { valid: true };
}

export function validateRegion(region: string): boolean {
  return (REGIONS as readonly string[]).includes(region);
}

export function validateSize(size: string): boolean {
  return (SIZES as readonly string[]).includes(size);
}

export function validateProvider(provider: string): boolean {
  return (PROVIDERS as readonly string[]).includes(provider);
}

export function validateModel(model: string): boolean {
  return (MODELS as readonly string[]).includes(model);
}
