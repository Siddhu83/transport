- [x] the zoom, recenter buttons are placed behing header, Choose a wise location in viewport
- [x] large shadow above the navbar. Distracting, reduce it
- [x] Long back i implemented the system as, fetch location from user and show map accordingly when launched. Try to find if there is a code regarding it. and use it now. instead of constant tagarapuvalasa map while launch.
- [x] Routing can be implemented between pages, instead of current approach.
- [x] Remove the routes page, it is not at all necessary for a college student i guess. Routes is actually needed when the system is implemented for a RTC.
- need to plan the settings page, what could be added there for better experience.
- Which features can be realistically built and tested within the timeframe?
- Plan properly for a MVP, what are the features needed for it. Remove extra features. 
- Are there any dependencies between features? (e.g., Can't have "My Bus" without "Driver Tracking")
- What features are most important for each role? Prioritize those.

# Version 2
- shall plan the system for student, bus incharge, driver(already exist), admin(already exist) roles. How do they all interact with each other. How does the flow work. 

## Planned Sprint: Dynamic Driver Route Progress Timeline
- **Goal**: Transform the static 3-stop driver timeline into an automated, geofence-driven, dynamic transit progression system.
- **Key Modules**:
  1. **Route Stop Manifest & Offline Sync**:
     - Pull sequenced stops from `GET /api/v1/routes/:routeId/stops` with coordinates and stop radii.
     - Cache locally in IndexedDB/LocalStorage so timeline operates during cellular deadzones.
  2. **Automated Geofence Detection Engine**:
     - `APPROACHING` threshold: Vehicle within 500m of next stop or ETA < 3 minutes.
     - `DWELLING / ARRIVED` threshold: Vehicle inside 50m radius of stop center.
     - `DEPARTED` threshold: Vehicle moves > 75m away towards subsequent stop sequence.
  3. **Live Dynamic ETA Calculation**:
     - Calculate ETA based on real-time speed vector and remaining route distance, updating every 5-second telemetry tick.
  4. **Driver Interaction & Manual Override**:
     - 1-tap "Confirm Arrival" / "Skip Stop" button for edge cases (road diversions, GPS drift).
     - Visual indicator displaying next stop with high contrast, elapsed stops marked with clean checkmarks, and terminal arrival summary. 