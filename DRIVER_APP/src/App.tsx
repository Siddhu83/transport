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
    const res = await requestBatteryExemption();
    setBatteryStatus(res.message);
  };

  const handlePassengerChange = (delta: number) => {
    const nextCount = Math.max(0, Math.min(passengerCount + delta, session?.user.capacity || 55));
    setPassengerCount(nextCount);
    if (daemonState.isRunning) {
      trackingDaemon.updatePassengerCount(nextCount);
    }
  };

  const handleToggleTracking = async () => {
    if (daemonState.isRunning) {
      await trackingDaemon.stopTracking();
    } else {
      await requestBatteryExemption();
      const busId = assignedBusId || session?.user.assignedBusId || '11111111-1111-4111-8111-111111111111';
      const routeId = assignedRouteId || session?.user.assignedRouteId || 'a1111111-1111-4111-8111-111111111111';

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

  const getStatusBadge = () => {
    if (activeSosIncident) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-error-bg text-error border border-error-border animate-pulse">
          <ShieldAlert className="w-3.5 h-3.5 text-error" />
          EMERGENCY SOS BREAKDOWN ACTIVE
        </span>
      );
    }
    if (!daemonState.isRunning) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-error-bg text-error border border-error-border">
          <span className="w-2 h-2 rounded-full bg-error"></span>
          OFF DUTY
        </span>
      );
    }
    if (!daemonState.isOnline) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-warning-bg text-warning border border-warning-border animate-pulse">
          <WifiOff className="w-3.5 h-3.5" />
          CELLULAR DISCONNECT ({daemonState.bufferedPingsCount} BUFFERED)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-success-bg text-success border border-success-border glow-primary">
        <span className="w-2 h-2 rounded-full bg-success animate-ping"></span>
        ON DUTY (LIVE TELEMETRY)
      </span>
    );
  };

  // ---------------------------------------------------------------------------
  // LOGIN SCREEN (If Not Authenticated)
  // ---------------------------------------------------------------------------
  if (!session) {
    return (
      <div className="min-h-screen bg-base-100 text-base-content font-sans flex items-center justify-center p-4 selection:bg-primary-bg selection:text-primary">
        <div className="w-full max-w-md space-y-6">
          {/* App Branding Header */}
          <div className="text-center space-y-3">
            <div className="inline-flex p-4 rounded-3xl bg-gradient-to-tr from-primary to-accent p-0.5 shadow-2xl shadow-primary/30">
              <div className="bg-base-100 p-4 rounded-[22px]">
                <Bus className="w-10 h-10 text-primary" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-base-content">ANITS CAPTAIN CONSOLE</h1>
              <p className="text-xs text-base-content-muted mt-1">Driver Kiosk Telemetry & Dispatch Portal</p>
            </div>
          </div>

          {/* Login Glass Card */}
          <div className="glass-card rounded-3xl p-6 space-y-5 border border-base-border">
            <div className="flex items-center gap-2 border-b border-base-border pb-3">
              <Lock className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-base-content uppercase tracking-wider">Captain Authentication</h2>
            </div>

            {loginError && (
              <div className="bg-error-bg border border-error-border rounded-2xl p-3 text-xs text-error flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-error shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-base-content-muted mb-1.5">Driver Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-base-content-subtle absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="driver1@transport.college.edu"
                    className="w-full bg-base-100 border border-base-border rounded-xl pl-10 pr-4 py-3 text-xs text-base-content placeholder-base-content-subtle focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-base-content-muted mb-1.5">Captain Password</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-base-content-subtle absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-base-100 border border-base-border rounded-xl pl-10 pr-4 py-3 text-xs text-base-content placeholder-base-content-subtle focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-4 px-4 rounded-2xl font-bold text-xs tracking-wider uppercase bg-primary hover:bg-primary-hover text-primary-content shadow-lg shadow-primary/30 transition-all transform active:scale-98 min-h-[56px] cursor-pointer"
              >
                {isLoggingIn ? 'Authenticating...' : 'Sign In To Captain Console'}
              </button>
            </form>

            {/* Local Testing Quick Credentials Pill Box */}
            <div className="pt-2 border-t border-base-border space-y-2.5">
              <p className="text-[11px] font-semibold text-base-content-muted flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                Local Test Credentials (1-Tap Fill):
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => handleQuickLogin('driver1@transport.college.edu')}
                  className="glass-button p-2.5 rounded-xl text-left hover:border-primary-border transition-colors cursor-pointer"
                >
                  <span className="font-bold text-primary block">Driver #1</span>
                  <span className="text-base-content-muted text-[10px] truncate block">driver1@transport...</span>
                  <span className="text-base-content-subtle text-[9px] font-mono">Pass: Password123!</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickLogin('driver2@transport.college.edu')}
                  className="glass-button p-2.5 rounded-xl text-left hover:border-secondary-border transition-colors cursor-pointer"
                >
                  <span className="font-bold text-secondary block">Driver #2</span>
                  <span className="text-base-content-muted text-[10px] truncate block">driver2@transport...</span>
                  <span className="text-base-content-subtle text-[9px] font-mono">Pass: Password123!</span>
                </button>
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-base-content-subtle">
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
    <div className="min-h-screen bg-base-100 text-base-content font-sans pb-12 selection:bg-primary-bg selection:text-primary">
      {/* Stranded Passenger & Failure Reason Emergency Modal */}
      <SosBreakdownModal
        isOpen={isSosModalOpen}
        onClose={() => setIsSosModalOpen(false)}
        onConfirmSos={handleConfirmSos}
        currentPassengerCount={passengerCount}
      />

      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 glass-card px-4 py-3.5 flex items-center justify-between border-b border-base-border">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-primary to-accent p-0.5 shadow-lg shadow-primary/20">
              <div className="w-full h-full bg-base-100 rounded-[14px] flex items-center justify-center">
                <Bus className="w-6 h-6 text-primary" />
              </div>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-success border-2 border-base-100 rounded-full"></span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base tracking-tight text-base-content">{user.name}</h1>
              <span className="bg-primary-bg text-primary text-[10px] font-bold px-1.5 py-0.5 rounded border border-primary-border flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-primary" />
                VERIFIED
              </span>
            </div>
            <p className="text-xs text-base-content-muted flex items-center gap-1 mt-0.5">
              <span>{user.licensePlate || user.busNumber}</span>
              <span>•</span>
              <span className="text-primary font-medium">{currentRouteName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            className="glass-button p-2.5 rounded-xl text-base-content-muted hover:text-base-content flex items-center gap-1.5 text-xs font-medium active:scale-95 cursor-pointer"
            title="Toggle Fullscreen Mode"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
          </button>

          <button
            onClick={handleLogout}
            className="glass-button p-2.5 rounded-xl text-error hover:text-error hover:bg-error-bg border border-error-border flex items-center gap-1.5 text-xs font-medium active:scale-95 cursor-pointer"
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
          <span className="text-xs text-base-content-muted flex items-center gap-1 font-mono">
            <Wifi className="w-3.5 h-3.5 text-primary" />
            Ping: 5s
          </span>
        </div>

        {/* Active Emergency SOS Incident Alert Control Banner */}
        {activeSosIncident && (
          <div className="glass-card-error rounded-3xl p-5 border border-error-border space-y-3 shadow-2xl shadow-error/30 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-6 h-6 text-error animate-pulse" />
                <div>
                  <h3 className="text-sm font-extrabold text-base-content uppercase font-mono">
                    SOS Incident Active
                  </h3>
                  <p className="text-[11px] text-error font-mono">
                    Reported at {activeSosIncident.timestamp}
                  </p>
                </div>
              </div>
              <button
                onClick={handleResolveSos}
                className="px-3 py-1.5 rounded-xl bg-base-300 border border-base-border text-xs text-success font-bold hover:bg-neutral flex items-center gap-1 cursor-pointer font-mono"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Resolve
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-base-100/90 p-2.5 rounded-xl border border-base-border">
                <span className="text-[10px] text-base-content-subtle block">REASON</span>
                <span className="font-bold text-warning">{activeSosIncident.failureReason}</span>
              </div>
              <div className="bg-base-100/90 p-2.5 rounded-xl border border-base-border">
                <span className="text-[10px] text-base-content-subtle block">STRANDED BAND</span>
                <span className="font-bold text-error">{activeSosIncident.passengerBand}</span>
              </div>
            </div>
          </div>
        )}

        {/* Pre-Shift Bus & Route Binding Selector (Only available when off duty) */}
        {!daemonState.isRunning && (
          <div className="glass-card rounded-3xl p-4 space-y-3 border border-base-border font-mono text-xs">
            <div className="flex items-center justify-between border-b border-base-border pb-2">
              <span className="font-bold text-base-content flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-primary" />
                Pre-Shift Route & Vehicle Assignment:
              </span>
              <span className="text-[10px] text-primary bg-primary-bg px-2 py-0.5 rounded border border-primary-border">
                Shift Ready
              </span>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] text-base-content-muted font-semibold">Assigned Route Corridor:</label>
              <select
                value={assignedRouteId}
                onChange={(e) => setAssignedRouteId(e.target.value)}
                className="w-full bg-base-100 border border-base-border rounded-xl px-3 py-2.5 text-xs text-base-content focus:outline-none focus:border-primary cursor-pointer"
              >
                {MOCK_AVAILABLE_ROUTES.map((route) => (
                  <option key={route.id} value={route.id} className="bg-base-100 text-base-content">
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
            daemonState.isRunning ? 'glass-card-error glow-error' : 'glass-card-primary glow-primary'
          }`}
        >
          <div className="text-center space-y-4">
            <div className="inline-flex p-3 rounded-2xl bg-base-300/80 border border-base-border">
              {daemonState.isRunning ? (
                <Radio className="w-10 h-10 text-error animate-pulse" />
              ) : (
                <Zap className="w-10 h-10 text-primary animate-pulse-slow" />
              )}
            </div>

            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-base-content">
                {daemonState.isRunning ? 'SHIFT IN PROGRESS' : 'READY TO START DUTY?'}
              </h2>
              <p className="text-xs text-base-content-muted mt-1">
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
                  ? 'bg-error hover:bg-error/90 text-error-content shadow-error/40'
                  : 'bg-primary hover:bg-primary-hover text-primary-content shadow-primary/30'
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
            <Navigation className="w-4 h-4 text-primary" />
            <div>
              <p className="text-xs font-semibold text-base-content">GPS Mode Override</p>
              <p className="text-[11px] text-base-content-muted">
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
                ? 'bg-warning-bg text-warning border border-warning-border'
                : 'bg-base-300 text-base-content hover:bg-neutral'
            }`}
          >
            {simulatedMode ? 'Simulator Active' : 'Force Simulator'}
          </button>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 font-mono">
          {/* Card 1: Speedometer */}
          <div className="glass-card rounded-2xl p-4 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between text-base-content-muted">
              <span className="text-xs font-semibold tracking-wider uppercase">Speedometer</span>
              <Gauge className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black tracking-tight text-base-content tabular-nums">
                  {daemonState.currentSpeed}
                </span>
                <span className="text-xs font-bold text-primary">km/h</span>
              </div>
              <p className="text-[11px] text-base-content-subtle mt-0.5">
                Heading: <span className="text-base-content font-semibold tabular-nums">{daemonState.currentHeading}°</span>
              </p>
            </div>
          </div>

          {/* Card 2: Telemetry Stream Stats */}
          <div className="glass-card rounded-2xl p-4 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between text-base-content-muted">
              <span className="text-xs font-semibold tracking-wider uppercase">Pings Sent</span>
              <Radio className="w-4 h-4 text-secondary" />
            </div>
            <div>
              <div className="text-3xl font-black tracking-tight text-base-content tabular-nums">
                {daemonState.totalPingsEmitted}
              </div>
              <p className="text-[11px] text-base-content-subtle mt-0.5 flex items-center gap-1">
                <span>Buffer:</span>
                <span className={`font-bold tabular-nums ${daemonState.bufferedPingsCount > 0 ? 'text-warning' : 'text-base-content-muted'}`}>
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
              <Users className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-base-content">
                Passenger Load Count
              </span>
            </div>
            <span className="text-xs font-semibold text-primary bg-primary-bg px-2 py-0.5 rounded border border-primary-border tabular-nums">
              {Math.round((passengerCount / maxCapacity) * 100)}% Full
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            {/* 72x72px Touch Button Decrement */}
            <button
              onClick={() => handlePassengerChange(-1)}
              className="w-18 h-18 rounded-2xl bg-base-300 hover:bg-neutral text-base-content font-extrabold text-2xl flex items-center justify-center active:scale-90 border border-base-border cursor-pointer shadow-lg shrink-0"
            >
              -
            </button>

            <div className="text-center">
              <span className="text-3xl font-black text-base-content tabular-nums">{passengerCount}</span>
              <span className="text-xs text-base-content-subtle font-medium block"> / {maxCapacity} Seats</span>
            </div>

            {/* 72x72px Touch Button Increment */}
            <button
              onClick={() => handlePassengerChange(1)}
              className="w-18 h-18 rounded-2xl bg-primary hover:bg-primary-hover text-primary-content font-extrabold text-2xl flex items-center justify-center active:scale-90 shadow-xl shadow-primary/30 cursor-pointer shrink-0"
            >
              +
            </button>
          </div>
        </div>

        {/* Battery & Android Shield Module */}
        <div className="glass-card rounded-2xl p-4 flex items-center justify-between font-mono">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary-bg text-primary border border-primary-border">
              <BatteryCharging className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-base-content flex items-center gap-1.5">
                Android Battery Shield
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              </p>
              <p className="text-[11px] text-base-content-muted">{batteryStatus}</p>
            </div>
          </div>
          <button
            onClick={handleRequestExemption}
            className="glass-button px-3 py-1.5 rounded-xl text-xs font-medium text-primary hover:text-primary-hover cursor-pointer"
          >
            Re-check
          </button>
        </div>

        {/* Route Progress Timeline */}
        <div className="glass-card rounded-2xl p-4 space-y-3 font-mono">
          <div className="flex items-center justify-between text-xs border-b border-base-border pb-2">
            <span className="font-bold text-base-content flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-primary" />
              {currentRouteName} Timeline
            </span>
            <span className="text-base-content-muted">Next: Stop 2</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center gap-3 text-base-content-subtle">
              <div className="w-2.5 h-2.5 rounded-full bg-base-300"></div>
              <span className="line-through">Campus Main Gate</span>
              <span className="ml-auto text-[10px] text-base-content-subtle tabular-nums">08:00 AM</span>
            </div>

            <div className="flex items-center gap-3 font-semibold text-primary">
              <div className="w-2.5 h-2.5 rounded-full bg-primary animate-ping"></div>
              <span>Transit Stop #2 (En Route)</span>
              <span className="ml-auto text-[10px] bg-primary-bg px-1.5 py-0.5 rounded text-primary">
                2 mins away
              </span>
            </div>

            <div className="flex items-center gap-3 text-base-content-subtle opacity-60">
              <div className="w-2.5 h-2.5 rounded-full border border-base-border"></div>
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
