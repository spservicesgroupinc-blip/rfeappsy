// IMPORTANT: PASTE CONTENTS OF SharedCore.js HERE

/**
 * SERVICE 3: RFE_Media_Service
 * Purpose: Heavy Compute / Async / No Locks
 */

function doPost(e) {
    // NO LOCK: These operations are isolated and take time (10s+). 
    // We do NOT want to block Login/Ops.

    let req;
    try {
        if (!e?.postData) throw new Error("No payload.");
        req = JSON.parse(e.postData.contents);
    } catch (parseEr) {
        return sendResponse('error', "Invalid Request");
    }

    const { action, payload } = req;

    // Safety check just in case multiple heavy uploads hit at EXACT same millisecond?
    // GAS handles concurrent executions fine up to 30.
    // If we reach 30, it fails fast. Better than waiting 30s.

    try {
        if (!payload.spreadsheetId && action !== 'UPLOAD_IMAGE') {
            // UPLOAD_IMAGE might fallback to Root Folder if no SS ID provided, but usually we send it.
        }

        // Helper to get SS if needed
        const getSS = () => {
            if (!payload.spreadsheetId) throw new Error("Media Service: Missing Sheet ID for DB access");
            return SpreadsheetApp.openById(payload.spreadsheetId);
        };

        let result;
        switch (action) {
            case 'SAVE_PDF':
                result = handleSavePdf(getSS(), payload);
                break;
            case 'UPLOAD_IMAGE':
                result = handleUploadImage(payload.spreadsheetId ? getSS() : null, payload);
                break;
            case 'CREATE_WORK_ORDER':
                result = handleCreateWorkOrder(getSS(), payload);
                break;
            default:
                throw new Error(`Unknown Media Action: ${action}`);
        }
        return sendResponse('success', result);
    } catch (error) {
        console.error("Media API Error", error);
        return sendResponse('error', error.toString());
    }
}

// --- HANDLERS ---

function handleSavePdf(ss, p) {
    const parentFolder = p.folderId ? DriveApp.getFolderById(p.folderId) : DriveApp.getRootFolder();
    const blob = Utilities.newBlob(Utilities.base64Decode(p.base64Data.split(',')[1]), MimeType.PDF, p.fileName);
    const file = parentFolder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }
    const url = file.getUrl();
    if (p.estimateId) {
        const s = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES);
        const fd = s.getRange("A:A").createTextFinder(p.estimateId).matchEntireCell(true).findNext();
        if (fd) {
            s.getRange(fd.getRow(), 8).setValue(url);
            try {
                const j = safeParse(s.getRange(fd.getRow(), CONSTANTS.COL_JSON_ESTIMATE).getValue());
                if (j) {
                    if (p.fileName.toLowerCase().includes('invoice')) j.invoicePdfLink = url;
                    else if (p.fileName.toLowerCase().includes('completion') || p.fileName.toLowerCase().includes('report')) j.completionReportLink = url;
                    else j.pdfLink = url;
                    s.getRange(fd.getRow(), CONSTANTS.COL_JSON_ESTIMATE).setValue(JSON.stringify(j));
                }
            } catch (e) { }
        }
    }
    markSystemDirty(ss.getId());
    return { success: true, url: url };
}

function handleUploadImage(ss, payload) {
    const { base64Data, folderId, fileName } = payload;
    let targetFolder;
    if (folderId) { try { targetFolder = DriveApp.getFolderById(folderId); } catch (e) { console.error("Invalid Folder ID", e); } }

    // If no folder ID, try to find "Job Photos" in SS parent
    if (!targetFolder && ss) {
        try {
            const ssFile = DriveApp.getFileById(ss.getId());
            const parents = ssFile.getParents();
            if (parents.hasNext()) targetFolder = parents.next();
        } catch (e) { console.error("Could not find parent folder", e); }
    }
    if (!targetFolder) targetFolder = DriveApp.getRootFolder();

    const photoFolderName = "Job Photos";
    const subFolders = targetFolder.getFoldersByName(photoFolderName);
    let photoFolder = subFolders.hasNext() ? subFolders.next() : targetFolder.createFolder(photoFolderName);

    const encoded = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const decoded = Utilities.base64Decode(encoded);
    const blob = Utilities.newBlob(decoded, MimeType.JPEG, fileName || `photo_${new Date().getTime()}.jpg`);
    const file = photoFolder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }
    const fileId = file.getId();
    const directUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`; // High res thumbnail
    return { url: directUrl, fileId: fileId };
}

function handleCreateWorkOrder(ss, p) {
    let parentFolder;
    try { parentFolder = p.folderId ? DriveApp.getFolderById(p.folderId) : DriveApp.getRootFolder(); } catch (e) { parentFolder = DriveApp.getRootFolder(); }
    const est = p.estimateData;
    const safeName = est.customer?.name ? est.customer.name.replace(/[^a-zA-Z0-9 ]/g, "") : "Unknown";
    const name = `WO-${est.id.slice(0, 8).toUpperCase()} - ${safeName}`;
    const newSheet = SpreadsheetApp.create(name);
    try { DriveApp.getFileById(newSheet.getId()).moveTo(parentFolder); } catch (e) { }
    try {
        const logTab = newSheet.insertSheet("Daily Crew Log");
        logTab.appendRow(["Date", "Tech Name", "Start Time", "End Time", "Duration (Hrs)", "Sets Sprayed", "Notes"]);
        logTab.setFrozenRows(1);
        const infoSheet = newSheet.insertSheet("Job Details");
        if (newSheet.getSheetByName("Sheet1")) newSheet.deleteSheet(newSheet.getSheetByName("Sheet1"));
        const cust = est.customer || {};
        infoSheet.getRange("A1").setValue("CUSTOMER INFO").setFontWeight("bold").setBackground("#E30613").setFontColor("white");
        infoSheet.getRange("A2").setValue("Name:"); infoSheet.getRange("B2").setValue(cust.name || "");
        infoSheet.getRange("A3").setValue("Address:"); infoSheet.getRange("B3").setValue(`${cust.address || ""}, ${cust.city || ""} ${cust.state || ""} ${cust.zip || ""}`);
        infoSheet.getRange("A4").setValue("Phone:"); infoSheet.getRange("B4").setValue(cust.phone || "");
        infoSheet.getRange("A7").setValue("JOB SCOPE").setFontWeight("bold").setBackground("#E30613").setFontColor("white");
        let row = 8;
        if (est.results?.totalWallArea > 0) { infoSheet.getRange(row, 1).setValue("Walls:"); infoSheet.getRange(row, 2).setValue(`${est.wallSettings?.type || "Foam"} (${est.wallSettings?.thickness || 0}")`); infoSheet.getRange(row, 3).setValue(`${Math.round(est.results.totalWallArea)} sqft`); row++; }
        if (est.results?.totalRoofArea > 0) { infoSheet.getRange(row, 1).setValue("Roof:"); infoSheet.getRange(row, 2).setValue(`${est.roofSettings?.type || "Foam"} (${est.roofSettings?.thickness || 0}")`); infoSheet.getRange(row, 3).setValue(`${Math.round(est.results.totalRoofArea)} sqft`); row++; }
        row++; infoSheet.getRange(row, 1).setValue("MATERIALS LOAD LIST").setFontWeight("bold").setBackground("#E30613").setFontColor("white"); row++;
        if (est.materials?.openCellSets > 0) { infoSheet.getRange(row, 1).setValue("Open Cell Sets:"); infoSheet.getRange(row, 2).setValue(Number(est.materials.openCellSets).toFixed(2)); row++; }
        if (est.materials?.closedCellSets > 0) { infoSheet.getRange(row, 1).setValue("Closed Cell Sets:"); infoSheet.getRange(row, 2).setValue(Number(est.materials.closedCellSets).toFixed(2)); row++; }
        if (est.materials?.inventory && Array.isArray(est.materials.inventory)) { est.materials.inventory.forEach(i => { infoSheet.getRange(row, 1).setValue(i.name || "Item"); infoSheet.getRange(row, 2).setValue(`${i.quantity || 0} ${i.unit || ""}`); row++; }); }
        if (est.materials?.equipment && Array.isArray(est.materials.equipment)) { row++; infoSheet.getRange(row, 1).setValue("EQUIPMENT ASSIGNED").setFontWeight("bold").setBackground("#E30613").setFontColor("white"); row++; est.materials.equipment.forEach(e => { infoSheet.getRange(row, 1).setValue(e.name || "Tool"); infoSheet.getRange(row, 2).setValue("Assigned"); row++; }); }
        row++; infoSheet.getRange(row, 1).setValue("JOB NOTES").setFontWeight("bold").setBackground("#E30613").setFontColor("white"); row++; infoSheet.getRange(row, 1).setValue(est.notes || "No notes.");
        infoSheet.autoResizeColumns(1, 3);
    } catch (err) { console.error("Error populating work order sheet: " + err.toString()); }

    // Deduct Inventory upon WO Creation
    try {
        const estSheet = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES);
        const finder = estSheet.getRange("A:A").createTextFinder(est.id).matchEntireCell(true).findNext();
        if (finder) {
            const row = finder.getRow();
            if (!est.inventoryDeducted) {
                const setSheet = ss.getSheetByName(CONSTANTS.TAB_SETTINGS);
                let countRow = -1;
                let counts = { openCellSets: 0, closedCellSets: 0 };
                const setRows = setSheet.getDataRange().getValues();
                for (let i = 0; i < setRows.length; i++) {
                    if (setRows[i][0] === 'warehouse_counts' || setRows[i][0] === 'warehouse') {
                        counts = safeParse(setRows[i][1]) || counts;
                        countRow = i + 1;
                    }
                }
                const estOc = Number(est.materials?.openCellSets) || 0;
                const estCc = Number(est.materials?.closedCellSets) || 0;
                if (countRow !== -1) {
                    counts.openCellSets = (counts.openCellSets || 0) - estOc;
                    counts.closedCellSets = (counts.closedCellSets || 0) - estCc;
                    setSheet.getRange(countRow, 2).setValue(JSON.stringify(counts));
                }
                const deductedItems = [];
                if (est.materials?.inventory && Array.isArray(est.materials.inventory)) {
                    updateInventoryWithLog(ss, est.materials.inventory, false, est.id, est.customer?.name, "System (Work Order)");
                    est.materials.inventory.forEach(item => { deductedItems.push({ id: item.id, quantity: item.quantity, name: item.name }); });
                }
                est.inventoryDeducted = true;
                est.deductedValues = { openCellSets: estOc, closedCellSets: estCc, inventory: deductedItems };
                estSheet.getRange(row, CONSTANTS.COL_JSON_ESTIMATE).setValue(JSON.stringify(est));
            }
        }
    } catch (e) { console.error("Error deducting inventory on WO creation: " + e.toString()); }

    markSystemDirty(ss.getId());
    return { url: newSheet.getUrl() };
}
