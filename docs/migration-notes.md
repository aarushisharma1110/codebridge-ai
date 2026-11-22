# Migration Notes

This file compares the current CodeBridge question API with the Question2Answer (Q2A) PHP application. The [Q2A source analysis](q2a-analysis.md#comparison-checks-and-results) preserves the historical test results for commit `b4dc5b4`.

## Deliberate differences

Q2A behaviour is taken from v1.8.8; see [q2a-analysis.md](q2a-analysis.md) for source references.

| # | Area | Q2A behaviour | CodeBridge behaviour | Reason |
|---|---|---|---|---|
| 1 | Viewing questions (`GET /api/v1/questions` and `GET /api/v1/questions/:id`) | Anonymous visitors can view questions by default. | Login is required; a request without a valid session gets 401. | The course requires API usage to be tracked per authenticated user, and `api_usage.user_id` cannot be null. Anonymous calls could not be counted or shown in the admin statistics. |
| 2 | Edit time | `updated` is empty until the first edit and is not changed by an edit that changes nothing. | `updated_at` starts as the creation time and is set on every successful edit, hide and reshow. | Simpler handling; it does not affect the rules being compared. |
| 3 | 4-byte characters such as emoji | Removed from the title and body. Q2A measures length with `mb_strlen`. | Kept and measured in UTF-16 code units by the JavaScript editor and API. An emoji outside the Basic Multilingual Plane counts as two units. | PostgreSQL stores these characters. The frontend and API use the same JavaScript length calculation. |

## Current question behavior

The historical comparison informed the current implementation. The CodeBridge column reflects the current [question routes](../backend/routes/questions.js).

| # | Rule | Q2A result | Initial Node.js behavior | Current CodeBridge behavior |
|---|---|---|---|---|
| 1 | Title minimum length | 12 characters | 1 character | Changed to 12. |
| 2 | Title maximum length | 120 characters | 255 characters | Changed to 120. |
| 3 | Body minimum length | 0; an empty body is accepted | 1 character | Changed to 0; a missing body is treated as empty. |
| 4 | Body maximum length | 12000 characters | 10000 characters | Changed to 12000. |
| 5 | Editing another user's question as an administrator | Allowed (Editor level and above) | Refused with 403 | Administrators can edit any visible question. Regular users can edit their own visible questions. |
| 6 | Record of the last editor | Stored in `lastuserid` | Not stored | Added a `last_edited_by` column, set to the editing user on every edit. |
| 7 | Removing a question | The owner or an administrator hides it; only an administrator can permanently delete it, and only once it is hidden | The owner deleted it permanently; no hide stage | Owners and administrators can hide visible questions within their permissions. Hiding returns 204 to regular owners and 200 with the updated question to administrators. Only administrators can reshow or delete hidden questions. Owners retain deletion of their visible questions. |
| 8 | Viewing a hidden question | Left out of every question list; shown only to its owner and administrators; administrators also have a list of hidden questions | Not applicable (no hiding) | `GET /` omits hidden questions for every role. `GET /hidden` and hidden details are administrator-only. Regular users receive 403, including owners. |
| 9 | Editing a hidden question | Not possible for anyone until it is reshown | Not applicable | With a valid update body, `PATCH` returns 409 to administrators until they reshow the question and 403 to regular users. |
| 10 | Duplicate question | Refused if the title and body have the same words as one of the 5 newest visible questions | Accepted | The create route accepts repeated title and body values when they pass validation. The recent-question check was present in the historical comparison commit. |
