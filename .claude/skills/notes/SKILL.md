---
name: notes
description: Create, update, or verify .notes implementation documents so readers understand why the code is written the way it is.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Write, Edit, Agent, Bash
argument-hint: [verify]
---

# Implementation Notes

Create, update, or verify `.notes/` documents. These are shared implementation notes committed to the repository.

**Goal**: A reader should understand **why** every implementation choice was made just by reading the document — without needing to read the source code.

## Commands

- `$ARGUMENTS` = (empty) — Auto-detect recent implementation, then create or update a step document
- `$ARGUMENTS` = `verify` — Verify all docs against source code, style, and cross-references

---

## Creating / Updating a Step Document

### 1. Auto-detect what to document

1. Run `git log --oneline -10` to see recent commits
2. Run `git diff HEAD~N --name-only` to identify changed files (adjust N based on scope)
3. Determine the phase from changed file paths:
   - `packages/api/` or `packages/shared/` → phase1
   - `packages/vscode-extension/` → phase2
   - New top-level package → new phase
4. Read existing `.notes/phase{N}/` to find the latest step number
5. Check if changes belong to an existing step (update) or a new step (create)

**If creating**: Increment step number, generate slug. Present for confirmation:

```
Proposed: .notes/phase2/step7-keyboard-navigation.md
Title: Phase2 Step7: キーボードナビゲーション
Based on: commits abc1234..def5678 (3 commits, 5 files changed)

Proceed? (y/n)
```

**If updating**: Identify the existing document, summarize the proposed changes, and confirm before editing.

### 2. Read the style guide

For formatting conventions and examples, see [style-guide.md](style-guide.md).

### 3. Understand what was implemented

- Read the source files identified in step 1
- Read the spec (`docs/specs/`) for design decisions that motivated the implementation
- Read git log for the relevant commits
- Read adjacent step documents for context and to avoid duplication

### 4. Write the document

**File**: `.notes/phase{N}/step{N}-{slug}.md`

Documents are written in Japanese. Structure:

1. **Title and subtitle** — what was implemented
2. **Concept sections** (unnumbered) — why this implementation exists, motivating the code before showing it
3. **Implementation sections** (numbered) — code examples with explanation blocks for every non-obvious choice
4. **File listing** — files created or changed

### 5. Content requirements

For every implementation choice, the reader should be able to answer:

- **Why this way?** — What problem does it solve?
- **Why not the obvious alternative?** — What goes wrong if you do it differently?
- **Which spec decision drove this?** — Reference `docs/specs/` or `docs/product.md`
- **What's not implemented yet?** — Reference spec Open Issues for known gaps
- **What went wrong during implementation?** — Document mistakes and course corrections, if any occurred

If any of these can't be answered from the document alone, the document is incomplete.

### 6. Verify against source code

After writing, verify:

- Every code snippet matches the actual source
- Every config value matches the actual file
- Command/handler lists are complete
- Cross-references to other steps are accurate
- No contradictions with other step documents

### 7. Update the overview

Add the new step to `.notes/phase{N}/overview.md` step listing.

---

## Verify (`/notes verify`)

Run a comprehensive check on ALL `.notes/` documents:

### Source code accuracy

1. Read every `.notes/phase*/step*.md` and `.notes/phase*/overview.md`
2. For each code snippet, compare against the actual source file
3. For each command/handler table, verify completeness against source
4. For each config value, verify against actual config files

### Style and structure

1. Read [style-guide.md](style-guide.md)
2. Check document structure against the style guide
3. Check formatting conventions (section headers, explanation blocks, tables)

### Content quality

1. For each implementation choice: can a reader understand WHY without reading source code?
2. Are spec connections present where applicable?
3. Are unimplemented features noted with spec Open Issues references?
4. Are there "what goes wrong" explanations for non-obvious choices?

### Cross-document consistency

1. No duplicate explanations across files (reference instead of repeat)
2. Cross-references point to correct content
3. Later steps note when earlier code was changed
4. Consistent terminology across all documents

Report all issues organized by file with severity:

- **High**: Code snippet doesn't match source, or a design choice has no WHY explanation
- **Medium**: Formatting doesn't follow style guide, or cross-reference is inaccurate
- **Low**: Minor wording improvements, redundant content
