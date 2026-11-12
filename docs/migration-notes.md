# Migration Notes

This file records every place where the Node.js question API knowingly behaves differently from the original Question2Answer (Q2A) PHP application, and why. It feeds the testing and verification section of the final report.

There are two kinds of difference:

- **Deliberate:** a course requirement forces different behaviour. We keep the difference and record the reason here.
- **Accidental:** the migrated code gets a Q2A rule wrong. We find these with the comparison checks, fix them, and record the fix here.

## Deliberate differences

Q2A behaviour is taken from v1.8.8; see [q2a-analysis.md](q2a-analysis.md) for source references.

| # | Area | Q2A behaviour | CodeBridge behaviour | Reason |
|---|---|---|---|---|
| 1 | Viewing questions (`GET /api/v1/questions` and `GET /api/v1/questions/:id`) | Anonymous visitors can view questions by default. | Login is required; a request without a valid session gets 401. | The course requires API usage to be tracked per authenticated user, and `api_usage.user_id` cannot be null. Anonymous calls could not be counted or shown in the admin statistics. |
| 2 | Removing a question (`DELETE /api/v1/questions/:id`) | The owner can only hide a question. Permanent deletion is limited to Moderator level and above, and only for a hidden question with no answers or comments. | The owner can permanently delete their own question. There is no hide stage, and an administrator cannot delete another user's question. | The course requires a DELETE operation as part of full CRUD. Q2A's hide stage would need a schema change and extra routes, which is outside the committed scope. Delete is not part of the verified selection. |
| 3 | Edit time | `updated` is empty until the first edit and is not changed by an edit that changes nothing. | `updated_at` starts as the creation time and is set on every successful edit. | Simpler handling; it does not affect the rules being compared. |
| 4 | 4-byte characters such as emoji | Removed from the title and body. | Kept. | PostgreSQL stores these characters, so they do not need to be removed. |

## Mismatches found and corrected

The first Node.js version was written before the Q2A source was analysed. These mismatches were found by reading the Q2A source and will be confirmed when the comparison checks are run against a local Q2A.

| # | Rule | Q2A result | Node.js result before fix | Correction |
|---|---|---|---|---|
| 1 | Title minimum length | 12 characters | 1 character | Changed to 12. |
| 2 | Title maximum length | 120 characters | 255 characters | Changed to 120. |
| 3 | Body minimum length | 0; an empty body is accepted | 1 character | Changed to 0; a missing body is treated as empty. |
| 4 | Body maximum length | 12000 characters | 10000 characters | Changed to 12000. |
| 5 | Editing another user's question as an administrator | Allowed (Editor level and above) | Refused with 403 | Users with the `admin` role can now edit any question. Regular users can still edit only their own. |
| 6 | Record of the last editor | Stored in `lastuserid` | Not stored | Added a `last_edited_by` column, set to the editing user on every edit. |
