/**
 * Provider-neutral communication adapter contract.
 *
 * Per the architecture direction (ADR-003 / §5), the shared communications core
 * must NOT call provider SDKs/APIs directly — it calls this interface. Each
 * channel (SMS via Twilio today; Facebook/Instagram/WhatsApp/email later) ships
 * an adapter implementing this contract, and a ChannelRouter selects the right
 * adapter for a given channel connection.
 *
 * Keeping the surface small and provider-neutral means a new channel is added
 * by writing a new adapter + configuration, without changing the Conversation,
 * Message, consent, or inbox logic.
 */
import type { CommChannel, CommProvider, ConnectionStatus } from "../domain/comms.js";

/** Resolved, ready-to-use sending context for one channel connection. */
export type ResolvedConnection = {
  provider: CommProvider;
  channel: CommChannel;
  /** Provider account identifier (e.g. Twilio Account SID). */
  accountId: string;
  /** Secret credential value, resolved from the stored reference. */
  credential: string;
  /** Preferred sender resource (e.g. Messaging Service SID). */
  senderResourceId: string | null;
  /** Fallback sender address (e.g. from-number). */
  senderAddress: string | null;
  /** Absolute URL the provider should POST delivery status callbacks to. */
  statusCallbackUrl: string | null;
};

/**
 * What a channel can do. The policy service consults this before dispatch so
 * channel-specific rules (e.g. Facebook's customer-initiated, 24h response
 * window) are enforced centrally rather than hidden in the adapter. Values must
 * reflect verified provider behavior, not assumptions.
 */
export type ChannelCapabilities = {
  supportsInbound: boolean;
  supportsOutbound: boolean;
  supportsText: boolean;
  supportsMedia: boolean;
  supportsDeliveryCallbacks: boolean;
  supportsReadReceipts: boolean;
  /** True when the business may only reply after the customer initiates. */
  requiresCustomerInitiatedConversation: boolean;
  /** Reply window in hours (null = no window restriction, e.g. SMS). */
  messagingWindowHours: number | null;
  maximumMessageSize: number | null;
};

export type OutboundMessageCommand = {
  connection: ResolvedConnection;
  to: string;
  body: string;
};

export type ProviderSendResult =
  | { ok: true; providerMessageId: string; providerStatus: string }
  | { ok: false; providerErrorCode: string | null; message: string };

export type ConnectionValidationResult = { ok: boolean; message: string };

/** A provider webhook, decoupled from any HTTP framework. */
export type ProviderWebhookRequest = {
  /** Absolute, externally visible URL the provider signed against. */
  url: string;
  headers: Record<string, string | undefined>;
  /** Parsed form/JSON params. */
  params: Record<string, string>;
  credential?: string;
};

/** The kind of inbound event, normalized away from provider vocabulary. */
export type NormalizedCommunicationEvent =
  | {
      kind: "inbound_message";
      providerMessageId: string | null;
      from: string | null;
      to: string | null;
      body: string;
      /** Provider thread id when the channel exposes one (social channels). */
      providerConversationId?: string | null;
      occurredAt: Date;
    }
  | {
      kind: "status_update";
      providerMessageId: string;
      providerStatus: string;
      errorCode: string | null;
    }
  | {
      kind: "opt_keyword";
      keyword: "stop" | "start" | "help";
      from: string | null;
      providerMessageId: string | null;
    };

export interface CommunicationProviderAdapter {
  readonly provider: CommProvider;
  readonly channel: CommChannel;

  validateConnection(connection: ResolvedConnection): Promise<ConnectionValidationResult>;
  getCapabilities(): ChannelCapabilities;
  sendMessage(command: OutboundMessageCommand): Promise<ProviderSendResult>;
  /** Verify a webhook's authenticity (signature) before trusting it. */
  validateWebhook(request: ProviderWebhookRequest): boolean;
  /** Turn a validated provider webhook into zero or more domain events. */
  normalizeInboundWebhook(request: ProviderWebhookRequest): NormalizedCommunicationEvent[];
}

/** Map a provider connection status string onto the shared enum (default). */
export function defaultConnectionStatus(ok: boolean): ConnectionStatus {
  return ok ? "connected" : "action_required";
}
