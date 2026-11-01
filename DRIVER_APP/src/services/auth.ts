/**
 * Driver Captain Authentication Service
 * Manages JWT tokens, driver profile sessions, and ephemeral shift delegations.
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
  // Ephemeral Delegation Claims (Sprint 17)
  isDelegated?: boolean;
  parentDriverId?: string;
  parentDriverName?: string;
  delegateName?: string;
  expiresAt?: number;
  jti?: string;
}

export interface AuthSession {
  token: string;
  user: DriverProfile;
}

export interface CreateDelegationInput {
  delegateName?: string;
  delegatePhone?: string;
  durationHours?: number;
  note?: string;
}

export interface DelegationTicketResponse {
  ticketId: string;
  claimUrl: string;
  qrData: string;
  expiresAt: number;
}

export interface DelegationActiveStatus {
  pendingTicket: Record<string, string> | null;
  activeSession: Record<string, string> | null;
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

  /**
   * Primary Driver generates an ephemeral 15-minute delegation QR ticket
   */
  public static async createDelegation(
    token: string,
    input: CreateDelegationInput
  ): Promise<DelegationTicketResponse> {
    const res = await fetch(ENDPOINTS.DELEGATION_CREATE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to generate delegation ticket');
    }

    return data.ticket;
  }

  /**
   * Substitute claims duty via single-use ticket and receives a 4-hour DELEGATED_DRIVER session
   */
  public static async claimDelegation(ticketId: string): Promise<AuthSession> {
    const res = await fetch(ENDPOINTS.DELEGATION_CLAIM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Delegation ticket is invalid or already redeemed');
    }

    const session: AuthSession = {
      token: data.token,
      user: {
        id: `del_${data.session.parentDriverId}`,
        email: `delegate+${data.session.jti.slice(-6)}@transport.college.edu`,
        name: data.session.delegateName || 'Relief Driver',
        role: 'DELEGATED_DRIVER',
        assignedBusId: data.session.busId,
        assignedRouteId: data.session.routeId,
        busNumber: data.session.busId ? `BUS-${data.session.busId.slice(0, 4).toUpperCase()}` : 'BUS-101',
        licensePlate: 'AP-39-TZ-4001',
        routeName: 'Campus Route Corridor',
        capacity: 55,
        isDelegated: true,
        parentDriverId: data.session.parentDriverId,
        parentDriverName: data.session.parentDriverName,
        delegateName: data.session.delegateName,
        expiresAt: data.session.expiresAt,
        jti: data.session.jti,
      },
    };

    this.saveSession(session);
    return session;
  }

  /**
   * Revokes an active delegation session
   */
  public static async revokeDelegation(token: string, jti?: string): Promise<void> {
    const res = await fetch(ENDPOINTS.DELEGATION_REVOKE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jti }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to revoke delegation');
    }
  }

  /**
   * Fetches active delegation status for the primary driver
   */
  public static async getActiveDelegation(token: string): Promise<DelegationActiveStatus> {
    const res = await fetch(ENDPOINTS.DELEGATION_ACTIVE, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      return { pendingTicket: null, activeSession: null };
    }

    const data = await res.json();
    return {
      pendingTicket: data.pendingTicket,
      activeSession: data.activeSession,
    };
  }
}
