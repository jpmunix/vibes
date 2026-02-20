export const AI_STREAMING_ERROR_MESSAGE_PREFIX =
  "Error de la IA: ";

/** Prefix used to persist error messages inside the assistant message content in the DB.
 *  On reload, ChatMessage detects this prefix and renders the error bubble. */
export const PERSISTED_ERROR_PREFIX = "$$DYAD_ERROR$$";
