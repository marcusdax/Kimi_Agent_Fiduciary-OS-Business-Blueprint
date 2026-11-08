# Planning coordination API (development)

Prefix: `/api/v1/planning`. All endpoints require an **access** bearer token from the existing auth API. Refresh tokens are rejected. Records are accessible only to their creating account; there is no advisor/firm sharing, professional sign-off, financial execution, or verified evidence ingestion.

## Endpoints

| Method | Path                                | Body                                                                                                                |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| GET    | `/actions`                          | None; lists the signed-in account’s actions with history                                                            |
| GET    | `/actions/:id`                      | None; inaccessible IDs return 404                                                                                   |
| POST   | `/actions`                          | Nonblank `title`, `outcome`, `owner`, `source`, `assumptions`, `alternatives`, `costs`                              |
| POST   | `/actions/:id/transitions`          | `version`, `stage`; `reviewNote` required before Waiting for approval, `evidence` required before Verified complete |
| POST   | `/actions/:id/authorization`        | `version`, `confirmation: "AUTHORIZE_PLANNING_FOLLOW_THROUGH"`; only while Waiting for approval                     |
| POST   | `/actions/:id/revoke-authorization` | `version`; pauses pending/in-progress follow-through, preserves prior history                                       |
| PATCH  | `/actions/:id/review-date`          | `version`, `reviewDate` as a valid YYYY-MM-DD date or null; never reopens completion or schedules a reminder        |

Creation starts at **Gather information**, version 1, with a server-created event. `owner` is a descriptive responsibility field, never an authentication identifier or delegation grant. Text is trimmed, required, and bounded; unknown fields are rejected. Titles and responsibility labels are limited to 160 characters, other text to 4000.

Stages must advance one at a time: Gather information, Analyze choices, Ready for review, Waiting for approval, In progress, Verified complete. Recording authorization does **not** advance the stage. It stores the account actor, server time, scope, and decision snapshot in a new event. Starting follow-through is a subsequent version-checked transition. Authorization covers planning coordination only, never a transaction. A review note is a user assertion, not proof of professional review.

Every mutation after creation requires the last returned `version`. The server uses a transaction, conditional update, and unique `(actionId, version)` events. Stale/conflicting writes return 409; clients must reload and review, not silently repeat. Dates can be changed without invalidating unchanged planning terms. Substantive field editing is intentionally not exposed in this increment; create a new reviewed record instead. Completion requires a nonempty evidence description, not a verified uploaded artifact.

Response records include the full decision context, stage, version, optional authorizedVersion, reviewDate, completionEvidence, and events ordered by version. Event `details` is JSON encoded as a string. History has no API edit/delete endpoint. Database administrators can still alter data: this is not a tamper-proof recordkeeping or regulatory retention system.

## Local migration and testing

```bash
cd fiduciary-os/backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run type-check
DATABASE_URL=file:./test.db npx prisma migrate deploy
DATABASE_URL=file:./test.db JWT_SECRET=test BCRYPT_ROUNDS=4 npx jest --runInBand
npm run build
```

Use a dedicated development database and account. Do not run tests against client data. The migration adds planning_actions and planning_events without changing existing records. Restricting user deletion avoids silently cascading away planning history; compliant retention/erasure policies remain to be designed. SQLite is the prototype store; deployment, firm/household tenancy, evidence storage, and server-side JWT revocation remain out of scope.
