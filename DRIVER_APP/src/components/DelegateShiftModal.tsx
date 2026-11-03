import React, { useState, useEffect, useRef } from 'react';
import { X, QrCode, Share2, Copy, Check, Clock, UserCheck, AlertCircle, Trash2 } from 'lucide-react';
import { AestheticQRCode, AestheticQRCodeHandle } from './AestheticQRCode';
import { AuthService, DelegationTicketResponse, DelegationActiveStatus } from '../services/auth';

interface DelegateShiftModalProps {
  token: string;
  driverName: string;
  busNumber: string;
  isOpen: boolean;
  onClose: () => void;
  onDelegationRevoked?: () => void;
}

export const DelegateShiftModal: React.FC<DelegateShiftModalProps> = ({
  token,
  driverName,
  busNumber,
  isOpen,
  onClose,
  onDelegationRevoked,
}) => {
  // Form State
  const [delegateName, setDelegateName] = useState<string>('');
  const [delegatePhone, setDelegatePhone] = useState<string>('');
  const [durationHours, setDurationHours] = useState<number>(4);
  const [note, setNote] = useState<string>('Driver on leave / duty handover');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active Ticket & Polling State
  const [ticket, setTicket] = useState<DelegationTicketResponse | null>(null);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(0);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [activeSession, setActiveSession] = useState<Record<string, string> | null>(null);
  const [isRevoking, setIsRevoking] = useState<boolean>(false);

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const qrRef = useRef<AestheticQRCodeHandle | null>(null);

  // Initial fetch of any existing active delegation status upon modal open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const status: DelegationActiveStatus = await AuthService.getActiveDelegation(token);
        if (!isMounted) return;

        if (status.activeSession) {
          setActiveSession(status.activeSession);
        } else if (status.pendingTicket) {
          const expiresAt = Number(status.pendingTicket.expiresAt);
          if (Date.now() < expiresAt) {
            setTicket({
              ticketId: status.pendingTicket.ticketId || '',
              claimUrl: `/delegate?ticket=${status.pendingTicket.ticketId}`,
              qrData: `ATS:DELEGATE:${status.pendingTicket.ticketId}`,
              expiresAt,
            });
            setTimeLeftSeconds(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
          }
        }
      } catch (err) {
        console.warn('Failed to fetch delegation status:', err);
      }
    };

    fetchStatus();

    // Poll status every 3 seconds to detect when relief driver claims the ticket
    pollIntervalRef.current = setInterval(async () => {
      try {
        const status = await AuthService.getActiveDelegation(token);
        if (!isMounted) return;
        if (status.activeSession && !activeSession) {
          setActiveSession(status.activeSession);
        }
      } catch {
        // Silently handle polling errors
      }
    }, 3000);

    return () => {
      isMounted = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isOpen, token]);

  // Countdown timer for 15-minute pending ticket
  useEffect(() => {
    if (!ticket) return;

    countdownIntervalRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.round((ticket.expiresAt - Date.now()) / 1000));
      setTimeLeftSeconds(remaining);

      if (remaining <= 0) {
        setTicket(null);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      }
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [ticket]);

  if (!isOpen) return null;

  // Generate full web claim URL
  const claimDeepLink = ticket
    ? `${window.location.origin}${window.location.pathname}?ticket=${ticket.ticketId}`
    : '';

  // Handle Generate Ticket
  const handleGenerateTicket = async () => {
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const newTicket = await AuthService.createDelegation(token, {
        delegateName: delegateName.trim() || undefined,
        delegatePhone: delegatePhone.trim() || undefined,
        durationHours,
        note: note.trim() || undefined,
      });

      setTicket(newTicket);
      setTimeLeftSeconds(Math.max(0, Math.round((newTicket.expiresAt - Date.now()) / 1000)));
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create delegation pass');
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Copy Link
  const handleCopyLink = async () => {
    if (!claimDeepLink) return;
    try {
      await navigator.clipboard.writeText(claimDeepLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback
    }
  };

  // Handle Share WhatsApp with QR Image + URL
  const handleShareWhatsApp = async () => {
    if (!claimDeepLink) return;
    const shareText = `🚌 ATS Driver Shift Handover Pass\n\nCaptain ${driverName} is delegating duty for ${busNumber}.\n\nTap to start telemetry (valid 4 hours):\n${claimDeepLink}`;

    try {
      const blob = await qrRef.current?.getBlob();
      if (blob) {
        const file = new File([blob], `pass-${busNumber.replace(/\s+/g, '_')}.png`, { type: 'image/png' });
        // Native mobile Web Share API: shares QR image directly into WhatsApp
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `ATS Shift Handover Pass - ${busNumber}`,
            text: shareText,
            files: [file],
          });
          return;
        }

        // Desktop / browser fallback: save QR image to downloads and open WhatsApp web
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pass-${busNumber.replace(/\s+/g, '_')}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.warn('Web share failed, falling back to direct WhatsApp link:', err);
    }

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
  };

  // Handle Revoke
  const handleRevoke = async () => {
    if (!confirm('Are you sure you want to revoke this delegation session immediately?')) return;
    setIsRevoking(true);
    try {
      await AuthService.revokeDelegation(token, activeSession?.jti);
      setActiveSession(null);
      setTicket(null);
      if (onDelegationRevoked) onDelegationRevoked();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to revoke delegation');
    } finally {
      setIsRevoking(false);
    }
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-sans tracking-tight">Shift Handover</h2>
              <p className="text-xs text-slate-400">Temporary Driver QR Pass</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STATE 1: Active Claimed Session in progress */}
          {activeSession ? (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-blue-500/15 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <UserCheck className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-blue-400">Relief Driver Active</h3>
                <p className="text-xs text-slate-300 mt-1">
                  <span className="font-bold text-white">{activeSession.delegateName || 'Relief Driver'}</span> is currently transmitting telemetry for <span className="font-mono text-amber-400">{busNumber}</span>.
                </p>
                <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Auto-expires after 4 hours</span>
                </div>
              </div>

              <button
                onClick={handleRevoke}
                disabled={isRevoking}
                className="w-full mt-3 py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] font-sans font-bold text-xs tracking-wider uppercase text-white transition-all shadow-lg shadow-rose-900/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                {isRevoking ? 'Revoking Access...' : 'Revoke Delegation & Take Back Bus'}
              </button>
            </div>
          ) : ticket ? (
            /* STATE 2: Ticket Generated & Pending Scan */
            <div className="space-y-4 text-center">
              <div className="p-4 rounded-3xl bg-slate-950/70 border border-slate-800 flex flex-col items-center justify-center shadow-inner">
                {/* Aesthetic Rounded Dots QR Code */}
                <AestheticQRCode
                  ref={qrRef}
                  data={claimDeepLink}
                  size={200}
                  dotsColor="#0284c7"
                  cornersColor="#2563eb"
                />

                {/* Expiry Countdown */}
                <div className="mt-3 flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-mono">
                  <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  <span className="text-slate-300">Expires in:</span>
                  <span className="font-bold text-amber-400">{formatCountdown(timeLeftSeconds)}</span>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed px-2">
                Have the substitute driver or bus in-charge scan this QR code or share the link with image.
              </p>

              {/* Share & Copy Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  onClick={handleShareWhatsApp}
                  className="py-2.5 px-3 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-sans text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-950/30 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share with QR
                </button>

                <button
                  onClick={handleCopyLink}
                  className="py-2.5 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-[0.98] text-slate-200 font-sans text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-sky-400" />
                      <span className="text-sky-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Link
                    </>
                  )}
                </button>
              </div>

              <button
                onClick={() => setTicket(null)}
                className="w-full text-xs text-slate-400 hover:text-slate-200 pt-1 transition-colors cursor-pointer underline"
              >
                Cancel & Generate New Pass
              </button>
            </div>
          ) : (
            /* STATE 3: Setup Form (Pre-generation) */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Substitute / Bus In-Charge Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Vamsi (Student Rep) or Ramesh"
                  value={delegateName}
                  onChange={(e) => setDelegateName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-950/60 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Mobile Number (Optional)
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={delegatePhone}
                  onChange={(e) => setDelegatePhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-950/60 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Duration Ceiling (Max 4 Hours)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((hrs) => (
                    <button
                      key={hrs}
                      type="button"
                      onClick={() => setDurationHours(hrs)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        durationHours === hrs
                          ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-750'
                      }`}
                    >
                      {hrs} hr{hrs > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Handover Reason / Shift Note
                </label>
                <input
                  type="text"
                  placeholder="e.g. Medical leave / emergency relief"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-950/60 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                onClick={handleGenerateTicket}
                disabled={isGenerating}
                className="w-full mt-2 py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] font-sans font-bold text-xs tracking-wider uppercase text-white transition-all shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                {isGenerating ? 'Generating Secure QR...' : 'Generate 15-Min Handover Pass'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
