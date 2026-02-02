import type { IncomingRequestCfProperties } from "@cloudflare/workers-types";
import { cors } from "hono/cors";
import { drizzle } from "drizzle-orm/d1";
import { schema } from "./db";
import type { AcHistoryEntry, AcHistoryRow, AcRow, AppBindings, SiteRow } from "./types";

type CfRequest = Request & { cf?: IncomingRequestCfProperties };

const encoder = new TextEncoder();

export const parseOrigins = (value?: string) =>
    value?.split(",").map(origin => origin.trim()).filter(Boolean) ?? ["http://localhost:5173"];

export const buildCorsMiddleware = (origins: string[]) =>
    cors({
        origin: origins,
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        exposeHeaders: ["Content-Length"],
        maxAge: 600,
        credentials: true,
    });

export const getDb = (env: AppBindings["Bindings"]) => drizzle(env.DB, { schema });

export const serializeAcRecord = (record: AcRow) => ({
    id: record.id,
    siteId: record.siteId,
    assetCode: record.assetCode,
    location: record.location,
    brand: record.brand,
    lastCondition: record.lastCondition,
    lastServiceAt: record.lastServiceAt instanceof Date ? record.lastServiceAt.toISOString() : new Date(record.lastServiceAt).toISOString(),
    technician: record.technician,
    nextScheduleAt: record.nextScheduleAt instanceof Date ? record.nextScheduleAt.toISOString() : new Date(record.nextScheduleAt).toISOString(),
    freonPressure: record.freonPressure,
    outletTemp: record.outletTemp,
    compressorAmp: record.compressorAmp,
    filterCondition: record.filterCondition,
    photoUrl: record.photoUrl,
    signatureUrl: record.signatureUrl,
    sourceRowRef: record.sourceRowRef,
    parameters: record.parameters ? JSON.parse(record.parameters) : null,
    sheetName: record.sheetName,
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : new Date(record.updatedAt).toISOString(),
});

export const serializeSite = (site: SiteRow & { sheets?: string[]; sheetsList?: { id: string; sheetName: string; acTypeId?: string | null }[] }) => ({
    id: site.id,
    name: site.name,
    description: site.description,
    spreadsheetUrl: site.spreadsheetUrl,
    sheetName: site.sheetName,
    sheets: site.sheets ?? (site.sheetName ? [site.sheetName] : []),
    syncEnabled: Boolean(site.syncEnabled),
    lastSyncedAt: site.lastSyncedAt ? new Date(site.lastSyncedAt).toISOString() : null,
    lastSyncStatus: site.lastSyncStatus,
    deletedAt: site.deletedAt ? new Date(site.deletedAt).toISOString() : null,
    createdAt: site.createdAt instanceof Date ? site.createdAt.toISOString() : new Date(site.createdAt).toISOString(),
    updatedAt: site.updatedAt instanceof Date ? site.updatedAt.toISOString() : new Date(site.updatedAt).toISOString(),
    logoUrl: site.logoUrl ?? null,
    sheetsList: site.sheetsList ?? [],
});

export const serializeHistoryEntry = (entry: AcHistoryRow, userName?: string | null): AcHistoryEntry => {
    let parsedChanges: AcHistoryEntry["changes"] = [];
    if (Array.isArray(entry.changes)) {
        parsedChanges = entry.changes as AcHistoryEntry["changes"];
    } else if (typeof entry.changes === "string") {
        try {
            const raw = JSON.parse(entry.changes) as unknown;
            if (Array.isArray(raw)) {
                parsedChanges = raw as AcHistoryEntry["changes"];
            }
        } catch {
            parsedChanges = [];
        }
    }

    let parsedPhotos: AcHistoryEntry["photos"] = null;
    if (typeof entry.photos === "string") {
        try {
            parsedPhotos = JSON.parse(entry.photos);
        } catch {
            parsedPhotos = null;
        }
    } else if (Array.isArray(entry.photos)) {
        parsedPhotos = entry.photos; // Already parsed if coming from processed query? unlikely for sqlite text
    }

    return {
        id: entry.id,
        acUnitId: entry.acUnitId,
        userId: entry.userId,
        userName: userName ?? null,
        changes: parsedChanges,
        note: entry.note ?? null,
        photos: parsedPhotos,
        createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : new Date(entry.createdAt).toISOString(),
    };
};

export const parseTimestamp = (value: unknown, field: string) => {
    if (typeof value !== "string" || !value) {
        throw new Error(`${field} is required`);
    }
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
        throw new Error(`Invalid date for ${field}`);
    }
    return new Date(ms);
};

export const createImageKitSignature = async (privateKey: string, token: string, expire: number) => {
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(privateKey),
        { name: "HMAC", hash: "SHA-1" },
        false,
        ["sign"]
    );
    const data = encoder.encode(token + expire);
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, data);
    return Array.from(new Uint8Array(signatureBuffer))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
};

export type { CfRequest };
