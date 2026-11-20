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
| 2 | Edit time | `updated` is empty until the first edit and is not changed by an edit that changes nothing. | `updated_at` starts as the creation time and is set on every successful edit, hide and reshow. | Simpler handling; it does not affect the rules being compared. |
| 3 | 4-byte characters such as emoji | Removed from the title and body. | Kept. | PostgreSQL stores these characters, so they do not need to be removed. |
| 4 | Duplicate check: how text is split into words | Compares the body as stored by its editor (HTML) and replaces a fixed list of non-ASCII punctuation marks with spaces. | Compares the plain-text body and treats all non-ASCII punctuation and symbols as separators. | CodeBridge has no HTML editor. Titles and plain-text bodies give the same result in both. |

## Mismatches found and corrected

The first Node.js version was written before the Q2A source was analysed. Rows 1-6 were found by reading the Q2A source, rows 7-10 by running Q2A locally. All were confirmed against a local Q2A v1.8.8 on 2026-11-18 (see the results in [q2a-analysis.md](q2a-analysis.md)).

| # | Rule | Q2A result | Node.js result before fix | Correction |
|---|---|---|---|---|
| 1 | Title minimum length | 12 characters | 1 character | Changed to 12. |
| 2 | Title maximum length | 120 characters | 255 characters | Changed to 120. |
| 3 | Body minimum length | 0; an empty body is accepted | 1 character | Changed to 0; a missing body is treated as empty. |
| 4 | Body maximum length | 12000 characters | 10000 characters | Changed to 12000. |
| 5 | Editing another user's question as an administrator | Allowed (Editor level and above) | Refused with 403 | Users with the `admin` role can now edit any question. Regular users can still edit only their own. |
| 6 | Record of the last editor | Stored in `lastuserid` | Not stored | Added a `last_edited_by` column, set to the editing user on every edit. |
| 7 | Removing a question | The owner or an administrator hides it; only an administrator can permanently delete it, and only once it is hidden | The owner deleted it permanently; no hide stage | Added a `hidden` column and `POST /:id/hide` and `POST /:id/reshow`. `DELETE` is now admin-only and only for hidden questions. The owner may reshow only if they hid it themselves. |
| 8 | Viewing a hidden question | Left out of every question list; shown only to its owner and administrators; administrators also have a list of hidden questions | Not applicable (no hiding) | `GET /` leaves hidden questions out; `GET /:id` returns 403 to everyone else; new admin-only `GET /hidden`. |
| 9 | Editing a hidden question | Not possible for anyone until it is reshown | Not applicable | `PATCH` returns 409 for a hidden question. |
| 10 | Duplicate question | Refused if the title and body have the same words as one of the 5 newest visible questions | Accepted | Same check on create; refused with 409. |
