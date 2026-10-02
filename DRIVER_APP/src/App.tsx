import React, { useState, useEffect } from 'react';
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
  RotateCcw,
} from 'lucide-react';
import { requestBatteryExemption } from './services/batteryOptimization';
import { trackingDaemon, TrackingDaemonState } from './services/trackingDaemon';
import { AuthService, AuthSession } from './services/auth';
import { SosHoldButton } from './components/SosHoldButton';
import { SosBreakdownModal } from './components/SosBreakdownModal';

export const MOCK_AVAILABLE_ROUTES = [
  { id: 'a1111111-1111-4111-8111-111111111111', name: 'Srikakulam (Route #1)' },
  { id: 'b2222222-2222-4222-8222-222222222222', name: 'Srikakulam (Route #2)' },
  { id: 'c3333333-3333-4333-8333-333333333333', name: 'Viziangaram (Route #3)' },
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

  // SOS Emergency Breakdown Modal & Incident State
  const [isSosModalOpen, setIsSosModalOpen] = useState<boolean>(false);
  const [activeSosIncident, setActiveSosIncident] = useState<{
    passengerBand: string;
    failureReason: string;
    timestamp: string;
  } | null>(null);

  // Poll daemon status every second to update UI
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      setDaemonState(trackingDaemon.getState());
    }, 1000);
    return () => clearInterval(interval);
  }, [session]);

  // Sync session binding on login
  useEffect(() => {
    if (session?.user) {
      setAssignedBusId(session.user.assignedBusId || '11111111-1111-4111-8111-111111111111');
      setAssignedRouteId(session.user.assignedRouteId || 'a1111111-1111-4111-8111-111111111111');
    }
  }, [session]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      const authSession = await AuthService.login(loginEmail, loginPassword);
      setSession(authSession);
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
    AuthService.clearSession();
    setSession(null);
  };

  const handleRequestExemption = async () => {
    const status = await requestBatteryExemption();
    setBatteryStatus(status.message);
  };

  const handlePassengerChange = (delta: number) => {
    const maxCapacity = session?.user.capacity || 55;
    setPassengerCount((prev) => {
      const next = Math.max(0, Math.min(maxCapacity, prev + delta));
      trackingDaemon.updatePassengerCount(next);
      return next;
    });
  };

  const handleToggleTracking = async () => {
    if (!session) return;

    if (daemonState.isRunning) {
      await trackingDaemon.stopTracking();
      setActiveSosIncident(null);
    } else {
      await trackingDaemon.startTracking({
        busId: assignedBusId,
        routeId: assignedRouteId,
        driverId: session.user.id,
        authToken: session.token,
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

    // Emit SOS telemetry ping to telemetry pipeline
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

  const getStatusBadge = () => {
    if (activeSosIncident) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/50 animate-pulse">
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          EMERGENCY SOS BREAKDOWN ACTIVE
        </span>
      );
    }
    if (!daemonState.isRunning) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          OFF DUTY
        </span>
      );
    }
    if (!daemonState.isOnline) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
          <WifiOff className="w-3.5 h-3.5" />
          CELLULAR DISCONNECT ({daemonState.bufferedPingsCount} BUFFERED)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 glow-emerald">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
        ON DUTY (LIVE TELEMETRY)
      </span>
    );
  };

  // ---------------------------------------------------------------------------
  // LOGIN SCREEN (If Not Authenticated)
  // ---------------------------------------------------------------------------
  if (!session) {
    return (
      <div className="min-h-screen bg-[#0b0f17] text-slate-100 font-sans flex items-center justify-center p-4 selection:bg-emerald-500/30 selection:text-emerald-200">
        <div className="w-full max-w-md space-y-6">
          {/* App Branding Header */}
          <div className="text-center space-y-3">
            <div className="inline-flex p-4 rounded-3xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-2xl shadow-emerald-500/30">
              <div className="bg-slate-950 p-4 rounded-[22px]">
                <Bus className="w-10 h-10 text-emerald-400" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">ANITS CAPTAIN CONSOLE</h1>
              <p className="text-xs text-slate-400 mt-1">Driver Kiosk Telemetry & Dispatch Portal</p>
            </div>
          </div>

          {/* Login Glass Card */}
          <div className="glass-card rounded-3xl p-6 space-y-5 border border-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Lock className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Captain Authentication</h2>
            </div>

            {loginError && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3 text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Driver Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="driver1@transport.college.edu"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Captain Password</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-4 px-4 rounded-2xl font-bold text-xs tracking-wider uppercase bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-lg shadow-emerald-950/50 transition-all transform active:scale-98 min-h-[56px]"
              >
                {isLoggingIn ? 'Authenticating...' : 'Sign In To Captain Console'}
              </button>
            </form>

            {/* Local Testing Quick Credentials Pill Box */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
              <p className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Local Test Credentials (1-Tap Fill):
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => handleQuickLogin('driver1@transport.college.edu')}
                  className="glass-button p-2.5 rounded-xl text-left hover:border-emerald-500/50 transition-colors cursor-pointer"
                >
                  <span className="font-bold text-emerald-400 block">Driver #1</span>
                  <span className="text-slate-400 text-[10px] truncate block">driver1@transport...</span>
                  <span className="text-slate-500 text-[9px] font-mono">Pass: Password123!</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickLogin('driver2@transport.college.edu')}
                  className="glass-button p-2.5 rounded-xl text-left hover:border-emerald-500/50 transition-colors cursor-pointer"
                >
                  <span className="font-bold text-teal-400 block">Driver #2</span>
                  <span className="text-slate-400 text-[10px] truncate block">driver2@transport...</span>
                  <span className="text-slate-500 text-[9px] font-mono">Pass: Password123!</span>
                </button>
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-500">
            🔒 Captain accounts are provisioned by College Transport Authority.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // AUTHENTICATED CAPTAIN CONSOLE (72x72px Touch Target Kiosk)
  // ---------------------------------------------------------------------------
  const user = session.user;
  const maxCapacity = user.capacity || 55;
  const currentRouteName =
    MOCK_AVAILABLE_ROUTES.find((r) => r.id === assignedRouteId)?.name || user.routeName;

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 font-sans pb-12 selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Stranded Passenger & Failure Reason Emergency Modal */}
      <SosBreakdownModal
        isOpen={isSosModalOpen}
        onClose={() => setIsSosModalOpen(false)}
        onConfirmSos={handleConfirmSos}
        currentPassengerCount={passengerCount}
      />

      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 glass-card px-4 py-3.5 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Bus className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-950 rounded-full"></span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base tracking-tight text-white">{user.name}</h1>
              <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-emerald-400" />
                VERIFIED
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <span>{user.licensePlate || user.busNumber}</span>
              <span>•</span>
              <span className="text-emerald-400 font-medium">{currentRouteName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            className="glass-button p-2.5 rounded-xl text-slate-300 hover:text-white flex items-center gap-1.5 text-xs font-medium active:scale-95 cursor-pointer"
            title="Toggle Fullscreen Mode"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
          </button>

          <button
            onClick={handleLogout}
            className="glass-button p-2.5 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 flex items-center gap-1.5 text-xs font-medium active:scale-95 cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-md mx-auto px-4 pt-4 space-y-4">
        {/* Status Bar */}
        <div className="flex items-center justify-between px-1">
          {getStatusBadge()}
          <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            Ping: 5s
          </span>
        </div>

        {/* Active Emergency SOS Incident Alert Control Banner */}
        {activeSosIncident && (
          <div className="glass-card-rose rounded-3xl p-5 border border-rose-500/50 space-y-3 shadow-2xl shadow-rose-950/60 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-6 h-6 text-rose-400 animate-pulse" />
                <div>
                  <h3 className="text-sm font-extrabold text-white uppercase font-mono">
                    SOS Incident Active
                  </h3>
                  <p className="text-[11px] text-rose-200">
                    Reported at {activeSosIncident.timestamp}
                  </p>
                </div>
              </div>
              <button
                onClick={handleResolveSos}
                className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-emerald-400 font-bold hover:bg-slate-800 flex items-center gap-1 cursor-pointer font-mono"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Resolve
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">REASON</span>
                <span className="font-bold text-amber-400">{activeSosIncident.failureReason}</span>
              </div>
              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">STRANDED BAND</span>
                <span className="font-bold text-rose-300">{activeSosIncident.passengerBand}</span>
              </div>
            </div>
          </div>
        )}

        {/* Pre-Shift Bus & Route Binding Selector (Only available when off duty) */}
        {!daemonState.isRunning && (
          <div className="glass-card rounded-3xl p-4 space-y-3 border border-slate-800 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-400" />
                Pre-Shift Route & Vehicle Assignment:
              </span>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Shift Ready
              </span>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] text-slate-400 font-semibold">Assigned Route Corridor:</label>
              <select
                value={assignedRouteId}
                onChange={(e) => setAssignedRouteId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {MOCK_AVAILABLE_ROUTES.map((route) => (
                  <option key={route.id} value={route.id} className="bg-slate-950 text-white">
                    {route.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Hero Duty Switch (72px Minimum Touch Target Compliance) */}
        <div
          className={`rounded-3xl p-6 transition-all duration-300 border ${
            daemonState.isRunning ? 'glass-card-rose glow-rose' : 'glass-card-emerald glow-emerald'
          }`}
        >
          <div className="text-center space-y-4">
            <div className="inline-flex p-3 rounded-2xl bg-slate-900/60 border border-slate-700/50">
              {daemonState.isRunning ? (
                <Radio className="w-10 h-10 text-rose-400 animate-pulse" />
              ) : (
                <Zap className="w-10 h-10 text-emerald-400 animate-pulse-slow" />
              )}
            </div>

            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-white">
                {daemonState.isRunning ? 'SHIFT IN PROGRESS' : 'READY TO START DUTY?'}
              </h2>
              <p className="text-xs text-slate-300 mt-1">
                {daemonState.isRunning
                  ? `Transmitting telemetry for ${user.busNumber || 'Bus'}`
                  : 'Tap below to initiate Android foreground location daemon'}
              </p>
            </div>

            {/* 72x72px Minimum Touch Target Duty Button */}
            <button
              onClick={handleToggleTracking}
              className={`w-full min-h-[72px] px-6 py-4 rounded-2xl font-bold text-base tracking-wide flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-xl cursor-pointer ${
                daemonState.isRunning
                  ? 'bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 text-white shadow-rose-900/40'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-emerald-950/50'
              }`}
            >
              {daemonState.isRunning ? (
                <>
                  <Square className="w-6 h-6 fill-current" />
                  END DUTY (GO OFFLINE)
                </>
              ) : (
                <>
                  <Play className="w-6 h-6 fill-current" />
                  START DUTY (GO ONLINE)
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
        <div className="glass-card rounded-2xl p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Navigation className="w-4 h-4 text-emerald-400" />
            <div>
              <p className="text-xs font-semibold text-slate-200">GPS Mode Override</p>
              <p className="text-[11px] text-slate-400">
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
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              simulatedMode
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {simulatedMode ? 'Simulator Active' : 'Force Simulator'}
          </button>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 font-mono">
          {/* Card 1: Speedometer */}
          <div className="glass-card rounded-2xl p-4 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold tracking-wider uppercase">Speedometer</span>
              <Gauge className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black tracking-tight text-white tabular-nums">
                  {daemonState.currentSpeed}
                </span>
                <span className="text-xs font-bold text-emerald-400">km/h</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Heading: <span className="text-slate-200 font-semibold tabular-nums">{daemonState.currentHeading}°</span>
              </p>
            </div>
          </div>

          {/* Card 2: Telemetry Stream Stats */}
          <div className="glass-card rounded-2xl p-4 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold tracking-wider uppercase">Pings Sent</span>
              <Radio className="w-4 h-4 text-teal-400" />
            </div>
            <div>
              <div className="text-3xl font-black tracking-tight text-white tabular-nums">
                {daemonState.totalPingsEmitted}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                <span>Buffer:</span>
                <span className={`font-bold tabular-nums ${daemonState.bufferedPingsCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {daemonState.bufferedPingsCount}/20
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Passenger Occupancy Counter (72x72px Touch Targets) */}
        <div className="glass-card rounded-2xl p-4 space-y-3 font-mono">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Passenger Load Count
              </span>
            </div>
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 tabular-nums">
              {Math.round((passengerCount / maxCapacity) * 100)}% Full
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            {/* 72x72px Touch Button Decrement */}
            <button
              onClick={() => handlePassengerChange(-1)}
              className="w-18 h-18 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-2xl flex items-center justify-center active:scale-90 border border-slate-700 cursor-pointer shadow-lg shrink-0"
            >
              -
            </button>

            <div className="text-center">
              <span className="text-3xl font-black text-white tabular-nums">{passengerCount}</span>
              <span className="text-xs text-slate-400 font-medium block"> / {maxCapacity} Seats</span>
            </div>

            {/* 72x72px Touch Button Increment */}
            <button
              onClick={() => handlePassengerChange(1)}
              className="w-18 h-18 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold text-2xl flex items-center justify-center active:scale-90 shadow-xl shadow-emerald-950/60 cursor-pointer shrink-0"
            >
              +
            </button>
          </div>
        </div>

        {/* Battery & Android Shield Module */}
        <div className="glass-card rounded-2xl p-4 flex items-center justify-between font-mono">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <BatteryCharging className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                Android Battery Shield
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </p>
              <p className="text-[11px] text-slate-400">{batteryStatus}</p>
            </div>
          </div>
          <button
            onClick={handleRequestExemption}
            className="glass-button px-3 py-1.5 rounded-xl text-xs font-medium text-emerald-300 hover:text-emerald-200 cursor-pointer"
          >
            Re-check
          </button>
        </div>

        {/* Route Progress Timeline */}
        <div className="glass-card rounded-2xl p-4 space-y-3 font-mono">
          <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-400" />
              {currentRouteName} Timeline
            </span>
            <span className="text-slate-400">Next: Stop 2</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center gap-3 text-slate-400">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-600"></div>
              <span className="line-through">Campus Main Gate</span>
              <span className="ml-auto text-[10px] text-slate-500 tabular-nums">08:00 AM</span>
            </div>

            <div className="flex items-center gap-3 font-semibold text-emerald-300">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></div>
              <span>Transit Stop #2 (En Route)</span>
              <span className="ml-auto text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded text-emerald-300">
                2 mins away
              </span>
            </div>

            <div className="flex items-center gap-3 text-slate-400 opacity-60">
              <div className="w-2.5 h-2.5 rounded-full border border-slate-500"></div>
              <span>Central Hostels Terminal</span>
            </div>
          </div>
        </div>
      </main>

      {/* 1-Tap Emergency SOS Breakdown Modal */}
      <SosBreakdownModal
        isOpen={isSosModalOpen}
        onClose={() => setIsSosModalOpen(false)}
        onConfirmSos={handleConfirmSos}
        currentPassengerCount={passengerCount}
      />
    </div>
  );
};

export default App;
