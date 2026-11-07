#!/usr/bin/env node
/**
 * Pathways GoHighLevel MCP shim — WRITE PROBE (SANDBOX ONLY).
 *
 * Purpose: close the WRITE half of OPEN-6 (gohighlevel-phase2-repository.md) —
 * validate GHL contact/opportunity CREATE + upsert/idempotency semantics and
 * the request/response body shapes needed for the Phase 2 write path.
 *
 * ⚠️ THIS SERVER CAN MUTATE A GHL ACCOUNT. It is deliberately separate from the
 * read-only server.mjs (which stays read-only by construction). Hard guards:
 *
 *   1. SANDBOX LOCK. Refuses to start unless BOTH:
 *        - GHL_ALLOW_WRITES === "true"
 *        - GHL_LOCATION_ID === GHL_SANDBOX_LOCATION_ID   (explicit confirmation
 *          that the configured location is the designated sandbox)
 *      This makes it physically unable to run against a location you did not
 *      name as the sandbox. There is no override.
 *
 *   2. EVERY mutation is logged to stderr (method + path + marker) before it
 *      runs, and every created record is tagged/prefixed "pathways-writetest"
 *      so test data is trivially identifiable and removable.
 *
 *   3. Minimal verbs. Only the creates needed for the probe (contact,
 *      opportunity) plus read-backs. No update/delete here — keep the blast
 *      radius to "a couple of clearly-tagged new rows in a throwaway account."
 *
 * Config (Kiro ~/.kiro/settings/mcp.json) — a SEPARATE entry from pathways-ghl:
 *   "pathways-ghl-write": {
 *     "command": "node",
 *     "args": ["<abs>/tools/ghl-mcp/server-write.mjs"],
 *     "env": {
 *       "GHL_PIT": "<write-scoped PIT for the SANDBOX sub-account>",
 *       "GHL_LOCATION_ID": "<sandbox location id>",
 *       "GHL_SANDBOX_LOCATION_ID": "<same sandbox location id>",
 *       "GHL_ALLOW_WRITES": "true"
 *     },
 *     "disabled": false
 *   }
 *
 * After the probe: revoke the write PIT and set disabled:true (or remove).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = process.env.GHL_API_VERSION || "2021-07-28";
const PIT = process.env.GHL_PIT;
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const SANDBOX_LOCATION_ID = process.env.GHL_SANDBOX_LOCATION_ID;
const ALLOW_WRITES = process.env.GHL_ALLOW_WRITES === "true";

/** A stable marker so every record this tool creates is identifiable. */
const TEST_MARKER = "pathways-writetest";

// ─────────────────────────── Sandbox lock ───────────────────────────
function sandboxGateError() {
  if (!ALLOW_WRITES) {
    return "Refusing to start: GHL_ALLOW_WRITES is not 'true'. This write-probe server only runs with explicit opt-in.";
  }
  if (!PIT || !LOCATION_ID) {
    return "Refusing to start: GHL_PIT and GHL_LOCATION_ID are required.";
  }
  if (!SANDBOX_LOCATION_ID) {
    return "Refusing to start: GHL_SANDBOX_LOCATION_ID must name the designated sandbox location.";
  }
  if (LOCATION_ID !== SANDBOX_LOCATION_ID) {
    return `Refusing to start: GHL_LOCATION_ID (${LOCATION_ID}) !== GHL_SANDBOX_LOCATION_ID. This server only operates on the explicitly-named sandbox location.`;
  }
  return null;
}

// ─────────────────────────── HTTP helpers ───────────────────────────
function authHeaders() {
  return {
    Authorization: `Bearer ${PIT}`,
    Version: GHL_VERSION,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function redact(u) {
  return String(u).replace(/location_id=[^&]*/g, "location_id=<redacted>");
}

async function ghlGet(path, query) {
  const url = new URL(path.startsWith("http") ? path : `${GHL_BASE}${path}`);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v));
  let res;
  try {
    res = await fetch(url, { method: "GET", headers: authHeaders() });
  } catch (err) {
    return { ok: false, status: 0, error: `Network error: ${err?.message ?? String(err)}` };
  }
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, url: redact(url), body };
}

/** The write primitive. Logs every mutation to stderr BEFORE issuing it. */
async function ghlWrite(method, path, payload) {
  const url = `${GHL_BASE}${path}`;
  process.stderr.write(`[WRITE-PROBE] ${method} ${path} marker=${TEST_MARKER}\n`);
  let res;
  try {
    res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });
  } catch (err) {
    return { ok: false, status: 0, error: `Network error: ${err?.message ?? String(err)}` };
  }
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

function toToolResult(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

// ─────────────────────────────── Tools ───────────────────────────────
const TOOLS = [
  {
    name: "ghl_probe_create_contact",
    description:
      "SANDBOX WRITE. Create a test contact (tagged 'pathways-writetest'). Use " +
      "to confirm the contact create body shape + upsert/dedupe behavior. Pass " +
      "an email/phone to test dedupe on a repeat call.",
    inputSchema: {
      type: "object",
      properties: {
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string", description: "E.164, e.g. +15555550123" },
        upsert: { type: "boolean", description: "Use the upsert endpoint instead of create." },
      },
    },
    run: async (a) => {
      const payload = {
        locationId: LOCATION_ID,
        firstName: a.firstName ?? "Pathways",
        lastName: a.lastName ?? "WriteTest",
        email: a.email,
        phone: a.phone,
        tags: [TEST_MARKER],
        source: TEST_MARKER,
      };
      // VERIFY: /contacts/ (create) vs /contacts/upsert (dedupe on email/phone).
      const path = a.upsert ? "/contacts/upsert" : "/contacts/";
      return ghlWrite("POST", path, payload);
    },
  },
  {
    name: "ghl_probe_create_opportunity",
    description:
      "SANDBOX WRITE. Create a test opportunity in the given pipeline/stage for " +
      "a contact (name prefixed 'pathways-writetest'). Confirms the opportunity " +
      "create body shape, monetaryValue handling, and stage assignment.",
    inputSchema: {
      type: "object",
      properties: {
        pipelineId: { type: "string" },
        stageId: { type: "string" },
        contactId: { type: "string" },
        monetaryValue: { type: "number", description: "Decimal dollars (NOT cents)." },
      },
      required: ["pipelineId", "stageId", "contactId"],
    },
    run: async (a) => {
      const payload = {
        locationId: LOCATION_ID,
        pipelineId: a.pipelineId,
        pipelineStageId: a.stageId,
        contactId: a.contactId,
        name: `${TEST_MARKER} opportunity`,
        status: "open",
        monetaryValue: a.monetaryValue ?? 123.45,
      };
      // VERIFY: POST /opportunities/ body shape + id/stage field names in response.
      return ghlWrite("POST", "/opportunities/", payload);
    },
  },
  {
    name: "ghl_probe_readback",
    description:
      "READ-BACK. GET a contact or opportunity by id to confirm what was " +
      "persisted (field names/values). type: 'contact' | 'opportunity'.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["contact", "opportunity"] },
        id: { type: "string" },
      },
      required: ["type", "id"],
    },
    run: (a) =>
      a.type === "contact"
        ? ghlGet(`/contacts/${encodeURIComponent(a.id)}`)
        : ghlGet(`/opportunities/${encodeURIComponent(a.id)}`),
  },
];

const toolByName = new Map(TOOLS.map((t) => [t.name, t]));

// ─────────────────────────────── Server ───────────────────────────────
const gateErr = sandboxGateError();
const server = new Server(
  { name: "pathways-ghl-mcp-writeprobe", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Even tool listing is suppressed when the sandbox gate fails, so a
  // misconfigured server exposes nothing callable.
  if (gateErr) return { tools: [] };
  return { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (gateErr) {
    return { isError: true, content: [{ type: "text", text: `Sandbox gate closed: ${gateErr}` }] };
  }
  const tool = toolByName.get(req.params.name);
  if (!tool) return { isError: true, content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }] };
  try {
    const result = await tool.run(req.params.arguments ?? {});
    return { isError: Boolean(result && result.ok === false), ...toToolResult(result) };
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: `Tool error: ${err?.message ?? String(err)}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(
  gateErr
    ? `[pathways-ghl-mcp-writeprobe] SANDBOX GATE CLOSED — ${gateErr}\n`
    : `[pathways-ghl-mcp-writeprobe] ready (SANDBOX WRITES ENABLED for ${LOCATION_ID})\n`,
);
