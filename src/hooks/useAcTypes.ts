import { useState, useEffect, useCallback } from "react";
import type { AcType } from "../types";

export function useAcTypes(enabled: boolean) {
    const [acTypes, setAcTypes] = useState<AcType[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchAcTypes = useCallback(async () => {
        if (!enabled) return;
        setLoading(true);
        setError(null);
        try {
            const response = await fetch("/api/admin/ac-types", { credentials: "include" });
            if (!response.ok) throw new Error("Gagal mengambil tipe AC");
            const data = await response.json();
            setAcTypes(data.records || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Terjadi kesalahan");
        } finally {
            setLoading(false);
        }
    }, [enabled]);

    useEffect(() => {
        fetchAcTypes();
    }, [fetchAcTypes]);

    return { acTypes, loading, error, refresh: fetchAcTypes };
}
