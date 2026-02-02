import { useState, useEffect, useRef, type FormEvent } from "react";
import type { SitePayload, SiteRecord, SiteSyncResult, ACRecord, AcType, AcTypeField } from "../types";
import { TextField } from "../components/TextField";
import { DepthCard } from "../components/DepthUI";
import { ImageKitUpload } from "../components/ImageKitUpload";
import { generateQrPdf } from "../components/QRCodePdfGenerator";
import { createPortal } from "react-dom";

const ID_ALIASES = ["id", "id_ac", "asset_code", "kode", "no", "no_asset", "unit_id", "nomor", "nomor_aset", "kode_aset", "kode_barang", "no_inventaris"];

const InputLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-(--depthui-muted)">{label}</span>
        {children}
    </label>
);

const SheetSelector = ({
    site,
    isEditing,
    form,
    onChange,
    acTypes,
}: {
    site: SiteRecord;
    isEditing: boolean;
    form?: SitePayload;
    onChange?: (val: Partial<SitePayload>) => void;
    acTypes: AcType[];
}) => {
    const [availableSheets, setAvailableSheets] = useState<string[]>([]);
    const [loadingSheets, setLoadingSheets] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Normalize form sheets to objects for easier handling
    const currentSheets = (form?.sheets ?? []).map(s => 
        typeof s === "string" ? { name: s, acTypeId: null } : s
    );

    const handleLoadSheets = async () => {
        if (!form?.spreadsheetUrl) return;
        setLoadingSheets(true);
        setLoadError(null);
        try {
            const res = await fetch("/api/sites/sheets-metadata", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ spreadsheetUrl: form.spreadsheetUrl })
            });
            const data = await res.json();
            if (res.ok && data.sheets) {
                setAvailableSheets(data.sheets.map((s: any) => s.title));
            } else {
                setLoadError(data.reason || "Failed to load sheets");
            }
        } catch (e) {
            setLoadError("Network error loading sheets");
        } finally {
            setLoadingSheets(false);
        }
    };

    // Auto-load sheets on mount in edit mode
    useEffect(() => {
        if (isEditing && form?.spreadsheetUrl) {
            void handleLoadSheets();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleToggleSheet = (sheetName: string, checked: boolean) => {
        if (!onChange) return;
        if (checked) {
            // Add
            onChange({
                sheets: [...currentSheets, { name: sheetName, acTypeId: null }]
            });
        } else {
            // Remove
            onChange({
                sheets: currentSheets.filter(s => s.name !== sheetName)
            });
        }
    };

    const handleChangeAcType = (sheetName: string, acTypeId: string) => {
        if (!onChange) return;
        onChange({
            sheets: currentSheets.map(s => 
                s.name === sheetName ? { ...s, acTypeId: acTypeId || null } : s
            )
        });
    };

    if (isEditing) {
        // Edit Mode
        const displayedSheets = Array.from(new Set([...availableSheets, ...currentSheets.map(s => s.name)]));

        return (
            <div className="space-y-3 rounded-xl border border-black/10 bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-(--depthui-muted)">Konfigurasi Sheets</span>
                    <button
                        type="button"
                        onClick={handleLoadSheets}
                        disabled={loadingSheets || !form?.spreadsheetUrl}
                        className="text-[10px] text-emerald-600 hover:underline disabled:text-gray-400"
                    >
                        {loadingSheets ? "Loading..." : "Load Sheets from URL"}
                    </button>
                </div>
                {loadError && <p className="text-xs text-rose-500">{loadError}</p>}
                
                {displayedSheets.length > 0 ? (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {displayedSheets.map(sheetName => {
                            const config = currentSheets.find(s => s.name === sheetName);
                            const isChecked = !!config;

                            return (
                                <div key={sheetName} className="flex items-center gap-2 rounded-lg bg-white border border-black/5 p-2">
                                    <input 
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={e => handleToggleSheet(sheetName, e.target.checked)}
                                        className="rounded border-gray-300 text-black focus:ring-black"
                                    />
                                    <span className="text-xs flex-1 truncate" title={sheetName}>{sheetName}</span>
                                    {isChecked && (
                                        <select
                                            className="text-[10px] rounded border border-black/10 px-1 py-0.5 w-[100px]"
                                            value={config.acTypeId || ""}
                                            onChange={e => handleChangeAcType(sheetName, e.target.value)}
                                        >
                                            <option value="">Default</option>
                                            {acTypes.map(t => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-xs text-gray-400 italic">Klik "Load Sheets" untuk melihat daftar sheet.</p>
                )}
            </div>
        );
    }

    // View Mode
    return (
        <div className="mt-2 space-y-2">
            {site.sheetsList && site.sheetsList.length > 0 ? (
                <div className="grid gap-2">
                    {site.sheetsList.map(sheet => {
                        const typeName = acTypes.find(t => t.id === sheet.acTypeId)?.name ?? "Default";
                        return (
                            <div key={sheet.id} className="flex items-center justify-between rounded-xl bg-black/5 px-3 py-2">
                                <span className="text-xs font-medium text-[#1f1f1f]">{sheet.sheetName}</span>
                                <span className="text-[10px] text-(--depthui-muted) bg-white px-2 py-0.5 rounded-md border border-black/5">
                                    {typeName}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <span className="text-xs text-(--depthui-muted)">Tidak ada sheets (Sync untuk mengambil)</span>
            )}
        </div>
    );
};

const PrintQrModal = ({
    isOpen,
    onClose,
    site,
}: {
    isOpen: boolean;
    onClose: () => void;
    site: SiteRecord | null;
}) => {
    const [loading, setLoading] = useState(false);
    const [units, setUnits] = useState<ACRecord[]>([]);
    const [sheets, setSheets] = useState<string[]>([]);
    const [selectedSheet, setSelectedSheet] = useState<string>("");

    useEffect(() => {
        if (isOpen && site) {
            setLoading(true);
            setSheets(site.sheets ?? (site.sheetName ? [site.sheetName] : []));
            setSelectedSheet("");
            // Fetch All Units for Site
            fetch(`/api/ac?siteId=${site.id}`)
                .then(res => res.json())
                .then(data => {
                    if (data.records) {
                        setUnits(data.records);
                    }
                })
                .finally(() => setLoading(false));
        }
    }, [isOpen, site]);

    const handlePrint = () => {
        if (!site) return;
        const finalUnits = selectedSheet
            ? units.filter(u => u.sourceRowRef?.startsWith(`${selectedSheet}!`))
            : units;

        generateQrPdf(site.name + (selectedSheet ? ` - ${selectedSheet}` : ""), finalUnits);
    };

    if (!isOpen || !site) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
                <h3 className="mb-4 text-lg font-semibold text-[#1f1f1f]">Print QR Codes: {site.name}</h3>

                {loading ? (
                    <p className="text-sm text-(--depthui-muted)">Loading units...</p>
                ) : (
                    <div className="space-y-4">
                        <p className="text-sm">Total Units: {units.length}</p>
                        <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
                            Filter by Sheet (Optional)
                            <select
                                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-[#1f1f1f]"
                                value={selectedSheet}
                                onChange={e => setSelectedSheet(e.target.value)}
                            >
                                <option value="">All Sheets</option>
                                {sheets.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </label>
                        <button
                            onClick={handlePrint}
                            className="w-full rounded-2xl bg-black px-4 py-3 text-base font-semibold text-white transition hover:opacity-80 disabled:opacity-50"
                            disabled={units.length === 0}
                        >
                            Generate PDF
                        </button>
                    </div>
                )}
                <button onClick={onClose} className="mt-4 w-full text-center text-sm text-(--depthui-muted) hover:underline">Close</button>
            </div>
        </div>,
        document.body
    );
};

const DeleteSiteConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm,
    siteName,
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    siteName: string;
}) => {
    if (!isOpen) return null;
    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
                <h3 className="mb-2 text-lg font-semibold text-[#1f1f1f]">Hapus Site?</h3>
                <p className="mb-6 text-sm text-[#434343]">
                    Apakah Anda yakin ingin menghapus site <strong>{siteName}</strong>? Tindakan ini tidak dapat dibatalkan.
                </p>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-[#434343] hover:bg-black/5">
                        Batal
                    </button>
                    <button onClick={onConfirm} className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600">
                        Hapus
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

const DeleteAcTypeConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm,
    typeName,
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    typeName: string;
}) => {
    if (!isOpen) return null;
    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
                <h3 className="mb-2 text-lg font-semibold text-[#1f1f1f]">Hapus Tipe AC?</h3>
                <p className="mb-6 text-sm text-[#434343]">
                    Apakah Anda yakin ingin menghapus tipe AC <strong>{typeName}</strong>? Tindakan ini tidak dapat dibatalkan.
                </p>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-[#434343] hover:bg-black/5">
                        Batal
                    </button>
                    <button onClick={onConfirm} className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600">
                        Hapus
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

const ConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    variant = "warning"
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "warning" | "info";
}) => {
    if (!isOpen) return null;

    const confirmButtonColor = variant === "danger" 
        ? "bg-rose-500 hover:bg-rose-600" 
        : variant === "warning" 
            ? "bg-amber-500 hover:bg-amber-600"
            : "bg-black hover:opacity-80";

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl border border-black/5">
                <h3 className="mb-3 text-lg font-semibold text-[#1f1f1f]">{title}</h3>
                <div className="mb-6 text-sm text-[#434343] leading-relaxed">
                    {message}
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-[#434343] hover:bg-black/5 transition-colors">
                        {cancelLabel}
                    </button>
                    <button onClick={onConfirm} className={`rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors ${confirmButtonColor}`}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};


const SelectSheetsModal = ({
    isOpen,
    onClose,
    onConfirm,
    availableSheets,
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (selectedSheets: string[]) => void;
    availableSheets: { title: string; sheetId: number }[];
}) => {
    const [selected, setSelected] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            setSelected([]);
        }
    }, [isOpen]);

    const toggleSheet = (sheet: string) => {
        setSelected(prev =>
            prev.includes(sheet)
                ? prev.filter(s => s !== sheet)
                : [...prev, sheet]
        );
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
                <h3 className="mb-2 text-lg font-semibold text-[#1f1f1f]">Pilih Sheet untuk Sync</h3>
                <p className="mb-4 text-sm text-[#434343]">
                    Site ini belum memiliki konfigurasi sheet. Silakan pilih sheet yang ingin disinkronkan dari spreadsheet.
                </p>

                <div className="mb-6 max-h-[300px] overflow-y-auto space-y-2 border border-black/10 rounded-xl p-2">
                    {availableSheets.map(sheet => (
                        <label key={`${sheet.sheetId}-${sheet.title}`} className="flex items-center gap-3 p-2 hover:bg-black/5 rounded-lg cursor-pointer">
                            <input
                                type="checkbox"
                                checked={selected.includes(sheet.title)}
                                onChange={() => toggleSheet(sheet.title)}
                                className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black"
                            />
                            <span className="text-sm font-medium">{sheet.title}</span>
                        </label>
                    ))}
                    {availableSheets.length === 0 && (
                        <p className="text-sm text-center text-gray-500 py-4">Tidak ada sheet ditemukan</p>
                    )}
                </div>

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-[#434343] hover:bg-black/5">
                        Batal
                    </button>
                    <button
                        onClick={() => onConfirm(selected)}
                        disabled={selected.length === 0}
                        className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-80 disabled:opacity-50"
                    >
                        Simpan & Sync
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

const ManageAcTypeModal = ({
    isOpen,
    onClose,
    onSave,
    initialData,
}: {
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string, fields: AcTypeField[]) => Promise<void>;
    initialData?: AcType | null;
}) => {
    const [name, setName] = useState("");
    const [nameError, setNameError] = useState<string | null>(null);
    const [fields, setFields] = useState<AcTypeField[]>([{ label: "", key: "" }]);
    const [scanUrl, setScanUrl] = useState("");
    
    // Split range into sheet and cell range
    const [availableSheets, setAvailableSheets] = useState<string[]>([]);
    const [selectedSheet, setSelectedSheet] = useState("");
    const [cellRange, setCellRange] = useState("");
    const [loadingSheets, setLoadingSheets] = useState(false);

    const [isScanning, setIsScanning] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [previewData, setPreviewData] = useState<Record<string, string>[]>([]);
    const [showIdWarning, setShowIdWarning] = useState(false);
    const [expandedFieldIndex, setExpandedFieldIndex] = useState<number | null>(null);
    const configInputRef = useRef<HTMLInputElement>(null);
    const [importMode, setImportMode] = useState<"replace" | "merge">("replace");
    const [configStatus, setConfigStatus] = useState<{ message: string; variant: "info" | "error" } | null>(null);

    const isSystemFieldType = (field: AcTypeField) => {
        const label = (field.label || "").toLowerCase();
        const key = (field.key || "").toLowerCase();
        return !!field.system || !!field.isId || field.inputType === "signature" || (field.inputType === "image" && field.hidden)
            || label.includes("service terakhir") || key.includes("service_terakhir") || key.includes("last_service")
            || label.includes("lokasi") || label.includes("location") || key.includes("lokasi") || key.includes("location");
    };

    const isLastConditionField = (label: string, key: string) => {
        const labelLower = label.toLowerCase();
        const keyLower = key.toLowerCase();
        return labelLower.includes("kondisi terakhir") || labelLower.includes("last condition")
            || keyLower.includes("kondisi_terakhir") || keyLower.includes("last_condition");
    };

    const isTechnicianField = (label: string, key: string) => {
        const labelLower = label.toLowerCase();
        const keyLower = key.toLowerCase();
        return labelLower.includes("teknisi") || labelLower.includes("technician")
            || keyLower.includes("teknisi") || keyLower.includes("technician");
    };

    const normalizeAutofillType = (value?: string): "user" | "timestamp" | undefined => {
        if (value === "user" || value === "timestamp") return value;
        return undefined;
    };

    const getMissingSystemFields = (list: AcTypeField[]) => {
        const hasId = list.some(f => f.isId || ID_ALIASES.includes((f.key || "").toLowerCase()));
        const hasPhoto = list.some(f => (f.inputType === "image" || f.isImage) && ["foto_url", "photo_url"].includes((f.key || "").toLowerCase()));
        const hasSignature = list.some(f => f.inputType === "signature" || ["tanda_tangan", "ttd", "signature", "paraf"].includes((f.key || "").toLowerCase()));
        const missing: string[] = [];
        if (!hasId) missing.push("ID_AC");
        if (!hasPhoto) missing.push("FOTO URL");
        if (!hasSignature) missing.push("Tanda Tangan");
        return missing;
    };

    const normalizeImportedFields = (list: AcTypeField[]): AcTypeField[] => {
        let normalized = list.map((field): AcTypeField => {
            const keyLower = (field.key || "").toLowerCase();
            const labelLower = (field.label || "").toLowerCase();
            const isIdField = !!field.isId || ID_ALIASES.includes(keyLower) || ID_ALIASES.includes(labelLower);
            let inputType: AcTypeField["inputType"] = field.inputType || (field.isImage ? "image" : "text");
            let hidden = !!field.hidden;
            let readonly = !!field.readonly;
            let system = !!field.system;

            if (isIdField) {
                inputType = "readonly";
                hidden = true;
                readonly = true;
                system = true;
            }

            if (!isIdField && (
                labelLower.includes("ttd") || labelLower.includes("tanda tangan") || labelLower.includes("signature") || labelLower.includes("paraf")
                || keyLower.includes("ttd") || keyLower.includes("tanda_tangan") || keyLower.includes("signature") || keyLower.includes("paraf")
            )) {
                inputType = "signature";
                hidden = true;
                system = true;
            }

            if (!isIdField && (labelLower.includes("foto") || labelLower.includes("photo") || labelLower.includes("dokumentasi") || labelLower.includes("gambar"))) {
                inputType = "image";
                system = true;
                if (keyLower === "foto_url" || keyLower === "photo_url") {
                    hidden = false;
                } else {
                    hidden = true;
                }
            }

            if (!isIdField && isLastConditionField(field.label || "", field.key || "")) {
                inputType = "select";
                system = true;
            }

            if (!isIdField && isTechnicianField(field.label || "", field.key || "")) {
                system = true;
                return {
                    ...field,
                    label: field.label || "Teknisi",
                    inputType: "user",
                    hidden,
                    readonly: true,
                    system,
                    isId: !!field.isId,
                    autofill: true,
                    autofillType: "user" as const,
                        options: field.options || [],
                        optionsText: field.optionsText || (field.options?.length ? field.options.join("\n") : ""),
                        format: field.format || "",
                    };
            }

            if (labelLower.includes("lokasi") || labelLower.includes("location") || keyLower.includes("lokasi") || keyLower.includes("location")) {
                readonly = true;
                hidden = true;
            }

            if (labelLower.includes("service terakhir") || labelLower.includes("last service") || keyLower.includes("service_terakhir") || keyLower.includes("last_service")) {
                readonly = true;
                system = true;
                return {
                    ...field,
                    label: field.label || "Service Terakhir",
                    inputType: "date",
                    hidden,
                    readonly,
                    system,
                    isId: !!field.isId,
                    autofill: true,
                    autofillType: "timestamp" as const,
                    options: field.options || [],
                    optionsText: field.optionsText || (field.options?.length ? field.options.join("\n") : ""),
                    format: field.format || "",
                };
            }
            if (labelLower.includes("jadwal berikutnya") || keyLower.includes("jadwal_berikutnya") || keyLower.includes("service_berikutnya") || keyLower.includes("next_schedule")) {
                inputType = "date";
                system = true;
            }
            if (labelLower.includes("jenis unit") || keyLower.includes("jenis_unit")) {
                readonly = true;
                system = true;
                hidden = true;
            }
            if (labelLower.includes("jadwal berikutnya") || keyLower.includes("jadwal_berikutnya") || keyLower.includes("service_berikutnya") || keyLower.includes("next_schedule")) {
                inputType = "select";
                system = true;
            }

            let label = field.label;
            if (isIdField) {
                label = "ID_AC";
            } else if (inputType === "signature" && (keyLower.includes("ttd") || labelLower.includes("tanda tangan") || keyLower.includes("tanda_tangan"))) {
                label = "Tanda Tangan";
            } else if (inputType === "image" && (keyLower === "foto_url" || keyLower === "photo_url" || labelLower.includes("foto url") || labelLower.includes("photo url"))) {
                label = "FOTO URL";
            }

            return {
                ...field,
                label,
                inputType: inputType as AcTypeField["inputType"],
                hidden,
                readonly,
                system: system || isSystemFieldType(field),
                isId: !!field.isId,
                autofillType: normalizeAutofillType(field.autofillType),
                options: field.options || (isLastConditionField(field.label || "", field.key || "") ? ["Baik", "Bermasalah"] : []),
                optionsText: field.optionsText || (field.options?.length ? field.options.join("\n") : (isLastConditionField(field.label || "", field.key || "") ? "Baik\nBermasalah" : "")),
                format: field.format || "",
            };
        });

        if (!normalized.some(field => field.isId)) {
            const firstAliasIndex = normalized.findIndex(field => ID_ALIASES.includes((field.key || "").toLowerCase()));
            if (firstAliasIndex >= 0) {
                normalized[firstAliasIndex] = {
                    ...normalized[firstAliasIndex],
                    isId: true,
                    label: "ID_AC",
                    key: normalized[firstAliasIndex].key || "id_ac",
                    inputType: "readonly",
                    hidden: true,
                    readonly: true,
                    system: true,
                };
            } else {
                normalized = [
                    { label: "ID_AC", key: "id_ac", cell: "", inputType: "readonly", autofill: false, autofillType: undefined, isImage: false, options: [], optionsText: "", format: "", hidden: true, readonly: true, isId: true, system: true },
                    ...normalized
                ];
            }
        }

        const hasPhoto = normalized.some(field => ["foto_url", "photo_url"].includes((field.key || "").toLowerCase()));
        const hasSignature = normalized.some(field => ["tanda_tangan", "ttd", "signature", "paraf"].includes((field.key || "").toLowerCase()));
        if (!hasPhoto) {
            normalized.push({ label: "FOTO URL", key: "foto_url", cell: "", inputType: "image", autofill: false, autofillType: undefined, isImage: true, options: [], optionsText: "", format: "", hidden: true, readonly: false, system: true, isId: false });
        }
        if (!hasSignature) {
            normalized.push({ label: "Tanda Tangan", key: "tanda_tangan", cell: "", inputType: "signature", autofill: false, autofillType: undefined, isImage: false, options: [], optionsText: "", format: "", hidden: true, readonly: false, system: true, isId: false });
        }

        return normalized;
    };

    const handleExportConfig = () => {
        const payload = {
            name,
            fields,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${name || "ac-type"}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleImportConfig = async (file: File | null, mode: "replace" | "merge" = "replace") => {
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const nextName = parsed.name || name;
            const rawFields = Array.isArray(parsed) ? parsed : parsed.fields;
            if (!rawFields || !Array.isArray(rawFields)) {
                setConfigStatus({ message: "Format config tidak valid", variant: "error" });
                return;
            }
            setName(nextName);
            if (mode === "replace") {
                setFields(normalizeImportedFields(rawFields));
            } else {
                setFields(prev => {
                    const merged = [...prev, ...rawFields];
                    return normalizeImportedFields(merged);
                });
            }
            setConfigStatus({ message: `Config loaded (${mode})`, variant: "info" });
        } catch (e) {
            setConfigStatus({ message: "Gagal memuat config", variant: "error" });
        } finally {
            if (configInputRef.current) configInputRef.current.value = "";
        }
    };

    const handlePasteConfig = async (mode: "replace" | "merge") => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) {
                setConfigStatus({ message: "Clipboard kosong", variant: "error" });
                return;
            }
            const parsed = JSON.parse(text);
            const nextName = parsed.name || name;
            const rawFields = Array.isArray(parsed) ? parsed : parsed.fields;
            if (!rawFields || !Array.isArray(rawFields)) {
                setConfigStatus({ message: "Format config tidak valid", variant: "error" });
                return;
            }
            setName(nextName);
            if (mode === "replace") {
                setFields(normalizeImportedFields(rawFields));
            } else {
                setFields(prev => normalizeImportedFields([...prev, ...rawFields]));
            }
            setConfigStatus({ message: `Config pasted (${mode})`, variant: "info" });
        } catch (e) {
            setConfigStatus({ message: "Gagal membaca clipboard", variant: "error" });
        }
    };

    const handleCopyConfig = async () => {
        try {
            const payload = JSON.stringify({ name, fields }, null, 2);
            await navigator.clipboard.writeText(payload);
            setConfigStatus({ message: "Config disalin ke clipboard", variant: "info" });
        } catch (e) {
            setConfigStatus({ message: "Gagal menyalin ke clipboard", variant: "error" });
        }
    };

    const handleConfirmSave = async () => {
        const validFields = fields.filter(f => f.label.trim() && f.key.trim());
        await onSave(name, validFields);
        setShowIdWarning(false);
        onClose();
    };

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setName(initialData.name);
                // Ensure fields have cell property if missing (backward compatibility)
                let loadedFields = initialData.fields.map(f => {
                    const isIdField = !!f.isId || ID_ALIASES.includes((f.key || "").toLowerCase());
                    const isSystem = isSystemFieldType({ ...f, isId: isIdField });
                    const isTechnician = isTechnicianField(f.label || "", f.key || "");
                    return { 
                        ...f, 
                        cell: f.cell || "",
                        autofill: isTechnician ? true : !!f.autofill,
                        autofillType: isTechnician ? "user" : normalizeAutofillType(f.autofillType),
                        isImage: !!f.isImage,
                        inputType: isIdField ? "readonly" : (f.inputType || (f.isImage ? "image" : "text")),
                        options: f.options || [],
                        optionsText: f.optionsText || (f.options?.length ? f.options.join("\n") : ""),
                        format: f.format || "",
                        hidden: isIdField ? true : !!f.hidden,
                        readonly: isIdField ? true : !!f.readonly,
                        isId: !!f.isId,
                        system: isSystem || isTechnician
                    };
                });

                if (!loadedFields.some(f => f.isId)) {
                    const firstAliasIndex = loadedFields.findIndex(f => ID_ALIASES.includes((f.key || "").toLowerCase()));
                    if (firstAliasIndex >= 0) {
                        loadedFields[firstAliasIndex] = {
                            ...loadedFields[firstAliasIndex],
                            isId: true,
                            label: "ID_AC",
                            key: loadedFields[firstAliasIndex].key || "id_ac",
                            inputType: "readonly",
                            hidden: true,
                            readonly: true,
                            system: true,
                        };
                    }
                }

                // Ensure ID field exists
                const hasId = loadedFields.some(f => ID_ALIASES.includes((f.key || "").toLowerCase()));
                if (!hasId) {
                    loadedFields = [{ label: "ID_AC", key: "id_ac", cell: "", inputType: "readonly", autofill: false, autofillType: undefined, isImage: false, options: [], optionsText: "", format: "", hidden: true, readonly: true, isId: true, system: true }, ...loadedFields];
                }
                setFields(loadedFields);
            } else {
                setName("");
                setFields([
                    { label: "ID_AC", key: "id_ac", cell: "", inputType: "readonly", autofill: false, autofillType: undefined, isImage: false, options: [], optionsText: "", format: "", hidden: true, readonly: true, isId: true, system: true },
                    { label: "FOTO URL", key: "foto_url", cell: "", inputType: "image", autofill: false, autofillType: undefined, isImage: true, options: [], optionsText: "", format: "", hidden: false, readonly: false, system: true },
                    { label: "Tanda Tangan", key: "tanda_tangan", cell: "", inputType: "signature", autofill: false, autofillType: undefined, isImage: false, options: [], optionsText: "", format: "", hidden: false, readonly: false, system: true },
                    { label: "Teknisi", key: "teknisi", cell: "", inputType: "user", autofill: true, autofillType: "user", isImage: false, options: [], optionsText: "", format: "", hidden: true, readonly: true, system: true },
                    { label: "Service Terakhir", key: "service_terakhir", cell: "", inputType: "date", autofill: true, autofillType: "timestamp", isImage: false, options: [], optionsText: "", format: "", hidden: true, readonly: true, system: true },
                    { label: "Jadwal Berikutnya", key: "jadwal_berikutnya", cell: "", inputType: "date", autofill: false, autofillType: undefined, isImage: false, options: [], optionsText: "", format: "", hidden: false, readonly: false, system: true },
                    { label: "Jenis Unit", key: "jenis_unit", cell: "", inputType: "text", autofill: false, autofillType: undefined, isImage: false, options: [], optionsText: "", format: "", hidden: true, readonly: true, system: true },
                    { label: "Lokasi", key: "lokasi", cell: "", inputType: "text", autofill: false, autofillType: undefined, isImage: false, options: [], optionsText: "", format: "", hidden: true, readonly: true, system: true },
                    { label: "", key: "", cell: "", inputType: "text", autofill: false, autofillType: undefined, isImage: false, options: [], optionsText: "", format: "", hidden: false, readonly: false }
                ]);
            }
            // Reset scan state on new open unless preserving context? Better reset.
            setScanUrl("");
            setNameError(null);
            setAvailableSheets([]);
            setSelectedSheet("");
            setCellRange("");
            setPreviewData([]);
            setScanError(null);
            setExpandedFieldIndex(null);
            setConfigStatus(null);
        }
    }, [isOpen, initialData]);

    useEffect(() => {
        if (!configStatus) return;
        const timeout = window.setTimeout(() => setConfigStatus(null), 3000);
        return () => window.clearTimeout(timeout);
    }, [configStatus]);

    // Debounced sheet fetching
    useEffect(() => {
        const fetchSheets = async () => {
            if (!scanUrl || !scanUrl.includes("/spreadsheets/d/")) {
                setAvailableSheets([]);
                return;
            }
            setLoadingSheets(true);
            try {
                const res = await fetch("/api/admin/ac-types/sheets", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ spreadsheetUrl: scanUrl })
                });
                const data = await res.json();
                if (res.ok && data.sheets) {
                    setAvailableSheets(data.sheets);
                    if (data.sheets.length > 0) {
                        setSelectedSheet(data.sheets[0]);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch sheets", e);
            } finally {
                setLoadingSheets(false);
            }
        };

        const timeout = setTimeout(fetchSheets, 800);
        return () => clearTimeout(timeout);
    }, [scanUrl]);

    const handleFieldChange = (index: number, field: keyof AcTypeField, value: any) => {
        setFields(prev => {
            const next = [...prev];
            const updatedField = { ...next[index], [field]: value };
            
            if (field === "inputType") {
                if (value === "image") updatedField.isImage = true;
                else updatedField.isImage = false;

                if (value === "user") {
                    updatedField.autofill = true;
                    updatedField.autofillType = "user";
                    updatedField.system = true;
                    updatedField.readonly = true;
                }
                
                // Clear options if not select
                if (value !== "select") {
                    updatedField.options = [];
                    updatedField.optionsText = "";
                }
                // Clear format if not computed
                if (value !== "computed") updatedField.format = "";
            }

                if (field === "autofill") {
                    if (value === true && !updatedField.autofillType) {
                        updatedField.autofillType = "timestamp";
                    }
                    if (value === false) {
                        updatedField.autofillType = undefined;
                    }
                }

            if (field === "autofillType") {
                updatedField.autofillType = normalizeAutofillType(String(value));
            }

            next[index] = updatedField;

            // Auto-generate key from label if key hasn't been manually touched (simple heuristic)
            if (field === "label" && !next[index].key && typeof value === "string") {
                next[index].key = value.toLowerCase().replace(/[^a-z0-9]/g, "_");
            }

            if (field === "label" && typeof value === "string") {
                if (isLastConditionField(value, next[index].key || "")) {
                    next[index] = {
                        ...next[index],
                        inputType: "select",
                        options: ["Baik", "Bermasalah"],
                        optionsText: "Baik\nBermasalah",
                        system: true,
                    };
                }

                const labelLower = value.toLowerCase();
                if (labelLower.includes("lokasi") || labelLower.includes("location")) {
                    next[index] = {
                        ...next[index],
                        readonly: true,
                        hidden: true,
                        system: true,
                    };
                }

                if (isTechnicianField(value, next[index].key || "")) {
                    next[index] = {
                        ...next[index],
                        autofill: true,
                        autofillType: "user",
                        system: true,
                        inputType: "user",
                        readonly: true,
                        hidden: true,
                    };
                }

                if (value.toLowerCase().includes("jenis unit")) {
                    next[index] = {
                        ...next[index],
                        readonly: true,
                        hidden: true,
                        system: true,
                    };
                }

                if (value.toLowerCase().includes("jadwal berikutnya")) {
                    next[index] = {
                        ...next[index],
                        inputType: "date",
                        system: true,
                    };
                }

                if (value.toLowerCase().includes("service terakhir") || value.toLowerCase().includes("last service")) {
                    next[index] = {
                        ...next[index],
                        inputType: "date",
                        autofill: true,
                        autofillType: "timestamp",
                        system: true,
                        hidden: true,
                        readonly: true,
                    };
                }
            }

            if (field === "key") {
                const isIdAlias = ID_ALIASES.includes(String(value || "").toLowerCase());
                const hasOtherId = next.some((f, i) => i !== index && f.isId);
                if (isIdAlias && !hasOtherId) {
                    updatedField.inputType = "readonly";
                    updatedField.hidden = true;
                    updatedField.readonly = true;
                    updatedField.isId = true;
                    updatedField.system = true;
                    updatedField.label = "ID_AC";
                }

                const keyLower = String(value || "").toLowerCase();
                if (keyLower.includes("ttd") || keyLower.includes("tanda_tangan") || keyLower.includes("signature") || keyLower.includes("paraf")) {
                    updatedField.inputType = "signature";
                    updatedField.hidden = true;
                    updatedField.system = true;
                    updatedField.label = "Tanda Tangan";
                }

                if (keyLower === "foto_url" || keyLower === "photo_url" || keyLower.includes("foto") || keyLower.includes("photo") || keyLower.includes("gambar") || keyLower.includes("image")) {
                    updatedField.inputType = "image";
                    updatedField.isImage = true;
                    updatedField.hidden = keyLower === "foto_url" || keyLower === "photo_url" ? false : true;
                    updatedField.system = true;
                    updatedField.label = "FOTO URL";
                }

                if (isLastConditionField(updatedField.label || "", keyLower)) {
                    updatedField.inputType = "select";
                    updatedField.options = ["Baik", "Bermasalah"];
                    updatedField.optionsText = "Baik\nBermasalah";
                    updatedField.system = true;
                }

                if (keyLower.includes("jadwal_berikutnya") || keyLower.includes("service_berikutnya") || keyLower.includes("next_schedule") || keyLower.includes("jadwal berikutnya")) {
                    updatedField.inputType = "date";
                    updatedField.system = true;
                    updatedField.options = [];
                    updatedField.optionsText = "";
                }

                if (keyLower.includes("service_terakhir") || keyLower.includes("last_service")) {
                    updatedField.inputType = "date";
                    updatedField.autofill = true;
                    updatedField.autofillType = "timestamp";
                    updatedField.system = true;
                    updatedField.hidden = true;
                    updatedField.readonly = true;
                }

                if (keyLower.includes("lokasi") || keyLower.includes("location")) {
                    updatedField.readonly = true;
                    updatedField.system = true;
                    updatedField.hidden = true;
                }

                if (keyLower.includes("jenis_unit") || keyLower.includes("jenis unit")) {
                    updatedField.readonly = true;
                    updatedField.hidden = true;
                    updatedField.system = true;
                }

                if (isTechnicianField(updatedField.label || "", keyLower)) {
                    updatedField.autofill = true;
                    updatedField.autofillType = "user";
                    updatedField.system = true;
                    updatedField.inputType = "user";
                    updatedField.readonly = true;
                    updatedField.hidden = true;
                }
            }
            return next;
        });
    };

    const handleToggleId = (index: number, checked: boolean) => {
        setFields(prev => {
            if (checked) {
                const alreadyHasId = prev.some((f, i) => i !== index && (f.isId || ID_ALIASES.includes((f.key || "").toLowerCase())));
                if (alreadyHasId) {
                    alert("Hanya boleh ada satu field ID. Hapus/ubah ID lain terlebih dulu.");
                    return prev;
                }
            }

            return prev.map((f, i) => {
                if (i !== index) return checked ? { ...f, isId: false } : f;
                if (!checked) return { ...f, isId: false };
                const nextKey = f.key && f.key.trim() ? f.key : "id_ac";
                return {
                    ...f,
                    label: "ID_AC",
                    key: nextKey,
                    isId: true,
                    system: true,
                    inputType: "readonly",
                    hidden: true,
                    readonly: true,
                };
            });
        });
    };

    
    const handleOptionsChange = (index: number, optionsStr: string) => {
        const options = optionsStr.split("\n").map(s => s.trim()).filter(Boolean);
        setFields(prev => {
            const next = [...prev];
            next[index] = { ...next[index], options, optionsText: optionsStr };
            return next;
        });
    };

    const addField = () => {
        setFields(prev => [...prev, { label: "", key: "", inputType: "text" }]);
    };

    const removeField = (index: number) => {
        setFields(prev => prev.filter((_, i) => i !== index));
    };

    const handleScan = async () => {
        setScanError(null);
        setIsScanning(true);
        try {
            let range = cellRange;
            if (selectedSheet) {
                // Wrap sheet name in quotes if it contains spaces or special characters
                const sheetPart = /^[a-zA-Z0-9_]+$/.test(selectedSheet) ? selectedSheet : `'${selectedSheet}'`;
                range = `${sheetPart}!${cellRange}`;
            }
            
            const res = await fetch("/api/admin/ac-types/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ spreadsheetUrl: scanUrl, range })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Scan failed");
            }
            if (data.fields) {
                let scannedFields = data.fields.map((f: AcTypeField) => {
                    const labelLower = (f.label || "").toLowerCase();
                    const keyLower = (f.key || "").toLowerCase();
                    let inputType: AcTypeField["inputType"] = "text";
                    let hidden = false;
                    let readonly = false;
                    const format = "";

                    const isIdField = ID_ALIASES.includes(keyLower) || ID_ALIASES.includes(labelLower);
                    let system = false;
                    if (isIdField) {
                        inputType = "readonly";
                        hidden = true;
                        readonly = true;
                        system = true;
                    }

                    // Heuristics
                    if (!isIdField && (
                        labelLower.includes("ttd") || labelLower.includes("tanda tangan") || labelLower.includes("signature") || labelLower.includes("paraf")
                        || keyLower.includes("ttd") || keyLower.includes("tanda_tangan") || keyLower.includes("signature") || keyLower.includes("paraf")
                    )) {
                        inputType = "signature";
                        if (keyLower.includes("ttd") || keyLower.includes("tanda_tangan") || labelLower.includes("tanda tangan")) {
                            hidden = false;
                        } else {
                            hidden = true;
                        }
                        system = true;
                    } else if (!isIdField && (labelLower.includes("foto") || labelLower.includes("photo") || labelLower.includes("dokumentasi") || labelLower.includes("gambar"))) {
                        inputType = "image";
                        if (keyLower === "foto_url" || keyLower === "photo_url") {
                            hidden = false;
                        } else {
                            hidden = true;
                        }
                        system = true;
                    } else if (!isIdField && isLastConditionField(f.label || "", f.key || "")) {
                        inputType = "select";
                        system = true;
                    } else if (!isIdField && (labelLower.includes("jadwal berikutnya") || keyLower.includes("jadwal_berikutnya") || keyLower.includes("service_berikutnya") || keyLower.includes("next_schedule"))) {
                        inputType = "date";
                        system = true;
                    } else if (!isIdField && (labelLower.includes("jenis unit") || keyLower.includes("jenis_unit"))) {
                        inputType = "text";
                        system = true;
                        readonly = true;
                        hidden = true;
                    } else if (!isIdField && isTechnicianField(f.label || "", f.key || "")) {
                        system = true;
                        inputType = "user";
                        readonly = true;
                        hidden = true;
                    } else if (!isIdField && (labelLower.includes("service terakhir") || labelLower.includes("last service"))) {
                        inputType = "date";
                        readonly = true;
                        system = true;
                        hidden = true;
                        f.autofill = true;
                        f.autofillType = "timestamp";
                    } else if (!isIdField && (labelLower.includes("service berikutnya") || labelLower.includes("next service"))) {
                        inputType = "date";
                        system = true;
                    } else if (!isIdField && (labelLower.includes("lokasi") || labelLower.includes("location"))) {
                         inputType = "text";
                         system = true;
                         readonly = true;
                         hidden = true;
                    }

                    let label = f.label;
                    if (isIdField) {
                        label = "ID_AC";
                    } else if (inputType === "signature" && (keyLower.includes("ttd") || labelLower.includes("tanda tangan") || keyLower.includes("tanda_tangan"))) {
                        label = "Tanda Tangan";
                    } else if (inputType === "image" && (keyLower === "foto_url" || keyLower === "photo_url" || labelLower.includes("foto url") || labelLower.includes("photo url"))) {
                        label = "FOTO URL";
                    }

                    const isJenis = labelLower.includes("jenis unit") || keyLower.includes("jenis_unit");
                    const isTeknisi = isTechnicianField(f.label || "", f.key || "");
                    return { 
                        ...f, 
                        label,
                        inputType,
                        hidden: isTeknisi ? true : (isJenis ? true : hidden),
                        readonly,
                        format,
                        options: isLastConditionField(f.label || "", f.key || "") ? ["Baik", "Bermasalah"] : [],
                        optionsText: isLastConditionField(f.label || "", f.key || "") ? "Baik\nBermasalah" : (f.optionsText || (f.options?.length ? f.options.join("\n") : "")),
                        isId: false,
                        system,
                        autofill: isTeknisi ? true : f.autofill,
                        autofillType: isTeknisi ? "user" : normalizeAutofillType(f.autofillType),
                    };
                });

                if (!scannedFields.some((field: AcTypeField) => field.isId)) {
                    const firstAliasIndex = scannedFields.findIndex((field: AcTypeField) => ID_ALIASES.includes((field.key || "").toLowerCase()));
                    if (firstAliasIndex >= 0) {
                        scannedFields[firstAliasIndex] = {
                            ...scannedFields[firstAliasIndex],
                            isId: true,
                            label: "ID_AC",
                            key: scannedFields[firstAliasIndex].key || "id_ac",
                            inputType: "readonly",
                            hidden: true,
                            readonly: true,
                            system: true,
                        };
                    }
                }

                const hasId = scannedFields.some((f: AcTypeField) => ID_ALIASES.includes((f.key || "").toLowerCase()));
                const hasPhoto = scannedFields.some((f: AcTypeField) => ["foto_url", "photo_url"].includes((f.key || "").toLowerCase()));
                const hasSignature = scannedFields.some((f: AcTypeField) => ["tanda_tangan", "ttd", "signature", "paraf"].includes((f.key || "").toLowerCase()));
                
                if (!hasId) {
                    scannedFields.unshift({ label: "ID_AC", key: "id_ac", cell: "", inputType: "readonly", autofill: false, autofillType: undefined, isImage: false, options: [], optionsText: "", format: "", hidden: true, readonly: true, isId: true, system: true });
                }
                if (!hasPhoto) {
                    scannedFields.push({ label: "FOTO URL", key: "foto_url", cell: "", inputType: "image", autofill: false, autofillType: undefined, isImage: true, options: [], optionsText: "", format: "", hidden: true, readonly: false, system: true, isId: false });
                }
                if (!hasSignature) {
                    scannedFields.push({ label: "Tanda Tangan", key: "tanda_tangan", cell: "", inputType: "signature", autofill: false, autofillType: undefined, isImage: false, options: [], optionsText: "", format: "", hidden: true, readonly: false, system: true, isId: false });
                }

                setFields(prev => {
                    const existingByKey = new Map<string, AcTypeField>();
                    prev.forEach(field => {
                        if (field.key) existingByKey.set(field.key.toLowerCase(), field);
                    });

                    const merged = [...prev];
                    scannedFields.forEach((scanned: AcTypeField) => {
                        const key = (scanned.key || "").toLowerCase();
                        const existing = existingByKey.get(key);
                        if (!existing) {
                            merged.push(scanned);
                            return;
                        }
                        // Fill missing label/cell without overwriting customized values
                        if (!existing.label && scanned.label) {
                            existing.label = scanned.label;
                        }
                        if (!existing.cell && scanned.cell) {
                            existing.cell = scanned.cell;
                        }
                    });

                    return merged;
                });
            }
            if (data.previewData) {
                setPreviewData(data.previewData);
            }
        } catch (e) {
            setScanError(e instanceof Error ? e.message : "Scan failed");
        } finally {
            setIsScanning(false);
        }
    };

    const handleCellBlurValue = async (index: number, cell: string) => {
        const trimmedCell = cell.trim();
        if (!trimmedCell) return;
        const current = fields[index];
        if (current?.label?.trim()) return;
        if (!scanUrl || !scanUrl.includes("/spreadsheets/d/")) return;

        try {
            let range = trimmedCell;
            if (selectedSheet) {
                const sheetPart = /^[a-zA-Z0-9_]+$/.test(selectedSheet) ? selectedSheet : `'${selectedSheet}'`;
                range = `${sheetPart}!${trimmedCell}`;
            }

            const res = await fetch("/api/admin/ac-types/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ spreadsheetUrl: scanUrl, range })
            });
            const data = await res.json();
            if (!res.ok) {
                return;
            }
            const label = (data.headers && data.headers[0]) ? String(data.headers[0]) : "";
            if (label) {
                handleFieldChange(index, "label", label);
            }
        } catch (e) {
            // silent
        }
    };

    const handleSave = async () => {
        setNameError(null);
        if (!name.trim()) {
            setNameError("Nama tipe AC harus diisi");
            return;
        }
        const validFields = fields.filter(f => f.label.trim() && f.key.trim());
        if (validFields.length === 0) {
            alert("Minimal satu field valid harus diisi");
            return;
        }
        
        // Validate ID fields - Allow exactly one or zero (system will use generated ID if zero, but typically we want one for sync)
        const idFields = validFields.filter(f => f.isId || ID_ALIASES.includes(f.key.toLowerCase()));
        
        if (idFields.length > 1) {
            alert(`Terdeteksi ${idFields.length} field yang berfungsi sebagai ID (${idFields.map(f => f.key).join(", ")}). Harap gunakan hanya satu field sebagai ID (misal: ubah key yang lain agar tidak menggunakan nama reserved seperti 'id', 'kode', dll).`);
            return;
        }

        if (idFields.length === 0) {
            setShowIdWarning(true);
            return;
        }

        await onSave(name, validFields);
        onClose();
    };

    const systemFieldEntries = fields.map((field, index) => ({ field, index })).filter(({ field }) => isSystemFieldType(field));
    const customFieldEntries = fields.map((field, index) => ({ field, index })).filter(({ field }) => !isSystemFieldType(field));

    if (!isOpen) return null;

    return (
        <>
            <ConfirmationModal
                isOpen={showIdWarning}
                onClose={() => setShowIdWarning(false)}
                onConfirm={handleConfirmSave}
                title="Peringatan: Missing ID Field"
                message={
                    <div className="space-y-2">
                        <p>Tidak ada field yang terdeteksi sebagai ID.</p>
                        <p>Sistem membutuhkan setidaknya satu field dengan key <strong>'id', 'kode', 'asset_code', 'no', 'no_asset', atau 'unit_id'</strong> untuk sinkronisasi data.</p>
                        <p>Apakah Anda yakin ingin menyimpan tanpa field ID?</p>
                    </div>
                }
                confirmLabel="Simpan Tanpa ID"
                cancelLabel="Batal"
                variant="warning"
            />
            {createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
                    <div className="relative w-full max-w-6xl rounded-3xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto flex flex-col md:flex-row gap-6">
                
                {/* Left Column: Configuration */}
                <div className="flex-1 space-y-6 overflow-y-auto pr-2">
                    <h3 className="text-lg font-semibold text-[#1f1f1f]">Konfigurasi Tipe AC</h3>
                    
                    <div className="space-y-4 rounded-2xl border border-black/10 p-4 bg-gray-50">
                        <p className="text-xs font-semibold uppercase text-(--depthui-muted)">
                            <span className="inline-flex items-center gap-1">
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 4h16v16H4z" />
                                    <path d="M4 9h16" />
                                    <path d="M9 4v16" />
                                </svg>
                                Auto-Scan from Sheets
                            </span>
                        </p>
                        <div className="flex items-center justify-between">
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setImportMode("replace");
                                        configInputRef.current?.click();
                                    }}
                                    className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-[10px] font-semibold text-[#1f1f1f] hover:border-black/30"
                                    title="Load (Replace)"
                                    aria-label="Load config replace"
                                >
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <path d="M12 3v12" />
                                        <path d="M7 8l5-5 5 5" />
                                    </svg>
                                    Replace
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setImportMode("merge");
                                        configInputRef.current?.click();
                                    }}
                                    className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-[10px] font-semibold text-[#1f1f1f] hover:border-black/30"
                                    title="Load (Merge)"
                                    aria-label="Load config merge"
                                >
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <path d="M12 3v12" />
                                        <path d="M7 8l5-5 5 5" />
                                        <path d="M5 13h4" />
                                        <path d="M7 11v4" />
                                    </svg>
                                    Merge
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePasteConfig("replace")}
                                    className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-[10px] font-semibold text-[#1f1f1f] hover:border-black/30"
                                    title="Paste (Replace)"
                                    aria-label="Paste config replace"
                                >
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="8" y="4" width="8" height="4" rx="1" />
                                        <path d="M7 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" />
                                        <path d="M9 14h6" />
                                        <path d="M9 17h4" />
                                    </svg>
                                    Replace
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePasteConfig("merge")}
                                    className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-[10px] font-semibold text-[#1f1f1f] hover:border-black/30"
                                    title="Paste (Merge)"
                                    aria-label="Paste config merge"
                                >
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="8" y="4" width="8" height="4" rx="1" />
                                        <path d="M7 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" />
                                        <path d="M9 14h6" />
                                        <path d="M9 17h4" />
                                        <path d="M12 12v4" />
                                        <path d="M10 14h4" />
                                    </svg>
                                    Merge
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCopyConfig}
                                    className="rounded-lg border border-black/10 bg-white p-2 text-[#1f1f1f] hover:border-black/30"
                                    title="Copy Config"
                                    aria-label="Copy config"
                                >
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="9" y="9" width="13" height="13" rx="2" />
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExportConfig}
                                    className="rounded-lg border border-black/10 bg-white p-2 text-[#1f1f1f] hover:border-black/30"
                                    title="Download Config"
                                    aria-label="Download config"
                                >
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <path d="M7 10l5 5 5-5" />
                                        <path d="M12 15V3" />
                                    </svg>
                                </button>
                            </div>
                            <input
                                ref={configInputRef}
                                type="file"
                                accept="application/json"
                                className="hidden"
                                onChange={(e) => handleImportConfig(e.target.files?.[0] || null, importMode)}
                            />
                        </div>
                        {configStatus && (
                            <p className={`text-[10px] ${configStatus.variant === "error" ? "text-rose-500" : "text-emerald-600"}`}>
                                {configStatus.message}
                            </p>
                        )}
                        <InputLabel label="Spreadsheet URL">
                            <input 
                                className="w-full rounded-xl border border-black/10 px-3 py-2 text-xs"
                                value={scanUrl}
                                onChange={e => setScanUrl(e.target.value)}
                                placeholder="https://docs.google.com/..."
                            />
                        </InputLabel>
                        <div className="flex gap-2">
                            <div className="w-1/3">
                                <InputLabel label="Sheet">
                                    <div className="relative">
                                        <select
                                            className="w-full appearance-none rounded-xl border border-black/10 bg-white px-3 py-2 text-xs disabled:bg-gray-100"
                                            value={selectedSheet}
                                            onChange={e => setSelectedSheet(e.target.value)}
                                            disabled={loadingSheets || availableSheets.length === 0}
                                        >
                                            {availableSheets.length === 0 ? (
                                                <option value="">{loadingSheets ? "Loading..." : "Manual"}</option>
                                            ) : (
                                                availableSheets.map(s => <option key={s} value={s}>{s}</option>)
                                            )}
                                        </select>
                                        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </div>
                                    </div>
                                </InputLabel>
                            </div>
                            <div className="flex-1">
                                <InputLabel label="Range (Header Row)">
                                    <input 
                                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-xs"
                                        value={cellRange}
                                        onChange={e => setCellRange(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === "Enter" && !isScanning && scanUrl && cellRange) {
                                                handleScan();
                                            }
                                        }}
                                        placeholder="e.g. A1:Z1"
                                    />
                                </InputLabel>
                            </div>
                            <div className="flex items-end">
                                <button 
                                    onClick={handleScan}
                                    disabled={isScanning || !scanUrl || !cellRange}
                                    className="rounded-xl bg-black px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:opacity-80 h-[34px]"
                                >
                                    {isScanning ? "..." : "Scan"}
                                </button>
                            </div>
                        </div>
                        {scanError && <p className="text-xs text-rose-500">{scanError}</p>}
                    </div>

                    <div className="space-y-4">
                        <InputLabel label="Nama Tipe AC">
                            <input
                                className={`w-full rounded-2xl border px-3 py-2 text-sm ${nameError ? "border-rose-500 bg-rose-50/10 focus:border-rose-500 focus:ring-rose-500" : "border-black/10"}`}
                                value={name}
                                onChange={e => {
                                    setName(e.target.value);
                                    if (nameError) setNameError(null);
                                }}
                                placeholder="Contoh: Cassette 2PK"
                            />
                            {nameError && <p className="text-xs text-rose-500 mt-1">{nameError}</p>}
                        </InputLabel>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="block text-xs font-semibold uppercase tracking-wider text-(--depthui-muted)">Fields Definition</span>
                                    {(() => {
                                        const missing = getMissingSystemFields(fields);
                                        if (missing.length === 0) return null;
                                        return (
                                            <span
                                                className="inline-flex items-center justify-center rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white"
                                                title={`Missing system fields: ${missing.join(", ")}`}
                                            >
                                                ! {missing.join(", ")}
                                            </span>
                                        );
                                    })()}
                                </div>
                            </div>
                                <div className="space-y-2">
                                {systemFieldEntries.length > 0 && (
                                    <div className="text-[10px] font-semibold uppercase text-(--depthui-muted)">System Fields</div>
                                )}
                                {systemFieldEntries.map(({ field, index }) => {
                                    const isIdField = !!field.isId;
                                    const isSystemField = isSystemFieldType(field);
                                    const isExpanded = expandedFieldIndex === index;
                                    
                                    return (
                                    <div key={`system-${index}`} className={`flex flex-col gap-2 transition-all border border-black/5 p-2 rounded-xl ${isIdField ? "bg-amber-50 ring-1 ring-amber-200" : "bg-white"}`}>
                                        <div className="flex gap-2 items-center">
                                            <div className="w-12 shrink-0">
                                                <input
                                                    className="w-full text-center rounded-lg border border-black/10 px-1 py-2 text-[12px] bg-gray-50 text-gray-500"
                                                    value={field.cell || ""}
                                                    onChange={e => handleFieldChange(index, "cell", e.target.value)}
                                                    onBlur={e => handleCellBlurValue(index, e.target.value)}
                                                    placeholder="Pos"
                                                />
                                            </div>
                                            <div className="flex-1 flex items-center gap-2">
                                                <input
                                                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                                                    value={field.label}
                                                    onChange={e => handleFieldChange(index, "label", e.target.value)}
                                                    placeholder="Label"
                                                />
                                                {isIdField && (
                                                    <span className="shrink-0 rounded-md bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700" title="Field ini akan digunakan sebagai Unique ID">
                                                        ID
                                                    </span>
                                                )}
                                                {isSystemField && (
                                                    // <span className="shrink-0 rounded-md bg-black/10 px-2 py-1 text-[10px] font-bold text-[#1f1f1f]" title="System Field">
                                                        // System
                                                    // </span>
                                                    <></>
                                                )}
                                                {field.autofill && (
                                                    <span className="shrink-0 rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700" title="Autofill Timestamp">
                                                        <span className="inline-flex items-center gap-1">
                                                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                                                <circle cx="12" cy="12" r="9" />
                                                                <path d="M12 7v5l3 3" />
                                                            </svg>
                                                            Auto
                                                        </span>
                                                    </span>
                                                )}
                                            </div>
                                            <div className="w-24">
                                                <select
                                                    className="w-full rounded-xl border border-black/10 px-2 py-2 text-xs bg-white"
                                                    value={field.inputType || "text"}
                                                    onChange={e => handleFieldChange(index, "inputType", e.target.value)}
                                                >
                                                    <option value="text">Text</option>
                                                    <option value="select">Dropdown</option>
                                                    <option value="date">Date</option>
                                                    <option value="datetime">Time</option>
                                                    <option value="image">Image</option>
                                                    <option value="signature">TTD</option>
                                                    <option value="computed">Concat</option>
                                                    <option value="user">User</option>
                                                </select>
                                            </div>
                                            <button
                                                onClick={() => setExpandedFieldIndex(isExpanded ? null : index)}
                                                className={`p-2 rounded-lg transition ${isExpanded ? "bg-black text-white" : "text-gray-400 hover:bg-black/5"}`}
                                                title="Advanced Settings"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => !isIdField && removeField(index)}
                                                disabled={isIdField}
                                                className={`p-2 ${isIdField ? "text-gray-200 cursor-not-allowed" : "text-gray-400 hover:text-rose-500"}`}
                                                title={isIdField ? "ID Field cannot be deleted" : "Hapus field"}
                                            >
                                                ✕
                                            </button>
                                        </div>

                                        {field.inputType === "select" && (
                                            <div className="col-span-2">
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Dropdown Options (One per line)</label>
                                                <textarea
                                                    className="w-full rounded-lg border border-black/10 px-2 py-1.5 text-xs min-h-[80px]"
                                                    value={field.optionsText ?? (field.options || []).join("\n")}
                                                    onChange={e => handleOptionsChange(index, e.target.value)}
                                                    placeholder="Option A&#10;Option B"
                                                />
                                            </div>
                                        )}

                                        {/* Expanded Settings */}
                                        {isExpanded && (
                                            <div className="grid grid-cols-2 gap-4 p-3 bg-black/5 rounded-lg text-sm mt-1">
                                                <div className="col-span-2 flex gap-4">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isIdField}
                                                            onChange={e => handleToggleId(index, e.target.checked)}
                                                            className="rounded border-gray-300 text-black focus:ring-black"
                                                        />
                                                        <span>ID Field (Unique)</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={field.autofill || false}
                                                            onChange={e => handleFieldChange(index, "autofill", e.target.checked)}
                                                            className="rounded border-gray-300 text-black focus:ring-black"
                                                        />
                                                        <span>Autofill (Hidden)</span>
                                                    </label>
                                                    {field.autofill && (
                                                        <label className="flex items-center gap-2">
                                                            <span className="text-xs text-gray-500">Type</span>
                                                            <select
                                                                className="rounded-lg border border-black/10 px-2 py-1 text-xs"
                                                                value={field.autofillType || "timestamp"}
                                                                onChange={e => handleFieldChange(index, "autofillType", e.target.value)}
                                                            >
                                                                <option value="timestamp">Timestamp</option>
                                                                <option value="user">User</option>
                                                            </select>
                                                        </label>
                                                    )}
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={field.hidden || false}
                                                            onChange={e => handleFieldChange(index, "hidden", e.target.checked)}
                                                            className="rounded border-gray-300 text-black focus:ring-black"
                                                        />
                                                        <span>Hidden from Form</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={field.readonly || false}
                                                            onChange={e => handleFieldChange(index, "readonly", e.target.checked)}
                                                            className="rounded border-gray-300 text-black focus:ring-black"
                                                        />
                                                        <span>Read Only</span>
                                                    </label>
                                                </div>
                                                
                                                <div className="col-span-2">
                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Database Key</label>
                                                    <input
                                                        className="w-full rounded-lg border border-black/10 px-2 py-1.5 text-xs font-mono"
                                                        value={field.key}
                                                        onChange={e => handleFieldChange(index, "key", e.target.value)}
                                                    />
                                                </div>

                                                {field.inputType === "computed" && (
                                                    <div className="col-span-2">
                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Format String (Use {`{key}`} or {`{B1}`})</label>
                                                        <input
                                                            className="w-full rounded-lg border border-black/10 px-2 py-1.5 text-xs"
                                                            value={field.format || ""}
                                                            onChange={e => handleFieldChange(index, "format", e.target.value)}
                                                            placeholder="{key1} - {key2}"
                                                        />
                                                        <p className="text-[10px] text-gray-400 mt-1">Example: "{`{lantai}`} - {`{ruangan}`}" or "{`{B1}`} - {`{D1}`}".</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                                {customFieldEntries.length > 0 && (
                                    <div className="text-[10px] font-semibold uppercase text-(--depthui-muted) mt-3">Custom Fields</div>
                                )}
                                {customFieldEntries.map(({ field, index }) => {
                                    const isIdField = !!field.isId;
                                    const isSystemField = isSystemFieldType(field);
                                    const isExpanded = expandedFieldIndex === index;
                                    
                                    return (
                                    <div key={`custom-${index}`} className={`flex flex-col gap-2 transition-all border border-black/5 p-2 rounded-xl ${isIdField ? "bg-amber-50 ring-1 ring-amber-200" : "bg-white"}`}>
                                        <div className="flex gap-2 items-center">
                                            <div className="w-12 shrink-0">
                                                <input
                                                    className="w-full text-center rounded-lg border border-black/10 px-1 py-2 text-[12px] bg-gray-50 text-gray-500"
                                                    value={field.cell || ""}
                                                    onChange={e => handleFieldChange(index, "cell", e.target.value)}
                                                    onBlur={e => handleCellBlurValue(index, e.target.value)}
                                                    placeholder="Pos"
                                                />
                                            </div>
                                            <div className="flex-1 flex items-center gap-2">
                                                <input
                                                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                                                    value={field.label}
                                                    onChange={e => handleFieldChange(index, "label", e.target.value)}
                                                    placeholder="Label"
                                                />
                                                {isIdField && (
                                                    <span className="shrink-0 rounded-md bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700" title="Field ini akan digunakan sebagai Unique ID">
                                                        ID
                                                    </span>
                                                )}
                                                {isSystemField && (
                                                    <span className="shrink-0 rounded-md bg-black/10 px-2 py-1 text-[10px] font-bold text-[#1f1f1f]" title="System Field">
                                                        System
                                                    </span>
                                                )}
                                                {field.autofill && (
                                                    <span className="shrink-0 rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700" title="Autofill Timestamp">
                                                        <span className="inline-flex items-center gap-1">
                                                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                                                <circle cx="12" cy="12" r="9" />
                                                                <path d="M12 7v5l3 3" />
                                                            </svg>
                                                            Auto
                                                        </span>
                                                    </span>
                                                )}
                                            </div>
                                            <div className="w-24">
                                                    <select
                                                        className="w-full rounded-xl border border-black/10 px-2 py-2 text-xs bg-white"
                                                        value={field.inputType || "text"}
                                                        onChange={e => handleFieldChange(index, "inputType", e.target.value)}
                                                    >
                                                    <option value="text">Text</option>
                                                    <option value="select">Dropdown</option>
                                                    <option value="date">Date</option>
                                                    <option value="datetime">Time</option>
                                                    <option value="image">Image</option>
                                                    <option value="signature">TTD</option>
                                                    <option value="computed">Concat</option>
                                                    <option value="user">User</option>
                                                    </select>
                                            </div>
                                            <button
                                                onClick={() => setExpandedFieldIndex(isExpanded ? null : index)}
                                                className={`p-2 rounded-lg transition ${isExpanded ? "bg-black text-white" : "text-gray-400 hover:bg-black/5"}`}
                                                title="Advanced Settings"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => !isIdField && removeField(index)}
                                                disabled={isIdField}
                                                className={`p-2 ${isIdField ? "text-gray-200 cursor-not-allowed" : "text-gray-400 hover:text-rose-500"}`}
                                                title={isIdField ? "ID Field cannot be deleted" : "Hapus field"}
                                            >
                                                ✕
                                            </button>
                                        </div>

                                        {field.inputType === "select" && (
                                            <div className="col-span-2">
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Dropdown Options (One per line)</label>
                                                <textarea
                                                    className="w-full rounded-lg border border-black/10 px-2 py-1.5 text-xs min-h-[80px]"
                                                    value={field.optionsText ?? (field.options || []).join("\n")}
                                                    onChange={e => handleOptionsChange(index, e.target.value)}
                                                    placeholder="Option A&#10;Option B"
                                                />
                                            </div>
                                        )}

                                        {field.inputType === "computed" && (
                                            <div className="col-span-2">
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Format String (Use {`{key}`} or {`{B1}`})</label>
                                                <input
                                                    className="w-full rounded-lg border border-black/10 px-2 py-1.5 text-xs"
                                                    value={field.format || ""}
                                                    onChange={e => handleFieldChange(index, "format", e.target.value)}
                                                    placeholder="{key1} - {key2}"
                                                />
                                                <p className="text-[10px] text-gray-400 mt-1">Example: "{`{lantai}`} - {`{ruangan}`}" or "{`{B1}`} - {`{D1}`}".</p>
                                            </div>
                                        )}
                                        
                                        {isExpanded && (
                                            <div className="grid grid-cols-2 gap-4 p-3 bg-black/5 rounded-lg text-sm mt-1">
                                                <div className="col-span-2 flex gap-4">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isIdField}
                                                            onChange={e => handleToggleId(index, e.target.checked)}
                                                            className="rounded border-gray-300 text-black focus:ring-black"
                                                        />
                                                        <span>ID Field (Unique)</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={field.autofill || false}
                                                            onChange={e => handleFieldChange(index, "autofill", e.target.checked)}
                                                            className="rounded border-gray-300 text-black focus:ring-black"
                                                        />
                                                        <span>Autofill (Hidden)</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={field.hidden || false}
                                                            onChange={e => handleFieldChange(index, "hidden", e.target.checked)}
                                                            className="rounded border-gray-300 text-black focus:ring-black"
                                                        />
                                                        <span>Hidden from Form</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={field.readonly || false}
                                                            onChange={e => handleFieldChange(index, "readonly", e.target.checked)}
                                                            className="rounded border-gray-300 text-black focus:ring-black"
                                                        />
                                                        <span>Read Only</span>
                                                    </label>
                                                </div>
                                                
                                                <div className="col-span-2">
                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Database Key</label>
                                                    <input
                                                        className="w-full rounded-lg border border-black/10 px-2 py-1.5 text-xs font-mono"
                                                        value={field.key}
                                                        onChange={e => handleFieldChange(index, "key", e.target.value)}
                                                    />
                                                </div>

                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                            <button
                                onClick={addField}
                                className="mt-3 w-full rounded-xl border border-dashed border-black/20 p-2 text-sm text-gray-500 hover:border-black/40 hover:text-black"
                            >
                                + Tambah Field Manual
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Column: Preview */}
                <div className="flex-1 space-y-6 border-l border-black/10 pl-6 overflow-y-auto md:max-h-[80vh]">
                    <h3 className="text-lg font-semibold text-[#1f1f1f]">Preview</h3>
                    
                    {/* Form Preview */}
                    <div className="space-y-3 rounded-3xl border border-black/10 p-5 bg-white shadow-sm">
                        <p className="text-xs font-semibold uppercase text-(--depthui-muted) mb-2">Form Tampilan (Maintenance)</p>
                        {fields.filter(f => !(f.isId || ID_ALIASES.includes((f.key || "").toLowerCase())) && !f.hidden).length > 0 ? (
                            fields.filter(f => !(f.isId || ID_ALIASES.includes((f.key || "").toLowerCase())) && !f.hidden).map((f, i) => (
                                <div key={i} className="space-y-1">
                                    <label className="text-xs font-semibold text-(--depthui-muted)">{f.label}</label>
                                    {f.inputType === "select" ? (
                                        <select className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white">
                                            {(f.optionsText ? f.optionsText.split("\n").map(s => s.trim()).filter(Boolean) : (f.options || [])).map(o => (
                                                <option key={o}>{o}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input 
                                            className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                                            value={f.inputType === "computed" ? (f.format || "Computed Value") : ""}
                                            disabled 
                                            placeholder={`Input type: ${f.inputType}`}
                                        />
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-gray-400 italic">Tidak ada field maintenance yang tampil.</p>
                        )}
                    </div>

                    {/* Data Preview Table */}
                    {previewData.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase text-(--depthui-muted)">Data Preview (Top 5 Rows)</p>
                            <div className="overflow-x-auto rounded-xl border border-black/10">
                                <table className="min-w-full text-left text-xs">
                                    <thead className="bg-black/5 font-medium text-gray-600">
                                        <tr>
                                            <th className="px-3 py-2">Row</th>
                                            {fields.map((f, i) => (
                                                <th key={i} className="px-3 py-2 whitespace-nowrap">{f.key}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/5">
                                        {previewData.map((row, i) => (
                                            <tr key={i}>
                                                <td className="px-3 py-2 font-mono text-[10px] text-gray-400">{row._row}</td>
                                                {fields.map((f, j) => (
                                                    <td key={j} className="px-3 py-2 truncate max-w-[150px]" title={row[f.key]}>
                                                        {row[f.key] || "-"}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="absolute bottom-6 right-6 flex gap-3 bg-white/80 backdrop-blur-sm p-2 rounded-xl border border-black/5 shadow-lg">
                    <button onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-[#434343] hover:bg-black/5">
                        Batal
                    </button>
                    <button
                        onClick={handleSave}
                        className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-80"
                    >
                        Simpan Tipe AC
                    </button>
                </div>
            </div>
        </div>,
        document.body
            )}
        </>
    );
};

export type AdminSitesPageProps = {
    sites: SiteRecord[];
    loading: boolean;
    error: string | null;
    onCreate: (payload: SitePayload) => Promise<void>;
    onUpdate: (id: string, payload: Partial<SitePayload>) => Promise<void>;
    onSync: (id: string) => Promise<SiteSyncResult>;
    acTypes: AcType[];
    loadingAcTypes: boolean;
    onRefreshAcTypes: () => void;
    onRefreshSites: () => Promise<void>;
};
const INITIAL_SITE: SitePayload = {
    name: "",
    description: "",
    spreadsheetUrl: "",
    sheets: [],
    syncEnabled: true,
};

export function AdminSitesPage({
    sites,
    loading,
    error,
    onCreate,
    onUpdate,
    onSync,
    acTypes,
    loadingAcTypes,
    onRefreshAcTypes,
    onRefreshSites,
}: AdminSitesPageProps) {
    const [form, setForm] = useState<SitePayload>(INITIAL_SITE);
    const [formError, setFormError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<SitePayload>(INITIAL_SITE);
    const [editError, setEditError] = useState<string | null>(null);
    const [syncStatus, setSyncStatus] = useState<Record<string, { message: string; variant: "info" | "error"; pending?: boolean }>>({});


    // Print QR Modal
    const [printQrSite, setPrintQrSite] = useState<SiteRecord | null>(null);

    // Delete Modal State
    const [deleteSiteId, setDeleteSiteId] = useState<string | null>(null);
    const handleDeleteClick = (site: SiteRecord) => setDeleteSiteId(site.id);
    const handleDeleteConfirm = async () => {
        if (deleteSiteId) {
            try {
                // Using as any because deleted field might not be in SitePayload type
                await onUpdate(deleteSiteId, { deleted: true } as Partial<SitePayload>); // Changed 'as any' to 'as Partial<SitePayload>'
                setDeleteSiteId(null);
            } catch (e) {
                alert("Gagal menghapus site");
            }
        }
    };

    const [sheetSelection, setSheetSelection] = useState<{ isOpen: boolean; siteId: string; availableSheets: { title: string; sheetId: number }[] }>({
        isOpen: false,
        siteId: "",
        availableSheets: []
    });

    const [acTypeModalOpen, setAcTypeModalOpen] = useState(false);
    const [editingAcType, setEditingAcType] = useState<AcType | null>(null);
    const [deleteAcType, setDeleteAcType] = useState<AcType | null>(null);

    const [showAddSite, setShowAddSite] = useState(false);

    const handleCreateOrUpdateAcType = async (name: string, fields: AcTypeField[]) => {
        try {
            if (editingAcType) {
                await fetch(`/api/admin/ac-types/${editingAcType.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, fields })
                });
            } else {
                await fetch("/api/admin/ac-types", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, fields })
                });
            }
            onRefreshAcTypes();
            setEditingAcType(null); // Reset after save
        } catch (e) {
            alert(`Gagal ${editingAcType ? 'memperbarui' : 'membuat'} tipe AC`);
        }
    };

    const handleDeleteAcTypeConfirm = async () => {
        if (!deleteAcType) return;
        try {
            const response = await fetch(`/api/admin/ac-types/${deleteAcType.id}`, { method: "DELETE" });
            if (response.ok) {
                onRefreshAcTypes();
                await onRefreshSites(); // Fix stale sites state
                setDeleteAcType(null);
            } else {
                alert("Failed to delete AC type.");
            }
        } catch (e) {
            alert("Failed to delete AC type.");
        }
    };

    // Helper to open modal in create mode
    const openCreateAcTypeModal = () => {
        setEditingAcType(null);
        setAcTypeModalOpen(true);
    };

    // Helper to open modal in edit mode
    const openEditAcTypeModal = (type: AcType) => {
        setEditingAcType(type);
        setAcTypeModalOpen(true);
    };

    const runSync = async (siteId: string) => {
        setSyncStatus(prev => ({ ...prev, [siteId]: { message: "Syncing...", variant: "info", pending: true } }));
        try {
            const res = await onSync(siteId);
            // Check for missing configuration error
            if (!res.ok && res.reason === "MISSING_CONFIGURATION" && (res as any).availableSheets) {
                setSheetSelection({
                    isOpen: true,
                    siteId,
                    availableSheets: (res as any).availableSheets
                });
                setSyncStatus(prev => ({ ...prev, [siteId]: { message: "Setup Required", variant: "info", pending: false } }));
                return;
            }

            setSyncStatus(prev => ({
                ...prev,
                [siteId]: { message: res.ok ? "Sync OK" : `Sync Failed: ${res.reason}`, variant: res.ok ? "info" : "error", pending: false }
            }));
        } catch (e) {
            setSyncStatus(prev => ({ ...prev, [siteId]: { message: e instanceof Error ? e.message : "Error", variant: "error", pending: false } }));
        }
    };

    const handleSheetSelectionConfirm = async (selectedSheets: string[]) => {
        const { siteId } = sheetSelection;
        if (!siteId) return;

        try {
            // 1. Update site configuration
            await onUpdate(siteId, { sheets: selectedSheets });

            // 2. Close modal
            setSheetSelection(prev => ({ ...prev, isOpen: false }));

            // 3. Re-run sync
            await runSync(siteId);
        } catch (e) {
            alert("Gagal menyimpan konfigurasi sheet");
        }
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setFormError(null);
        setSubmitting(true);
        try {
            await onCreate({ ...form, syncEnabled: true });
            setForm(INITIAL_SITE);
        } catch (err) {
            setFormError(err instanceof Error ? err.message : "Gagal membuat site");
        } finally {
            setSubmitting(false);
        }
    };

    const startEdit = (site: SiteRecord) => {
        setEditingSiteId(site.id);
        setEditForm({
            name: site.name,
            description: site.description ?? "",
            spreadsheetUrl: site.spreadsheetUrl ?? "",
            sheetName: site.sheetName ?? "",
            sheets: site.sheetsList?.map(s => ({ 
                name: s.sheetName, 
                acTypeId: s.acTypeId 
            })) ?? [],
            syncEnabled: true,
            logoUrl: site.logoUrl ?? "",
        });
        setEditError(null);
    };

    const cancelEdit = () => {
        setEditingSiteId(null);
        setEditError(null);
    };

    const handleEditSave = async () => {
        if (!editingSiteId) return;
        try {
            await onUpdate(editingSiteId, editForm);
            setEditingSiteId(null);
        } catch (e) {
            setEditError("Gagal update");
        }
    };

    // ... rest of component ...

    // In render: add PrintQrModal
    return (
        <section className="space-y-6 text-[#1f1f1f]">
            <PrintQrModal
                isOpen={!!printQrSite}
                onClose={() => setPrintQrSite(null)}
                site={printQrSite}
            />
            <DeleteSiteConfirmationModal
                isOpen={!!deleteSiteId}
                onClose={() => setDeleteSiteId(null)}
                onConfirm={handleDeleteConfirm}
                siteName={sites.find(s => s.id === deleteSiteId)?.name ?? "Unknown"}
            />
            <SelectSheetsModal
                isOpen={sheetSelection.isOpen}
                onClose={() => setSheetSelection(prev => ({ ...prev, isOpen: false }))}
                onConfirm={handleSheetSelectionConfirm}
                availableSheets={sheetSelection.availableSheets}
            />


            {showAddSite && (
                <DepthCard className="rounded-4xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold">Tambah Site</h3>
                        <button
                            onClick={() => setShowAddSite(false)}
                            className="rounded-full p-2 hover:bg-black/5 text-gray-400 hover:text-rose-500 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
                        <TextField label="Nama" value={form.name} onChange={value => setForm(prev => ({ ...prev, name: value }))} required />
                        <TextField label="Deskripsi" value={form.description ?? ""} onChange={value => setForm(prev => ({ ...prev, description: value }))} />
                        <div className="space-y-2 md:col-span-2">
                            <TextField
                                label="Spreadsheet URL"
                                value={form.spreadsheetUrl ?? ""}
                                onChange={value => setForm(prev => ({ ...prev, spreadsheetUrl: value }))}
                                placeholder="https://docs.google.com/..."
                            />
                        </div>
                        {/* Checkbox hidden as it is always true */}
                        <div className="hidden">
                            <label className="flex items-center gap-2 text-sm text-(--depthui-muted)">
                                <input
                                    type="checkbox"
                                    checked={true}
                                    readOnly
                                />
                                Aktifkan sinkronisasi otomatis Google Sheets
                            </label>
                        </div>
                        {formError && <p className="text-sm text-rose-500">{formError}</p>}
                        <button
                            type="submit"
                            disabled={submitting}
                            className="md:col-span-2 rounded-2xl bg-black px-4 py-3 text-base font-semibold text-white transition hover:opacity-80 disabled:opacity-60"
                        >
                            {submitting ? "Menyimpan…" : "Simpan Site"}
                        </button>
                    </form>
                </DepthCard>
            )}

            <DepthCard className="rounded-4xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-4">
                    <div className="flex items-center gap-4">
                        <div>
                            <p className="text-xs uppercase text-(--depthui-muted)">Admin</p>
                            <h2 className="text-2xl font-semibold">Site Management</h2>
                        </div>
                        {!showAddSite && (
                            <button
                                onClick={() => setShowAddSite(true)}
                                className="flex items-center justify-center rounded-full bg-black/5 p-1.5 text-black transition hover:bg-black hover:text-white"
                                title="Tambah Site Baru"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
                {error && <p className="mt-4 text-sm text-rose-500">{error}</p>}
                {loading && <p className="mt-4 text-sm text-(--depthui-muted)">Memuat data site…</p>}
                <div className="mt-4 overflow-x-auto rounded-2xl border border-black/10">
                    <table className="min-w-full divide-y divide-black/10 text-left text-sm">
                        <thead className="bg-black/5 text-xs uppercase text-(--depthui-muted)">
                            <tr>
                                <th className="px-4 py-3">Nama</th>
                                <th className="px-4 py-3">Spreadsheet & Sheets</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                            {sites.map(site => {
                                const isEditing = editingSiteId === site.id;
                                return (
                                    <tr key={site.id} className={site.deletedAt ? "opacity-60" : undefined}>
                                        <td className="px-4 py-3 align-top min-w-[200px]">
                                            {isEditing ? (
                                                <div className="space-y-2">
                                                    <InputLabel label="Nama Site">
                                                        <input
                                                            className="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm"
                                                            value={editForm.name}
                                                            onChange={event => setEditForm(prev => ({ ...prev, name: event.target.value }))}
                                                            placeholder="Nama Site"
                                                        />
                                                    </InputLabel>
                                                    <InputLabel label="Deskripsi">
                                                        <textarea
                                                            className="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm"
                                                            value={editForm.description ?? ""}
                                                            onChange={event => setEditForm(prev => ({ ...prev, description: event.target.value }))}
                                                            rows={2}
                                                            placeholder="Deskripsi"
                                                        />
                                                    </InputLabel>
                                                    <div className="pt-2">
                                                        <p className="text-xs text-(--depthui-muted) mb-1">Logo Site</p>
                                                        <div className="flex items-center gap-3">
                                                            {editForm.logoUrl && (
                                                                <img src={editForm.logoUrl} alt="Logo" className="w-10 h-10 object-contain rounded-lg border border-black/5" />
                                                            )}
                                                            <ImageKitUpload
                                                                variant="compact"
                                                                onUploadComplete={url => setEditForm(prev => ({ ...prev, logoUrl: url }))}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="font-semibold">{site.name}</p>
                                                    <p className="text-xs text-(--depthui-muted)">{site.description || "Tidak ada deskripsi"}</p>
                                                </>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 align-top min-w-[300px]" colSpan={isEditing ? 2 : 1}>
                                            {isEditing ? (
                                                <div className="space-y-2">
                                                    <textarea
                                                        className="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm"
                                                        value={editForm.spreadsheetUrl ?? ""}
                                                        onChange={event =>
                                                            setEditForm(prev => ({ ...prev, spreadsheetUrl: event.target.value }))
                                                        }
                                                        placeholder="https://docs.google.com/..."
                                                        rows={2}
                                                    />
                                                    <p className="text-[10px] text-(--depthui-muted)">
                                                        Simpan perubahan URL terlebih dahulu sebelum memilih ulang sheets.
                                                    </p>
                                                </div>
                                            ) : site.spreadsheetUrl ? (
                                                <div className="space-y-1">
                                                    <a href={site.spreadsheetUrl} target="_blank" rel="noreferrer" className="text-emerald-600 underline text-xs break-all">
                                                        Buka Spreadsheet
                                                    </a>
                                                    <SheetSelector 
                                                        site={site} 
                                                        isEditing={false}
                                                        acTypes={acTypes} 
                                                    />
                                                </div>
                                            ) : (
                                                <span className="text-xs text-(--depthui-muted)">Belum diatur</span>
                                            )}
                                            {isEditing && (
                                                <div className="mt-4">
                                                    <SheetSelector 
                                                        site={site} 
                                                        isEditing={true}
                                                        form={editForm}
                                                        onChange={updates => setEditForm(prev => ({ ...prev, ...updates }))}
                                                        acTypes={acTypes} 
                                                    />
                                                </div>
                                            )}
                                        </td>
                                        {!isEditing && (
                                            <>
                                                <td className="px-4 py-3 align-top">
                                                    <div className="space-y-2">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${site.syncEnabled ? "bg-emerald-100 text-emerald-800" : "bg-black/5 text-(--depthui-muted)"}`}>
                                                                {site.syncEnabled ? "Sync On" : "Sync Off"}
                                                            </span>
                                                            <span className="text-xs text-(--depthui-muted)">
                                                                {site.lastSyncedAt ? new Date(site.lastSyncedAt).toLocaleString("id-ID") : "-"}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs">
                                                            <p className={site.lastSyncStatus ? "text-[#333]" : "text-(--depthui-muted)"}>
                                                                {syncStatus[site.id] ? (
                                                                    <span className={syncStatus[site.id].variant === "error" ? "text-rose-500" : "text-emerald-600"}>
                                                                        {syncStatus[site.id].message}
                                                                    </span>
                                                                ) : (
                                                                    site.lastSyncStatus ?? "Belum ada riwayat"
                                                                )}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>
                                            </>
                                        )}
                                        <td className="px-4 py-3 align-top">
                                            <div className="flex flex-col gap-2">
                                                {isEditing ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={handleEditSave}
                                                            className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-[#1f1f1f] transition hover:border-black/40"
                                                        >
                                                            Simpan
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={cancelEdit}
                                                            className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-[#1f1f1f] transition hover:border-black/40"
                                                        >
                                                            Batal
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            disabled={loading || syncStatus[site.id]?.pending}
                                                            onClick={() => runSync(site.id)}
                                                            className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-[#1f1f1f] transition hover:border-black/40 disabled:opacity-50"
                                                        >
                                                            {syncStatus[site.id]?.pending ? "Sync…" : "Sync Sheets"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPrintQrSite(site)}
                                                            className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-[#1f1f1f] transition hover:border-black/40"
                                                        >
                                                            Print QR
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => startEdit(site)}
                                                            className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-[#1f1f1f] transition hover:border-black/40"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteClick(site)}
                                                            className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-400"
                                                        >
                                                            Hapus
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {!sites.length && !loading && (
                                <tr>
                                    <td className="px-4 py-6 text-center text-sm text-(--depthui-muted)" colSpan={4}>
                                        Belum ada site terdaftar.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {editError && editingSiteId && <p className="mt-3 text-sm text-rose-500">{editError}</p>}
            </DepthCard>

            <DepthCard className="rounded-4xl p-6">
                <div className="flex items-center justify-between gap-3 border-b border-black/10 pb-4">
                    <h3 className="text-xl font-semibold">Tipe AC</h3>
                </div>
                {loadingAcTypes && <p className="mt-4 text-sm text-(--depthui-muted)">Memuat tipe AC...</p>}
                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {acTypes.map(type => (
                        <div key={type.id} className="rounded-2xl border border-black/10 p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-semibold text-sm">{type.name}</span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => openEditAcTypeModal(type)}
                                        className="p-1 text-gray-400 hover:text-black hover:bg-black/5 rounded-lg transition"
                                        title="Edit"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    </button>
                                    <button
                                        onClick={() => setDeleteAcType(type)}
                                        className="p-1 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition"
                                        title="Hapus"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {type.fields.map(f => (
                                    <span key={f.key} className="text-[10px] bg-black/5 rounded-full px-2 py-0.5 text-[#434343]">{f.label}</span>
                                ))}
                            </div>
                        </div>
                    ))}
                    <button
                        onClick={openCreateAcTypeModal}
                        className="rounded-2xl border-2 border-dashed border-black/10 p-4 flex items-center justify-center text-sm font-semibold text-(--depthui-muted) hover:border-black/20 hover:text-[#1f1f1f] transition"
                    >
                        + Tambah Tipe AC
                    </button>
                </div>
            </DepthCard>

            <ManageAcTypeModal
                isOpen={acTypeModalOpen}
                onClose={() => setAcTypeModalOpen(false)}
                onSave={handleCreateOrUpdateAcType}
                initialData={editingAcType}
            />
            <DeleteAcTypeConfirmationModal
                isOpen={!!deleteAcType}
                onClose={() => setDeleteAcType(null)}
                onConfirm={handleDeleteAcTypeConfirm}
                typeName={deleteAcType?.name ?? ""}
            />

            
        </section>
    );
}
