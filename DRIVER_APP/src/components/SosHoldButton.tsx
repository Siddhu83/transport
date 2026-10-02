import React, { useState, useRef } from 'react';
import { ShieldAlert, AlertTriangle } from 'lucide-react';

export interface SosHoldButtonProps {
  onTriggerComplete: () => void;
  disabled?: boolean;
}

export const SosHoldButton: React.FC<SosHoldButtonProps> = ({
  onTriggerComplete,
  disabled = false,
}) => {
  const [isHolding, setIsHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const HOLD_DURATION_MS = 2000;
  const CIRCUMFERENCE = 213.6; // 2 * PI * r (r=34)

  const startHold = () => {
    if (disabled || isHolding) return;

    setIsHolding(true);
    setProgress(0);
    startTimeRef.current = performance.now();

    const updateProgress = () => {
      const elapsed = performance.now() - startTimeRef.current;
      const currentProgress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setProgress(currentProgress);

      if (elapsed < HOLD_DURATION_MS) {
        animFrameRef.current = requestAnimationFrame(updateProgress);
      } else {
        // 2 Seconds Reached! Trigger SOS Modal
        setIsHolding(false);
        setProgress(0);
        if (navigator.vibrate) {
          navigator.vibrate([150, 50, 150]);
        }
        onTriggerComplete();
      }
    };

    animFrameRef.current = requestAnimationFrame(updateProgress);
  };

  const cancelHold = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsHolding(false);
    setProgress(0);
  };

  const strokeDashoffset = CIRCUMFERENCE - (progress / 100) * CIRCUMFERENCE;

  return (
    <div className="relative w-full">
      <button
        type="button"
        onMouseDown={startHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onTouchStart={startHold}
        onTouchEnd={cancelHold}
        disabled={disabled}
        className={`w-full min-h-[72px] px-6 py-4 rounded-2xl font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-between transition-all transform active:scale-98 select-none cursor-pointer border shadow-2xl ${
          isHolding
            ? 'bg-rose-950/90 border-rose-500 text-rose-100 scale-[0.99] shadow-rose-900/50'
            : 'bg-rose-900/30 hover:bg-rose-900/40 border-rose-500/40 text-rose-200 hover:border-rose-500'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 shrink-0">
            {isHolding ? (
              <AlertTriangle className="w-6 h-6 text-amber-400 animate-bounce" />
            ) : (
              <ShieldAlert className="w-6 h-6 text-rose-400" />
            )}
          </div>
          <div className="text-left font-mono">
            <span className="block text-sm font-extrabold text-white">
              {isHolding ? 'HOLD FOR 2 SECONDS...' : 'TRIGGER SOS BREAKDOWN'}
            </span>
            <span className="text-[10px] text-rose-300/80 font-normal">
              {isHolding ? `${Math.round(progress)}% Filled` : 'Press & Hold to Prevent Accidental Trigger'}
            </span>
          </div>
        </div>

        {/* SVG Radial Progress Ring */}
        <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
          <svg className="w-14 h-14 -rotate-90 transform" viewBox="0 0 80 80">
            {/* Background Track Circle */}
            <circle
              cx="40"
              cy="40"
              r="34"
              className="text-rose-950 stroke-current"
              strokeWidth="6"
              fill="transparent"
            />
            {/* Animated Progress Ring Circle */}
            <circle
              cx="40"
              cy="40"
              r="34"
              className="text-rose-500 stroke-current transition-all duration-75"
              strokeWidth="6"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>
          <span className="absolute text-[10px] font-extrabold font-mono text-rose-200">
            {isHolding ? `${Math.round((progress / 100) * 2)}s` : 'SOS'}
          </span>
        </div>
      </button>
    </div>
  );
};
