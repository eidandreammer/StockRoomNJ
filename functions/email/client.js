import postmark from 'postmark';

let client = null;

/**
 * Lazily retrieves the Postmark ServerClient.
 * In a local/emulator environment, if the token is missing, it will return null
 * to enable sandbox/mock mode instead of crashing.
 *
 * @returns {postmark.ServerClient|null} Postmark client, or null if running in sandbox/mock mode.
 */
export function getPostmarkClient() {
  if (client) {
    return client;
  }

  const token = (process.env.POSTMARK_SERVER_TOKEN || '').trim();
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'test';

  if (!token) {
    if (isEmulator) {
      console.warn('[Postmark Sandbox] POSTMARK_SERVER_TOKEN is not configured. Running in sandbox log mode.');
      return null;
    }
    throw new Error('Production email dispatch failed: POSTMARK_SERVER_TOKEN is not configured.');
  }

  // Handle case where Postmark might use default export or destructuring
  const ClientClass = postmark.ServerClient || postmark.default?.ServerClient;
  if (!ClientClass) {
    throw new Error('Failed to resolve ServerClient constructor from postmark library.');
  }

  client = new ClientClass(token);
  return client;
}
