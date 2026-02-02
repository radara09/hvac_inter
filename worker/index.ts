import { Hono } from "hono";
import { sessionMiddleware, requireSession } from "./middleware/session";
import { buildCorsMiddleware, parseOrigins } from "./utils";
import { registerAcRoutes } from "./routes/ac";
import { registerAdminRoutes } from "./routes/admin";
import { registerSiteRoutes } from "./routes/sites";
import { registerAcTypeRoutes } from "./routes/acTypes";
import { registerImageKitRoutes } from "./routes/imagekit";
import { registerAuthRoutes } from "./routes/auth";
import { registerProfileRoutes } from "./routes/profile";
import type { AppBindings } from "./types";

const app = new Hono<AppBindings>();

app.use("/api/*", async (c, next) => {
    const middleware = buildCorsMiddleware(parseOrigins(c.env.FRONTEND_URL));
    return middleware(c, next);
});

app.use("*", sessionMiddleware);

registerAuthRoutes(app);
registerAcRoutes(app);
registerAdminRoutes(app);
registerSiteRoutes(app);
registerAcTypeRoutes(app);
registerImageKitRoutes(app);
registerProfileRoutes(app);

app.get("/api/me", requireSession(async c => {
    return c.json({
        user: c.get("user"),
        session: c.get("session"),
    });
}));

app.get("/api/health", c => c.json({ ok: true }));

app.all("/api/*", c => c.json({ error: "Not found" }, 404));

app.all("*", c => c.text("", 404));

export default {
    fetch: app.fetch,
};
