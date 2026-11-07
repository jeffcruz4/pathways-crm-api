/**
 * Unit tests for the GoHighLevel adapter — the parts that DON'T require a live
 * GHL call (status mapping, keyword classification, capabilities, inbound/status
 * event normalization, and the fail-closed webhook guard).
 *
 * Uses Node's built-in test runner (node:test) — no new dependency. Run with:
 *   npx tsx --test src/comms/gohighlevelAdapter.test.ts
 *
 * The live send/validate paths are intentionally NOT tested here — they are
 * fenced and VERIFY-ON-SANDBOX (OPEN-6/OPEN-12).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GoHighLevelAdapter,
  mapGhlStatus,
  classifyKeyword,
  validateWebhookSignature,
} from "./gohighlevelAdapter.js";
import crypto from "node:crypto";

test("mapGhlStatus maps provider statuses to the neutral vocabulary", () => {
  assert.equal(mapGhlStatus("queued"), "queued");
  assert.equal(mapGhlStatus("pending"), "queued");
  assert.equal(mapGhlStatus("sent"), "sent");
  assert.equal(mapGhlStatus("delivered"), "delivered");
  assert.equal(mapGhlStatus("undelivered"), "undelivered");
  assert.equal(mapGhlStatus("failed"), "failed");
  assert.equal(mapGhlStatus("error"), "failed");
  assert.equal(mapGhlStatus("received"), "received");
  assert.equal(mapGhlStatus("INBOUND"), "received"); // case-insensitive
  assert.equal(mapGhlStatus("something-unknown"), "queued"); // safe default
});

test("classifyKeyword recognizes opt-out/opt-in/help", () => {
  assert.equal(classifyKeyword("STOP"), "stop");
  assert.equal(classifyKeyword(" unsubscribe "), "stop");
  assert.equal(classifyKeyword("start"), "start");
  assert.equal(classifyKeyword("YES"), "start");
  assert.equal(classifyKeyword("help"), "help");
  assert.equal(classifyKeyword("hello there"), null);
});

test("getCapabilities reports two-way SMS with delivery callbacks", () => {
  const caps = new GoHighLevelAdapter().getCapabilities();
  assert.equal(caps.supportsInbound, true);
  assert.equal(caps.supportsOutbound, true);
  assert.equal(caps.supportsText, true);
  assert.equal(caps.supportsDeliveryCallbacks, true);
  assert.equal(caps.requiresCustomerInitiatedConversation, false);
  assert.equal(caps.messagingWindowHours, null);
});

test("provider/channel identity", () => {
  const a = new GoHighLevelAdapter();
  assert.equal(a.provider, "gohighlevel");
  assert.equal(a.channel, "sms");
});

test("normalizeInboundWebhook: delivery status callback", () => {
  const events = new GoHighLevelAdapter().normalizeInboundWebhook({
    url: "",
    headers: {},
    params: { messageId: "M1", status: "delivered" },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "status_update");
  if (events[0].kind === "status_update") {
    assert.equal(events[0].providerMessageId, "M1");
    assert.equal(events[0].providerStatus, "delivered");
  }
});

test("normalizeInboundWebhook: inbound message (no keyword)", () => {
  const events = new GoHighLevelAdapter().normalizeInboundWebhook({
    url: "",
    headers: {},
    params: { messageId: "M2", from: "+15555550100", to: "+15555550199", body: "hi there", conversationId: "C1" },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "inbound_message");
  if (events[0].kind === "inbound_message") {
    assert.equal(events[0].from, "+15555550100");
    assert.equal(events[0].body, "hi there");
    assert.equal(events[0].providerConversationId, "C1");
  }
});

test("normalizeInboundWebhook: STOP emits opt_keyword + inbound_message", () => {
  const events = new GoHighLevelAdapter().normalizeInboundWebhook({
    url: "",
    headers: {},
    params: { messageId: "M3", from: "+15555550100", body: "STOP" },
  });
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, "opt_keyword");
  if (events[0].kind === "opt_keyword") {
    assert.equal(events[0].keyword, "stop");
    assert.equal(events[0].from, "+15555550100");
  }
  assert.equal(events[1].kind, "inbound_message");
});

test("validateWebhookSignature FAILS CLOSED without secret or signature", () => {
  assert.equal(validateWebhookSignature(undefined, "sig", "body"), false);
  assert.equal(validateWebhookSignature("secret", undefined, "body"), false);
  assert.equal(validateWebhookSignature(undefined, undefined, "body"), false);
});

test("validateWebhookSignature accepts a correct HMAC-SHA256 (placeholder scheme)", () => {
  const secret = "test-secret";
  const body = '{"a":1}';
  const sig = crypto.createHmac("sha256", secret).update(body, "utf-8").digest("hex");
  assert.equal(validateWebhookSignature(secret, sig, body), true);
  assert.equal(validateWebhookSignature(secret, "deadbeef", body), false); // wrong sig
});

test("validateWebhook via the adapter fails closed when no secret is present", () => {
  const ok = new GoHighLevelAdapter().validateWebhook({
    url: "",
    headers: { "x-ghl-signature": "whatever" },
    params: { __rawBody: "{}" },
    // no credential (secret) → must reject
  });
  assert.equal(ok, false);
});

test("sendMessage is fenced off unless GHL_SEND_ENABLED=true", async () => {
  const prev = process.env.GHL_SEND_ENABLED;
  delete process.env.GHL_SEND_ENABLED;
  try {
    const result = await new GoHighLevelAdapter().sendMessage({
      connection: {
        provider: "gohighlevel",
        channel: "sms",
        accountId: "LOC",
        credential: "tok",
        senderResourceId: "contact123",
        senderAddress: null,
        statusCallbackUrl: null,
      },
      to: "+15555550100",
      body: "hello",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.providerErrorCode, "ghl_send_disabled");
  } finally {
    if (prev !== undefined) process.env.GHL_SEND_ENABLED = prev;
  }
});
