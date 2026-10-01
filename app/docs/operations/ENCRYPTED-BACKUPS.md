# Encrypted backup and operational readiness

## Implemented locally

- `scripts/backup.mjs` creates a consistent SQLite snapshot, checks integrity, encrypts using AES-256-GCM with a fresh nonce, restores the encrypted result to an isolated temporary database and checks integrity again before publishing the archive.
- Restores write to **a new path only**. Existing destinations are rejected. The live database is never replaced automatically.
- Temporary and final files use private permissions. Publication uses an atomic hard link without overwriting an existing file. Temporary plaintext is removed after success/failure; secure physical erasure is not promised.
- An optional backup receipt reports only completion time, format, verification and byte size. It contains no key, tenant data or source path.
- No scheduler, remote destination or notification delivery is enabled by these scripts.

## Run once

Provide a dedicated random 32-byte encryption key, encoded as base64, through your secret manager as `CALEANE_BACKUP_KEY`. Do not put it in commands, source control, backup filenames or logs. Retain it separately from backups; losing it prevents restore. Keep previous keys until all archives encrypted with them expire.

```sh
node --experimental-sqlite scripts/backup.mjs backup /absolute/data/workspace.sqlite /absolute/backups/unique-date.caleane-backup
node --experimental-sqlite scripts/backup.mjs restore /absolute/backups/unique-date.caleane-backup /absolute/restore-drill/workspace.sqlite
```

Optional `CALEANE_BACKUP_RECEIPT` points to a separate receipt file. Exit status is nonzero on failure. A scheduler can invoke this one-shot command with a unique destination and secret injection, but none is installed here.

Before production: configure schedule, copy completed encrypted files to private offsite storage, verify remote copies, set retention, protect the key, and perform regular restore drills. The database archive includes SQLite-backed project files and PDF archives. Separately back up any assets moved to external object storage and any required server configuration/secrets.

## Monitoring integration

`operationalReadiness(db, {studioId,userId,backupReceiptPath,emailConfigured,offsiteBackupsConfigured})` independently enforces studio-owner membership. Returns only scoped notification counts and broad readiness states. Do not expose it as a public health endpoint. Send `Cache-Control: private, no-store` on an authenticated route.

`backupReceiptPath` must be server configuration, never supplied by a request parameter. A receipt demonstrates the last successful local verification, not ongoing remote availability. `offsiteBackupsConfigured` records configuration and does not claim a remote restore passed.

The summary detects failed notification records and expired sending leases but does not send, retry or alter messages. Backup freshness defaults to 26 hours. External alerting, uptime monitoring and offsite infrastructure remain **waiting for owner/provider setup**.
