# Migration Notes

CodeBridge AI reimplements Question2Answer (Q2A) 1.8 on Express, PostgreSQL and React. Q2A itself is not installed and none of its PHP code runs. The Q2A source was used only as a reference: rules come from [the source analysis](q2a-analysis.md), and the interface reproduces the layout, palette and breakpoints of the default SnowFlat theme with original CSS and markup (no Q2A files are copied, because Q2A is GPL-licensed). Q2A behaviour below refers to a default v1.8.8 install.

## Feature coverage

| Q2A feature | CodeBridge implementation |
| --- | --- |
| Questions, answers, comments | Questions, answers and comments on questions or answers. Comment "reply" opens the comment form, as in Q2A. |
| Voting | Up and down votes on questions and answers, changeable and removable. No voting on your own posts. |
| Best answer | The asker, or an editor and above, selects or clears the best answer. It is listed first with Q2A's green check. |
| Categories | Two levels (category and subcategory), with an administrator editor, a category sidebar widget and a browse page. |
| Tags | Up to 5 lowercase tags per question, tag pages and the popular tags page. |
| Search | Word search across titles, details and tags, ranked by matches. |
| Sorting | Recent, Hot!, Most votes, Most answers, Most views; unanswered by no answer, no selected answer and no upvoted answer. |
| Activity | Home page "Recent questions and answers" with the latest event per question, and per-user activity. |
| User profiles | Member for, level title, name, location, website, about, score and rank, post and vote counts, recent activity, all questions and answers. |
| Reputation | Q2A default point rules: base 100, ×10 multiple; asking 2, answering 4, selecting 3, being selected 30, each vote cast 1, net question votes received 1 (capped at +10/−3), net answer votes received 2 (capped at +20/−5). Computed live by the `user_points` view. |
| Users | Top scoring, newest, special (non-basic levels) and blocked users. |
| User levels | Registered user, Expert, Editor, Moderator, Administrator, with Q2A's default permission levels for editing, hiding, reshowing, deleting and selecting. |
| Moderation | Flags with automatic hiding at 5 flags, unflag, clear flags, hide/reshow of questions, answers and comments, permanent deletion of hidden posts, closing as a duplicate or with a reason, reopening, blocking users. |
| Favorites | Favorite questions, users and tags, with Q2A's star. |
| Administration | General options (site name, sidebar welcome text, footer), users and levels, categories, statistics, flagged and hidden posts, plus CodeBridge's API usage statistics. |
| Ask page | Q2A field labels, category select, similar-question check while typing, plus **Improve with AI**. |
| Layout | Top bar with icon navigation and account drop-down (including Q2A's inline login), sub-navigation, blue page heading, sidebar search, welcome box, categories, related questions and activity counts, footer, and SnowFlat's responsive menus. |

## Deliberate differences

| # | Area | Q2A behaviour | CodeBridge behaviour | Reason |
|---|---|---|---|---|
| 1 | Anonymous browsing | Anyone can view questions, tags and users. | Login is required for every question, user and browsing endpoint; visitors see the Q2A layout, the welcome box and activity counts on the login and register pages. | The course requires API consumption per authenticated user, and `api_usage.user_id` cannot be null. |
| 2 | Deleting your own question | Only moderators can delete, and only hidden posts. | An owner may still permanently delete their visible question while it has no answers or comments (Milestone 1 behaviour, kept so existing workflows do not break). Once it has responses the API returns 409 and the owner must hide it instead. | Preserves existing functionality. |
| 3 | Viewing your own hidden question | The owner can still open it. | Only editors, moderators and administrators can open hidden questions; the owner receives 403. | Milestone 1 rule, covered by the existing integration tests. |
| 4 | Post editor | CKEditor 4 with the full toolbar for questions and answers. | A CKEditor-style toolbar (format, lists, quote, alignment, bold, italic, underline, strikethrough, subscript, superscript, text colour, link, image, table, horizontal line, special characters, undo/redo, remove format) without font family and font size menus. Questions and answers are stored as HTML (`format = 'html'`) after `sanitize-html` removes scripts, event handlers, unsafe styles and non-http(s) URLs; the browser sanitizes again with DOMPurify before display. Comments and Milestone 1 posts stay plain text (`format = ''`). | Q2A look with an explicit allowlist against stored XSS. |
| 5 | Edit time | `updated` is empty until the first edit. | `updated_at` starts as the creation time and changes on every edit, hide and reshow. | Simpler handling. |
| 6 | 4-byte characters such as emoji | Removed from titles and bodies. | Kept and measured in UTF-16 code units. | PostgreSQL stores them; the editor and API share JavaScript length rules. |
| 7 | Duplicate questions | Refused when identical to one of the 5 newest questions. | Accepted; the Ask page instead shows Q2A's "check your question was not asked already" list. | Not part of the course requirements. |
| 8 | Points | Cached in `qa_userpoints` and recalculated by an administrator. | Calculated on read by a PostgreSQL view, so there is no "recalculate points" button. Hidden posts never count. | Always consistent without background jobs. |
| 9 | Super administrator | Separate level above Administrator. | Administrator is the highest level; an administrator cannot change their own level or block themselves. | The course defines one administrator role. |

## Not implemented

These Q2A features are outside the course scope and have no equivalent: email notifications and email confirmation, password reset by email, private messages and user walls, avatars, RSS feeds, the plugin and widget system, custom pages, themes and languages, the approval queue for new users or posts (Q2A's "Moderate"), spam CAPTCHA, IP blocking, the mailing list, converting an answer to a comment, "ask a related question", vote counts on comments (off by default in Q2A), and Q2A's per-option permission editor (levels use Q2A's defaults).

## Migration steps

1. Back up the database (see [database](database.md#updating-tables-or-starting-over) and [production](production.md#back-up-initialize-or-migrate-postgresql)).
2. Apply `backend/db/schema.sql` to the existing database. It is additive and safe to re-run: existing users, questions, hidden state and API usage are preserved; usernames are generated for existing accounts; the role check is widened to the five Q2A levels.
3. For the Compose stack, rerun the `migrate` service so `deploy/migrate.sql` grants the application role access to the new tables, sequences and the `user_points` view. The PM2 deployment uses the database owner and needs no extra grants.
4. Deploy the backend and then the frontend. `CLIENT_ORIGIN`, cookie settings and `VITE_API_BASE_URL` are unchanged.
5. Existing users log in with their email (or their new username, shown on their profile and editable under My account).
6. Optionally create categories under Admin > Categories, and promote trusted users to Editor or Moderator from their profiles.

## Milestone 1 question rules still in force

| # | Rule | Q2A result | CodeBridge |
|---|---|---|---|
| 1 | Title length | 12–120 characters | 12–120 |
| 2 | Body length | 0–12000 | 0–12000 |
| 3 | Editing another user's question | Editor level and above | Editor, moderator and administrator |
| 4 | Record of the last editor | `lastuserid` | `last_edited_by` |
| 5 | Hidden questions in lists | Never listed | Never listed; administrators use Admin > Hidden |
| 6 | Editing a hidden question | Not possible | 409 for editors and above until reshown, 403 for others |
