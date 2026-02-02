import type {
    AuthApi,
    AuthInstance,
    AuthSessionData,
    AuthSessionUser,
} from "./auth";
import type { D1Database } from "@cloudflare/workers-types";
import { acUnits, acUnitHistory, sites } from "./db";

export type AcRow = typeof acUnits.$inferSelect;
export type SiteRow = typeof sites.$inferSelect;
export type AcHistoryRow = typeof acUnitHistory.$inferSelect;

export type AppBindings = {
    Bindings: {
        DB: D1Database;
        IMAGEKIT_PUBLIC_KEY: string;
        IMAGEKIT_PRIVATE_KEY: string;
        FRONTEND_URL: string;
        GOOGLE_SERVICE_ACCOUNT_KEY: string;
    };
    Variables: {
        user: SessionUser | null;
        session: SessionData | null;
        auth: AppAuth | null;
        siteMemberships: {
            siteId: string;
            role: string;
            siteName: string;
            spreadsheetUrl: string | null;
        }[];
    };
};

export type AcHistoryChangeSet = {
    field: string;
    previous: string | null;
    current: string | null;
};

export type SessionUser = AuthSessionUser & {
    role?: string | null;
    siteId?: string | null;
    siteName?: string | null;
    username?: string | null;
    displayUsername?: string | null;
};
export type SessionData = AuthSessionData;

export type AppAuth = AuthInstance & { api: AuthApi };

export type CreateAcRequest = {
    id?: string;
    siteId: string;
    assetCode: string;
    location: string;
    brand: string;
    lastCondition: string;
    lastServiceAt: string;
    technician: string;
    nextScheduleAt: string;
    freonPressure?: string;
    outletTemp?: string;
    compressorAmp?: string;
    filterCondition?: string;
    photoUrl?: string;
    signatureUrl?: string;
    parameters?: Record<string, string>;
    sheetName?: string;
};

export type UpdateAcRequest = {
    freonPressure?: string | null;
    outletTemp?: string | null;
    compressorAmp?: string | null;
    filterCondition?: string | null;
    lastCondition?: string | null;
    lastServiceAt?: string | null;
    photoUrl?: string | null;
    signatureUrl?: string | null;
    photos?: { url: string; label: string }[]; // NEW
    parameters?: string | null;
    note?: string | null;
};

// ...

export type SitePayload = {
    id?: string;
    name: string;
    description?: string;
    spreadsheetUrl?: string;
    sheetName?: string; // DEPRECATED
    sheets?: (string | { name: string; acTypeId?: string | null })[]; // NEW
    syncEnabled?: boolean;
    logoUrl?: string; // NEW
    sheetsConfig?: { id: string; acTypeId?: string | null }[];
};

// ...

export type AcHistoryEntry = {
    id: string;
    acUnitId: string;
    userId: string | null;
    userName?: string | null;
    changes: AcHistoryChangeSet[];
    note?: string | null;
    photos?: { url: string; label: string }[] | null; // NEW
    createdAt: string;
};

export type ExtendedAuthApi = AuthApi & {
    listUsers: (ctx: { headers: Headers; request: Request; query: Record<string, string> }) => Promise<unknown>;
    setRole: (ctx: { headers: Headers; request: Request; body: { userId: string; role: string | string[] } }) => Promise<unknown>;
    adminUpdateUser: (ctx: {
        headers: Headers;
        request: Request;
        body: { userId: string; data: Record<string, unknown> };
    }) => Promise<unknown>;
};
