# Small project team

Use the host's native planning, tasks and delegation. In small-team mode, delegate useful
independent work to the Designer, Builder or Reviewer; the main agent can coordinate as Planner.
Keep at most four active roles. In solo mode, or without native delegation, perform the roles
sequentially and label the review as self-review. Small changes need only relevant roles.

Role briefs live in `.ai-team/roles/`. Pass each worker the relevant brief, project constraints,
acceptance criteria, files and selected skill paths. Give concurrent writers separate files;
use the host's coordination features rather than a second task tracker.

Shared context: `docs/PROJECT-BRIEF.md`, `docs/DESIGN-CONTRACT.md`, `docs/HANDOFF.md` and the
selected skills listed in `.ai-toolkit/catalog.json`. The catalog records their native directory.
Load only relevant skill bodies. For more expertise, search the central toolkit checkout with
`python toolkit.py search <topic> --limit 8`, then use its skill-management commands.

The Designer owns visual decisions and a representative preview; the Builder implements the
agreed behavior; the Reviewer checks acceptance criteria and reports concrete findings.
The coordinator updates the brief and short handoff note at meaningful milestones. There is no
toolkit agent runtime, task database or session manager. These files do not launch agents.

Selected execution mode: **small**.
