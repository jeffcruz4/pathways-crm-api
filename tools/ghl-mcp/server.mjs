#!/usr/bin/env node
/**
 * Pathways GoHighLevel MCP shim — LOCAL, READ-ONLY.
 *
 * Purpose: answer OPEN-1 of the GHL migration (docs/design/gohighlevel-migration.md)
 * — validate whether GHL custom objects / associations are rich enough to host
 * the proprietary Pathways entities (interactions, partners, job reviews, team).
 *
 * Trust model (why this exists instead of an npm package):
 *   - The ONLY third-party dependency is the official @modelcontextprotocol/sdk.
 *   - No GHL-specific community code sits in the token path. Every line is here,
 *     in your repo, auditable.
 *   - READ-ONLY BY CONSTRUCTION: this server only ever issues HTTP GET. There is
 *     no code path that can POST/PUT/PATCH/DELETE, so even a broadly-scoped token
 *     cannot be used by this tool to mutate your CRM.
 *
 * Auth: a GoHighLevel Private Integration Token (PIT) read from the environment
 * variable GHL_PIT. The sub-account (location) id is read from GHL_LOCATION_ID.
 * Neither value is logged, persisted, or echoed back in tool output.
 *
 * Config (Kiro ~/.kiro/settings/mcp.json), stdio like the aws-mcp entry:
 *   "pathways-ghl": {
 *     "command": "node",
 *     "args": ["<abs path>/tools/ghl-mcp/server.mjs"],
 *     "env": { "GHL_PIT": "<your read-only PIT>", "GHL_LOCATION_ID": "<location id>" },
 *     "disabled": false
 *   }
 *
 * GHL REST conventions used:
 *   base:   https://services.leadconnectorhq.com
 *   auth:   Authorization: Bearer <PIT>
 *   header: Version: <date>  (GHL date-versions its API)
 *   scope:  most list endpoints take locationId as a query param
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const GHL_BASE = "https://services.leadconnectorhq.com";
// GHL date-versions its API. Objects/associations live under this version.
// Overridable via env without touching code, in case a probe needs another.
const GHL_VERSION = process.env.GHL_API_VERSION || "2021-07-28";

const PIT = process.env.GHL_PIT;
const LOCATION_ID = process.env.GHL_LOCATION_ID;

function requireEnv() {
  const missing = [];
  if (!PIT) missing.push("GHL_PIT");
  if (!LOCATION_ID) missing.push("GHL_LOCATION_ID");
  if (missing.length) {
    return `Missing required env: ${missing.join(", ")}. Set them in the MCP server's "env" block.`;
  }
  return null;
}

/**
 * The single, read-only HTTP primitive. GET ONLY — there is deliberately no
 * method parameter, so this server cannot mutate anything.
 */
async function ghlGet(path, query) {
  const envErr = requireEnv();
  if (envErr) return { ok: false, status: 0, error: envErr };

  const url = new URL(path.startsWith("http") ? path : `${GHL_BASE}${path}`);
  // Apply caller query params first so we can see whether locationId was
  // provided explicitly (including an explicit null to suppress injection).
  let suppressLocation = false;
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (k === "locationId" && v === null) {
        // Explicit opt-out: some endpoints (e.g. /objects/*, /locations/:id,
        // /locations/:id/customFields) reject a locationId query param and
        // return 422. Pass { "locationId": null } to skip auto-injection.
        suppressLocation = true;
        continue;
      }
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  // Scope to the configured location only when the caller didn't already set it
  // (via path or query) and didn't opt out. Never add a duplicate.
  if (!suppressLocation && !url.searchParams.has("locationId")) {
    url.searchParams.set("locationId", LOCATION_ID);
  }

  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${PIT}`,
        Version: GHL_VERSION,
        Accept: "application/json",
      },
    });
  } catch (err) {
    return { ok: false, status: 0, error: `Network error: ${err?.message ?? String(err)}` };
  }

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text; // non-JSON response; surface raw for diagnosis
  }
  // Never include the request headers (which carry the token) in the result.
  return { ok: res.ok, status: res.status, url: url.toString().replace(/locationId=[^&]*/, "locationId=<redacted>"), body };
}

function toToolResult(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

// ─────────────────────────────── Tools ───────────────────────────────
// All tools are GET-backed. Convenience wrappers target the exact OPEN-1
// probes; ghl_get is the escape hatch for any other read while we iterate.

const TOOLS = [
  {
    name: "ghl_get",
    description:
      "Low-level READ-ONLY GET against the GoHighLevel v2 API. Provide a path " +
      "(e.g. '/objects/custom_objects.interaction') and optional query params. " +
      "locationId is injected automatically as a query param. Some endpoints " +
      "(objects schemas, locations/:id, customFields) reject a locationId query " +
      "param — pass query { \"locationId\": null } to suppress injection. GET " +
      "only — cannot mutate.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "API path beginning with '/', or a full https URL." },
        query: {
          type: "object",
          description:
            "Optional query params as key/value pairs. Pass locationId: null to " +
            "suppress automatic locationId injection for endpoints that reject it.",
          additionalProperties: true,
        },
      },
      required: ["path"],
    },
    run: (args) => ghlGet(args.path, args.query),
  },
  {
    name: "ghl_list_object_schemas",
    description:
      "List all object schemas for the location (standard + custom). Use this " +
      "first to see which custom objects already exist and their keys.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    // The /objects/ schema-listing endpoint rejects a locationId query param
    // (422), so suppress injection. It returns all schemas for the token's
    // location regardless.
    run: () => ghlGet("/objects/", { locationId: null }),
  },
  {
    name: "ghl_get_object_schema",
    description:
      "Get a single object schema (its fields/properties) by key. For custom " +
      "objects the key is prefixed 'custom_objects.' (e.g. 'custom_objects.interaction'). " +
      "Standard keys: 'contact', 'opportunity', 'business'.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Object schema key (e.g. 'custom_objects.interaction' or 'contact')." },
        fetchProperties: { type: "boolean", description: "Include field/property definitions." },
      },
      required: ["key"],
    },
    run: (args) =>
      // /objects/:key rejects a locationId query param; suppress injection.
      ghlGet(`/objects/${encodeURIComponent(args.key)}`, {
        fetchProperties: args.fetchProperties ?? true,
        locationId: null,
      }),
  },
  {
    name: "ghl_search_records",
    description:
      "List/search records of an object schema by key (READ-ONLY). Use to see " +
      "how real records look and how many exist.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Object schema key (e.g. 'custom_objects.interaction')." },
        pageLimit: { type: "number", description: "Max records to return (default 20)." },
      },
      required: ["key"],
    },
    run: (args) =>
      ghlGet(`/objects/${encodeURIComponent(args.key)}/records`, {
        pageLimit: args.pageLimit ?? 20,
      }),
  },
  {
    name: "ghl_list_associations",
    description:
      "List association definitions for the location — the relationship model " +
      "between objects (e.g. contact↔custom object). Key to validating whether " +
      "Pathways' FK relationships can be expressed in GHL.",
    inputSchema: {
      type: "object",
      properties: {
        pageLimit: { type: "number", description: "Max definitions to return (default 50)." },
      },
      additionalProperties: false,
    },
    run: (args) => ghlGet("/associations/", { limit: args?.pageLimit ?? 50 }),
  },
  {
    name: "ghl_whoami",
    description:
      "Read the configured location (sub-account) to confirm the token works and " +
      "which location it is bound to. Good first call after connecting.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    // /locations/:id rejects a locationId query param; suppress injection.
    run: () => ghlGet(`/locations/${encodeURIComponent(LOCATION_ID ?? "")}`, { locationId: null }),
  },
];

const toolByName = new Map(TOOLS.map((t) => [t.name, t]));

// ─────────────────────────────── Server ───────────────────────────────
const server = new Server(
  { name: "pathways-ghl-mcp-shim", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = toolByName.get(req.params.name);
  if (!tool) {
    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }] };
  }
  try {
    const result = await tool.run(req.params.arguments ?? {});
    const isError = result && result.ok === false;
    return { isError: Boolean(isError), ...toToolResult(result) };
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: `Tool error: ${err?.message ?? String(err)}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
// Intentionally quiet on stdout (stdio transport owns it); diagnostics → stderr.
process.stderr.write("[pathways-ghl-mcp-shim] ready (read-only)\n");
