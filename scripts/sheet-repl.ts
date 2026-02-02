import { readFile } from "node:fs/promises";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

// Types adapted from worker/integrations/googleSheets.ts
type ServiceAccountConfig = {
    clientEmail: string;
    privateKey: string;
};

type AccessTokenResult = { ok: true; token: string } | { ok: false; reason: string };

type SheetTable = {
    header: string[];
    rows: string[][];
};

// Utils
const base64UrlEncode = (input: ArrayBuffer | Uint8Array | string) => {
    const encoder = new TextEncoder();
    const data = typeof input === "string" ? encoder.encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input);
    let binary = "";
    for (let i = 0; i < data.length; i += 1) {
        binary += String.fromCharCode(data[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const importPrivateKey = async (pem: string) => {
    const normalized = pem.replace(/-----BEGIN PRIVATE KEY-----/, "")
        .replace(/-----END PRIVATE KEY-----/, "")
        .replace(/\s+/g, "");
    const binary = Uint8Array.from(atob(normalized), char => char.charCodeAt(0));
    return crypto.subtle.importKey(
        "pkcs8",
        binary.buffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
    );
};

const getServiceAccount = (keyString: string): ServiceAccountConfig | null => {
    if (!keyString) return null;
    let parsed: Record<string, string> | null = null;
    try {
        parsed = JSON.parse(keyString);
    } catch {
        try {
            parsed = JSON.parse(atob(keyString));
        } catch {
            parsed = null;
        }
    }
    if (!parsed?.client_email || !parsed.private_key) {
        return null;
    }
    return {
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    };
};

const getAccessToken = async (serviceAccountKey: string): Promise<AccessTokenResult> => {
    const account = getServiceAccount(serviceAccountKey);
    if (!account) {
        return { ok: false, reason: "Invalid Service Account Key" };
    }
    const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = base64UrlEncode(
        JSON.stringify({
            iss: account.clientEmail,
            scope: "https://www.googleapis.com/auth/spreadsheets",
            aud: "https://oauth2.googleapis.com/token",
            iat: issuedAt,
            exp: issuedAt + 3600,
        }),
    );
    const signingInput = `${header}.${payload}`;
    const key = await importPrivateKey(account.privateKey);
    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(signingInput),
    );
    const assertion = `${signingInput}.${base64UrlEncode(signature)}`;
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion,
        }),
    });
    if (!response.ok) {
        const message = await response.text();
        return { ok: false, reason: `Token exchange failed (${response.status}): ${message}` };
    }
    const payloadJson = (await response.json()) as { access_token?: string };
    if (!payloadJson.access_token) {
        return { ok: false, reason: "Access token missing" };
    }
    return { ok: true, token: payloadJson.access_token };
};

const loadEnv = async () => {
    try {
        const content = await readFile(".dev.vars", "utf-8");
        const env: Record<string, string> = {};
        for (const line of content.split("\n")) {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim();
                // Remove quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    env[key] = value.slice(1, -1);
                } else {
                    env[key] = value;
                }
            }
        }
        return env;
    } catch (e) {
        console.warn("Could not load .dev.vars, relying on process.env");
        return process.env;
    }
};

const fetchSheetData = async (token: string, spreadsheetId: string, range: string) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status} ${await response.text()}`);
    }
    const data = await response.json() as { values: string[][] };
    return data.values || [];
};

const updateSheetData = async (token: string, spreadsheetId: string, range: string, values: string[][]) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    const response = await fetch(url, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
    });

    if (!response.ok) {
        throw new Error(`Failed to update data: ${response.status} ${await response.text()}`);
    }
    
    return await response.json();
};

const fetchSheetMetadata = async (token: string, spreadsheetId: string) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`;
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.status} ${await response.text()}`);
    }
    const data = await response.json() as { sheets: Array<{ properties: { title: string; sheetId: number } }> };
    return data.sheets.map(s => s.properties);
};

const extractSpreadsheetId = (url: string) => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : url;
};

const normalizeHeader = (header: string) => {
    return header.toLowerCase().replace(/[^a-z0-9]/g, "_");
};

// Main REPL
const main = async () => {
    const env = await loadEnv();
    const serviceAccountKey = env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    if (!serviceAccountKey) {
        console.error("Error: GOOGLE_SERVICE_ACCOUNT_KEY not found in .dev.vars or environment.");
        process.exit(1);
    }

    console.log("Authenticating...");
    const auth = await getAccessToken(serviceAccountKey);
    if (!auth.ok) {
        console.error(`Authentication failed: ${auth.reason}`);
        process.exit(1);
    }
    console.log("Authentication successful!");

    const rl = readline.createInterface({ input, output });

    let spreadsheetId = "";
    while (!spreadsheetId) {
        const answer = await rl.question("Enter Spreadsheet URL or ID: ");
        const id = extractSpreadsheetId(answer.trim());
        if (id) {
            spreadsheetId = id;
            console.log(`Using Spreadsheet ID: ${spreadsheetId}`);
        } else {
            console.log("Invalid URL or ID. Please try again.");
        }
    }

    console.log("\nEnter commands. Type 'help' for options, 'exit' to quit.");
    
    const prompt = () => rl.question("> ");

    while (true) {
        const commandLine = await prompt();
        const parts = commandLine.trim().split(/\s+/);
        const command = parts[0]?.toLowerCase();
        
        // Join the rest of the arguments back together to handle spaces in sheet names
        // e.g. "print Sheet Name!A1" -> args=["Sheet", "Name!A1"] -> joined="Sheet Name!A1"
        const args = parts.slice(1);
        const fullArg = args.join(" ");

        if (command === "exit" || command === "quit") {
            break;
        }

        if (command === "help") {
            console.log("\nAvailable Commands:");
            console.log("  list               - List all sheets in the spreadsheet");
            console.log("  print <range>      - Print data from a range");
            console.log("                       Examples:");
            console.log("                       print Sheet1!A1:C5");
            console.log("                       print 'Sheet Name'!A1:C5");
            console.log("                       print data parameter PAC!A1:C5");
            console.log("  scan [json] <range> - Scan range. Auto-detects config if JSON omitted.");
            console.log("                       Examples:");
            console.log("                       scan Sheet1!A1:Z (Auto-detect)");
            console.log("                       scan [{\"label\":\"Suhu\",\"key\":\"temp\"}] Sheet1!A1:Z (Manual)");
            console.log("  edit <range> <val> - Set a single cell or range to a value.");
            console.log("                       Examples:");
            console.log("                       edit Sheet1!A1 Hello World");
            console.log("                       edit Sheet1!B2 123");
            console.log("  url                - Show current Spreadsheet ID");
            console.log("  change             - Change target Spreadsheet");
            console.log("  exit               - Quit");
            continue;
        }

        if (command === "list" || command === "ls") {
            try {
                const sheets = await fetchSheetMetadata(auth.token, spreadsheetId);
                console.log("\nSheets found:");
                console.table(sheets);
            } catch (e: any) {
                console.error(`Error: ${e.message}`);
            }
        } else if (command === "print") {
            if (!fullArg) {
                console.log("Usage: print <SheetName!Range>");
                continue;
            }
            try {
                // Remove quotes if user added them around the whole argument (e.g. print "Sheet 1!A1")
                // But usually quotes are inside: 'Sheet Name'!A1. Google Sheets API handles 'Sheet Name'!A1 fine.
                // We just send the raw string.
                const rows = await fetchSheetData(auth.token, spreadsheetId, fullArg);
                if (rows.length === 0) {
                    console.log("No data found.");
                } else {
                    console.table(rows);
                }
            } catch (e: any) {
                console.error(`Error: ${e.message}`);
            }
        } else if (command === "scan") {
            let configStr = "";
            let range = "";
            let isAutoDetect = false;

            if (!fullArg) {
                // Interactive Mode
                const modeResponse = await rl.question("Do you want to provide a JSON config or auto-detect from a range? (config/auto): ");
                if (modeResponse.toLowerCase().includes("auto")) {
                    isAutoDetect = true;
                    range = await rl.question("Enter Range (e.g. Sheet1!A1:Z): ");
                } else {
                    configStr = await rl.question("Enter JSON Config (e.g. [{\"label\":\"Col1\", \"key\":\"k1\"}]): ");
                    range = await rl.question("Enter Range (e.g. Sheet1!A1:Z): ");
                }
            } else {
                // Argument provided
                if (fullArg.trim().startsWith("[")) {
                    // Manual Mode with Config
                    const lastBracket = fullArg.lastIndexOf("]");
                    if (lastBracket !== -1) {
                        configStr = fullArg.substring(0, lastBracket + 1).trim();
                        range = fullArg.substring(lastBracket + 1).trim();
                    } else {
                        console.error("Invalid JSON config format.");
                        continue;
                    }
                } else {
                    // One argument Mode -> Auto-detect
                    isAutoDetect = true;
                    range = fullArg.trim();
                }
            }

            try {
                console.log(`Scanning range '${range}'...`);
                const rawData = await fetchSheetData(auth.token, spreadsheetId, range);
                
                if (!rawData || rawData.length < 1) {
                    console.log("No data found.");
                    continue;
                }

                const rawHeaders = rawData[0];
                let mappingConfig: any[] = [];

                if (isAutoDetect) {
                    console.log("Auto-detecting config from headers...");
                    mappingConfig = rawHeaders.map(h => ({
                        label: h,
                        key: normalizeHeader(h)
                    }));
                    console.log("Generated Config:");
                    console.log(JSON.stringify(mappingConfig, null, 2));
                    console.log("----------------------------------------");
                } else {
                    mappingConfig = JSON.parse(configStr);
                }

                if (!Array.isArray(mappingConfig)) {
                    throw new Error("Config must be a JSON array.");
                }

                if (rawData.length < 2) {
                    console.log("Only headers found, no data rows.");
                    continue;
                }

                const sheetHeaders = rawHeaders.map(h => normalizeHeader(h));
                const dataRows = rawData.slice(1);

                const results = dataRows.map((row, i) => {
                    const parameters: Record<string, any> = {};
                    
                    mappingConfig.forEach((mapItem: any) => {
                        const { label, key } = mapItem;
                        if (label && key) {
                            const target = normalizeHeader(label);
                            const colIndex = sheetHeaders.indexOf(target);
                            if (colIndex !== -1) {
                                parameters[key] = row[colIndex];
                            }
                        }
                    });

                    return {
                        _row: i + 2, // 1-based index, +1 for header
                        ...parameters
                    };
                });

                console.log(`Found ${results.length} rows.`);
                console.table(results);

            } catch (e: any) {
                console.error(`Error during scan: ${e.message}`);
            }
        } else if (command === "edit") {
            if (args.length < 2) {
                console.log("Usage: edit <range> <value>");
                continue;
            }

            let range = "";
            let value = "";

            // Heuristic to handle spaces in sheet names without requiring quotes.
            // Google Sheets ranges usually contain '!' separating sheet name and cell/range.
            // We search for the argument containing '!' to identify where the range ends.
            // We refine this by ensuring '!' is not the last character (which might be part of a value like "Hello!")
            // and that there is at least one argument following it (the value).
            const splitIndex = args.findIndex((arg, i) => 
                arg.includes("!") && 
                !arg.endsWith("!") && 
                i < args.length - 1
            );

            if (splitIndex !== -1) {
                // Range is everything up to splitIndex joined by spaces
                range = args.slice(0, splitIndex + 1).join(" ");
                // Value is everything after
                value = args.slice(splitIndex + 1).join(" ");
            } else {
                // Fallback: Assume first arg is range (e.g. A1) if no suitable '!' found
                range = args[0];
                value = args.slice(1).join(" ");
            }
            
            try {
                console.log(`Updating ${range} with value: "${value}"...`);
                await updateSheetData(auth.token, spreadsheetId, range, [[value]]);
                console.log("Update successful.");
            } catch (e: any) {
                console.error(`Error: ${e.message}`);
            }
        } else if (command === "") {
            continue;
        } else if (command === "url") {
            console.log(`Current ID: ${spreadsheetId}`);
        } else if (command === "change") {
             const answer = await rl.question("Enter new Spreadsheet URL or ID: ");
             const id = extractSpreadsheetId(answer.trim());
             if (id) {
                 spreadsheetId = id;
                 console.log(`Target updated to: ${spreadsheetId}`);
             } else {
                 console.log("Invalid ID.");
             }
        } else {
            console.log("Unknown command. Type 'help' for options.");
        }
    }

    rl.close();
};

main().catch(console.error);
