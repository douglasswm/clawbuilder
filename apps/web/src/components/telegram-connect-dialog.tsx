import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { telegramSetup, telegramPair } from '../lib/server/deployments';
import type { Deployment } from '../lib/server/deployments';
import QRCode from 'qrcode';

interface TelegramConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deploymentId: string;
  telegramStatus: Deployment['telegram_status'];
  telegramBotUsername?: string | null;
  telegramError?: string | null;
  onStatusChange: () => void;
}

// Static QR code SVG for https://t.me/BotFather
const BOTFATHER_QR = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 27 27" shape-rendering="crispEdges"><path fill="#ffffff" d="M0 0h27v27H0z"/><path stroke="#000000" d="M1 1.5h7m2 0h2m5 0h1m1 0h7M1 2.5h1m5 0h1m3 0h2m3 0h1m2 0h1m5 0h1M1 3.5h1m1 0h3m1 0h1m1 0h1m2 0h2m1 0h1m1 0h1m1 0h1m1 0h3m1 0h1M1 4.5h1m1 0h3m1 0h1m1 0h8m2 0h1m1 0h3m1 0h1M1 5.5h1m1 0h3m1 0h1m1 0h1m1 0h3m1 0h3m1 0h1m1 0h3m1 0h1M1 6.5h1m5 0h1m1 0h1m1 0h3m1 0h2m2 0h1m5 0h1M1 7.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M9 8.5h2m1 0h2m2 0h2M1 9.5h1m1 0h5m2 0h1m1 0h1m1 0h4m1 0h5M4 10.5h2m4 0h3m1 0h1m2 0h1m6 0h1M1 11.5h1m3 0h5m1 0h1m4 0h3m3 0h1m1 0h2M1 12.5h1m8 0h1m1 0h1m4 0h1m2 0h1m4 0h1M1 13.5h2m2 0h1m1 0h3m1 0h1m2 0h2m2 0h4m1 0h3M1 14.5h3m1 0h2m2 0h1m1 0h1m1 0h1m3 0h1m2 0h1m1 0h1m1 0h1M1 15.5h1m3 0h1m1 0h1m1 0h1m1 0h1m3 0h2m1 0h1m1 0h3m1 0h2M1 16.5h1m2 0h3m2 0h3m1 0h1m1 0h1m2 0h4m3 0h1M1 17.5h1m1 0h1m3 0h5m1 0h9m1 0h1M9 18.5h3m3 0h3m3 0h2M1 19.5h7m2 0h1m1 0h3m1 0h2m1 0h1m1 0h1m1 0h3M1 20.5h1m5 0h1m1 0h1m2 0h1m4 0h1m3 0h2M1 21.5h1m1 0h3m1 0h1m1 0h1m1 0h2m3 0h6m1 0h3M1 22.5h1m1 0h3m1 0h1m1 0h1m3 0h2m2 0h3m1 0h5M1 23.5h1m1 0h3m1 0h1m1 0h2m3 0h2m1 0h1m4 0h2m1 0h1M1 24.5h1m5 0h1m2 0h2m1 0h2m1 0h7m2 0h1M1 25.5h7m1 0h2m2 0h1m1 0h2m1 0h8"/></svg>`;

export function TelegramConnectDialog({
  open,
  onOpenChange,
  deploymentId,
  telegramStatus,
  telegramBotUsername,
  telegramError,
  onStatusChange,
}: TelegramConnectDialogProps) {
  const [botToken, setBotToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botQrDataUrl, setBotQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (telegramBotUsername) {
      QRCode.toDataURL(`https://t.me/${telegramBotUsername}`, {
        margin: 1,
        width: 140,
      }).then(setBotQrDataUrl).catch(() => setBotQrDataUrl(null));
    }
  }, [telegramBotUsername]);

  useEffect(() => {
    if (open) {
      setBotToken('');
      setShowToken(false);
      setPairingCode('');
      setLoading(false);
    }
    setError(null);
  }, [open, telegramStatus]);

  const handleSetup = async () => {
    if (!botToken.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await telegramSetup({ data: { deploymentId, botToken: botToken.trim() } });
      setBotToken('');
      setShowToken(false);
      onStatusChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Telegram setup failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePair = async () => {
    if (pairingCode.length !== 8) return;
    setLoading(true);
    setError(null);
    try {
      await telegramPair({ data: { deploymentId, code: pairingCode } });
      setPairingCode('');
      onStatusChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Telegram pairing failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async (setter: (v: string) => void, transform?: (v: string) => string) => {
    try {
      const text = await navigator.clipboard.readText();
      setter(transform ? transform(text) : text);
    } catch {
      // Clipboard permission denied
    }
  };

  const page =
    telegramStatus === 'paired' ? 2
    : telegramStatus === 'awaiting_pairing' || telegramStatus === 'pairing' ? 1
    : 0;

  const displayError = error || telegramError;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        {/* Page 1: Connect Telegram */}
        {page === 0 && (
          <>
            <DialogHeader>
              <DialogTitle>Connect Telegram</DialogTitle>
              <DialogDescription>
                Create a Telegram bot and link it to your AI agent.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="flex items-start gap-3">
                <span className="text-xs text-muted-foreground font-medium mt-0.5">1.</span>
                <div className="space-y-2 flex-1">
                  <p className="text-xs">
                    Open{' '}
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      @BotFather
                    </a>{' '}
                    in Telegram
                  </p>
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className="border rounded p-1.5"
                      dangerouslySetInnerHTML={{ __html: BOTFATHER_QR }}
                    />
                    <p className="text-xs text-muted-foreground">Scan to open BotFather</p>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-xs text-muted-foreground font-medium mt-0.5">2.</span>
                <p className="text-xs">
                  Create your bot — BotFather will ask for a name and username
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-xs text-muted-foreground font-medium mt-0.5">3.</span>
                <p className="text-xs">Copy the token and paste it below</p>
              </div>
            </div>

            {displayError && (
              <p className="text-xs text-red-600">{displayError}</p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="bot-token" className="text-xs text-muted-foreground">
                Bot token
              </Label>
              <div className="relative">
                <Input
                  id="bot-token"
                  type={showToken ? 'text' : 'password'}
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="123456789:ABCdef..."
                  className="pr-16 font-mono"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handlePaste(setBotToken)}
                    title="Paste from clipboard"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setShowToken(!showToken)}
                    title={showToken ? 'Hide token' : 'Show token'}
                  >
                    {showToken ? (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleSetup} disabled={loading || !botToken.trim()}>
                {loading ? 'Setting up...' : 'Connect Bot'}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Page 2: Pair Your Account */}
        {page === 1 && (
          <>
            <DialogHeader>
              <DialogTitle>Pair your account</DialogTitle>
              <DialogDescription>
                Link your Telegram to your AI agent.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="flex items-start gap-3">
                <span className="text-xs text-muted-foreground font-medium mt-0.5">1.</span>
                <div className="space-y-2 flex-1">
                  <p className="text-xs">
                    Open your bot in Telegram
                    {telegramBotUsername && (
                      <>
                        {' — '}
                        <a
                          href={`https://t.me/${telegramBotUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          @{telegramBotUsername}
                        </a>
                      </>
                    )}
                  </p>
                  {botQrDataUrl && (
                    <div className="flex flex-col items-center gap-1">
                      <div className="border rounded p-1.5">
                        <img src={botQrDataUrl} alt={`QR code for @${telegramBotUsername}`} width="140" height="140" />
                      </div>
                      <p className="text-xs text-muted-foreground">Scan to open bot in Telegram</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-xs text-muted-foreground font-medium mt-0.5">2.</span>
                <p className="text-xs">
                  Tap <span className="font-medium">Start</span> — your bot will send a pairing code
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-xs text-muted-foreground font-medium mt-0.5">3.</span>
                <p className="text-xs">Enter the code below</p>
              </div>
            </div>

            {displayError && (
              <p className="text-xs text-red-600">{displayError}</p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="pairing-code" className="text-xs text-muted-foreground">
                Pairing code
              </Label>
              <div className="relative">
                <Input
                  id="pairing-code"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                  placeholder="ABCD1234"
                  className="font-mono tracking-widest pr-10"
                  maxLength={8}
                />
                <Button
                  variant="ghost"
                  size="xs"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={() => handlePaste(setPairingCode, (v) => v.trim().toUpperCase().slice(0, 8))}
                  title="Paste from clipboard"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                I'll pair later
              </Button>
              <Button onClick={handlePair} disabled={loading || pairingCode.length !== 8}>
                {loading ? 'Verifying...' : 'Verify & Connect'}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Page 3: Success */}
        {page === 2 && (
          <>
            <DialogHeader>
              <DialogTitle>Telegram is connected</DialogTitle>
              <DialogDescription>
                Your bot is ready to chat. You can message it anytime on Telegram.
              </DialogDescription>
            </DialogHeader>

            <div className="flex justify-center py-4">
              <div className="w-12 h-12 rounded-full border-2 border-green-500 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
