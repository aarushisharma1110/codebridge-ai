// Optional Q2A demo content: categories, questions, answers, comments, votes and a best answer.
// Run with `npm run seed:demo -- --content` against a disposable database only.
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcrypt');

const CATEGORIES = [
    { title: 'Q2A Core', slug: 'q2a-core', description: 'Installing, configuring and customizing the Q&A site', children: [] },
    { title: 'Plugins', slug: 'plugins', description: 'Writing and using plugins and widgets', children: [] },
    { title: 'Themes', slug: 'themes', description: 'Layouts, styles and theme customization', children: [] },
    { title: 'Web Development', slug: 'web-development', description: 'Front-end and back-end web questions', children: [
        { title: 'React', slug: 'react', description: 'Components, hooks and state' },
        { title: 'Node.js', slug: 'nodejs', description: 'Express, npm and server-side JavaScript' }
    ] },
    { title: 'Databases', slug: 'databases', description: 'SQL, PostgreSQL and data modelling', children: [] }
];

// Oldest first; the last entries become the most recent activity.
const QUESTIONS = [
    { by: 'devon', cat: 'react', tags: 'react hooks useeffect', title: 'Why does my useEffect run twice in development?',
      body: 'My effect fetches data and I can see two network requests when the component mounts. Is this a bug in my code?',
      answers: [
          { by: 'maria', body: 'React 18 Strict Mode mounts, unmounts and remounts components in development to surface missing cleanup. Return a cleanup function that aborts the request.', best: true, votes: 3 },
          { by: 'jalsa', body: 'Check whether the component is rendered twice by its parent too. In production builds Strict Mode does not double-invoke effects.', votes: 1 }
      ], comments: [{ by: 'maria', body: 'Are you using React.StrictMode in main.jsx?' }], votes: 4, views: 312 },
    { by: 'maria', cat: 'nodejs', tags: 'express cors cookies', title: 'How do I send HttpOnly cookies across origins with Express?',
      body: 'My React app on Netlify calls an Express API on another domain. The login works but the browser never sends the session cookie back.',
      answers: [{ by: 'devon', body: 'Set credentials: "include" on fetch, enable credentials in the cors middleware with an exact origin, and set the cookie with SameSite=None and Secure.', votes: 2 }],
      comments: [], votes: 2, views: 148 },
    { by: 'jalsa', cat: 'databases', tags: 'postgresql performance indexes', title: 'When should I add an index to a PostgreSQL column?',
      body: 'Queries on my questions table are getting slower as it grows. How do I decide which columns need an index?',
      answers: [], comments: [{ by: 'maria', body: 'Run EXPLAIN ANALYZE on the slow query first and share the plan.' }], votes: 1, views: 87 },
    { by: 'mastershivasaiji', cat: 'plugins', tags: 'plugins widgets sidebar', title: 'How do I add a custom widget to the sidebar?',
      body: 'I want to show a list of my latest blog posts in the sidebar on every page. Should this be a widget plugin or a layer?',
      answers: [{ by: 'jalsa', body: 'Write a widget plugin: register it in metadata.json and qa-plugin.php, then add it to the side panel from Admin > Layout.', votes: 2 }],
      comments: [], votes: 2, views: 421 },
    { by: 'devon', cat: 'themes', tags: 'theme database snowflat', title: 'Which Database Entry do I alter for Default Theme?',
      body: 'I uploaded a broken theme and can no longer reach the admin pages. Which database setting stores the site theme so I can change it back?',
      answers: [
          { by: 'maria', body: 'The theme is stored in the options table under the name site_theme. Set it back to SnowFlat and reload the page.', best: true, votes: 3 },
          { by: 'mastershivasaiji', body: 'You can also rename the broken theme folder; the site then falls back to the default theme.', votes: 1 }
      ], comments: [], votes: 2, views: 1534 },
    { by: 'mastershivasaiji', cat: 'q2a-core', tags: 'profile customization community guidelines links',
      title: 'How to properly add or format website and portfolio links in a Q2A community profile?',
      body: 'Where should I put my website and portfolio links on my profile, and how do I make sure they show up as clickable links?',
      answers: [{ by: 'jalsa', body: 'Use the Website field under My account for your main link and list other portfolio links in the About field, one per line. Links that start with https:// are shown as clickable links.', votes: 0 }],
      comments: [], votes: 0, views: 196 },
    { by: 'maria', cat: 'q2a-core', tags: '-q2a', title: 'How to change homepage title in Q2A?',
      body: 'The browser tab and the top of my home page still show the default name. Where do I change the title of the site?',
      answers: [
          { by: 'devon', body: 'Go to Admin > General and change the Q&A site name, then save. The new name is used in the logo and the browser title.', best: true, votes: 2 },
          { by: 'jalsa', body: 'If you want a different heading only on the home page, edit the home page language string or use a custom theme layer.', votes: 0 }
      ], comments: [], votes: 1, views: 956 }
];

async function seedDemoContent(db) {
    const { rows: [{ count }] } = await db.query('SELECT COUNT(*)::int AS count FROM categories');
    if (count) return false; // Already seeded or curated by an administrator.

    await db.query('BEGIN');
    try {
        const users = {};
        const unusable = await bcrypt.hash(randomBytes(32).toString('hex'), 4);
        for (const handle of ['maria', 'devon', 'jalsa', 'mastershivasaiji']) {
            const { rows: [row] } = await db.query(
                `INSERT INTO users (email, password_hash, handle) VALUES ($1, $2, $3)
                 ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`,
                [`${handle}@example.test`, unusable, handle]);
            users[handle] = row.id;
        }
        const categories = {};
        for (const [position, category] of CATEGORIES.entries()) {
            const { rows: [row] } = await db.query(
                'INSERT INTO categories (title, slug, description, position) VALUES ($1, $2, $3, $4) RETURNING id',
                [category.title, category.slug, category.description, position]);
            categories[category.slug] = row.id;
            for (const [childPosition, child] of category.children.entries()) {
                const { rows: [childRow] } = await db.query(
                    'INSERT INTO categories (title, slug, description, parent_id, position) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                    [child.title, child.slug, child.description, row.id, childPosition]);
                categories[child.slug] = childRow.id;
            }
        }

        const voters = Object.values(users);
        for (const [index, q] of QUESTIONS.entries()) {
            const created = new Date(Date.now() - (QUESTIONS.length - index) * 3600 * 1000 * 9);
            const { rows: [question] } = await db.query(
                `INSERT INTO questions (user_id, title, body, category_id, created_at, updated_at, views)
                 VALUES ($1, $2, $3, $4, $5, $5, $6) RETURNING id`,
                [users[q.by], q.title, q.body, categories[q.cat], created, q.views]);
            for (const [position, tag] of q.tags.split(' ').entries()) {
                await db.query('INSERT INTO question_tags (question_id, tag, position) VALUES ($1, $2, $3)', [question.id, tag, position]);
            }
            for (const voter of voters.filter((id) => id !== users[q.by]).slice(0, q.votes)) {
                await db.query('INSERT INTO question_votes (user_id, question_id, vote) VALUES ($1, $2, 1)', [voter, question.id]);
            }
            for (const [offset, a] of q.answers.entries()) {
                const { rows: [answer] } = await db.query(
                    `INSERT INTO answers (question_id, user_id, body, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) RETURNING id`,
                    [question.id, users[a.by], a.body, new Date(created.getTime() + (offset + 1) * 1800 * 1000)]);
                for (const voter of voters.filter((id) => id !== users[a.by]).slice(0, a.votes)) {
                    await db.query('INSERT INTO answer_votes (user_id, answer_id, vote) VALUES ($1, $2, 1)', [voter, answer.id]);
                }
                if (a.best) await db.query('UPDATE questions SET selected_answer_id = $1 WHERE id = $2', [answer.id, question.id]);
            }
            for (const c of q.comments) {
                await db.query(
                    'INSERT INTO comments (question_id, user_id, body, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)',
                    [question.id, users[c.by], c.body, new Date(created.getTime() + 600 * 1000)]);
            }
        }
        await db.query('COMMIT');
        return true;
    } catch (error) {
        await db.query('ROLLBACK');
        throw error;
    }
}

module.exports = seedDemoContent;
