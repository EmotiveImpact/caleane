# Stripe payment integration boundary

`stripe-payments.mjs` provides the local Checkout and signed webhook ledger. It uses [Stripe Connect direct charges](https://docs.stripe.com/connect/direct-charges) so the connected studio is the merchant for its own invoice. A platform Stripe secret key, Connect onboarding, a Connect webhook endpoint, and an HTTPS app origin are required before enabling real payments.

## Implemented server wiring

1. `installStripePayments(db)` and `installStripeOnboarding(db)` run when the store opens. The migration retains manual payment records.
2. The server creates a Stripe client only with `STRIPE_SECRET_KEY`. Checkout additionally requires `STRIPE_WEBHOOK_SECRET`, a chargeable connected studio account, an HTTPS origin outside loopback, and `CALEANE_STRIPE_COLLECTION_ENABLED=1`. Configure a **Connect** webhook endpoint for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired` before enabling the flag.
3. Owner-authenticated account setup is wired through the routes below. The browser never supplies a Stripe account ID. A studio is mapped to an account only when Stripe confirms `charges_enabled`.
4. Authenticated POST `/api/projects/:projectId/invoices/:invoiceId/checkout` resolves the studio and Owner/Approver role from the session, then creates or resumes Checkout. Billing redirects to Stripe and waits for webhook-backed payment confirmation.
5. POST `/api/webhooks/stripe` is handled before the preview Basic Auth, session, Origin and JSON body gates. It reads a bounded raw body and verifies the Stripe signature before applying a payment. An invalid signature returns 400.
6. Manual receipt and invoice cancellation reject an active Checkout. Owners can inspect attempts and expire an abandoned open session. Stripe must confirm expiry before manual payments are unblocked; a conflicting paid event is marked for review instead of inflating the ledger.
7. `invoiceDTO` and Billing distinguish `stripe_verified` from `owner_recorded`. A Checkout return alone is never shown as paid.

## Owner Connect routes

All four routes require the current authenticated user. The module checks that user’s `memberships` row has the `owner` role for the studio. Only `country` and the opaque callback `state` may come from the browser; the connected account ID never does.

- `POST /api/stripe/connect/start` with `{country:'GB'|'US'}`: resolve `studioId` from the authenticated owner’s studio and call `startStripeOnboarding(db,stripe,{studioId,ownerUserId:user.id,country,appOrigin:origin})`. Return `url` to the same authenticated browser session and redirect the owner there. Do not send or store the URL elsewhere.
- `GET /api/stripe/connect/refresh?state=...`: call `refreshStripeOnboarding(db,stripe,{ownerUserId:user.id,state,appOrigin:origin})`, then redirect to the fresh `url`. A refresh state is single use and invalidates its sibling return state.
- `GET /api/stripe/connect/return?state=...`: call `returnFromStripeOnboarding(db,stripe,{ownerUserId:user.id,state})` and redirect to the returned `studioId`’s Settings screen. A return means the owner left Stripe’s flow. `status:'connected'` is returned only after Stripe reports `charges_enabled` and the account is mapped to the studio; otherwise show `status:'pending'` and a way to continue.
- `GET /api/stripe/connect/status?studio=...`: call `stripeOnboardingStatus(db,stripe,{studioId,ownerUserId:user.id})` to display the current provider state. This also recovers a ready account if a return callback was interrupted.

Use no-store responses for these routes. The account-link URL itself grants access to sensitive onboarding details and is [single use](https://docs.stripe.com/api/account_links/create). The callbacks include cryptographically random state values that are stored only as hashes, expire after 24 hours, and are tied to the initiating owner and studio. A different owner, an expired state, or a reused state fails closed. `APP_ORIGIN` must be HTTPS outside loopback testing.

## Current limits

- The HTTP routes are implemented and mock-tested. A real Stripe Connect platform, keys, webhook registration, connected studio and provider acceptance test remain unconfigured.
- Refunds, disputes, and credit notes are not yet reconciled. Do not enable real collection until those paths and an operational review queue exist.
- The module handles successful and delayed Checkout payments, failed or expired sessions, duplicate webhooks, replayed success events, tenant/account mismatches, and invoice balance conflicts. Tests make no real Stripe calls.
- Stripe’s current guidance recommends Accounts v2 for new Connect platforms. This module creates Express accounts because that is the chosen scope for the current implementation; review that account-model decision before a public launch.

Stripe references: [Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create), [webhook signatures](https://docs.stripe.com/webhooks/signature), [idempotent requests](https://docs.stripe.com/api/idempotent_requests), [Connect webhook endpoints](https://docs.stripe.com/api/webhook_endpoints/create), [Express accounts](https://docs.stripe.com/connect/express-accounts), [account links](https://docs.stripe.com/api/account_links/create), [expire a Checkout Session](https://docs.stripe.com/api/checkout/sessions/expire).

## Payment at booking and plan autopay

Both are off by default and need the same setup as invoice Checkout (`CALEANE_STRIPE_COLLECTION_ENABLED=1`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, a connected studio). They also refuse a live key (`sk_live_` or `rk_live_`) unless `CALEANE_STRIPE_ALLOW_LIVE=1` is set, so they run in Stripe test mode until that is a deliberate decision.

- **Payment at booking** (`booking-payments.mjs`). The owner switches it on in Settings, Bookings, with an amount, currency and name. A booking is then held as "Awaiting payment" for 34 minutes while the client is on a card-only Checkout page that closes after 31 minutes. Only the signed `checkout.session.completed` webhook confirms the booking and adds its follow-up. Leaving Checkout releases the time at once; `checkout.session.expired` releases it otherwise. A payment that arrives after a release is marked "Needs review" for a refund. The fee is recorded on the booking, not in the invoice ledger.
- **Autopay** (`plan-autopay.mjs`). The owner offers it in Settings, Connections. The project approver saves a card through Checkout in setup mode on the connected account. Each hour, every issued plan invoice that is due and unpaid is charged once, off session, with a stored idempotency key. A declined card is not retried until the client saves a new card; the invoice stays open. Owners still issue each instalment invoice.
- Add `payment_intent.succeeded` and `payment_intent.payment_failed` to the Connect webhook endpoint, alongside the Checkout events above.
