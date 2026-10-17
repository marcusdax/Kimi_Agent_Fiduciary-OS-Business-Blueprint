-- CreateTable
CREATE TABLE "ai_interactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "endpoint" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "source" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "flags" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ai_interactions_userId_createdAt_idx" ON "ai_interactions"("userId", "createdAt");
