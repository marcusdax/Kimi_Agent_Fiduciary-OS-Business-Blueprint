/**
 * openapi.ts — the specification is generated from the route table.
 *
 * Gap 11 was that nothing checked the HTTP boundary: a schema change could break
 * every client silently. Generating the document from the same table that dispatches
 * requests removes the usual drift, and `tests/contract/openapi.test.ts` then asserts
 * that the generated document and the live routes agree in both directions.
 */
import type { RouteSpec } from './routes.ts';

const SCOPES: Record<string, string> = {
  'calc:read': 'Run calculators and read market context',
  'ledger:read': 'Read and export evidence-ledger entries',
  'ledger:write': 'Append evidence entries',
  'advice:write': 'Run the suitability gate and record advice decisions',
  'authz:read': 'Query the authorisation graph',
  'authz:write': 'Grant and revoke relationships',
  admin: 'Vault, attestation issuance and key rotation',
};

export function buildOpenApi(routes: RouteSpec[]): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    const openApiPath = route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    const params = [...route.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));

    const operation: Record<string, unknown> = {
      summary: route.summary,
      operationId: `${route.method.toLowerCase()}${route.path.replace(/[^A-Za-z0-9]+/g, '_')}`,
      tags: [route.group],
      ...(params.length ? { parameters: params } : {}),
      responses: {
        '200': {
          description: 'Success. Computed values are wrapped in a provenance envelope.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ProvenanceEnvelope' } } },
        },
        '400': { $ref: '#/components/responses/BadRequest' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '422': { $ref: '#/components/responses/InvalidInput' },
        '429': { $ref: '#/components/responses/RateLimited' },
        '503': { $ref: '#/components/responses/DataUnavailable' },
      },
      ...(route.publicRoute ? { security: [] } : { security: [{ bearerAuth: [] }] }),
      ...(route.scope ? { 'x-required-scope': route.scope } : {}),
      ...(route.requestSchema
        ? { requestBody: { required: true, content: { 'application/json': { schema: route.requestSchema } } } }
        : {}),
    };

    paths[openApiPath] = { ...(paths[openApiPath] ?? {}), [route.method.toLowerCase()]: operation };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Fiduciary OS Trust Core',
      version: '1.0.0',
      description:
        'Data provenance, deterministic planning engines and evidence controls. Every computed value carries a ' +
        'provenance envelope identifying its provider, citation, observation date and licence. In production, ' +
        'placeholder-backed values are refused with HTTP 503 rather than served.',
      license: { name: 'Proprietary' },
    },
    servers: [{ url: 'http://127.0.0.1:8080', description: 'Local' }],
    tags: [
      { name: 'calc', description: 'Deterministic calculators and gates' },
      { name: 'live', description: 'Endpoints that call external providers' },
      { name: 'ledger', description: 'Evidence ledger and authorisation' },
      { name: 'watch', description: 'SEC disclosure monitoring' },
      { name: 'auth', description: 'Token issuing (development only)' },
      { name: 'default', description: 'Operational endpoints' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Scoped HS256 token.' },
      },
      schemas: {
        Provenance: {
          type: 'object',
          required: ['source', 'sourceKind', 'retrievedAt', 'method'],
          properties: {
            source: { type: 'string', description: 'Stable provider key, e.g. fred:DGS10' },
            sourceKind: { type: 'string', enum: ['live', 'bundled-official', 'derived', 'user-input', 'mock'] },
            sourceUrl: { type: 'string' },
            retrievedAt: { type: 'string', format: 'date-time' },
            asOf: { type: ['string', 'null'], format: 'date' },
            license: { type: 'string' },
            method: { type: 'string', description: 'Plain-language description of how the value was produced' },
            staleAfterSeconds: { type: 'number' },
            derivedFrom: { type: 'array', items: { type: 'string' } },
          },
        },
        ProvenanceEnvelope: {
          type: 'object',
          required: ['data', 'provenance'],
          properties: { data: {}, provenance: { $ref: '#/components/schemas/Provenance' } },
        },
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                detail: { type: 'string' },
              },
            },
            requestId: { type: 'string' },
          },
        },
      },
      responses: {
        BadRequest: { description: 'Malformed request body.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        Unauthorized: { description: 'Missing, expired or under-scoped token.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        InvalidInput: { description: 'Well-formed but semantically invalid input (e.g. an unsupported tax year).', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        RateLimited: { description: 'Token bucket exhausted.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        DataUnavailable: { description: 'A required live source is unavailable; the service refuses to fabricate a value.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
    'x-scopes': SCOPES,
    paths,
  };
}
