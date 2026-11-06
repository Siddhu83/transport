# Version 2 Roadmap & Architecture Backlog

## Core Role Interaction & Decentralized Enrollment (Architecture Planned)
- [x] **Comprehensive Multi-Role Interaction Mapping:** Formalized in [docs/08_v2_role_matrix_and_enrollment_plan.md](docs/08_v2_role_matrix_and_enrollment_plan.md) with strict driver driving-only isolation, in-charge passenger stewardship, and admin control tower.
- [ ] **Tier 3 In-Bus QR Onboarding (Channel C):** In-bus QR code for new students to scan, submit roll number/stop, and get verified directly by the Bus In-Charge during commute.
- [ ] **Tier 4 In-Charge Physical Fee Renewal:** In-Charge console interface to inspect student bank/cash receipts and toggle pass renewal status directly.
- [ ] **Year-End Graduating Batch Archival:** Automated semester/annual rollover job archiving passing-out classes and freeing seat quota.
- [ ] **Stop Capacity Balancing & Overload Heatmap:** Admin dashboard comparing registered student headcounts per stop against 50-seater bus capacities.

## Passenger Experience & Schedule Intelligence
- [ ] **Student Proximity Wake-Up Notifications:** Background Web Push notification (Web Push API / Service Worker) triggered when the student's assigned bus is 2 stops away or within 10 minutes ETA of their boarding stop. Eliminates panic phone calls to in-charges/drivers while in traffic.
- [ ] **Timetable Schedule Adherence Index:** Compare real-time arrival timestamps against the college's published transport handbook timetable to display live punctuality status (+5m DELAYED / ON TIME / RUNNING EARLY).
- [ ] **Bus Sharing / Route Optimization Recommendations:** If a student's route is not optimal or if multiple students commute to the same area, the system recommends alternative routes or bus sharing to save time and resources.
- [ ] **Real-time Journey Feedback System:** Allow students to report route delays, driving safety, cleanliness, or vehicle condition directly to the In-Charge and Transport Cell.
