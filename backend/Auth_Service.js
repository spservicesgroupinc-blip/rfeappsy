// IMPORTANT: PASTE CONTENTS OF SharedCore.js HERE

/**
 * SERVICE 1: RFE_Auth_Service
 * Purpose: High Speed / No Locks (Reads)
 */

function doPost(e) {
    const lock = LockService.getScriptLock();
    let req;
    try {
        if (!e?.postData) throw new Error("No payload.");
        req = JSON.parse(e.postData.contents);
    } catch (parseEr) {
        return sendResponse('error', "Invalid Request");
    }

    const { action, payload } = req;

    // LOCK STRATEGY: 
    // - HEARTBEAT/SYNC_DOWN: NO LOCK (Concurred Reads)
    // - SIGNUP/LOGIN: Minimal Lock just to be safe or NO lock if just reading DB
    // - SIGNUP writes to Master DB, so we use a lock there.

    if (action === 'SIGNUP' || action === 'UPDATE_PASSWORD') {
        if (!lock.tryLock(10000)) return sendResponse('error', 'Server busy (Auth).');
    }

    try {
        let result;
        if (action === 'LOGIN') result = handleLogin(payload);
        else if (action === 'SIGNUP') result = handleSignup(payload);
        else if (action === 'CREW_LOGIN') result = handleCrewLogin(payload);
        else if (action === 'SUBMIT_TRIAL') result = handleSubmitTrial(payload);
        else if (action === 'UPDATE_PASSWORD') result = handleUpdatePassword(payload);
        else if (action === 'HEARTBEAT') {
            // Stateless read, no lock needed
            if (!payload.spreadsheetId) throw new Error("Missing Sheet ID");
            const userSS = SpreadsheetApp.openById(payload.spreadsheetId);
            result = handleHeartbeat(userSS, payload);
        }
        else if (action === 'SYNC_DOWN') {
            // Stateless read
            if (!payload.spreadsheetId) throw new Error("Missing Sheet ID");
            const userSS = SpreadsheetApp.openById(payload.spreadsheetId);
            result = handleSyncDown(userSS);
        }
        else {
            throw new Error(`Unknown Auth Action: ${action}`);
        }
        return sendResponse('success', result);
    } catch (error) {
        console.error("Auth API Error", error);
        return sendResponse('error', error.toString());
    } finally {
        lock.releaseLock();
    }
}

// --- SPECIFIC HANDLERS ---

function handleLogin(p) {
    const ss = getMasterSpreadsheet();
    const sh = ss.getSheetByName("Users_DB");
    const f = sh.getRange("A:A").createTextFinder(p.username.trim()).matchEntireCell(true).findNext();
    if (!f) throw new Error("User not found.");
    const r = f.getRow();
    const d = sh.getRange(r, 1, 1, 7).getValues()[0];
    if (String(d[1]) !== hashPassword(p.password)) throw new Error("Incorrect password.");
    return { username: d[0], companyName: d[2], spreadsheetId: d[3], folderId: d[4], role: 'admin', token: generateToken(d[0], 'admin') };
}

function handleCrewLogin(p) {
    const ss = getMasterSpreadsheet();
    const sh = ss.getSheetByName("Users_DB");
    const f = sh.getRange("A:A").createTextFinder(p.username.trim()).matchEntireCell(true).findNext();
    if (!f) throw new Error("Company ID not found.");
    const r = f.getRow();
    const d = sh.getRange(r, 1, 1, 7).getValues()[0];
    if (String(d[6]).trim() !== String(p.pin).trim()) throw new Error("Invalid Crew PIN.");
    return { username: d[0], companyName: d[2], spreadsheetId: d[3], folderId: d[4], role: 'crew', token: generateToken(d[0], 'crew') };
}

function handleSignup(p) {
    const ss = getMasterSpreadsheet();
    const sh = ss.getSheetByName("Users_DB");
    const e = sh.getRange("A:A").createTextFinder(p.username.trim()).matchEntireCell(true).findNext();
    if (e) throw new Error("Username already taken.");
    const crewPin = Math.floor(1000 + Math.random() * 9000).toString();
    const r = createCompanyResources(p.companyName, p.username, crewPin, p.email);
    sh.appendRow([p.username.trim(), hashPassword(p.password), p.companyName, r.ssId, r.folderId, new Date(), crewPin, p.email]);
    return { username: p.username, companyName: p.companyName, spreadsheetId: r.ssId, folderId: r.folderId, role: 'admin', token: generateToken(p.username, 'admin'), crewPin: crewPin };
}

function createCompanyResources(companyName, username, crewPin, email) {
    const root = getRootFolder();
    const safeName = companyName.replace(/[^a-zA-Z0-9 ]/g, "").trim();
    const companyFolder = root.createFolder(`${safeName} Data`);
    const ss = SpreadsheetApp.create(`${companyName} - Master Data`);
    DriveApp.getFileById(ss.getId()).moveTo(companyFolder);
    const initialProfile = { companyName: companyName, crewAccessPin: crewPin, email: email || "", phone: "", addressLine1: "", addressLine2: "", city: "", state: "", zip: "", website: "", logoUrl: "" };
    setupUserSheetSchema(ss, initialProfile);
    return { ssId: ss.getId(), folderId: companyFolder.getId() };
}

function handleSubmitTrial(p) { getMasterSpreadsheet().getSheetByName("Trial_Memberships").appendRow([p.name, p.email, p.phone, new Date()]); return { success: true }; }

function handleUpdatePassword(p) {
    const ss = getMasterSpreadsheet();
    const sh = ss.getSheetByName("Users_DB");
    const f = sh.getRange("A:A").createTextFinder(p.username.trim()).matchEntireCell(true).findNext();
    if (!f) throw new Error("User not found.");
    const r = f.getRow();
    const currentHash = sh.getRange(r, 2).getValue();
    if (String(currentHash) !== hashPassword(p.currentPassword)) throw new Error("Incorrect current password.");
    sh.getRange(r, 2).setValue(hashPassword(p.newPassword));
    return { success: true };
}

function handleSyncDown(ss) {
    setupUserSheetSchema(ss, null);
    const getSheetData = (name, jsonCol) => {
        const s = ss.getSheetByName(name);
        if (!s || s.getLastRow() <= 1) return [];
        const range = s.getRange(2, jsonCol, s.getLastRow() - 1, 1);
        const values = range.getValues();
        return values.map(r => safeParse(r[0])).filter(Boolean);
    };
    const settings = {};
    const setSheet = ss.getSheetByName(CONSTANTS.TAB_SETTINGS);
    if (setSheet && setSheet.getLastRow() > 1) {
        const data = setSheet.getRange(2, 1, setSheet.getLastRow() - 1, 2).getValues();
        data.forEach(row => { if (row[0] && row[1]) settings[row[0]] = safeParse(row[1]); });
    }
    let foamCounts = { openCellSets: 0, closedCellSets: 0 };
    if (settings['warehouse_counts']) foamCounts = settings['warehouse_counts'];
    else if (settings['warehouse']) foamCounts = settings['warehouse'];

    const lifetimeUsage = settings['lifetime_usage'] || { openCell: 0, closedCell: 0 };
    const inventoryItems = getSheetData(CONSTANTS.TAB_INVENTORY, CONSTANTS.COL_JSON_INVENTORY);
    const equipmentItems = getSheetData(CONSTANTS.TAB_EQUIPMENT, CONSTANTS.COL_JSON_EQUIPMENT);

    const assembledWarehouse = {
        openCellSets: Number(foamCounts.openCellSets || 0),
        closedCellSets: Number(foamCounts.closedCellSets || 0),
        items: inventoryItems || []
    };
    const savedEstimates = getSheetData(CONSTANTS.TAB_ESTIMATES, CONSTANTS.COL_JSON_ESTIMATE);
    const customers = getSheetData(CONSTANTS.TAB_CUSTOMERS, CONSTANTS.COL_JSON_CUSTOMER);
    let materialLogs = [];
    const logSheet = ss.getSheetByName(CONSTANTS.TAB_LOGS);
    if (logSheet && logSheet.getLastRow() > 1) {
        const d = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 8).getValues();
        materialLogs = d.map(r => safeParse(r[7])).filter(Boolean);
    }
    return { ...settings, warehouse: assembledWarehouse, lifetimeUsage, equipment: equipmentItems, savedEstimates, customers, materialLogs };
}

function handleHeartbeat(ss, payload) {
    const { lastSyncTimestamp } = payload;
    const lastSync = lastSyncTimestamp ? new Date(lastSyncTimestamp).getTime() : 0;

    // 1. Get Job Updates
    const estSheet = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES);
    const estData = estSheet.getDataRange().getValues();
    const jobUpdates = [];

    for (let i = 1; i < estData.length; i++) {
        const jsonColIndex = CONSTANTS.COL_JSON_ESTIMATE - 1;
        if (estData[i].length <= jsonColIndex) continue;
        const json = estData[i][jsonColIndex];
        if (!json) continue;
        const obj = safeParse(json);
        if (obj) {
            const modTime = obj.lastModified ? new Date(obj.lastModified).getTime() : 0;
            const startAt = obj.actuals?.lastStartedAt ? new Date(obj.actuals.lastStartedAt).getTime() : 0;
            if (modTime > lastSync || startAt > lastSync || obj.executionStatus === 'In Progress') {
                jobUpdates.push(obj);
            }
        }
    }

    // 2. Warehouse & Lifetime
    const setSheet = ss.getSheetByName(CONSTANTS.TAB_SETTINGS);
    const setRows = setSheet.getDataRange().getValues();
    let foamCounts = { openCellSets: 0, closedCellSets: 0 };
    let lifeStats = { openCell: 0, closedCell: 0 };
    for (let i = 0; i < setRows.length; i++) {
        if (setRows[i][0] === 'warehouse_counts' || setRows[i][0] === 'warehouse') foamCounts = safeParse(setRows[i][1]) || foamCounts;
        if (setRows[i][0] === 'lifetime_usage') lifeStats = safeParse(setRows[i][1]) || lifeStats;
    }
    const iSheet = ss.getSheetByName(CONSTANTS.TAB_INVENTORY);
    let inventoryItems = [];
    if (iSheet && iSheet.getLastRow() > 1) {
        const iData = iSheet.getRange(2, CONSTANTS.COL_JSON_INVENTORY, iSheet.getLastRow() - 1, 1).getValues();
        inventoryItems = iData.map(r => safeParse(r[0])).filter(Boolean);
    }
    const warehouseData = { openCellSets: foamCounts.openCellSets || 0, closedCellSets: foamCounts.closedCellSets || 0, items: inventoryItems };

    // 3. Messages (Partial)
    const msgSheet = ensureSheet(ss, CONSTANTS.TAB_MESSAGES, ["ID", "Estimate ID", "Sender", "Content", "Timestamp", "Read Info", "JSON_DATA"]);
    const lastRow = msgSheet.getLastRow();
    const startRow = Math.max(2, lastRow - 200);
    const numRows = lastRow - startRow + 1;
    let newMessages = [];
    if (numRows > 0) {
        const msgData = msgSheet.getRange(startRow, 1, numRows, msgSheet.getLastColumn()).getValues();
        for (let i = msgData.length - 1; i >= 0; i--) {
            if (new Date(msgData[i][4]).getTime() > lastSync) {
                const obj = safeParse(msgData[i][6]);
                if (obj) newMessages.unshift(obj);
            } else break;
        }
    }

    // 4. Logs (Partial)
    const logSheet = ensureSheet(ss, CONSTANTS.TAB_LOGS, ["Date", "Job ID", "Customer", "Material Name", "Quantity", "Unit", "Logged By", "JSON_DATA"]);
    const logLastRow = logSheet.getLastRow();
    const logStartRow = Math.max(2, logLastRow - 200);
    const logNumRows = logLastRow - logStartRow + 1;
    let newMaterialLogs = [];
    if (logNumRows > 0) {
        const logData = logSheet.getRange(logStartRow, 1, logNumRows, logSheet.getLastColumn()).getValues();
        for (let i = logData.length - 1; i >= 0; i--) {
            if (new Date(logData[i][0]).getTime() > lastSync) {
                const obj = safeParse(logData[i][7]);
                if (obj) newMaterialLogs.unshift(obj);
            } else break;
        }
    }

    return { jobUpdates, messages: newMessages, warehouse: warehouseData, materialLogs: newMaterialLogs, lifetimeUsage: lifeStats, serverTime: new Date().toISOString() };
}
