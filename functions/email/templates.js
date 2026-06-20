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
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #111827;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9fafb; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);">
          <!-- Header -->
          <tr>
            <td style="background-color: #002366; padding: 30px; text-align: center; border-bottom: 3px solid #12b76a;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">THE STOCK ROOM</h1>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 40px 30px; line-height: 1.6; font-size: 16px;">
              ${contentHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f3f4f6; padding: 30px; border-top: 1px solid #e5e7eb;">
              <div style="font-size: 12px; color: #6b7280; text-align: center; line-height: 1.5;">
                <p style="margin: 0; font-weight: bold; color: #374151;">The Stock Room</p>
                <p style="margin: 4px 0 0 0;">66 Union Blvd, Wallington, NJ 07057</p>
                <p style="margin: 4px 0 0 0;">Phone: (609) 459-5069 | Email: thestockroomnj@gmail.com</p>
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
      <h2 style="color: #002366; margin-top: 0; margin-bottom: 20px; font-size: 22px; font-weight: 600;">Welcome, ${name}!</h2>
      <p>Thank you for creating an account with The Stock Room! Your collection registry, addresses, and email settings are now active.</p>
      <p>With your new account, you can:</p>
      <ul style="padding-left: 20px; margin-bottom: 30px; color: #374151;">
        <li style="margin-bottom: 10px;">Place secure bids on our rare collectible auctions.</li>
        <li style="margin-bottom: 10px;">Store shipping and billing info for faster, seamless checkouts.</li>
        <li style="margin-bottom: 10px;">Keep track of pop-up drops, local tournaments, and events.</li>
      </ul>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://stockroomnj.com/shop" style="background-color: #002366; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">Explore the Shop</a>
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
      <h2 style="color: #002366; margin-top: 0; margin-bottom: 20px; font-size: 22px; font-weight: 600;">Bid Received</h2>
      <p>Hi there,</p>
      <p>We've received your bid of <strong style="color: #002366;">$${amount.toFixed(2)}</strong> for <strong style="color: #111827;">${productName}</strong>.</p>
      <p>Your bid is currently pending admin approval. We will notify you immediately once it is approved or if you are outbid.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://stockroomnj.com/shop" style="background-color: #002366; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">View Auction Page</a>
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
      <h2 style="color: #f04438; margin-top: 0; margin-bottom: 20px; font-size: 22px; font-weight: 600;">You've Been Outbid</h2>
      <p>Hi,</p>
      <p>Another bidder placed a higher bid on <strong style="color: #111827;">${productName}</strong>.</p>
      <p>The new current bid is now <strong style="color: #f04438;">$${currentBidAmount.toFixed(2)}</strong>.</p>
      <p>Don't miss out on this item! Head back to the shop to increase your bid and stay in the running.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://stockroomnj.com/shop" style="background-color: #f04438; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">Bid Again Now</a>
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
      <h2 style="color: #12b76a; margin-top: 0; margin-bottom: 20px; font-size: 22px; font-weight: 600;">Congratulations! You Won</h2>
      <p>Hi there,</p>
      <p>Great news! The administrator has approved your winning bid of <strong style="color: #12b76a;">$${amount.toFixed(2)}</strong> for <strong style="color: #111827;">${productName}</strong>.</p>
      <p>To finalize your purchase and pay for this item, please complete your secure payment via Stripe using the button below:</p>
      <div style="text-align: center; margin: 35px 0;">
        <a href="${checkoutUrl}" style="background-color: #12b76a; color: #ffffff; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 18px;">Complete Payment via Stripe</a>
      </div>
      <p style="font-size: 12px; color: #6b7280; text-align: center; margin-top: 15px;">
        Or copy/paste this URL into your browser:<br/>
        <a href="${checkoutUrl}" style="color: #0057ff; word-break: break-all;">${checkoutUrl}</a>
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
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-size: 15px; color: #374151;">${item.productName}</td>
        <td style="padding: 12px 0; text-align: right; border-bottom: 1px solid #f3f4f6; font-size: 15px; font-weight: 500; color: #111827;">$${Number(item.amount).toFixed(2)}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <h2 style="color: #12b76a; margin-top: 0; margin-bottom: 20px; font-size: 22px; font-weight: 600;">Order Confirmed!</h2>
      <p>Hi there,</p>
      <p>Thank you for your purchase! We've received your payment and your order is now confirmed.</p>
      
      <h3 style="color: #002366; margin-top: 30px; margin-bottom: 15px; font-size: 18px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Order Summary</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
        <thead>
          <tr style="color: #6b7280; font-size: 13px; border-bottom: 1px solid #e5e7eb; text-align: left;">
            <th style="padding-bottom: 10px; font-weight: 500;">Item</th>
            <th style="padding-bottom: 10px; font-weight: 500; text-align: right;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
          <tr>
            <td style="padding: 20px 0 0 0; font-weight: bold; font-size: 16px; color: #111827;">Total Paid</td>
            <td style="padding: 20px 0 0 0; text-align: right; font-weight: bold; font-size: 18px; color: #12b76a;">$${amount.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <p>We will follow up shortly with updates on pickup/shipping instructions.</p>
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
        <h2 style="color: #002366; margin-top: 0; margin-bottom: 20px; font-size: 22px; font-weight: 600;">Ready for Pickup!</h2>
        <p>Hi there,</p>
        <p>Your order of <strong style="color: #111827;">${productName}</strong> is now ready for in-store pickup at The Stock Room.</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 25px 0; font-size: 15px; line-height: 1.5; color: #374151;">
          <p style="margin: 0 0 10px 0;"><strong style="color: #111827;">Store Address:</strong><br/>66 Union Blvd, Wallington, NJ 07057</p>
          <p style="margin: 0 0 10px 0;"><strong style="color: #111827;">Instructions:</strong><br/>${pickupInstructions || 'Please bring a valid ID and order confirmation email.'}</p>
          <p style="margin: 0;"><strong style="color: #111827;">Order ID:</strong> ${orderId}</p>
        </div>
      `;
      text = `Hi there,\n\nYour order of ${productName} (Order ID: ${orderId}) is now ready for in-store pickup at The Stock Room (66 Union Blvd, Wallington, NJ 07057).\n\nInstructions: ${pickupInstructions || 'Please bring a valid ID.'}`;
    } else {
      bodyHtml = `
        <h2 style="color: #002366; margin-top: 0; margin-bottom: 20px; font-size: 22px; font-weight: 600;">Your Order is Shipped!</h2>
        <p>Hi there,</p>
        <p>Great news! Your order of <strong style="color: #111827;">${productName}</strong> has been shipped.</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 25px 0; font-size: 15px; line-height: 1.5; color: #374151;">
          <p style="margin: 0 0 8px 0;"><strong style="color: #111827;">Carrier:</strong> ${carrier || 'Standard Courier'}</p>
          <p style="margin: 0 0 8px 0;"><strong style="color: #111827;">Tracking Number:</strong> ${trackingNumber || 'N/A'}</p>
          <p style="margin: 0;"><strong style="color: #111827;">Order ID:</strong> ${orderId}</p>
        </div>
        ${trackingUrl ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${trackingUrl}" style="background-color: #002366; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">Track Package</a>
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
      <h2 style="color: #002366; margin-top: 0; margin-bottom: 20px; font-size: 22px; font-weight: 600;">Account Deleted</h2>
      <p>Hi ${name},</p>
      <p>As requested, your account at The Stock Room has been deleted, and your stored data has been removed from our active database.</p>
      <p>We are sorry to see you go! If you ever want to bid on auctions or make purchases again, you can register a new account at any time.</p>
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
      <h2 style="color: #f04438; margin-top: 0; margin-bottom: 20px; font-size: 22px; font-weight: 600;">Security Update</h2>
      <p>Hi ${name},</p>
      <p>This is a security notification to inform you that the password for your account at The Stock Room was recently changed.</p>
      <p>If you made this change, no further action is required.</p>
      <p style="font-weight: 500; color: #f04438; margin-top: 20px;">If you did not make this change, please contact us immediately or reset your password to secure your account.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://stockroomnj.com" style="background-color: #f04438; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">Secure My Account</a>
      </div>
    `;
    const text = `Hi ${name},\n\nThis is a security notification to inform you that your account password was recently changed.\n\nIf you did not perform this action, please reset your password immediately and contact us at thestockroomnj@gmail.com.`;
    return {
      subject: title,
      html: renderLayout(title, htmlContent),
      text,
    };
  },
};
