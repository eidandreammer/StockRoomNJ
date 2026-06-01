# StockRoom NJ

React and Vite storefront for The Stock Room NJ. The public site includes a Firebase-backed
event calendar, and `admin.html` provides the staff event dashboard.

## Brand Colors

- Coin Grey: `#A9A9BO` (confirm before use; the final character is the letter `O`)
- Royal Blue: `#002366`

## Local Setup

1. Run `npm install`.
2. Copy `.env.example` to `.env` and fill in the Firebase web app values.
3. Run `npm run dev`.
4. Open `/` for the storefront or `/admin.html` for the event dashboard.

The Firebase emulator requires JDK 21 or newer. To develop against local Firebase services,
run `npm run emulators`, set
`VITE_USE_FIREBASE_EMULATORS=true` in `.env`, and start Vite in another terminal.

## Firebase Setup

1. Create a Firebase project and register a web app.
2. Enable Firestore and Email/Password authentication.
3. Create each staff account in Firebase Console under Authentication.
4. Add a Firestore document at `admins/{uid}` for each approved staff user. The document
   may contain `{ "enabled": true }`; authorization is based on the document existing.
5. Run `firebase login`, select the project with `firebase use --add`, and deploy the
   checked-in rules with `npm run deploy:rules`.

Public visitors can read only published events. Approved staff can read drafts and manage
events after signing in through `admin.html`. New events start as drafts and must be
published explicitly.

## Event Workflow

1. Open `admin.html` and sign in with a provisioned staff account.
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
- `npm run build`: build both `index.html` and `admin.html`.
- `npm run deploy`: build and publish the static output to GitHub Pages.
