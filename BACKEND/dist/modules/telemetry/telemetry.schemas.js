import { z } from 'zod';
export const TelemetryPingSchema = z.object({
    busId: z.string().uuid(),
    routeId: z.string().uuid(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    speed: z.number().min(0).max(140), // Speed in km/h
    heading: z.number().min(0).max(359), // Degrees relative to true north (0-359)
    accuracy: z.number().min(0).max(100), // GPS accuracy radius in meters
    timestamp: z.number().int().positive(), // Epoch milliseconds
});
export var IngestionStatus;
(function (IngestionStatus) {
    IngestionStatus["SUCCESS"] = "SUCCESS";
    IngestionStatus["LOW_ACCURACY_DROPPED"] = "LOW_ACCURACY_DROPPED";
    IngestionStatus["SPEED_SPIKE_DROPPED"] = "SPEED_SPIKE_DROPPED";
    IngestionStatus["CLOCK_DRIFT_REJECTED"] = "CLOCK_DRIFT_REJECTED";
})(IngestionStatus || (IngestionStatus = {}));
