import type { Hono } from "hono";
import { requireSession } from "../middleware/session";
import type { AppBindings } from "../types";

const USERNAME_PATTERN = /^(?![_.])(?!.*[_.]{2})[a-zA-Z0-9._]+(?<![_.])$/;

export const registerProfileRoutes = (app: Hono<AppBindings>) => {
    app.post(
        "/api/profile/username",
        requireSession(async c => {
            const auth = c.get("auth");
            if (!auth) return c.json({ error: "Unauthorized" }, 401);
            const rawBody = await c.req.json<{
                username?: string;
                displayUsername?: string | null;
            }>().catch(() => null);

            const username = (rawBody?.username ?? "").trim();
            const displayUsername = (rawBody?.displayUsername ?? username).trim();

            if (!username || username.length < 3 || username.length > 32 || !USERNAME_PATTERN.test(username)) {
                return c.json({ error: "Username tidak valid" }, 422);
            }

            try {
                const updateUser = auth.api.updateUser as (ctx: {
                    headers: Headers;
                    request: Request;
                    body: Record<string, unknown>;
                }) => Promise<unknown>;
                await updateUser({
                    headers: c.req.raw.headers,
                    request: c.req.raw,
                    body: {
                        username,
                        displayUsername: displayUsername || username,
                    },
                });
                return c.json({ success: true });
            } catch (error) {
                console.error("Failed to update profile", error);
                return c.json({ error: "Gagal menyimpan username" }, 500);
            }
        }),
    );
};
