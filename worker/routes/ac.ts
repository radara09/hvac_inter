import type { Context, Hono } from "hono";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { acUnitHistory, acUnits, sites, users, siteSheets, acTypes } from "../db";
import type { AppBindings, CreateAcRequest, UpdateAcRequest, AcHistoryChangeSet } from "../types";
import { getDb, parseTimestamp, serializeAcRecord, serializeHistoryEntry } from "../utils";
import { requireSession } from "../middleware/session";
import { syncRecordToSheet } from "../integrations/googleSheets";

const allowedUpdateFields: (keyof UpdateAcRequest)[] = [
    "freonPressure",
    "outletTemp",
    "compressorAmp",
    "filterCondition",
    "lastCondition",
    "lastServiceAt",
    "photoUrl",
    "signatureUrl",
    "parameters",
];

const resolveAccessibleSiteIds = (c: Context<AppBindings>) => {
    const user = c.get("user");
    if (!user) return [];
    if (user.role === "admin") return null;
    const memberships = c.get("siteMemberships") ?? [];
    return memberships.map(entry => entry.siteId);
};

const ensureSiteAccess = (c: Context<AppBindings>, siteId: string) => {
    const user = c.get("user");
    if (user?.role === "admin") {
        return true;
    }
    const siteIds = resolveAccessibleSiteIds(c);
    if (!siteIds?.length || !siteIds.includes(siteId)) {
        return false;
    }
    return true;
};

const addMonths = (date: Date, months: number) => {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
};

const handleGetRecords = requireSession(async (c: Context<AppBindings>) => {
    const db = getDb(c.env);
    const user = c.get("user");
    if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
    }
    const search = c.req.query("search") ?? "";
    const siteIdParam = c.req.query("siteId") ?? undefined;
    const accessibleSiteIds = resolveAccessibleSiteIds(c);

    let filters = null;
    if (user.role !== "admin") {
        if (!accessibleSiteIds?.length) {
            return c.json({ records: [] });
        }
        filters = inArray(acUnits.siteId, accessibleSiteIds);
    } else if (siteIdParam) {
        filters = eq(acUnits.siteId, siteIdParam);
    }

    if (search) {
        const keyword = `%${search}%`;
        const searchFilter = or(like(acUnits.location, keyword), like(acUnits.assetCode, keyword));
        filters = filters ? and(filters, searchFilter) : searchFilter;
    }

    const rows = await db
        .select()
        .from(acUnits)
        .where(filters ?? undefined)
        .orderBy(desc(acUnits.updatedAt))
        .limit(15000);

    return c.json({ records: rows.map(serializeAcRecord) });
});

const handleGetRecordById = requireSession(async (c: Context<AppBindings>) => {
    const db = getDb(c.env);
    const user = c.get("user");
    if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const record = await db.query.acUnits.findFirst({ where: eq(acUnits.id, id) });
    if (!record) {
        return c.json({ error: "Not found" }, 404);
    }
    if (!ensureSiteAccess(c, record.siteId) && record.ownerId !== user.id) {
        return c.json({ error: "Forbidden" }, 403);
    }

    const historyRows = await db
        .select({ entry: acUnitHistory, userName: users.name })
        .from(acUnitHistory)
        .leftJoin(users, eq(acUnitHistory.userId, users.id))
        .where(eq(acUnitHistory.acUnitId, record.id))
        .orderBy(desc(acUnitHistory.createdAt))
        .limit(50);

    return c.json({ record: serializeAcRecord(record), history: historyRows.map(row => serializeHistoryEntry(row.entry, row.userName)) });
});

const handleGetPublicRecordById = async (c: Context<AppBindings>) => {
    const db = getDb(c.env);
    const id = c.req.param("id");
    const record = await db.query.acUnits.findFirst({ where: eq(acUnits.id, id) });
    if (!record) {
        return c.json({ error: "Not found" }, 404);
    }

    const historyRows = await db
        .select({ entry: acUnitHistory, userName: users.name })
        .from(acUnitHistory)
        .leftJoin(users, eq(acUnitHistory.userId, users.id))
        .where(eq(acUnitHistory.acUnitId, record.id))
        .orderBy(desc(acUnitHistory.createdAt))
        .limit(50);

    const site = await db.query.sites.findFirst({
        where: eq(sites.id, record.siteId),
        columns: { name: true },
    });

    return c.json({
        record: serializeAcRecord(record),
        siteName: site?.name ?? null,
        history: historyRows.map(row => serializeHistoryEntry(row.entry, row.userName)),
    });
};

const handleCreateRecord = requireSession(async (c: Context<AppBindings>) => {
    const db = getDb(c.env);
    const user = c.get("user");
    if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
        return c.json({ error: "Forbidden" }, 403);
    }
    let body: CreateAcRequest;
    try {
        body = await c.req.json<CreateAcRequest>();
    } catch {
        return c.json({ error: "Invalid JSON" }, 400);
    }

    const requiredFields: (keyof CreateAcRequest)[] = [
        "siteId",
        "assetCode",
        "location",
        "brand",
        "lastCondition",
        "lastServiceAt",
        "nextScheduleAt",
        "technician",
    ];
    for (const field of requiredFields) {
        if (!body[field]) {
            return c.json({ error: `${field} is required` }, 400);
        }
    }

    const payload = {
        id: body.id ?? crypto.randomUUID(),
        siteId: body.siteId,
        assetCode: body.assetCode,
        location: body.location,
        brand: body.brand,
        lastCondition: body.lastCondition,
        lastServiceAt: parseTimestamp(body.lastServiceAt, "lastServiceAt"),
        technician: body.technician,
        nextScheduleAt: parseTimestamp(body.nextScheduleAt, "nextScheduleAt"),
        freonPressure: body.freonPressure ?? null,
        outletTemp: body.outletTemp ?? null,
        compressorAmp: body.compressorAmp ?? null,
        filterCondition: body.filterCondition ?? null,
        photoUrl: body.photoUrl ?? null,
        parameters: body.parameters ? JSON.stringify(body.parameters) : null,
        sheetName: body.sheetName ?? null,
        ownerId: user.id,
        sourceRowRef: null,
    } satisfies typeof acUnits.$inferInsert;

    await db.insert(acUnits).values(payload);
    const created = await db.query.acUnits.findFirst({ where: eq(acUnits.id, payload.id) });
    return c.json({ record: created ? serializeAcRecord(created) : null }, 201);
});

const handleUpdateRecord = requireSession(async (c: Context<AppBindings>) => {
    const db = getDb(c.env);
    const user = c.get("user");
    if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const record = await db.query.acUnits.findFirst({ where: eq(acUnits.id, id) });
    if (!record) {
        return c.json({ error: "Not found" }, 404);
    }
    if (user.role === "viewer") {
        return c.json({ error: "Forbidden" }, 403);
    }
    if (!ensureSiteAccess(c, record.siteId) && record.ownerId !== user.id) {
        return c.json({ error: "Forbidden" }, 403);
    }
    const site = await db.query.sites.findFirst({ where: eq(sites.id, record.siteId) });

    let body: UpdateAcRequest;
    try {
        body = await c.req.json<UpdateAcRequest>();
    } catch {
        return c.json({ error: "Invalid JSON" }, 400);
    }

    const hasAllowedField = allowedUpdateFields.some(field => typeof body[field] !== "undefined");
    if (!hasAllowedField) {
        return c.json({ error: "No editable fields provided" }, 400);
    }

    const updates: Partial<typeof acUnits.$inferInsert> = {};
    const changeSet: AcHistoryChangeSet[] = [];

    const formatValue = (value: unknown) => {
        if (value instanceof Date) return value.toISOString();
        if (typeof value === "number") return new Date(value).toISOString();
        return (value as string | null) ?? null;
    };

    for (const field of allowedUpdateFields) {
        if (typeof body[field] === "undefined") continue;
        const nextValue = body[field] ?? null;
        const previousValue = (record as Record<string, unknown>)[field];
        if (nextValue !== previousValue) {
            changeSet.push({ field, previous: formatValue(previousValue), current: formatValue(nextValue) });
        }
        if (field === "parameters" && nextValue !== null) {
            (updates as Record<string, unknown>)[field] = JSON.stringify(nextValue);
        } else {
            (updates as Record<string, unknown>)[field] = nextValue;
        }
    }

    const serviceDate = body.lastServiceAt ? parseTimestamp(body.lastServiceAt, "lastServiceAt") : new Date();
    updates.lastServiceAt = serviceDate;
    updates.nextScheduleAt = addMonths(serviceDate, 3);
    const technicianName = user.displayUsername ?? user.username ?? user.name ?? user.email ?? "Teknisi";
    updates.technician = technicianName;

    await db.update(acUnits).set(updates).where(eq(acUnits.id, id));

    if (changeSet.length || (body.photos && body.photos.length > 0)) {
        await db.insert(acUnitHistory).values({
            id: crypto.randomUUID(),
            acUnitId: id,
            userId: user.id,
            changes: JSON.stringify(changeSet),
            note: body.note ?? null,
            photos: body.photos ? JSON.stringify(body.photos) : null,
            createdAt: new Date(),
        });
    }

    const updated = await db.query.acUnits.findFirst({ where: eq(acUnits.id, id) });
    if (!updated) {
        return c.json({ error: "Failed to fetch" }, 500);
    }

    if (site?.syncEnabled && site.spreadsheetUrl) {
        // Fetch AcType config for sync
        let fieldConfig: { label: string; key: string; cell: string }[] | null = null;
        const targetSheetName = updated.sheetName ?? site.sheetName;

        if (targetSheetName) {
            const sheetConfig = await db
                .select({
                    fields: acTypes.fields
                })
                .from(siteSheets)
                .leftJoin(acTypes, eq(siteSheets.acTypeId, acTypes.id))
                .where(and(
                    eq(siteSheets.siteId, updated.siteId),
                    eq(siteSheets.sheetName, targetSheetName)
                ))
                .limit(1);
            
            if (sheetConfig.length > 0 && sheetConfig[0].fields) {
                try {
                    fieldConfig = JSON.parse(sheetConfig[0].fields);
                } catch (e) {
                    console.error("Failed to parse acType fields for sync", e);
                }
            }
        }

        const syncPromise = syncRecordToSheet(c.env, site, updated, fieldConfig).catch(error => {
            console.error("Failed to push update to Sheets", error);
            return { ok: false, reason: error instanceof Error ? error.message : "unknown" };
        });
        if (c.executionCtx && typeof c.executionCtx.waitUntil === "function") {
            c.executionCtx.waitUntil(syncPromise.then(result => {
                if (!result.ok) {
                    console.warn("Sheets sync skipped", result.reason ?? "Unknown reason");
                }
            }));
        } else {
            void syncPromise;
        }
    }

    return c.json({ record: serializeAcRecord(updated) });
});

export const registerAcRoutes = (app: Hono<AppBindings>) => {
    app.get("/api/ac", handleGetRecords);
    app.get("/api/ac/:id", handleGetRecordById);
    app.get("/api/public/ac/:id", handleGetPublicRecordById);
    app.post("/api/ac", handleCreateRecord);
    app.patch("/api/ac/:id", handleUpdateRecord);
};
