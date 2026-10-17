import { prisma } from '../src/config/database';

// Clean up database before each test
beforeEach(async () => {
  // Delete test data
  await prisma.$transaction([
    prisma.holding.deleteMany(),
    prisma.portfolio.deleteMany(),
    prisma.document.deleteMany(),
    prisma.profile.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
  ]);
});

// Disconnect from database after all tests
afterAll(async () => {
  await prisma.$disconnect();
});
