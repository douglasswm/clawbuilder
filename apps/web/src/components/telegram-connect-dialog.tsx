import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
} from '@workspace/ui/components/dialog';
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
const BOTFATHER_QR = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 27 27" shape-rendering="crispEdges"><path fill="#ffffff" d="M0 0h27v27H0z"/><path stroke="#000000" d="M1 1.5h7m2 0h2m5 0h1m1 0h7M1 2.5h1m5 0h1m3 0h2m3 0h1m2 0h1m5 0h1M1 3.5h1m1 0h3m1 0h1m1 0h1m2 0h2m1 0h1m1 0h1m1 0h1m1 0h3m1 0h1M1 4.5h1m1 0h3m1 0h1m1 0h8m2 0h1m1 0h3m1 0h1M1 5.5h1m1 0h3m1 0h1m1 0h1m1 0h3m1 0h3m1 0h1m1 0h3m1 0h1M1 6.5h1m5 0h1m1 0h1m1 0h3m1 0h2m2 0h1m5 0h1M1 7.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M9 8.5h2m1 0h2m2 0h2M1 9.5h1m1 0h5m2 0h1m1 0h1m1 0h4m1 0h5M4 10.5h2m4 0h3m1 0h1m2 0h1m6 0h1M1 11.5h1m3 0h5m1 0h1m4 0h3m3 0h1m1 0h2M1 12.5h1m8 0h1m1 0h1m4 0h1m2 0h1m4 0h1M1 13.5h2m2 0h1m1 0h3m1 0h1m2 0h2m2 0h4m1 0h3M1 14.5h3m1 0h2m2 0h1m1 0h1m1 0h1m3 0h1m2 0h1m1 0h1m1 0h1M1 15.5h1m3 0h1m1 0h1m1 0h1m1 0h1m3 0h2m1 0h1m1 0h3m1 0h2M1 16.5h1m2 0h3m2 0h3m1 0h1m1 0h1m2 0h4m3 0h1M1 17.5h1m1 0h1m3 0h5m1 0h9m1 0h1M9 18.5h3m3 0h3m3 0h2M1 19.5h7m2 0h1m1 0h3m1 0h2m1 0h1m1 0h1m1 0h3M1 20.5h1m5 0h1m1 0h1m2 0h1m4 0h1m3 0h2M1 21.5h1m1 0h3m1 0h1m1 0h1m1 0h2m3 0h6m1 0h3M1 22.5h1m1 0h3m1 0h1m1 0h1m3 0h2m2 0h3m1 0h5M1 23.5h1m1 0h3m1 0h1m1 0h2m3 0h2m1 0h1m4 0h2m1 0h1M1 24.5h1m5 0h1m2 0h2m1 0h2m1 0h7m2 0h1M1 25.5h7m1 0h2m2 0h1m1 0h2m1 0h8"/></svg>`;

function PaginationDots({ active }: { active: number }) {
  return (
    <div className="flex justify-center gap-2 pt-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`w-2.5 h-2.5 rounded-full ${
            i <= active ? 'bg-white' : 'bg-white/40'
          }`}
        />
      ))}
    </div>
  );
}

function TelegramIcon() {
  return (
    <div className="flex justify-center -mt-16 mb-4">
      <div className="w-16 h-16 rounded-full bg-sky-400 flex items-center justify-center shadow-lg">
        <svg viewBox="0 0 24 24" className="w-8 h-8 text-white fill-current">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      </div>
    </div>
  );
}

function StepNumber({ num }: { num: number }) {
  return (
    <div className="w-7 h-7 rounded-full bg-sky-100 text-sky-500 flex items-center justify-center text-sm font-medium shrink-0">
      {num}
    </div>
  );
}

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

  // Generate dynamic QR code for bot username
  useEffect(() => {
    if (telegramBotUsername) {
      QRCode.toDataURL(`https://t.me/${telegramBotUsername}`, {
        margin: 1,
        width: 180,
      }).then(setBotQrDataUrl).catch(() => setBotQrDataUrl(null));
    }
  }, [telegramBotUsername]);

  // Reset local error when dialog opens or status changes
  useEffect(() => {
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

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setBotToken(text);
    } catch {
      // Clipboard permission denied — user can paste manually
    }
  };

  const handlePastePairingCode = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPairingCode(text.trim().toUpperCase().slice(0, 8));
    } catch {
      // Clipboard permission denied
    }
  };

  // Determine which page to show
  const page =
    telegramStatus === 'paired' ? 2
    : telegramStatus === 'awaiting_pairing' || telegramStatus === 'pairing' ? 1
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden border-0 bg-gradient-to-b from-sky-300 via-sky-200 to-sky-100 max-w-md">
        <TelegramIcon />

        <div className="bg-gray-50/90 backdrop-blur rounded-2xl mx-4 mb-4 p-6 space-y-5 shadow-sm">
          {/* Page 1: Connect Telegram */}
          {page === 0 && (
            <>
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">Connect Telegram</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Create a Telegram bot and link it to your AI agent
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <StepNumber num={1} />
                  <div className="space-y-3 flex-1">
                    <p className="text-sm text-gray-700 pt-1">Open @BotFather in Telegram</p>
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-sky-200 text-sky-600 text-sm hover:bg-sky-50 transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                      Open BotFather
                    </a>
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="bg-white rounded-xl p-2 shadow-sm"
                        dangerouslySetInnerHTML={{ __html: BOTFATHER_QR }}
                      />
                      <p className="text-xs text-gray-400">Scan to open BotFather</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <StepNumber num={2} />
                  <p className="text-sm text-gray-700 pt-1">
                    Create your bot — BotFather will ask for a name and username
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <StepNumber num={3} />
                  <p className="text-sm text-gray-700 pt-1">
                    Copy the token and paste it below
                  </p>
                </div>
              </div>

              {(telegramError || error) && (
                <p className="text-xs text-red-600">
                  {error || telegramError}
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="bot-token" className="sr-only">Bot token</Label>
                <div className="relative">
                  <Input
                    id="bot-token"
                    type={showToken ? 'text' : 'password'}
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="Paste your bot token here"
                    className="pr-20 bg-white"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handlePaste}
                      className="p-1 text-gray-400 hover:text-gray-600"
                      title="Paste from clipboard"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                      title={showToken ? 'Hide token' : 'Show token'}
                    >
                      {showToken ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSetup}
                disabled={loading || !botToken.trim()}
                className="w-full py-3 rounded-xl text-white font-medium bg-gradient-to-r from-blue-400 to-purple-400 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
                    </svg>
                    Setting up...
                  </>
                ) : (
                  <>Connect Bot &rarr;</>
                )}
              </button>

              <button
                onClick={() => onOpenChange(false)}
                className="w-full text-sm text-gray-400 hover:text-gray-600"
              >
                &larr; Back
              </button>
            </>
          )}

          {/* Page 2: Pair Your Account */}
          {page === 1 && (
            <>
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">Pair your account</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Link your Telegram to your AI agent
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <StepNumber num={1} />
                  <div className="space-y-3 flex-1">
                    <p className="text-sm text-gray-700 pt-1">Open your bot in Telegram</p>
                    {telegramBotUsername && (
                      <>
                        <a
                          href={`https://t.me/${telegramBotUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-sky-200 text-sky-600 text-sm hover:bg-sky-50 transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                          Open @{telegramBotUsername}
                        </a>
                        {botQrDataUrl && (
                          <div className="flex flex-col items-center gap-1">
                            <div className="bg-white rounded-xl p-2 shadow-sm">
                              <img src={botQrDataUrl} alt={`QR code for @${telegramBotUsername}`} width="180" height="180" />
                            </div>
                            <p className="text-xs text-gray-400">Scan to open bot in Telegram</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <StepNumber num={2} />
                  <p className="text-sm text-gray-700 pt-1">
                    Tap <span className="font-semibold">Start</span> — your bot will send a pairing code
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <StepNumber num={3} />
                  <p className="text-sm text-gray-700 pt-1">Enter the code below</p>
                </div>
              </div>

              {(telegramError || error) && (
                <p className="text-xs text-red-600">
                  {error || telegramError}
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="pairing-code" className="sr-only">Pairing code</Label>
                <div className="relative">
                  <Input
                    id="pairing-code"
                    value={pairingCode}
                    onChange={(e) => setPairingCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                    placeholder="Pairing code"
                    className="font-mono tracking-widest text-center text-lg bg-white pr-10"
                    maxLength={8}
                  />
                  <button
                    type="button"
                    onClick={handlePastePairingCode}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                    title="Paste from clipboard"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
              </div>

              <button
                onClick={handlePair}
                disabled={loading || pairingCode.length !== 8}
                className="w-full py-3 rounded-xl text-white font-medium bg-gradient-to-r from-blue-400 to-purple-400 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
                    </svg>
                    Verifying...
                  </>
                ) : (
                  <>&#10003; Verify &amp; Connect</>
                )}
              </button>

              <div className="flex justify-between">
                <button
                  onClick={() => onOpenChange(false)}
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  &larr; Back
                </button>
                <button
                  onClick={() => onOpenChange(false)}
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  I&apos;ll pair later
                </button>
              </div>
            </>
          )}

          {/* Page 3: Success */}
          {page === 2 && (
            <div className="text-center space-y-4 py-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full border-4 border-green-500 flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-semibold text-gray-900">Telegram is connected!</h2>
                <p className="text-sm text-gray-500 mt-2">
                  Your bot is ready to chat. You can message it anytime on Telegram.
                </p>
              </div>

              <button
                onClick={() => onOpenChange(false)}
                className="w-full py-3 rounded-xl text-white font-medium bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 transition-all flex items-center justify-center gap-2"
              >
                Continue &rarr;
              </button>
            </div>
          )}
        </div>

        <PaginationDots active={page} />
      </DialogContent>
    </Dialog>
  );
}
