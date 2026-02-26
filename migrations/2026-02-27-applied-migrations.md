# Applied migrations (run in pgAdmin 4)

Date applied: 2026-02-26

Applied by: (applied manually via pgAdmin 4)

Migrations applied:

- migrations/2026-02-19-add-avatar-url-to-users.sql
- migrations/2026-02-20-add-property-fields.sql
- migrations/2026-02-20-drop-legacy-location-columns.sql
- migrations/2026-02-21-add-conversations-and-messages.sql
- migrations/2026-02-23-fix-upload-urls.sql
- migrations/2026-02-25-add-location-to-users.sql
- migrations/2026-02-25-backfill-user-location.sql
- migrations/2026-02-25-create-notifications-table.sql
- migrations/2026-02-26-add-admin-profile-columns.sql
- migrations/2026-02-26-add-bio-gender-phone.sql
- migrations/2026-02-26-copy-profile_picture-to-avatar_url.sql
- migrations/2026-02-26-drop-profile_picture.sql
- migrations/2026-02-26-set-price-default.sql
- migrations/2026-02-26-sync-properties-sequence.sql

Notes:

- These were executed manually in pgAdmin 4 by the user.
- Verification scripts (`scripts/check-properties.cjs`, `scripts/db-check.js`) were attempted by the automation but did not complete due to missing/interactive DB connectivity in this environment. Please run those locally or provide DB connection details if you want me to run them here.
