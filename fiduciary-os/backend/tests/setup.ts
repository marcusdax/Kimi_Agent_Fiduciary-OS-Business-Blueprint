import { prisma } from '../src/config/database';

// Clean up database before each test
beforeEach(async () => {
  // Delete test data
  await prisma.$transaction([
    prisma.accessLog.deleteMany(),
    prisma.householdAssignment.deleteMany(),
    prisma.householdClient.deleteMany(),
    prisma.household.deleteMany(),
    prisma.firmMember.deleteMany(),
    prisma.firm.deleteMany(),
    prisma.sessionRefresh.deleteMany(),
    prisma.authSession.deleteMany(),
    prisma.toolScenario.deleteMany(),
    prisma.financialPlan.deleteMany(),
    prisma.planningEvent.deleteMany(),
    prisma.planningAction.deleteMany(),
    prisma.aiInteraction.deleteMany(),
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
