#!/usr/bin/env bun
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { schema, users, acUnits, sites, userSites, acUnitHistory } from "../worker/db";

type DatasetEntry = {
    "ID_AC": string;
    "Lokasi": string;
    "Merek": string;
    "Kondisi Terakhir": string;
    "Service Terakhir": string;
    "Teknisi": string;
    "Jadwal Berikut": string;
    "Tekanan Freon": string;
    "Suhu Keluar": string;
    "Ampere Kompresor": string;
    "Kondisi Filter": string;
    "Foto URL": string;
};

function loadDevVars() {
    const devVarsPath = path.resolve(".dev.vars");
    if (!fs.existsSync(devVarsPath)) {
        return;
    }
    const content = fs.readFileSync(devVarsPath, "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eqIndex = line.indexOf("=");
        if (eqIndex === -1) continue;
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
        throw new Error("No .sqlite file found under .wrangler");
    }
    const score = (file: string) => {
        if (file.includes("state/v")) return 3;
        if (file.includes("miniflare")) return 2;
        return 1;
    };
    const bestMatch = candidates.reduce((best, current) => (score(current) > score(best) ? current : best), candidates[0]);
    return path.join(wranglerDir, bestMatch);
}

function parseDataset(): DatasetEntry[] {
    const content = [
        { "ID_AC": "AC-RS1-001", "Lokasi": "Gas Medik", "Merek": "Daikin", "Kondisi Terakhir": "Bagus", "Service Terakhir": "2025-10-16T17:00:00.000Z", "Teknisi": "Saya", "Jadwal Berikut": "2025-12-16T17:00:00.000Z", "Tekanan Freon": "50 PSI", "Suhu Keluar": "10°C", "Ampere Kompresor": "3.5 A", "Kondisi Filter": "Bersih", "Foto URL": "" },
        { "ID_AC": "AC-RS1-002", "Lokasi": "Gas Medik", "Merek": "Daikin", "Kondisi Terakhir": "Bagus", "Service Terakhir": "2025-08-10T17:00:00.000Z", "Teknisi": "Budi", "Jadwal Berikut": "2025-11-10T17:00:00.000Z", "Tekanan Freon": "46 PSI", "Suhu Keluar": "7°C", "Ampere Kompresor": "3.2 A", "Kondisi Filter": "Bersih", "Foto URL": "" },
        { "ID_AC": "AC-RS1-003", "Lokasi": "Gas Medik", "Merek": "Panasonic", "Kondisi Terakhir": "Bagus", "Service Terakhir": "2025-08-11T17:00:00.000Z", "Teknisi": "Budi", "Jadwal Berikut": "2025-11-11T17:00:00.000Z", "Tekanan Freon": "47 PSI", "Suhu Keluar": "7°C", "Ampere Kompresor": "3.2 A", "Kondisi Filter": "Bersih", "Foto URL": "" },
        { "ID_AC": "AC-RS1-004", "Lokasi": "Kantor Gas Medik", "Merek": "Panasonic", "Kondisi Terakhir": "Bagus", "Service Terakhir": "2025-09-09T17:00:00.000Z", "Teknisi": "Fadli", "Jadwal Berikut": "2025-12-09T17:00:00.000Z", "Tekanan Freon": "48 PSI", "Suhu Keluar": "8°C", "Ampere Kompresor": "3.0 A", "Kondisi Filter": "Bersih", "Foto URL": "" },
        { "ID_AC": "AC-RS1-005", "Lokasi": "Kantor Gas Medik", "Merek": "Panasonic", "Kondisi Terakhir": "Buruk", "Service Terakhir": "2025-07-19T17:00:00.000Z", "Teknisi": "Rama", "Jadwal Berikut": "2025-10-19T17:00:00.000Z", "Tekanan Freon": "45 PSI", "Suhu Keluar": "9°C", "Ampere Kompresor": "3.6 A", "Kondisi Filter": "Kotor", "Foto URL": "" },
        { "ID_AC": "AC-RS1-006", "Lokasi": "Gudang Farmasi", "Merek": "Panasonic", "Kondisi Terakhir": "Bagus", "Service Terakhir": "2025-08-31T17:00:00.000Z", "Teknisi": "Andi", "Jadwal Berikut": "2025-11-30T17:00:00.000Z", "Tekanan Freon": "49 PSI", "Suhu Keluar": "9°C", "Ampere Kompresor": "3.4 A", "Kondisi Filter": "Bersih", "Foto URL": "" },
        { "ID_AC": "AC-RS1-007", "Lokasi": "Tehnik", "Merek": "Panasonic", "Kondisi Terakhir": "Bagus", "Service Terakhir": "2025-10-01T17:00:00.000Z", "Teknisi": "Inko", "Jadwal Berikut": "2026-01-01T17:00:00.000Z", "Tekanan Freon": "52 PSI", "Suhu Keluar": "10°C", "Ampere Kompresor": "3.1 A", "Kondisi Filter": "Bersih", "Foto URL": "" },
        { "ID_AC": "AC-RS1-008", "Lokasi": "Tehnik", "Merek": "Panasonic", "Kondisi Terakhir": "Cukup", "Service Terakhir": "2025-07-16T17:00:00.000Z", "Teknisi": "Rama", "Jadwal Berikut": "2025-10-16T17:00:00.000Z", "Tekanan Freon": "44 PSI", "Suhu Keluar": "9°C", "Ampere Kompresor": "3.7 A", "Kondisi Filter": "Kotor", "Foto URL": "" },
        { "ID_AC": "AC-RS1-009", "Lokasi": "Tehnik Alkes", "Merek": "Panasonic", "Kondisi Terakhir": "Bagus", "Service Terakhir": "2025-09-24T17:00:00.000Z", "Teknisi": "Budi", "Jadwal Berikut": "2025-12-24T17:00:00.000Z", "Tekanan Freon": "50 PSI", "Suhu Keluar": "8°C", "Ampere Kompresor": "3.3 A", "Kondisi Filter": "Bersih", "Foto URL": "" },
        { "ID_AC": "AC-RS1-010", "Lokasi": "Tehnik Alkes", "Merek": "Panasonic", "Kondisi Terakhir": "Baik", "Service Terakhir": "2025-08-14T17:00:00.000Z", "Teknisi": "Fadli", "Jadwal Berikut": "2025-11-14T17:00:00.000Z", "Tekanan Freon": "48 PSI", "Suhu Keluar": "7°C", "Ampere Kompresor": "3.2 A", "Kondisi Filter": "Bersih", "Foto URL": "" },
        { "ID_AC": "AC-RS1-011", "Lokasi": "Ruang Operasi", "Merek": "Daikin", "Kondisi Terakhir": "Baik", "Service Terakhir": "2025-10-04T17:00:00.000Z", "Teknisi": "Pirlo", "Jadwal Berikut": "2026-01-04T17:00:00.000Z", "Tekanan Freon": "53 PSI", "Suhu Keluar": "11°C", "Ampere Kompresor": "3.4 A", "Kondisi Filter": "Bersih", "Foto URL": "" },
        { "ID_AC": "AC-RS1-012", "Lokasi": "Ruang IGD", "Merek": "Daikin", "Kondisi Terakhir": "Buruk", "Service Terakhir": "2025-09-27T17:00:00.000Z", "Teknisi": "Rama", "Jadwal Berikut": "2025-12-27T17:00:00.000Z", "Tekanan Freon": "49 PSI", "Suhu Keluar": "8°C", "Ampere Kompresor": "3.0 A", "Kondisi Filter": "Bersih", "Foto URL": "" },
        { "ID_AC": "AC-RS1-013", "Lokasi": "Ruang Tunggu", "Merek": "Panasonic", "Kondisi Terakhir": "Cukup", "Service Terakhir": "2025-07-11T17:00:00.000Z", "Teknisi": "Budi", "Jadwal Berikut": "2025-10-11T17:00:00.000Z", "Tekanan Freon": "43 PSI", "Suhu Keluar": "9°C", "Ampere Kompresor": "3.6 A", "Kondisi Filter": "Kotor", "Foto URL": "" },
        { "ID_AC": "AC-RS1-014", "Lokasi": "ICU Lt.2 - Ruang Bayi", "Merek": "Daikin", "Kondisi Terakhir": "Normal", "Service Terakhir": "2025-09-24T17:00:00.000Z", "Teknisi": "Fadli", "Jadwal Berikut": "2025-12-24T17:00:00.000Z", "Tekanan Freon": "50 PSI", "Suhu Keluar": "10°C", "Ampere Kompresor": "3.5 A", "Kondisi Filter": "Bersih", "Foto URL": "" },
        { "ID_AC": "AC-RS1-015", "Lokasi": "Poliklinik Utama", "Merek": "Mitsubishi", "Kondisi Terakhir": "Bagus", "Service Terakhir": "2025-08-29T17:00:00.000Z", "Teknisi": "Satyo", "Jadwal Berikut": "2025-11-29T17:00:00.000Z", "Tekanan Freon": "47 PSI", "Suhu Keluar": "8°C", "Ampere Kompresor": "3.1 A", "Kondisi Filter": "Bersih", "Foto URL": "" },
        { "ID_AC": "AC-RS1-016", "Lokasi": "Ruang Dokter", "Merek": "Panasonic", "Kondisi Terakhir": "Buruk", "Service Terakhir": "2025-10-02T17:00:00.000Z", "Teknisi": "Rama", "Jadwal Berikut": "2026-01-02T17:00:00.000Z", "Tekanan Freon": "51 PSI", "Suhu Keluar": "9°C", "Ampere Kompresor": "3.3 A", "Kondisi Filter": "Bersih", "Foto URL": "" },
        { "ID_AC": "AC-RS1-017", "Lokasi": "Apotek", "Merek": "Panasonic", "Kondisi Terakhir": "Buruk", "Service Terakhir": "2025-07-24T17:00:00.000Z", "Teknisi": "Andi", "Jadwal Berikut": "2025-10-24T17:00:00.000Z", "Tekanan Freon": "44 PSI", "Suhu Keluar": "9°C", "Ampere Kompresor": "3.7 A", "Kondisi Filter": "Kotor", "Foto URL": "" },
        { "ID_AC": "AC-RS1-018", "Lokasi": "Lab Patologi", "Merek": "Daikin", "Kondisi Terakhir": "Buruk", "Service Terakhir": "2025-08-17T17:00:00.000Z", "Teknisi": "Fadli", "Jadwal Berikut": "2025-11-17T17:00:00.000Z", "Tekanan Freon": "48 PSI", "Suhu Keluar": "8°C", "Ampere Kompresor": "3.2 A", "Kondisi Filter": "Bersih", "Foto URL": "" },
        { "ID_AC": "AC-RS1-019", "Lokasi": "Ruang Rontgen", "Merek": "Mitsubishi", "Kondisi Terakhir": "Baik", "Service Terakhir": "2025-09-08T17:00:00.000Z", "Teknisi": "Budi", "Jadwal Berikut": "2025-12-08T17:00:00.000Z", "Tekanan Freon": "50 PSI", "Suhu Keluar": "10°C", "Ampere Kompresor": "3.3 A", "Kondisi Filter": "Bersih", "Foto URL": "" },
        { "ID_AC": "AC-RS1-020", "Lokasi": "Kamar Jenazah", "Merek": "Panasonic", "Kondisi Terakhir": "Cukup", "Service Terakhir": "2025-06-21T17:00:00.000Z", "Teknisi": "Rama", "Jadwal Berikut": "2025-09-21T17:00:00.000Z", "Tekanan Freon": "42 PSI", "Suhu Keluar": "9°C", "Ampere Kompresor": "3.8 A", "Kondisi Filter": "Kotor", "Foto URL": "" }
    ];
    return content as DatasetEntry[];
}

function toTimestamp(value: string) {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
        throw new Error(`Invalid date value: ${value}`);
    }
    return new Date(ms);
}

async function main() {
    loadDevVars();
    const dbPath = resolveLocalD1Path();
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite, { schema });

    const ownerEmail = process.env.SEED_AC_OWNER_EMAIL ?? process.env.DEFAULT_ADMIN_EMAIL;
    if (!ownerEmail) {
        throw new Error("Set SEED_AC_OWNER_EMAIL or DEFAULT_ADMIN_EMAIL to link AC records to a user.");
    }

    const owner = await db.query.users.findFirst({ where: eq(users.email, ownerEmail.toLowerCase()) });
    if (!owner) {
        throw new Error(`No user found with email ${ownerEmail}`);
    }

    const siteFixtures = [
        {
            id: "site-rsud-tarakan",
            name: "RSUD Tarakan",
            description: "Gedung utama dan gas medik",
            spreadsheetUrl: "https://docs.google.com/spreadsheets/d/placeholder",
        },
        {
            id: "site-rsud-rawat-jalan",
            name: "RSUD Rawat Jalan",
            description: "Area penunjang dan instalasi farmasi",
            spreadsheetUrl: "https://docs.google.com/spreadsheets/d/placeholder-2",
        },
    ];

    for (const fixture of siteFixtures) {
        const existingSite = await db.query.sites.findFirst({ where: eq(sites.id, fixture.id) });
        if (existingSite) {
            await db
                .update(sites)
                .set({
                    name: fixture.name,
                    description: fixture.description,
                    spreadsheetUrl: fixture.spreadsheetUrl,
                    syncEnabled: false,
                })
                .where(eq(sites.id, fixture.id));
        } else {
            await db.insert(sites).values({
                id: fixture.id,
                name: fixture.name,
                description: fixture.description,
                spreadsheetUrl: fixture.spreadsheetUrl,
                syncEnabled: false,
            });
        }
    }

    for (const fixture of siteFixtures) {
        await db
            .insert(userSites)
            .values({
                id: randomUUID(),
                userId: owner.id,
                siteId: fixture.id,
                role: "manager",
            })
            .onConflictDoNothing({ target: [userSites.userId, userSites.siteId] });
    }

    const dataset = parseDataset();
    for (const [index, record] of dataset.entries()) {
        const id = record["ID_AC"];
        const existing = await db.query.acUnits.findFirst({ where: eq(acUnits.id, id) });
        if (existing) {
            continue;
        }
        const siteFixture = siteFixtures[index % siteFixtures.length];
        await db.insert(acUnits).values({
            id,
            siteId: siteFixture.id,
            assetCode: record["ID_AC"],
            location: record["Lokasi"],
            brand: record["Merek"],
            lastCondition: record["Kondisi Terakhir"],
            lastServiceAt: toTimestamp(record["Service Terakhir"]),
            technician: record["Teknisi"],
            nextScheduleAt: toTimestamp(record["Jadwal Berikut"]),
            freonPressure: record["Tekanan Freon"],
            outletTemp: record["Suhu Keluar"],
            compressorAmp: record["Ampere Kompresor"],
            filterCondition: record["Kondisi Filter"],
            photoUrl: record["Foto URL"],
            ownerId: owner.id,
            sourceRowRef: record["ID_AC"],
        });
        await db.insert(acUnitHistory).values({
            id: randomUUID(),
            acUnitId: id,
            userId: owner.id,
            changes: JSON.stringify([
                {
                    field: "seed",
                    previous: null,
                    current: `Imported from dataset for ${siteFixture.name}`,
                },
            ]),
            note: "Initial import",
        });
    }

    sqlite.close();
    console.log(`Seeded ${dataset.length} AC entries for ${ownerEmail}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
