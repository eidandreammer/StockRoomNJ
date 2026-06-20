/**
 * Standard branded layout wrapping all HTML transactional emails.
 *
 * @param {string} title The title of the email (used in <title> metadata).
 * @param {string} contentHtml The inner HTML content of the email body.
 * @returns {string} Fully rendered HTML string.
 */
function renderLayout(title, contentHtml) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
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
    const title = 'Welcome to StockRoom NJ!';
    const htmlContent = `
      <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Welcome, ${name}!</h2>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">Thank you for creating an account with The Stock Room! Your collection registry, addresses, and email settings are now active.</p>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">With your new account, you can:</p>
      <ul style="padding-left: 20px; margin: 0 0 28px 0; color: #475569; line-height: 1.6;">
        <li style="margin-bottom: 10px;">Place secure bids on our rare collectible auctions.</li>
        <li style="margin-bottom: 10px;">Store shipping and billing info for faster, seamless checkouts.</li>
        <li style="margin-bottom: 10px;">Keep track of pop-up drops, local tournaments, and events.</li>
      </ul>
      <div style="text-align: center; margin: 32px 0 16px 0;">
        <a href="https://stockroomnj.com/shop" style="background-color: #0068b1; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(0, 104, 177, 0.15), 0 2px 4px -1px rgba(0, 104, 177, 0.1);">Explore the Shop</a>
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
    const productName = data.productName || 'Collectible Item';
    const amount = Number(data.amount) || 0;
    const title = `Bid Received: ${productName}`;
    const htmlContent = `
      <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Bid Received</h2>
      <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi there,</p>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">We've received your bid of <strong style="color: #0068b1; font-size: 18px;">$${amount.toFixed(2)}</strong> for <strong style="color: #0f172a;">${productName}</strong>.</p>
      <p style="margin: 0 0 24px 0; line-height: 1.6; color: #475569;">Your bid is currently pending admin approval. We will notify you immediately once it is approved or if you are outbid.</p>
      <div style="text-align: center; margin: 32px 0 16px 0;">
        <a href="https://stockroomnj.com/shop" style="background-color: #0068b1; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(0, 104, 177, 0.15), 0 2px 4px -1px rgba(0, 104, 177, 0.1);">View Auction Page</a>
      </div>
    `;
    const text = `Hi there,\n\nWe've received your bid of $${amount.toFixed(2)} for ${productName}. It is currently pending admin approval.\n\nView Auction Page: https://stockroomnj.com/shop`;
    return {
      subject: title,
      html: renderLayout(title, htmlContent),
      text,
    };
  },

  // Category: bidding
  outbid: (data) => {
    const productName = data.productName || 'Collectible Item';
    const currentBidAmount = Number(data.currentBidAmount) || 0;
    const title = `You've been outbid! ${productName}`;
    const htmlContent = `
      <h2 style="color: #e11d48; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">You've Been Outbid</h2>
      <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi,</p>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">Another bidder placed a higher bid on <strong style="color: #0f172a;">${productName}</strong>.</p>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">The new current bid is now <strong style="color: #e11d48; font-size: 18px;">$${currentBidAmount.toFixed(2)}</strong>.</p>
      <p style="margin: 0 0 24px 0; line-height: 1.6; color: #475569;">Don't miss out on this item! Head back to the shop to increase your bid and stay in the running.</p>
      <div style="text-align: center; margin: 32px 0 16px 0;">
        <a href="https://stockroomnj.com/shop" style="background-color: #e11d48; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(225, 29, 72, 0.15), 0 2px 4px -1px rgba(225, 29, 72, 0.1);">Bid Again Now</a>
      </div>
    `;
    const text = `Hi,\n\nAnother bidder placed a higher bid on ${productName}. The new current bid is $${currentBidAmount.toFixed(2)}.\n\nBid Again Now: https://stockroomnj.com/shop`;
    return {
      subject: title,
      html: renderLayout(title, htmlContent),
      text,
    };
  },

  // Category: checkout
  bid_approved_checkout: (data) => {
    const productName = data.productName || 'Collectible Item';
    const amount = Number(data.amount) || 0;
    const checkoutUrl = data.checkoutUrl || '';
    const title = `Congratulations! Your bid was approved for ${productName}`;
    const htmlContent = `
      <h2 style="color: #16a34a; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Congratulations! You Won</h2>
      <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi there,</p>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">Great news! The administrator has approved your winning bid of <strong style="color: #16a34a; font-size: 20px;">$${amount.toFixed(2)}</strong> for <strong style="color: #0f172a;">${productName}</strong>.</p>
      <p style="margin: 0 0 24px 0; line-height: 1.6; color: #475569;">To finalize your purchase and pay for this item, please complete your secure payment via Stripe using the button below:</p>
      <div style="text-align: center; margin: 36px 0 20px 0;">
        <a href="${checkoutUrl}" style="background-color: #16a34a; color: #ffffff; padding: 14px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(22, 163, 74, 0.15), 0 2px 4px -1px rgba(22, 163, 74, 0.1);">Complete Payment via Stripe</a>
      </div>
      <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 16px; line-height: 1.5;">
        Or copy/paste this URL into your browser:<br/>
        <a href="${checkoutUrl}" style="color: #0068b1; word-break: break-all; text-decoration: none;">${checkoutUrl}</a>
      </p>
    `;
    const text = `Hi there,\n\nGreat news! Your bid of $${amount.toFixed(2)} for ${productName} has been approved.\n\nComplete secure payment via Stripe: ${checkoutUrl}\n\nThank you for bidding with us!`;
    return {
      subject: title,
      html: renderLayout(title, htmlContent),
      text,
    };
  },

  // Category: orders
  order_confirmed: (data) => {
    const productName = data.productName || '';
    const amount = Number(data.amount) || 0;
    const items = data.items || [];
    const title = `Order Confirmed: ${productName || 'Your Purchase'}`;

    let itemsList = items;
    if (itemsList.length === 0 && productName) {
      itemsList = [{ productName, amount }];
    }

    const itemsHtml = itemsList.map(item => `
      <tr>
        <td style="padding: 14px 0; border-bottom: 1px solid #f1f5f9; font-size: 15px; color: #334155;">${item.productName}</td>
        <td style="padding: 14px 0; text-align: right; border-bottom: 1px solid #f1f5f9; font-size: 15px; font-weight: 600; color: #0f172a;">$${Number(item.amount).toFixed(2)}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <h2 style="color: #16a34a; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Order Confirmed!</h2>
      <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi there,</p>
      <p style="margin: 0 0 24px 0; line-height: 1.6; color: #475569;">Thank you for your purchase! We've received your payment and your order is now confirmed.</p>
      
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
            <td style="padding: 20px 0 0 0; text-align: right; font-weight: 700; font-size: 18px; color: #16a34a;">$${amount.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <p style="margin: 0; line-height: 1.6; color: #475569;">We will follow up shortly with updates on pickup/shipping instructions.</p>
    `;
    const text = `Thank you for your purchase! We've confirmed payment for your order of $${amount.toFixed(2)}.\n\nItems:\n${itemsList.map(item => `- ${item.productName}: $${Number(item.amount).toFixed(2)}`).join('\n')}\n\nWe will follow up shortly with updates on pickup/shipping instructions.`;
    return {
      subject: title,
      html: renderLayout(title, htmlContent),
      text,
    };
  },

  // Category: shipping
  shipping_or_pickup: (data) => {
    const orderId = data.orderId || '';
    const productName = data.productName || 'Collectible Item';
    const method = data.shippingMethod || 'shipping'; // 'shipping' or 'pickup'
    const carrier = data.carrier || '';
    const trackingNumber = data.trackingNumber || '';
    const trackingUrl = trackingNumber && carrier ? `https://www.google.com/search?q=${encodeURIComponent(carrier + ' ' + trackingNumber)}` : '';
    const pickupInstructions = data.pickupInstructions || '';

    const isPickup = method === 'pickup';
    const title = isPickup ? `Pickup Update: Your order ${orderId} is ready!` : `Shipping Update: Your order ${orderId} has shipped!`;

    let bodyHtml;
    let text;

    if (isPickup) {
      bodyHtml = `
        <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Ready for Pickup!</h2>
        <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi there,</p>
        <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">Your order of <strong style="color: #0f172a;">${productName}</strong> is now ready for in-store pickup at The Stock Room.</p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin: 24px 0; font-size: 14px; line-height: 1.6; color: #334155;">
          <p style="margin: 0 0 12px 0;"><strong style="color: #0f172a; font-size: 15px;">Store Address:</strong><br/>66 Union Blvd, Wallington, NJ 07057</p>
          <p style="margin: 0 0 12px 0;"><strong style="color: #0f172a; font-size: 15px;">Instructions:</strong><br/>${pickupInstructions || 'Please bring a valid ID and order confirmation email.'}</p>
          <p style="margin: 0;"><strong style="color: #0f172a; font-size: 15px;">Order ID:</strong> <span style="font-family: monospace; color: #64748b;">${orderId}</span></p>
        </div>
      `;
      text = `Hi there,\n\nYour order of ${productName} (Order ID: ${orderId}) is now ready for in-store pickup at The Stock Room (66 Union Blvd, Wallington, NJ 07057).\n\nInstructions: ${pickupInstructions || 'Please bring a valid ID.'}`;
    } else {
      bodyHtml = `
        <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Your Order is Shipped!</h2>
        <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi there,</p>
        <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">Great news! Your order of <strong style="color: #0f172a;">${productName}</strong> has been shipped.</p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin: 24px 0; font-size: 14px; line-height: 1.6; color: #334155;">
          <p style="margin: 0 0 8px 0;"><strong style="color: #0f172a; font-size: 15px;">Carrier:</strong> ${carrier || 'Standard Courier'}</p>
          <p style="margin: 0 0 8px 0;"><strong style="color: #0f172a; font-size: 15px;">Tracking Number:</strong> <span style="font-family: monospace; color: #0068b1; font-weight: 600;">${trackingNumber || 'N/A'}</span></p>
          <p style="margin: 0;"><strong style="color: #0f172a; font-size: 15px;">Order ID:</strong> <span style="font-family: monospace; color: #64748b;">${orderId}</span></p>
        </div>
        ${trackingUrl ? `
        <div style="text-align: center; margin: 32px 0 16px 0;">
          <a href="${trackingUrl}" style="background-color: #0068b1; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(0, 104, 177, 0.15), 0 2px 4px -1px rgba(0, 104, 177, 0.1);">Track Package</a>
        </div>
        ` : ''}
      `;
      text = `Hi there,\n\nGreat news! Your order of ${productName} (Order ID: ${orderId}) has been shipped via ${carrier || 'Standard Courier'} with tracking number ${trackingNumber || 'N/A'}.\n\nTrack Package: ${trackingUrl || 'N/A'}`;
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
    const title = 'Account Deleted: The Stock Room';
    const htmlContent = `
      <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Account Deleted</h2>
      <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi ${name},</p>
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
    const title = 'Security Notice: Account password changed';
    const htmlContent = `
      <h2 style="color: #e11d48; margin-top: 0; margin-bottom: 16px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Security Update</h2>
      <p style="margin: 0 0 12px 0; line-height: 1.6; color: #475569;">Hi ${name},</p>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">This is a security notification to inform you that the password for your account at The Stock Room was recently changed.</p>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569;">If you made this change, no further action is required.</p>
      <p style="font-weight: 600; color: #e11d48; margin: 24px 0 16px 0; font-size: 15px;">If you did not make this change, please contact us immediately or reset your password to secure your account.</p>
      <div style="text-align: center; margin: 32px 0 16px 0;">
        <a href="https://stockroomnj.com" style="background-color: #e11d48; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(225, 29, 72, 0.15), 0 2px 4px -1px rgba(225, 29, 72, 0.1);">Secure My Account</a>
      </div>
    `;
    const text = `Hi ${name},\n\nThis is a security notification to inform you that your account password was recently changed.\n\nIf you did not perform this action, please reset your password immediately and contact us at admin@stockroomnj.com.`;
    return {
      subject: title,
      html: renderLayout(title, htmlContent),
      text,
    };
  },
};
