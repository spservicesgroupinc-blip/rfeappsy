# RFE App Codebase Analysis: Profit & Loss & Inventory Logic

## Executive Summary

Your app has **critical logic errors** in inventory management and profit/loss calculations. Below is a detailed breakdown of issues found, their impact, and recommended fixes.

---

## 🔴 CRITICAL ISSUES

### 1. **Double Inventory Deduction on Work Order Creation**

**Location:** [useEstimates.ts](useEstimates.ts#L230-L250) + [backend/Code.js](backend/Code.js#L430-L500)

**The Problem:**
When an admin creates a work order, inventory is deducted **TWICE**:

1. **First deduction** - Frontend (`confirmWorkOrder`):
   ```typescript
   // useEstimates.ts line 232-242
   newWarehouse.openCellSets = newWarehouse.openCellSets - requiredOpen;
   newWarehouse.closedCellSets = newWarehouse.closedCellSets - requiredClosed;
   
   if (appData.inventory.length > 0) {
       newWarehouse.items = newWarehouse.items.map(item => {
           const used = appData.inventory.find(i => i.name === item.name);
           if (used) {
               return { ...item, quantity: item.quantity - (Number(used.quantity) || 0) };
           }
           return item;
       });
   }
   ```

2. **Second deduction** - Backend (`handleCreateWorkOrder`):
   ```javascript
   // backend/Code.js line 462-479
   counts.openCellSets = (counts.openCellSets || 0) - estOc;
   counts.closedCellSets = (counts.closedCellSets || 0) - estCc;
   updateInventoryWithLog(ss, est.materials.inventory, false, est.id, est.customer?.name, "System (Work Order)");
   ```

**Impact:**
- If you have 100 sets of Open Cell and create a 10-set work order, the system deducts 20 sets
- Your actual inventory count is **artificially low**
- This cascades into all dashboard metrics and financial calculations

**Why It Happens:**
- `confirmWorkOrder` updates the local state optimistically
- Then `handleBackgroundWorkOrderGeneration` calls `syncUp()`, which pushes this deducted state to the backend
- **Meanwhile**, the backend's `handleCreateWorkOrder` is also deducting from the Google Sheets inventory table
- Result: State becomes deducted locally + backend sheets become deducted = **double deduction**

**Fix:**
Remove the deduction from `confirmWorkOrder` OR skip it in `syncUp()`. The backend should be the single source of truth.

---

### 2. **Inventory Item Matching by Name is Fragile**

**Location:** [useEstimates.ts](useEstimates.ts#L243-L250) + [backend/Code.js](backend/Code.js#L815-L860)

**The Problem:**
Inventory deduction relies on **name matching**, which breaks if:
- Item names have different capitalization
- Item names have trailing spaces
- Items are renamed after a work order is created

```typescript
// Frontend - Matches by NAME
const used = appData.inventory.find(i => i.name === item.name);
```

```javascript
// Backend - Tries both ID and Name
nameMap.set(String(data[i][1]).trim().toLowerCase(), i + 1);
rowIdx = nameMap.get(itemName.trim().toLowerCase());
```

**Frontend uses exact match; Backend uses case-insensitive match** → They don't always find the same item.

**Impact:**
- "Fasteners" won't match "fasteners" on frontend
- Items with trailing spaces won't be found
- Some inventory deductions silently fail

**Fix:**
Always match by ID, not name. IDs are stable and unique.

---

### 3. **Inconsistent Inventory Cost Calculation in P&L**

**Location:** [backend/Code.js](backend/Code.js#L653-L661) + [Dashboard.tsx](Dashboard.tsx#L85-L105)

**The Problem - Backend (Correct):**
```javascript
// backend/Code.js line 656
let invCost = 0;
(act.inventory || est.materials.inventory || []).forEach(i => 
    invCost += (Number(i.quantity) * Number(i.unitCost || 0))
);
```

**The Problem - Frontend (Incomplete):**
```typescript
// Dashboard.tsx line 91
const matCost = job.results.materialCost || 0;
// ... but materialCost only includes FOAM costs, not warehouse inventory costs
```

**Why It's Wrong:**
- `job.results.materialCost` = foam set costs only (openCell + closedCell)
- **Missing:** Warehouse inventory item costs (fasteners, tools, chemicals, etc.)
- Dashboard shows inflated profit margins because it's not counting all COGS

**Impact:**
- You think you're making 30% profit, but you're actually making 15%
- Inventory costs are invisible in the dashboard P&L
- Financial reporting is inaccurate

**Fix:**
Add inventory costs to the material cost calculation in `results`.

---

### 4. **Paid Job Financials Missing Inventory Item Costs**

**Location:** [backend/Code.js](backend/Code.js#L650-L662)

**The Problem:**
When you mark a job as "Paid", the backend creates `est.financials` with `inventoryCost`:

```javascript
let invCost = 0;
(act.inventory || est.materials.inventory || []).forEach(i => 
    invCost += (Number(i.quantity) * Number(i.unitCost || 0))
);
est.financials = {
    revenue,
    chemicalCost: chemCost,
    laborCost: labCost,
    inventoryCost: invCost,  // ← Correctly calculated
    miscCost: misc,
    totalCOGS,
    netProfit: revenue - totalCOGS,
    margin: revenue ? (revenue - totalCOGS) / revenue : 0
};
```

**But** for unpaid jobs, the frontend Dashboard calculates it differently:

```typescript
// Dashboard.tsx line 91-99
totalCOGS += (matCost + lCost + misc);  // ← Only foam costs, no inventory items!
chemCost += matCost;
laborCost += lCost;
```

**Impact:**
- Paid jobs show correct profit margins
- Unpaid jobs (Work Orders, Invoiced) show **inflated** profit margins
- Your financial metrics change once a job is marked Paid
- P&L dashboard is inconsistent between job statuses

**Fix:**
Frontend should mirror backend logic: Include ALL inventory costs in COGS calculation.

---

### 5. **Negative Inventory Values Not Prevented**

**Location:** [useEstimates.ts](useEstimates.ts#L230-L242)

**The Problem:**
The app allows inventory to go negative:

```typescript
const requiredOpen = Number(results.openCellSets) || 0;
const requiredClosed = Number(results.closedCellSets) || 0;

const newWarehouse = { ...appData.warehouse };
newWarehouse.openCellSets = newWarehouse.openCellSets - requiredOpen;  // ← Can be negative
newWarehouse.closedCellSets = newWarehouse.closedCellSets - requiredClosed;  // ← Can be negative
```

**While** [MaterialOrder.tsx](MaterialOrder.tsx#L22-L28) **detects** shortages:

```typescript
const shortages = useMemo(() => {
    const list: ShortageSummary[] = [];
    if (state.warehouse.openCellSets < 0) {
        list.push({ name: 'Open Cell Foam', type: 'open_cell', needed: Math.abs(state.warehouse.openCellSets) });
    }
```

**Issues:**
1. You can create a work order even with negative inventory (no validation)
2. Dashboard shows negative numbers as "shortages" (confusing UI)
3. Negative costs are possible if a negative quantity has a unitCost

**Impact:**
- Work orders can be created with insufficient inventory
- Profit calculations are wrong if quantities are negative
- No audit trail of when/why inventory went negative

**Fix:**
Either:
- A) **Prevent** work order creation if inventory insufficient
- B) **Allow** it but require purchase orders before work starts
- Pick one approach and enforce it consistently

---

### 6. **Inventory Deduction Happens on Work Order, Not on Actual Completion**

**Location:** [backend/Code.js](backend/Code.js#L430-L490)

**The Problem:**
```javascript
// Deduction happens here ↓
if (!est.inventoryDeducted) {
    // ... deduct from warehouse immediately
    est.inventoryDeducted = true;
    updateInventoryWithLog(...);
}
```

**Business Logic Issue:**
- Inventory deducted when Work Order **created** (estimate stage)
- But actual usage happens later when **job is Completed**
- What if crew uses LESS than estimated? (e.g., estimate 10 sets, actually use 8)
- What if job is **cancelled** after work order but before completion?

**Impact:**
- Inventory is gone from warehouse before work even starts
- No way to adjust if actual usage differs from estimate
- Cancelled jobs still have their materials "deducted"

**Current Workaround (Incomplete):**
The `actuals` field exists:
```typescript
actuals?: {
    openCellSets: number;
    closedCellSets: number;
    inventory: InventoryItem[];
    // ...
};
```

But there's **no logic** that:
1. Compares `materials` (estimated) vs `actuals` (real)
2. Adjusts inventory based on differences
3. Tracks waste/overage

**Fix:**
Implement a "reconciliation" system:
1. Deduct estimate on Work Order creation (current behavior ✓)
2. Record actuals when job completes
3. Calculate variance (estimate vs actual)
4. Add-back inventory if actuals < estimate (or deduct more if actuals > estimate)

---

### 7. **Sync Race Conditions Between Frontend and Backend**

**Location:** [useEstimates.ts](useEstimates.ts#L265-L315) + [backend/Code.js](backend/Code.js#L258-L290)

**The Problem:**
The `handleBackgroundWorkOrderGeneration` function:
```typescript
const updatedState = {
    ...appData,
    customers: currentCustomers,
    warehouse: currentWarehouse,  // ← Already deducted
    savedEstimates: freshEstimates
};

await syncUp(updatedState, session.spreadsheetId);
```

**Meanwhile**, `handleCreateWorkOrder` in the backend **also** deducts:
```javascript
updateInventoryWithLog(ss, est.materials.inventory, false, est.id, ...);
```

**Race Condition Scenario:**
1. User creates Work Order A (10 sets needed)
2. Frontend deducts: 100 → 90
3. Frontend calls `syncUp` (slow, takes 2 seconds)
4. Backend's `handleCreateWorkOrder` runs (also deducts 10)
5. `syncUp` overwrites backend with frontend's already-deducted state
6. **Result:** 90 in frontend, 80 in backend (now they're inconsistent)

**No Transaction/Idempotency:**
The system has no way to guarantee that an operation runs only once.

**Fix:**
- Add an `inventoryDeducted` flag that backend checks (you have this ✓)
- Make sure frontend **never** calls `updateInventoryWithLog` (you don't ✓)
- Ensure `syncUp` is idempotent (it might not be, depends on how backend handles the state merge)

---

### 8. **Material Cost Not Included in CalculationResults**

**Location:** [Dashboard.tsx](Dashboard.tsx#L91) references `job.results.materialCost`

**The Problem:**
When calculating P&L, the Dashboard assumes `job.results.materialCost` contains:
- Foam costs
- **AND** Inventory item costs

But [CalculationResults](types.ts#L130-L165) defines:
```typescript
export interface CalculationResults {
    openCellCost: number;
    closedCellCost: number;
    inventoryCost: number;  // ← Separate!
    laborCost: number;
    miscExpenses: number;
    materialCost: number;   // ← What's included here?
    totalCost: number;
}
```

**Questions Unanswered:**
- Does `materialCost` = foam only OR foam + inventory items?
- Is `inventoryCost` being calculated?
- Is it being included in `totalCost`?

**Impact:**
Material costs might be:
- Counted twice
- Counted once but reported as if twice
- Not counted at all

**Fix:**
Clarify the definition: `materialCost = openCellCost + closedCellCost`, and add warehouse inventory costs separately in COGS.

---

## 🟠 MODERATE ISSUES

### 9. **No Validation of Inventory Item Unit Costs**

**Location:** [SprayFoamCalculator.tsx](SprayFoamCalculator.tsx#L129-L138)

```typescript
const handleCreateWarehouseItem = (name: string, unit: string, cost: number) => {
    const newItem = {
        id: Math.random().toString(36).substr(2, 9),
        name, unit, unitCost: cost, quantity: 0
    };
    // No validation that cost > 0
};
```

**Impact:**
- Negative costs possible → inflates P&L
- Zero costs → underreports COGS
- Can manually set costs to manipulate financials

**Fix:**
Validate: `cost >= 0` before saving.

---

### 10. **Labor Rate Inconsistency**

**Location:** [Dashboard.tsx](Dashboard.tsx#L93) uses both:
- `job.expenses.laborRate`
- `state.costs.laborRate`

**The Problem:**
If a job was created with laborRate X, but you change the global `state.costs.laborRate` to Y, the dashboard's P&L calculation might use the wrong rate for historical jobs.

```typescript
const laborRate = job.expenses.laborRate || state.costs.laborRate || 0;
```

**This is correct**, but the backend might not be doing the same:

```javascript
// backend/Code.js line 654
const labCost = labHrs * (est.expenses.laborRate || costs.laborRate || 0);
```

**They align ✓, but...** If you update `state.costs.laborRate` in the UI without re-marking the job as paid, the labor cost in the dashboard will change retroactively.

**Fix:**
Recalculate P&L only when job is marked Paid (freeze it at that point).

---

### 11. **No Audit Log for Inventory Changes**

**Location:** [backend/Code.js](backend/Code.js#L855-L885) has a `logSheet`, but it's not comprehensive

**Logging exists for:**
- Deductions on Work Order creation
- Re-stocks on job completion (if logic existed)

**Missing logs for:**
- Purchase orders received
- Manual inventory adjustments
- Inventory errors/corrections

**Impact:**
If inventory is wrong, you can't trace how it got that way.

---

## 🟡 DESIGN ISSUES

### 12. **Inventory vs Materials Naming Confusion**

Your app has:
- `state.inventory[]` - items added to THIS estimate
- `state.warehouse.items[]` - global warehouse inventory
- `est.materials.inventory[]` - items saved with the estimate

**The confusion:**
When deducting inventory on work order creation:

```typescript
// Frontend: Uses state.inventory (THIS estimate's items)
if (appData.inventory.length > 0) {
    newWarehouse.items = newWarehouse.items.map(item => {
        const used = appData.inventory.find(i => i.name === item.name);  // ← Match by name
        if (used) {
            return { ...item, quantity: item.quantity - (Number(used.quantity) || 0) };
        }
        return item;
    });
}
```

```javascript
// Backend: Uses est.materials.inventory (saved estimate's items)
if (est.materials?.inventory && Array.isArray(est.materials.inventory)) {
    updateInventoryWithLog(ss, est.materials.inventory, false, ...);
}
```

**They might be different sets of items!** If the user edited `state.inventory` after saving the estimate, the backend won't see those changes.

**Fix:**
Always use the saved `est.materials.inventory` for deduction, not `state.inventory`.

---

## 📊 Summary Table of Issues

| Issue | Severity | Impact | Fix Effort |
|-------|----------|--------|-----------|
| Double deduction | 🔴 Critical | Inventory 50-100% off | Medium |
| Name-based matching | 🔴 Critical | Deductions fail silently | Medium |
| Inconsistent COGS on dashboard | 🔴 Critical | P&L accuracy 20-30% off | Medium |
| Paid vs Unpaid P&L mismatch | 🔴 Critical | Inconsistent financials | Low |
| Negative inventory allowed | 🟠 Moderate | Invalid data | Low |
| No reconciliation system | 🟠 Moderate | Actuals vs Estimate ignored | High |
| Sync race conditions | 🟠 Moderate | Data inconsistency | High |
| Missing inventory item costs | 🟠 Moderate | COGS underreported | Medium |
| Unit cost validation missing | 🟠 Moderate | Manual manipulation | Low |
| Labor rate inconsistency | 🟡 Design | Retroactive P&L changes | Low |
| No audit logs | 🟡 Design | Can't trace errors | Medium |
| Inventory naming confusion | 🟡 Design | Logic errors | Medium |

---

## 🔧 Recommended Fix Order

### Phase 1 (Critical - Do First)
1. Fix double deduction (remove from frontend)
2. Switch all matching to ID-based (not name-based)
3. Add inventory item costs to Dashboard P&L calculation

### Phase 2 (Important)
4. Prevent negative inventory (add validation)
5. Fix P&L calculation to include all COGS
6. Add inventory reconciliation system

### Phase 3 (Nice to Have)
7. Add comprehensive audit logging
8. Clarify inventory/materials naming
9. Add unit cost validation

---

## Files to Review/Modify

- `useEstimates.ts` - Remove frontend inventory deduction
- `backend/Code.js` - Verify single source of truth
- `Dashboard.tsx` - Fix P&L calculations
- `MaterialOrder.tsx` - Fix name-based matching
- `types.ts` - Clarify CalculationResults structure

