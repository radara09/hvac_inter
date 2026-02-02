import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";
import { users } from "./auth.schema";

const defaultNow = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const sites = sqliteTable("sites", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    description: text("description"),
    spreadsheetUrl: text("spreadsheet_url"),
    sheetName: text("sheet_name"), // DEPRECATED: usage moved to site_sheets table
    syncEnabled: integer("sync_enabled", { mode: "boolean" }).default(false).notNull(),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
    lastSyncStatus: text("last_sync_status"),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(defaultNow).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .default(defaultNow)
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
    logoUrl: text("logo_url"),
});

export const acTypes = sqliteTable("ac_types", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    fields: text("fields").notNull(), // JSON array of { label, key }
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(defaultNow).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .default(defaultNow)
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
});

export const siteSheets = sqliteTable("site_sheets", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    siteId: text("site_id")
        .notNull()
        .references(() => sites.id, { onDelete: "cascade" }),
    sheetName: text("sheet_name").notNull(),
    acTypeId: text("ac_type_id").references(() => acTypes.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(defaultNow).notNull(),
});

export const siteEmailAllowlist = sqliteTable("site_email_allowlist", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    email: text("email")
        .notNull()
        .unique(),
    siteId: text("site_id")
        .notNull()
        .references(() => sites.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .default(defaultNow)
        .notNull(),
});

export const userSites = sqliteTable(
    "user_sites",
    {
        id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        siteId: text("site_id")
            .notNull()
            .references(() => sites.id, { onDelete: "cascade" }),
        role: text("role").default("member").notNull(),
        createdAt: integer("created_at", { mode: "timestamp_ms" }).default(defaultNow).notNull(),
    },
    table => ({
        uniqueMembership: unique("user_site_unique").on(table.userId, table.siteId),
    }),
);

export const acUnits = sqliteTable("ac_units", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    siteId: text("site_id")
        .notNull()
        .references(() => sites.id, { onDelete: "cascade" }),
    assetCode: text("asset_code").notNull(),
    location: text("location").notNull(),
    brand: text("brand").notNull(),
    lastCondition: text("last_condition").notNull(),
    lastServiceAt: integer("last_service_at", { mode: "timestamp_ms" }).notNull(),
    technician: text("technician").notNull(),
    nextScheduleAt: integer("next_schedule_at", { mode: "timestamp_ms" }).notNull(),
    freonPressure: text("freon_pressure"),
    outletTemp: text("outlet_temp"),
    compressorAmp: text("compressor_amp"),
    filterCondition: text("filter_condition"),
    parameters: text("parameters"), // JSON object for custom fields
    sheetName: text("sheet_name"),
    photoUrl: text("photo_url"),
    signatureUrl: text("signature_url"),
    ownerId: text("owner_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    sourceRowRef: text("source_row_ref"),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(defaultNow).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .default(defaultNow)
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
});

export const acUnitHistory = sqliteTable("ac_unit_history", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    acUnitId: text("ac_unit_id")
        .notNull()
        .references(() => acUnits.id, { onDelete: "cascade" }),
    userId: text("user_id")
        .references(() => users.id, { onDelete: "set null" }),
    changes: text("changes").notNull(),
    note: text("note"),
    photos: text("photos"), // JSON array of { url, label }
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(defaultNow).notNull(),
});
