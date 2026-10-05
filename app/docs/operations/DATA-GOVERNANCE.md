# Studio data controls

Implemented: studio-owner-only core JSON record export, optional project, task and conversation uploaded file content (100 MB combined limit), reversible project archiving/restoring with typed title confirmation, configurable archived-project review interval, and a dry-run review list.

Bulk purge is deliberately unavailable. A single client can be erased for a UK GDPR request from their record (`client-erasure.mjs`); erasure is refused while the client has issued invoices, proposals, contracts or documents. Issued invoices, proposals, contracts and document archives are flagged as protected. Changing a review interval never deletes anything. Existing archived projects without an archive timestamp use their most recent update as the review baseline.

Exports include task collaboration, message reply/mention metadata, CRM contacts and project stakeholder relationships. Each file records its source (project, task or conversation). Exports omit passwords, sessions, invite tokens, provider credentials and notification payloads. PDF bytes are downloaded separately. The export is a portable core-record format, not a full restore artifact; use the encrypted database backup tooling for recovery.

Integration:

- `installDataGovernance(db)` after database initialization.
- Authenticated owner GET/POST `/api/data-governance` call `dataGovernance(db,args)` / `changeGovernance(db,args,body)`.
- Owner GET `/api/studio-export` calls `exportStudio(db,args,{includeFiles: query.files==='1'})`, responds JSON attachment and `Cache-Control: private, no-store`.
- `args` is `{studioId,userId}` from the authenticated request, never client-supplied user identity.
- Render `DataGovernanceSettings` in owner Settings, passing `{studio,request,onChanged}`. Refresh projects on change.

All functions independently enforce owner membership. No actual saved studio data was exported, archived or deleted during implementation tests; isolated demo databases only.
