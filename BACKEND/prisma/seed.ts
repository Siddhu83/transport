import { PrismaClient, Role, BusStatus } from '@prisma/client';
import { hashPassword } from '../src/modules/auth/crypto.utils.js';

const prisma = new PrismaClient();

async function main() {
  console.info('🌱 Starting Database Seeder...');

  // Clean existing tables
  await prisma.sosIncident.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.routeStop.deleteMany();
  await prisma.user.deleteMany();
  await prisma.bus.deleteMany();
  await prisma.stop.deleteMany();
  await prisma.route.deleteMany();

  const defaultPasswordHash = await hashPassword('Password123!');

  // 1. Create 200 Physical Campus & City Stops
  console.info('📍 Creating 200 Stops...');
  const stops = [];
  const baseLat = 17.4435;
  const baseLng = 78.3489;

  for (let i = 1; i <= 200; i++) {
    const latOffset = (Math.random() - 0.5) * 0.1;
    const lngOffset = (Math.random() - 0.5) * 0.1;
    const stop = await prisma.stop.create({
      data: {
        name: `Campus Transit Stop #${i}`,
        code: `STOP-${1000 + i}`,
        latitude: baseLat + latOffset,
        longitude: baseLng + lngOffset,
      },
    });
    stops.push(stop);
  }

  // 2. Create 50 Bus Routes
  console.info('🛣️ Creating 50 Bus Routes...');
  const routes = [];
  for (let i = 1; i <= 50; i++) {
    const route = await prisma.route.create({
      data: {
        routeNumber: `R-${100 + i}`,
        name: `Sector ${i} Express Corridor`,
        polylineGeoJson: JSON.stringify({
          type: 'LineString',
          coordinates: [
            [baseLng, baseLat],
            [baseLng + 0.02, baseLat + 0.02],
          ],
        }),
      },
    });
    routes.push(route);

    // Link 4 stops to each route
    const routeStopsToLink = stops.slice((i - 1) * 4, i * 4);
    for (let order = 0; order < routeStopsToLink.length; order++) {
      const stop = routeStopsToLink[order];
      if (stop) {
        await prisma.routeStop.create({
          data: {
            routeId: route.id,
            stopId: stop.id,
            stopOrder: order + 1,
            estimatedMinutesFromStart: (order + 1) * 10,
          },
        });
      }
    }
  }

  // 3. Create 100 Buses & 100 Driver Accounts
  console.info('🚍 Creating 100 Buses and Drivers...');
  for (let i = 1; i <= 100; i++) {
    const assignedRoute = routes[(i - 1) % routes.length];

    const bus = await prisma.bus.create({
      data: {
        busNumber: `BUS-${100 + i}`,
        licensePlate: `KA-01-EQ-${1000 + i}`,
        capacity: 50,
        status: BusStatus.ACTIVE,
        currentRouteId: assignedRoute?.id,
      },
    });

    const driver = await prisma.user.create({
      data: {
        email: `driver${i}@transport.college.edu`,
        passwordHash: defaultPasswordHash,
        name: `Driver Persona #${i}`,
        role: Role.DRIVER,
        assignedBusId: bus.id,
      },
    });

    // Update bus driver relation
    await prisma.bus.update({
      where: { id: bus.id },
      data: { driverId: driver.id },
    });
  }

  // 4. Create 4 Super Admin Accounts
  console.info('👑 Creating 4 Super Admin Accounts...');
  for (let i = 1; i <= 4; i++) {
    await prisma.user.create({
      data: {
        email: `admin${i}@transport.college.edu`,
        passwordHash: defaultPasswordHash,
        name: `Super Admin Tower Controller #${i}`,
        role: Role.SUPER_ADMIN,
      },
    });
  }

  // 5. Create 10 Bus In-Charge Accounts
  console.info('👔 Creating 10 Bus In-Charge Accounts...');
  for (let i = 1; i <= 10; i++) {
    await prisma.user.create({
      data: {
        email: `incharge${i}@transport.college.edu`,
        passwordHash: defaultPasswordHash,
        name: `Bus In-Charge Supervisor #${i}`,
        role: Role.BUS_INCHARGE,
      },
    });
  }

  // 6. Create 2,000 Student Accounts
  console.info('🎓 Creating 2,000 Student Accounts...');
  const studentData = [];
  for (let i = 1; i <= 2000; i++) {
    const assignedRoute = routes[(i - 1) % routes.length];
    studentData.push({
      email: `student${i}@college.edu`,
      passwordHash: defaultPasswordHash,
      name: `Student Persona #${i}`,
      role: Role.STUDENT,
      assignedRouteId: assignedRoute?.id,
    });
  }

  // Batch insert students in chunks of 500
  for (let i = 0; i < studentData.length; i += 500) {
    const chunk = studentData.slice(i, i + 500);
    await prisma.user.createMany({ data: chunk });
  }

  console.info('✅ Database Seeding Completed Successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
