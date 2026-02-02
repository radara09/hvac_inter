import type { Context, Hono } from "hono";
import { inArray, eq } from "drizzle-orm";
import type { AppBindings, ExtendedAuthApi } from "../types";
import { requireAdmin } from "../middleware/session";
import { getDb } from "../utils";
import { siteEmailAllowlist, sites, userSites, users } from "../db";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
type AdminListResponse = { users?: Array<Record<string, unknown>> } & Record<string, unknown>;

const handleListUsers = requireAdmin(async (c: Context<AppBindings>) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "Unauthorized" }, 401);
    const adminApi = auth.api as ExtendedAuthApi;
    const limit = c.req.query("limit") ?? "25";
    const offset = c.req.query("offset") ?? "0";
    const searchValue = c.req.query("search");

    const query: Record<string, string> = { limit, offset };
    if (searchValue) {
        query.searchValue = searchValue;
        query.searchField = "name";
        query.searchOperator = "contains";
    }

    const response = await adminApi.listUsers({
        headers: c.req.raw.headers,
        request: c.req.raw,
        query,
    });
    let payload: AdminListResponse;
    if (response instanceof Response) {
        payload = (await response.json()) as AdminListResponse;
    } else {
        payload = response as AdminListResponse;
    }

    const apiUsers = (payload.users ?? []) as Array<Record<string, unknown>>;
    const userIds = apiUsers.map(user => user.id).filter((value): value is string => typeof value === "string");

    let siteAssignments = new Map<string, string[]>();
    if (userIds.length > 0) {
        const db = getDb(c.env);
        const rows = await db
            .select({ userId: userSites.userId, siteId: userSites.siteId })
            .from(userSites)
            .where(inArray(userSites.userId, userIds));

        for (const row of rows) {
            const list = siteAssignments.get(row.userId) ?? [];
            list.push(row.siteId);
            siteAssignments.set(row.userId, list);
        }
    }

    const mergedUsers = apiUsers.map(user => {
        const data = (user.data ?? {}) as { siteId?: string | null };
        const fromDb = typeof user.id === "string" ? siteAssignments.get(user.id) ?? [] : [];
        // Support legacy single siteId in data
        const legacySiteId = (user.siteId as string | null | undefined) ?? data.siteId;
        const finalSiteIds = fromDb.length > 0 ? fromDb : legacySiteId ? [legacySiteId] : [];

        return {
            ...user,
            siteIds: finalSiteIds,
            siteId: finalSiteIds[0] ?? null, // Backward compatibility for single site consumers
        };
    });

    return c.json({ ...payload, users: mergedUsers });
});

const handleUpdateUser = requireAdmin(async (c: Context<AppBindings>) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "Unauthorized" }, 401);
    const adminApi = auth.api as ExtendedAuthApi;
    const userId = c.req.param("userId");
    const body = await c.req.json<{
        role?: string;
        email?: string;
        username?: string;
        password?: string;
        banned?: boolean;
        banReason?: string | null;
        banExpires?: string | null;
        siteId?: string | null; // Deprecated
        siteIds?: string[]; // New
    }>();

    const hasSiteChange = typeof body.siteId !== "undefined" || typeof body.siteIds !== "undefined";

    if (!body.role && !body.email && !body.username && !body.password && typeof body.banned === "undefined" && typeof body.banReason === "undefined" && typeof body.banExpires === "undefined" && !hasSiteChange) {
        return c.json({ error: "No changes requested" }, 400);
    }

    if (body.role && !["admin", "user", "viewer"].includes(body.role)) {
        return c.json({ error: "Invalid role" }, 422);
    }

    const updates: Record<string, unknown> = {};
    if (body.email) updates.email = body.email;
    if (body.username) updates.username = body.username;
    if (body.password) {
        if (body.password.length < 8) {
            return c.json({ error: "Password must be at least 8 characters" }, 422);
        }
        updates.password = body.password;
    }
    if (typeof body.banned === "boolean") {
        updates.banned = body.banned;
        updates.banReason = body.banned ? body.banReason ?? "Managed via dashboard" : null;
    }

    if (typeof body.banReason === "string" && !body.banned) {
        updates.banReason = body.banReason;
    }

    if (body.banExpires) {
        const expiresMs = Number(new Date(body.banExpires));
        if (!Number.isNaN(expiresMs)) {
            updates.banExpires = expiresMs;
        }
    } else if (body.banExpires === null) {
        updates.banExpires = null;
    }

    try {
        if (body.role) {
            await adminApi.setRole({
                headers: c.req.raw.headers,
                request: c.req.raw,
                body: {
                    userId,
                    role: body.role,
                },
            });
        }

        if (Object.keys(updates).length > 0) {
            await adminApi.adminUpdateUser({
                headers: c.req.raw.headers,
                request: c.req.raw,
                body: {
                    userId,
                    data: updates,
                },
            });
        }

        if (hasSiteChange) {
            const db = getDb(c.env);
            await db.delete(userSites).where(eq(userSites.userId, userId));

            const targetSiteIds = body.siteIds ?? (body.siteId ? [body.siteId] : []);
            const uniqueSiteIds = Array.from(new Set(targetSiteIds)); // Dedup

            if (uniqueSiteIds.length > 0) {
                await db.insert(userSites).values(
                    uniqueSiteIds.map(sid => ({ userId, siteId: sid, role: "member" }))
                );
            }
        }

        return c.json({ success: true });
    } catch (error) {
        console.error("Failed to update user", error);
        return c.json({ error: "Failed to update user" }, 500);
    }
});

const handleListAllowlist = requireAdmin(async (c: Context<AppBindings>) => {
    const db = getDb(c.env);
    const entries = await db
        .select({
            id: siteEmailAllowlist.id,
            email: siteEmailAllowlist.email,
            siteId: siteEmailAllowlist.siteId,
            createdAt: siteEmailAllowlist.createdAt,
            siteName: sites.name,
        })
        .from(siteEmailAllowlist)
        .leftJoin(sites, eq(siteEmailAllowlist.siteId, sites.id));

    return c.json({ entries });
});

const handleCreateAllowlist = requireAdmin(async (c: Context<AppBindings>) => {
    const db = getDb(c.env);
    const rawBody = await c.req
        .json<{ email?: string; siteId?: string }>()
        .catch(() => null);
    const email = (rawBody?.email ?? "").trim().toLowerCase();
    const siteId = (rawBody?.siteId ?? "").trim();

    if (!email || !siteId || !EMAIL_PATTERN.test(email)) {
        return c.json({ error: "Data tidak valid" }, 422);
    }

    const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).limit(1);
    if (!site) {
        return c.json({ error: "Site tidak ditemukan" }, 404);
    }

    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existingUser) {
        return c.json({ error: "Email sudah terdaftar sebagai user" }, 409);
    }

    const [existingEntry] = await db.select({ id: siteEmailAllowlist.id }).from(siteEmailAllowlist).where(eq(siteEmailAllowlist.email, email)).limit(1);
    if (existingEntry) {
        return c.json({ error: "Email sudah ada dalam allowlist" }, 409);
    }

    await db.insert(siteEmailAllowlist).values({ email, siteId });

    const [entry] = await db
        .select({
            id: siteEmailAllowlist.id,
            email: siteEmailAllowlist.email,
            siteId: siteEmailAllowlist.siteId,
            createdAt: siteEmailAllowlist.createdAt,
            siteName: sites.name,
        })
        .from(siteEmailAllowlist)
        .leftJoin(sites, eq(siteEmailAllowlist.siteId, sites.id))
        .where(eq(siteEmailAllowlist.email, email))
        .limit(1);

    return c.json({ entry }, 201);
});

const handleDeleteAllowlist = requireAdmin(async (c: Context<AppBindings>) => {
    const db = getDb(c.env);
    const allowlistId = c.req.param("allowlistId");
    await db.delete(siteEmailAllowlist).where(eq(siteEmailAllowlist.id, allowlistId));
    return c.json({ success: true });
});

const handleDeleteUser = requireAdmin(async (c: Context<AppBindings>) => {
    const db = getDb(c.env);
    const userId = c.req.param("userId");

    // Delete related data first (manually if no cascade)
    await db.delete(userSites).where(eq(userSites.userId, userId));
    // Drizzle/SQL usually handles cascade if defined, but being explicit is safe for simple relations
    await db.delete(users).where(eq(users.id, userId));

    return c.json({ success: true });
});

export const registerAdminRoutes = (app: Hono<AppBindings>) => {
    app.get("/api/admin/users", handleListUsers);
    app.patch("/api/admin/users/:userId", handleUpdateUser);
    app.delete("/api/admin/users/:userId", handleDeleteUser);
    app.get("/api/admin/allowlist", handleListAllowlist);
    app.post("/api/admin/allowlist", handleCreateAllowlist);
    app.delete("/api/admin/allowlist/:allowlistId", handleDeleteAllowlist);
};
