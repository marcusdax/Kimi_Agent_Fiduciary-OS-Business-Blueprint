CREATE TABLE "AuthSession" ("id" TEXT NOT NULL PRIMARY KEY,"userId" TEXT NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"expiresAt" DATETIME NOT NULL,"revokedAt" DATETIME,CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE TABLE "SessionRefresh" ("digest" TEXT NOT NULL PRIMARY KEY,"sessionId" TEXT NOT NULL,"expiresAt" DATETIME NOT NULL,"usedAt" DATETIME,CONSTRAINT "SessionRefresh_sessionId_fkey" FOREIGN KEY("sessionId") REFERENCES "AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "SessionRefresh_sessionId_idx" ON "SessionRefresh"("sessionId");
ALTER TABLE "ToolScenario" ADD COLUMN "methodVersion" TEXT;
ALTER TABLE "ToolScenario" ADD COLUMN "resultSnapshot" TEXT;
