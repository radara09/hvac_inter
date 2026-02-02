import type { Context, Hono } from "hono";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { sites, siteSheets } from "../db";
import type { AppBindings, SitePayload } from "../types";
import { getDb, serializeSite } from "../utils";
import { requireAdmin, requireSession } from "../middleware/session";
import { fetchSheetMetadata, getAccessToken, isSheetsIntegrationEnabled, syncSiteFromSheet } from "../integrations/googleSheets";

const handleListSites = requireSession(async (c: Context<AppBindings>) => {
    const db = getDb(c.env);
    const user = c.get("user");
    const memberships = (c.get("siteMemberships") ?? []) as AppBindings["Variables"]["siteMemberships"];
    const includeAll = user?.role === "admin";

    let rows: typeof sites.$inferSelect[];

    if (includeAll) {
        rows = await db
            .select()
            .from(sites)
            .where(isNull(sites.deletedAt))
            .orderBy(sites.name);
    } else {
        const allowedIds = memberships.map(entry => entry.siteId);
        if (!allowedIds.length) {
            return c.json({ sites: [] });
        }
        rows = await db
            .select()
            .from(sites)
            .where(and(isNull(sites.deletedAt), inArray(sites.id, allowedIds)))
            .orderBy(sites.name);
    }

    if (rows.length === 0) {
        return c.json({ sites: [] });
    }

    const siteIds = rows.map(r => r.id);
    const sheets = await db
        .select()
        .from(siteSheets)
        .where(inArray(siteSheets.siteId, siteIds));

    const sheetsMap = new Map<string, { id: string; sheetName: string; acTypeId?: string | null }[]>();
    for (const sheet of sheets) {
        const list = sheetsMap.get(sheet.siteId) ?? [];
        list.push({ id: sheet.id, sheetName: sheet.sheetName, acTypeId: sheet.acTypeId });
        sheetsMap.set(sheet.siteId, list);
    }

    return c.json({
        sites: rows.map(r => serializeSite({
            ...r,
            sheets: sheetsMap.get(r.id)?.map(s => s.sheetName) ?? [],
            sheetsList: sheetsMap.get(r.id) ?? []
        })),
    });
});

const handleCreateSite = requireAdmin(async (c: Context<AppBindings>) => {
    const db = getDb(c.env);
    let body: SitePayload;
    try {
        body = await c.req.json<SitePayload>();
    } catch {
        return c.json({ error: "Invalid JSON" }, 400);
    }

    if (!body.name) {
        return c.json({ error: "Name is required" }, 400);
    }

    const payload = {
        id: body.id ?? crypto.randomUUID(),
        name: body.name,
        description: body.description ?? null,
        spreadsheetUrl: body.spreadsheetUrl ?? null,
        sheetName: body.sheetName ?? null, // DEPRECATED
        syncEnabled: body.syncEnabled ?? false,
        ...(typeof body.logoUrl === "undefined" ? {} : { logoUrl: body.logoUrl ?? null }),
    } satisfies typeof sites.$inferInsert;

    await db.insert(sites).values(payload);

    if (body.sheets && Array.isArray(body.sheets)) {
        if (body.sheets.length > 0) {
            const values = body.sheets.map(item => {
                if (typeof item === "string") {
                    return { siteId: payload.id, sheetName: item, acTypeId: null };
                }
                return {
                    siteId: payload.id,
                    sheetName: item.name,
                    acTypeId: item.acTypeId ?? null,
                };
            });
            await db.insert(siteSheets).values(values);
        }
    } else if (body.sheetName) {
        // Fallback for legacy creation
        await db.insert(siteSheets).values({
            siteId: payload.id,
            sheetName: body.sheetName,
        });
    }

    const created = await db.query.sites.findFirst({ where: eq(sites.id, payload.id) });
    const savedSheets = await db.select().from(siteSheets).where(eq(siteSheets.siteId, payload.id));

    return c.json({
        site: created ? serializeSite({ ...created, sheets: savedSheets.map(s => s.sheetName) }) : null,
    }, 201);
});

const handleUpdateSite = requireAdmin(async (c: Context<AppBindings>) => {
    const db = getDb(c.env);
    const id = c.req.param("id");
    let body: SitePayload & { deleted?: boolean };
    try {
        body = await c.req.json<SitePayload & { deleted?: boolean }>();
    } catch {
        return c.json({ error: "Invalid JSON" }, 400);
    }

    const existing = await db.query.sites.findFirst({ where: eq(sites.id, id) });
    if (!existing) {
        return c.json({ error: "Not found" }, 404);
    }

    const updates: Partial<typeof sites.$inferInsert> = {};
    if (typeof body.name !== "undefined") {
        updates.name = body.name;
    }
    if (typeof body.description !== "undefined") {
        updates.description = body.description ?? null;
    }
    if (typeof body.spreadsheetUrl !== "undefined") {
        updates.spreadsheetUrl = body.spreadsheetUrl ?? null;
    }
    // sheetName field update is deprecated but we might still sync it for legacy compatibility if provided
    if (typeof body.sheetName !== "undefined") {
        updates.sheetName = body.sheetName ?? null;
    }
    if (typeof body.syncEnabled !== "undefined") {
        updates.syncEnabled = body.syncEnabled;
    }
    if (typeof body.logoUrl !== "undefined") {
        updates.logoUrl = body.logoUrl ?? null; // NEW
    }
    if (typeof body.deleted !== "undefined") {
        updates.deletedAt = body.deleted ? new Date() : null;
    }

    // Handle sheets update
    if (typeof body.sheetsConfig !== "undefined" && Array.isArray(body.sheetsConfig)) {
        // body.sheetsConfig is { id: string, acTypeId?: string }
        for (const config of body.sheetsConfig) {
            await db.update(siteSheets)
                .set({ acTypeId: config.acTypeId ?? null })
                .where(eq(siteSheets.id, config.id));
        }
    } else if (typeof body.sheets !== "undefined" && Array.isArray(body.sheets)) {
        await db.delete(siteSheets).where(eq(siteSheets.siteId, id));
        if (body.sheets.length > 0) {
            const values = body.sheets.map(item => {
                if (typeof item === "string") {
                    return { siteId: id, sheetName: item, acTypeId: null };
                }
                return {
                    siteId: id,
                    sheetName: item.name,
                    acTypeId: item.acTypeId ?? null,
                };
            });
            await db.insert(siteSheets).values(values);
        }
    } else if (typeof body.sheetName !== "undefined") {
        // Legacy fallback: if only sheetName is provided (and no sheets array), sync it to siteSheets
        await db.delete(siteSheets).where(eq(siteSheets.siteId, id));
        if (body.sheetName) {
            await db.insert(siteSheets).values({
                siteId: id,
                sheetName: body.sheetName,
            });
        }
    }

    if (Object.keys(updates).length > 0) {
        await db.update(sites).set(updates).where(eq(sites.id, id));
    }

    const updated = await db.query.sites.findFirst({ where: eq(sites.id, id) });
    const savedSheets = await db.select().from(siteSheets).where(eq(siteSheets.siteId, id));

    return c.json({
        site: updated ? serializeSite({
            ...updated,
            sheets: savedSheets.map(s => s.sheetName),
            sheetsList: savedSheets.map(s => ({ id: s.id, sheetName: s.sheetName, acTypeId: s.acTypeId }))
        }) : null
    });
});

export const registerSiteRoutes = (app: Hono<AppBindings>) => {
    app.get("/api/sites", handleListSites);
    app.post("/api/sites", handleCreateSite);
    app.patch("/api/sites/:id", handleUpdateSite);
    app.post(
        "/api/sites/:id/sync",
        requireAdmin(async c => {
            const db = getDb(c.env);
            const id = c.req.param("id");
            const site = await db.query.sites.findFirst({ where: eq(sites.id, id) });
            if (!site) {
                return c.json({ error: "Not found" }, 404);
            }
            if (!isSheetsIntegrationEnabled(c.env)) {
                return c.json({ ok: false, reason: "Sheets sync disabled" }, 200);
            }
            const initiator = c.get("user");
            const result = await syncSiteFromSheet(c.env, site, { initiatorUserId: initiator?.id });
            return c.json(result, result.ok ? 200 : 400);
        }),
    );
    app.post(
        "/api/sites/sheets-metadata",
        requireAdmin(async c => {
            const { spreadsheetUrl } = await c.req.json<{ spreadsheetUrl: string }>();
            if (!spreadsheetUrl) {
                return c.json({ error: "Spreadsheet URL required" }, 400);
            }
            if (!isSheetsIntegrationEnabled(c.env)) {
                return c.json({ ok: false, reason: "Sheets sync disabled" }, 200);
            }
            const tokenResult = await getAccessToken(c.env);
            if (!tokenResult.ok) {
                return c.json(tokenResult, 400);
            }
            const result = await fetchSheetMetadata(tokenResult.token, spreadsheetUrl);
            return c.json(result, result.ok ? 200 : 400);
        }),
    );
};
