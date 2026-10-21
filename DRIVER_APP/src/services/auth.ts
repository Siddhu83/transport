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
  routeNumber?: string;
  capacity?: number;
}

export interface AuthSession {
  token: string;
  user: DriverProfile;
}

const SESSION_KEY = 'ats_captain_session';

export class AuthService {
  public static getSession(): AuthSession | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw);
      // Evict any legacy fake demo tokens to prevent 401 Fastify JWT errors!
      if (!session || !session.token || session.token === 'demo-jwt-driver-token') {
        this.clearSession();
        return null;
      }
      return session;
    } catch {
      this.clearSession();
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
    // Clear any previous stale session
    this.clearSession();

    let res: Response;
    try {
      res = await fetch(ENDPOINTS.AUTH_LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch (err) {
      console.error('API Gateway connection error:', err);
      throw new Error('Unable to connect to backend server gateway. Please ensure backend server is running on port 8000.');
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Invalid email or password');
    }

    // Successfully authenticated with Fastify API Gateway
    const session: AuthSession = {
      token: data.token,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.role,
        assignedBusId: data.user.assignedBusId,
        assignedRouteId: data.user.assignedRouteId,
        busNumber: data.user.assignedBusId ? `BUS-${data.user.assignedBusId.slice(0, 4).toUpperCase()}` : 'BUS-101',
        licensePlate: 'KA-01-EQ-1001',
        routeName: 'Campus Route Corridor',
        capacity: 55,
      },
    };

    this.saveSession(session);
    return session;
  }
}
