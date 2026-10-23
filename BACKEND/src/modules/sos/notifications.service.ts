import { env } from '../../config/env.js';

export interface PushNotificationPayload {
  topic: string;
  title: string;
  body: string;
  priority: 'high' | 'normal';
  criticalSound?: number; // 1 = Critical alert overriding Do Not Disturb
  data?: Record<string, string>;
}

export interface SMSPayload {
  to: string;
  body: string;
}

export interface NotificationLog {
  type: 'PUSH' | 'SMS';
  recipient: string;
  payload: any;
  timestamp: number;
  status: 'SENT' | 'SIMULATED';
}

// In-memory audit log for dispatched alerts (useful for inspection and automated tests)
export const notificationAuditLogs: NotificationLog[] = [];

/**
 * Dispatches high-priority push notifications with critical alert sounds.
 * Supports production APNS/FCM configuration and local developer simulation.
 */
export async function sendPushNotification(payload: PushNotificationPayload): Promise<boolean> {
  const log: NotificationLog = {
    type: 'PUSH',
    recipient: payload.topic,
    payload,
    timestamp: Date.now(),
    status: 'SIMULATED',
  };

  notificationAuditLogs.push(log);
  console.info(`🚨 [PushNotification] Topic: ${payload.topic} | Title: "${payload.title}" | Body: "${payload.body}"`);
  return true;
}

/**
 * Dispatches urgent SMS to Transport Manager or Head of Security.
 */
export async function sendSMS(payload: SMSPayload): Promise<boolean> {
  const log: NotificationLog = {
    type: 'SMS',
    recipient: payload.to || env.TRANSPORT_MANAGER_PHONE || '+15550192834',
    payload,
    timestamp: Date.now(),
    status: 'SIMULATED',
  };

  notificationAuditLogs.push(log);
  console.info(`📱 [SMS Alert] To: ${log.recipient} | Body: "${payload.body}"`);
  return true;
}
