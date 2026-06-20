# StockRoom NJ

React and Vite storefront for The Stock Room NJ. The public site includes Firebase-backed
shop inventory and an event calendar, and `/admin` provides the staff dashboard.

## Brand Colors

- Coin Grey: `#A9A9BO` (confirm before use; the final character is the letter `O`)
- Royal Blue / navigation bar: `#002366`

## Local Setup

1. Run `npm install`.
2. Copy `.env.example` to `.env` and fill in the Firebase web app values.
3. Create a Google Maps JavaScript API key and set
   `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env` for the storefront location map.
4. Create a Google reCAPTCHA v2 checkbox key for the deployed admin domain and set
   `VITE_RECAPTCHA_SITE_KEY` in `.env`. Localhost skips this check automatically.
5. Run `npm run dev`.
6. Open `/` for the storefront, `/shop` for the shop, or `/admin` for the dashboard.

The Firebase emulator requires JDK 21 or newer. To develop against local Firebase services,
run `npm run emulators`, set
`VITE_USE_FIREBASE_EMULATORS=true` in `.env`, and start Vite in another terminal.
Vite proxies `/api` requests to the local Functions emulator so checkout and legal
agreement endpoints match the deployed Firebase Hosting rewrites.

> [!NOTE]
> TOTP Multi-Factor Authentication (MFA) is bypassed in local emulator mode. The Firebase Auth Emulator does not support TOTP secret generation, so the admin dashboard allows approved admin users in `admins/{uid}` to access the dashboard directly without MFA enrollment or verification during local emulator development. Production behavior remains secure and unchanged.

## Firebase & Postmark Setup

1. Create a Firebase project and register a web app.
2. Enable Firestore, Firebase Storage, and Email/Password authentication.
3. Set up a Postmark account and configure your sending signatures and custom sending domain.
4. **Postmark DNS Checklist**:
   - **SPF**: Add `v=spf1 a mx include:spf.mtasv.net ~all` or merge `include:spf.mtasv.net` into your existing SPF record.
   - **DKIM**: Add the DKIM TXT record provided by Postmark.
   - **DMARC**: Configure a DMARC policy (e.g., `v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.com`).
   - **Custom Sending Domain**: Verify DKIM and Return-Path settings in your DNS zone (e.g. Cloudflare) to optimize deliverability.
5. **Firebase Secrets Configuration**:
   Before deploying your functions, you must configure Postmark credentials as Firebase Secrets:
   ```bash
   firebase functions:secrets:set POSTMARK_SERVER_TOKEN="your-postmark-server-token"
   firebase functions:secrets:set EMAIL_FROM="your-verified-sender@domain.com"
   firebase functions:secrets:set EMAIL_REPLY_TO="your-reply-to@domain.com"
   ```
6. Create a Google reCAPTCHA v2 checkbox site key for each deployed dashboard domain.
7. Create each staff account in Firebase Console under Authentication.
8. Add a Firestore document at `admins/{uid}` for each approved staff user. The document
   may contain `{ "enabled": true }`; authorization is based on the document existing.
9. Run `firebase login`, select the project with `firebase use --add`, and deploy the
   checked-in Firestore and Storage rules with `npm run deploy:rules`.

### Email System & Audit Logs

Cloud Functions send transactional and security emails directly via the Postmark API.
An `email_logs` Firestore collection keeps track of all outbound messages for auditing:
- **recipient**: List of recipient emails.
- **subject**: Subject line.
- **category**: Category of email (`account`, `security`, `bidding`, `checkout`, `orders`, `shipping`).
- **provider**: Set to `'postmark'`.
- **providerMessageId**: Unique ID returned by Postmark.
- **status**: `'sent'`, `'failed'`, or `'skipped'` (e.g. if the user opted out of optional updates).
- **errorMessage**: Error message details when `status` is `'failed'`.
- **createdAt** / **sentAt**: Timestamps.
- **related IDs**: `userId`, `orderId`, `bidId`, `productId` when available.

### Local Emulator Behavior

When running the local Firebase emulator (with `npm run emulators`), the email pipeline runs in a sandbox mode if `POSTMARK_SERVER_TOKEN` is not set. It will print the email structure (Subject, Recipient, Body, Category) directly to the terminal console and write mock logs to the `email_logs` collection with `providerMessageId: "mock-postmark-id-..."`. This prevents functions from crashing in local development when credentials are not configured.

Public visitors can read only published products and published events. Approved staff can
manage inventory and events after signing in through `/admin`. New grouped products
start as drafts unless a staff member marks them published, while new events start as
drafts and must be published explicitly.

## Product Workflow

1. Open `/admin` and sign in with a provisioned staff account.
2. Choose **New products**, upload any number of images, create color-coded image
   groups, then choose **Next**.
3. Fill in each group from the draft queue. The dashboard recommends the item type from
   the group image count and generates item IDs like `FK-061826-01`.
4. Save the drafts, then publish the products that should appear in `/shop` and
   the storefront search.

## Event Workflow

1. Open `/admin` and sign in with a provisioned staff account.
2. Choose **New event**, add the venue, address, goods categories, notes, and schedule,
   then save the draft.
3. Use **Publish** when the event is ready for visitors.
4. For repeating events, choose **Manage dates** to edit, cancel, or restore one
   occurrence. Editing the overall recurrence schedule clears existing per-date changes
   after confirmation.

## Commands

- `npm run dev`: start the Vite development server locally.
- `npm run build`: build the storefront, shop, and admin pages into the `dist/` directory.
- `npm run lint`: lint JavaScript and JSX files.
- `npm run preview`: preview the production build locally.
- `npm test`: run event-model unit tests.
- `npm run test:rules`: run Firestore security-rule tests through the Firestore emulator.
- `npm run emulators`: start local Firebase Emulators (Auth, Firestore, Storage, Functions).
- `npm run functions:lint`: lint Firebase Functions code.
- `npm run migrate:legal`: run the migration script for legal documents database state (targets emulator if active).
- `npm run deploy:legal`: robustly deploy active legal documents to the production Firestore database (automatically unsetting any emulator variables).
- `npm run deploy`: build the Vite app and deploy to Firebase Hosting and Functions.
- `npm run deploy:hosting`: build the Vite app and deploy only the static files to Firebase Hosting.
- `npm run deploy:rules`: deploy Firestore and Storage security rules to Firebase.
- `npm run deploy:all`: build the Vite app and deploy Hosting, Functions, Firestore rules, and Storage rules.
- `npm run verify`: verify the project by running ESLint, tests, and a production build.
- `npm run release`: verify the project and deploy Hosting + Functions.

## Version Control and Firebase Deployment Workflow

This project is configured to use Firebase Hosting exclusively for production. GitHub Pages is no longer used.

Follow this standard workflow to develop, commit, and deploy changes:

### A. Before coding

Make sure your local branch is synchronized with the remote repository:

```bash
git status
git pull origin main
```

### B. Run locally

Install dependencies, set up environment variables, and run the development server:

```bash
npm install
cp .env.example .env
npm run dev
```

### C. Before committing

Verify that your changes pass all linters, tests, and build successfully:

```bash
npm run verify
```

### D. Commit changes

Commit and push your verified changes to GitHub:

```bash
git add .
git commit -m "Describe the change clearly"
git push origin main
```

### E. Deploy to Firebase Hosting and Functions

Deploy hosting resources and Cloud Functions to production:

```bash
npm run deploy
```

### F. Deploy everything, including rules

To deploy security rules along with Hosting and Functions, run:

```bash
npm run deploy:all
```

### G. Deploy Legal Documents

To publish or update the active legal documents (Terms of Service and Privacy Policy) in the production database:

```bash
npm run deploy:legal
```

This script automatically reads the default project from `.firebaserc`, temporarily bypasses the local emulator environment variables in your current terminal session, reads the markdown files from the `public/` directory, and registers them as the active documents in the production Firestore database.

---

## DNS Migration Note

The production domain must point to Firebase Hosting. If the domain currently has Cloudflare A records pointing to GitHub Pages, replace those records with the exact DNS records provided by the Firebase Hosting custom-domain setup screen in the Firebase Console. Do not guess DNS records manually. Cloudflare should remain in DNS-only mode unless intentionally configured otherwise.

---

### Production Deployment Checklist

- [ ] `git status` is clean or only expected files changed
- [ ] `.env.production.local` exists locally if production build variables are needed
- [ ] No secrets are committed
- [ ] `npm run verify` passes
- [ ] Firebase CLI is logged in
- [ ] Correct Firebase project is selected or passed with `--project stockroomnj-10e7d`
- [ ] `npm run deploy` completes successfully
- [ ] Visit the production domain and test `/`, `/shop`, `/admin`, and at least one `/api/**` backed feature

