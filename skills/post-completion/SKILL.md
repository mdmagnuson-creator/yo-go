---
name: post-completion
description: "Post-completion polish steps for Developer. Use when all PRD stories pass but before declaring COMPLETE. Triggers on: post-completion, polish, aesthetic review, support articles, final checks."
---

# Post-Completion Polish

> Load this skill when: All PRD stories pass but BEFORE declaring COMPLETE.

## Overview

After ALL stories pass, run these polish steps before marking the PRD complete.

---

## Step A: Full Aesthetic Review

If ANY stories modified UI files (`.tsx`, `.jsx`, `.css`, `.scss`):

1. **Gather all UI files changed across the feature:**
   - Get base branch from `docs/project.json` → `git.defaultBranch` (defaults to `main`)
   ```bash
   git diff <baseBranch>...HEAD --name-only | grep -E '\.(tsx|jsx|css|scss)$'
   ```

2. **Invoke @aesthetic-critic with the full list:**
   ```
   @aesthetic-critic: Full feature review before release.
   
   Changed UI files:
   [list all changed UI files]
   
   Mode: full (include Warnings)
   ```

3. **Read `docs/aesthetic-review.md`**

4. **Handle results:**
   - Critical issues → Fix them and re-commit before proceeding
   - Only Warnings → Note them in progress.txt but proceed

---

## Step B: Generate Missing Support Articles

Read the PRD and for each story where `supportArticleRequired: true`:

1. **Check if support article was already created** during that story (look for recent migrations or markdown files)

2. **If support article is missing**, invoke @support-article-writer:
   ```
   @support-article-writer: Create support article for feature.
   
   Story: [US-XXX] [Title]
   Description: [story description]
   Acceptance criteria: [list]
   Documentation type: [new/update from PRD]
   Article slug: [slug from PRD]
   Changed files: [list of files changed by this story]
   ```

3. **Wait for support-article-writer to complete**

4. **Commit documentation changes:** `docs: add support article for [feature]`

---

## Step C: Final Screenshot Check

1. **Read `docs/marketing/screenshot-registry.json`** (if exists)

2. **Get all files changed in the feature:**
   - Use base branch from `docs/project.json` → `git.defaultBranch`
   ```bash
   git diff <baseBranch>...HEAD --name-only
   ```

3. **Compare against `sourceComponents` in registry**

4. **If any screenshots need updating**, invoke @screenshot-maintainer:
   ```
   @screenshot-maintainer: Final screenshot check for feature.
   
   All changed files:
   [list of all changed files across feature]
   ```

5. **Also check if new support articles were created** that need screenshots

6. **Commit any screenshot updates:** `docs: update product screenshots`

---

## Step D: Copy Review for New Articles

If new support articles were created during Step B:

1. **Invoke @copy-critic** on the new article content (read the migration file or markdown)

2. **If Critical feedback exists**, update the article before proceeding

3. **Commit any copy improvements:** `docs: improve support article copy`

---

## Completion

After all polish steps complete, proceed to Phase 4 completion steps in the main developer flow.
