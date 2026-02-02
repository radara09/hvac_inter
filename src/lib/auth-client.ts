import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

const baseURL = import.meta.env.VITE_AUTH_BASE_URL ?? undefined;

export const authClient = createAuthClient({
    baseURL,
    fetchOptions: {
        credentials: "include",
    },
    plugins: [usernameClient()],
});
