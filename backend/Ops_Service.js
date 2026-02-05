// IMPORTANT: PASTE CONTENTS OF SharedCore.js HERE

/**
 * SERVICE 2: RFE_Ops_Service
 * Purpose: Transactional / Strict Locks
 */

function doPost(e) {
    const lock = LockService.getScriptLock();
    // STRICT LOCK: Wait up to 30s to ensure sequential writing
    if (!lock.tryLock(30000)) return sendResponse('error', 'Server busy (Ops). Please try again.');

    let req;
    try {
        if (!e?.postData) throw new Error("No payload.");
        req = JSON.parse(e.postData.contents);
    } catch (parseEr) {
        lock.releaseLock();
        return sendResponse('error', "Invalid Request");
    }

    const { action, payload } = req;
    try {
        if (!payload.spreadsheetId) throw new Error("Ops Internal Error: Missing Sheet ID");
        const userSS = SpreadsheetApp.openById(payload.spreadsheetId);
        let result;

        switch (action) {
            case 'SYNC_UP': result = handleSyncUp(userSS, payload); break;
            case 'START_JOB': result = handleStartJob(userSS, payload); break;
            case 'COMPLETE_JOB': result = handleCompleteJob(userSS, payload); break;
            case 'MARK_JOB_PAID': result = handleMarkJobPaid(userSS, payload); break;
            case 'DELETE_ESTIMATE': result = handleDeleteEstimate(userSS, payload); break;
            case 'LOG_TIME': result = handleLogTime(payload); break;
            case 'SEND_MESSAGE': result = handleSendMessage(userSS, payload); break;
            default: throw new Error(`Unknown Ops Action: ${action}`);
        }
        return sendResponse('success', result);
    } catch (error) {
        console.error("Ops API Error", error);
        return sendResponse('error', error.toString());
    } finally {
        lock.releaseLock();
    }
}

// --- HANDLERS ---

function handleSyncUp(ss, payload) {
    const { state } = payload;
    reconcileCompletedJobs(ss, state);
    setupUserSheetSchema(ss, null);

    // Save Settings
    const settingsKeys = ['companyProfile', 'yields', 'costs', 'expenses', 'jobNotes', 'purchaseOrders', 'sqFtRates', 'pricingMode', 'lifetimeUsage'];
    const sSheet = ss.getSheetByName(CONSTANTS.TAB_SETTINGS);
    const existingData = sSheet.getDataRange().getValues();
    const settingsMap = new Map();
    existingData.forEach(r => settingsMap.set(r[0], r[1]));
    settingsKeys.forEach(key => { if (state[key] !== undefined) settingsMap.set(key, JSON.stringify(state[key])); });

    // Warehouse Counts
    if (state.warehouse) {
        const counts = {
            openCellSets: Number(state.warehouse.openCellSets || 0),
            closedCellSets: Number(state.warehouse.closedCellSets || 0)
        };
        settingsMap.set('warehouse_counts', JSON.stringify(counts));

        // Sync Inventory Items
        if (state.warehouse.items && Array.isArray(state.warehouse.items)) {
            const iSheet = ss.getSheetByName(CONSTANTS.TAB_INVENTORY);
            if (iSheet.getLastRow() > 1) iSheet.getRange(2, 1, iSheet.getLastRow() - 1, iSheet.getLastColumn()).clearContent();
            const iRows = state.warehouse.items.map(i => [i.id, i.name, i.quantity, i.unit, i.unitCost || 0, JSON.stringify(i)]);
            if (iRows.length > 0) iSheet.getRange(2, 1, iRows.length, iRows[0].length).setValues(iRows);
        }
    }
    if (state.equipment && Array.isArray(state.equipment)) {
        const eSheet = ss.getSheetByName(CONSTANTS.TAB_EQUIPMENT);
        if (eSheet.getLastRow() > 1) eSheet.getRange(2, 1, eSheet.getLastRow() - 1, eSheet.getLastColumn()).clearContent();
        const eRows = state.equipment.map(e => [e.id, e.name, e.status, JSON.stringify(e)]);
        if (eRows.length > 0) eSheet.getRange(2, 1, eRows.length, eRows[0].length).setValues(eRows);
    }

    const outSettings = Array.from(settingsMap.entries()).filter(k => k[0] !== 'Config_Key');
    if (sSheet.getLastRow() > 1) sSheet.getRange(2, 1, sSheet.getLastRow() - 1, 2).clearContent();
    if (outSettings.length > 0) sSheet.getRange(2, 1, outSettings.length, 2).setValues(outSettings);

    if (state.customers && Array.isArray(state.customers) && state.customers.length > 0) {
        const cSheet = ss.getSheetByName(CONSTANTS.TAB_CUSTOMERS);
        if (cSheet.getLastRow() > 1) cSheet.getRange(2, 1, cSheet.getLastRow() - 1, cSheet.getLastColumn()).clearContent();
        const cRows = state.customers.map(c => [c.id || "", c.name || "", c.address || "", c.city || "", c.state || "", c.zip || "", c.phone || "", c.email || "", c.status || "Active", JSON.stringify(c)]);
        if (cRows.length) cSheet.getRange(2, 1, cRows.length, cRows[0].length).setValues(cRows);
    }
    if (state.savedEstimates && Array.isArray(state.savedEstimates) && state.savedEstimates.length > 0) {
        syncEstimatesWithLogic(ss, state.savedEstimates);
    }
    if (state.companyProfile?.crewAccessPin) {
        const master = getMasterSpreadsheet().getSheetByName("Users_DB");
        const finder = master.getRange("D:D").createTextFinder(ss.getId()).matchEntireCell(true).findNext();
        if (finder) master.getRange(finder.getRow(), 7).setValue(String(state.companyProfile.crewAccessPin));
    }
    markSystemDirty(ss.getId());
    return { synced: true };
}

function syncEstimatesWithLogic(ss, payloadEstimates) {
    const sheet = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES);
    const data = sheet.getDataRange().getValues();
    const dbMap = new Map();
    for (let i = 1; i < data.length; i++) {
        const jsonColIndex = CONSTANTS.COL_JSON_ESTIMATE - 1;
        if (data[i].length <= jsonColIndex) continue;
        const json = data[i][jsonColIndex];
        if (!json) continue;
        const obj = safeParse(json);
        if (obj && obj.id) dbMap.set(obj.id, obj);
    }
    payloadEstimates.forEach(incoming => {
        const existing = dbMap.get(incoming.id);
        if (existing) {
            if (existing.executionStatus === 'Completed' && incoming.executionStatus !== 'Completed') {
                incoming.executionStatus = 'Completed';
                incoming.actuals = existing.actuals;
            }
            if (existing.executionStatus === 'Completed' && incoming.executionStatus === 'Completed') {
                const existingDate = new Date(existing.actuals?.completionDate || 0).getTime();
                const incomingDate = new Date(incoming.actuals?.completionDate || 0).getTime();
                if (existingDate > incomingDate) incoming.actuals = existing.actuals;
            }
            if (existing.executionStatus === 'In Progress' && incoming.executionStatus === 'Not Started') incoming.executionStatus = 'In Progress';
            if (existing.status === 'Paid' && incoming.status !== 'Paid') incoming.status = 'Paid';
            if (existing.pdfLink && !incoming.pdfLink) incoming.pdfLink = existing.pdfLink;
            if (existing.workOrderSheetUrl && !incoming.workOrderSheetUrl) incoming.workOrderSheetUrl = existing.workOrderSheetUrl;
            if (existing.sitePhotos && existing.sitePhotos.length > 0) {
                if (!incoming.sitePhotos || incoming.sitePhotos.length === 0) incoming.sitePhotos = existing.sitePhotos;
            }
        }
        dbMap.set(incoming.id, incoming);
    });
    const output = [];
    dbMap.forEach(e => {
        output.push([e.id, e.date, e.customer?.name || "Unknown", e.totalValue || 0, e.status || "Draft", e.invoiceNumber || "", e.results?.materialCost || 0, e.pdfLink || "", JSON.stringify(e)]);
    });
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    if (output.length > 0) sheet.getRange(2, 1, output.length, output[0].length).setValues(output);
}

function handleStartJob(ss, payload) {
    const { estimateId } = payload;
    const sheet = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES);
    const finder = sheet.getRange("A:A").createTextFinder(estimateId).matchEntireCell(true).findNext();
    if (finder) {
        const row = finder.getRow();
        const jsonCell = sheet.getRange(row, CONSTANTS.COL_JSON_ESTIMATE);
        const est = safeParse(jsonCell.getValue());
        if (est) {
            est.executionStatus = 'In Progress';
            if (!est.actuals) est.actuals = {};
            est.actuals.lastStartedAt = new Date().toISOString();
            jsonCell.setValue(JSON.stringify(est));
            markSystemDirty(ss.getId());
            return { success: true, status: 'In Progress' };
        }
    }
    return { success: false, message: 'Estimate not found' };
}

function handleCompleteJob(ss, payload) {
    const { estimateId, actuals } = payload;
    const estSheet = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES);
    const finder = estSheet.getRange("A:A").createTextFinder(estimateId).matchEntireCell(true).findNext();
    if (!finder) throw new Error("Estimate not found");
    const row = finder.getRow();
    const est = safeParse(estSheet.getRange(row, CONSTANTS.COL_JSON_ESTIMATE).getValue());

    if (est.executionStatus === 'Completed' && est.inventoryProcessed) { return { success: true, message: "Already completed" }; }

    const setSheet = ss.getSheetByName(CONSTANTS.TAB_SETTINGS);
    const setRows = setSheet.getDataRange().getValues();
    const invSheet = ss.getSheetByName(CONSTANTS.TAB_INVENTORY);
    const invData = invSheet.getDataRange().getValues(); // Head + Data
    const logSheet = ss.getSheetByName(CONSTANTS.TAB_LOGS); // For appending later

    let countRow = -1;
    let counts = { openCellSets: 0, closedCellSets: 0 };
    let lifeRow = -1;
    let lifeStats = { openCell: 0, closedCell: 0 };

    for (let i = 0; i < setRows.length; i++) {
        if (setRows[i][0] === 'warehouse_counts' || setRows[i][0] === 'warehouse') {
            counts = safeParse(setRows[i][1]) || counts;
            countRow = i + 1;
        }
        if (setRows[i][0] === 'lifetime_usage') {
            lifeStats = safeParse(setRows[i][1]) || lifeStats;
            lifeRow = i + 1;
        }
    }

    const inventoryMap = new Map();
    for (let i = 1; i < invData.length; i++) {
        const id = String(invData[i][0]).trim();
        const qty = Number(invData[i][2] || 0);
        const json = safeParse(invData[i][5]);
        inventoryMap.set(id, {
            rowIndex: i + 1,
            quantity: qty,
            json: json,
            dirty: false,
            name: invData[i][1],
            unit: invData[i][3]
        });
    }

    const newLogRows = [];
    const techName = actuals.completedBy || "Crew";
    const compDate = actuals.completionDate || new Date().toISOString();
    const custName = est.customer?.name || "Unknown";

    const addLog = (materialName, qty, unit, action, details) => {
        const entry = {
            id: Utilities.getUuid(), date: compDate, jobId: estimateId, customerName: custName, materialName: materialName, quantity: Number(qty), unit: unit, loggedBy: techName, ...details
        };
        newLogRows.push([new Date(compDate), estimateId, custName, `${materialName} - ${action}`, Number(qty), unit, techName, JSON.stringify(entry)]);
    };

    const modifyInventory = (items, isAddBack, varianceContext) => {
        if (!items || !Array.isArray(items)) return;
        items.forEach(item => {
            const entry = inventoryMap.get(String(item.id).trim());
            if (entry) {
                const q = Number(item.quantity) || 0;
                if (!isAddBack) {
                    entry.quantity -= q; entry.json.quantity = entry.quantity; entry.dirty = true;
                    if (!varianceContext) addLog(entry.name, q, entry.unit, "Deduction", { action: "Deduction", prevQty: entry.quantity + q, newQty: entry.quantity });
                } else {
                    entry.quantity += q; entry.json.quantity = entry.quantity; entry.dirty = true;
                    if (!varianceContext) addLog(entry.name, q, entry.unit, "Restock", { action: "Restock", prevQty: entry.quantity - q, newQty: entry.quantity });
                }
            } else {
                addLog(item.name || "Unknown", item.quantity, item.unit, "ERROR: Not Found", { error: "Item Not Found in DB" });
            }
        });
    };

    if (est.inventoryDeducted && est.deductedValues) {
        const ded = est.deductedValues;
        counts.openCellSets = (counts.openCellSets || 0) + (Number(ded.openCellSets) || 0);
        counts.closedCellSets = (counts.closedCellSets || 0) + (Number(ded.closedCellSets) || 0);
        if (ded.inventory) modifyInventory(ded.inventory, true, false);
    }

    const ocUsed = Number(actuals.openCellSets) || 0;
    const ccUsed = Number(actuals.closedCellSets) || 0;
    counts.openCellSets = (counts.openCellSets || 0) - ocUsed;
    counts.closedCellSets = (counts.closedCellSets || 0) - ccUsed;
    if (ocUsed > 0) addLog("Open Cell Foam", ocUsed, "Sets", "Usage", { action: "Usage" });
    if (ccUsed > 0) addLog("Closed Cell Foam", ccUsed, "Sets", "Usage", { action: "Usage" });

    let inventoryToDeduct = [];
    if (actuals.inventory) inventoryToDeduct = actuals.inventory;
    else if (est.materials?.inventory) inventoryToDeduct = est.materials.inventory;
    if (inventoryToDeduct.length > 0) modifyInventory(inventoryToDeduct, false, false);

    const reconciliation = { estimateQuantities: [], actualQuantities: [], variances: [], reconciliedAt: new Date().toISOString() };
    const ocEstimate = Number(est.materials?.openCellSets || 0);
    const ocVariance = ocEstimate - ocUsed;
    if (ocVariance !== 0) {
        reconciliation.variances.push({ item: 'Open Cell Foam', estimated: ocEstimate, actual: ocUsed, variance: ocVariance, unit: 'Sets' });
        addLog("Open Cell Foam", ocVariance, "Sets", "Variance Check", { action: "VARIANCE_CHECK", estimated: ocEstimate, actual: ocUsed, variance: ocVariance });
    }
    const ccEstimate = Number(est.materials?.closedCellSets || 0);
    const ccVariance = ccEstimate - ccUsed;
    if (ccVariance !== 0) {
        reconciliation.variances.push({ item: 'Closed Cell Foam', estimated: ccEstimate, actual: ccUsed, variance: ccVariance, unit: 'Sets' });
        addLog("Closed Cell Foam", ccVariance, "Sets", "Variance Check", { action: "VARIANCE_CHECK", estimated: ccEstimate, actual: ccUsed, variance: ccVariance });
    }

    const estimatedInv = est.materials?.inventory || [];
    estimatedInv.forEach(estItem => {
        const actItem = (actuals.inventory || []).find(a => a.id === estItem.id);
        const estQty = Number(estItem.quantity || 0);
        const actQty = Number(actItem?.quantity || 0);
        const itemVariance = estQty - actQty;
        if (itemVariance !== 0) {
            reconciliation.variances.push({ item: estItem.name, estimated: estQty, actual: actQty, variance: itemVariance, unit: estItem.unit });
            addLog(estItem.name, itemVariance, estItem.unit, "Variance Check", { action: "VARIANCE_CHECK", estimated: estQty, actual: actQty, variance: itemVariance });
        }
    });

    lifeStats.openCell = (lifeStats.openCell || 0) + ocUsed;
    lifeStats.closedCell = (lifeStats.closedCell || 0) + ccUsed;

    if (countRow !== -1) setSheet.getRange(countRow, 2).setValue(JSON.stringify(counts));
    else setSheet.appendRow(['warehouse_counts', JSON.stringify(counts)]);
    if (lifeRow !== -1) setSheet.getRange(lifeRow, 2).setValue(JSON.stringify(lifeStats));
    else setSheet.appendRow(['lifetime_usage', JSON.stringify(lifeStats)]);

    const newQtyCol = [];
    const newJsonCol = [];
    let hasInventoryUpdates = false;
    for (let i = 1; i < invData.length; i++) {
        const id = String(invData[i][0]).trim();
        const stored = inventoryMap.get(id);
        if (stored && stored.dirty) {
            hasInventoryUpdates = true;
            newQtyCol.push([stored.quantity]);
            newJsonCol.push([JSON.stringify(stored.json)]);
        } else {
            newQtyCol.push([invData[i][2]]);
            newJsonCol.push([invData[i][5]]);
        }
    }

    if (hasInventoryUpdates && newQtyCol.length > 0) {
        invSheet.getRange(2, 3, newQtyCol.length, 1).setValues(newQtyCol);
        invSheet.getRange(2, 6, newJsonCol.length, 1).setValues(newJsonCol);
    }
    if (newLogRows.length > 0) {
        logSheet.getRange(logSheet.getLastRow() + 1, 1, newLogRows.length, newLogRows[0].length).setValues(newLogRows);
    }

    est.executionStatus = 'Completed';
    est.actuals = actuals;
    est.inventoryProcessed = true;
    est.reconciliation = reconciliation;
    est.lastModified = new Date().toISOString();
    estSheet.getRange(row, CONSTANTS.COL_JSON_ESTIMATE).setValue(JSON.stringify(est));
    SpreadsheetApp.flush();
    markSystemDirty(ss.getId());
    return { success: true };
}

function handleMarkJobPaid(ss, payload) {
    const { estimateId } = payload;
    const estSheet = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES);
    const finder = estSheet.getRange("A:A").createTextFinder(estimateId).matchEntireCell(true).findNext();
    if (!finder) throw new Error("Estimate ID not found");
    const row = finder.getRow();
    const est = safeParse(estSheet.getRange(row, CONSTANTS.COL_JSON_ESTIMATE).getValue());
    const setSheet = ss.getSheetByName(CONSTANTS.TAB_SETTINGS);
    let costs = { openCell: 0, closedCell: 0, laborRate: 0 };
    setSheet.getDataRange().getValues().forEach(r => { if (r[0] === 'costs') costs = safeParse(r[1]) || costs; });
    const act = est.actuals || est.materials || {};
    const oc = Number(act.openCellSets || 0); const cc = Number(act.closedCellSets || 0); const chemCost = (oc * costs.openCell) + (cc * costs.closedCell);
    const labHrs = Number(act.laborHours || est.expenses.manHours || 0); const labCost = labHrs * (est.expenses.laborRate || costs.laborRate || 0);
    let invCost = 0; (act.inventory || est.materials.inventory || []).forEach(i => invCost += (Number(i.quantity) * Number(i.unitCost || 0)));
    const misc = (est.expenses.tripCharge || 0) + (est.expenses.fuelSurcharge || 0);
    const revenue = Number(est.totalValue) || 0; const totalCOGS = chemCost + labCost + invCost + misc;
    est.status = 'Paid';
    est.financials = { revenue, chemicalCost: chemCost, laborCost: labCost, inventoryCost: invCost, miscCost: misc, totalCOGS, netProfit: revenue - totalCOGS, margin: revenue ? (revenue - totalCOGS) / revenue : 0 };
    estSheet.getRange(row, 5).setValue('Paid'); estSheet.getRange(row, CONSTANTS.COL_JSON_ESTIMATE).setValue(JSON.stringify(est));
    ss.getSheetByName(CONSTANTS.TAB_PNL).appendRow([new Date(), est.id, est.customer?.name, est.invoiceNumber, revenue, chemCost, labCost, invCost, misc, totalCOGS, est.financials.netProfit, est.financials.margin]);
    markSystemDirty(ss.getId());
    return { success: true, estimate: est };
}

function handleDeleteEstimate(ss, p) { const s = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES); const f = s.getRange("A:A").createTextFinder(p.estimateId).matchEntireCell(true).findNext(); if (f) s.deleteRow(f.getRow()); markSystemDirty(ss.getId()); return { success: true }; }
function handleLogTime(p) { const ss = SpreadsheetApp.openByUrl(p.workOrderUrl); const s = ss.getSheetByName("Daily Crew Log"); s.appendRow([new Date().toLocaleDateString(), p.user, new Date(p.startTime).toLocaleTimeString(), p.endTime ? new Date(p.endTime).toLocaleTimeString() : "", "", "", ""]); return { success: true }; }
function handleSendMessage(ss, payload) {
    const { estimateId, content, sender } = payload;
    const msgSheet = ensureSheet(ss, CONSTANTS.TAB_MESSAGES, ["ID", "Estimate ID", "Sender", "Content", "Timestamp", "Read Info", "JSON_DATA"]);
    const validSender = (sender === 'Admin' || sender === 'Crew') ? sender : 'Admin';
    const msg = { id: Utilities.getUuid(), estimateId, sender: validSender, content, timestamp: new Date().toISOString(), readBy: [] };
    msgSheet.appendRow([msg.id, estimateId, validSender, content, msg.timestamp, "", JSON.stringify(msg)]);
    markSystemDirty(ss.getId());
    return { success: true, message: msg };
}
function reconcileCompletedJobs(ss, incomingState) {
    if (!incomingState.savedEstimates) return;
    const sheet = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES);
    const data = sheet.getDataRange().getValues();
    const dbMap = new Map();
    for (let i = 1; i < data.length; i++) {
        const jsonColIndex = CONSTANTS.COL_JSON_ESTIMATE - 1;
        if (data[i].length <= jsonColIndex) continue;
        const json = data[i][jsonColIndex];
        if (!json || json === "") continue;
        const obj = safeParse(json);
        if (obj && obj.id) dbMap.set(obj.id, obj);
    }
    incomingState.savedEstimates.forEach((incomingEst, idx) => {
        const dbEst = dbMap.get(incomingEst.id);
        if (dbEst) {
            if (dbEst.executionStatus === 'Completed' && incomingEst.executionStatus !== 'Completed') {
                incomingState.savedEstimates[idx] = dbEst;
            }
        }
    });
}
