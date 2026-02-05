# Variance Reconciliation Testing Guide

## Implementation Summary

The inventory reconciliation system is now complete and handles THREE scenarios:

### ✅ What Was Implemented

**Backend (backend/Code.js - handleCompleteJob):**
1. **Pre-deduction Add-Back**: When crew completes a job, system first adds back the initial inventory that was pre-deducted when the work order was created
2. **Actual Usage Deduction**: System then deducts the actual inventory amounts that crew reported using
3. **Variance Calculation & Adjustment**:
   - **Open Cell Foam**: Compares estimated sets vs actual sets, adjusts warehouse accordingly
   - **Closed Cell Foam**: Compares estimated sets vs actual sets, adjusts warehouse accordingly
   - **Inventory Items**: For each warehouse item, compares estimated qty vs actual qty, adjusts accordingly
4. **Variance Logging**: Every adjustment is logged with:
   - Date/time of adjustment
   - Job ID (estimate ID)
   - Customer name
   - Item name and quantity adjusted
   - Action type (VARIANCE_ADD_BACK or VARIANCE_OVERUSAGE)
   - Complete JSON with estimated, actual, and adjustment amounts
5. **Reconciliation Tracking**: Full reconciliation object saved to estimate record with:
   - All variance entries
   - Warehouse count updates
   - Status confirmation

**Scenarios Handled:**
- ✅ **Under-usage** (crew used less than estimated): Automatically adds difference back to warehouse
- ✅ **Exact match** (crew used exactly what was estimated): No adjustment needed
- ✅ **Over-usage** (crew used more than estimated): Automatically deducts additional from warehouse

---

## Test Scenarios

### Test 1: Under-Usage Scenario (Crew uses LESS than estimated)

**Setup:**
- Create estimate for 10 OC sets, 8 warehouse items (Tyvek suit)
- Crew creates work order (inventory pre-deducted: -10 OC, -8 Tyvek)
- Crew actually uses only 8 OC sets and 6 Tyvek suits

**Actions:**
1. Crew submits job completion in CrewDashboard
2. Crew edits inventory quantities to actual usage
3. Crew clicks submit

**Expected Results:**
- ✅ OC foam warehouse: +2 added back (10 estimated - 8 actual)
- ✅ Tyvek suit warehouse: +2 added back (8 estimated - 6 actual)
- ✅ Logs show "VARIANCE_ADD_BACK" entries for both
- ✅ Reconciliation record saved with variance details
- ✅ Dashboard P&L reflects accurate costs

**Verification:**
```
Dashboard → Check warehouse inventory counts
Dashboard → Check P&L statement (verify COGS is accurate)
Logs sheet → Search by job ID, see VARIANCE_ADD_BACK entries
Estimates sheet → Find estimate, check reconciliation JSON
```

---

### Test 2: Exact Match Scenario (Crew uses EXACTLY what was estimated)

**Setup:**
- Create estimate for 5 OC sets, 10 warehouse items
- Crew creates work order (inventory pre-deducted: -5 OC, -10 items)
- Crew actually uses 5 OC sets and 10 items (no variance)

**Actions:**
1. Crew submits job completion
2. Crew confirms same quantities as estimated
3. Crew clicks submit

**Expected Results:**
- ✅ Warehouse OC foam: No change (5 - 5 = 0)
- ✅ Warehouse items: No change (10 - 10 = 0)
- ✅ No variance adjustments logged
- ✅ Reconciliation record shows zero variances
- ✅ Inventory count remains same

**Verification:**
```
Dashboard → Check warehouse inventory counts (should be unchanged)
Logs sheet → Should see no VARIANCE entries for this job
Estimates sheet → Reconciliation shows all variances = 0
```

---

### Test 3: Over-Usage Scenario (Crew uses MORE than estimated)

**Setup:**
- Create estimate for 8 OC sets, 5 warehouse items
- Crew creates work order (inventory pre-deducted: -8 OC, -5 items)
- Crew actually uses 10 OC sets and 8 warehouse items

**Actions:**
1. Crew submits job completion
2. Crew edits to show actual higher usage (10 OC, 8 items)
3. Crew clicks submit

**Expected Results:**
- ✅ OC foam warehouse: -2 additional deducted (8 estimated - 10 actual = -2)
- ✅ Warehouse items: -3 additional deducted (5 estimated - 8 actual = -3)
- ✅ Logs show "VARIANCE_OVERUSAGE" entries for both
- ✅ Reconciliation record shows negative variances
- ✅ Dashboard P&L reflects higher COGS

**Verification:**
```
Dashboard → Check warehouse inventory counts (should be lower)
Dashboard → Check P&L statement (COGS should be higher)
Logs sheet → Search by job ID, see VARIANCE_OVERUSAGE entries
Estimates sheet → Reconciliation shows negative variances
```

---

### Test 4: Mixed Variance Scenario (Some items under, some over)

**Setup:**
- Create estimate: 10 OC sets, 5 CC sets, 8 Tyvek, 10 Nails
- Crew creates work order (all pre-deducted)
- Crew actually uses: 8 OC (under by 2), 6 CC (over by 1), 8 Tyvek (exact), 12 Nails (over by 2)

**Actions:**
1. Crew submits job completion
2. Edit each quantity to actual
3. Submit

**Expected Results:**
- ✅ OC foam: +2 added back (VARIANCE_ADD_BACK)
- ✅ CC foam: -1 additional deducted (VARIANCE_OVERUSAGE)
- ✅ Tyvek: No change (0 variance)
- ✅ Nails: -2 additional deducted (VARIANCE_OVERUSAGE)
- ✅ Four separate variance log entries (one for each non-zero variance)
- ✅ Reconciliation shows all four variances
- ✅ Dashboard P&L reflects mixed costs

**Verification:**
```
Dashboard → Inventory counts show: OC +2, CC -1, Tyvek 0, Nails -2
Dashboard → P&L shows correct COGS
Logs sheet → All four variance entries appear
Estimates sheet → Reconciliation contains all four variance objects
```

---

## Frontend Verification (CrewDashboard.tsx)

The CrewDashboard already has capability to edit actual inventory. Verify:

1. **Job Completion Modal** (line 493+)
   - Shows estimated quantities (read-only or for reference)
   - Shows editable fields for actual quantities
   - Crew can modify each quantity

2. **Submit Handler** (line 186+)
   - `handleCompleteJobSubmit()` properly formats actuals
   - Sends complete actuals object with: openCellSets, closedCellSets, inventory array
   - Calls `completeJob()` API with actuals

3. **Confirmation** (after successful API response)
   - Should show confirmation that job was completed
   - Should display variance message: "2 units added back to inventory" (future enhancement)

---

## Data Validation Checklist

### ✅ Completed Checks
- [x] Syntax errors fixed
- [x] No variable redeclaration
- [x] Variance calculation logic correct
- [x] Over-usage handling implemented
- [x] Reconciliation object structure valid
- [x] Logging format consistent

### 📋 Manual Verification Needed
- [ ] Test under-usage scenario (actual < estimate)
- [ ] Test exact match scenario (actual = estimate)
- [ ] Test over-usage scenario (actual > estimate)
- [ ] Test mixed variance scenario (some items under, some over)
- [ ] Verify warehouse inventory updated correctly
- [ ] Verify logs contain all variance entries
- [ ] Verify P&L calculation reflects actual costs
- [ ] Verify reconciliation data persisted to estimate

### 🚀 Future Enhancements
1. **Frontend Notification**: Show crew the variance adjustments made
2. **Variance Report**: Admin dashboard showing all variances by job
3. **Variance Alerts**: Notify admin if variance exceeds threshold
4. **Inverse Estimate**: Suggest estimate adjustment if pattern shows consistent over/under
5. **Inventory Accuracy Score**: Track variance as percentage of estimate

---

## How to Run Tests

### Test 1: Use Real System
1. Open your app, go to CrewDashboard
2. Create or open a job that's ready for completion
3. Submit with different actual quantities
4. Verify in Dashboard and Logs sheet

### Test 2: Check Backend Logs
1. Open Google Sheets
2. Go to Logs sheet
3. Filter/search for job ID you tested
4. Should see VARIANCE_ADD_BACK or VARIANCE_OVERUSAGE entries

### Test 3: Check Estimates Sheet
1. Open Google Sheets
2. Find the estimate you tested
3. Look at JSON column (col_estimate_json or similar)
4. Should contain: `"reconciliation": { "variances": [...], "status": "completed" }`

### Test 4: Check Dashboard P&L
1. Open app Dashboard
2. Find the job you tested
3. Check P&L statement financials
4. Verify COGS = sum of actual usage costs (not estimated)

---

## Troubleshooting

### Problem: Inventory not updating after job completion

**Check 1**: Did crew actually submit the job?
- Verify job status is "Completed" in Database
- Check Logs sheet for ANY entries for this job

**Check 2**: Are estimates saved?
- Verify estimate exists in Google Sheets
- Check estimate has createdWorkOrder: true

**Check 3**: Is updateInventoryWithLog() working?
- Check previous jobs with simple materials
- Verify warehouse counts updated

**Solution Path**:
1. Check Logs sheet for error messages
2. Check backend for JavaScript errors (Apps Script editor)
3. Verify GOOGLE_SCRIPT_URL in constants.ts is correct
4. Check that actuals are being sent to backend

### Problem: Variance logged but inventory not adjusted

**Likely Cause**: updateInventoryWithLog() may be failing silently

**Check**: 
- Are item IDs matching between estimate and inventory?
- Is unit cost defined for all items?
- Are there special characters in item names?

**Fix**: 
- Run diagnostic: Submit test job with exact estimated quantities (no variance)
- If this works, issue is in variance adjustment logic
- If this fails, issue is in updateInventoryWithLog()

### Problem: Reconciliation object not saved

**Check**:
- Did job complete successfully? (status = "Completed")
- Check estimate JSON in Google Sheets for "reconciliation" field
- Check for JavaScript errors in Apps Script editor

**Fix**:
- Ensure job completion succeeded (check API response)
- Verify estimate ID is correct
- Check that getRange().setValue() is being called

---

## Success Criteria

✅ Implementation is COMPLETE and CORRECT if:

1. **Under-usage test passes**: Crew uses less → warehouse receives add-back
2. **Over-usage test passes**: Crew uses more → warehouse receives additional deduction
3. **Logs are accurate**: All variance entries in Logs sheet with correct data
4. **Reconciliation saved**: Estimate record contains reconciliation object with variance details
5. **P&L is accurate**: Dashboard P&L reflects actual (not estimated) costs
6. **Inventory is consistent**: Warehouse counts match Google Sheets data
7. **No double-adjustments**: Each variance counted once, not multiple times
8. **All edge cases handled**: Zero variance, negative variance, mixed variance all work

---

## Implementation Details (For Reference)

### Variance Reconciliation Flow

```
Job Completion (CrewDashboard)
    ↓
Send actuals to backend (completeJob API)
    ↓
handleCompleteJob() in backend/Code.js
    ├─ Step A: Add back initial pre-deducted inventory
    ├─ Step B: Deduct actual usage
    ├─ Step C: Calculate variances
    │   ├─ OC Foam variance: estimated - actual
    │   ├─ CC Foam variance: estimated - actual
    │   └─ Each inventory item variance: estimated - actual
    ├─ Step D: Adjust warehouse based on variance
    │   ├─ If variance > 0 (used less): add back difference
    │   ├─ If variance = 0 (exact match): no adjustment
    │   └─ If variance < 0 (used more): deduct difference
    ├─ Step E: Log all adjustments with details
    ├─ Step F: Save reconciliation object to estimate
    ├─ Step G: Update warehouse counts
    └─ Step H: Return success
    ↓
Frontend receives confirmation
    ↓
Dashboard shows updated inventory and P&L
```

### Data Structures

**Reconciliation Object** (saved in estimate record):
```javascript
{
  estimateQuantities: [],
  actualQuantities: [],
  variances: [
    {
      item: "Open Cell Foam",
      estimated: 10,
      actual: 8,
      variance: 2,  // positive = under-usage, negative = over-usage
      unit: "Sets"
    },
    {
      item: "Tyvek Suit",
      estimated: 8,
      actual: 6,
      variance: 2,
      unit: "Each"
    }
  ],
  status: "completed",
  processedAt: "2024-01-15T10:30:00Z",
  warehouseUpdates: { openCellSets: 2, closedCellSets: 0, ... }
}
```

**Log Entry Format** (added to Logs sheet):
```
Date | Job ID | Customer | Item Name | Quantity | Unit | Tech | JSON Details
2024-01-15 | EST-001 | Acme Corp | OC Foam - Variance Add-Back | 2 | Sets | John | {...}
```

---

## Next Steps After Verification

1. ✅ **Code Complete**: All logic implemented
2. ⏳ **Manual Testing**: Run the 4 test scenarios
3. 📊 **Dashboard Enhancement**: Show variance notifications to crew
4. 📈 **Reporting**: Add variance report for admin
5. 🎯 **Alerts**: Notify admin of unusual variances

---

*Last Updated: After variance reconciliation implementation*
*Status: Code Complete, Awaiting Manual Testing*
