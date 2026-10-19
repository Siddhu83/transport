import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Zap,
  Radio,
  Navigation,
  Gauge,
  Users,
  BatteryCharging,
  Maximize2,
  Minimize2,
  AlertTriangle,
  Play,
  Square,
  CheckCircle2,
  Wifi,
  WifiOff,
  MapPin,
  Bus,
  LogOut,
  Lock,
  Mail,
  KeyRound,
  ShieldCheck,
  UserCheck,
  ShieldAlert,
  AlertOctagon,
  X,
  Check,
  RotateCcw,
  Route as RouteIcon,
  ChevronRight,
  PhoneCall,
} from 'lucide-react';
import { requestBatteryExemption } from './services/batteryOptimization';
import { trackingDaemon, TrackingDaemonState } from './services/trackingDaemon';
import { AuthService, AuthSession } from './services/auth';
import {
  SosService,
  PassengerBand,
  SosReason,
  SosIncidentRecord,
  PASSENGER_BAND_LABELS,
  SOS_REASON_LABELS,
  getBandForPassengerCount,
} from './services/sos';

// Available campus corridors for active shift binding
const CAMPUS_CORRIDORS = [
  { id: 'a1111111-1111-4111-8111-111111111111', routeNumber: 'R-101', name: 'Sector 1 Express Corridor' },
  { id: 'a2222222-2222-4222-8222-222222222222', routeNumber: 'R-102', name: 'Sector 2 Tech Park Express' },
  { id: 'a3333333-3333-4333-8333-333333333333', routeNumber: 'R-103', name: 'Central Hostels Corridor' },
  { id: 'a4444444-4444-4444-8444-444444444444', routeNumber: 'R-104', name: 'North Tagarapuvalasa Shuttle' },
];

export const App: React.FC = () => {
  // Session State
  const [session, setSession] = useState<AuthSession | null>(() => AuthService.getSession());

  // Login Form State
  const [loginEmail, setLoginEmail] = useState<string>('driver1@transport.college.edu');
  const [loginPassword, setLoginPassword] = useState<string>('Password123!');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Active Route & Shift Binding State
  const [assignedBusId, setAssignedBusId] = useState<string>('11111111-1111-4111-8111-111111111111');
  const [assignedRouteId, setAssignedRouteId] = useState<string>('a1111111-1111-4111-8111-111111111111');

  // Tracking Daemon & Kiosk State
  const [daemonState, setDaemonState] = useState<TrackingDaemonState>(trackingDaemon.getState());
  const [batteryStatus, setBatteryStatus] = useState<string>('Exemption Ready');
  const [passengerCount, setPassengerCount] = useState<number>(15);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [simulatedMode, setSimulatedMode] = useState<boolean>(false);

  // Active Route Corridor Shift Binding State
  const [selectedRouteId, setSelectedRouteId] = useState<string>(() => {
    return session?.user?.assignedRouteId || CAMPUS_CORRIDORS[0]!.id;
  });
  const [isCorridorModalOpen, setIsCorridorModalOpen] = useState<boolean>(false);

  // SOS Breakdown & Press-and-Hold State (Sprint 9 Requirement)
  const [isHoldingSos, setIsHoldingSos] = useState<boolean>(false);
  const [sosHoldProgress, setSosHoldProgress] = useState<number>(0); // 0 - 100%
  const [isSosModalOpen, setIsSosModalOpen] = useState<boolean>(false);
  const [selectedBand, setSelectedBand] = useState<PassengerBand>('BAND_C_30_TO_50');
  const [selectedReason, setSelectedReason] = useState<SosReason>('MECHANICAL_BREAKDOWN');
  const [sosNotes, setSosNotes] = useState<string>('');
  const [isSubmittingSos, setIsSubmittingSos] = useState<boolean>(false);
  const [activeIncident, setActiveIncident] = useState<SosIncidentRecord | null>(null);
  const [sosElapsedSeconds, setSosElapsedSeconds] = useState<number>(0);

  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdStartRef = useRef<number>(0);

  // Poll daemon status every second to update UI
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      setDaemonState(trackingDaemon.getState());
    }, 1000);
    return () => clearInterval(interval);
  }, [session]);

  // Elapsed time tracker for active SOS incident
  useEffect(() => {
    if (!activeIncident) {
      setSosElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setSosElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeIncident]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      const authSession = await AuthService.login(loginEmail, loginPassword);
      setSession(authSession);
      if (authSession.user.assignedRouteId) {
        setSelectedRouteId(authSession.user.assignedRouteId);
      }
    } catch (err: any) {
      setLoginError(err.message || 'Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleQuickLogin = (email: string) => {
    setLoginEmail(email);
    setLoginPassword('Password123!');
  };

  const handleLogout = () => {
    if (daemonState.isRunning) {
      trackingDaemon.stopTracking();
    }
    trackingDaemon.setEmergencyStatus(false);
    setActiveIncident(null);
    AuthService.clearSession();
    setSession(null);
  };

  const handleRequestExemption = async () => {
    const res = await requestBatteryExemption();
    setBatteryStatus(res.message);
  };

  const handlePassengerChange = (delta: number) => {
    const maxCapacity = session?.user?.capacity || 55;
    setPassengerCount((prev) => {
      const next = Math.max(0, Math.min(maxCapacity, prev + delta));
      trackingDaemon.updatePassengerCount(next);
      return next;
    });
  };

  const handleToggleTracking = async () => {
    if (daemonState.isRunning) {
      await trackingDaemon.stopTracking();
    } else {
      const busId = session.user.assignedBusId || '11111111-1111-4111-8111-111111111111';
      const routeId = selectedRouteId || session.user.assignedRouteId || 'a1111111-1111-4111-8111-111111111111';

      await trackingDaemon.startTracking({
        busId,
        driverId: session?.user.id || 'driver-1',
        routeId,
        authToken: session?.token || '',
        forceSimulatedGps: simulatedMode,
        passengerCount,
      });
    }
    setDaemonState(trackingDaemon.getState());
  };

  const handleConfirmSos = (data: { passengerBand: string; failureReason: string }) => {
    setIsSosModalOpen(false);
    const incidentData = {
      ...data,
      timestamp: new Date().toLocaleTimeString(),
    };
    setActiveSosIncident(incidentData);

    if (daemonState.isRunning) {
      trackingDaemon.updatePassengerCount(passengerCount);
    }
  };

  const handleResolveSos = () => {
    setActiveSosIncident(null);
  };

  const toggleSimulatedMode = (enabled: boolean) => {
    setSimulatedMode(enabled);
    trackingDaemon.setSimulatedMode(enabled);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 2-SECOND PRESS-AND-HOLD SOS BREAKDOWN HANDLERS (Sprint 9 Requirement)
  // ---------------------------------------------------------------------------
  const HOLD_DURATION_MS = 2000;

  const startSosHold = useCallback(() => {
    if (activeIncident) return; // Incident already triggered
    setIsHoldingSos(true);
    holdStartRef.current = performance.now();

    if (holdTimerRef.current) clearInterval(holdTimerRef.current);

    holdTimerRef.current = setInterval(() => {
      const elapsed = performance.now() - holdStartRef.current;
      const progress = Math.min(100, Math.round((elapsed / HOLD_DURATION_MS) * 100));
      setSosHoldProgress(progress);

      if (progress >= 100) {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        setIsHoldingSos(false);
        setSosHoldProgress(0);

        // Haptic feedback trigger on completion
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([100, 50, 150]);
        }

        // Auto pre-select passenger band matching current passenger load
        setSelectedBand(getBandForPassengerCount(passengerCount));
        setIsSosModalOpen(true);
      }
    }, 30);
  }, [activeIncident, passengerCount]);

  const cancelSosHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHoldingSos(false);
    setSosHoldProgress(0);
  }, []);

  // Submit Emergency Breakdown Broadcast
  const handleConfirmSosTrigger = async () => {
    if (!session) return;
    setIsSubmittingSos(true);

    const coords = trackingDaemon.getCurrentCoordinates();
    const busId = session.user.assignedBusId || '11111111-1111-4111-8111-111111111111';
    const routeId = selectedRouteId || session.user.assignedRouteId || 'a1111111-1111-4111-8111-111111111111';

    try {
      const response = await SosService.triggerSos(
        {
          busId,
          routeId,
          latitude: coords.latitude,
          longitude: coords.longitude,
          strandedPassengerBand: selectedBand,
          reason: selectedReason,
          notes: sosNotes.trim() || undefined,
        },
        session.token
      );

      setActiveIncident(response.incident);
      trackingDaemon.setEmergencyStatus(true);
      setDaemonState(trackingDaemon.getState());
      setIsSosModalOpen(false);
    } catch (err: any) {
      console.error('Failed to trigger SOS:', err);
    } finally {
      setIsSubmittingSos(false);
    }
  };

  // Resolve / Clear Emergency
  const handleResolveSos = () => {
    trackingDaemon.setEmergencyStatus(false);
    setActiveIncident(null);
    setDaemonState(trackingDaemon.getState());
  };

  const getStatusBadge = () => {
    if (activeIncident) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-600 text-white shadow-lg shadow-rose-900/60 animate-pulse">
          <AlertOctagon className="w-3.5 h-3.5" />
          EMERGENCY SOS ACTIVE
        </span>
      );
    }
    if (!daemonState.isRunning) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          OFF DUTY
        </span>
      );
    }
    if (!daemonState.isOnline) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
          <WifiOff className="w-3.5 h-3.5" />
          CELLULAR DISCONNECT ({daemonState.bufferedPingsCount} BUFFERED)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 glow-emerald">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
        ON DUTY (LIVE TELEMETRY)
      </span>
    );
  };

  // ---------------------------------------------------------------------------
  // LOGIN SCREEN (Poppins Typography + Official Transit Portal Aesthetic)
  // ---------------------------------------------------------------------------
  if (!session) {
    return (
      <div className="min-h-screen bg-base-100 text-base-content font-sans flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 font-sans">
          {/* App Branding Header */}
          <div className="text-center space-y-3 font-sans">
            <div className="inline-flex p-3 rounded-xl bg-primary text-primary-content border border-primary-border shadow-md">
              <Bus className="w-10 h-10" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">ANITS CAPTAIN CONSOLE</h1>
              <p className="text-xs text-slate-400 mt-1">Driver Kiosk Telemetry & Emergency Dispatch Portal</p>
            </div>
          </div>

          {/* Login Kiosk Card */}
          <div className="kiosk-card p-6 space-y-5 font-sans">
            <div className="flex items-center gap-2 border-b border-base-border pb-3 font-sans">
              <Lock className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-base-content uppercase tracking-wider font-sans">Captain Authentication</h2>
            </div>

            {loginError && (
              <div className="bg-error-bg border border-error-border rounded-lg p-3 text-xs text-error flex items-center gap-2 font-sans">
                <AlertTriangle className="w-4 h-4 text-error shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4 font-sans">
              <div>
                <label className="block text-xs font-semibold text-base-content-muted mb-1.5 uppercase font-sans">Driver Email ID</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-base-content-subtle absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="driver1@transport.college.edu"
                    className="w-full bg-base-100 border border-base-border rounded-lg pl-10 pr-4 py-3 text-xs text-base-content placeholder-base-content-subtle focus:outline-none focus:border-primary transition-colors font-sans"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-base-content-muted mb-1.5 uppercase font-sans">Captain Password</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-base-content-subtle absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-base-100 border border-base-border rounded-lg pl-10 pr-4 py-3 text-xs text-base-content placeholder-base-content-subtle focus:outline-none focus:border-primary transition-colors font-sans"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full min-h-[54px] py-3.5 px-4 rounded-xl font-bold text-xs tracking-wider uppercase bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-lg shadow-emerald-950/50 transition-all transform active:scale-98 disabled:opacity-50"
              >
                {isLoggingIn ? 'AUTHENTICATING...' : 'SIGN IN TO CAPTAIN CONSOLE'}
              </button>
            </form>

            {/* Quick Testing Credentials Box */}
            <div className="pt-3 border-t border-base-border space-y-2 font-sans">
              <p className="text-[11px] font-semibold text-base-content-muted flex items-center gap-1.5 uppercase font-sans">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                Local Test Accounts (1-Tap):
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => handleQuickLogin('driver1@transport.college.edu')}
                  className="bg-base-300 hover:bg-base-100 p-2.5 rounded-lg border border-base-border text-left transition-colors cursor-pointer font-sans"
                >
                  <span className="font-bold text-base-content block font-sans">Driver #1</span>
                  <span className="text-base-content-subtle text-[10px] truncate block font-sans">driver1@transport...</span>
                  <span className="text-base-content-subtle text-[9px] font-sans">Pass: Password123!</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickLogin('driver2@transport.college.edu')}
                  className="bg-base-300 hover:bg-base-100 p-2.5 rounded-lg border border-base-border text-left transition-colors cursor-pointer font-sans"
                >
                  <span className="font-bold text-base-content block font-sans">Driver #2</span>
                  <span className="text-base-content-subtle text-[10px] truncate block font-sans">driver2@transport...</span>
                  <span className="text-base-content-subtle text-[9px] font-sans">Pass: Password123!</span>
                </button>
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-base-content-subtle font-sans font-medium">
            🔒 Official Driver Portal • College Transport Operations
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // AUTHENTICATED CAPTAIN CONSOLE (Poppins Typography Transit Kiosk)
  // ---------------------------------------------------------------------------
  const user = session.user;
  const maxCapacity = user.capacity || 55;
  const activeCorridor = CAMPUS_CORRIDORS.find((c) => c.id === selectedRouteId) || {
    id: selectedRouteId,
    routeNumber: user.routeNumber || 'R-101',
    name: user.routeName || 'Sector 1 Express Corridor',
  };

  // Radial progress math for SOS press-and-hold (circle radius 44, circumference ~276.46)
  const RADIUS = 44;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeDashoffset = CIRCUMFERENCE * (1 - sosHoldProgress / 100);

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 font-sans pb-16 selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 glass-card px-4 py-3.5 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-lg bg-primary text-primary-content flex items-center justify-center border border-primary-border">
              <Bus className="w-5 h-5" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success border-2 border-base-200 rounded-full"></span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-sm tracking-tight text-base-content font-sans">{user.name}</h1>
              <span className="bg-success-bg text-success text-[10px] font-bold px-1.5 py-0.5 rounded border border-success-border flex items-center gap-1 font-sans">
                <UserCheck className="w-3 h-3" />
                VERIFIED
              </span>
            </div>
            <p className="text-xs text-base-content-muted flex items-center gap-1.5 mt-0.5 font-sans">
              <span>{user.licensePlate || user.busNumber}</span>
              <span>•</span>
              <span className="text-emerald-400 font-medium">{activeCorridor.routeNumber}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-sans">
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-base-300 hover:bg-neutral text-base-content-muted hover:text-base-content border border-base-border text-xs font-bold transition-colors cursor-pointer font-sans"
            title="Toggle Fullscreen Mode"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={handleLogout}
            className="p-2 rounded-lg bg-error-bg hover:bg-error text-error hover:text-error-content border border-error-border text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 font-sans"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline font-sans">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Kiosk Content Area */}
      <main className="max-w-md mx-auto px-4 pt-4 space-y-4">
        {/* Status Bar */}
        <div className="flex items-center justify-between px-1 font-sans">
          {getStatusBadge()}
          <span className="text-xs text-base-content-muted flex items-center gap-1 font-bold font-sans">
            <Wifi className="w-3.5 h-3.5 text-success" />
            PING: <span className="font-mono tabular-nums">5s</span>
          </span>
        </div>

        {/* ACTIVE SOS EMERGENCY BANNER (If Incident Triggered) */}
        {activeIncident && (
          <div className="glass-card-rose rounded-3xl p-5 border-2 border-rose-500 space-y-3 glow-rose animate-pulse">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-rose-600 rounded-2xl text-white">
                  <ShieldAlert className="w-6 h-6 animate-spin-slow" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black tracking-wider uppercase text-rose-300 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-500/40">
                      INCIDENT {activeIncident.incidentId}
                    </span>
                    <span className="text-[10px] text-rose-200 font-mono font-bold">
                      {Math.floor(sosElapsedSeconds / 60)}m {sosElapsedSeconds % 60}s ago
                    </span>
                  </div>
                  <h3 className="text-sm font-extrabold text-white mt-1">
                    {SOS_REASON_LABELS[activeIncident.reason]?.label}
                  </h3>
                </div>
              </div>

              <span className="px-2.5 py-1 rounded-xl bg-rose-500/20 text-rose-300 font-mono text-[11px] font-bold border border-rose-500/30">
                {PASSENGER_BAND_LABELS[activeIncident.strandedPassengerBand]?.label}
              </span>
            </div>

            <p className="text-xs text-rose-200/90 leading-relaxed">
              📡 Emergency alert broadcasted. Control tower is sweeping nearby relief buses within 5km radius.
            </p>

            <div className="pt-1 flex items-center gap-2">
              <button
                onClick={handleResolveSos}
                className="w-full min-h-[54px] py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center gap-2 shadow-lg shadow-rose-950/80 transition-all active:scale-95"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                RELIEF ARRIVED • RESOLVE INCIDENT
              </button>
            </div>
          </div>
        )}

        {/* ACTIVE ROUTE / VEHICLE SHIFT BINDING INTERFACE (Sprint 9 Task 4) */}
        <div className="glass-card rounded-2xl p-4 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <RouteIcon className="w-4 h-4 text-emerald-400" />
              Active Shift Binding
            </span>
            <button
              onClick={() => setIsCorridorModalOpen(true)}
              className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 active:scale-95"
            >
              Change Corridor <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="bg-slate-950/70 rounded-xl p-3 flex items-center justify-between border border-slate-800/80">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-white bg-slate-800 px-2 py-0.5 rounded font-mono">
                  {user.busNumber || 'BUS-101'}
                </span>
                <span className="text-xs font-bold text-emerald-400">{activeCorridor.routeNumber}</span>
              </div>
              <p className="text-[11px] text-slate-300 font-medium mt-1">{activeCorridor.name}</p>
            </div>
            <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-1 rounded-md border border-slate-800">
              Assigned
            </span>
          </div>
        </div>

        {/* PRIMARY OPERATIONAL BUTTON: 2-SECOND PRESS-AND-HOLD SOS TRIGGER (Sprint 9 Tasks 1 & 2) */}
        <div className="glass-card-rose rounded-3xl p-6 border-2 border-rose-500/40 relative overflow-hidden shadow-2xl shadow-rose-950/40">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-400 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                Critical Safety Safeguard
              </span>
              <h2 className="text-lg font-black tracking-tight text-white">EMERGENCY SOS DISPATCH</h2>
              <p className="text-xs text-slate-400 max-w-[280px]">
                Eliminates accidental touches: press and hold for 2 seconds to initiate breakdown dispatch.
              </p>
            </div>

            {/* Circular 72x72px+ Touch Target with Radial Progress Ring */}
            <div className="relative w-28 h-28 flex items-center justify-center select-none touch-none">
              {/* SVG Radial Progress Ring */}
              <svg className="w-28 h-28 -rotate-90 transform" viewBox="0 0 100 100">
                {/* Background Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r={RADIUS}
                  className="stroke-slate-800/80"
                  strokeWidth="6"
                  fill="transparent"
                />
                {/* Animated Radial Progress Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r={RADIUS}
                  className="stroke-rose-500 transition-all duration-75 ease-linear"
                  strokeWidth="6"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>

              {/* Center Trigger Button (Exceeds 72x72px Touch Target requirement) */}
              <button
                type="button"
                onPointerDown={startSosHold}
                onPointerUp={cancelSosHold}
                onPointerLeave={cancelSosHold}
                onPointerCancel={cancelSosHold}
                disabled={Boolean(activeIncident)}
                className={`absolute w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-xl ${
                  activeIncident
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : isHoldingSos
                    ? 'bg-rose-500 text-white scale-105 shadow-rose-600/80'
                    : 'bg-gradient-to-tr from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 text-white shadow-rose-900/60'
                }`}
                style={{ minWidth: '72px', minHeight: '72px' }}
                aria-label="Hold 2 seconds to trigger SOS Breakdown"
              >
                <AlertOctagon className={`w-8 h-8 ${isHoldingSos ? 'animate-bounce' : ''}`} />
                <span className="text-[10px] font-black tracking-wider uppercase mt-0.5">
                  {isHoldingSos ? `${sosHoldProgress}%` : 'SOS'}
                </span>
              </button>
            </div>

            <div className="text-[11px] text-slate-400 font-mono">
              {isHoldingSos ? (
                <span className="text-rose-400 font-bold animate-pulse">
                  HOLD FIRMLY... {((2000 - (sosHoldProgress / 100) * 2000) / 1000).toFixed(1)}s
                </span>
              ) : activeIncident ? (
                <span className="text-rose-400 font-semibold">Emergency Broadcast Active</span>
              ) : (
                <span>Hold 2s to open breakdown incident room</span>
              )}
            </div>
          </div>
        </div>

        {/* Insecure HTTP Security Warning Banner */}
        {daemonState.locationProvider === 'INSECURE_ORIGIN_SIMULATED' && (
          <div className="glass-card-rose rounded-2xl p-4 space-y-2 border border-rose-500/30">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <p className="font-bold text-rose-200 text-xs">HTTP Wi-Fi Geolocation Notice</p>
                <p className="text-slate-300 text-[11px] leading-relaxed mt-0.5">
                  Mobile browsers block raw hardware GPS over unencrypted <code className="bg-slate-950/80 px-1 py-0.5 rounded text-amber-300 font-mono">http://</code> LAN Wi-Fi IPs.
                </p>
              </div>

              <span className="px-2.5 py-1 rounded-xl bg-rose-500/20 text-rose-300 font-mono text-[11px] font-bold border border-rose-500/30">
                {PASSENGER_BAND_LABELS[activeIncident.strandedPassengerBand]?.label}
              </span>
            </div>

            <div className="bg-slate-950/80 rounded-xl p-2.5 text-[11px] space-y-1 border border-slate-800 font-mono">
              <p className="font-bold text-emerald-400 flex items-center gap-1">
                <span>🔒 For 100% Real Phone GPS:</span>
              </p>
              <p className="text-slate-300">
                Open <code className="text-emerald-300 underline font-semibold">https://{window.location.hostname}:3001</code> on your phone (accept SSL certificate prompt).
              </p>
            </div>

            {/* Circular 72x72px+ Touch Target with Radial Progress Ring */}
            <div className="relative w-28 h-28 flex items-center justify-center select-none touch-none">
              {/* SVG Radial Progress Ring */}
              <svg className="w-28 h-28 -rotate-90 transform" viewBox="0 0 100 100">
                {/* Background Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r={RADIUS}
                  className="stroke-slate-800/80"
                  strokeWidth="6"
                  fill="transparent"
                />
                {/* Animated Radial Progress Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r={RADIUS}
                  className="stroke-rose-500 transition-all duration-75 ease-linear"
                  strokeWidth="6"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>

              {/* Center Trigger Button (Exceeds 72x72px Touch Target requirement) */}
              <button
                type="button"
                onPointerDown={startSosHold}
                onPointerUp={cancelSosHold}
                onPointerLeave={cancelSosHold}
                onPointerCancel={cancelSosHold}
                disabled={Boolean(activeIncident)}
                className={`absolute w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-xl ${
                  activeIncident
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : isHoldingSos
                    ? 'bg-rose-500 text-white scale-105 shadow-rose-600/80'
                    : 'bg-gradient-to-tr from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 text-white shadow-rose-900/60'
                }`}
                style={{ minWidth: '72px', minHeight: '72px' }}
                aria-label="Hold 2 seconds to trigger SOS Breakdown"
              >
                <AlertOctagon className={`w-8 h-8 ${isHoldingSos ? 'animate-bounce' : ''}`} />
                <span className="text-[10px] font-black tracking-wider uppercase mt-0.5">
                  {isHoldingSos ? `${sosHoldProgress}%` : 'SOS'}
                </span>
              </button>
            </div>

            <div className="text-[11px] text-slate-400 font-mono">
              {isHoldingSos ? (
                <span className="text-rose-400 font-bold animate-pulse">
                  HOLD FIRMLY... {((2000 - (sosHoldProgress / 100) * 2000) / 1000).toFixed(1)}s
                </span>
              ) : activeIncident ? (
                <span className="text-rose-400 font-semibold">Emergency Broadcast Active</span>
              ) : (
                <span>Hold 2s to open breakdown incident room</span>
              )}
            </div>
          </div>
        </div>

        {/* Active Emergency SOS Incident Alert Control Banner */}
        {activeSosIncident && (
          <div className="kiosk-card-error p-4 space-y-3 font-sans animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-6 h-6 text-error animate-pulse" />
                <div>
                  <h3 className="text-sm font-black text-base-content uppercase font-sans">
                    SOS INCIDENT ACTIVE
                  </h3>
                  <p className="text-[11px] text-error font-bold font-sans">
                    Reported at <span className="font-mono tabular-nums">{activeSosIncident.timestamp}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={handleResolveSos}
                className="px-3 py-1.5 rounded-lg bg-base-100 border border-base-border text-xs text-success font-bold hover:bg-base-300 flex items-center gap-1 cursor-pointer font-sans"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Resolve
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-sans">
              <div className="bg-base-100 p-2.5 rounded-lg border border-base-border">
                <span className="text-[10px] text-base-content-subtle block uppercase font-sans">FAILURE REASON</span>
                <span className="font-bold text-warning font-sans">{activeSosIncident.failureReason}</span>
              </div>
              <div className="bg-base-100 p-2.5 rounded-lg border border-base-border">
                <span className="text-[10px] text-base-content-subtle block uppercase font-sans">STRANDED BAND</span>
                <span className="font-bold text-error font-sans">{activeSosIncident.passengerBand}</span>
              </div>
            </div>
          </div>
        )}

        {/* Pre-Shift Bus & Route Binding Selector (Only available when off duty) */}
        {!daemonState.isRunning && (
          <div className="kiosk-card p-4 space-y-3 font-sans text-xs">
            <div className="flex items-center justify-between border-b border-base-border pb-2 font-sans">
              <span className="font-bold text-base-content flex items-center gap-1.5 uppercase font-sans">
                <MapPin className="w-4 h-4 text-primary" />
                Pre-Shift Assignment:
              </span>
              <span className="badge-utility badge-success-utility text-[10px] font-sans">
                Shift Ready
              </span>
            </div>

            <p className="text-[10px] text-emerald-400 font-medium pt-0.5">
              ⚡ Running Route GPS Simulator so pings stream to server seamlessly over HTTP!
            </p>
          </div>
        )}

        {/* Hero Duty Switch (Min 72px touch target) */}
        <div
          className={`kiosk-card p-5 transition-colors duration-200 ${
            daemonState.isRunning ? 'border-2 border-error-border' : 'border-2 border-primary-border'
          }`}
        >
          <div className="text-center space-y-4 font-sans">
            <div className="inline-flex p-3 rounded-lg bg-base-100 border border-base-border">
              {daemonState.isRunning ? (
                <Radio className="w-9 h-9 text-error animate-pulse" />
              ) : (
                <Zap className="w-9 h-9 text-primary" />
              )}
            </div>

            <div>
              <h2 className="text-xl font-black tracking-tight text-base-content uppercase font-sans">
                {daemonState.isRunning ? 'SHIFT IN PROGRESS' : 'READY TO START DUTY?'}
              </h2>
              <p className="text-xs text-base-content-muted mt-1 font-sans font-medium">
                {daemonState.isRunning
                  ? `Transmitting location for ${user.busNumber || 'Bus'}`
                  : 'Tap below to initiate Android foreground location daemon'}
              </p>
            </div>

            {/* 72x72px Minimum Touch Target Duty Button */}
            <button
              onClick={handleToggleTracking}
              style={{ minHeight: '72px' }}
              className={`w-full py-4 px-6 rounded-2xl font-bold text-base tracking-wide flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-xl ${
                daemonState.isRunning
                  ? 'bg-error hover:bg-error/90 text-error-content border-error-border'
                  : 'bg-primary hover:bg-primary-hover text-primary-content border-primary-border'
              }`}
            >
              {daemonState.isRunning ? (
                <>
                  <Square className="w-6 h-6 fill-current" />
                  END TRANSIT DUTY (OFFLINE)
                </>
              ) : (
                <>
                  <Play className="w-6 h-6 fill-current" />
                  START TRANSIT DUTY (ONLINE)
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2-Second Press-and-Hold SOS Breakdown Operational Button (Sprint 9 Task 2) */}
        {daemonState.isRunning && (
          <SosHoldButton onTriggerComplete={() => setIsSosModalOpen(true)} />
        )}

        {/* GPS Source / Simulator Toggle */}
        <div className="kiosk-card p-3.5 flex items-center justify-between font-sans">
          <div className="flex items-center gap-2.5">
            <Navigation className="w-4 h-4 text-primary" />
            <div>
              <p className="text-xs font-bold text-base-content uppercase font-sans">GPS Provider</p>
              <p className="text-[11px] text-base-content-muted font-sans">
                {daemonState.locationProvider === 'HARDWARE_GPS'
                  ? 'Native Device Hardware GPS'
                  : daemonState.locationProvider === 'INSECURE_ORIGIN_SIMULATED'
                  ? 'Wi-Fi HTTP Simulator'
                  : 'Simulated Route Track'}
              </p>
            </div>
          </div>
          <button
            onClick={() => toggleSimulatedMode(!simulatedMode)}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              simulatedMode
                ? 'bg-warning-bg text-warning border-warning-border'
                : 'bg-base-300 text-base-content border-base-border hover:bg-neutral'
            }`}
          >
            {simulatedMode ? 'Simulator Active' : 'Force Simulator'}
          </button>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 font-sans">
          {/* Card 1: Speedometer */}
          <div className="kiosk-card p-4 flex flex-col justify-between space-y-2 font-sans">
            <div className="flex items-center justify-between text-base-content-muted">
              <span className="text-xs font-bold tracking-wider uppercase font-sans">Speedometer</span>
              <Gauge className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black tracking-tight text-white tabular-nums">
                  {daemonState.currentSpeed}
                </span>
                <span className="text-xs font-bold text-primary font-sans">km/h</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Heading: <span className="text-slate-200 font-semibold tabular-nums">{daemonState.currentHeading}° NE</span>
              </p>
            </div>
          </div>

          {/* Card 2: Telemetry Stream Stats */}
          <div className="kiosk-card p-4 flex flex-col justify-between space-y-2 font-sans">
            <div className="flex items-center justify-between text-base-content-muted">
              <span className="text-xs font-bold tracking-wider uppercase font-sans">Pings Transmitted</span>
              <Radio className="w-4 h-4 text-secondary" />
            </div>
            <div>
              <div className="text-3xl font-black tracking-tight text-white tabular-nums">
                {daemonState.totalPingsEmitted}
              </div>
              <p className="text-[11px] text-base-content-subtle mt-0.5 flex items-center gap-1 font-sans">
                <span>Buffer:</span>
                <span className={`font-bold tabular-nums ${daemonState.bufferedPingsCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {daemonState.bufferedPingsCount}/20
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Passenger Occupancy Counter (72x72px Touch Target Buttons) */}
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-sans">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-base-content font-sans">
                Passenger Load Count
              </span>
            </div>
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 tabular-nums">
              {Math.round((passengerCount / maxCapacity) * 100)}% Full
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 font-sans">
            {/* 72x72px Touch Button Decrement */}
            <button
              onClick={() => handlePassengerChange(-1)}
              style={{ width: '72px', height: '72px' }}
              className="rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-2xl flex items-center justify-center active:scale-90 border border-slate-700 shadow-md"
              aria-label="Decrease passenger count"
            >
              -
            </button>

            <div className="text-center">
              <span className="text-3xl font-black text-white tabular-nums">{passengerCount}</span>
              <span className="text-xs text-slate-400 font-medium block">/ {maxCapacity} Seats</span>
            </div>

            {/* 72x72px Touch Button Increment */}
            <button
              onClick={() => handlePassengerChange(1)}
              style={{ width: '72px', height: '72px' }}
              className="rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-2xl flex items-center justify-center active:scale-90 shadow-lg shadow-emerald-950/40"
              aria-label="Increase passenger count"
            >
              +
            </button>
          </div>
        </div>

        {/* Battery & Android Shield Module */}
        <div className="kiosk-card p-4 flex items-center justify-between font-sans">
          <div className="flex items-center gap-3 font-sans">
            <div className="p-2.5 rounded-lg bg-base-100 text-primary border border-base-border">
              <BatteryCharging className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-base-content flex items-center gap-1.5 uppercase font-sans">
                Android Battery Shield
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              </p>
              <p className="text-[11px] text-base-content-muted font-sans">{batteryStatus}</p>
            </div>
          </div>
          <button
            onClick={handleRequestExemption}
            className="px-3 py-1.5 rounded-lg bg-base-300 hover:bg-neutral border border-base-border text-xs font-bold text-base-content cursor-pointer transition-colors font-sans"
          >
            Re-check
          </button>
        </div>

        {/* Route Progress Timeline */}
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-400" />
              {activeCorridor.name}
            </span>
            <span className="text-base-content-muted font-sans">Next: Stop 2</span>
          </div>

          <div className="space-y-2.5 text-xs font-sans">
            <div className="flex items-center gap-3 text-base-content-subtle font-sans">
              <div className="w-2.5 h-2.5 rounded-sm bg-base-300"></div>
              <span className="line-through font-sans">Campus Main Gate</span>
              <span className="ml-auto text-[10px] text-base-content-subtle font-mono tabular-nums">08:00 AM</span>
            </div>

            <div className="flex items-center gap-3 font-bold text-primary font-sans">
              <div className="w-2.5 h-2.5 rounded-sm bg-primary animate-ping"></div>
              <span className="font-sans">Transit Stop #2 (En Route)</span>
              <span className="ml-auto text-[10px] bg-primary-bg px-1.5 py-0.5 rounded text-primary border border-primary-border font-sans">
                2 mins away
              </span>
            </div>

            <div className="flex items-center gap-3 text-base-content-subtle opacity-60 font-sans">
              <div className="w-2.5 h-2.5 rounded-sm border border-base-border"></div>
              <span className="font-sans">Central Hostels Terminal</span>
            </div>
          </div>
        </div>
      </main>

      {/* ----------------------------------------------------------------------- */}
      {/* 1-TAP SOS BREAKDOWN CONFIRMATION MODAL (Sprint 9 Task 3)               */}
      {/* ----------------------------------------------------------------------- */}
      {isSosModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border-2 border-rose-500/70 rounded-3xl p-5 sm:p-6 space-y-5 shadow-2xl shadow-rose-950/80">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-600 text-white">
                  <AlertOctagon className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white uppercase tracking-wider">
                    Confirm Emergency Breakdown
                  </h3>
                  <p className="text-[11px] text-rose-300">Fastify & BullMQ Immediate Relief Sweep</p>
                </div>
              </div>
              <button
                onClick={() => setIsSosModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1-Tap Passenger Band Selector (4 Buttons) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                Stranded Passenger Load (Auto-detected)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['BAND_A_UNDER_15', 'BAND_B_15_TO_30', 'BAND_C_30_TO_50', 'BAND_D_OVER_50'] as PassengerBand[]).map(
                  (band) => {
                    const info = PASSENGER_BAND_LABELS[band];
                    const isSelected = selectedBand === band;
                    return (
                      <button
                        key={band}
                        type="button"
                        onClick={() => setSelectedBand(band)}
                        style={{ minHeight: '56px' }}
                        className={`p-3 rounded-2xl text-left border transition-all active:scale-95 ${
                          isSelected
                            ? 'bg-rose-500/20 border-rose-500 text-white shadow-md shadow-rose-950/50'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <span className={`block font-black text-sm ${isSelected ? 'text-rose-300' : 'text-slate-200'}`}>
                          {info.label}
                        </span>
                        <span className="block text-[10px] text-slate-400 truncate mt-0.5">
                          {info.countDesc}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {/* Breakdown Reason Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                Primary Incident Cause
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {(
                  [
                    'MECHANICAL_BREAKDOWN',
                    'ACCIDENT',
                    'MEDICAL_EMERGENCY',
                    'ROAD_BLOCKED',
                    'OTHER',
                  ] as SosReason[]
                ).map((reason) => {
                  const info = SOS_REASON_LABELS[reason];
                  const isSelected = selectedReason === reason;
                  return (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setSelectedReason(reason)}
                      style={{ minHeight: '48px' }}
                      className={`px-3.5 py-2.5 rounded-xl text-left border flex items-center justify-between transition-all active:scale-98 ${
                        isSelected
                          ? 'bg-rose-600/30 border-rose-500 text-white'
                          : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <span className={`block font-bold text-xs ${isSelected ? 'text-rose-200' : 'text-slate-300'}`}>
                          {info.label}
                        </span>
                        <span className="block text-[10px] text-slate-500">{info.description}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-rose-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Field Notes (Optional)
              </label>
              <input
                type="text"
                value={sosNotes}
                onChange={(e) => setSosNotes(e.target.value)}
                placeholder="e.g. Near Anandapuram junction, radiator blown"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-rose-500"
              />
            </div>

            {/* Modal Actions (Primary Red Button Meets 72px touch target) */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleConfirmSosTrigger}
                disabled={isSubmittingSos}
                style={{ minHeight: '72px' }}
                className="w-full py-4 px-6 rounded-2xl font-black text-sm tracking-wider uppercase bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white flex items-center justify-center gap-2 shadow-xl shadow-rose-950/80 transition-all active:scale-95 disabled:opacity-50"
              >
                <ShieldAlert className="w-6 h-6 stroke-[2.5]" />
                {isSubmittingSos ? 'Broadcasting Emergency...' : 'EMIT EMERGENCY SOS BROADCAST'}
              </button>

              <button
                type="button"
                onClick={() => setIsSosModalOpen(false)}
                className="w-full py-3 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors"
              >
                CANCEL / FALSE ALARM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* ACTIVE CORRIDOR SELECTOR MODAL (Shift Binding)                         */}
      {/* ----------------------------------------------------------------------- */}
      {isCorridorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <RouteIcon className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-white">Select Active Bus Corridor</h3>
              </div>
              <button
                onClick={() => setIsCorridorModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {CAMPUS_CORRIDORS.map((corridor) => {
                const isSelected = selectedRouteId === corridor.id;
                return (
                  <button
                    key={corridor.id}
                    type="button"
                    onClick={() => {
                      setSelectedRouteId(corridor.id);
                      setIsCorridorModalOpen(false);
                    }}
                    style={{ minHeight: '56px' }}
                    className={`w-full p-3 rounded-2xl text-left border flex items-center justify-between transition-all active:scale-98 ${
                      isSelected
                        ? 'bg-emerald-500/20 border-emerald-500/60 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <span className={`block font-extrabold text-xs ${isSelected ? 'text-emerald-300' : 'text-white'}`}>
                        {corridor.routeNumber}
                      </span>
                      <span className="block text-[11px] text-slate-300 mt-0.5">{corridor.name}</span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
