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
  { id: 'ENGINE_FAILURE', label: 'Engine Overheating / Mechanical', code: 'ENG' },
  { id: 'FLAT_TIRE', label: 'Flat Tire / Puncture Blowout', code: 'TIRE' },
  { id: 'ACCIDENT', label: 'Traffic Accident / Collision', code: 'ACC' },
  { id: 'MEDICAL_EMERGENCY', label: 'Medical Emergency', code: 'MED' },
  { id: 'OTHER', label: 'Other (Electrical / Fuel)', code: 'OTH' },
];

export const SosBreakdownModal: React.FC<SosBreakdownModalProps> = ({
  isOpen,
  onClose,
  onConfirmSos,
  currentPassengerCount,
}) => {
  // Infer initial passenger band based on current passenger count
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#0f172a] border border-rose-500/40 rounded-3xl p-6 shadow-2xl space-y-6 text-slate-100 font-sans">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400">
              <ShieldAlert className="w-7 h-7 text-rose-400 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-white uppercase">
                EMERGENCY SOS BREAKDOWN
              </h2>
              <p className="text-xs text-rose-300 font-mono">1-Tap Relief Dispatch Assessment</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Auto-Synced Live Occupancy Badge */}
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between font-mono">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Users className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-white flex items-center gap-1.5 uppercase">
                  Stranded Passenger Occupancy
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </p>
                <p className="text-xs text-emerald-300 font-semibold mt-0.5">
                  <span className="text-sm font-black text-white">{currentPassengerCount} Passengers</span>{' '}
                  ({PASSENGER_BANDS.find(b => b.id === selectedBand)?.label || 'Auto-Synced'})
                </p>
              </div>
            </div>
          </div>

          {/* Primary Failure Reason Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Wrench className="w-4 h-4 text-amber-400" />
                Primary Failure Reason:
              </label>
              <div className="space-y-2">
                {FAILURE_REASONS.map((reason) => {
                  const isSelected = selectedReason === reason.id;
                  return (
                    <button
                      key={reason.id}
                      type="button"
                      onClick={() => setSelectedReason(reason.id)}
                      className={`w-full p-3.5 rounded-2xl text-left font-mono text-xs transition-all border flex items-center justify-between cursor-pointer ${isSelected
                        ? 'bg-amber-500/20 border-amber-400 text-white font-bold shadow-lg shadow-amber-950/40'
                        : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                    >
                      <span>{reason.label}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Warning Banner */}
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3 text-xs text-rose-300 flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                Confirming SOS will mark your vehicle as <strong className="text-white font-mono">SOS BREAKDOWN</strong>, trigger Redis radius candidate search, and alert the Control Tower dispatch team.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 py-4 rounded-2xl font-mono text-xs font-bold uppercase text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-2/3 min-h-[64px] py-4 rounded-2xl font-mono text-xs font-extrabold uppercase tracking-wider bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 text-white shadow-xl shadow-rose-950/60 transition-all transform active:scale-98"
              >
                DISPATCH EMERGENCY SOS
              </button>
            </div>
          </form>
        </div>
      </div>
  );
};
