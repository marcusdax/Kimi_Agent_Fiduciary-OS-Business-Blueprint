import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create primary admin user with full profile, portfolio, and advisor capabilities
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'wylder.mccarty@gmail.com' },
    update: {
      role: 'admin',
      advisorCode: 'ADMIN-001',
    },
    create: {
      email: 'wylder.mccarty@gmail.com',
      password: adminPassword,
      name: 'Marcus Admin',
      role: 'admin',
      advisorCode: 'ADMIN-001',
      profile: {
        create: {
          age: 42,
          retirementAge: 60,
          filingStatus: 'married',
          stateTaxRate: 5.0,
          employmentStatus: 'self-employed',
          annualIncome: 385000,
          investableAssets: 2450000,
          monthlyExpenses: 11500,
          retirementSavings: 1450000,
          primaryGoal: 'wealth_preservation',
          riskTolerance: 4,
          investmentStyle: 'active',
          cryptoAllocation: 8,
        },
      },
      portfolio: {
        create: {
          totalValue: 2450000,
          holdings: {
            create: [
              { symbol: 'VTI', quantity: 3200, avgCost: 245 },
              { symbol: 'VXUS', quantity: 2400, avgCost: 58 },
              { symbol: 'QQQ', quantity: 1100, avgCost: 410 },
              { symbol: 'BND', quantity: 3500, avgCost: 73 },
              { symbol: 'SGOV', quantity: 2200, avgCost: 100.2 },
            ],
          },
        },
      },
    },
  });
  console.log('Created/updated admin user:', admin.email);

  // Create platform super-admin account (admin@fiduciaryos.com)
  const superAdminPassword = await bcrypt.hash('Admin!2026', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@fiduciaryos.com' },
    update: {
      role: 'admin',
      advisorCode: 'ADMIN-SUPER',
    },
    create: {
      email: 'admin@fiduciaryos.com',
      password: superAdminPassword,
      name: 'Fiduciary OS Super Admin',
      role: 'admin',
      advisorCode: 'ADMIN-SUPER',
      profile: {
        create: {
          age: 42,
          retirementAge: 60,
          filingStatus: 'married',
          stateTaxRate: 5.0,
          employmentStatus: 'self-employed',
          annualIncome: 385000,
          investableAssets: 2450000,
          monthlyExpenses: 11500,
          retirementSavings: 1450000,
          primaryGoal: 'wealth_preservation',
          riskTolerance: 4,
          investmentStyle: 'active',
          cryptoAllocation: 8,
        },
      },
      portfolio: {
        create: {
          totalValue: 2450000,
          holdings: {
            create: [
              { symbol: 'VTI', quantity: 3200, avgCost: 245 },
              { symbol: 'VXUS', quantity: 2400, avgCost: 58 },
              { symbol: 'QQQ', quantity: 1100, avgCost: 410 },
              { symbol: 'BND', quantity: 3500, avgCost: 73 },
              { symbol: 'SGOV', quantity: 2200, avgCost: 100.2 },
            ],
          },
        },
      },
    },
  });
  console.log('Created/updated super-admin user:', superAdmin.email);

  // Create demo client user
  const clientPassword = await bcrypt.hash('demo123', 12);
  const client = await prisma.user.upsert({
    where: { email: 'demo@fiduciaryos.com' },
    update: {},
    create: {
      email: 'demo@fiduciaryos.com',
      password: clientPassword,
      name: 'Demo Client',
      role: 'client',
      profile: {
        create: {
          age: 45,
          retirementAge: 65,
          filingStatus: 'married',
          stateTaxRate: 0,
          employmentStatus: 'employed',
          annualIncome: 150000,
          investableAssets: 500000,
          monthlyExpenses: 6000,
          retirementSavings: 300000,
          primaryGoal: 'retire',
          riskTolerance: 3,
          investmentStyle: 'active',
          cryptoAllocation: 5,
        },
      },
      portfolio: {
        create: {
          totalValue: 500000,
          holdings: {
            create: [
              { symbol: 'VTI', quantity: 500, avgCost: 220 },
              { symbol: 'VXUS', quantity: 300, avgCost: 55 },
              { symbol: 'BND', quantity: 200, avgCost: 75 },
            ],
          },
        },
      },
    },
  });
  console.log('Created client user:', client.email);

  // Create demo advisor user
  const advisorPassword = await bcrypt.hash('advisor123', 12);
  const advisor = await prisma.user.upsert({
    where: { email: 'advisor@fiduciaryos.com' },
    update: {},
    create: {
      email: 'advisor@fiduciaryos.com',
      password: advisorPassword,
      name: 'Demo Advisor',
      role: 'advisor',
      advisorCode: 'ADV-001',
    },
  });
  console.log('Created advisor user:', advisor.email);

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
