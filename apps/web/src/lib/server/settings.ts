import { createServerFn } from '@tanstack/react-start';
import { getAuthenticatedClient } from '../server/auth-helpers';

// Shape returned to the client — masked versions, never plaintext
export interface UserApiKeysMasked {
  hasAnthropicKey: boolean;
  hasOpenaiKey: boolean;
  hasGeminiKey: boolean;
  hasTailscaleKey: boolean;
  anthropicKeyMasked?: string; // e.g. "****1234"
  openaiKeyMasked?: string;
  geminiKeyMasked?: string;
  tailscaleKeyMasked?: string;
}

function maskKey(key: string | null | undefined): { has: boolean; masked?: string } {
  if (!key) return { has: false };
  const last4 = key.slice(-4);
  return { has: true, masked: `****${last4}` };
}

/** Get the current user's API keys (masked for display). */
export const getUserApiKeys = createServerFn({ method: 'GET' }).handler(async () => {
  const { decrypt } = await import('./credentials');
  const { supabase, user } = await getAuthenticatedClient();

  const { data } = await supabase
    .from('user_api_keys')
    .select('anthropic_key_encrypted, openai_key_encrypted, gemini_key_encrypted, tailscale_key_encrypted')
    .eq('user_id', user.id)
    .maybeSingle();

  const safeDecryptMask = (encrypted: string | null | undefined): { has: boolean; masked?: string } => {
    if (!encrypted) return { has: false };
    try {
      return maskKey(decrypt(encrypted));
    } catch {
      console.warn('Failed to decrypt API key — treating as missing');
      return { has: false };
    }
  };

  const anthropic = safeDecryptMask(data?.anthropic_key_encrypted);
  const openai = safeDecryptMask(data?.openai_key_encrypted);
  const gemini = safeDecryptMask(data?.gemini_key_encrypted);
  const tailscale = safeDecryptMask(data?.tailscale_key_encrypted);

  return {
    hasAnthropicKey: anthropic.has,
    hasOpenaiKey: openai.has,
    hasGeminiKey: gemini.has,
    hasTailscaleKey: tailscale.has,
    anthropicKeyMasked: anthropic.masked,
    openaiKeyMasked: openai.masked,
    geminiKeyMasked: gemini.masked,
    tailscaleKeyMasked: tailscale.masked,
  } satisfies UserApiKeysMasked;
});

export interface SaveApiKeysInput {
  anthropicKey?: string;
  openaiKey?: string;
  geminiKey?: string;
  tailscaleKey?: string;
}

/** Save/update user AI API keys (encrypts non-empty values, upserts). */
export const saveUserApiKeys = createServerFn({ method: 'POST' })
  .inputValidator((data: SaveApiKeysInput) => data)
  .handler(async (ctx) => {
    const { encrypt } = await import('./credentials');
    const { supabase, user } = await getAuthenticatedClient();
    const { anthropicKey, openaiKey, geminiKey, tailscaleKey } = ctx.data;

    const updates: Record<string, string | null> = {};
    if (anthropicKey !== undefined) {
      updates.anthropic_key_encrypted = anthropicKey.trim() ? encrypt(anthropicKey.trim()) : null;
    }
    if (openaiKey !== undefined) {
      updates.openai_key_encrypted = openaiKey.trim() ? encrypt(openaiKey.trim()) : null;
    }
    if (geminiKey !== undefined) {
      updates.gemini_key_encrypted = geminiKey.trim() ? encrypt(geminiKey.trim()) : null;
    }
    if (tailscaleKey !== undefined) {
      updates.tailscale_key_encrypted = tailscaleKey.trim() ? encrypt(tailscaleKey.trim()) : null;
    }

    if (Object.keys(updates).length === 0) {
      return { success: true };
    }

    const { error } = await supabase
      .from('user_api_keys')
      .upsert({ user_id: user.id, ...updates }, { onConflict: 'user_id' });

    if (error) throw new Error(error.message);
    return { success: true };
  });

/** Check if user has at least one API key configured, without decrypting. */
export async function hasAnyApiKey(userId: string, supabase: ReturnType<typeof import('../supabase.server').getSupabaseServerClient>['supabase']): Promise<boolean> {
  const { data } = await supabase
    .from('user_api_keys')
    .select('anthropic_key_encrypted, openai_key_encrypted, gemini_key_encrypted, tailscale_key_encrypted')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return false;
  return !!(data.anthropic_key_encrypted || data.openai_key_encrypted || data.gemini_key_encrypted || data.tailscale_key_encrypted);
}

/** Internal server-side only: get decrypted API keys for CLI spawn. Never expose to client. */
export async function getDecryptedUserApiKeys(userId: string, supabase: ReturnType<typeof import('../supabase.server').getSupabaseServerClient>['supabase']): Promise<{
  anthropicKey?: string;
  openaiKey?: string;
  geminiKey?: string;
  tailscaleKey?: string;
}> {
  const { decrypt } = await import('./credentials');
  const { data } = await supabase
    .from('user_api_keys')
    .select('anthropic_key_encrypted, openai_key_encrypted, gemini_key_encrypted, tailscale_key_encrypted')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return {};

  const safeDecrypt = (encrypted: string | null | undefined): string | undefined => {
    if (!encrypted) return undefined;
    try {
      return decrypt(encrypted);
    } catch {
      console.warn('Failed to decrypt API key — returning undefined');
      return undefined;
    }
  };

  return {
    anthropicKey: safeDecrypt(data.anthropic_key_encrypted),
    openaiKey: safeDecrypt(data.openai_key_encrypted),
    geminiKey: safeDecrypt(data.gemini_key_encrypted),
    tailscaleKey: safeDecrypt(data.tailscale_key_encrypted),
  };
}
