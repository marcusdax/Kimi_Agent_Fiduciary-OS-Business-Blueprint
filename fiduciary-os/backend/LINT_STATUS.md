# Backend lint status

`npm run lint` is **not passing**. The full CI lint step remains explicitly nonblocking; a green overall check is not evidence that full lint passed. Remaining inherited findings include import order, default-import member use, unused variables, namespaces and explicit `any` declarations. Do not disable those rules to hide the debt.

This follow-up installs the missing TypeScript import resolver and uses `tsconfig.eslint.json` to include source, tests and Prisma seed files while excluding generated `dist` and coverage. The resolver/parser configuration failures are resolved; real lint findings remain visible.

`npm run lint:planning` strictly checks `src/routes/planning.ts` and `tests/unit/planning.test.ts` with zero warnings allowed. This scoped lint step is **blocking** in backend CI. It is not a claim about the remainder of the repository.

Type checks, database migrations, tests, builds, lint and dependency/security review are separate checks. Existing dependency alerts and production security/accessibility gates are not resolved by this lint configuration repair.
