import type { FastifyReply } from "fastify";
import type { ZodSchema } from "zod";

/**
 * Parse a request body against a Zod schema. On success returns the typed data;
 * on failure sends a 400 with the flattened issues and returns undefined (the
 * caller should early-return when the result is undefined).
 */
export function parseBody<T>(
  schema: ZodSchema<T>,
  body: unknown,
  reply: FastifyReply,
): T | undefined {
  const result = schema.safeParse(body);
  if (!result.success) {
    reply.code(400).send({
      error: "invalid_request",
      message: "Request body failed validation",
      issues: result.error.flatten(),
    });
    return undefined;
  }
  return result.data;
}
