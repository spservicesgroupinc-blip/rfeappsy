# 🎯 QUICK REFERENCE: Variance Reconciliation

## What It Does
When crew submits job completion with actual inventory used, the system:
1. ✅ Adds back initial pre-deducted inventory
2. ✅ Deducts actual usage amounts
3. ✅ Calculates variance (estimated - actual)
4. ✅ Adjusts warehouse automatically
5. ✅ Logs all changes with audit trail
6. ✅ Updates P&L with accurate costs

## Three Scenarios Handled

### Under-Usage: Used LESS than estimated
```
Estimated: 10 units → Actual: 8 units
Result: +2 units added back to warehouse
Log: VARIANCE_ADD_BACK entry created
```

### Exact Match: Used EXACTLY what was estimated
```
Estimated: 10 units → Actual: 10 units
Result: No adjustment (variance = 0)
Log: No variance entry
```

### Over-Usage: Used MORE than estimated
```
Estimated: 10 units → Actual: 12 units
Result: -2 units deducted from warehouse
Log: VARIANCE_OVERUSAGE entry created
```

## Code Locations

| What | Where | Lines |
|------|-------|-------|
| Main logic | backend/Code.js | 548-810 |
| handleCompleteJob() | backend/Code.js | 548+ |
| Variance calc | backend/Code.js | 574-750 |
| Crew submission | CrewDashboard.tsx | 186+, 493+, 584+ |
| Inventory update | backend/Code.js | 815+ (updateInventoryWithLog) |
| P&L calculation | Dashboard.tsx | 82-107 |

## What Gets Logged

**For each variance adjustment:**
```
Date: [timestamp]
Job ID: [estimate ID]
Customer: [customer name]
Item: [item name] - Variance Add-Back OR Over-usage Deduction
Quantity: [variance amount]
Unit: [unit type]
Tech: [crew member who submitted]
JSON: { action, estimated, actual, adjustment }
```

## How to Verify

### ✅ Check Warehouse Inventory
```
Dashboard → Look at warehouse item counts
Should be updated by variance adjustments
```

### ✅ Check Logs
```
Google Sheets → Logs sheet
Filter/search by job ID
Should see VARIANCE_ADD_BACK or VARIANCE_OVERUSAGE entries
```

### ✅ Check Reconciliation Data
```
Google Sheets → Estimates sheet
Find the estimate
JSON column should contain:
"reconciliation": { 
  "variances": [{...}, {...}],
  "status": "completed"
}
```

### ✅ Check P&L
```
Dashboard → Financial stats
COGS should reflect actual usage costs
Not estimated costs
```

## Test Checklist

- [ ] Under-usage test: Crew uses 8 of 10 estimated units
  - Verify: +2 units added back
  - Verify: VARIANCE_ADD_BACK log entry
  
- [ ] Exact match test: Crew uses 10 of 10 estimated units
  - Verify: No adjustment
  - Verify: No variance entry
  
- [ ] Over-usage test: Crew uses 12 of 10 estimated units
  - Verify: -2 units deducted
  - Verify: VARIANCE_OVERUSAGE log entry
  
- [ ] Mixed test: Different variance for each item
  - Verify: Each variance handled independently
  - Verify: Multiple log entries created

## Common Questions

**Q: What if crew doesn't submit actuals?**
A: System uses estimated quantities (fallback logic)

**Q: What if actual qty matches estimated?**
A: No adjustment, variance = 0, no log entry

**Q: What if crew uses MORE than estimated?**
A: Automatically deducts the difference

**Q: Can I see what was estimated vs actual?**
A: Yes, check reconciliation JSON in estimate record

**Q: Where do I find variance entries?**
A: Google Sheets → Logs sheet, search job ID

**Q: Does this affect P&L?**
A: Yes, P&L now reflects actual costs (more accurate)

**Q: Can variance be prevented?**
A: No - it's tracked and logged, not prevented

**Q: Who gets notified of variance?**
A: Logged for admin review (future: can add notifications)

## Implementation Status

✅ **Code Complete** - All logic implemented, no errors
⏳ **Manual Testing** - Awaiting real job submission tests
🚀 **Ready for Deployment** - After verification

## Next Actions

1. Test with real job submission
2. Verify warehouse counts updated
3. Verify logs created correctly
4. Verify P&L reflects actual costs
5. Deploy to production

---

**For detailed testing instructions**: See [VARIANCE_RECONCILIATION_TEST.md](VARIANCE_RECONCILIATION_TEST.md)

**For complete documentation**: See [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md)
