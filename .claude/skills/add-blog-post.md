---
name: add-blog-post
version: 1.0
summary: Create or update blog posts in the repository and add associated images/metadata.
triggers:
  - "add blog post"
  - "create blog post"
  - "publish post"
---

Purpose
Create, update, and publish blog posts for the site. This skill standardizes where post files live, the expected frontmatter fields, image handling, and safety constraints so agentic workflows can add content predictably.

Capabilities
- Read: `content/posts/` (or fallback `public/posts/`), `README.md`, and relevant templates under `public/` or `views/`.
- Write: create or update Markdown files under `content/posts/`, add images under `public/images/posts/`, and update an index file `content/posts/index.json` if present.
- External: no external network calls by default (explicit permission required).

Constraints & Safety
- Never modify server code, auth files, or `data/*.json` (production data) unless explicitly requested and approved.
- Do not add binary files larger than 5 MB without user confirmation.
- Ensure all file writes are idempotent: creating a post with the same slug should update, not duplicate.
- Sanitize filenames and slugs to use lowercase, hyphens, and ASCII alphanumerics only.
- Do not publish posts automatically to any external hosts or trigger deployments — leave that to an explicit deploy step.

Post format
- Files are Markdown with YAML frontmatter. Example frontmatter fields:
  - `title`: string
  - `slug`: short-hyphenated-string (used for filenames/URLs)
  - `date`: ISO 8601 date string
  - `author`: name or id
  - `summary`: short description (1-2 sentences)
  - `tags`: list of strings

Examples
- Input: "Add a post announcing summer registration opens on 2026-09-10 with an image."
  Output: Creates `content/posts/summer-registration-opens-2026-09-10.md` with frontmatter and uploads image to `public/images/posts/summer-registration.jpg` (or references provided image). Adds entry to `content/posts/index.json` if present.

- Input: "Update the 'Robotics class' post to change the date and add a new image."
  Output: Edits `content/posts/robotics-class.md` updating `date`, and replaces/creates `public/images/posts/robotics-class-2.png` (asks for confirmation before overwriting large images).

Implementation notes
- Preferred post directory: `content/posts/`. If it doesn't exist, the agent should create it and note that to the user.
- Preferred image directory: `public/images/posts/`.
- Slug generation: derive from `title` by lowercasing, replacing spaces with `-`, removing unsafe chars, and truncating to ~60 chars.
- If `content/posts/index.json` exists, keep it sorted by `date` descending and update atomically (write to temp file then rename).

Commands (suggested to run locally)
```bash
# create skills dir if missing
mkdir -p .claude/skills
# open or edit the new skill file
${EDITOR:-vi} .claude/skills/add-blog-post.md
```

Change log
- 1.0 initial
