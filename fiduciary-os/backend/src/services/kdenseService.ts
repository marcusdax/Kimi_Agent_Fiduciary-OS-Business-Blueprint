/**
 * services/kdenseService.ts — Phase 3 K-Dense Kady MCP Registration.
 *
 * Registers trust-core (5 calculators + fidos_compliance_audit) and MASTERNEX.os
 * as global MCP servers in a running K-Dense Kady instance via its REST API:
 *   PUT http://127.0.0.1:8000/mcp?scope=global
 *
 * Env vars:
 *   KDENSE_URL          — K-Dense backend URL (default: not set, skips registration)
 *   KDENSE_AUTH_TOKEN   — K-Dense auth token (matches KADY_AUTH_TOKEN in k-dense .env)
 *   TRUST_CORE_MCP_URL  — trust-core HTTP streamable MCP URL (default: http://127.0.0.1:3001/mcp)
 *   MASTERNEX_MCP_URL   — MASTERNEX HTTP streamable MCP URL (default: http://127.0.0.1:8080/mcp)
 *
 * When KDENSE_URL is unset, registration is silently skipped — safe to leave
 * unconfigured in development or when K-Dense is not part of the deployment.
 */

const KDENSE_URL = process.env.KDENSE_URL ?? null;
const KDENSE_AUTH_TOKEN = process.env.KDENSE_AUTH_TOKEN ?? null;
const TRUST_CORE_MCP_URL = process.env.TRUST_CORE_MCP_URL ?? 'http://127.0.0.1:3001/mcp';
const MASTERNEX_MCP_URL = process.env.MASTERNEX_MCP_URL ?? 'http://127.0.0.1:8080/mcp';

export interface KdenseMcpRegistrationResult {
  status: 'registered' | 'skipped' | 'failed';
  kdenseUrl: string | null;
  servers: string[];
  error?: string;
}

/**
 * Registers trust-core and MASTERNEX MCP servers into K-Dense Kady globally.
 * Non-blocking — callers should fire-and-forget or log the result.
 */
export async function registerMcpServers(): Promise<KdenseMcpRegistrationResult> {
  if (!KDENSE_URL) {
    return { status: 'skipped', kdenseUrl: null, servers: [] };
  }

  const payload = {
    mcpServers: {
      'trust-core': {
        url: TRUST_CORE_MCP_URL,
        exposure: 'codemode',
        description:
          'FiduciaryOS trust-core: 5 calculators + fidos_compliance_audit (SR 11-7 / EU AI Act Art. 12)',
      },
      masternex: {
        url: MASTERNEX_MCP_URL,
        exposure: 'deferred',
        description:
          'MASTERNEX.os: ZK Shapley proofs, ACPLedger, PRINCE federated benchmarks, 16 MCP tools',
      },
    },
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (KDENSE_AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${KDENSE_AUTH_TOKEN}`;
  }

  try {
    const res = await fetch(`${KDENSE_URL}/mcp?scope=global`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return {
        status: 'failed',
        kdenseUrl: KDENSE_URL,
        servers: Object.keys(payload.mcpServers),
        error: `HTTP ${res.status}`,
      };
    }
    return {
      status: 'registered',
      kdenseUrl: KDENSE_URL,
      servers: Object.keys(payload.mcpServers),
    };
  } catch (err) {
    return {
      status: 'failed',
      kdenseUrl: KDENSE_URL,
      servers: Object.keys(payload.mcpServers),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
