import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { getUserApiKeys, saveUserApiKeys, type UserApiKeysMasked } from '../../lib/server/settings';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Button } from '@workspace/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card';

export const Route = createFileRoute('/_authenticated/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const [keys, setKeys] = useState<UserApiKeysMasked | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [tailscaleKey, setTailscaleKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getUserApiKeys()
      .then(setKeys)
      .catch((err) => {
        console.error(err);
        setLoadError(err instanceof Error ? err.message : 'Failed to load API keys.');
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await saveUserApiKeys({
        data: {
          ...(anthropicKey.trim() && { anthropicKey: anthropicKey.trim() }),
          ...(openaiKey.trim() && { openaiKey: openaiKey.trim() }),
          ...(geminiKey.trim() && { geminiKey: geminiKey.trim() }),
          ...(tailscaleKey.trim() && { tailscaleKey: tailscaleKey.trim() }),
        },
      });
      setMessage({ type: 'success', text: 'API keys saved successfully.' });
      // Refresh masked display
      const updated = await getUserApiKeys();
      setKeys(updated);
      setAnthropicKey('');
      setOpenaiKey('');
      setGeminiKey('');
      setTailscaleKey('');
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save keys.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      {loadError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-6">
          {loadError}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>AI API Keys (Optional)</CardTitle>
          <CardDescription>
            Deployed agents authenticate with AI providers via subscription OAuth by default.
            API keys are optional for advanced or direct API-based access. Keys are encrypted at rest.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="anthropic">Anthropic API Key</Label>
              <Input
                id="anthropic"
                type="password"
                placeholder={keys?.anthropicKeyMasked ?? 'Enter your Anthropic API key'}
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                autoComplete="off"
              />
              {keys?.hasAnthropicKey && !anthropicKey && (
                <p className="text-xs text-muted-foreground">Key saved: {keys.anthropicKeyMasked}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="openai">OpenAI API Key</Label>
              <Input
                id="openai"
                type="password"
                placeholder={keys?.openaiKeyMasked ?? 'Enter your OpenAI API key'}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                autoComplete="off"
              />
              {keys?.hasOpenaiKey && !openaiKey && (
                <p className="text-xs text-muted-foreground">Key saved: {keys.openaiKeyMasked}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="gemini">Gemini API Key</Label>
              <Input
                id="gemini"
                type="password"
                placeholder={keys?.geminiKeyMasked ?? 'Enter your Gemini API key'}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                autoComplete="off"
              />
              {keys?.hasGeminiKey && !geminiKey && (
                <p className="text-xs text-muted-foreground">Key saved: {keys.geminiKeyMasked}</p>
              )}
            </div>

            {message && (
              <p
                className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
              >
                {message.text}
              </p>
            )}

            <div className="space-y-2 pt-4 border-t">
              <Label htmlFor="tailscale">Tailscale Auth Key</Label>
              <Input
                id="tailscale"
                type="password"
                placeholder={keys?.tailscaleKeyMasked ?? 'tskey-auth-...'}
                value={tailscaleKey}
                onChange={(e) => setTailscaleKey(e.target.value)}
                autoComplete="off"
              />
              {keys?.hasTailscaleKey && !tailscaleKey && (
                <p className="text-xs text-muted-foreground">Key saved: {keys.tailscaleKeyMasked}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Required for Tailscale Funnel. Each user needs their own key for network isolation.
              </p>
            </div>

            <Button
              type="submit"
              disabled={
                saving ||
                (!anthropicKey.trim() && !openaiKey.trim() && !geminiKey.trim() && !tailscaleKey.trim())
              }
            >
              {saving ? 'Saving...' : 'Save Keys'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
