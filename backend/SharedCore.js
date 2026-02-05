/**
 * SHARED CORE - RFE APP BACKEND
 * COPY THIS BLOCK INTO THE TOP OF EVERY SCRIPT (Auth, Ops, Media)
 */

const CONSTANTS = {
    ROOT_FOLDER_NAME: "RFE App Data",
    MASTER_DB_NAME: "RFE Master Login DB",
    TAB_ESTIMATES: "Estimates_DB",
    TAB_CUSTOMERS: "Customers_DB",
    TAB_SETTINGS: "Settings_DB",
    TAB_INVENTORY: "Inventory_DB",
    TAB_EQUIPMENT: "Equipment_DB",
    TAB_MESSAGES: "Messages_DB",
    TAB_PNL: "Profit_Loss_DB",
    TAB_LOGS: "Material_Log_DB",
    COL_JSON_ESTIMATE: 9,
    COL_JSON_CUSTOMER: 10,
    COL_JSON_INVENTORY: 6,
    COL_JSON_EQUIPMENT: 4
};

const SECRET_SALT = "rfe_salt_v1";

const safeParse = (str) => {
    if (!str || str === "") return null;
    try { return JSON.parse(str); } catch (e) { return null; }
};

function sendResponse(status, data) {
    return ContentService.createTextOutput(JSON.stringify({ status, [status === 'success' ? 'data' : 'message']: data })).setMimeType(ContentService.MimeType.JSON);
}

function generateToken(username, role) {
    const expiry = new Date().getTime() + (1000 * 60 * 60 * 24 * 7);
    const data = `${username}:${role}:${expiry}`;
    const signature = Utilities.base64Encode(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, data, SECRET_SALT));
    return Utilities.base64Encode(`${data}::${signature}`);
}

function validateToken(token) {
    if (!token) return null;
    try {
        const decoded = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
        const parts = decoded.split("::");
        if (parts.length !== 2) return null;
        const data = parts[0];
        const signature = parts[1];
        const expectedSig = Utilities.base64Encode(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, data, SECRET_SALT));
        if (signature !== expectedSig) return null;
        const [user, role, expiry] = data.split(":");
        if (new Date().getTime() > parseInt(expiry)) return null;
        return { username: user, role: role };
    } catch (e) { return null; }
}

function hashPassword(p) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p + "rfe_salt_v1")); }

function getRootFolder() {
    const folders = DriveApp.getFoldersByName(CONSTANTS.ROOT_FOLDER_NAME);
    if (folders.hasNext()) return folders.next();
    return DriveApp.createFolder(CONSTANTS.ROOT_FOLDER_NAME);
}

function getMasterSpreadsheet() {
    const root = getRootFolder();
    const files = root.getFilesByName(CONSTANTS.MASTER_DB_NAME);
    if (files.hasNext()) return SpreadsheetApp.open(files.next());
    const ss = SpreadsheetApp.create(CONSTANTS.MASTER_DB_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(root);
    ensureSheet(ss, "Users_DB", ["Username", "PasswordHash", "CompanyName", "SpreadsheetID", "FolderID", "CreatedAt", "CrewCode", "Email"]);
    ensureSheet(ss, "Trial_Memberships", ["Name", "Email", "Phone", "Timestamp"]);
    return ss;
}

function ensureSheet(ss, n, h) {
    let s = ss.getSheetByName(n);
    if (!s) {
        s = ss.insertSheet(n);
        s.appendRow(h);
        s.setFrozenRows(1);
        s.getRange(1, 1, 1, h.length).setFontWeight("bold");
    }
    return s;
}

function setupUserSheetSchema(ss, initialProfile) {
    ensureSheet(ss, CONSTANTS.TAB_CUSTOMERS, ["ID", "Name", "Address", "City", "State", "Zip", "Phone", "Email", "Status", "JSON_DATA"]);
    ensureSheet(ss, CONSTANTS.TAB_ESTIMATES, ["ID", "Date", "Customer", "Total Value", "Status", "Invoice #", "Material Cost", "PDF Link", "JSON_DATA"]);
    ensureSheet(ss, CONSTANTS.TAB_INVENTORY, ["ID", "Name", "Quantity", "Unit", "Unit Cost", "JSON_DATA"]);
    ensureSheet(ss, CONSTANTS.TAB_EQUIPMENT, ["ID", "Name", "Status", "JSON_DATA"]);
    const settingsSheet = ensureSheet(ss, CONSTANTS.TAB_SETTINGS, ["Config_Key", "JSON_Value"]);
    if (initialProfile && settingsSheet.getLastRow() === 1) {
        settingsSheet.appendRow(['companyProfile', JSON.stringify(initialProfile)]);
        settingsSheet.appendRow(['warehouse_counts', JSON.stringify({ openCellSets: 0, closedCellSets: 0 })]);
        settingsSheet.appendRow(['lifetime_usage', JSON.stringify({ openCell: 0, closedCell: 0 })]);
        settingsSheet.appendRow(['costs', JSON.stringify({ openCell: 2000, closedCell: 2600, laborRate: 85 })]);
        settingsSheet.appendRow(['yields', JSON.stringify({ openCell: 16000, closedCell: 4000, openCellStrokes: 6600, closedCellStrokes: 6600 })]);
    }
    ensureSheet(ss, CONSTANTS.TAB_PNL, ["Date Paid", "Job ID", "Customer", "Invoice #", "Revenue", "Chem Cost", "Labor Cost", "Inv Cost", "Misc Cost", "Total COGS", "Net Profit", "Margin %"]);
    ensureSheet(ss, CONSTANTS.TAB_LOGS, ["Date", "Job ID", "Customer", "Material Name", "Quantity", "Unit", "Logged By", "JSON_DATA"]);
    ensureSheet(ss, CONSTANTS.TAB_MESSAGES, ["ID", "Estimate ID", "Sender", "Content", "Timestamp", "Read Info", "JSON_DATA"]);
    const sheet1 = ss.getSheetByName("Sheet1");
    if (sheet1) ss.deleteSheet(sheet1);
}

function markSystemDirty(ssId) {
    try {
        const cache = CacheService.getScriptCache();
        if (ssId) {
            cache.put(`DIRTY_${ssId}`, new Date().getTime().toString(), 21600);
        }
    } catch (e) {
        console.error("Cache Error", e);
    }
}

function updateInventoryWithLog(ss, itemsToDeduct, isAddBack, jobId, customerName, techName) {
    if (!itemsToDeduct || itemsToDeduct.length === 0) return;
    const invSheet = ss.getSheetByName(CONSTANTS.TAB_INVENTORY);
    const logSheet = ss.getSheetByName(CONSTANTS.TAB_LOGS);
    const data = invSheet.getDataRange().getValues();
    const itemMap = new Map();
    for (let i = 1; i < data.length; i++) {
        itemMap.set(String(data[i][0]).trim(), i + 1);
    }
    itemsToDeduct.forEach(item => {
        const itemId = String(item.id).trim();
        let rowIdx = itemMap.get(itemId);
        const itemName = item.name || "Unknown Item";
        if (!rowIdx) {
            console.error(`INVENTORY ERROR: Item ID not found: ${itemId} (${itemName})`);
            logSheet.appendRow([new Date(), jobId, customerName, `ERROR: Item not found (ID: ${itemId})`, 0, "-", "SYSTEM_ERROR", JSON.stringify({ error: 'ITEM_ID_NOT_FOUND', itemId, itemName })]);
            return;
        }
        const qty = Number(item.quantity) || 0;
        if (rowIdx && qty > 0) {
            const jsonCell = invSheet.getRange(rowIdx, CONSTANTS.COL_JSON_INVENTORY);
            const currentJson = safeParse(jsonCell.getValue());
            if (currentJson) {
                if (isAddBack) currentJson.quantity = (currentJson.quantity || 0) + qty;
                else currentJson.quantity = (currentJson.quantity || 0) - qty;
                invSheet.getRange(rowIdx, 3).setValue(currentJson.quantity);
                jsonCell.setValue(JSON.stringify(currentJson));
                const action = isAddBack ? "Restock (Adjustment)" : "Deduction";
                logSheet.appendRow([new Date(), jobId, customerName, itemName, isAddBack ? qty : -qty, item.unit || "", techName, JSON.stringify({ action, itemId, qty })]);
            }
        }
    });
}
