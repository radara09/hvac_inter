import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { acTypes, siteSheets, acUnits } from "../db";
import { getDb } from "../utils";
import type { AppBindings } from "../types";
import { requireAdmin, requireSession } from "../middleware/session";
import { scanSheet, fetchSheetMetadata, getAccessToken } from "../integrations/googleSheets";

const getColumnLetter = (index: number) => {
    let dividend = index + 1;
    let columnName = "";
    while (dividend > 0) {
        const modulo = (dividend - 1) % 26;
        columnName = String.fromCharCode(65 + modulo) + columnName;
        dividend = Math.floor((dividend - modulo) / 26);
    }
    return columnName;
};

const getColumnIndex = (letter: string) => {
    let column = 0;
    const length = letter.length;
    for (let i = 0; i < length; i++) {
        column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
    }
    return column - 1;
};

const handleGetAcTypes = requireSession(async (c) => {
    const db = getDb(c.env);
    const records = await db.select().from(acTypes);
    return c.json({
        records: records.map(r => ({
            ...r,
            fields: JSON.parse(r.fields)
        }))
    });
});

const handleCreateAcType = requireAdmin(async (c) => {
    const db = getDb(c.env);
    const body = await c.req.json();

    if (!body.name || !body.fields) {
        return c.json({ error: "Name and fields are required" }, 400);
    }

    const id = crypto.randomUUID();
    await db.insert(acTypes).values({
        id,
        name: body.name,
        fields: JSON.stringify(body.fields),
    });

    return c.json({ id, name: body.name, fields: body.fields });
});

const handleUpdateAcType = requireAdmin(async (c) => {
    const db = getDb(c.env);
    const id = c.req.param("id");
    const body = await c.req.json();

    const updateData: any = {};
    if (body.name) updateData.name = body.name;
    if (body.fields) updateData.fields = JSON.stringify(body.fields);

    await db.update(acTypes).set(updateData).where(eq(acTypes.id, id));
    return c.json({ success: true });
});

const handleDeleteAcType = requireAdmin(async (c) => {
    const db = getDb(c.env);
    const id = c.req.param("id");

    // Find affected sheets configuration
    const sheetsToDelete = await db.select().from(siteSheets).where(eq(siteSheets.acTypeId, id));

    for (const sheet of sheetsToDelete) {
        // Delete data (AC Units) associated with this sheet
        await db.delete(acUnits).where(
            and(
                eq(acUnits.siteId, sheet.siteId),
                eq(acUnits.sheetName, sheet.sheetName)
            )
        );
        // Remove sheet configuration (disable sync)
        await db.delete(siteSheets).where(eq(siteSheets.id, sheet.id));
    }

    // Finally delete the AC Type
    await db.delete(acTypes).where(eq(acTypes.id, id));
    return c.json({ success: true });
});

const handleGetSheets = requireAdmin(async (c) => {
    const body = await c.req.json<{ spreadsheetUrl: string }>();
    if (!body.spreadsheetUrl) {
        return c.json({ error: "Spreadsheet URL is required" }, 400);
    }

    const tokenResult = await getAccessToken(c.env);
    if (!tokenResult.ok) {
        return c.json({ error: tokenResult.reason }, 400);
    }

    const result = await fetchSheetMetadata(tokenResult.token, body.spreadsheetUrl);
    if (!result.ok) {
        return c.json({ error: result.reason }, 400);
    }

    return c.json({ sheets: result.sheets.map(s => s.title) });
});

const handleScanForAcType = requireAdmin(async (c) => {
    const body = await c.req.json<{ spreadsheetUrl: string; range: string }>();
    if (!body.spreadsheetUrl || !body.range) {
        return c.json({ error: "Spreadsheet URL and Range are required" }, 400);
    }

    const result = await scanSheet(c.env, body.spreadsheetUrl, body.range);
    if (!result.ok) {
        return c.json({ error: result.reason }, 400);
    }

    // Try to parse start cell from range (e.g., "Sheet1!B2:F5" -> B2)
    let startColIndex = 0;
    let startRowIndex = 1; // Default to 1-based row
    const rangeMatch = body.range.match(/!([A-Za-z]+)(\d+)/) || body.range.match(/^([A-Za-z]+)(\d+)/);
    
    if (rangeMatch) {
        const colStr = rangeMatch[1].toUpperCase();
        startRowIndex = parseInt(rangeMatch[2], 10);
        startColIndex = getColumnIndex(colStr);
    }

    // If user provided a limited range, fetch more data for preview.
    let dataRows = result.rows;
    
    if (dataRows.length < 5) {
        const sheetMatch = body.range.match(/^(.*?)!/);
        const prefix = sheetMatch ? sheetMatch[0] : ""; // Include the '!'
        
        // Remove sheet prefix to get cell range (A1:Z1)
        const cellRange = body.range.replace(/^.*?!/, "");
        const rangeParts = cellRange.split(":");
        
        if (rangeParts.length === 2) {
            const start = rangeParts[0];
            const end = rangeParts[1];
            
            const endMatch = end.match(/([A-Za-z]+)(\d+)/);
            const startMatch = start.match(/([A-Za-z]+)(\d+)/); // Need start row too

            if (endMatch && startMatch) {
                const endCol = endMatch[1];
                const startRow = parseInt(startMatch[2], 10);
                
                // We want to see 5 data rows. 
                // Row 1 is header (startRow).
                // Data starts at startRow + 1.
                // We want up to startRow + 5.
                const targetEndRow = startRow + 5;
                
                const newRange = `${prefix}${start}:${endCol}${targetEndRow}`;
                
                // Only fetch if new range is actually larger than what we likely have
                // (Though with < 5 check, it usually is)
                const extendedResult = await scanSheet(c.env, body.spreadsheetUrl, newRange);
                if (extendedResult.ok && extendedResult.rows.length > 0) {
                    dataRows = extendedResult.rows;
                }
            }
        }
    }

    const fields = result.headers.map((h: string, i: number) => {
        const cell = `${getColumnLetter(startColIndex + i)}${startRowIndex}`;
        return {
            label: h,
            key: h.toLowerCase().replace(/[^a-z0-9]/g, "_"),
            cell
        };
    }).filter((f: { key: string }) => f.key); // Filter out empty keys

    const previewData = dataRows.slice(0, 5).map((row: string[], i: number) => {
        const record: Record<string, string> = { _row: String(startRowIndex + 1 + i) }; // +1 because startRowIndex is header row
        fields.forEach((field: { key: string }, idx: number) => {
            record[field.key] = row[idx] || "";
        });
        return record;
    });

    return c.json({ fields, previewData });
});

export const registerAcTypeRoutes = (app: Hono<AppBindings>) => {
    app.get("/api/admin/ac-types", handleGetAcTypes);
    app.post("/api/admin/ac-types", handleCreateAcType);
    app.post("/api/admin/ac-types/scan", handleScanForAcType);
    app.post("/api/admin/ac-types/sheets", handleGetSheets);
    app.patch("/api/admin/ac-types/:id", handleUpdateAcType);
    app.delete("/api/admin/ac-types/:id", handleDeleteAcType);
};
