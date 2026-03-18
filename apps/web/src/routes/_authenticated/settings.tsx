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

  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getUserApiKeys().then(setKeys).catch(console.error);
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
        },
      });
      setMessage({ type: 'success', text: 'API keys saved successfully.' });
      // Refresh masked display
      const updated = await getUserApiKeys();
      setKeys(updated);
      setAnthropicKey('');
      setOpenaiKey('');
      setGeminiKey('');
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

      <Card>
        <CardHeader>
          <CardTitle>AI API Keys</CardTitle>
          <CardDescription>
            Your API keys are encrypted at rest and used when deploying agents. Enter a key to add
            or update it.
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

            <Button
              type="submit"
              disabled={
                saving ||
                (!anthropicKey.trim() && !openaiKey.trim() && !geminiKey.trim())
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
