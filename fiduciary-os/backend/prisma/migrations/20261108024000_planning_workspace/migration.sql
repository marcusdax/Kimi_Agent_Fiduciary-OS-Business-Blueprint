-- CreateTable
CREATE TABLE "planning_actions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "assumptions" TEXT NOT NULL,
    "alternatives" TEXT NOT NULL,
    "costs" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'Gather information',
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorizedVersion" INTEGER,
    "reviewDate" TEXT,
    "completionEvidence" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "planning_actions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "planning_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "details" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "planning_events_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "planning_actions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "planning_actions_userId_createdAt_idx" ON "planning_actions"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "planning_events_actionId_version_key" ON "planning_events"("actionId", "version");
