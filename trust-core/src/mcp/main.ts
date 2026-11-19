/**
 * mcp/main.ts — stdio entry point for the MCP server.
 *
 *   node src/mcp/main.ts           # speaks newline-delimited JSON-RPC on stdio
 *
 * Registration with an assistant is a JSON snippet the operator adds:
 *   { "command": "node", "args": ["/path/to/src/mcp/main.ts"] }
 *
 * The provider clients are shared with the HTTP service, so a tool call from an
 * assistant carries the same provenance, the same caching and the same circuit
 * breakers as a call from the app. There is no second data path to audit.
 */
import { HttpClient } from '../http.ts';
import { cacheFromEnv } from '../cache.ts';
import { CalibrationService } from '../calibration.ts';
import { SecSource } from '../sources/sec.ts';
import { DisclosureWatch } from '../features/disclosure-watch.ts';
import { runStdio } from './server.ts';

const http = new HttpClient({
  userAgent:
    process.env.SEC_USER_AGENT ??
    'FiduciaryOS-MCP/1.0 (+https://fiduciary-os.example; mcp-tool)',
  cache: cacheFromEnv(),
});

const calibration = new CalibrationService(http);
const watch = new DisclosureWatch(new SecSource(http));

await runStdio({ calibration, watch });
