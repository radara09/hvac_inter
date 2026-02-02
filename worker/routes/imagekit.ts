import type { Hono } from "hono";
import type { AppBindings } from "../types";
import { createImageKitSignature } from "../utils";

export const registerImageKitRoutes = (app: Hono<AppBindings>) => {
    app.get("/api/imagekit/auth", async c => {
        const privateKey = c.env.IMAGEKIT_PRIVATE_KEY;
        const publicKey = c.env.IMAGEKIT_PUBLIC_KEY;

        if (!privateKey || !publicKey) {
            return c.json({ error: "ImageKit keys are not configured" }, 400);
        }

        const token = crypto.randomUUID().replace(/-/g, "");
        const expire = Math.floor(Date.now() / 1000) + 60 * 30;
        const signature = await createImageKitSignature(privateKey, token, expire);

        return c.json({ token, expire, signature, publicKey });
    });
};
