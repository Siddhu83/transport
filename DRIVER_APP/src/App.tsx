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
} from 'lucide-react';
import { requestBatteryExemption } from './services/batteryOptimization';
import { trackingDaemon, TrackingDaemonState } from './services/trackingDaemon';
import { AuthService, AuthSession } from './services/auth';

export const App: React.FC = () => {
  // Session State
  const [session, setSession] = useState<AuthSession | null>(() => AuthService.getSession());

  // Login Form State
  const [loginEmail, setLoginEmail] = useState<string>('driver1@transport.college.edu');
  const [loginPassword, setLoginPassword] = useState<string>('Password123!');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Tracking Daemon State
  const [daemonState, setDaemonState] = useState<TrackingDaemonState>(trackingDaemon.getState());
  const [batteryStatus, setBatteryStatus] = useState<string>('Exemption Ready');
  const [passengerCount, setPassengerCount] = useState<number>(38);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [simulatedMode, setSimulatedMode] = useState<boolean>(false);

  // Poll daemon status every second to update UI
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      setDaemonState(trackingDaemon.getState());
    }, 1000);
    return () => clearInterval(interval);
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
    } else {
      const busId = session.user.assignedBusId || '11111111-1111-4111-8111-111111111111';
      const routeId = session.user.assignedRouteId || 'a1111111-1111-4111-8111-111111111111';

      await trackingDaemon.startTracking({
        busId,
        routeId,
        driverId: session.user.id,
        authToken: session.token,
        forceSimulatedGps: simulatedMode,
        passengerCount,
      });
    }
    setDaemonState(trackingDaemon.getState());
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
                className="w-full py-3.5 px-4 rounded-xl font-bold text-xs tracking-wider uppercase bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-lg shadow-emerald-950/50 transition-all transform active:scale-98 disabled:opacity-50"
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
                  className="glass-button p-2.5 rounded-xl text-left hover:border-emerald-500/50 transition-colors"
                >
                  <span className="font-bold text-emerald-400 block">Driver #1</span>
                  <span className="text-slate-400 text-[10px] truncate block">driver1@transport...</span>
                  <span className="text-slate-500 text-[9px] font-mono">Pass: Password123!</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickLogin('driver2@transport.college.edu')}
                  className="glass-button p-2.5 rounded-xl text-left hover:border-emerald-500/50 transition-colors"
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
  // AUTHENTICATED CAPTAIN CONSOLE (Dynamic State)
  // ---------------------------------------------------------------------------
  const user = session.user;
  const maxCapacity = user.capacity || 55;

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 font-sans pb-12 selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-50 glass-card px-4 py-3.5 flex items-center justify-between border-b border-slate-800/80">
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
              <span className="text-emerald-400 font-medium">{user.routeName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            className="glass-button p-2.5 rounded-xl text-slate-300 hover:text-white flex items-center gap-1.5 text-xs font-medium active:scale-95"
            title="Toggle Fullscreen Mode"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
          </button>

          <button
            onClick={handleLogout}
            className="glass-button p-2.5 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 flex items-center gap-1.5 text-xs font-medium active:scale-95"
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
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            Ping Rate: 5s
          </span>
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
            </div>

            <div className="bg-slate-950/80 rounded-xl p-2.5 text-[11px] space-y-1 border border-slate-800 font-mono">
              <p className="font-bold text-emerald-400 flex items-center gap-1">
                <span>🔒 For 100% Real Phone GPS:</span>
              </p>
              <p className="text-slate-300">
                Open <code className="text-emerald-300 underline font-semibold">https://{window.location.hostname}:3001</code> on your phone (accept SSL certificate prompt).
              </p>
            </div>

            <p className="text-[10px] text-emerald-400 font-medium pt-0.5">
              ⚡ Currently running Route GPS Simulator so pings stream to server seamlessly over HTTP!
            </p>
          </div>
        )}

        {/* Hero Duty Switch */}
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

            <button
              onClick={handleToggleTracking}
              className={`w-full py-4 px-6 rounded-2xl font-bold text-base tracking-wide flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-xl ${
                daemonState.isRunning
                  ? 'bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 text-white shadow-rose-900/40'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-emerald-950/50'
              }`}
            >
              {daemonState.isRunning ? (
                <>
                  <Square className="w-5 h-5 fill-current" />
                  END DUTY (GO OFFLINE)
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  START DUTY (GO ONLINE)
                </>
              )}
            </button>
          </div>
        </div>

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
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              simulatedMode
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {simulatedMode ? 'Simulator Active' : 'Force Simulator'}
          </button>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Card 1: Speedometer */}
          <div className="glass-card rounded-2xl p-4 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold tracking-wider uppercase">Speedometer</span>
              <Gauge className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black tracking-tight text-white">
                  {daemonState.currentSpeed}
                </span>
                <span className="text-xs font-bold text-emerald-400">km/h</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Heading: <span className="text-slate-200 font-semibold">{daemonState.currentHeading}° NE</span>
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
              <div className="text-3xl font-black tracking-tight text-white">
                {daemonState.totalPingsEmitted}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                <span>Buffer:</span>
                <span className={`font-bold ${daemonState.bufferedPingsCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {daemonState.bufferedPingsCount}/20
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Passenger Occupancy Counter */}
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Passenger Load Count
              </span>
            </div>
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {Math.round((passengerCount / maxCapacity) * 100)}% Full
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <button
              onClick={() => handlePassengerChange(-1)}
              className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xl flex items-center justify-center active:scale-90 border border-slate-700"
            >
              -
            </button>

            <div className="text-center">
              <span className="text-2xl font-black text-white">{passengerCount}</span>
              <span className="text-xs text-slate-400 font-medium"> / {maxCapacity} Seats</span>
            </div>

            <button
              onClick={() => handlePassengerChange(1)}
              className="w-12 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xl flex items-center justify-center active:scale-90 shadow-lg shadow-emerald-950/40"
            >
              +
            </button>
          </div>
        </div>

        {/* Battery & Android Shield Module */}
        <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <BatteryCharging className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                Android Battery Doze Shield
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </p>
              <p className="text-[11px] text-slate-400">{batteryStatus}</p>
            </div>
          </div>
          <button
            onClick={handleRequestExemption}
            className="glass-button px-3 py-1.5 rounded-xl text-xs font-medium text-emerald-300 hover:text-emerald-200"
          >
            Re-check
          </button>
        </div>

        {/* Route Progress Timeline */}
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-400" />
              {user.routeName} Timeline
            </span>
            <span className="text-slate-400">Next: Stop 2</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center gap-3 text-slate-400">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-600"></div>
              <span className="line-through">Campus Main Gate</span>
              <span className="ml-auto text-[10px] text-slate-500">08:00 AM</span>
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
              <span className="ml-auto text-[10px]">08:25 AM</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
