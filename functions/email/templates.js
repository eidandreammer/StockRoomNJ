export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatMoney(value) {
  const num = Number(value);
  return isNaN(num) ? '$0.00' : `$${num.toFixed(2)}`;
}

export function safeUrl(value, fallback = '#') {
  if (!value || typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

export function formatAddressHtml(address) {
  if (!address) return '';
  const parts = [
    address.fullName || address.full_name || '',
    address.street || '',
    `${address.city || ''}${address.city && address.state ? ', ' : ''}${address.state || ''} ${address.zip || ''}`.trim(),
    address.country || 'US'
  ].filter((p) => p.trim() !== '');
  return parts.map(escapeHtml).join('<br/>');
}

export function formatAddressPlain(address) {
  if (!address) return '';
  const parts = [
    address.fullName || address.full_name || '',
    address.street || '',
    `${address.city || ''}${address.city && address.state ? ', ' : ''}${address.state || ''} ${address.zip || ''}`.trim(),
    address.country || 'US'
  ].filter((p) => p.trim() !== '');
  return parts.join('\n');
}

function assertCritical(condition, message) {
  const isDevOrTest = process.env.NODE_ENV === 'test' || process.env.FUNCTIONS_EMULATOR === 'true' || process.env.VITEST === 'true';
  if (!condition && isDevOrTest) {
    throw new Error(`[Email Template Error] ${message}`);
  }
}

/**
 * Standard branded layout wrapping all HTML transactional emails.
 *
 * @param {string} title The title of the email (used in <title> metadata).
 * @param {string} contentHtml The inner HTML content of the email body.
 * @returns {string} Fully rendered HTML string.
 */
function renderLayout(title, contentHtml) {
  const escapedTitle = escapeHtml(title);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Outfit', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #334155;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03), 0 1px 3px rgba(15, 23, 42, 0.02);">
          <!-- Header -->
          <tr>
            <td align="center" style="background-color: #ffffff; padding: 32px 30px; text-align: center; border-bottom: 1px solid #f1f5f9;">
              <a href="https://stockroomnj.com" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="https://stockroomnj.com/segundo%20logo%20the%20stock%20room.png" alt="The Stock Room" style="height: 52px; width: auto; max-width: 100%; display: block; border: 0; outline: none; margin: 0 auto;" />
              </a>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 40px 32px; line-height: 1.6; font-size: 16px; color: #334155;">
              ${contentHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 32px; border-top: 1px solid #f1f5f9; text-align: center;">
              <div style="font-size: 13px; color: #64748b; line-height: 1.6;">
                <p style="margin: 0 0 4px 0; font-weight: 700; color: #334155; font-size: 14px;">The Stock Room</p>
                <p style="margin: 0 0 12px 0; color: #64748b;">66 Union Blvd, Wallington, NJ 07057</p>
                <p style="margin: 0 0 16px 0; color: #475569; font-weight: 500;">
                  <span style="white-space: nowrap;">Phone: <a href="tel:+16094595069" style="color: #0068b1; text-decoration: none;">(609) 459-5069</a></span>
                  <span style="margin: 0 8px; color: #cbd5e1;">|</span>
                  <span style="white-space: nowrap;">Email: <a href="mailto:admin@stockroomnj.com" style="color: #0068b1; text-decoration: none;">admin@stockroomnj.com</a></span>
                </p>
                <div style="border-top: 1px dashed #e2e8f0; padding-top: 16px; margin-top: 8px;">
                  <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                    You are receiving this transactional email regarding your account or order at The Stock Room.<br/>
                    <a href="https://stockroomnj.com" style="color: #64748b; text-decoration: underline;">Visit Website</a> &nbsp;&bull;&nbsp; 
                    <a href="https://stockroomnj.com/legal" style="color: #64748b; text-decoration: underline;">Terms & Privacy</a>
                  </p>
                </div>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Registry of email template generators.
 * Each generator returns { subject, html, text }.
 */
export const templates = {
  // Category: account
  welcome: (data) => {
    const name = data.name || 'Collector';
    assertCritical(data.name, 'Name is required for welcome email.');

    const title = 'Welcome to StockRoom NJ!';
    const htmlContent = `
      <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Welcome, ${escapeHtml(name)}!</h2>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">Thank you for creating an account with The Stock Room! Your collection registry, addresses, and email settings are now active.</p>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">With your new account, you can:</p>
      <ul style="padding-left: 20px; margin: 0 0 28px 0; color: #475569; line-height: 1.6;">
        <li style="margin-bottom: 10px;">Place secure bids on our rare collectible auctions.</li>
        <li style="margin-bottom: 10px;">Store shipping and billing info for faster, seamless checkouts.</li>
        <li style="margin-bottom: 10px;">Keep track of pop-up drops, local tournaments, and events.</li>
      </ul>
      <div style="text-align: center; margin: 32px 0 16px 0;">
        <a href="https://stockroomnj.com/shop" style="background-color: #0068b1; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(0, 104, 177, 0.15), 0 2px 4px -1px rgba(0, 104, 177, 0.15);">Explore the Shop</a>
      </div>
    `;
    const text = `Hi ${name},\n\nWelcome to StockRoom NJ! Thank you for creating an account with us. You can now place bids and check out faster.\n\nExplore the Shop: https://stockroomnj.com/shop`;
    return {
      subject: title,
      html: renderLayout(title, htmlContent),
      text,
    };
  },

  // Category: bidding
  bid_received: (data) => {
    const customerName = data.customerName || 'Collector';
    const productName = data.productName || 'Collectible Item';
    const amount = Number(data.amount) || 0;

    assertCritical(data.productName, 'productName is required for bid_received.');
    assertCritical(data.amount !== undefined, 'amount is required for bid_received.');

    const title = `Bid Received: ${productName}`;
    const htmlContent = `
      <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Bid Received</h2>
      <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi ${escapeHtml(customerName)},</p>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">We've received your bid of <strong style="color: #0068b1; font-size: 18px;">${formatMoney(amount)}</strong> for <strong style="color: #0f172a;">${escapeHtml(productName)}</strong>.</p>
      <p style="margin: 0 0 24px 0; line-height: 1.6; color: #475569;">Your bid is currently pending admin approval. We will notify you immediately once it is approved or if you are outbid.</p>
      <div style="text-align: center; margin: 32px 0 16px 0;">
        <a href="https://stockroomnj.com/shop" style="background-color: #0068b1; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(0, 104, 177, 0.15), 0 2px 4px -1px rgba(0, 104, 177, 0.15);">View Auction Page</a>
      </div>
    `;
    const text = `Hi ${customerName},\n\nWe've received your bid of ${formatMoney(amount)} for ${productName}. It is currently pending admin approval.\n\nView Auction Page: https://stockroomnj.com/shop`;
    return {
      subject: title,
      html: renderLayout(title, htmlContent),
      text,
    };
  },

  // Category: bidding
  outbid: (data) => {
    const customerName = data.customerName || 'Collector';
    const productName = data.productName || 'Collectible Item';
    const currentBidAmount = Number(data.currentBidAmount) || 0;

    assertCritical(data.productName, 'productName is required for outbid.');
    assertCritical(data.currentBidAmount !== undefined, 'currentBidAmount is required for outbid.');

    const title = `You've been outbid! ${productName}`;
    const htmlContent = `
      <h2 style="color: #e11d48; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">You've Been Outbid</h2>
      <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi ${escapeHtml(customerName)},</p>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">Another bidder placed a higher bid on <strong style="color: #0f172a;">${escapeHtml(productName)}</strong>.</p>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">The new current bid is now <strong style="color: #e11d48; font-size: 18px;">${formatMoney(currentBidAmount)}</strong>.</p>
      <p style="margin: 0 0 24px 0; line-height: 1.6; color: #475569;">Don't miss out on this item! Head back to the shop to increase your bid and stay in the running.</p>
      <div style="text-align: center; margin: 32px 0 16px 0;">
        <a href="https://stockroomnj.com/shop" style="background-color: #e11d48; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(225, 29, 72, 0.15), 0 2px 4px -1px rgba(225, 29, 72, 0.15);">Bid Again Now</a>
      </div>
    `;
    const text = `Hi ${customerName},\n\nAnother bidder placed a higher bid on ${productName}. The new current bid is ${formatMoney(currentBidAmount)}.\n\nBid Again Now: https://stockroomnj.com/shop`;
    return {
      subject: title,
      html: renderLayout(title, htmlContent),
      text,
    };
  },

  // Category: checkout
  bid_approved_checkout: (data) => {
    const customerName = data.customerName || 'Collector';
    const productName = data.productName || 'Collectible Item';
    const amount = Number(data.amount) || 0;
    const checkoutUrl = data.checkoutUrl || '';
    const stripeCheckoutUrl = data.stripeCheckoutUrl || checkoutUrl;
    const paymentDueAt = data.paymentDueAt || 'within 48 hours';

    assertCritical(data.productName, 'productName is required for bid_approved_checkout.');
    assertCritical(data.amount !== undefined, 'amount is required for bid_approved_checkout.');
    assertCritical(data.checkoutUrl, 'checkoutUrl is required for bid_approved_checkout.');

    const validCheckoutUrl = safeUrl(checkoutUrl);
    const validStripeUrl = safeUrl(stripeCheckoutUrl);

    const title = `Congratulations! Your bid was approved for ${productName}`;
    const htmlContent = `
      <h2 style="color: #16a34a; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Congratulations! You Won</h2>
      <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi ${escapeHtml(customerName)},</p>
      <p style="margin: 0 0 20px 0; line-height: 1.6; color: #475569;">Great news! The administrator has approved your winning bid of <strong style="color: #16a34a; font-size: 20px;">${formatMoney(amount)}</strong> for <strong style="color: #0f172a;">${escapeHtml(productName)}</strong>.</p>
      
      <div style="background-color: #fffbeb; border: 1px solid #fef3c7; padding: 16px; border-radius: 8px; margin-bottom: 24px; font-size: 14px; color: #b45309; line-height: 1.5;">
        <p style="margin: 0 0 8px 0; font-weight: 700; color: #d97706; font-size: 15px; display: flex; alignItems: center; gap: 6px;">⏰ Complete payment within 48 hours</p>
        <p style="margin: 0 0 8px 0;">Payment is due by: <strong>${escapeHtml(paymentDueAt)}</strong>.</p>
        <p style="margin: 0 0 8px 0; font-weight: 600;">Your item is not yours until payment is complete.</p>
        <p style="margin: 0 0 8px 0; font-style: italic;">If the Stripe checkout page expires, reopen your payment link or contact support.</p>
        <p style="margin: 0; font-size: 12px; color: #d97706;">The 48-hour deadline does not automatically extend when a checkout link is refreshed.</p>
      </div>

      <p style="margin: 0 0 24px 0; line-height: 1.6; color: #475569;">To choose your shipping or pickup preference and complete your secure payment, please click the button below:</p>
      <div style="text-align: center; margin: 36px 0 20px 0;">
        <a href="${validCheckoutUrl}" style="background-color: #16a34a; color: #ffffff; padding: 14px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(22, 163, 74, 0.15), 0 2px 4px -1px rgba(22, 163, 74, 0.15);">Choose Fulfillment & Complete Payment</a>
      </div>
      <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 16px; line-height: 1.5;">
        Or copy/paste the direct Stripe payment URL into your browser:<br/>
        <a href="${validStripeUrl}" style="color: #0068b1; word-break: break-all; text-decoration: none;">${escapeHtml(validStripeUrl)}</a>
      </p>
    `;
    const text = `Hi ${customerName},\n\nGreat news! Your bid of ${formatMoney(amount)} for ${productName} has been approved.\n\nComplete payment within 48 hours.\nPayment is due by: ${paymentDueAt}.\nYour item is not yours until payment is complete.\nIf the Stripe checkout page expires, reopen your payment link or contact support.\nThe 48-hour deadline does not automatically extend when a checkout link is refreshed.\n\nChoose fulfillment and complete secure payment: ${checkoutUrl}\n\nDirect Stripe link: ${stripeCheckoutUrl}\n\nThank you for bidding with us!`;
    return {
      subject: title,
      html: renderLayout(title, htmlContent),
      text,
    };
  },

  // Category: orders
  order_confirmed: (data) => {
    const orderId = data.orderId || '';
    const customerName = data.customerName || 'Collector';
    const productName = data.productName || '';
    const amount = Number(data.amount) || 0;
    const items = data.items || [];
    const fulfillmentMethod = data.fulfillmentMethod || 'shipping';
    const shippingAddress = data.shippingAddress || null;
    const pickupLocation = data.pickupLocation || '66 Union Blvd, Wallington, NJ 07057';
    const pickupInstructions = data.pickupInstructions || '';

    assertCritical(orderId, 'orderId is required for order_confirmed.');
    assertCritical(amount !== undefined, 'amount is required for order_confirmed.');

    const title = `Order Confirmed: ${productName || 'Your Purchase'}`;

    let itemsList = items;
    if (itemsList.length === 0 && productName) {
      itemsList = [{ productName, amount }];
    }

    const itemsHtml = itemsList.map(item => `
      <tr>
        <td style="padding: 14px 0; border-bottom: 1px solid #f1f5f9; font-size: 15px; color: #334155;">${escapeHtml(item.productName || item.productId || 'Collectible Item')}</td>
        <td style="padding: 14px 0; text-align: right; border-bottom: 1px solid #f1f5f9; font-size: 15px; font-weight: 600; color: #0f172a;">${formatMoney(item.amount)}</td>
      </tr>
    `).join('');

    const isPickup = fulfillmentMethod === 'pickup';
    const fulfillmentDetailsHtml = isPickup ? `
      <p style="margin: 0 0 8px 0;"><strong>Method:</strong> In-store Pickup</p>
      <p style="margin: 0 0 8px 0;"><strong>Pickup Location:</strong> ${escapeHtml(pickupLocation)}</p>
      ${pickupInstructions ? `<p style="margin: 0 0 8px 0;"><strong>Instructions:</strong> ${escapeHtml(pickupInstructions)}</p>` : ''}
    ` : `
      <p style="margin: 0 0 8px 0;"><strong>Method:</strong> Shipping</p>
      <p style="margin: 0 0 8px 0;"><strong>Shipping Address:</strong><br/>${formatAddressHtml(shippingAddress)}</p>
    `;

    const fulfillmentDetailsPlain = isPickup ? `Method: In-store Pickup\nPickup Location: ${pickupLocation}\n${pickupInstructions ? 'Instructions: ' + pickupInstructions : ''}` : `Method: Shipping\nShipping Address:\n${formatAddressPlain(shippingAddress)}`;

    const nextStepsHtml = isPickup ? `
      <p style="margin: 0; line-height: 1.6; color: #475569;"><strong>Next Steps:</strong> We will prepare your items and send a confirmation email as soon as they are ready for pickup. Please wait for that email before coming to the store!</p>
    ` : `
      <p style="margin: 0; line-height: 1.6; color: #475569;"><strong>Next Steps:</strong> Your order will be packaged and shipped shortly. We will send you an email with your tracking number as soon as it departs.</p>
    `;

    const nextStepsPlain = isPickup ? `Next Steps: We will prepare your items and send a confirmation email as soon as they are ready for pickup. Please wait for that email before coming to the store!` : `Next Steps: Your order will be packaged and shipped shortly. We will send you an email with your tracking number as soon as it departs.`;

    const htmlContent = `
      <h2 style="color: #16a34a; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Order Confirmed!</h2>
      <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi ${escapeHtml(customerName)},</p>
      <p style="margin: 0 0 8px 0; line-height: 1.6; color: #475569;">Thank you for your purchase! We've received your payment and your order is now confirmed.</p>
      <p style="margin: 0 0 24px 0; line-height: 1.6; color: #475569;"><strong>Order ID:</strong> <span style="font-family: monospace; color: #64748b;">${escapeHtml(orderId)}</span></p>
      
      <h3 style="color: #0f172a; margin-top: 32px; margin-bottom: 16px; font-size: 16px; font-weight: 600; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">Fulfillment details</h3>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin: 0 0 32px 0; font-size: 14px; line-height: 1.6; color: #334155;">
        ${fulfillmentDetailsHtml}
      </div>

      <h3 style="color: #0f172a; margin-top: 32px; margin-bottom: 16px; font-size: 16px; font-weight: 600; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">Order Summary</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
        <thead>
          <tr style="color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase; border-bottom: 1px solid #f1f5f9; text-align: left; letter-spacing: 0.05em;">
            <th style="padding-bottom: 10px; font-weight: 600;">Item</th>
            <th style="padding-bottom: 10px; font-weight: 600; text-align: right;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
          <tr>
            <td style="padding: 20px 0 0 0; font-weight: 600; font-size: 15px; color: #0f172a;">Total Paid</td>
            <td style="padding: 20px 0 0 0; text-align: right; font-weight: 700; font-size: 18px; color: #16a34a;">${formatMoney(amount)}</td>
          </tr>
        </tbody>
      </table>

      ${nextStepsHtml}
    `;
    const text = `Hi ${customerName},\n\nThank you for your purchase! We've confirmed payment for your order.\n\nOrder ID: ${orderId}\n\nFulfillment Details:\n${fulfillmentDetailsPlain}\n\nItems:\n${itemsList.map(item => `- ${item.productName || item.productId || 'Item'}: ${formatMoney(item.amount)}`).join('\n')}\n\nTotal Paid: ${formatMoney(amount)}\n\n${nextStepsPlain}`;
    return {
      subject: title,
      html: renderLayout(title, htmlContent),
      text,
    };
  },

  // Category: shipping
  shipping_or_pickup: (data) => {
    const orderId = data.orderId || '';
    const customerName = data.customerName || 'Collector';
    const productName = data.productName || '';
    const items = data.items || [];
    const method = data.shippingMethod || 'shipping'; // 'shipping' or 'pickup'
    const carrier = data.carrier || '';
    const trackingNumber = data.trackingNumber || '';
    const trackingUrl = trackingNumber && carrier ? `https://www.google.com/search?q=${encodeURIComponent(carrier + ' ' + trackingNumber)}` : '';
    const pickupInstructions = data.pickupInstructions || '';

    assertCritical(orderId, 'orderId is required for shipping_or_pickup.');
    assertCritical(method, 'shippingMethod/method is required for shipping_or_pickup.');

    let itemsList = items;
    if (itemsList.length === 0 && productName) {
      itemsList = [{ productName }];
    }

    const itemsTextList = itemsList.map((item) => item.productName || item.productId || 'Item').filter(Boolean).join(', ');

    const isPickup = method === 'pickup';
    const title = isPickup ? `Pickup Update: Your order ${orderId} is ready!` : `Shipping Update: Your order ${orderId} has shipped!`;

    let bodyHtml;
    let text;

    if (isPickup) {
      bodyHtml = `
        <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Ready for Pickup!</h2>
        <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi ${escapeHtml(customerName)},</p>
        <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">Your order of <strong style="color: #0f172a;">${escapeHtml(itemsTextList)}</strong> is now ready for in-store pickup at The Stock Room.</p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin: 24px 0; font-size: 14px; line-height: 1.6; color: #334155;">
          <p style="margin: 0 0 12px 0;"><strong style="color: #0f172a; font-size: 15px;">Store Address:</strong><br/>66 Union Blvd, Wallington, NJ 07057</p>
          <p style="margin: 0 0 12px 0;"><strong style="color: #0f172a; font-size: 15px;">Instructions:</strong><br/>${escapeHtml(pickupInstructions || 'Please bring a valid ID and order confirmation email.')}</p>
          <p style="margin: 0;"><strong style="color: #0f172a; font-size: 15px;">Order ID:</strong> <span style="font-family: monospace; color: #64748b;">${escapeHtml(orderId)}</span></p>
        </div>
      `;
      text = `Hi ${customerName},\n\nYour order of ${itemsTextList} (Order ID: ${orderId}) is now ready for in-store pickup at The Stock Room (66 Union Blvd, Wallington, NJ 07057).\n\nInstructions: ${pickupInstructions || 'Please bring a valid ID.'}`;
    } else {
      const validTrackingUrl = safeUrl(trackingUrl);
      bodyHtml = `
        <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Your Order is Shipped!</h2>
        <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi ${escapeHtml(customerName)},</p>
        <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">Great news! Your order of <strong style="color: #0f172a;">${escapeHtml(itemsTextList)}</strong> has been shipped.</p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin: 24px 0; font-size: 14px; line-height: 1.6; color: #334155;">
          <p style="margin: 0 0 8px 0;"><strong style="color: #0f172a; font-size: 15px;">Carrier:</strong> ${escapeHtml(carrier || 'Standard Courier')}</p>
          <p style="margin: 0 0 8px 0;"><strong style="color: #0f172a; font-size: 15px;">Tracking Number:</strong> <span style="font-family: monospace; color: #0068b1; font-weight: 600;">${escapeHtml(trackingNumber || 'N/A')}</span></p>
          <p style="margin: 0;"><strong style="color: #0f172a; font-size: 15px;">Order ID:</strong> <span style="font-family: monospace; color: #64748b;">${escapeHtml(orderId)}</span></p>
        </div>
        ${validTrackingUrl && validTrackingUrl !== '#' ? `
        <div style="text-align: center; margin: 32px 0 16px 0;">
          <a href="${validTrackingUrl}" style="background-color: #0068b1; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(0, 104, 177, 0.15), 0 2px 4px -1px rgba(0, 104, 177, 0.15);">Track Package</a>
        </div>
        ` : ''}
      `;
      text = `Hi ${customerName},\n\nGreat news! Your order of ${itemsTextList} (Order ID: ${orderId}) has been shipped via ${carrier || 'Standard Courier'} with tracking number ${trackingNumber || 'N/A'}.\n\nTrack Package: ${trackingUrl || 'N/A'}`;
    }

    return {
      subject: title,
      html: renderLayout(title, bodyHtml),
      text,
    };
  },

  // Category: account
  account_deleted: (data) => {
    const name = data.name || 'Collector';
    assertCritical(data.name, 'name is required for account_deleted.');

    const title = 'Account Deleted: The Stock Room';
    const htmlContent = `
      <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Account Deleted</h2>
      <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi ${escapeHtml(name)},</p>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">As requested, your account at The Stock Room has been deleted, and your stored data has been removed from our active database.</p>
      <p style="margin: 0; line-height: 1.6; color: #475569;">We are sorry to see you go! If you ever want to bid on auctions or make purchases again, you can register a new account at any time.</p>
    `;
    const text = `Hi ${name},\n\nAs requested, your account at The Stock Room has been deleted, and your stored data has been removed from our active database.\n\nWe are sorry to see you go! You can register a new account at any time.`;
    return {
      subject: title,
      html: renderLayout(title, htmlContent),
      text,
    };
  },

  // Category: security
  password_changed: (data) => {
    const name = data.name || 'Collector';
    assertCritical(data.name, 'name is required for password_changed.');

    const title = 'Security Notice: Account password changed';
    const htmlContent = `
      <h2 style="color: #e11d48; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Security Update</h2>
      <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi ${escapeHtml(name)},</p>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">This is a security notification to inform you that the password for your account at The Stock Room was recently changed.</p>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">If you made this change, no further action is required.</p>
      <p style="font-weight: 600; color: #e11d48; margin: 24px 0 16px 0; font-size: 15px;">If you did not make this change, please contact us immediately or reset your password to secure your account.</p>
      <div style="text-align: center; margin: 32px 0 16px 0;">
        <a href="https://stockroomnj.com" style="background-color: #e11d48; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(225, 29, 72, 0.15), 0 2px 4px -1px rgba(225, 29, 72, 0.15);">Secure My Account</a>
      </div>
    `;
    const text = `Hi ${name},\n\nThis is a security notification to inform you that your account password was recently changed.\n\nIf you did not perform this action, please reset your password immediately and contact us at admin@stockroomnj.com.`;
    return {
      subject: title,
      html: renderLayout(title, htmlContent),
      text,
    };
  },

  // Category: security
  password_reset: (data) => {
    const name = data.name || 'Collector';
    const resetLink = safeUrl(data.resetLink);
    const expiresMinutes = Number(data.expiresMinutes) > 0 ? Number(data.expiresMinutes) : 60;

    assertCritical(data.name, 'name is required for password_reset.');
    assertCritical(resetLink !== '#', 'resetLink is required for password_reset.');

    const title = 'Reset your Stock Room password';
    const htmlContent = `
      <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Reset your password</h2>
      <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi ${escapeHtml(name)},</p>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">We received a request to reset your password.</p>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">Click the button below to choose a new password. This link expires in ${escapeHtml(expiresMinutes)} minutes.</p>
      <div style="text-align: center; margin: 32px 0 24px 0;">
        <a href="${escapeHtml(resetLink)}" style="background-color: #0068b1; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(0, 104, 177, 0.15), 0 2px 4px -1px rgba(0, 104, 177, 0.15);">Reset Password</a>
      </div>
      <p style="margin: 0; line-height: 1.6; color: #475569;">If you did not request this, you can safely ignore this email.</p>
    `;
    const text = `Hi ${name},\n\nWe received a request to reset your password. Use the link below to choose a new password. This link expires in ${expiresMinutes} minutes.\n\nReset your password: ${resetLink}\n\nIf you did not request this, you can safely ignore this email.`;

    return {
      subject: title,
      html: renderLayout(title, htmlContent),
      text,
    };
  },
};
