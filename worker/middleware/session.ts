import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { createAuth } from "../auth";
import { getDb, type CfRequest } from "../utils";
import { siteEmailAllowlist, sites, userSites } from "../db";
import type { AppAuth, AppBindings, SessionUser } from "../types";

type Handler = (c: Context<AppBindings>) => Promise<Response> | Response;

const normalizeEmail = (value: string) => value.trim().toLowerCase();

async function consumeAllowlistSiteAssignment(env: AppBindings["Bindings"], userId?: string | null, email?: string | null) {
    if (!env || !userId || !email) {
        return null;
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
        return null;
    }

    const db = getDb(env);
    const [allowlistEntry] = await db
        .select({ id: siteEmailAllowlist.id, siteId: siteEmailAllowlist.siteId })
        .from(siteEmailAllowlist)
        .where(eq(siteEmailAllowlist.email, normalizedEmail))
        .limit(1);

    if (!allowlistEntry) {
        return null;
    }

    const [membership] = await db
        .select({ id: userSites.id })
        .from(userSites)
        .where(eq(userSites.userId, userId))
        .limit(1);

    if (!membership) {
        await db.insert(userSites).values({ userId, siteId: allowlistEntry.siteId, role: "member" });
    }

    await db.delete(siteEmailAllowlist).where(eq(siteEmailAllowlist.id, allowlistEntry.id));
    return allowlistEntry.siteId;
}

export const sessionMiddleware = async (c: Context<AppBindings>, next: () => Promise<void>) => {
    const cfDetails = (c.req.raw as CfRequest).cf;
    const auth = createAuth(c.env, cfDetails) as AppAuth;
    c.set("auth", auth);
    c.set("siteMemberships", []);

    try {
        const sessionResult = await auth.api.getSession({ headers: c.req.raw.headers, request: c.req.raw });
            if (sessionResult) {
                const user = sessionResult.user as SessionUser;
                c.set("user", user);
                const db = getDb(c.env);
                if (user.role !== "admin") {
                    try {
                        await consumeAllowlistSiteAssignment(c.env, user.id, user.email ?? null);
                    } catch (error) {
                        console.error("Failed to apply allowlist site assignment", error);
                    }
                }
                const memberships = await db
                    .select({
                        siteId: userSites.siteId,
                    role: userSites.role,
                    siteName: sites.name,
                    spreadsheetUrl: sites.spreadsheetUrl,
                })
                .from(userSites)
                .leftJoin(sites, eq(userSites.siteId, sites.id))
                .where(eq(userSites.userId, user.id ?? ""));
            if (user.role === "admin") {
                const allSites = await db.select().from(sites);
                c.set(
                    "siteMemberships",
                    allSites.map(site => ({ siteId: site.id, role: "admin", siteName: site.name, spreadsheetUrl: site.spreadsheetUrl ?? null })),
                );
                user.siteId = null;
                user.siteName = undefined;
            } else {
                const normalizedMemberships = memberships.map(entry => ({
                    siteId: entry.siteId,
                    role: entry.role,
                    siteName: entry.siteName ?? "Site",
                    spreadsheetUrl: entry.spreadsheetUrl ?? null,
                }));
                c.set(
                    "siteMemberships",
                    normalizedMemberships,
                );
                user.siteId = normalizedMemberships[0]?.siteId ?? null;
                user.siteName = normalizedMemberships[0]?.siteName;
            }
            c.set("session", sessionResult.session);
        } else {
            c.set("user", null);
            c.set("session", null);
            c.set("siteMemberships", []);
        }
    } catch (error) {
        console.error("Failed to load session", error);
        c.set("user", null);
        c.set("session", null);
        c.set("siteMemberships", []);
    }

    await next();
};

export const requireSession = (handler: Handler) => {
    return async (c: Context<AppBindings>) => {
        if (!c.get("user")) {
            return c.json({ error: "Unauthorized" }, 401);
        }
        return handler(c);
    };
};

export const requireAdmin = (handler: Handler) =>
    requireSession(async c => {
        if (c.get("user")?.role !== "admin") {
            return c.json({ error: "Forbidden" }, 403);
        }
        return handler(c);
    });
