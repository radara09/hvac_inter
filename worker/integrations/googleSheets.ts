import { and, eq } from "drizzle-orm";
import { acUnits, sites, siteSheets, acTypes } from "../db";
import { getDb } from "../utils";
import type { AcRow, AppBindings, SiteRow } from "../types";

export type SheetSyncResult = {
    ok: boolean;
    reason?: string;
    rowsImported?: number;
    rowsInserted?: number;
    rowsUpdated?: number;
    rowsSkipped?: number;
};

const getColumnLetter = (count: number) => {
    let dividend = count;
    let columnName = "";
    while (dividend > 0) {
        const modulo = (dividend - 1) % 26;
        columnName = String.fromCharCode(65 + modulo) + columnName;
        dividend = Math.floor((dividend - modulo) / 26);
    }
    return columnName || "A";
};

// Helper to convert "B" or "AB" to 0-based index
const getColumnIndex = (cellRef: string) => {
    if (!cellRef) return -1;
    const match = cellRef.match(/^([A-Z]+)/i);
    if (!match) return -1;
    const letters = match[1].toUpperCase();
    let index = 0;
    for (let i = 0; i < letters.length; i++) {
        index = index * 26 + (letters.charCodeAt(i) - 64);
    }
    return index - 1;
};

type SpreadsheetTarget = {
    spreadsheetId: string;
    sheetName: string;
    range: string;
};

export type SheetMetadata = {
    title: string;
    sheetId: number;
};

type ServiceAccountConfig = {
    clientEmail: string;
    privateKey: string;
};

type AccessTokenResult = { ok: true; token: string } | { ok: false; reason: string };

type SyncOptions = {
    initiatorUserId?: string | null;
};

type SheetTable = {
    header: string[];
    rows: string[][];
};

const DEFAULT_SHEET_NAME = "Sheet1";
const COLUMN_COUNT = 13; // A-M

const ID_ALIASES = ["id", "kode", "asset_code", "no", "id_ac", "nomor", "unit_id", "no_asset", "nomor_aset", "kode_aset", "kode_barang", "no_inventaris"];
const LOCATION_ALIASES = ["location", "lokasi", "posisi", "ruang", "lantai", "gedung", "area"];
const BRAND_ALIASES = ["brand", "merk", "merek", "model", "type", "tipe"];

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
const normalizeKey = (value?: string | null) => (typeof value === "string" ? value.trim() : "");

const isInvalidSourceRowRef = (value: string, location?: string | null) => {
    if (!value) return true;
    if (value.toUpperCase() === "#ERROR!") return true;
    const locationKey = normalizeKey(location).toLowerCase();
    if (locationKey && value.toLowerCase() === locationKey) return true;
    return false;
};

const finalizeIdentifiers = (draft: Partial<AcRow> & { sourceRowRef?: string }) => {
    const rawAssetCode = normalizeKey(draft.assetCode);
    const assetCode = rawAssetCode.toUpperCase() === "#ERROR!" ? "" : rawAssetCode;
    const sourceRowRef = normalizeKey(draft.sourceRowRef);
    const validSource = isInvalidSourceRowRef(sourceRowRef, draft.location) ? "" : sourceRowRef;
    const fallback = assetCode || validSource;

    if (fallback) {
        draft.assetCode = assetCode || fallback;
        draft.sourceRowRef = validSource || fallback;
        return;
    }

    if (draft.assetCode) draft.assetCode = assetCode || undefined;
    if (draft.sourceRowRef) draft.sourceRowRef = validSource || undefined;
};

const HEADER_RULES: Record<string, (value: string, target: Partial<AcRow> & { sourceRowRef?: string }) => void> = {
    id_ac: (value, target) => {
        target.assetCode = value.trim();
        target.sourceRowRef = value.trim();
    },
    // English aliases and common variations
    id: (value, target) => {
        target.assetCode = value.trim();
        target.sourceRowRef = value.trim();
    },
    no: (value, target) => {
        target.assetCode = value.trim();
        target.sourceRowRef = value.trim();
    },
    nomor: (value, target) => {
        target.assetCode = value.trim();
        target.sourceRowRef = value.trim();
    },
    unit_id: (value, target) => {
        target.assetCode = value.trim();
        target.sourceRowRef = value.trim();
    },
    no_asset: (value, target) => {
        target.assetCode = value.trim();
        target.sourceRowRef = value.trim();
    },
    nomor_aset: (value, target) => {
        target.assetCode = value.trim();
        target.sourceRowRef = value.trim();
    },
    kode_aset: (value, target) => {
        target.assetCode = value.trim();
        target.sourceRowRef = value.trim();
    },
    asset_code: (value, target) => {
        target.assetCode = value.trim();
        target.sourceRowRef = value.trim();
    },
    kode_barang: (value, target) => {
        target.assetCode = value.trim();
        target.sourceRowRef = value.trim();
    },
    kode: (value, target) => {
        target.assetCode = value.trim();
    },
    lokasi: (value, target) => {
        target.location = value.trim();
    },
    location: (value, target) => {
        target.location = value.trim();
    },
    // Alternative: Gedung (Building)
    gedung: (value, target) => {
        const existing = target.location || "";
        target.location = existing ? `${value.trim()}, ${existing}` : value.trim();
    },
    // Alternative: Lantai (Floor)
    lantai: (value, target) => {
        const existing = target.location || "";
        target.location = existing ? `${existing}, Lt.${value.trim()}` : `Lt.${value.trim()}`;
    },
    // Alternative: Ruangan (Room)
    ruangan: (value, target) => {
        const existing = target.location || "";
        target.location = existing ? `${existing}, ${value.trim()}` : value.trim();
    },
    merek: (value, target) => {
        target.brand = value.trim();
    },
    brand: (value, target) => {
        target.brand = value.trim();
    },
    // Alternative: Merk (Brand)
    merk: (value, target) => {
        target.brand = value.trim();
    },
    kondisi_terakhir: (value, target) => {
        target.lastCondition = value.trim();
    },
    service_terakhir: (value, target) => {
        const parsed = parseSheetDate(value);
        if (parsed) {
            target.lastServiceAt = parsed;
        }
    },
    // Alternative: Periode (Period/Service date)
    periode: (value, target) => {
        // Only use if lastServiceAt not already set
        if (!target.lastServiceAt) {
            const parsed = parseSheetDate(value);
            if (parsed) {
                target.lastServiceAt = parsed;
            }
        }
    },
    jadwal_berikut: (value, target) => {
        const parsed = parseSheetDate(value);
        if (parsed) {
            target.nextScheduleAt = parsed;
        }
    },
    teknisi: (value, target) => {
        target.technician = value.trim();
    },
    tekanan_freon: (value, target) => {
        target.freonPressure = value.trim();
    },
    suhu_keluar: (value, target) => {
        target.outletTemp = value.trim();
    },
    ampere_kompresor: (value, target) => {
        target.compressorAmp = value.trim();
    },
    kondisi_filter: (value, target) => {
        target.filterCondition = value.trim();
    },
    foto_url: (value, target) => {
        target.photoUrl = value.trim();
    },
    signature_url: (value, target) => {
        target.signatureUrl = value.trim();
    },
    tanda_tangan_url: (value, target) => {
        target.signatureUrl = value.trim();
    },
};

const monthAdd = (date: Date, months: number) => {
    const value = new Date(date);
    value.setMonth(value.getMonth() + months);
    return value;
};

const parseSheetDate = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numericValue = Number(trimmed);
    if (!Number.isNaN(numericValue) && trimmed === String(numericValue) && numericValue > 59) {
        const excelEpoch = Date.UTC(1899, 11, 30);
        const millis = excelEpoch + numericValue * 24 * 60 * 60 * 1000;
        return new Date(millis);
    }
    const direct = Date.parse(trimmed);
    if (!Number.isNaN(direct)) {
        return new Date(direct);
    }
    const parts = trimmed.split(/[\/-]/);
    if (parts.length === 3) {
        const [p1, p2, p3] = parts;
        const first = Number(p1);
        const second = Number(p2);
        const third = Number(p3);
        if ([first, second, third].every(part => !Number.isNaN(part))) {
            // Assume DD/MM/YYYY
            const day = first;
            const month = second - 1;
            const year = third < 100 ? 2000 + third : third;
            return new Date(year, month, day);
        }
    }
    return null;
};

const base64UrlEncode = (input: ArrayBuffer | Uint8Array | string) => {
    const encoder = new TextEncoder();
    const data = typeof input === "string" ? encoder.encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input);
    let binary = "";
    for (let i = 0; i < data.length; i += 1) {
        binary += String.fromCharCode(data[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const importPrivateKey = async (pem: string) => {
    const normalized = pem.replace(/-----BEGIN PRIVATE KEY-----/, "")
        .replace(/-----END PRIVATE KEY-----/, "")
        .replace(/\s+/g, "");
    const binary = Uint8Array.from(atob(normalized), char => char.charCodeAt(0));
    return crypto.subtle.importKey(
        "pkcs8",
        binary.buffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
    );
};

const getServiceAccount = (env: AppBindings["Bindings"]): ServiceAccountConfig | null => {
    const raw = env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!raw) {
        return null;
    }
    let parsed: Record<string, string> | null = null;
    try {
        parsed = JSON.parse(raw);
    } catch {
        try {
            parsed = JSON.parse(atob(raw));
        } catch {
            parsed = null;
        }
    }
    if (!parsed?.client_email || !parsed.private_key) {
        return null;
    }
    return {
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    };
};

export const getAccessToken = async (env: AppBindings["Bindings"]): Promise<AccessTokenResult> => {
    if (!env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        return { ok: false, reason: "Service account key not configured" };
    }
    const account = getServiceAccount(env);
    if (!account) {
        return { ok: false, reason: "Service account missing after parsing" }; // Added for clarity if parsing fails
    }
    const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = base64UrlEncode(
        JSON.stringify({
            iss: account.clientEmail,
            scope: "https://www.googleapis.com/auth/spreadsheets",
            aud: "https://oauth2.googleapis.com/token",
            iat: issuedAt,
            exp: issuedAt + 3600,
        }),
    );
    const signingInput = `${header}.${payload}`;
    const key = await importPrivateKey(account.privateKey);
    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(signingInput),
    );
    const assertion = `${signingInput}.${base64UrlEncode(signature)}`;
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion,
        }),
    });
    if (!response.ok) {
        const message = await response.text();
        return { ok: false, reason: `Token exchange failed (${response.status}): ${message}` };
    }
    const payloadJson = (await response.json()) as { access_token?: string };
    if (!payloadJson.access_token) {
        return { ok: false, reason: "Access token missing" };
    }
    return { ok: true, token: payloadJson.access_token };
};

const extractFromFragment = (fragment: string, key: string): string | null => {
    if (!fragment) return null;
    const trimmed = fragment.replace(/^#/, "");
    const params = new URLSearchParams(trimmed);
    return params.get(key);
};

const resolveSpreadsheetTarget = async (
    token: string,
    spreadsheetUrl: string,
    preferredSheetName?: string | null,
    minColumnCount: number = COLUMN_COUNT,
): Promise<{ ok: true; target: SpreadsheetTarget } | { ok: false; reason: string }> => {
    const match = spreadsheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
        return { ok: false, reason: "Spreadsheet URL invalid" };
    }
    const spreadsheetId = match[1];
    let sheetName = preferredSheetName || DEFAULT_SHEET_NAME;
    const defaultRange = `${sheetName}!A:${getColumnLetter(minColumnCount)}`;
    let range = defaultRange;
    try {
        const parsed = new URL(spreadsheetUrl);
        const explicitRange = parsed.searchParams.get("range") ?? extractFromFragment(parsed.hash, "range");
        if (explicitRange) {
            range = explicitRange;
            if (explicitRange.includes("!")) {
                sheetName = explicitRange.split("!")[0] || sheetName;
            }
        } else if (!preferredSheetName) {
            const gid = parsed.searchParams.get("gid") ?? extractFromFragment(parsed.hash, "gid");
            if (gid) {
                const resolved = await fetchSheetNameByGid(token, spreadsheetId, gid);
                if (resolved) {
                    sheetName = resolved;
                    range = `${sheetName}!A:${getColumnLetter(minColumnCount)}`;
                }
            }
        }
    } catch {
        range = defaultRange;
    }
    return { ok: true, target: { spreadsheetId, sheetName, range } };
};

const fetchSheetNameByGid = async (token: string, spreadsheetId: string, gid: string) => {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        return null;
    }
    const payload = (await response.json()) as { sheets?: Array<{ properties?: { sheetId?: number; title?: string } }> };
    const targetSheet = payload.sheets?.find(sheet => String(sheet.properties?.sheetId ?? "") === gid);
    return targetSheet?.properties?.title ?? null;
};

export const fetchSheetMetadata = async (
    token: string,
    spreadsheetUrl: string,
): Promise<{ ok: true; sheets: SheetMetadata[] } | { ok: false; reason: string }> => {
    const match = spreadsheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
        return { ok: false, reason: "Spreadsheet URL invalid" };
    }
    const spreadsheetId = match[1];
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        const body = await response.text();
        if (response.status === 404) {
            return { ok: false, reason: "Spreadsheet tidak ditemukan (404). Periksa URL." };
        }
        if (body.includes("FAILED_PRECONDITION") || body.includes("operation is not supported")) {
            return {
                ok: false,
                reason: "Format file tidak didukung. Pastikan file adalah Google Sheet asli, bukan file Excel (.xlsx) yang diupload."
            };
        }
        return { ok: false, reason: `Sheets API error (${response.status}): ${body}` };
    }
    const payload = (await response.json()) as { sheets?: Array<{ properties?: { sheetId?: number; title?: string } }> };
    const sheets = (payload.sheets ?? [])
        .map(s => ({
            title: s.properties?.title ?? "",
            sheetId: s.properties?.sheetId ?? 0,
        }))
        .filter(s => s.title);
    return { ok: true, sheets };
};

const fetchSheetTable = async (token: string, target: SpreadsheetTarget): Promise<{ ok: true; table: SheetTable } | { ok: false; reason: string }> => {
    const encodedRange = encodeURIComponent(target.range);
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${target.spreadsheetId}/values/${encodedRange}?majorDimension=ROWS`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        const body = await response.text();
        return { ok: false, reason: `Sheets API error (${response.status}): ${body}` };
    }
    const payload = (await response.json()) as { values?: string[][] };
    if (!payload.values || payload.values.length === 0) {
        return { ok: false, reason: "Sheet kosong" };
    }
    const [header, ...rows] = payload.values;
    return { ok: true, table: { header, rows } };
};

type RowValidationError = {
    row: string[];
    reason: string;
    details: Record<string, unknown>;
};

const mapRow = (header: string[], row: string[], sheetName: string): (Partial<AcRow> & { sourceRowRef?: string }) | null => {
    const draft: Partial<AcRow> & { sourceRowRef?: string } = { sheetName };
    header.forEach((column, index) => {
        const handler = HEADER_RULES[normalizeHeader(column)];
        const raw = row[index];
        if (handler && typeof raw === "string" && raw.trim()) {
            handler(raw, draft);
        }
    });
    finalizeIdentifiers(draft);
    
    // Default values for optional fields
    if (!draft.location) {
        draft.location = "-";
    }
    if (!draft.brand) {
        draft.brand = "-";
    }
    if (!draft.lastCondition) {
        draft.lastCondition = "Bagus";
    }
    if (!draft.lastServiceAt) {
        // Default to current date if service date is missing
        draft.lastServiceAt = new Date();
    }
    if (!draft.nextScheduleAt && draft.lastServiceAt instanceof Date) {
        draft.nextScheduleAt = monthAdd(draft.lastServiceAt, 3);
    }
    if (!draft.technician) {
        draft.technician = "Sheets Sync";
    }
    return draft;
};

const summarize = async (env: AppBindings["Bindings"], siteId: string, summary: SheetSyncResult) => {
    const db = getDb(env);
    const message = summary.ok
        ? `Impor ${summary.rowsImported ?? 0} baris (baru ${summary.rowsInserted ?? 0}, update ${summary.rowsUpdated ?? 0}, lewati ${summary.rowsSkipped ?? 0})`
        : summary.reason ?? "Sync gagal";
    const updates: Record<string, unknown> = { lastSyncStatus: message };
    if (summary.ok) {
        updates.lastSyncedAt = new Date();
    }
    await db.update(sites).set(updates).where(eq(sites.id, siteId));
};

const ensureIntegrationEnabled = (env: AppBindings["Bindings"], site: SiteRow): SheetSyncResult | null => {
    const enabledFlag = (env as unknown as Record<string, string | undefined>).ENABLE_SHEETS_SYNC === "true";
    const hasKeys = Boolean((env as unknown as Record<string, string | undefined>).GOOGLE_SERVICE_ACCOUNT_KEY);
    if (!enabledFlag || !hasKeys) {
        return { ok: false, reason: "Integrasi Sheets dimatikan" };
    }
    if (!site.syncEnabled) {
        return { ok: false, reason: "Sync dinonaktifkan untuk site ini" };
    }
    if (!site.spreadsheetUrl) {
        return { ok: false, reason: "Spreadsheet URL belum diisi" };
    }
    return null;
};

export const isSheetsIntegrationEnabled = (env: AppBindings["Bindings"]) => {
    const enabled = (env as unknown as Record<string, string | undefined>).ENABLE_SHEETS_SYNC === "true";
    return enabled && Boolean((env as unknown as Record<string, string | undefined>).GOOGLE_SERVICE_ACCOUNT_KEY);
};



// ... implementation ...

const syncSingleSheet = async (
    env: AppBindings["Bindings"],
    site: SiteRow,
    sheetName: string,
    token: string,
    options: SyncOptions,
    fieldConfig?: { label: string; key: string; cell: string; isId?: boolean; system?: boolean }[] | null
): Promise<SheetSyncResult> => {
    const start = Date.now();
    console.log(`[SheetsSync] syncSingleSheet:start siteId=${site.id} sheet=${sheetName}`);
    const safeFieldConfig = Array.isArray(fieldConfig) ? fieldConfig : null;

    // Calculate required column count based on field config
    let minColumns = COLUMN_COUNT;
    if (safeFieldConfig) {
        safeFieldConfig.forEach(f => {
            const idx = getColumnIndex(f.cell);
            if (idx + 1 > minColumns) minColumns = idx + 1;
        });
    }

    // Logic from original syncSiteFromSheet starting from resolveSpreadsheetTarget
    const targetResult = await resolveSpreadsheetTarget(token, site.spreadsheetUrl ?? "", sheetName, minColumns);
    if (!targetResult.ok) {
        console.log(`[SheetsSync] syncSingleSheet:end siteId=${site.id} sheet=${sheetName} status=error durationMs=${Date.now() - start}`);
        return targetResult;
    }
    const tableResult = await fetchSheetTable(token, targetResult.target);
    if (!tableResult.ok) {
        console.log(`[SheetsSync] syncSingleSheet:end siteId=${site.id} sheet=${sheetName} status=error durationMs=${Date.now() - start}`);
        return tableResult;
    }
    const { header, rows } = tableResult.table;

    // Collect validation errors for debugging
    const validationErrors: RowValidationError[] = [];
    const parsedRows = rows
        // .map(row => {
        .map((row, rowIndex) => {
            const draft = mapRow(header, row, sheetName);
            if (!draft) return null;

            // Apply custom field mapping if config exists
            if (safeFieldConfig && safeFieldConfig.length > 0) {
                const params: Record<string, string> = {};
                const hasExplicitId = safeFieldConfig.some(field => field.isId);
                safeFieldConfig.forEach(field => {
                    const colIdx = getColumnIndex(field.cell);
                    if (colIdx >= 0 && colIdx < row.length) {
                        const val = (row[colIdx] || "").trim();
                        if (val) {
                            const key = field.key.toLowerCase().trim();
                            if (field.isId || (!hasExplicitId && ID_ALIASES.includes(key))) {
                                draft.assetCode = val;
                                // ensure sourceRowRef matches assetCode if we are overriding it
                                draft.sourceRowRef = val; 
                            } else if (LOCATION_ALIASES.includes(key)) {
                                const existing = draft.location && draft.location !== "-" ? draft.location : "";
                                draft.location = existing ? `${existing}, ${val}` : val;
                            } else if (BRAND_ALIASES.includes(key)) {
                                const existing = draft.brand && draft.brand !== "-" ? draft.brand : "";
                                draft.brand = existing ? `${existing}, ${val}` : val;
                            } else if (key === "signature_url" || key === "tanda_tangan_url") {
                                draft.signatureUrl = val;
                            } else {
                                params[field.key] = val;
                            }
                        }
                    }
                });
                if (Object.keys(params).length > 0) {
                    draft.parameters = JSON.stringify(params);
                }
            }
            finalizeIdentifiers(draft);
            // return draft;
            return { ...draft, __rowIndex: rowIndex };
        })
        // .filter((value): value is Partial<AcRow> & { sourceRowRef?: string } => Boolean(value));
        .filter((value): value is (Partial<AcRow> & { sourceRowRef?: string; __rowIndex: number }) => Boolean(value));

    if (!parsedRows.length) {
        // Build detailed error message
        const headerInfo = `Headers: ${header.join(", ")}`;
        const totalRows = rows.length;
        const errorSummary = validationErrors.slice(0, 3).map((err, idx) => {
            const details = Object.entries(err.details)
                .map(([key, val]) => `${key}=${val}`)
                .join(", ");
            return `Row ${idx + 1}: ${err.reason} (${details})`;
        }).join("; ");

        const detailedReason = `Tidak ada baris valid di Sheet. Total baris: ${totalRows}. ${headerInfo}. Contoh error: ${errorSummary}`;
        console.error("Sheet sync validation failed:", {
            sheetName: targetResult.target.sheetName,
            headers: header,
            totalRows,
            validationErrors: validationErrors.slice(0, 5),
        });

        console.log(`[SheetsSync] syncSingleSheet:end siteId=${site.id} sheet=${sheetName} status=error durationMs=${Date.now() - start}`);
        return { ok: false, reason: detailedReason };
    }

    const db = getDb(env);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const parsed of parsedRows) {
        if (!parsed) {
            continue;
        }
        const assetCode = normalizeKey(parsed.assetCode);
        const sourceRowRefRaw = normalizeKey(parsed.sourceRowRef);
        const sourceRowRef = isInvalidSourceRowRef(sourceRowRefRaw, parsed.location) ? assetCode : (sourceRowRefRaw || assetCode);
        if (!assetCode) {
            console.log(`[SheetsSync] row action=skip siteId=${site.id} sheet=${sheetName} rowIndex=${parsed.__rowIndex} assetCode=${assetCode || "-"} sourceRowRef=${sourceRowRef || "-"}`);
            skipped += 1;
            continue;
        }
        const current = await db
            .select()
            .from(acUnits)
            .where(and(eq(acUnits.siteId, site.id), eq(acUnits.assetCode, assetCode)))
            .limit(1)
            .then(rows => rows[0]);
        const now = new Date();
        if (current) {
            const updates: Record<string, unknown> = {
                location: parsed.location ?? "-",
                brand: parsed.brand ?? "-",
                lastCondition: parsed.lastCondition ?? "Bagus",
                lastServiceAt: parsed.lastServiceAt ?? now,
                technician: parsed.technician ?? "Sheets Sync",
                nextScheduleAt: parsed.nextScheduleAt ?? monthAdd(parsed.lastServiceAt ?? now, 3),
                freonPressure: parsed.freonPressure ?? null,
                outletTemp: parsed.outletTemp ?? null,
                compressorAmp: parsed.compressorAmp ?? null,
                filterCondition: parsed.filterCondition ?? null,
                sheetName: sheetName,
                photoUrl: parsed.photoUrl ?? null,
                signatureUrl: parsed.signatureUrl ?? null,
                sourceRowRef: sourceRowRef,
                lastSyncedAt: now,
                updatedAt: now,
            };
            if (typeof parsed.parameters !== "undefined") {
                updates.parameters = parsed.parameters ?? null;
            }
            try {
                await db.update(acUnits).set(updates).where(eq(acUnits.id, current.id));
            } catch (error) {
                console.error("[SheetsSync] update failed", {
                    siteId: site.id,
                    sheet: sheetName,
                    rowIndex: parsed.__rowIndex,
                    assetCode: parsed.assetCode,
                    sourceRowRef: parsed.sourceRowRef,
                }, error);
                throw error;
            }
            console.log(`[SheetsSync] row action=update siteId=${site.id} sheet=${sheetName} rowIndex=${parsed.__rowIndex} assetCode=${assetCode} sourceRowRef=${sourceRowRef}`);
            updated += 1;
            continue;
        }
        if (!options.initiatorUserId) {
            console.log(`[SheetsSync] row action=skip siteId=${site.id} sheet=${sheetName} rowIndex=${parsed.__rowIndex} assetCode=${assetCode} sourceRowRef=${sourceRowRef}`);
            skipped += 1;
            continue;
        }
        try {
            const id = crypto.randomUUID();
            await db.insert(acUnits).values({
                id,
                siteId: site.id,
                assetCode: assetCode,
                location: parsed.location ?? "-",
                brand: parsed.brand ?? "-",
                lastCondition: parsed.lastCondition ?? "Bagus",
                lastServiceAt: parsed.lastServiceAt ?? now,
                technician: parsed.technician ?? "Sheets Sync",
                nextScheduleAt: parsed.nextScheduleAt ?? monthAdd(parsed.lastServiceAt ?? now, 3),
                freonPressure: parsed.freonPressure ?? null,
                outletTemp: parsed.outletTemp ?? null,
                compressorAmp: parsed.compressorAmp ?? null,
                filterCondition: parsed.filterCondition ?? null,
                photoUrl: parsed.photoUrl ?? null,
                signatureUrl: parsed.signatureUrl ?? null,
                parameters: parsed.parameters ?? null,
                sheetName: sheetName,
                ownerId: options.initiatorUserId,
                sourceRowRef: sourceRowRef,
                lastSyncedAt: now,
                updatedAt: now,
            });
        } catch (error) {
            console.error("[SheetsSync] insert failed", {
                siteId: site.id,
                sheet: sheetName,
                rowIndex: parsed.__rowIndex,
                assetCode: parsed.assetCode,
                sourceRowRef: parsed.sourceRowRef,
            }, error);
            throw error;
        }
        console.log(`[SheetsSync] row action=insert siteId=${site.id} sheet=${sheetName} rowIndex=${parsed.__rowIndex} assetCode=${assetCode} sourceRowRef=${sourceRowRef}`);
        inserted += 1;
    }

    return {
        ok: true,
        rowsImported: parsedRows.length,
        rowsInserted: inserted,
        rowsUpdated: updated,
        rowsSkipped: skipped,
    };
};

export const syncSiteFromSheet = async (env: AppBindings["Bindings"], site: SiteRow, options: SyncOptions = {}): Promise<SheetSyncResult> => {
    const start = Date.now();
    console.log(`[SheetsSync] syncSiteFromSheet:start siteId=${site.id} siteName=${site.name}`);
    const disabled = ensureIntegrationEnabled(env, site);
    if (disabled) {
        console.log(`[SheetsSync] syncSiteFromSheet:end siteId=${site.id} status=disabled durationMs=${Date.now() - start}`);
        return disabled;
    }
    const tokenResult = await getAccessToken(env);
    if (!tokenResult.ok) {
        console.log(`[SheetsSync] syncSiteFromSheet:end siteId=${site.id} status=error durationMs=${Date.now() - start}`);
        return tokenResult;
    }

    const db = getDb(env);
    // Fetch assigned sheets and their AC Type configs
    const assignedSheets = await db
        .select({
            sheetName: siteSheets.sheetName,
            acTypeId: siteSheets.acTypeId,
            fields: acTypes.fields
        })
        .from(siteSheets)
        .leftJoin(acTypes, eq(siteSheets.acTypeId, acTypes.id))
        .where(eq(siteSheets.siteId, site.id));
        
    let targetSheets: string[] = [];
    const sheetConfigMap = new Map<string, { label: string; key: string; cell: string }[]>();

    if (assignedSheets.length > 0) {
        targetSheets = assignedSheets.map(s => s.sheetName);
        assignedSheets.forEach(s => {
            if (s.fields) {
                try {
                    const parsed = JSON.parse(s.fields);
                    if (Array.isArray(parsed)) {
                        sheetConfigMap.set(s.sheetName, parsed);
                    } else {
                        console.warn(`[SheetsSync] Invalid acType fields (not array). siteId=${site.id} sheet=${s.sheetName}`);
                    }
                } catch (e) {
                    console.error("Failed to parse acType fields", e);
                }
            }
        });
    } else if (site.sheetName) {
        targetSheets = [site.sheetName];
    } else {
        // Fetch valid sheets to help user configure
        const metadata = await fetchSheetMetadata(tokenResult.token, site.spreadsheetUrl ?? "");
        if (metadata.ok) {
            return {
                ok: false,
                reason: "MISSING_CONFIGURATION",
                // @ts-ignore
                availableSheets: metadata.sheets
            };
        }
        return { ok: false, reason: metadata.reason || "Tidak ada sheet yang dikonfigurasi" };
    }

    const aggregated: SheetSyncResult = {
        ok: true,
        rowsImported: 0,
        rowsInserted: 0,
        rowsUpdated: 0,
        rowsSkipped: 0,
    };

    const errors: string[] = [];

    for (const sheetName of targetSheets) {
        const config = sheetConfigMap.get(sheetName);
        const result = await syncSingleSheet(env, site, sheetName, tokenResult.token, options, config);
        if (!result.ok) {
            errors.push(`${sheetName}: ${result.reason}`);
        } else {
            aggregated.rowsImported = (aggregated.rowsImported ?? 0) + (result.rowsImported ?? 0);
            aggregated.rowsInserted = (aggregated.rowsInserted ?? 0) + (result.rowsInserted ?? 0);
            aggregated.rowsUpdated = (aggregated.rowsUpdated ?? 0) + (result.rowsUpdated ?? 0);
            aggregated.rowsSkipped = (aggregated.rowsSkipped ?? 0) + (result.rowsSkipped ?? 0);
        }
    }

    if (errors.length > 0 && aggregated.rowsImported === 0) {
        // All failed
        const reason = errors.join("; ");
        await summarize(env, site.id, { ok: false, reason });
        console.log(`[SheetsSync] syncSiteFromSheet:end siteId=${site.id} status=error durationMs=${Date.now() - start}`);
        return { ok: false, reason };
    }

    await summarize(env, site.id, aggregated);
    console.log(`[SheetsSync] syncSiteFromSheet:end siteId=${site.id} status=ok durationMs=${Date.now() - start}`);
    return aggregated;
};

const buildRowValues = (record: AcRow) => {
    const toIso = (value: unknown) => {
        if (!value) return "";
        if (value instanceof Date) return value.toISOString();
        if (typeof value === "number") return new Date(value).toISOString();
        if (typeof value === "string" && value) {
            const parsed = Date.parse(value);
            if (!Number.isNaN(parsed)) {
                return new Date(parsed).toISOString();
            }
        }
        return String(value);
    };
    const rowKey = record.sourceRowRef ?? record.assetCode ?? record.id;
    return [
        rowKey,
        record.location ?? "",
        record.brand ?? "",
        record.lastCondition ?? "",
        toIso(record.lastServiceAt ?? record.updatedAt),
        record.technician ?? "",
        toIso(record.nextScheduleAt ?? record.lastServiceAt),
        record.freonPressure ?? "",
        record.outletTemp ?? "",
        record.compressorAmp ?? "",
        record.filterCondition ?? "",
        record.photoUrl ?? "",
        record.signatureUrl ?? "",
    ];
};

const updateSiteSyncStatus = async (env: AppBindings["Bindings"], siteId: string, message: string) => {
    const db = getDb(env);
    await db
        .update(sites)
        .set({ lastSyncedAt: new Date(), lastSyncStatus: message })
        .where(eq(sites.id, siteId));
};

export const syncRecordToSheet = async (
    env: AppBindings["Bindings"],
    site: SiteRow,
    record: AcRow,
    fieldConfig?: { label: string; key: string; cell: string; isId?: boolean; system?: boolean }[] | null
): Promise<SheetSyncResult> => {
    console.log(`[SyncRecord] Starting sync for record ${record.id} (${record.assetCode}) to site ${site.name}`);
    
    const disabled = ensureIntegrationEnabled(env, site);
    if (disabled) {
        console.log(`[SyncRecord] Integration disabled: ${disabled.reason}`);
        return disabled;
    }
    const tokenResult = await getAccessToken(env);
    if (!tokenResult.ok) {
        console.error(`[SyncRecord] Auth failed: ${tokenResult.reason}`);
        return tokenResult;
    }
    const targetResult = await resolveSpreadsheetTarget(tokenResult.token, site.spreadsheetUrl ?? "", record.sheetName || site.sheetName);
    if (!targetResult.ok) {
        console.error(`[SyncRecord] Target resolution failed: ${targetResult.reason}`);
        return targetResult;
    }

    console.log(`[SyncRecord] Target Resolved: ${targetResult.target.sheetName} (Spreadsheet: ${targetResult.target.spreadsheetId})`);

    // Determine read range based on config or default
    let minColumns = COLUMN_COUNT;
    if (fieldConfig) {
        console.log(`[SyncRecord] Using custom field config with ${fieldConfig.length} fields`);
        fieldConfig.forEach(f => {
            const idx = getColumnIndex(f.cell);
            if (idx + 1 > minColumns) minColumns = idx + 1;
        });
    } else {
        console.log(`[SyncRecord] No field config provided, using default columns.`);
    }
    
    // Expand read range to ensure we capture all columns
    const sheetName = targetResult.target.sheetName;
    const range = `${sheetName}!A:${getColumnLetter(minColumns)}`;
    console.log(`[SyncRecord] Fetching range: ${range}`);
    
    const tableResult = await fetchSheetTable(tokenResult.token, { ...targetResult.target, range });
    if (!tableResult.ok) {
        console.error(`[SyncRecord] Fetch table failed: ${tableResult.reason}`);
        return tableResult;
    }
    const { header, rows } = tableResult.table;
    console.log(`[SyncRecord] Headers found: ${JSON.stringify(header)}`);
    console.log(`[SyncRecord] Normalized Headers: ${JSON.stringify(header.map(normalizeHeader))}`);
    
    // Find ID column
    let idColumnIndex = header.findIndex(column => normalizeHeader(column) === "id_ac");
    
    // Check aliases in physical headers if strict match failed
    if (idColumnIndex === -1) {
        idColumnIndex = header.findIndex(column => ID_ALIASES.includes(normalizeHeader(column)));
    }

    if (idColumnIndex === -1 && fieldConfig) {
        console.log(`[SyncRecord] Checking ${fieldConfig.length} config fields for ID...`);
        const explicitId = fieldConfig.find(field => field.isId);
        if (explicitId) {
            idColumnIndex = getColumnIndex(explicitId.cell);
            console.log(`[SyncRecord] Found explicit ID: ${explicitId.key} -> Col ${idColumnIndex}`);
        } else {
            for (const field of fieldConfig) {
                console.log(`[SyncRecord] Field: ${field.key} (Cell: ${field.cell})`);
                if (ID_ALIASES.includes(field.key.toLowerCase())) {
                    idColumnIndex = getColumnIndex(field.cell);
                    console.log(`[SyncRecord] Found ID via config: ${field.key} -> Col ${idColumnIndex}`);
                    break;
                }
            }
        }
    }
    
    console.log(`[SyncRecord] ID Column Index: ${idColumnIndex}`);

    if (idColumnIndex === -1) {
        console.error(`[SyncRecord] ID Column not found.`);
        const aliases = ID_ALIASES.join(", ");
        return { 
            ok: false, 
            reason: `Kolom ID tidak ditemukan. Pastikan ada kolom header dengan nama seperti: ${aliases}. Atau pastikan konfigurasi field anda memiliki field dengan key 'id', 'kode', atau 'asset_code' yang dipetakan ke kolom yang benar. Headers ditemukan: ${JSON.stringify(header)}`
        };
    }

    const rowKey = (record.sourceRowRef ?? record.assetCode ?? record.id).trim();
    const dataIndex = rows.findIndex(row => (row[idColumnIndex] ?? "").trim() === rowKey);
    console.log(`[SyncRecord] Row Key: "${rowKey}", Found Index: ${dataIndex}`);
    
    // Helper to format date
    const toIso = (value: unknown) => {
        if (!value) return "";
        if (value instanceof Date) return value.toISOString();
        if (typeof value === "number") return new Date(value).toISOString();
        return String(value);
    };

    const toDMY = (value: unknown) => {
        if (!value) return "";
        const date = value instanceof Date ? value : new Date(value as string);
        if (Number.isNaN(date.getTime())) return "";
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = String(date.getFullYear());
        return `${day}/${month}/${year}`;
    };

    let rowValues: string[];

    if (fieldConfig && fieldConfig.length > 0) {
        // Dynamic mapping based on AcType
        
        // Start with existing row data to preserve unmapped columns (e.g. formulas)
        // If it's a new row (dataIndex == -1), start with empty array
        const existingRow = dataIndex >= 0 ? (rows[dataIndex] || []) : [];
        
        // Calculate the range we will definitely cover
        const maxConfigCol = fieldConfig.reduce((max, f) => Math.max(max, getColumnIndex(f.cell)), 0);
        
        // Length should be sufficient for existing data AND new data
        const requiredLength = Math.max(existingRow.length, maxConfigCol + 1);
        rowValues = new Array(requiredLength).fill("");

        // Fill with existing data first
        existingRow.forEach((val, idx) => {
            rowValues[idx] = val;
        });

        const params = typeof record.parameters === 'string' 
            ? JSON.parse(record.parameters) 
            : (record.parameters ?? {});

        fieldConfig.forEach(field => {
            const colIdx = getColumnIndex(field.cell);
            if (colIdx < 0) return;

            const key = field.key.toLowerCase().trim();
            let val: string | null = null;

            // Standard Field Mapping
            if (ID_ALIASES.includes(key)) {
                val = record.assetCode;
            } else if (LOCATION_ALIASES.includes(key)) {
                val = record.location ?? "";
            } else if (BRAND_ALIASES.includes(key)) {
                val = record.brand ?? "";
            } else if (key === "kondisi_terakhir" || key === "last_condition" || key === "kondisi") {
                val = record.lastCondition ?? "";
            } else if (key === "service_terakhir" || key === "last_service") {
                val = toDMY(record.lastServiceAt);
            } else if (key === "jadwal_berikut" || key === "jadwal_berikutnya" || key === "next_schedule") {
                val = toIso(record.nextScheduleAt);
            } else if (key === "teknisi" || key === "technician") {
                val = record.technician ?? "";
            } else if (key === "tekanan_freon" || key === "freon_pressure") {
                val = record.freonPressure ?? "";
            } else if (key === "suhu_keluar" || key === "outlet_temp") {
                val = record.outletTemp ?? "";
            } else if (key === "ampere_kompresor" || key === "compressor_amp") {
                val = record.compressorAmp ?? "";
            } else if (key === "kondisi_filter" || key === "filter_condition") {
                val = record.filterCondition ?? "";
            } else if (key === "foto_url" || key === "photo_url" || key === "foto" || key === "photo") {
                val = params.foto_url ?? params.photo_url ?? params.foto ?? params.photo ?? record.photoUrl ?? "";
            } else if (key === "tanda_tangan_url" || key === "signature_url" || key === "tanda_tangan" || key === "signature") {
                val = record.signatureUrl ?? "";
            } else {
                // Custom Parameter
                // Match exact key first, then lowercase
                val = params[field.key] ?? params[key] ?? "";
            }

            if (val !== null && val !== undefined) {
                rowValues[colIdx] = String(val);
            }
        });

        // Ensure ID is present if it was mapped to a column that we just filled or if we are creating a new row
        if ((rowValues[idColumnIndex] === "" || rowValues[idColumnIndex] === undefined)) {
             rowValues[idColumnIndex] = rowKey;
        }

    } else {
        // Fallback to legacy COLUMN_ORDER mapping
        const legacyValues = buildRowValues(record);
        // Helper to set value at specific index
        const setCol = (targetRow: string[], index: number, val: string | null) => {
            if (index < 0) return;
            while (targetRow.length <= index) targetRow.push("");
            targetRow[index] = val ?? "";
        };
        rowValues = []; // Start fresh for legacy
        legacyValues.forEach((val, idx) => setCol(rowValues, idx, val));
    }

    const values = [rowValues];
    // We need to determine the range end letter. 
    // Use getColumnLetter(rowValues.length)
    const endColumn = getColumnLetter(rowValues.length);

    if (dataIndex >= 0) {
        const rowNumber = dataIndex + 2; // header row + 1
        
        const updateRange = `${targetResult.target.sheetName}!A${rowNumber}:${endColumn}${rowNumber}`;
        
        console.log(`[SyncRecord] PUT request to ${updateRange}`);
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${targetResult.target.spreadsheetId}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenResult.token}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({ values }),
        });
        
        if (!response.ok) {
            const body = await response.text();
            console.error(`[SyncRecord] PUT failed (${response.status}): ${body}`);
            return { ok: false, reason: `Gagal memperbarui row Sheets (${response.status}): ${body}` };
        }
        console.log(`[SyncRecord] PUT success.`);
        await updateSiteSyncStatus(env, site.id, `Update ${rowKey} tersinkron`);
        return { ok: true, rowsImported: 1, rowsUpdated: 1 };
    }
    
    // Append (New Row)
    const appendRange = `${targetResult.target.sheetName}!A:${endColumn}`;
    
    console.log(`[SyncRecord] POST request to ${appendRange}`);
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${targetResult.target.spreadsheetId}/values/${encodeURIComponent(appendRange)}:append?valueInputOption=USER_ENTERED`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${tokenResult.token}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({ values }),
    });
    
    if (!response.ok) {
        const body = await response.text();
        console.error(`[SyncRecord] POST failed (${response.status}): ${body}`);
        return { ok: false, reason: `Gagal menambah row Sheets (${response.status}): ${body}` };
    }
    console.log(`[SyncRecord] POST success.`);
    const db = getDb(env);
    await db.update(acUnits).set({ sourceRowRef: rowKey }).where(eq(acUnits.id, record.id));
    await updateSiteSyncStatus(env, site.id, `Tambah ${rowKey} tersinkron`);
    return { ok: true, rowsImported: 1, rowsInserted: 1 };
};

export const scanSheet = async (
    env: AppBindings["Bindings"],
    spreadsheetUrl: string,
    range: string
): Promise<{ ok: true; headers: string[]; rows: string[][] } | { ok: false; reason: string }> => {
    const tokenResult = await getAccessToken(env);
    if (!tokenResult.ok) {
        return tokenResult;
    }

    const match = spreadsheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
        return { ok: false, reason: "Invalid Spreadsheet URL" };
    }
    const spreadsheetId = match[1];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${tokenResult.token}` },
    });

    if (!response.ok) {
        const body = await response.text();
        return { ok: false, reason: `Sheets API Error (${response.status}): ${body}` };
    }

    const payload = (await response.json()) as { values?: string[][] };
    const values = payload.values || [];

    if (values.length === 0) {
        return { ok: false, reason: "Range is empty" };
    }

    const [headers, ...rows] = values;
    return { ok: true, headers, rows };
};
