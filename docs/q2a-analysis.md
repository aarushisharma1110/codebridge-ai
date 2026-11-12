# Q2A Source Analysis

This document records the question-management rules of the original Question2Answer (Q2A) PHP application, read from its source code. The Node.js question API in `backend/routes/questions.js` is meant to reproduce these rules. Deliberate differences are tracked in [migration-notes.md](migration-notes.md).

## Reference version

| Item | Value |
|---|---|
| Repository | https://github.com/q2a/question2answer |
| Release | v1.8.8 (2023-07-25), the latest tagged release |
| Commit | `5a43593b39778adc4331fdb3f23f7d81fe73e72f` |
| Licence | GPL v2 or later. The Q2A source is kept outside this repository. |

All paths below are relative to `qa-include/` in that commit.

The values are Q2A's defaults for a fresh install. A site administrator can change the lengths and permission levels in the admin panel, so a live Q2A site may behave differently.

## Where the question logic lives

| Concern | File | Function or lines |
|---|---|---|
| Ask page: reads input, validates, creates | `pages/ask.php` | lines 100, 128-131, 170 |
| Edit and delete handling | `pages/question-post.php` | `qa_page_q_edit_q_submit` (424-467); delete at line 113 |
| Validation rules | `plugins/qa-filter-basic.php` | `filter_question` (62-100), `validate_field_length` (152-168) |
| Default option values | `app/options.php` | `qa_default_option` (279, 300, 301, 332-343) |
| Database column limits | `db/maxima.php` | lines 33-34 |
| Who may do what to a post | `pages/question-view.php` | `qa_page_q_post_rules` (156-158, 192-193, 200, 225) |
| Saving an edit | `app/post-update.php`, `db/post-update.php` | `qa_question_set_content` (62); SQL at `db/post-update.php:153` |
| Deleting | `app/post-update.php` | `qa_question_delete` (577-601) |
| Reading and trimming form input | `qa-base.php`, `app/format.php` | `qa_post_text` (1222); `qa_get_post_title` (2200-2204) |
| User levels and permission constants | `app/users.php`, `app/options.php` | lines 27-33; lines 29-40 |

## Validation rules

| Rule | Q2A v1.8.8 | Source |
|---|---|---|
| Title minimum | 12 characters (`min_len_q_title`) | `app/options.php:301` |
| Title maximum | 120 characters (`max_len_q_title`); the hard database cap is 800 | `app/options.php:279`, `db/maxima.php:33` |
| Body minimum | 0 characters, so an empty body is accepted (`min_len_q_content`) | `app/options.php:300` |
| Body maximum | 12000 characters (`QA_DB_MAX_CONTENT_LENGTH`) | `db/maxima.php:34` |
| Trimming | Leading and trailing whitespace is removed before validation | `qa-base.php:1222` |
| Length unit | Characters, not bytes (`mb_strlen` with UTF-8) | `util/string.php:752` |
| Editing some fields | A field that is not submitted is not validated | `plugins/qa-filter-basic.php:158-159` |
| 4-byte characters | Characters outside the Basic Multilingual Plane, such as emoji, are removed from the title and body | `app/format.php:2204`, `2226` |

## Permission rules

Q2A has seven user levels: Basic, Approved, Expert, Editor, Moderator, Admin and Super Admin. CodeBridge has two roles: `user` and `admin`.

| Action | Q2A v1.8.8 | Source |
|---|---|---|
| View a question | Anyone, including anonymous visitors (`permit_view_q_page` = all) | `app/options.php:343` |
| Edit a question | The owner, or any user at Editor level or above. Not possible while the question is hidden or closed. | `pages/question-view.php:156-158`, `app/options.php:336` |
| Hide a question | The owner, or any user at Editor level or above. The row stays in the database but is no longer shown publicly. | `pages/question-view.php:134`, `192-193`, `app/options.php:339` |
| Delete a question | Moderator level or above only, and only if the question is already hidden and has no answers or comments | `pages/question-view.php:200`, `225`; `app/options.php:333`; `app/post-update.php:582` |

An ordinary owner can never permanently delete their own question in Q2A; they can only hide it.

Whether anonymous visitors may ask a question depends on the `ask_needs_login` option (`app/options.php:468-469`). Its default was not verified in this analysis.

## What an edit saves

`db/post-update.php:153` updates the title, content, format and tags, and also sets:

- `updated` to the current time;
- `lastuserid` to the user who made the edit;
- `updatetype` to mark it as a content edit.

## Stability across versions

The same rules were checked in five versions. Only the body maximum has changed.

| Rule | v1.7.0 | v1.8.0 | v1.8.8 | `bugfix` | `dev` |
|---|---|---|---|---|---|
| Title minimum | 12 | 12 | 12 | 12 | 12 |
| Title maximum | 120 | 120 | 120 | 120 | 120 |
| Body minimum | 0 | 0 | 0 | 0 | 0 |
| Body maximum | 8000 | 12000 | 12000 | 12000 | 12000 |
| Edit: owner, or Editor and above | Yes | Yes | Yes | Yes | Yes |
| View: anyone | Yes | Yes | Yes | Yes | Yes |
| Delete: Moderator and above, hidden only | Yes | Yes | Yes | Yes | Yes |

## First Node.js version compared with Q2A

The first version of the question routes was written before this analysis, using provisional rules. This table is the "before" state.

| Rule | Q2A v1.8.8 | First Node.js version | Match |
|---|---|---|---|
| Title minimum | 12 | 1 | No |
| Title maximum | 120 | 255 | No |
| Body minimum | 0 | 1 | No |
| Body maximum | 12000 | 10000 | No |
| Trimming | Yes | Yes | Yes |
| Editing some fields | Unsent fields skipped | Unsent fields skipped (PATCH) | Yes |
| 4-byte characters | Removed | Kept | No |
| View | Anyone | Login required | No (deliberate) |
| Edit by another regular user | Refused | Refused (403) | Yes |
| Edit by an administrator | Allowed | Refused (403) | No |
| Removal by the owner | Hide only | Permanent delete | No |
| Permanent delete | Moderator and above, hidden only | Owner only | No |

Corrections and the differences that are kept on purpose are recorded in [migration-notes.md](migration-notes.md).

## Planned comparison checks

Each check is run with the same input on Q2A v1.8.8 and on the Node.js API, as a logged-in user in both. The outcome compared is whether the request is accepted or rejected and what is stored, not the HTML or JSON response.

| # | Input | Expected in both |
|---|---|---|
| 1 | Create a question with an 11-character title | Rejected |
| 2 | Create questions with titles of 12, 120 and 121 characters | Accepted, accepted, rejected |
| 3 | Create a question with a valid title and an empty body | Accepted |
| 4 | Create a question with spaces around the title | Saved with the spaces removed, owned by that user |
| 5 | A different regular user tries to edit the question | Refused |
| 6 | The owner changes only the title | Title changed, body unchanged, update time set |

Viewing without login and the delete process are not part of the verified selection. They are reported as deliberate differences.
