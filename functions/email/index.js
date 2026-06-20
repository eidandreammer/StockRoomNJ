import admin from 'firebase-admin';
import { getPostmarkClient } from './client.js';
import { templates } from './templates.js';

// Map of categories to user notification preference keys
const CATEGORY_PREFERENCES = {
  account: null,      // Critical - always send
  security: null,     // Critical - always send
  bidding: 'biddingUpdates',
  checkout: 'biddingUpdates',
  orders: 'purchaseReceipts',
  shipping: 'purchaseReceipts',
};

/**
 * Checks if a user has opted out of receiving emails of a specific preference key.
 * Default is true if user document does not exist, or preferences aren't set.
 *
 * @param {string} userId The Firestore user ID.
 * @param {string|null} preferenceKey Preference key to check (e.g. 'biddingUpdates').
 * @returns {Promise<boolean>} Resolves to true if allowed, false if opted out.
 */
async function isNotificationAllowed(userId, preferenceKey) {
  if (!userId || userId.startsWith('guest:')) {
    return true; // Guests always allowed (we handle guest checkouts)
  }
  if (!preferenceKey) {
    return true; // Critical account/security category always allowed
  }

  try {
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      if (data && data.notifications && data.notifications[preferenceKey] !== undefined) {
        return Boolean(data.notifications[preferenceKey]);
      }
    }
  } catch (err) {
    console.error(`[Email Preferences] Error checking settings for user ${userId}:`, err);
  }
  return true; // Safe default
}

/**
 * Sends an email directly via Postmark (or mock sandbox) and writes a log to the email_logs collection.
 *
 * @param {object} params
 * @param {string|string[]} params.to Recipient email address(es).
 * @param {string} params.category Category of the email (e.g. 'account', 'bidding', 'orders', etc).
 * @param {string} params.templateName Name of the template in templates.js.
 * @param {object} params.data Data payload to inject into the template.
 * @param {object} [params.metadata] Related IDs for the log (userId, orderId, bidId, productId).
 * @returns {Promise<string|null>} Resolves to the email_logs document ID, or null if skipped.
 */
export async function sendEmail({ to, category, templateName, data, metadata = {} }) {
  const db = admin.firestore();
  const normalizedTo = Array.isArray(to) ? to : [to];
  const recipients = normalizedTo
    .map((val) => String(val || '').trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    console.warn(`[Email Send] Skipping email dispatch for template "${templateName}" because no recipients were specified.`);
    return null;
  }

  const preferenceKey = CATEGORY_PREFERENCES[category] !== undefined ? CATEGORY_PREFERENCES[category] : null;
  const userId = metadata.userId || data.userId || null;

  // 1. Check user notification preferences
  const allowed = await isNotificationAllowed(userId, preferenceKey);
  if (!allowed) {
    console.log(`[Email Skipped] User ${userId || 'unknown'} opted out of "${category}" emails (preference key: ${preferenceKey}).`);
    
    // Write skipped audit log
    const logRef = await db.collection('email_logs').add({
      recipient: recipients,
      subject: templates[templateName] ? templates[templateName](data).subject : `Notification: ${category}`,
      category,
      provider: 'postmark',
      providerMessageId: null,
      status: 'skipped',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      sentAt: null,
      userId,
      orderId: metadata.orderId || null,
      bidId: metadata.bidId || null,
      productId: metadata.productId || null,
    });
    return logRef.id;
  }

  // 2. Resolve template
  const templateGen = templates[templateName];
  if (!templateGen) {
    throw new Error(`[Email Error] Template generator "${templateName}" not found.`);
  }

  const { subject, html, text } = templateGen(data);
  const fromEmail = (process.env.EMAIL_FROM || process.env.FIREBASE_EMAIL_FROM || 'support@stockroomnj.com').trim();
  const replyToEmail = (process.env.EMAIL_REPLY_TO || fromEmail).trim();

  const logPayload = {
    recipient: recipients,
    subject,
    category,
    provider: 'postmark',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    userId,
    orderId: metadata.orderId || null,
    bidId: metadata.bidId || null,
    productId: metadata.productId || null,
  };

  try {
    const client = getPostmarkClient();
    
    if (!client) {
      // 3. Local/Emulator Sandbox Mode
      console.log('--- [POSTMARK SANDBOX EMAIL DISPATCH] ---');
      console.log(`To:       ${recipients.join(', ')}`);
      console.log(`From:     ${fromEmail}`);
      console.log(`Reply-To: ${replyToEmail}`);
      console.log(`Subject:  ${subject}`);
      console.log(`Category: ${category}`);
      console.log(`Text:     ${text}`);
      console.log('-----------------------------------------');

      const mockMessageId = `mock-postmark-id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const logRef = await db.collection('email_logs').add({
        ...logPayload,
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        providerMessageId: mockMessageId,
      });

      return logRef.id;
    }

    // 4. Send via official postmark API
    const response = await client.sendEmail({
      From: fromEmail,
      To: recipients.join(', '),
      Subject: subject,
      HtmlBody: html,
      TextBody: text,
      ReplyTo: replyToEmail,
      MessageStream: 'outbound',
    });

    const logRef = await db.collection('email_logs').add({
      ...logPayload,
      status: 'sent',
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      providerMessageId: response.MessageID || response.MessageId || 'unknown-postmark-id',
    });

    console.log(`[Email Sent] Email "${subject}" sent to ${recipients.join(', ')} (Log: email_logs/${logRef.id})`);
    return logRef.id;

  } catch (error) {
    console.error(`[Email Failed] Failed to send email "${subject}" to ${recipients.join(', ')}:`, error);
    
    // Log failure
    await db.collection('email_logs').add({
      ...logPayload,
      status: 'failed',
      sentAt: null,
      errorMessage: error.message || 'Unknown Postmark error',
    });

    // Re-throw so caller can handle appropriately
    throw error;
  }
}
