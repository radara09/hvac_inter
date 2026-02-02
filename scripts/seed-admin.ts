#!/usr/bin/env bun
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, or, and } from "drizzle-orm";
import { accounts, users } from "../worker/db/auth.schema";
import { schema } from "../worker/db";
// import { hashPassword } from "better-auth/crypto";

async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
    );
    const hash = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt,
            iterations: 10000, // Lower iterations for Worker performance
            hash: "SHA-256",
        },
        keyMaterial,
        256
    );

    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
    const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");

    return `${saltHex}:${hashHex}`;
}

function loadDevVars() {
    const devVarsPath = path.resolve(".dev.vars");
    if (!fs.existsSync(devVarsPath)) {
        return;
    }

    const content = fs.readFileSync(devVarsPath, "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }
        const eqIndex = line.indexOf("=");
        if (eqIndex === -1) {
            continue;
        }
        const key = line.slice(0, eqIndex).trim();
        let value = line.slice(eqIndex + 1).trim();
        if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!(key in process.env)) {
            process.env[key] = value;
        }
    }
}

loadDevVars();

const DEFAULT_EMAIL = process.env.DEFAULT_ADMIN_EMAIL ?? "admin@example.com";
const DEFAULT_USERNAME = process.env.DEFAULT_ADMIN_USERNAME ?? "admin";
const DEFAULT_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD ?? "ChangeMeNow!123";
const DEFAULT_NAME = process.env.DEFAULT_ADMIN_NAME ?? "Super Admin";

function resolveLocalD1Path() {
    if (process.env.LOCAL_D1_PATH) {
        return path.resolve(process.env.LOCAL_D1_PATH);
    }

    const wranglerDir = path.resolve(".wrangler");
    if (!fs.existsSync(wranglerDir)) {
        throw new Error(".wrangler directory not found. Run `wrangler dev` once to create a local D1 database.");
    }

    const entries = fs.readdirSync(wranglerDir, { recursive: true }) as string[];
    const candidates = entries.filter(entry => entry.endsWith(".sqlite"));
    if (!candidates.length) {
        throw new Error("No .sqlite file found under .wrangler. Run `wrangler d1 generate` or start dev server to create one.");
    }

    const score = (file: string) => {
        if (file.includes("state/v")) return 3;
        if (file.includes("miniflare")) return 2;
        return 1;
    };

    const bestMatch = candidates.reduce((best, current) => (score(current) > score(best) ? current : best), candidates[0]);
    return path.join(wranglerDir, bestMatch);
}

async function main() {
    const dbPath = resolveLocalD1Path();
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite, { schema });

    const email = DEFAULT_EMAIL.toLowerCase();
    const username = DEFAULT_USERNAME.toLowerCase();
    const displayUsername = process.env.DEFAULT_ADMIN_DISPLAY_USERNAME ?? DEFAULT_USERNAME;

    const existingUser = await db.query.users.findFirst({
        where: or(eq(users.email, email), eq(users.username, username)),
    });

    const userId = existingUser?.id ?? crypto.randomUUID();

    if (existingUser) {
        await db
            .update(users)
            .set({
                name: DEFAULT_NAME,
                email,
                username,
                displayUsername,
                role: "admin",
                emailVerified: true,
                banned: false,
                banReason: null,
                banExpires: null,
            })
            .where(eq(users.id, userId));
    } else {
        await db.insert(users).values({
            id: userId,
            name: DEFAULT_NAME,
            email,
            username,
            displayUsername,
            role: "admin",
            emailVerified: true,
            banned: false,
        });
    }

    const hashedPassword = await hashPassword(DEFAULT_PASSWORD);

    const credentialAccount = await db.query.accounts.findFirst({
        where: and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")),
    });

    if (credentialAccount) {
        await db
            .update(accounts)
            .set({
                password: hashedPassword,
                accountId: userId,
            })
            .where(eq(accounts.id, credentialAccount.id));
    } else {
        await db.insert(accounts).values({
            id: crypto.randomUUID(),
            userId,
            providerId: "credential",
            accountId: userId,
            password: hashedPassword,
        });
    }

    sqlite.close();

    console.log(`✅ Admin user ready: ${email} / username: ${username}`);
    if (!process.env.DEFAULT_ADMIN_PASSWORD) {
        console.warn("⚠️ DEFAULT_ADMIN_PASSWORD not set. Update the generated password ASAP.");
    }
}

main().catch(error => {
    console.error("Failed to seed admin user", error);
    process.exit(1);
});
