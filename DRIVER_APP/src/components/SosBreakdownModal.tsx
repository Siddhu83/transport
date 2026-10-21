import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, X, Users, Wrench, CheckCircle2 } from 'lucide-react';

export interface SosBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSos: (data: { passengerBand: string; failureReason: string }) => void;
  currentPassengerCount: number;
}

export const PASSENGER_BANDS = [
  { id: 'BAND_LESS_15', label: '< 15 Passengers', icon: '15' },
  { id: 'BAND_15_30', label: '15 – 30 Passengers', icon: '30' },
  { id: 'BAND_30_50', label: '30 – 50 Passengers', icon: '50' },
  { id: 'BAND_50_PLUS', label: '50+ Passengers (Full Capacity)', icon: '50+' },
];

export const FAILURE_REASONS = [
  { id: 'ENGINE_FAILURE', label: 'Engine Overheating / Mechanical Failure', code: 'ENG' },
  { id: 'FLAT_TIRE', label: 'Flat Tire / Puncture Blowout', code: 'TIRE' },
  { id: 'ACCIDENT', label: 'Traffic Collision / Road Incident', code: 'ACC' },
  { id: 'MEDICAL_EMERGENCY', label: 'Medical Emergency Onboard', code: 'MED' },
  { id: 'OTHER', label: 'Other Electrical / Fuel Failure', code: 'OTH' },
];

export const SosBreakdownModal: React.FC<SosBreakdownModalProps> = ({
  isOpen,
  onClose,
  onConfirmSos,
  currentPassengerCount,
}) => {
  const getInitialBand = () => {
    if (currentPassengerCount < 15) return 'BAND_LESS_15';
    if (currentPassengerCount <= 30) return 'BAND_15_30';
    if (currentPassengerCount <= 50) return 'BAND_30_50';
    return 'BAND_50_PLUS';
  };

  const selectedBand = getInitialBand();
  const [selectedReason, setSelectedReason] = useState<string>('ENGINE_FAILURE');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmSos({
      passengerBand: selectedBand,
      failureReason: selectedReason,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-100/90 font-sans animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-base-200 border-2 border-error-border rounded-xl p-6 shadow-2xl space-y-6 text-base-content font-sans">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-border pb-4 font-sans">
          <div className="flex items-center gap-3 font-sans">
            <div className="p-3 rounded-lg bg-error-bg border border-error-border text-error">
              <ShieldAlert className="w-7 h-7 text-error animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-base-content uppercase font-sans">
                EMERGENCY SOS BREAKDOWN
              </h2>
              <p className="text-xs text-error font-sans font-bold">Transit Relief Dispatch Controller</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-base-300 hover:bg-neutral text-base-content-muted hover:text-base-content transition-colors cursor-pointer border border-base-border font-sans"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 font-sans">
          {/* Auto-Synced Live Occupancy Badge */}
          <div className="bg-base-300 border border-base-border rounded-xl p-4 flex items-center justify-between font-sans">
            <div className="flex items-center gap-3 font-sans">
              <div className="p-2.5 rounded-lg bg-success-bg text-success border border-success-border">
                <Users className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-xs font-bold text-base-content flex items-center gap-1.5 uppercase font-sans">
                  Stranded Passenger Load
                  <CheckCircle2 className="w-4 h-4 text-success" />
                </p>
                <p className="text-xs text-base-content-muted font-semibold mt-0.5 font-sans">
                  <span className="text-sm font-black text-base-content font-mono tabular-nums">{currentPassengerCount} Passengers</span>{' '}
                  ({PASSENGER_BANDS.find(b => b.id === selectedBand)?.label || 'Synced'})
                </p>
              </div>
            </div>
            <div className="text-right font-sans">
              <span className="badge-utility badge-success-utility text-[10px] font-sans">
                Kiosk Synced
              </span>
            </div>
          </div>

          {/* Primary Failure Reason Selector */}
          <div className="space-y-2 font-sans">
            <label className="text-xs font-bold text-base-content-muted uppercase tracking-wider flex items-center gap-1.5 font-sans">
              <Wrench className="w-4 h-4 text-warning" />
              Primary Failure Category:
            </label>
            <div className="space-y-2 font-sans">
              {FAILURE_REASONS.map((reason) => {
                const isSelected = selectedReason === reason.id;
                return (
                  <button
                    key={reason.id}
                    type="button"
                    onClick={() => setSelectedReason(reason.id)}
                    className={`w-full p-3.5 rounded-xl text-left font-sans text-xs transition-colors border flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-warning-bg border-warning-border text-base-content font-bold'
                        : 'bg-base-300 border-base-border text-base-content-muted hover:bg-neutral'
                    }`}
                  >
                    <span className="font-sans">{reason.label}</span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-warning shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Warning Alert Banner */}
          <div className="bg-error-bg border border-error-border rounded-xl p-3 text-xs text-error flex items-start gap-2.5 font-sans">
            <AlertTriangle className="w-5 h-5 text-error shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed font-sans font-medium">
              Confirming SOS marks vehicle as <strong className="text-base-content font-sans">SOS BREAKDOWN</strong>, triggers Redis 5km radius sweep, and dispatches relief buses.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 font-sans">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 py-3.5 rounded-xl font-sans text-xs font-bold uppercase text-base-content-muted hover:text-base-content bg-base-300 hover:bg-neutral border border-base-border transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="w-2/3 min-h-[56px] py-3.5 rounded-xl font-sans text-xs font-extrabold uppercase tracking-wider bg-error hover:bg-error/90 text-error-content border border-error-border transition-colors active:scale-98 cursor-pointer"
            >
              DISPATCH EMERGENCY SOS
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
