---
name: block-testing-strategy
description: Choose behavior-focused unit, integration and browser checks using the project's actual stack and test commands.
author: goose
version: "1.0"
tags:
  - testing
  - development
  - quality
---

# Evidence for the changed behavior

Choose the layer that can expose the failure. Pure calculations suit unit checks; persistence,
authorization and framework lifecycle need integration checks; navigation, focus, responsive
layout and visible state changes need a running browser. A mock proves behavior against the
mock's contract, not that an external service is configured or compatible.

Use the project's existing runner. Plain HTML may need only a served browser fixture; PHP needs
its actual runtime; WordPress plugin lifecycle needs a disposable WordPress installation. Avoid
introducing a second test framework just to follow a generic example.

Cover the requested user outcome and the failure path that could invalidate it. For data writes,
verify persistence and access boundaries; for UI changes, verify actual interaction and rendering.
Use deterministic isolated data so retrying the check cannot affect live users.

Record commands, observed results and unavailable environments in the project handoff. Select
checks by risk and behavior rather than a blanket coverage percentage or assertion count.
