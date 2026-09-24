/**
 * Driver Captain Authentication Service
 * Manages JWT tokens, driver profile sessions, and local testing credentials.
 */

import { ENDPOINTS } from '../config/api.js';

export interface DriverProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  assignedBusId: string | null;
  assignedRouteId: string | null;
  busNumber?: string;
  licensePlate?: string;
  routeName?: string;
  capacity?: number;
}

export interface AuthSession {
  token: string;
  user: DriverProfile;
}

const SESSION_KEY = 'ats_captain_session';

// Demo fallback profile for immediate local testing if server database is not seeded
export const DEMO_CAPTAIN: DriverProfile = {
  id: 'driver-id-1',
  email: 'driver1@transport.college.edu',
  name: 'Captain Ramesh Kumar',
  role: 'DRIVER',
  assignedBusId: '11111111-1111-4111-8111-111111111111',
  assignedRouteId: 'a1111111-1111-4111-8111-111111111111',
  busNumber: 'BUS-101',
  licensePlate: 'KA-01-EQ-1001',
  routeName: 'Sector 1 Express Corridor',
  capacity: 55,
};

export class AuthService {
  public static getSession(): AuthSession | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public static saveSession(session: AuthSession): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  public static clearSession(): void {
    localStorage.removeItem(SESSION_KEY);
  }

  public static async login(email: string, password: string): Promise<AuthSession> {
    try {
      const res = await fetch(ENDPOINTS.AUTH_LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        const data = await res.json();
        const session: AuthSession = {
          token: data.token,
          user: {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            assignedBusId: data.user.assignedBusId || '11111111-1111-4111-8111-111111111111',
            assignedRouteId: data.user.assignedRouteId || 'a1111111-1111-4111-8111-111111111111',
            busNumber: `BUS-${data.user.assignedBusId ? data.user.assignedBusId.slice(0, 4) : '101'}`,
            licensePlate: 'KA-01-EQ-1001',
            routeName: 'Campus Route Corridor',
            capacity: 55,
          },
        };
        this.saveSession(session);
        return session;
      }
    } catch (err) {
      console.warn('Network login failed. Falling back to demo session:', err);
    }

    // Fallback: If credentials match default demo login, generate local demo session
    if (email === 'driver1@transport.college.edu' && password === 'Password123!') {
      const demoSession: AuthSession = {
        token: 'demo-jwt-driver-token',
        user: DEMO_CAPTAIN,
      };
      this.saveSession(demoSession);
      return demoSession;
    }

    throw new Error('Invalid email or password. Use test account: driver1@transport.college.edu / Password123!');
  }
}
