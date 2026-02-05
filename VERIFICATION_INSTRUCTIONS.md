# How to Verify These Issues in Your App

## Verification Plan: Test Each Issue

---

## Issue #1: Double Inventory Deduction

### How to Test

**Setup:**
1. Go to Warehouse view
2. Note your current Open Cell Sets count (e.g., 100)
3. Note the same count in your Google Sheets (CONSTANTS.TAB_INVENTORY)

**Test:**
1. Create a new Estimate
2. Set to 10 Open Cell Sets requirement
3. Advance to Work Order stage
4. Confirm/Save work order

**Expected (WRONG - Current Behavior):**
- Dashboard warehouse shows: 90 (100 - 10)
- Google Sheets shows: 80 (100 - 10 - 10)
- **Difference of 10 = double deduction**

**Expected (CORRECT - After Fix):**
- Dashboard warehouse shows: 90
- Google Sheets shows: 90
- **No discrepancy**

### How to Find It in Code

**Frontend deduction** (Line 1 of double-deduction):
```bash
# Windows Terminal / PowerShell
findstr /N "newWarehouse.openCellSets = newWarehouse.openCellSets -" c:\Users\russe\rfeappsy\hooks\useEstimates.ts
```
You should find this around line 232-233.

**Backend deduction** (Line 2 of double-deduction):
```bash
findstr /N "counts.openCellSets = (counts.openCellSets" c:\Users\russe\rfeappsy\backend\Code.js
```
You should find this around line 462.

---

## Issue #2: Inventory Item Matching Problems

### How to Test

**Setup:**
1. Create a warehouse item named exactly: "Test Fasteners"
2. Add 100 quantity
3. Create an estimate with this item

**Test 1 - Capital Letter Mismatch:**
1. Rename warehouse item to "test fasteners" (lowercase)
2. Create another estimate with the item
3. Create work order for 10 units

**Check:**
- Dashboard warehouse item: 90 remaining? (100 - 10 = ✓)
- Or still 100? (Failed to find and deduct = ✗)
- Or some other number? (Inconsistency = ✗)

**Test 2 - Extra Spaces:**
1. Rename item back to "Test Fasteners"
2. In estimate, manually edit item name to "Test  Fasteners" (extra space)
3. Create work order for 5 units

**Check:**
- Did it find the item and deduct?
- Or did it silently fail?

### How to Find It in Code

**Frontend matching** (uses exact name):
```bash
findstr /N "find(i => i.name === item.name)" c:\Users\russe\rfeappsy\hooks\useEstimates.ts
```

**Backend matching** (uses case-insensitive):
```bash
findstr /N "nameMap.get.*toLowerCase" c:\Users\russe\rfeappsy\backend\Code.js
```

The fact that they use **different matching strategies** is the problem.

---

## Issue #3: Missing Inventory Costs in P&L

### How to Test

**Setup:**
1. Create a warehouse item: "Fasteners" @ $5 per unit
2. Create an estimate with:
   - 10 Open Cell Sets @ $150/set = $1,500
   - 100 Fasteners @ $5 = $500
   - Revenue: $3,000
3. Create work order (don't mark paid)

**Expected Calculation (WRONG - Current):**
```
Revenue:      $3,000
- Foam:       -$1,500
- Labor:      -$0 (assume)
- Fasteners:  -$0  ← MISSING!
= Profit:     $1,500 (50% margin)
```

**Expected Calculation (CORRECT - After Fix):**
```
Revenue:      $3,000
- Foam:       -$1,500
- Fasteners:  -$500  ← INCLUDED!
= Profit:     $1,000 (33% margin)
```

### How to Verify Current Bug

1. Check Dashboard > Financials tab
2. Look at "Total COGS" for this unpaid work order
3. Should be $1,500 (wrong) OR $2,000 (correct)?

**How to Find in Code:**
```bash
findstr /N "const matCost = job.results.materialCost" c:\Users\russe\rfeappsy\components\Dashboard.tsx
```
Look at line 91 - it only uses `materialCost`, not inventory items.

---

## Issue #4: Paid vs Unpaid Job P&L Mismatch

### How to Test

**Setup:**
1. Create estimate with inventory items (fasteners, etc.)
2. Create work order
3. Check Dashboard P&L (shows Profit A)
4. Mark job as "Paid"
5. Check Dashboard P&L again (shows Profit B)

**Expected (WRONG - Current):**
- Profit A ≠ Profit B
- **The profit changes when you mark paid (or stays the same, inconsistent)**

**Expected (CORRECT - After Fix):**
- Profit A = Profit B
- **P&L is stable regardless of status**

### How to Verify

Run this mental calculation:
1. Sum all jobs where status = 'Work Order' → Get profit X
2. Sum all jobs where status = 'Paid' → Get profit Y
3. Should X and Y use the same formula?
   - Currently: NO (inconsistent)
   - Should be: YES (consistent)

---

## Issue #5: Negative Inventory Not Prevented

### How to Test

**Setup:**
1. Go to Warehouse
2. Set Open Cell to 10
3. Create estimate for 20 sets

**Current Behavior (WRONG):**
- Work order creation: ALLOWED
- Warehouse shows: -10 (negative!)
- Dashboard alerts: "SHORTAGE DETECTED"

**After Fix (CORRECT - Option A):**
- Work order creation: BLOCKED with error "Insufficient inventory"

**After Fix (CORRECT - Option B):**
- Work order creation: ALLOWED but flags for purchase order
- Shows clear warning: "Order will trigger purchase"

### Code Location

```bash
findstr /N "newWarehouse.openCellSets = newWarehouse.openCellSets - requiredOpen" c:\Users\russe\rfeappsy\hooks\useEstimates.ts
```

This line allows negative values with NO validation.

---

## Issue #6: No Reconciliation for Actuals vs Estimate

### How to Test

**Setup:**
1. Create estimate: 10 Open Cell Sets needed
2. Create work order
3. Warehouse shows: -10 (deducted)
4. Crew actually uses: 8 sets (not 10)
5. Mark job complete with actuals = 8 sets

**Current Behavior (WRONG):**
- Inventory is still -10 (even though only 8 were used)
- The 2 extra sets are "lost"
- No reconciliation

**After Fix (CORRECT):**
- Inventory adjustment: +2 sets added back
- Reconciliation log shows: "Estimated 10, Actual 8, Returned 2"

### How to Verify

Check if `est.reconciliation` field exists:
```bash
findstr /N "reconciliation" c:\Users\russe\rfeappsy\backend\Code.js
```

If you find it, reconciliation logic might exist.
If you don't find it, there's no reconciliation.

---

## Quick Verification Checklist

### Inventory
- [ ] Create work order and check both Dashboard and Google Sheets inventory
  - Do they match? If not, you have a sync issue
  - Check if they differ by exactly the deduction amount (double-deduction)

- [ ] Try creating work order with item name in different case
  - Does it deduct? If not, name-matching is broken

### P&L
- [ ] Create estimate with inventory items
- [ ] Calculate expected COGS including inventory
- [ ] Check Dashboard COGS
  - Does it match? If not, costs are missing

- [ ] Create work order, then mark as Paid
- [ ] Compare profit before and after
  - Do they match? If not, inconsistent formulas

### Validation
- [ ] Try creating work order with more needed sets than in stock
  - Is it blocked? If not, no validation

- [ ] Try creating inventory item with negative cost
  - Is it blocked? If not, no validation

### Reconciliation
- [ ] Search for "reconciliation" in backend code
  - Found = exists (good)
  - Not found = missing (bad)

---

## What to Document When You Find Issues

When you verify a bug, note:

1. **Exact Steps to Reproduce**
   - What did you click?
   - What did you enter?

2. **Expected vs Actual**
   - What should have happened?
   - What actually happened?

3. **Data Values**
   - Dashboard inventory: ___
   - Google Sheets inventory: ___
   - Difference: ___

4. **Screenshot/Evidence**
   - Screenshot of issue
   - Time it occurred
   - What job/estimate was involved

This will help when implementing fixes.

---

## Automated Test Ideas (Future)

Once fixed, add these automated tests:

```typescript
// Test: Single deduction
test('Work order deducts inventory once', () => {
    const initial = 100;
    const needed = 10;
    const result = createWorkOrder(needed);
    expect(result.warehouse.openCellSets).toBe(initial - needed);
    expect(backendWarehouse.openCellSets).toBe(initial - needed);
    // Both match = no double deduction
});

// Test: ID-based matching
test('Inventory matching uses ID not name', () => {
    const item = { id: 'abc123', name: 'Fasteners', quantity: 50 };
    const renamed = { ...item, name: 'Renamed' };
    const deducted = deductInventory([renamed], 10);
    expect(deducted.quantity).toBe(40);
    // Even with name change, ID finds it
});

// Test: P&L accuracy
test('COGS includes all inventory items', () => {
    const job = createJobWithItems([
        { name: 'Foam', cost: 1500 },
        { name: 'Fasteners', cost: 250 }
    ]);
    const cogs = calculateCOGS(job);
    expect(cogs).toBe(1750);
    // Both items counted
});
```

---

## Summary: Verification Steps

| Issue | How to Detect | Expected Finding |
|-------|---------------|------------------|
| Double deduction | Create WO, compare Dashboard vs Sheets | Inventory differs by deduction amount |
| Name matching | Try different capitalizations | Deduction fails for some names |
| Missing costs | Calculate COGS manually vs Dashboard | Dashboard COGS is lower |
| Paid vs Unpaid | Mark job Paid, compare P&L | Profit changes between statuses |
| Negative allowed | Create WO with insufficient stock | WO is created with negative balance |
| No reconciliation | Search code for "reconciliation" | Function doesn't exist |

