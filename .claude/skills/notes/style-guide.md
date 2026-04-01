# Style Guide for .notes Documents

All .notes documents are written in **Japanese**. This guide defines the formatting conventions in English.

## Directory Structure

```
.notes/
├── phase1/
│   ├── overview.md
│   ├── step1-monorepo-setup.md
│   └── ...
└── phase2/
    ├── overview.md
    ├── step1-extension-setup.md
    └── ...
```

## Document Layout

Every step document follows this order:

1. Title and subtitle
2. Concept sections (unnumbered) — before implementation
3. Implementation sections (numbered)
4. File listing

## Title and Subtitle

Format: `# Phase{N} Step{N}: Title`

A one-line subtitle follows the title, describing what was implemented. Two blank lines between subtitle and first section.

## Concept Sections

Unnumbered sections placed before implementation sections. They explain the problem or concept that motivates the code that follows.

Must directly motivate the implementation — not a reference listing.

**Good** (motivates implementation):
> Section titled "Multi-panel management challenges" lists 4 concrete challenges (duplicate prevention, cleanup, event broadcast, data consistency). EditorManager's Map pattern naturally follows.

**Bad** (reference listing):
> Section titled "What is WebviewPanel" lists the API surface without connecting to why EditorManager exists.

## Implementation Sections

Numbered. File paths go in the body text (not the header), typically as a backtick-formatted path on its own line immediately after the header:

```markdown
## 1. SidebarProvider

`extension/sidebar.ts`

Content here...
```

Sub-sections use `###`.

## Explanation Blocks

Every non-trivial code block is followed by `**Key takeaways**:` with bullet points. Each bullet explains one choice and its rationale.

**Bad** (states what, not why):

```
- strict: true — enables strict mode
```

**Good** (explains why and consequence):

```
- strict: true — enables strictNullChecks etc. Catches null-check omissions at compile time
- --external:vscode — vscode module is provided by the VS Code runtime; bundling it causes resolution errors
- retainContextWhenHidden: true — consumes memory, but prevents input loss when switching tabs
```

**Good** (explains what goes wrong with the alternative):

```
Why lazy initialization: calling postgres() at module level triggers a DB connection on import.
Even with mocks, the connection fires and tests fail when DATABASE_URL is unset.
```

## Tables

Use tables for:
- Config field explanations
- Package/dependency descriptions
- Command/handler listings
- Comparison of alternatives

## Cross-step References

Be specific when referencing other steps:

```
Reuses the Map pattern established in step 4.
```

When code from a previous step was changed in a later step, add a blockquote:

```
> **Note**: Migrated to Tailwind in step 6. CSSProperties constants were removed. The code below reflects the step 5 implementation.
```

## File Listing (Last Section)

Two variants:
- `## Files created` — when the step only creates new files
- `## Files changed` — when the step modifies existing files

Each line: file path followed by a `#` comment with a brief description.

## Overview Files

Each phase has `.notes/phase{N}/overview.md`:

- Title format: `# Phase{N} Overview: Title`
- Contains architecture diagram, step listing, and development approach
- Step listing must be updated when new steps are added

## Language Rules

- Body text: Japanese
- Technical terms: English (CSS, TypeScript, Tailwind)
- Code identifiers: English in backticks (`useCommand`, `threads.list`)
- Section headers: Japanese (file paths go in body text, not headers)
