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
        <span className="badge-utility badge-error-utility animate-pulse font-sans">
          <ShieldAlert className="w-3.5 h-3.5" />
          EMERGENCY SOS BREAKDOWN ACTIVE
        </span>
      );
    }
    if (!daemonState.isRunning) {
      return (
        <span className="badge-utility badge-error-utility font-sans">
          <span className="w-2 h-2 rounded-full bg-error"></span>
          OFF DUTY
        </span>
      );
    }
    if (!daemonState.isOnline) {
      return (
        <span className="badge-utility badge-warning-utility animate-pulse font-sans">
          <WifiOff className="w-3.5 h-3.5" />
          CELLULAR DISCONNECT ({daemonState.bufferedPingsCount} BUFFERED)
        </span>
      );
    }
    return (
      <span className="badge-utility badge-success-utility font-sans">
        <span className="w-2 h-2 rounded-full bg-success animate-ping"></span>
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
              <h1 className="text-2xl font-black tracking-tight text-base-content uppercase font-sans">
                COLLEGE TRANSPORT AUTHORITY
              </h1>
              <p className="text-xs text-base-content-muted mt-1 font-sans font-medium">
                Official Captain Telemetry & Dispatch Portal
              </p>
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
                className="w-full py-4 px-4 rounded-lg font-bold text-xs tracking-wider uppercase bg-primary hover:bg-primary-hover text-primary-content border border-primary-border transition-colors active:scale-98 min-h-[56px] cursor-pointer font-sans"
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
  const currentRouteName =
    MOCK_AVAILABLE_ROUTES.find((r) => r.id === assignedRouteId)?.name || user.routeName;

  return (
    <div className="min-h-screen bg-base-100 text-base-content font-sans pb-12">
      {/* Stranded Passenger & Failure Reason Emergency Modal */}
      <SosBreakdownModal
        isOpen={isSosModalOpen}
        onClose={() => setIsSosModalOpen(false)}
        onConfirmSos={handleConfirmSos}
        currentPassengerCount={passengerCount}
      />

      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-base-200 px-4 py-3 flex items-center justify-between border-b-2 border-base-border font-sans">
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
              <span className="text-base-content font-semibold">{currentRouteName}</span>
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

      {/* Main Content Area */}
      <main className="max-w-md mx-auto px-4 pt-4 space-y-4 font-sans">
        {/* Status Bar */}
        <div className="flex items-center justify-between px-1 font-sans">
          {getStatusBadge()}
          <span className="text-xs text-base-content-muted flex items-center gap-1 font-bold font-sans">
            <Wifi className="w-3.5 h-3.5 text-success" />
            PING: <span className="font-mono tabular-nums">5s</span>
          </span>
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

            <div className="space-y-2 font-sans">
              <label className="block text-[11px] text-base-content-muted font-bold uppercase font-sans">Assigned Route Corridor:</label>
              <select
                value={assignedRouteId}
                onChange={(e) => setAssignedRouteId(e.target.value)}
                className="w-full bg-base-100 border border-base-border rounded-lg px-3 py-2.5 text-xs text-base-content focus:outline-none focus:border-primary cursor-pointer font-bold font-sans"
              >
                {MOCK_AVAILABLE_ROUTES.map((route) => (
                  <option key={route.id} value={route.id} className="bg-base-100 text-base-content font-sans">
                    {route.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Hero Duty Switch (72px Minimum Touch Target Compliance) */}
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
              className={`w-full min-h-[72px] px-6 py-4 rounded-xl font-black text-base tracking-wider flex items-center justify-center gap-3 transition-colors active:scale-98 shadow-md cursor-pointer border font-sans ${
                daemonState.isRunning
                  ? 'bg-error hover:bg-error/90 text-error-content border-error-border'
                  : 'bg-primary hover:bg-primary-hover text-primary-content border-primary-border'
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
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border font-sans ${
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
                <span className="text-3xl font-black tracking-tight text-base-content font-mono tabular-nums">
                  {daemonState.currentSpeed}
                </span>
                <span className="text-xs font-bold text-primary font-sans">km/h</span>
              </div>
              <p className="text-[11px] text-base-content-subtle mt-0.5 font-sans">
                Heading: <span className="text-base-content font-bold font-mono tabular-nums">{daemonState.currentHeading}°</span>
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
              <div className="text-3xl font-black tracking-tight text-base-content font-mono tabular-nums">
                {daemonState.totalPingsEmitted}
              </div>
              <p className="text-[11px] text-base-content-subtle mt-0.5 flex items-center gap-1 font-sans">
                <span>Buffer:</span>
                <span className={`font-bold font-mono tabular-nums ${daemonState.bufferedPingsCount > 0 ? 'text-warning' : 'text-base-content-muted'}`}>
                  {daemonState.bufferedPingsCount}/20
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Passenger Occupancy Counter (72x72px Touch Targets) */}
        <div className="kiosk-card p-4 space-y-3 font-sans">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-sans">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-base-content font-sans">
                Passenger Load Count
              </span>
            </div>
            <span className="badge-utility badge-success-utility text-[11px] font-mono tabular-nums">
              {Math.round((passengerCount / maxCapacity) * 100)}% Full
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 font-sans">
            {/* 72x72px Touch Button Decrement */}
            <button
              onClick={() => handlePassengerChange(-1)}
              className="w-18 h-18 rounded-xl bg-base-300 hover:bg-neutral text-base-content font-black text-2xl flex items-center justify-center active:scale-95 border border-base-border cursor-pointer shadow-md shrink-0 font-sans"
            >
              -
            </button>

            <div className="text-center">
              <span className="text-3xl font-black text-base-content font-mono tabular-nums">{passengerCount}</span>
              <span className="text-xs text-base-content-subtle font-bold block font-sans"> / {maxCapacity} Seats</span>
            </div>

            {/* 72x72px Touch Button Increment */}
            <button
              onClick={() => handlePassengerChange(1)}
              className="w-18 h-18 rounded-xl bg-primary hover:bg-primary-hover text-primary-content font-black text-2xl flex items-center justify-center active:scale-95 border border-primary-border cursor-pointer shadow-md shrink-0 font-sans"
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
        <div className="kiosk-card p-4 space-y-3 font-sans">
          <div className="flex items-center justify-between text-xs border-b border-base-border pb-2 font-sans">
            <span className="font-bold text-base-content flex items-center gap-1.5 uppercase font-sans">
              <MapPin className="w-4 h-4 text-primary" />
              {currentRouteName} Schedule
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
