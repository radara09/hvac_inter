import { useCallback, useEffect, useState } from "react";
import type { ACRecord, AcHistoryEntry, CreateAcPayload, UpdateAcPayload } from "../types";

export function useAcRecords(userId?: string) {
    const [acRecords, setAcRecords] = useState<ACRecord[]>([]);
    const [selectedRecord, setSelectedRecord] = useState<ACRecord | null>(null);
    const [history, setHistory] = useState<AcHistoryEntry[]>([]);
    const [acLoading, setAcLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [updateLoading, setUpdateLoading] = useState(false);
    const [acError, setAcError] = useState<string | null>(null);

    const fetchAcRecords = useCallback(
        async () => {
            if (!userId) {
                return;
            }

            setAcLoading(true);
            setAcError(null);
            try {
                const response = await fetch(`/api/ac`, { credentials: "include" });
                if (!response.ok) {
                    const message = await response.text();
                    throw new Error(message || `Request failed (${response.status})`);
                }
                const payload = (await response.json()) as { records: ACRecord[] };
                setAcRecords(payload.records ?? []);
            } catch (error) {
                setAcError(error instanceof Error ? error.message : "Gagal memuat data AC");
            } finally {
                setAcLoading(false);
            }
        },
        [userId],
    );

    const selectAcRecord = useCallback(
        async (id: string | null) => {
            if (!id) {
                setSelectedRecord(null);
                setHistory([]);
                return;
            }

            setDetailLoading(true);
            setAcError(null);
            try {
                const response = await fetch(`/api/ac/${id}`, { credentials: "include" });
                if (!response.ok) {
                    const message = await response.text();
                    throw new Error(message || `Gagal memuat detail (${response.status})`);
                }
                const payload = (await response.json()) as { record: ACRecord; history: AcHistoryEntry[] };
                setSelectedRecord(payload.record ?? null);
                setHistory(payload.history ?? []);
            } catch (error) {
                setAcError(error instanceof Error ? error.message : "Gagal memuat detail AC");
            } finally {
                setDetailLoading(false);
            }
        },
        [],
    );

    const createAcRecord = useCallback(
        async (data: CreateAcPayload) => {
            const response = await fetch("/api/ac", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify(data),
            });
            if (!response.ok) {
                const message = await response.text();
                throw new Error(message || `Gagal membuat data (${response.status})`);
            }

            await fetchAcRecords();
        },
        [fetchAcRecords],
    );

    const updateAcRecord = useCallback(
        async (id: string, data: UpdateAcPayload) => {
            setUpdateLoading(true);
            setAcError(null);
            try {
                const response = await fetch(`/api/ac/${id}`, {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(data),
                });
                if (!response.ok) {
                    const message = await response.text();
                    throw new Error(message || `Gagal memperbarui AC (${response.status})`);
                }
                const payload = (await response.json()) as { record: ACRecord };
                if (payload.record) {
                    setSelectedRecord(payload.record);
                    setAcRecords(prev => prev.map(entry => (entry.id === payload.record.id ? payload.record : entry)));
                }
                await selectAcRecord(id);
                await fetchAcRecords();
            } catch (error) {
                setAcError(error instanceof Error ? error.message : "Gagal memperbarui AC");
                throw error;
            } finally {
                setUpdateLoading(false);
            }
        },
        [selectAcRecord, fetchAcRecords],
    );

    const clearAcRecords = useCallback(() => {
        setAcRecords([]);
        setSelectedRecord(null);
        setHistory([]);
        setAcError(null);
        setAcLoading(false);
    }, []);

    useEffect(() => {
        if (!userId) {
            clearAcRecords();
            return;
        }

        void fetchAcRecords();
    }, [clearAcRecords, fetchAcRecords, userId]);

    return {
        acError,
        acLoading,
        acRecords,
        clearAcRecords,
        createAcRecord,
        fetchAcRecords,
        selectAcRecord,
        selectedRecord,
        history,
        detailLoading,
        updateAcRecord,
        updateLoading,
    };
}
