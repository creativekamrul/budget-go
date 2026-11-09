# Project working agreements

Read `docs/PROJECT-BRIEF.md`, `docs/DESIGN-CONTRACT.md`, `docs/HANDOFF.md` and `.ai-team/TEAM.md`.
The agent harness provides execution. Use its native file editing, search, commands, connected
tools and delegation where available. These project resources add domain guidance and quality
criteria; they do not replace the harness or require alternative tools for basic operations.
Stack: **Next.js + TypeScript + Tailwind / shadcn**. Visual direction: **Glassmorphism**.
User choices override generic aesthetics in optional skills. Do not default every project to
React or a restrained business look. Preserve the selected stack and existing project constraints.

The Planner coordinates scope and handoffs, the Designer owns the design contract, the Builder
implements, and the Reviewer checks evidence. Follow ownership in `.ai-team/TEAM.md`.
In small-team mode, use native subagents when available for useful independent work;
otherwise perform the named roles sequentially. Do not invent an agent process or successful
handoff. These portable role definitions do not themselves launch agent infrastructure.

<!-- toolkit:skills:start -->
Only these project skills were installed:

- `block-testing-strategy`: Choose behavior-focused unit, integration and browser checks using the project's actual stack and test commands.
- `design-foundations`: Turn a selected visual style into a usable design system, responsive layout and component states without prescribing a single aesthetic.
- `frontend-implementation`: Implement React or Next.js state, rendering and interaction boundaries while preserving the project's design contract.
Selected skill files live in `.agents/skills/`; let the harness discover and load them.
<!-- toolkit:skills:end -->

Search the central checkout with `python toolkit.py search <topic> --limit 8` when more expertise is needed.
Use `python toolkit.py skills add --project <project> --skill <id> --dry-run` from the central
checkout to preview additions. Updates preserve working documents and stop on conflicting skill edits.
Keep `docs/HANDOFF.md` short: current state, key decisions, actual checks, blockers and next step.
A new chat reads that note and verifies the current files. Use native session resume when available.
For visible UI, agree a representative design preview and record tokens/states in the design contract
before expanding the application. Run the checks in docs/QUALITY-CHECKS.md; report unavailable checks.

# Next.js + TypeScript + Tailwind / shadcn

Inspect App Router versus Pages Router and installed versions. Reuse the existing Tailwind/shadcn configuration. Keep secrets and privileged logic on the server; add client boundaries only for interaction. Read actual package scripts before running checks.

Follow the selected design contract. Detect and use available validation commands; this preset does not install application dependencies or choose framework versions.
