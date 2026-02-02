import { useCallback, useEffect, useState } from "react";
import type { AllowlistEntry } from "../types";

export function useAllowlist(isAdmin: boolean) {
    const [entries, setEntries] = useState<AllowlistEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadEntries = useCallback(async () => {
        if (!isAdmin) {
            setEntries([]);
            setError(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const response = await fetch("/api/admin/allowlist", { credentials: "include" });
            if (!response.ok) {
                throw new Error(`Gagal memuat allowlist (${response.status})`);
            }
            const payload = (await response.json()) as { entries?: AllowlistEntry[] };
            setEntries(payload.entries ?? []);
        } catch (fetchError) {
            setError(fetchError instanceof Error ? fetchError.message : "Gagal memuat allowlist");
        } finally {
            setLoading(false);
        }
    }, [isAdmin]);

    const addEntry = useCallback(
        async (payload: { email: string; siteId: string }) => {
            if (!isAdmin) {
                throw new Error("Unauthorized");
            }
            setError(null);
            const response = await fetch("/api/admin/allowlist", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const message = await response.text();
                const errorMessage = message || `Gagal menambah allowlist (${response.status})`;
                setError(errorMessage);
                throw new Error(errorMessage);
            }

            await loadEntries();
        },
        [isAdmin, loadEntries],
    );

    const removeEntry = useCallback(
        async (entryId: string) => {
            if (!isAdmin) {
                throw new Error("Unauthorized");
            }
            setError(null);
            const response = await fetch(`/api/admin/allowlist/${entryId}`, {
                method: "DELETE",
                credentials: "include",
            });

            if (!response.ok) {
                const message = await response.text();
                const errorMessage = message || `Gagal menghapus allowlist (${response.status})`;
                setError(errorMessage);
                throw new Error(errorMessage);
            }

            await loadEntries();
        },
        [isAdmin, loadEntries],
    );

    useEffect(() => {
        void loadEntries();
    }, [loadEntries]);

    return {
        entries,
        loading,
        error,
        refresh: loadEntries,
        addEntry,
        removeEntry,
    };
}
