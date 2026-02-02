import type { Hono } from "hono";
import type { AppBindings } from "../types";

export const registerAuthRoutes = (app: Hono<AppBindings>) => {
    app.all("/api/auth/*", async c => {
        const auth = c.get("auth");
        if (!auth) return c.json({ error: "Auth not initialized" }, 500);
        return auth.handler(c.req.raw);
    });
};
