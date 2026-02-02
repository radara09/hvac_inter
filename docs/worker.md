# Backend Documentation (`worker/`)

The `worker/` directory contains the backend application logic, built using **Hono** and deployed on **Cloudflare Workers**. It serves as the API layer for the application, handling authentication, data management, and business logic.

## Architecture Overview

- **Framework**: [Hono](https://hono.dev/) - A small, fast, and web-standard compliant web framework.
- **Runtime**: Cloudflare Workers.
- **Database**: Cloudflare D1 (SQLite), accessed via Drizzle ORM.
- **Authentication**: [Better Auth](https://better-auth.com/), configured with Drizzle adapter.

## Directory Structure

### `worker/index.ts`
The entry point of the application.
- Initializes the Hono app (`const app = new Hono<AppBindings>()`).
- Sets up global middleware:
    - **CORS**: Configured via `buildCorsMiddleware` to allow requests from the frontend.
    - **Session**: `sessionMiddleware` runs on all routes to populate `c.get("user")` and `c.get("session")`.
- Registers route modules:
    - `registerAuthRoutes` (Better Auth)
    - `registerAcRoutes` (AC Units & History)
    - `registerAdminRoutes` (User & Site Management)
    - `registerSiteRoutes` (Site CRUD)
    - `registerImageKitRoutes` (Image Upload Auth)
    - `registerProfileRoutes` (User Profile)
- Exports the `fetch` handler for Cloudflare Workers.

### `worker/auth/`
Contains the authentication configuration using **Better Auth**.
- **`index.ts`**:
    - Configures `betterAuth` with `drizzleAdapter`.
    - Sets up plugins:
        - `anonymous`: For guest access (if needed).
        - `username`: For username/password login.
        - `admin`: For role-based access control (RBAC) using `better-auth/plugins/access`.
    - Defines roles (`admin`, `user`) and their permissions.
    - Configures Google OAuth (if credentials are provided in env).
    - Rate limiting is enabled for sign-in/sign-up endpoints.

### `worker/db/`
Database schema definitions and utilities.
- **`index.ts`**: Exports the Drizzle schema and the `drizzle` client instance.
- **`schema.ts`**: Re-exports all schema definitions.
- **`auth.schema.ts`**: Tables required by Better Auth (`user`, `session`, `account`, `verification`).
- **`ac.schema.ts`**: Application-specific tables:
    - `sites`: Locations where AC units are installed.
    - `ac_units`: The AC assets themselves.
    - `ac_unit_history`: Audit log of changes to AC units.
    - `user_sites`: Many-to-many relationship between users and sites (for assignment).
    - `site_email_allowlist`: Whitelist for allowing registration by email domain/address per site.

### `worker/middleware/`
- **`session.ts`**:
    - `sessionMiddleware`: Integrates Better Auth with Hono context.
    - `requireSession`: Higher-order function to protect routes that require login.
    - `requireAdmin`: Higher-order function to protect admin-only routes.

### `worker/routes/`
Route handlers grouped by domain.
- **`ac.ts`**:
    - `GET /api/ac`: List AC units (filtered by user's assigned site).
    - `POST /api/ac`: Create a new AC unit.
    - `PATCH /api/ac/:id`: Update an AC unit (records history automatically).
    - `GET /api/ac/:id/history`: Get history for a specific unit.
- **`admin.ts`**:
    - `GET /api/admin/users`: List all users (admin only).
    - `PATCH /api/admin/users/:userId`: Update user role, ban status, or site assignment.
    - `GET /api/admin/allowlist`: Manage the email allowlist.
- **`sites.ts`**:
    - `GET /api/sites`: List available sites.
    - `POST /api/sites`: Create a new site (admin only).
    - `POST /api/sites/:id/sync`: Trigger Google Sheets sync (if configured).

### `worker/integrations/`
- **`googleSheets.ts`**: Contains logic to fetch data from a public Google Sheet and sync it to the `ac_units` table. This allows for bulk import/updates from a spreadsheet.

## Key Concepts

### Context (`c`)
The Hono context object `c` is used to access:
- **Environment Variables**: `c.env` (typed as `AppBindings`).
- **Request Data**: `c.req.json()`, `c.req.param()`, etc.
- **Auth State**: `c.get("user")` and `c.get("session")` (populated by middleware).

### Database Access
Database access is done via `getDb(c.env)`. This returns a Drizzle client instance bound to the D1 database in the current environment.

```typescript
const db = getDb(c.env);
const result = await db.select().from(users).all();
```

### Error Handling
Global error handling is minimal in `index.ts`, returning 404 for unknown routes. Specific routes handle their own errors (e.g., 400 for bad input, 401 for unauthorized) and return JSON responses.
