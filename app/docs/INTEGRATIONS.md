# Integrations

Settings has an **Integrations** tab (Xero, webhooks) and the **Bookings** tab has a **Calendar and video** card. Everything that needs an outside account stays off until its environment variables are set, and nothing calls a provider in the hosted sample workspace.

| Feature | Works without setup? | What to set |
| --- | --- | --- |
| Webhooks and Zapier | Yes | Nothing. Studios paste their own endpoint address. |
| Calendar sync (project dates and bookings) | No | `CALENDAR_ENCRYPTION_KEY`, plus Google and/or Outlook OAuth apps. See [CALENDAR-SYNC.md](CALENDAR-SYNC.md). |
| Google Meet links | No | Google calendar sync above. Links are made through the owner's Google Calendar. |
| Zoom links | No | `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` |
| Xero | No | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, and `XERO_ENCRYPTION_KEY` (or the calendar key) |

## Webhooks (`webhooks.mjs`)

Events: `enquiry.received`, `form.submitted`, `client.created`, `project.created`, `booking.created`, `booking.cancelled`, `invoice.issued`, `payment.received`, `invoice.paid`, plus `webhook.test` from the Send a test button.

Events are found by scanning existing tables every 15 seconds, recorded once by a unique key, and delivered to each subscribed endpoint as JSON with `Caleane-Event`, `Caleane-Delivery` (stable across retries) and `Caleane-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`. Retries after 1 minute, 5 minutes, 30 minutes, 2 hours, 8 hours and 24 hours. A 410 reply or 25 failures in a row switch the endpoint off. Only https addresses on public networks are accepted, checked again for every DNS answer at send time, and redirects are not followed. History is kept for 30 days and removed when a client is erased.

Zapier: Webhooks by Zapier, Catch Hook, paste the URL into Caleane, press Send a test. This needs a paid Zapier plan. A listed Zapier app would need a Zapier developer account and can be built on these same events later.

## Zoom

Create a **Server-to-Server OAuth** app in the Zoom App Marketplace on the studio's Zoom account, add the scopes `meeting:write:meeting` and `meeting:delete:meeting`, activate it, and copy the account ID, client ID and client secret into the three variables. Meetings are created on that account's own user, with the waiting room on.

## Xero (`xero.mjs`)

1. At developer.xero.com, create a **Web app**. Redirect URI: `${APP_ORIGIN}/xero/callback` (for local testing, `http://localhost:4320/xero/callback`).
2. Set `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET`. Tokens are encrypted with `XERO_ENCRYPTION_KEY` (32 random bytes, base64), or `CALENDAR_ENCRYPTION_KEY` if that is already set.
3. Scopes default to `offline_access accounting.invoices accounting.payments accounting.contacts accounting.settings.read`, the granular scopes for apps created since March 2026. An older app can set `XERO_SCOPES` to `offline_access accounting.transactions accounting.contacts accounting.settings.read`.

After connecting, the owner checks the account codes (sales account, VAT rate codes, and a bank account if payments should be sent). Every five minutes, and on Sync now, Caleane sends invoices issued since the connection date (or the chosen start date) as sales invoices, then each recorded payment against them. Requests carry an `Idempotency-Key`, and each sent record is remembered, so nothing is sent twice, including after reconnecting the same organisation. Cancelling an invoice in Caleane voids it in Xero unless payments were sent. Credit notes and refunds are not sent yet. Nothing is read back from Xero.
