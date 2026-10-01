# Calendar connections

Implemented: owner-controlled Google Calendar and Microsoft Outlook connection, selected all-day task/milestone dates, and explicit **Sync now** in Settings. No production account is connected by this implementation.

## Setup

- `CALENDAR_ENCRYPTION_KEY`: exactly 32 cryptographically random bytes, base64 encoded. Keep stable and back it up separately; changing it without migrating credentials makes existing connections unreadable.
- `CALENDAR_GOOGLE_CLIENT_ID`, `CALENDAR_GOOGLE_CLIENT_SECRET`: Google web OAuth credentials. Enable Calendar API and configure the consent screen.
- `CALENDAR_OUTLOOK_CLIENT_ID`, `CALENDAR_OUTLOOK_CLIENT_SECRET`: Microsoft app registration with delegated Calendars.ReadWrite and offline_access.
- Register exact redirect URI `${APP_ORIGIN}/?view=settings&calendar_callback=google` and the corresponding `outlook` URI. HTTPS is required except localhost development.

Tokens and OAuth PKCE verifiers are AES-256-GCM encrypted in SQLite. OAuth state is hashed, expires after ten minutes, belongs to the authenticated owner and studio, and is single-use. Callback processing requires the current authenticated session.

## Behaviour

Owners explicitly choose dates. Only those events are fetched and updated. Unrelated calendar events are not listed or imported. Incoming changes update due dates only, never external titles, attendees, descriptions or private event text.

If both sides changed to different dates, sync records a conflict and requires the owner to choose. Provider updates include If-Match. Local date changes during a provider read abort that item. Event deletion and unsupported timed events surface as status, with no automatic local deletion. Google event creation uses a deterministic ID; a conflict on retry fetches the same ID. Outlook creation uses transactionId.

Disconnect removes local tokens and mappings and attempts Google token revocation. Microsoft local disconnection does not revoke account-wide consent; the UI tells users how to remove app consent in their Microsoft account. Existing remote events are retained. Reconnection starts with no selected mappings to avoid carrying a prior account's event identifiers into another account.

## Deliberate limits

Manual sync; no background job, webhook subscriptions or automatic recurrence handling. Primary calendar only. All-day task and milestone dates only. Holds, resource booking ranges, task completion/deletion and general calendar event import are not synchronized. Native ICS export still handles broader project booking information. No attendee invitations are created. Real Google/Microsoft OAuth review and connected-account acceptance remain external setup gates.

## Official API references

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/calendar/api/v3/reference/events/update
- https://developers.google.com/workspace/calendar/api/guides/version-resources
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- https://learn.microsoft.com/en-us/graph/api/event-update?view=graph-rest-1.0

Tests use fake transport and isolated databases; no live calendar reads or writes are performed.
