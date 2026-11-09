-- CreateTable
CREATE TABLE "firms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "brandColor" TEXT NOT NULL DEFAULT '#1d5c4a',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "firm_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    CONSTRAINT "firm_members_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "firm_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "households" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "households_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "household_clients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "household_clients_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "household_clients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "household_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "advisorUserId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    CONSTRAINT "household_assignments_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "household_assignments_advisorUserId_fkey" FOREIGN KEY ("advisorUserId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "firm_members_firmId_userId_key" ON "firm_members"("firmId", "userId");

-- CreateIndex
CREATE INDEX "households_firmId_idx" ON "households"("firmId");

-- CreateIndex
CREATE INDEX "household_clients_userId_idx" ON "household_clients"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "household_clients_householdId_userId_key" ON "household_clients"("householdId", "userId");

-- CreateIndex
CREATE INDEX "household_assignments_advisorUserId_idx" ON "household_assignments"("advisorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "household_assignments_householdId_advisorUserId_key" ON "household_assignments"("householdId", "advisorUserId");

-- CreateIndex
CREATE INDEX "access_logs_householdId_idx" ON "access_logs"("householdId");
