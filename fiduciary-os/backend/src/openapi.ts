import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { financialInputs } from './services/financial-plan';

extendZodWithOpenApi(z);

/**
 * OpenAPI 3.1 reference generated from code. Request bodies reuse the same zod schemas the
 * routes validate with where they exist (financial plan, org); calculator bodies mirror the
 * express-validator rules. tests/unit/openapi.test.ts fails if a route is added without a path here.
 */
export const registry = new OpenAPIRegistry();
const bearer = registry.registerComponent('securitySchemes', 'bearerAuth', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
void bearer;
const sec = [{ bearerAuth: [] }];
const err = { description: 'Error', content: { 'application/json': { schema: z.object({ error: z.string() }) } } };
const ok = (schema: z.ZodType, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
const body = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
const idParam = (name: string) => z.object({ [name]: z.string().uuid() });
const illustrative = { illustrative: z.literal(true), disclaimer: z.string() };

const Plan = z.object({ version: z.number().int().min(0), inputs: financialInputs }).strict();
registry.registerPath({ method: 'get', path: '/financial-plan', tags: ['Plan'], security: sec, responses: { 200: ok(z.object({ id: z.string(), version: z.number(), inputs: financialInputs, projection: z.any() }).nullable(), 'Plan or null'), 401: err } });
registry.registerPath({ method: 'put', path: '/financial-plan', tags: ['Plan'], security: sec, request: { body: body(Plan) }, responses: { 200: ok(z.any(), 'Saved plan with projection'), 400: err, 409: err } });

const Household = z.object({ id: z.string(), name: z.string(), firmId: z.string() });
registry.registerPath({ method: 'post', path: '/org/firms', tags: ['Firms'], security: sec, request: { body: body(z.object({ name: z.string().min(1).max(100), brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).strict()) }, responses: { 201: ok(z.any(), 'Firm; caller becomes owner'), 400: err } });
registry.registerPath({ method: 'post', path: '/org/firms/{firmId}/advisors', tags: ['Firms'], security: sec, request: { params: idParam('firmId'), body: body(z.object({ email: z.string().email() }).strict()) }, responses: { 201: ok(z.any()), 403: err, 404: err } });
registry.registerPath({ method: 'post', path: '/org/firms/{firmId}/households', tags: ['Households'], security: sec, request: { params: idParam('firmId'), body: body(z.object({ name: z.string().min(1).max(100) }).strict()) }, responses: { 201: ok(Household), 403: err } });
registry.registerPath({ method: 'get', path: '/org/households', tags: ['Households'], security: sec, description: 'Households the caller can view (owner, assigned advisor, or client).', responses: { 200: ok(z.array(Household)) } });
registry.registerPath({ method: 'get', path: '/org/households/{id}', tags: ['Households'], security: sec, request: { params: idParam('id') }, responses: { 200: ok(z.object({ id: z.string(), name: z.string(), firm: z.string(), clients: z.array(z.object({ id: z.string(), name: z.string() })), access: z.string() })), 403: err } });
registry.registerPath({ method: 'get', path: '/org/households/{id}/plan.pdf', tags: ['Households'], security: sec, request: { params: idParam('id') }, responses: { 200: { description: 'Firm-branded plan PDF', content: { 'application/pdf': { schema: z.string().openapi({ format: 'binary' }) } } }, 403: err } });
registry.registerPath({ method: 'post', path: '/org/households/{id}/clients', tags: ['Households'], security: sec, request: { params: idParam('id'), body: body(z.object({ email: z.string().email() }).strict()) }, responses: { 201: ok(z.any()), 403: err, 404: err } });
registry.registerPath({ method: 'post', path: '/org/households/{id}/assignments', tags: ['Households'], security: sec, request: { params: idParam('id'), body: body(z.object({ email: z.string().email(), scope: z.enum(['view', 'manage']) }).strict()) }, responses: { 201: ok(z.any()), 403: err, 404: err } });

const calc = (path: string, summary: string, req: z.ZodType, res: z.ZodRawShape) =>
  registry.registerPath({ method: 'post', path: `/calculations/${path}`, tags: ['Calculators'], summary, security: sec, request: { body: body(req) }, responses: { 200: ok(z.object({ ...res, ...illustrative })), 400: err, 401: err } });
calc('annuity', 'Actuarial annuity income illustration', z.object({ principal: z.number().min(1000), deferralPeriod: z.number().int().min(0).max(30), startAge: z.number().int().min(45).max(80), productType: z.enum(['fixed', 'indexed', 'variable', 'immediate']), jointLife: z.enum(['no', 'yes', 'reduced']), colaRider: z.enum(['0', '2', '3', 'cpi']), sex: z.enum(['male', 'female']).optional(), discountRate: z.number().min(0.005).max(0.1).optional() }), { monthlyIncome: z.number(), annualIncome: z.number(), yieldRate: z.number(), breakEvenAge: z.number().nullable(), assumptions: z.array(z.string()) });
calc('life-insurance', 'Income-replacement protection gap (no premium quote)', z.object({ currentAge: z.number().int().min(25).max(70), annualIncome: z.number().int().describe('Thousands of dollars'), existingCoverage: z.number().int().describe('Thousands of dollars'), term: z.enum(['10', '20', '30', 'perm']), healthClass: z.enum(['pp', 'p', 'sp', 's']), gender: z.enum(['m', 'f']), tobacco: z.enum(['n', 'y']) }), { protectionGap: z.number(), ruleOfThumb10x: z.number(), monthlyPremium: z.null(), lifetimeCost: z.null() });
calc('retirement', 'Historical-cycle replay (not a probability)', z.object({ portfolioValue: z.number().min(100000), retirementAge: z.number().int(), monthlySpending: z.number(), socialSecurity: z.number(), pension: z.number(), strategy: z.enum(['4pct', 'dynamic', 'guardrails', 'annuity']), stockAllocation: z.number().int().min(0).max(100).optional(), horizonYears: z.number().int().min(10).max(50).optional() }), { historicalSuccessRatePct: z.number(), sustainableMonthly: z.number(), method: z.string() });
calc('tax', 'Federal ordinary income tax (versioned tables)', z.object({ filingStatus: z.enum(['single', 'married', 'head']), annualIncome: z.number().min(0), contribution401k: z.number().min(0), rothConversion: z.number().min(0), capitalLossHarvest: z.number().min(0), hsaContribution: z.number().min(0), qcdAmount: z.number().min(0), taxYear: z.enum(['2024', '2026']).optional() }), { estimatedLiability: z.number(), taxYearAssumed: z.number(), tableCitation: z.string() });

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'Fiduciary OS API', version: '0.1.0', description: 'Educational planning API. Calculator outputs are illustrations, not quotes, offers or recommendations.' },
    servers: [{ url: '/api/v1' }],
  });
}
