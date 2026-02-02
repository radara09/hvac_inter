import { useMemo, useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { DepthCard } from "../components/DepthUI";
import type { ACRecord, AcType, SiteRecord } from "../types";

type MaintenanceSearchPageProps = {
    records: ACRecord[];
    loading: boolean;
    error: string | null;
    onSelect: (id: string | null) => Promise<void> | void;
    acTypes?: AcType[];
    sites?: SiteRecord[];
};

import { QRScannerModal } from "../components/QRComponents";

export function MaintenanceSearchPage({ records, loading, error, onSelect, acTypes = [], sites = [] }: MaintenanceSearchPageProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const focusSearchToken = (location.state as { focusSearchToken?: number } | null)?.focusSearchToken;
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    useEffect(() => {
        void onSelect(null);
    }, [onSelect]);

    useEffect(() => {
        if (!focusSearchToken) return;
        const frame = requestAnimationFrame(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        });
        return () => cancelAnimationFrame(frame);
    }, [focusSearchToken]);

    const handleScanResult = (result: string) => {
        setIsScannerOpen(false);
        try {
            new URL(result);
            window.location.href = result;
        } catch {
            // If manual ID or path
            if (result.startsWith("/")) {
                navigate(result);
            } else {
                navigate(`/maintenance/${result}`);
            }
        }
    };

    const normalizeCellToken = (token: string) => token.replace(/\$/g, "").toUpperCase();

    const formatComputedValue = (
        format: string,
        params: Record<string, string>,
        fields: AcType["fields"]
    ) => {
        const cellMap = new Map<string, string>();
        fields.forEach(f => {
            if (f.cell) {
                cellMap.set(normalizeCellToken(f.cell), f.key);
            }
        });
        return format.replace(/\{([^}]+)\}/g, (_, rawToken) => {
            const token = String(rawToken || "").trim();
            if (!token) return "";
            if (params[token]) return params[token];
            const mappedKey = cellMap.get(normalizeCellToken(token));
            return mappedKey ? params[mappedKey] || "" : "";
        });
    };

    const getLocationDisplay = (record: ACRecord) => {
        if (!sites.length || !acTypes.length) return record.location;

        const site = sites.find(s => s.id === record.siteId);
        const sheet = site?.sheetsList?.find(sl => sl.sheetName === record.sheetName);
        if (!sheet?.acTypeId) return record.location;

        const acType = acTypes.find(t => t.id === sheet.acTypeId);
        if (!acType) return record.location;

        // Find computed location field
        const locField = acType.fields.find(f => 
            (f.inputType === "computed") && 
            f.format && 
            (f.label.toLowerCase().includes("lokasi") || f.label.toLowerCase().includes("location"))
        );

        if (locField && locField.format && record.parameters) {
            try {
                const params = typeof record.parameters === 'string' ? JSON.parse(record.parameters) : record.parameters;
                return formatComputedValue(locField.format, params as Record<string, string>, acType.fields);
            } catch (e) {
                return record.location;
            }
        }

        return record.location;
    };

    const normalizedRecords = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (term.length < 3) return [];
        return records.filter(record => {
            const asset = record.assetCode?.toLowerCase() ?? "";
            const locationName = record.location?.toLowerCase() ?? "";
            const tech = record.technician?.toLowerCase() ?? "";
            
            // Should we search in computed location too?
            // For performance, maybe not unless requested.
            // But user might search for "Room 101" which is part of computed location.
            // Let's rely on standard search for now to keep it fast, or check if we should expand.
            
            return asset.includes(term) || locationName.includes(term) || tech.includes(term);
        });
    }, [records, query]);

    const handleSelect = async (record: ACRecord) => {
        await onSelect(record.id);
        navigate(`/maintenance/${record.id}`);
    };

    return (
        <section className="space-y-6 text-[#1f1f1f]">
            <QRScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScan={handleScanResult} />
            <DepthCard className="rounded-4xl p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                        <Link
                            to="/dashboard"
                            aria-label="Kembali ke dashboard"
                            className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-[#1f1f1f] transition hover:border-black/40"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        </Link>
                        <div>
                            <p className="text-xs uppercase text-(--depthui-muted)">AC Maintenance</p>
                            <h2 className="text-2xl font-semibold">Cari Unit</h2>
                        </div>
                    </div>
                    <div className="flex w-full items-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#1f1f1f] md:max-w-md">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-[#7a7a7a]" aria-hidden="true">
                            <circle cx="11" cy="11" r="6" />
                            <line x1="20" y1="20" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            type="search"
                            ref={inputRef}
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Ketik minimal 3 karakter"
                            className="flex-1 bg-transparent text-sm text-[#1f1f1f] placeholder:text-[#9b9b9b] focus:outline-none"
                        />
                        <button
                            type="button"
                            onClick={() => setIsScannerOpen(true)}
                            className="text-[#7a7a7a] hover:text-[#1f1f1f]"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                                <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                                <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                                <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                                <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                                <path d="M7 12h10" />
                            </svg>
                        </button>
                    </div>
                </div>
                {loading && <p className="mt-4 text-sm text-(--depthui-muted)">Memuat data AC…</p>}
                {error && <p className="mt-4 text-sm text-rose-500">{error}</p>}
                {!loading && !records.length && (
                    <p className="mt-4 text-sm text-(--depthui-muted)">Belum ada data AC.</p>
                )}
                {query.trim().length > 0 && query.trim().length < 3 && (
                    <p className="mt-4 text-xs text-(--depthui-muted)">Masukkan minimal 3 karakter untuk menampilkan hasil.</p>
                )}
            </DepthCard>

            {query.trim().length >= 3 && (
                <div className="space-y-3">
                    {normalizedRecords.length > 0 ? (
                        normalizedRecords.map(record => (
                            <DepthCard key={record.id} className="group relative flex items-center justify-between rounded-4xl px-10 py-3 text-left transition-all duration-200 hover:bg-black/5 hover:shadow-md">
                                <button
                                    type="button"
                                    onClick={() => void handleSelect(record)}
                                    className="flex w-full items-center justify-between text-left"
                                >
                                    <div>
                                        <p className="text-sm text-(--depthui-muted) group-hover:text-[#1f1f1f] transition-colors">{getLocationDisplay(record)}</p>
                                        <p className="text-lg font-semibold">{record.assetCode}</p>
                                    </div>
                                    <div className="text-right text-xs text-(--depthui-muted)">
                                        <p>{record.lastCondition}</p>
                                        <p>{record.technician}</p>
                                    </div>
                                </button>
                            </DepthCard>
                        ))
                    ) : (
                        <DepthCard className="rounded-4xl px-4 py-6 text-center text-sm text-(--depthui-muted)">
                            Tidak ada hasil untuk "{query}".
                        </DepthCard>
                    )}
                </div>
            )}
        </section>
    );
}
