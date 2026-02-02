import { useCallback, useEffect, useState } from "react";
import type { SitePayload, SiteRecord, SiteSyncResult } from "../types";

export function useSites(userId?: string) {
    const [sites, setSites] = useState<SiteRecord[]>([]);
    const [loadingSites, setLoadingSites] = useState(false);
    const [siteError, setSiteError] = useState<string | null>(null);

    const fetchSites = useCallback(async () => {
        if (!userId) {
            setSites([]);
            return;
        }
        setLoadingSites(true);
        setSiteError(null);
        try {
            const response = await fetch("/api/sites", { credentials: "include" });
            if (!response.ok) {
                const message = await response.text();
                throw new Error(message || `Gagal memuat site (${response.status})`);
            }
            const payload = (await response.json()) as { sites: SiteRecord[] };
            setSites(payload.sites ?? []);
        } catch (error) {
            setSiteError(error instanceof Error ? error.message : "Gagal memuat site");
        } finally {
            setLoadingSites(false);
        }
    }, [userId]);

    const createSite = useCallback(
        async (body: SitePayload) => {
            const response = await fetch("/api/sites", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                const message = await response.text();
                throw new Error(message || `Gagal membuat site (${response.status})`);
            }
            await fetchSites();
        },
        [fetchSites],
    );

    const updateSite = useCallback(
        async (id: string, body: Partial<SitePayload> & { deleted?: boolean }) => {
            const response = await fetch(`/api/sites/${id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                const message = await response.text();
                throw new Error(message || `Gagal memperbarui site (${response.status})`);
            }
            await fetchSites();
        },
        [fetchSites],
    );

    const syncSite = useCallback(async (id: string): Promise<SiteSyncResult> => {
        const response = await fetch(`/api/sites/${id}/sync`, {
            method: "POST",
            credentials: "include",
        });
        if (!response.ok) {
            if (response.status === 400) {
                try {
                    const payload = (await response.json()) as SiteSyncResult;
                    await fetchSites();
                    return payload;
                } catch (e) {
                    // Parse error, fall through to text error
                }
            }
            const message = await response.text();
            throw new Error(message || `Gagal sinkronisasi (${response.status})`);
        }
        const payload = (await response.json()) as SiteSyncResult;
        await fetchSites();
        return payload;
    }, [fetchSites]);

    useEffect(() => {
        if (!userId) {
            setSites([]);
            setSiteError(null);
            return;
        }
        void fetchSites();
    }, [fetchSites, userId]);

    return {
        sites,
        loadingSites,
        siteError,
        fetchSites,
        createSite,
        updateSite,
        syncSite,
    };
}
