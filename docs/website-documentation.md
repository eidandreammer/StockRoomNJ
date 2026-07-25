# StockRoom NJ Website Documentation

This document is the complete technical reference for the StockRoom NJ website.
It complements the root `README.md`, which remains the primary setup and deployment
checklist.

## Project Overview

StockRoom NJ is a React and Vite storefront deployed on Firebase Hosting. The
public website supports browsing published inventory, viewing product details,
placing bids, checkout flows, legal consent prompts, and event discovery. The
admin dashboard supports inventory, orders, bids, legal documents, and event
management for approved staff accounts.

## Application Surfaces

- `/`: public storefront landing page.
- `/shop`: published product catalog and product detail experience.
- `/pay`: payment and post-payment related entry point.
- `/legal`: legal document viewer.
- `/admin`: staff dashboard.

The corresponding entry HTML files are:

- `index.html`
- `shop.html`
- `pay.html`
- `legal.html`
- `admin.html`

## Frontend Architecture

The frontend is built with React, Vite, and modular JSX components under `src/`.

Important files:

- `src/main.jsx`: public storefront entry.
- `src/gallery-main.jsx`: shop/gallery entry.
- `src/pay-main.jsx`: payment page entry.
- `src/legal-main.jsx`: legal page entry.
- `src/admin-main.jsx`: admin dashboard entry.
- `src/App.jsx`: public storefront shell.
- `src/SiteChrome.jsx`: shared public-site navigation, layout, and account entry.
- `src/AccountDrawer.jsx`: customer account portal, login, profile, address, and notification settings.
- `src/AdminApp.jsx`: staff dashboard and admin authentication flow.
- `src/firebase.js`: Firebase app, Auth, Firestore, Storage, and emulator setup.
- `src/api.js`: API request helpers for Firebase Hosting rewrites and authenticated function calls.
- `src/friendlyErrors.js`: customer and admin friendly error mapping.
- `src/App.css`: main public-site styling.
- `src/Admin.css`: admin dashboard styling.

## Backend And Firebase

Firebase services used:

- Firebase Hosting for deployed pages and `/api/**` rewrites.
- Firebase Authentication for customers and staff.
- Firestore for products, events, users, orders, bids, legal documents, agreements, and admin authorization.
- Firebase Storage for product and legal document assets.
- Firebase Functions for checkout, bidding, order, auth helper, legal, and email endpoints.

Important backend files:

- `functions/index.js`: HTTPS routes, scheduled jobs, Firestore triggers, admin/user authorization helpers.
- `firestore.rules`: Firestore read/write security rules.
- `storage.rules`: Firebase Storage security rules.
- `firebase.json`: Hosting rewrites, emulator configuration, and deploy targets.
- `.firebaserc`: default Firebase project alias.

## Environment Variables

Frontend variables must use the `VITE_` prefix because they are compiled by Vite.

Common frontend variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_USE_FIREBASE_EMULATORS`
- `VITE_RECAPTCHA_SITE_KEY`
- `VITE_DISABLE_RECAPTCHA`
- `VITE_API_BASE_URL`
- `VITE_GOOGLE_MAPS_API_KEY`

Production secrets are configured as Firebase Functions secrets, not committed
to source control:

- `POSTMARK_SERVER_TOKEN`
- `GUEST_TOKEN_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Customer Authentication

Customer authentication is implemented in `src/AccountDrawer.jsx`.

Supported customer auth flows:

- Email/password sign in.
- Email/password account creation.
- Password reset request through `/api/auth/password-reset`.
- Google account sign-in through Firebase Auth.
- TOTP MFA verification when Firebase returns `auth/multi-factor-auth-required`.

Customer profile documents are stored at:

```txt
users/{uid}
```

The profile document includes:

- `displayName`
- `email`
- `phone`
- `shippingAddress`
- `billingAddress`
- `notifications`
- `createdAt`

Firestore rules allow users to read, create, update, and delete only their own
profile document, while admins can read/write approved administrative data.

## Google Sign-In Implementation

Google sign-in was added to the customer account drawer.

Code changes:

- `src/AccountDrawer.jsx`
  - Imports `GoogleAuthProvider` and `signInWithPopup`.
  - Creates a shared `googleProvider`.
  - Sets `prompt: 'select_account'` so users can choose the Google account.
  - Adds `handleGoogleSignIn`.
  - Creates `users/{uid}` after Google sign-in if the profile does not exist.
  - Handles `auth/multi-factor-auth-required` by reusing the existing TOTP MFA screen.
  - Adds the `Continue with Google` button to sign-in and create-account modes.
- `src/firebase.js`
  - Imports `browserPopupRedirectResolver`.
  - Passes `popupRedirectResolver: browserPopupRedirectResolver` into `initializeAuth`.
  - This is required for `signInWithPopup` when Auth is initialized manually.
- `src/friendlyErrors.js`
  - Adds clearer messages for Google and popup related auth errors:
    - `auth/operation-not-allowed`
    - `auth/unauthorized-domain`
    - `auth/popup-blocked`
    - `auth/account-exists-with-different-credential`
- `src/App.css`
  - Adds `.google-signin-btn` styling.

Firebase Console requirements:

1. Go to `Authentication > Sign-in method`.
2. Enable the Google provider.
3. Set the project support email.
4. Go to `Authentication > Settings > Authorized domains`.
5. Add the required domains:

```txt
localhost
stockroomnj.com
stockroomnj-10e7d.firebaseapp.com
stockroomnj-10e7d.web.app
```

For local Google sign-in testing, use Firebase production auth by setting:

```env
VITE_USE_FIREBASE_EMULATORS="false"
```

Restart Vite after changing `.env`, because Vite environment variables are read
when the dev server starts.

## Customer MFA Behavior

The customer account drawer supports TOTP MFA when Firebase requires it. The
flow stores verification state locally:

- `sessionStorage`: marks the current session as MFA verified.
- `localStorage`: stores the optional "do not ask again for 3 days" state.

When an authenticated user has a TOTP factor and the local MFA state has expired,
the drawer signs the user out and requires re-authentication.

The Firebase Auth Emulator does not reliably support TOTP MFA generation. Local
emulator mode is intended for non-production testing and is documented in the
root `README.md`.

## Admin Authentication

Admin authentication is implemented separately in `src/AdminApp.jsx`.

Admin access requires:

- Firebase email/password staff account.
- reCAPTCHA gate outside localhost or when bypass is disabled.
- Approved Firestore document at `admins/{uid}`.
- TOTP MFA enrollment and verification in production.

Google sign-in was intentionally added only to the customer account drawer. Do
not add Google sign-in to `/admin` unless the admin authorization and MFA model
is intentionally redesigned and tested.

## Product And Inventory Workflow

Products are managed from `/admin` and displayed on `/shop`.

Important components:

- `src/AdminProducts.jsx`
- `src/BulkProductCreator.jsx`
- `src/ProductDetailModal.jsx`
- `src/InventorySearch.jsx`
- `src/usePublishedProducts.js`
- `src/productImages.js`
- `src/shopCatalog.js`

Published products can be read by public visitors. Product writes are restricted
to approved admins through Firestore rules and backend authorization.

## Bidding And Orders

Bidding and order workflows are handled through Cloud Functions and Firestore.

Important files:

- `src/QuickBid.jsx`
- `src/AdminBids.jsx`
- `src/AdminOrders.jsx`
- `src/CheckoutDialog.jsx`
- `functions/index.js`
- `src/bidMath.js`

Authenticated users attach Firebase ID tokens to protected API requests through
`authorizedApiRequest`.

## Legal Documents

Legal document viewing and consent are handled by:

- `src/LegalApp.jsx`
- `src/LegalDocumentViewer.jsx`
- `src/LegalDocumentModal.jsx`
- `src/LegalConsentPrompt.jsx`
- `src/legalDocuments.js`
- `src/legalIdentity.js`
- `src/AdminLegalDocuments.jsx`

Active Terms of Service and Privacy Policy documents can be deployed using:

```bash
npm run deploy:legal
```

## Events

The events system is implemented with:

- `src/events/EventsCalendar.jsx`
- `src/events/eventModel.js`
- `src/AdminApp.jsx`

Public visitors can read only published events. Admins can create drafts,
publish events, and manage recurrence overrides.

## Maps

The storefront location map uses the Google Maps JavaScript API when
`VITE_GOOGLE_MAPS_API_KEY` is present and usable. It falls back to a Google Maps
iframe when the API key is missing or fails.

Detailed map documentation is available in:

```txt
docs/google-maps-iframe-component.md
```

## Verification Commands

Use these commands before committing or deploying:

```bash
npm run lint
npm test
npm run build
```

For full project verification:

```bash
npm run verify
```

For Firestore and Storage rules:

```bash
npm run test:rules
```

## Deployment

Standard production deployment:

```bash
npm run deploy
```

Deploy Hosting only:

```bash
npm run deploy:hosting
```

Deploy all Firebase assets, including rules:

```bash
npm run deploy:all
```

## Change Log

### 2026-07-25 - Customer Google Sign-In

- Added customer Google account sign-in to the account drawer.
- Added Firebase popup redirect resolver to manual Auth initialization.
- Added first-time Google profile document creation in `users/{uid}`.
- Reused the existing TOTP MFA verification UI when Google sign-in requires MFA.
- Added clearer auth troubleshooting messages for Google provider, domain, popup,
  and credential conflicts.
- Documented Firebase Console setup requirements for Google provider and authorized
  domains.
