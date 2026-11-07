/**
 * ChannelRouter — selects the provider adapter for a channel connection and
 * resolves its sending context (credentials + sender config).
 *
 * The communications core asks the router for an adapter + resolved connection;
 * it never imports a provider module directly. Adding a channel means
 * registering a new adapter here (keyed by provider+channel).
 */
import type { AppConfig } from "../config.js";
import type { IntegrationConnection, CommProvider, CommChannel } from "../domain/comms.js";
import type { CommunicationProviderAdapter, ResolvedConnection } from "./adapter.js";
import { TwilioAdapter } from "./twilioAdapter.js";

type AdapterKey = `${CommProvider}:${CommChannel}`;

export class ChannelRouter {
  private readonly adapters = new Map<AdapterKey, CommunicationProviderAdapter>();

  constructor(private readonly config: AppConfig) {
    const twilio = new TwilioAdapter();
    this.adapters.set(`${twilio.provider}:${twilio.channel}`, twilio);
  }

  /** The adapter for a provider+channel pair, or undefined if unsupported. */
  adapterFor(provider: CommProvider, channel: CommChannel): CommunicationProviderAdapter | undefined {
    return this.adapters.get(`${provider}:${channel}`);
  }

  /**
   * Resolve a stored connection into an adapter + ready-to-send context, or a
   * reason string when it isn't usable. Credential resolution lives here (not
   * in the core) so provider secret handling stays behind the router.
   */
  resolve(
    connection: IntegrationConnection | undefined,
  ):
    | { ok: true; adapter: CommunicationProviderAdapter; resolved: ResolvedConnection }
    | { ok: false; reason: string } {
    if (!connection) return { ok: false, reason: "Integration is not connected." };
    if (connection.status === "disconnected") return { ok: false, reason: "Integration is disconnected." };

    const adapter = this.adapterFor(connection.provider, connection.channel);
    if (!adapter) {
      return { ok: false, reason: `No adapter for ${connection.provider}/${connection.channel}.` };
    }
    if (!connection.accountSid) return { ok: false, reason: "Provider account is not configured." };

    const credential = this.resolveCredential(connection.credentialRef);
    if (!credential) return { ok: false, reason: "Provider credential is not available." };

    if (!connection.messagingServiceSid && !connection.fromNumber) {
      return { ok: false, reason: "No Messaging Service SID or sender address configured." };
    }

    const resolved: ResolvedConnection = {
      provider: connection.provider,
      channel: connection.channel,
      accountId: connection.accountSid,
      credential,
      senderResourceId: connection.messagingServiceSid,
      senderAddress: connection.fromNumber,
      statusCallbackUrl: this.statusCallbackUrl(connection.provider),
    };
    return { ok: true, adapter, resolved };
  }

  /** Resolve the raw secret from the stored reference (env-backed for now). */
  resolveCredential(credentialRef: string | null | undefined): string | undefined {
    if (!credentialRef) return undefined;
    if (credentialRef.startsWith("env:")) {
      const name = credentialRef.slice(4);
      if (name === "TWILIO_AUTH_TOKEN") return this.config.twilioAuthToken;
      return process.env[name];
    }
    // Future: secret-manager://arn resolution for multi-tenant onboarding.
    return undefined;
  }

  statusCallbackUrl(provider: CommProvider): string | null {
    if (!this.config.publicBaseUrl) return null;
    const base = this.config.publicBaseUrl.replace(/\/$/, "");
    // Provider-scoped callback path keeps multi-provider webhooks separable.
    return `${base}/api/v1/webhooks/${provider}/status`;
  }
}
