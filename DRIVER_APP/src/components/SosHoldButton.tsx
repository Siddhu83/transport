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
    <div className="relative w-full font-sans">
      <button
        type="button"
        onMouseDown={startHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onTouchStart={startHold}
        onTouchEnd={cancelHold}
        disabled={disabled}
        className={`w-full min-h-[72px] px-5 py-4 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-between transition-colors select-none cursor-pointer border-2 font-sans ${
          isHolding
            ? 'bg-error text-error-content border-error-border scale-[0.99]'
            : 'bg-error-bg text-base-content border-error-border hover:bg-error/80 hover:text-error-content'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-3 font-sans">
          <div className="p-2.5 rounded-lg bg-base-100 border border-error-border text-error shrink-0">
            {isHolding ? (
              <AlertTriangle className="w-6 h-6 text-warning animate-bounce" />
            ) : (
              <ShieldAlert className="w-6 h-6 text-error" />
            )}
          </div>
          <div className="text-left font-sans">
            <span className="block text-sm font-black text-base-content font-sans">
              {isHolding ? 'HOLD FOR 2 SECONDS...' : 'TRIGGER SOS BREAKDOWN'}
            </span>
            <span className="text-[11px] text-base-content-muted font-normal block mt-0.5 font-sans">
              {isHolding ? `${Math.round(progress)}% Progress` : 'Press & Hold to Prevent Accidental Trigger'}
            </span>
          </div>
        </div>

        {/* SVG Radial Progress Ring */}
        <div className="relative w-12 h-12 flex items-center justify-center shrink-0 font-sans">
          <svg className="w-12 h-12 -rotate-90 transform" viewBox="0 0 80 80">
            {/* Background Track Circle */}
            <circle
              cx="40"
              cy="40"
              r="34"
              className="text-base-300 stroke-current"
              strokeWidth="7"
              fill="transparent"
            />
            {/* Animated Progress Ring Circle */}
            <circle
              cx="40"
              cy="40"
              r="34"
              className="text-error stroke-current transition-all duration-75"
              strokeWidth="7"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="square"
              fill="transparent"
            />
          </svg>
          <span className="absolute text-[10px] font-black font-mono text-base-content tabular-nums">
            {isHolding ? `${Math.round((progress / 100) * 2)}s` : 'SOS'}
          </span>
        </div>
      </button>
    </div>
  );
};
