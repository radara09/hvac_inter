export type AdminUser = {
    id: string;
    email: string;
    username?: string | null;
    displayUsername?: string | null;
    role?: string | null;
    banned?: boolean | null;
    banReason?: string | null;
    siteId?: string | null;
    siteIds?: string[] | null;
    data?: {
        siteId?: string | null;
    };
};

export type AllowlistEntry = {
    id: string;
    email: string;
    siteId: string;
    siteName?: string | null;
    createdAt?: string | null;
};

export type ACRecord = {
    id: string;
    siteId: string;
    assetCode: string;
    location: string;
    brand: string;
    lastCondition: string;
    lastServiceAt: string;
    technician: string;
    nextScheduleAt: string;
    freonPressure?: string | null;
    outletTemp?: string | null;
    compressorAmp?: string | null;
    filterCondition?: string | null;
    photoUrl?: string | null;
    signatureUrl?: string | null;
    sourceRowRef?: string | null;
    parameters?: string | null;
    sheetName?: string | null;
    updatedAt?: string;
};

export type CreateAcPayload = {
    siteId: string;
    assetCode: string;
    location: string;
    brand: string;
    lastCondition: string;
    lastServiceAt: string;
    nextScheduleAt: string;
    technician: string;
    freonPressure?: string;
    outletTemp?: string;
    compressorAmp?: string;
    filterCondition?: string;
    photoUrl?: string;
    signatureUrl?: string;
    parameters?: Record<string, string>;
};

export type UpdateAcPayload = {
    freonPressure?: string | null;
    outletTemp?: string | null;
    compressorAmp?: string | null;
    filterCondition?: string | null;
    lastCondition?: string | null;
    lastServiceAt?: string | null;
    nextScheduleAt?: string | null;
    photoUrl?: string | null;
    signatureUrl?: string | null;
    note?: string | null;
    photos?: { url: string; label: string }[];
    parameters?: any;
};

export type AcHistoryChange = {
    field: string;
    previous?: string | null;
    current?: string | null;
};

export type AcHistoryEntry = {
    id: string;
    acUnitId: string;
    userId: string | null;
    userName?: string | null;
    note?: string | null;
    createdAt: string;
    changes: AcHistoryChange[];
    photos?: { url: string; label: string }[] | null;
};

export type AcTypeField = {
    label: string;
    key: string;
    cell?: string;
    autofill?: boolean;
    autofillType?: "timestamp" | "user";
    isImage?: boolean;
    inputType?: "text" | "select" | "date" | "datetime" | "image" | "signature" | "readonly" | "computed" | "user";
    options?: string[];
    optionsText?: string;
    format?: string;
    hidden?: boolean;
    readonly?: boolean;
    isId?: boolean;
    system?: boolean;
};

export type AcType = {
    id: string;
    name: string;
    fields: AcTypeField[];
    createdAt: string;
    updatedAt: string;
};

export type SiteRecord = {
    id: string;
    name: string;
    description?: string | null;
    spreadsheetUrl?: string | null;
    sheetName?: string | null;
    sheets?: string[] | null;
    syncEnabled: boolean;
    lastSyncedAt?: string | null;
    lastSyncStatus?: string | null;
    deletedAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
    logoUrl?: string | null;
    sheetsList?: { id: string; sheetName: string; acTypeId?: string | null }[];
};

export type SiteSyncResult = {
    ok: boolean;
    reason?: string;
    rowsImported?: number;
    rowsInserted?: number;
    rowsUpdated?: number;
    rowsSkipped?: number;
};

export type SitePayload = {
    id?: string;
    name: string;
    description?: string;
    spreadsheetUrl?: string;
    sheetName?: string;
    sheets?: (string | { name: string; acTypeId?: string | null })[];
    syncEnabled?: boolean;
    logoUrl?: string;
    sheetsConfig?: { id: string; acTypeId?: string | null }[];
};

export type SiteMembership = {
    siteId: string;
    siteName: string;
    role: string;
};

export type SignupFormValues = {
    email: string;
    username: string;
    displayUsername: string;
    password: string;
    confirmPassword: string;
    name: string;
};
