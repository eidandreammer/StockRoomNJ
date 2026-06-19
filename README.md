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

## Firebase Setup

1. Create a Firebase project and register a web app.
2. Enable Firestore, Firebase Storage, and Email/Password authentication.
3. Create a Google reCAPTCHA v2 checkbox site key for each deployed dashboard domain.
4. Create each staff account in Firebase Console under Authentication.
5. Add a Firestore document at `admins/{uid}` for each approved staff user. The document
   may contain `{ "enabled": true }`; authorization is based on the document existing.
6. Run `firebase login`, select the project with `firebase use --add`, and deploy the
   checked-in Firestore and Storage rules with `npm run deploy:rules`.

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

- `npm run lint`: lint JavaScript and JSX.
- `npm test`: run event-model unit tests.
- `npm run test:rules`: run Firestore security-rule tests through the Firestore emulator.
- `npm run build`: build the storefront, shop, and admin pages.
- `npm run deploy:rules`: deploy Firestore and Storage security rules.
- `npm run deploy`: build and publish the static output to GitHub Pages.
