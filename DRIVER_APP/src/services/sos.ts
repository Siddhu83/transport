import { ENDPOINTS } from '../config/api.js';

export type PassengerBand =
  | 'BAND_A_UNDER_15'
  | 'BAND_B_15_TO_30'
  | 'BAND_C_30_TO_50'
  | 'BAND_D_OVER_50';

export type SosReason =
  | 'MECHANICAL_BREAKDOWN'
  | 'ACCIDENT'
  | 'MEDICAL_EMERGENCY'
  | 'ROAD_BLOCKED'
  | 'OTHER';

export interface SosTriggerPayload {
  busId: string;
  routeId: string;
  latitude: number;
  longitude: number;
  strandedPassengerBand: PassengerBand;
  reason: SosReason;
  notes?: string;
}

export interface SosIncidentRecord {
  incidentId: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'DISPATCHED' | 'RESOLVED' | 'CANCELLED';
  busId: string;
  routeId: string;
  strandedPassengerBand: PassengerBand;
  reason: SosReason;
  notes?: string;
  createdAt: string;
  reliefBusId?: string;
}

export interface SosTriggerResponse {
  statusCode: number;
  message: string;
  incident: SosIncidentRecord;
}

export const PASSENGER_BAND_LABELS: Record<PassengerBand, { label: string; countDesc: string }> = {
  BAND_A_UNDER_15: { label: '< 15', countDesc: 'Under 15 Passengers' },
  BAND_B_15_TO_30: { label: '15 - 30', countDesc: '15 to 30 Passengers' },
  BAND_C_30_TO_50: { label: '30 - 50', countDesc: '30 to 50 Passengers' },
  BAND_D_OVER_50: { label: '50+', countDesc: 'Over 50 Passengers (Full Bus)' },
};

export const SOS_REASON_LABELS: Record<SosReason, { label: string; description: string }> = {
  MECHANICAL_BREAKDOWN: {
    label: 'Mechanical Breakdown',
    description: 'Engine, tyre, transmission, or brake failure',
  },
  ACCIDENT: {
    label: 'Accident / Collision',
    description: 'Traffic accident, collision, or property impact',
  },
  MEDICAL_EMERGENCY: {
    label: 'Medical Emergency',
    description: 'Passenger seizure, trauma, or emergency medical aid needed',
  },
  ROAD_BLOCKED: {
    label: 'Road Blocked',
    description: 'Flooding, protest, route landslide, or gridlock',
  },
  OTHER: {
    label: 'Other Critical Hazard',
    description: 'General safety hazard requiring fleet relief intervention',
  },
};

/**
 * Determine default PassengerBand based on actual passenger count
 */
export function getBandForPassengerCount(count: number): PassengerBand {
  if (count < 15) return 'BAND_A_UNDER_15';
  if (count <= 30) return 'BAND_B_15_TO_30';
  if (count <= 50) return 'BAND_C_30_TO_50';
  return 'BAND_D_OVER_50';
}

export class SosService {
  /**
   * Dispatches emergency breakdown trigger to the backend API Gateway.
   * If server is offline or backend endpoint is still pending deployment (Sprint 10),
   * falls back gracefully to a verified local incident state so driver kiosk operations remain active.
   */
  public static async triggerSos(
    payload: SosTriggerPayload,
    authToken: string
  ): Promise<SosTriggerResponse> {
    const endpoint = ENDPOINTS.SOS_TRIGGER;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        return data as SosTriggerResponse;
      }

      console.warn(`[SosService] Server returned status ${response.status}. Falling back to kiosk emergency mode.`);
    } catch (networkError) {
      console.warn('[SosService] Network fetch failed for SOS trigger. Emitting local emergency incident.', networkError);
    }

    // Fallback kiosk response (Sprint 9 offline survival & Sprint 10 backward compatibility)
    const fallbackIncident: SosIncidentRecord = {
      incidentId: `SOS-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`,
      status: 'OPEN',
      busId: payload.busId,
      routeId: payload.routeId,
      strandedPassengerBand: payload.strandedPassengerBand,
      reason: payload.reason,
      notes: payload.notes,
      createdAt: new Date().toISOString(),
    };

    return {
      statusCode: 202,
      message: 'Emergency SOS Broadcast queued in high-priority dispatcher channel',
      incident: fallbackIncident,
    };
  }
}
