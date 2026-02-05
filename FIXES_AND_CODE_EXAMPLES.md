# Recommended Code Fixes

## Fix #1: Remove Double Deduction from Frontend

**Current Problem:** Inventory is deducted twice - once in frontend, once in backend.

**File:** `useEstimates.ts`, function `confirmWorkOrder`

**Current Code (Lines 230-250):**
```typescript
const confirmWorkOrder = async (results: CalculationResults, workOrderLines?: InvoiceLineItem[]) => {
    // 1. Deduct Inventory (Allow negatives - No checks/warnings/blocks)
    const requiredOpen = Number(results.openCellSets) || 0;
    const requiredClosed = Number(results.closedCellSets) || 0;

    const newWarehouse = { ...appData.warehouse };
    newWarehouse.openCellSets = newWarehouse.openCellSets - requiredOpen;  // ← REMOVE THIS
    newWarehouse.closedCellSets = newWarehouse.closedCellSets - requiredClosed;  // ← REMOVE THIS

    if (appData.inventory.length > 0) {
        newWarehouse.items = newWarehouse.items.map(item => {
            const used = appData.inventory.find(i => i.name === item.name);
            if (used) {
                return { ...item, quantity: item.quantity - (Number(used.quantity) || 0) };  // ← REMOVE THIS
            }
            return item;
        });
    }
    // ... rest of function
```

**Fixed Code:**
```typescript
const confirmWorkOrder = async (results: CalculationResults, workOrderLines?: InvoiceLineItem[]) => {
    // ✓ REMOVED: Inventory deduction - backend handles this
    // The backend will deduct when handleCreateWorkOrder is called
    
    const newWarehouse = { ...appData.warehouse };
    // ← No deduction here
    
    // 2. Save Estimate as Work Order & Update Warehouse State (Local First)
    dispatch({ type: 'UPDATE_DATA', payload: { warehouse: newWarehouse } });
    
    // ... rest of function
```

**Why This Works:**
- Backend's `handleCreateWorkOrder` is the single source of truth
- It checks `if (!est.inventoryDeducted)` to prevent double deduction
- Frontend sync will pull the correct deducted state from backend

---

## Fix #2: Switch to ID-Based Inventory Matching

**Current Problem:** Name-based matching fails if names differ in capitalization or spacing.

**File:** `useEstimates.ts`, function `confirmWorkOrder` (after Fix #1)

**Current Code:**
```typescript
if (appData.inventory.length > 0) {
    newWarehouse.items = newWarehouse.items.map(item => {
        const used = appData.inventory.find(i => i.name === item.name);  // ← NAME MATCH
        if (used) {
            return { ...item, quantity: item.quantity - (Number(used.quantity) || 0) };
        }
        return item;
    });
}
```

**Fixed Code:**
```typescript
// Don't deduct here - let backend do it
// But IF you need to track which items are used, use IDs:

const estimateWithItemIds = appData.inventory.map(inv => {
    const warehouseItem = appData.warehouse.items.find(w => w.name === inv.name);
    return {
        ...inv,
        warehouseId: warehouseItem?.id || null  // ← Add warehouse ID to tracking
    };
});
```

**Backend Fix:** File `backend/Code.js`, function `updateInventoryWithLog`

**Current Code (Lines 815-850):**
```javascript
const itemId = String(item.id).trim();
let rowIdx = itemMap.get(itemId);
const itemName = item.name || "Unknown Item";

if (!rowIdx && itemName !== "Unknown Item") {
    rowIdx = nameMap.get(itemName.trim().toLowerCase());  // ← Fallback to name
}
```

**Fixed Code:**
```javascript
const itemId = String(item.id).trim();
let rowIdx = itemMap.get(itemId);

// NEVER fallback to name matching - fail loudly if ID not found
if (!rowIdx) {
    console.error(`INVENTORY ERROR: Item ID not found: ${itemId}`);
    logSheet.appendRow([new Date(), jobId, customerName, `ERROR: Item ID ${itemId} not found`, 0, "-", "SYSTEM_ERROR", JSON.stringify({ error: 'ID_NOT_FOUND', itemId })]);
    return;  // Don't deduct if we can't find the item
}
```

---

## Fix #3: Add Inventory Item Costs to Dashboard P&L

**Current Problem:** P&L doesn't include warehouse inventory item costs, only foam costs.

**File:** `Dashboard.tsx`, function inside `financialStats` useMemo

**Current Code (Lines 80-102):**
```typescript
const financialStats = useMemo(() => {
    const soldJobs = state.savedEstimates.filter(e =>
        ['Work Order', 'Invoiced', 'Paid'].includes(e.status) && e.status !== 'Archived'
    );

    let totalRevenue = 0;
    let totalCOGS = 0;
    let chemCost = 0;
    let laborCost = 0;

    soldJobs.forEach(job => {
        if (job.status === 'Paid' && job.financials) {
            totalRevenue += job.financials.revenue;
            totalCOGS += job.financials.totalCOGS;
            chemCost += job.financials.chemicalCost;
            laborCost += job.financials.laborCost;
        } else {
            totalRevenue += job.totalValue || 0;
            const matCost = job.results.materialCost || 0;  // ← FOAM ONLY
            const laborHrs = job.actuals?.laborHours || job.expenses.manHours || 0;
            const laborRate = job.expenses.laborRate || state.costs.laborRate || 0;
            const lCost = laborHrs * laborRate;
            const misc = (job.expenses.tripCharge || 0) + (job.expenses.fuelSurcharge || 0) + (job.expenses.other?.amount || 0);
            totalCOGS += (matCost + lCost + misc);  // ← Missing inventory costs
            chemCost += matCost;
            laborCost += lCost;
        }
    });

    const netProfit = totalRevenue - totalCOGS;
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const otherCost = totalCOGS - chemCost - laborCost;

    return { totalRevenue, totalCOGS, netProfit, margin, chemCost, laborCost, otherCost, jobCount: soldJobs.length };
}, [state.savedEstimates, state.warehouse.items, state.costs.laborRate]);
```

**Fixed Code:**
```typescript
const financialStats = useMemo(() => {
    const soldJobs = state.savedEstimates.filter(e =>
        ['Work Order', 'Invoiced', 'Paid'].includes(e.status) && e.status !== 'Archived'
    );

    let totalRevenue = 0;
    let totalCOGS = 0;
    let chemCost = 0;
    let laborCost = 0;
    let inventoryCost = 0;  // ← ADD THIS

    soldJobs.forEach(job => {
        if (job.status === 'Paid' && job.financials) {
            totalRevenue += job.financials.revenue;
            totalCOGS += job.financials.totalCOGS;
            chemCost += job.financials.chemicalCost;
            laborCost += job.financials.laborCost;
            inventoryCost += job.financials.inventoryCost || 0;  // ← ADD THIS
        } else {
            totalRevenue += job.totalValue || 0;
            const matCost = job.results.materialCost || 0;  // Foam costs
            
            // ✓ ADD: Calculate inventory item costs
            let invCost = 0;
            if (job.materials?.inventory && Array.isArray(job.materials.inventory)) {
                job.materials.inventory.forEach(item => {
                    invCost += (Number(item.quantity) * Number(item.unitCost || 0));
                });
            }
            
            const laborHrs = job.actuals?.laborHours || job.expenses.manHours || 0;
            const laborRate = job.expenses.laborRate || state.costs.laborRate || 0;
            const lCost = laborHrs * laborRate;
            const misc = (job.expenses.tripCharge || 0) + (job.expenses.fuelSurcharge || 0) + (job.expenses.other?.amount || 0);
            
            const jobCogs = matCost + invCost + lCost + misc;  // ✓ INCLUDE INVENTORY
            totalCOGS += jobCogs;
            chemCost += matCost;
            laborCost += lCost;
            inventoryCost += invCost;  // ✓ TRACK SEPARATELY
        }
    });

    const netProfit = totalRevenue - totalCOGS;
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const otherCost = totalCOGS - chemCost - laborCost - inventoryCost;

    return { 
        totalRevenue, 
        totalCOGS, 
        netProfit, 
        margin, 
        chemCost, 
        laborCost, 
        inventoryCost,  // ← RETURN THIS
        otherCost, 
        jobCount: soldJobs.length 
    };
}, [state.savedEstimates, state.warehouse.items, state.costs.laborRate]);
```

---

## Fix #4: Add Validation to Prevent Negative Inventory

**File:** `SprayFoamCalculator.tsx`, function `handleCreateWarehouseItem`

**Current Code (Lines 129-138):**
```typescript
const handleCreateWarehouseItem = (name: string, unit: string, cost: number) => {
    const newItem = {
        id: Math.random().toString(36).substr(2, 9),
        name, unit, unitCost: cost, quantity: 0  // ← No validation
    };
    dispatch({ type: 'UPDATE_DATA', payload: { warehouse: { ...appData.warehouse, items: [...appData.warehouse.items, newItem] } } });
};
```

**Fixed Code:**
```typescript
const handleCreateWarehouseItem = (name: string, unit: string, cost: number) => {
    // ✓ ADD VALIDATION
    if (!name || name.trim().length === 0) {
        dispatch({ type: 'SET_NOTIFICATION', payload: { type: 'error', message: 'Item name required' } });
        return;
    }
    
    if (cost < 0) {
        dispatch({ type: 'SET_NOTIFICATION', payload: { type: 'error', message: 'Cost cannot be negative' } });
        return;
    }
    
    if (!unit || unit.trim().length === 0) {
        dispatch({ type: 'SET_NOTIFICATION', payload: { type: 'error', message: 'Unit required' } });
        return;
    }

    const newItem = {
        id: Math.random().toString(36).substr(2, 9),
        name: name.trim(),
        unit: unit.trim(),
        unitCost: Math.max(0, cost),  // Ensure non-negative
        quantity: 0
    };
    
    dispatch({ type: 'UPDATE_DATA', payload: { warehouse: { ...appData.warehouse, items: [...appData.warehouse.items, newItem] } } });
    dispatch({ type: 'SET_NOTIFICATION', payload: { type: 'success', message: `Added ${name}` } });
};
```

---

## Fix #5: Clarify CalculationResults Material Cost

**File:** `types.ts`, interface `CalculationResults`

**Current Code (Lines 130-165):**
```typescript
export interface CalculationResults {
    // ... other fields
    openCellCost: number;
    closedCellCost: number;
    inventoryCost: number;
    laborCost: number;
    miscExpenses: number;
    materialCost: number;  // ← Unclear definition
    totalCost: number;
}
```

**Better Definition - Add Comments:**
```typescript
export interface CalculationResults {
    // ... other fields
    
    // Chemical/Foam costs
    openCellCost: number;           // (openCellSets * costPerSet)
    closedCellCost: number;         // (closedCellSets * costPerSet)
    
    // Warehouse inventory item costs (not foam)
    inventoryCost: number;          // sum of (quantity * unitCost) for each inventory item
    
    // Labor
    laborCost: number;              // (manHours * laborRate)
    
    // Other expenses
    miscExpenses: number;           // (tripCharge + fuelSurcharge + other)
    
    // TOTAL MATERIAL = FOAM ONLY (does NOT include warehouse inventory items)
    materialCost: number;           // (openCellCost + closedCellCost)
    
    // GRAND TOTAL
    totalCost: number;              // (materialCost + inventoryCost + laborCost + miscExpenses)
}
```

---

## Fix #6: Add Reconciliation System for Actuals vs Estimate

**File:** `backend/Code.js`, add new function after `handleCompleteJob`

**New Function:**
```javascript
function reconcileInventoryAfterCompletion(ss, payload) {
    const { estimateId, actuals } = payload;
    
    const estSheet = ss.getSheetByName(CONSTANTS.TAB_ESTIMATES);
    const logSheet = ss.getSheetByName(CONSTANTS.TAB_LOGS);
    const data = estSheet.getDataRange().getValues();
    
    let est = null;
    let estRow = -1;
    
    // Find estimate
    for (let i = 1; i < data.length; i++) {
        const jsonColIndex = CONSTANTS.COL_JSON_ESTIMATE - 1;
        const json = safeParse(data[i][jsonColIndex]);
        if (json && json.id === estimateId) {
            est = json;
            estRow = i + 1;
            break;
        }
    }
    
    if (!est || estRow === -1) return { error: 'Estimate not found' };
    
    // Calculate variance
    const estimatedOpen = Number(est.materials?.openCellSets || 0);
    const actualOpen = Number(actuals?.openCellSets || 0);
    const openCellVariance = estimatedOpen - actualOpen;
    
    const estimatedClosed = Number(est.materials?.closedCellSets || 0);
    const actualClosed = Number(actuals?.closedCellSets || 0);
    const closedCellVariance = estimatedClosed - actualClosed;
    
    // If actual usage < estimated, add back the difference
    if (openCellVariance > 0) {
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
        
        if (countRow !== -1) {
            counts.openCellSets = (counts.openCellSets || 0) + openCellVariance;
            counts.closedCellSets = (counts.closedCellSets || 0) + closedCellVariance;
            setSheet.getRange(countRow, 2).setValue(JSON.stringify(counts));
            
            logSheet.appendRow([
                new Date(),
                estimateId,
                est.customer?.name,
                `Reconciliation: Used less than estimated`,
                openCellVariance,
                'Sets',
                'System (Reconciliation)',
                JSON.stringify({ 
                    action: 'RECONCILIATION', 
                    estimatedOpen, 
                    actualOpen, 
                    variance: openCellVariance 
                })
            ]);
        }
    }
    
    // Update estimate with reconciliation
    est.reconciliation = {
        estimatedOpen,
        actualOpen,
        openCellVariance,
        estimatedClosed,
        actualClosed,
        closedCellVariance,
        reconciliedAt: new Date().toISOString()
    };
    
    estSheet.getRange(estRow, CONSTANTS.COL_JSON_ESTIMATE).setValue(JSON.stringify(est));
    markSystemDirty(ss.getId());
    
    return { success: true, reconciliation: est.reconciliation };
}
```

---

## Testing Checklist

After applying these fixes, test:

- [ ] Create work order with 10 open cell sets
  - Check warehouse has exactly 10 fewer sets (not 20)
  - Check backend logs show one deduction (not two)

- [ ] Create work order with 5 fasteners (inventory item)
  - Check warehouse fasteners quantity decreases by 5
  - Check dashboard P&L includes fastener cost in COGS

- [ ] Mark job as Paid
  - Check P&L financials match dashboard P&L
  - Verify profit margin is consistent

- [ ] Create work order with inventory shortage
  - Should either block creation or show clear warning

- [ ] Test sync between frontend and backend
  - Create work order, close app, reopen
  - Verify inventory state is consistent

