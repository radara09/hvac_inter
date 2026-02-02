import type { D1Database, IncomingRequestCfProperties } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth";
import { withCloudflare } from "better-auth-cloudflare";
import { anonymous, username, admin } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { schema } from "../db";
import { hashPassword, verifyPassword } from "./password";

export interface Env {
    DB: D1Database;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    FRONTEND_URL?: string;
    IMAGEKIT_PRIVATE_KEY?: string;
    IMAGEKIT_PUBLIC_KEY?: string;
}

// Single auth configuration that handles both CLI and runtime scenarios
const adminUserActions = [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "delete",
    "set-password",
    "get",
    "update",
];

const adminSessionActions = ["list", "revoke", "delete"];

const accessControl = createAccessControl({
    user: adminUserActions,
    session: adminSessionActions,
});

const roles = {
    admin: accessControl.newRole({
        user: [...adminUserActions],
        session: [...adminSessionActions],
    }),
    user: accessControl.newRole({
        user: ["get"],
    }),
    viewer: accessControl.newRole({
        user: ["get"],
    }),
};

function createAuth(env?: Env, cf?: IncomingRequestCfProperties) {
    const db = env ? drizzle(env.DB, { schema, logger: true }) : undefined;
    const isLocalEnv = env?.FRONTEND_URL?.startsWith("http://") ?? false;

    return betterAuth({
        ...withCloudflare(
            {
                autoDetectIpAddress: true,
                geolocationTracking: true,
                cf: cf || {},
                d1:
                    env && db
                        ? {
                            db,
                            options: {
                                usePlural: true,
                                debugLogs: true,
                            },
                        }
                        : undefined,
            },
            {
                emailAndPassword: {
                    enabled: true,
                    password: {
                        hash: hashPassword,
                        verify: verifyPassword,
                    },
                },
                socialProviders:
                    env?.GOOGLE_CLIENT_ID && env?.GOOGLE_CLIENT_SECRET
                        ? {
                            google: {
                                clientId: env.GOOGLE_CLIENT_ID,
                                clientSecret: env.GOOGLE_CLIENT_SECRET,
                            },
                        }
                        : undefined,
                plugins: [
                    anonymous(),
                    username({
                        minUsernameLength: 3,
                        maxUsernameLength: 32,
                        usernameValidator: username => /^(?![_.])(?!.*[_.]{2})[a-zA-Z0-9._]+(?<![_.])$/.test(username),
                    }),
                    admin({
                        ac: accessControl,
                        roles,
                        defaultRole: "user",
                        adminRoles: "admin",
                    }),
                ],
                rateLimit: {
                    enabled: true,
                    window: 60,
                    max: 100,
                    customRules: {
                        "/sign-in/username": {
                            window: 60,
                            max: 80,
                        },
                        "/sign-up/email": {
                            window: 60,
                            max: 80,
                        },
                    },
                },
            }
        ),
        advanced: {
            defaultCookieAttributes: {
                sameSite: isLocalEnv ? "lax" : "none",
                secure: !isLocalEnv,
                partitioned: isLocalEnv ? undefined : true,
            },
            // crossSubDomainCookies: {
            //     enabled: !isLocalEnv,
            // },
        },
        ...(env
            ? {}
            : {
                database: drizzleAdapter({} as D1Database, {
                    provider: "sqlite",
                    usePlural: true,
                    debugLogs: true,
                }),
            }),
    });
}

// Export for CLI schema generation
export const auth = createAuth();

export type AuthInstance = typeof auth;
export type AuthApi = typeof auth.api;
export type AuthSession = typeof auth.$Infer.Session;
export type AuthSessionUser = AuthSession["user"];
export type AuthSessionData = AuthSession["session"];

// Export for runtime usage
export { createAuth };
