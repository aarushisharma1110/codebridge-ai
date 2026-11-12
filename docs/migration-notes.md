# Migration Notes

This file records every place where the Node.js question API knowingly behaves differently from the original Question2Answer (Q2A) PHP application, and why. It feeds the testing and verification section of the final report.

There are two kinds of difference:

- **Deliberate:** a course requirement forces different behaviour. We keep the difference and record the reason here.
- **Accidental:** the migrated code gets a Q2A rule wrong. We find these with the comparison checks, fix them, and record the fix here.

## Deliberate differences

| # | Area | Q2A behaviour | CodeBridge behaviour | Reason |
|---|---|---|---|---|
| 1 | Listing questions (`GET /api/v1/questions`) | Anonymous visitors can read the question list by default. | Login is required; a request without a valid session gets 401. | The course requires API usage to be tracked per authenticated user, and `api_usage.user_id` cannot be null. Anonymous calls could not be counted or shown in the admin statistics. |

## Mismatches found and corrected

None yet. Entries are added when the Q2A comparison checks are run.

| # | Check | Q2A result | Node.js result before fix | Correction |
|---|---|---|---|---|
