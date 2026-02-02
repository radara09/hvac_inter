# RSUD AC Control Panel

A Cloudflare Worker + React dashboard for managing AC units across multiple RSUD sites. The latest iteration introduces per-site access control, edit history logging, and an ImageKit-powered maintenance workflow.

## Highlights

- **Multi-site ownership** – `sites`, `user_sites`, and `ac_units.site_id` keep records siloed. Admins can CRUD sites (with soft delete) and assign spreadsheets per location.
- **Scoped access** – Session middleware now loads memberships so non-admins automatically filter `/api/ac` queries to their sites. Admins bypass the filter.
- **History & auditing** – Every PATCH to `/api/ac/:id` logs a JSON change-set in `ac_unit_history`, capturing who edited which field and when.
- **Dashboard metrics** – Total units, overdue servicing, bermasalah count, technician totals (non-admin users), last update timestamp, plus a live card showing the latest updated unit and its photo.
- **Maintenance workspace** – Search + select AC units, read-only specs, limited update form (freon, suhu keluar, ampere, filter, kondisi, last service, photo), compact ImageKit uploader, and a detailed change timeline.
- **Admin tooling** – Existing user admin plus a new Site Management page (CRUD, toggle sync, soft delete, manual sync trigger stub).

## Worker / API overview

| Endpoint | Description |
| --- | --- |
| `GET /api/ac?search=` | Returns AC units filtered by the caller's sites (admins can pass `siteId`). |
| `GET /api/ac/:id` | Detailed record + latest history entries, still scoped by site. |
| `PATCH /api/ac/:id` | Allows updates to freon pressure, outlet temp, compressor amp, filter condition, last condition, last service timestamp, photo URL, and optional note. Auto-updates technician + next schedule (+3 months). |
| `GET /api/sites` | Admins receive all sites, members only see theirs. |
| `POST /api/sites` | Admin-only create with spreadsheet metadata and sync flags. |
| `PATCH /api/sites/:id` | Admin-only updates, including soft delete toggles. |
| `POST /api/sites/:id/sync` | Manual sync endpoint that imports AC rows from the linked Google Sheet (admin only). |

Supporting modules:
- `worker/integrations/googleSheets.ts` now generates Google service account tokens, ingests spreadsheets, and pushes record updates back to Sheets when technicians submit maintenance forms.
- `worker/utils.ts` gained serializers for sites and history entries.

## Google Sheets integration

Set the following env vars to enable bi-directional sync. `GOOGLE_SERVICE_ACCOUNT_KEY` must contain the full JSON credentials for a service account with the Sheets API enabled (wrap the JSON in quotes or base64 encode it for `.dev.vars`). `ENABLE_SHEETS_SYNC=true` globally enables syncing, while each site still has its own toggle in the admin UI.

```
GOOGLE_SERVICE_ACCOUNT_KEY="{\"type\":\"service_account\",...}"
ENABLE_SHEETS_SYNC=true
```
Each site row in the admin panel accepts any Google Sheets URL (preferably the share link with either `range=Sheet1!A:L` or `gid=<tabId>`). Columns should follow the seeded dataset headers (`ID_AC`, `Lokasi`, `Merek`, `Kondisi Terakhir`, `Service Terakhir`, `Teknisi`, `Jadwal Berikut`, `Tekanan Freon`, `Suhu Keluar`, `Ampere Kompresor`, `Kondisi Filter`, `Foto URL`). The manual sync button imports/updates those rows, while technician edits push their changes back to the matching `ID_AC` row.

## Development workflow

```bash
npm install
npm run dev            # Vite dev server + worker in watch mode
npm run build          # Type-check + production build
npm run db:generate    # Rebuild Drizzle migrations after schema tweaks
```

Drizzle migration `drizzle/0002_curious_hobgoblin.sql` creates the new tables and backfills legacy AC rows into a `site-legacy` bucket so existing databases keep working.

### Seeding

```
SEED_AC_OWNER_EMAIL=admin@example.com
npm run seed:ac
```

The seed script now:

- Creates two demo sites with placeholder spreadsheet URLs
- Links the seed owner to both sites via `user_sites`
- Assigns each seeded AC unit to a site and writes an initial history entry

## Frontend structure

- `DashboardPage` – Mini stat tiles, summary callouts, and the latest AC detail card with photo preview.
- `MaintenancePage` – Search + select list, read-only hardware info, inline edit form (allowed fields only), compact ImageKit upload, and edit history timeline.
- `AdminSitesPage` – CRUD UI for site metadata plus manual sync / soft delete toggles.

Hooks:

- `useAcRecords` handles list/search, selection, detail loading, PATCH calls, and history state.
- `useSites` keeps site metadata fresh for both maintenance filtering and admin management.

## ImageKit uploads

`ImageKitUpload` now supports a `variant="compact"` mode that renders the lean uploader inside the maintenance form. Both variants use `/api/imagekit/auth` for temporary signature exchange.

## Manual verification matrix

1. Run `npm run seed:ac`, login as a technician tied to a site, confirm `/api/ac` only returns that site's units and the maintenance form limits editable fields.
2. Upload a photo via the maintenance form, ensure ImageKit returns a URL and the history timeline records the change.
3. Login as admin, create/update/delete a site from the Site Management page, trigger sync (expect “disabled” status), and verify dashboard stats update.
4. Hit `/api/ac/:id` from devtools to confirm history entries are returned.
5. Run `npm run build && npm run preview` before deploying.
