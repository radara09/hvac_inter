import { useCallback, useEffect, useState } from "react";
import type { AdminUser } from "../types";

export function useAdminUsers(isAdmin: boolean) {
    const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [adminError, setAdminError] = useState<string | null>(null);

    const loadAdminUsers = useCallback(async () => {
        if (!isAdmin) {
            setAdminUsers([]);
            setLoadingUsers(false);
            setAdminError(null);
            return;
        }

        setLoadingUsers(true);
        setAdminError(null);
        try {
            const response = await fetch("/api/admin/users", { credentials: "include" });
            if (!response.ok) {
                throw new Error(`Unable to fetch users (${response.status})`);
            }
            const payload = (await response.json()) as { users: AdminUser[] };
            const normalized = (payload.users ?? []).map(user => ({
                ...user,
                siteId: user.siteId ?? user.data?.siteId ?? null,
            }));
            setAdminUsers(normalized);
        } catch (error) {
            setAdminError(error instanceof Error ? error.message : "Failed to load users");
        } finally {
            setLoadingUsers(false);
        }
    }, [isAdmin]);

    const updateUser = useCallback(
        async (userId: string, body: Record<string, unknown>) => {
            if (!isAdmin) {
                throw new Error("Unauthorized");
            }

            setAdminError(null);
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const message = await response.text();
                const errorMessage = message || `Gagal memperbarui user (${response.status})`;
                setAdminError(errorMessage);
                throw new Error(errorMessage);
            }

            await loadAdminUsers();
        },
        [isAdmin, loadAdminUsers],
    );

    const clearAdminUsers = useCallback(() => {
        setAdminUsers([]);
        setLoadingUsers(false);
        setAdminError(null);
    }, []);

    useEffect(() => {
        void loadAdminUsers();
    }, [loadAdminUsers]);

    return {
        adminError,
        adminUsers,
        clearAdminUsers,
        loadAdminUsers,
        loadingUsers,
        updateUser,
    };
}
