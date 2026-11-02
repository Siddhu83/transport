- [x] the zoom, recenter buttons are placed behing header, Choose a wise location in viewport
- [x] large shadow above the navbar. Distracting, reduce it
- [x] Long back i implemented the system as, fetch location from user and show map accordingly when launched. Try to find if there is a code regarding it. and use it now. instead of constant tagarapuvalasa map while launch.
- [x] Routing can be implemented between pages, instead of current approach.
- [x] Remove the routes page, it is not at all necessary for a college student i guess. Routes is actually needed when the system is implemented for a RTC.
- [x] need to plan the settings page, what could be added there for better experience.
- [x] Which features can be realistically built and tested within the timeframe?
- [x] Plan properly for a MVP, what are the features needed for it. Remove extra features. 
- [x] Are there any dependencies between features? (e.g., Can't have "My Bus" without "Driver Tracking")
- [x] What features are most important for each role? Prioritize those.

# Version 2
- [ ] Comprehensive Multi-Role Interaction Mapping: Map student, bus incharge, driver, and admin interaction lifecycles and permissions matrix.
- [ ] Student Proximity Wake-Up Notifications: Background Web Push notification (Web Push API / Service Worker) triggered when the student's assigned bus is 2 stops away or within 10 minutes ETA of their boarding stop. Eliminates panic phone calls to drivers while in traffic.
- [ ] Timetable Schedule Adherence Index: Compare real-time arrival timestamps against the college's published transport handbook timetable to display live punctuality status (+5m DELAYED / ON TIME / RUNNING EARLY).
