---
name: frontend-implementation
description: "Implement React or Next.js state, rendering and interaction boundaries while preserving the project's design contract."
---

# React and Next.js decisions

Match the installed router and framework version. In Next.js, keep privileged data access on
the server and place client boundaries where browser APIs or interaction require them.
Make cache invalidation and post-mutation UI updates explicit for the route being changed.

Trace user input through state, data access and rendering. Avoid duplicating derived state or
adding a state library for a local interaction. Keep loading, retry and error states usable.
Preserve focus after dialogs, navigation and validation; use semantic interactive elements.

Follow the selected design contract and existing component library. Validate affected route
rendering and interactions in addition to build/type checks; server/client mistakes can survive
a static visual review. This skill supplies no default aesthetic.
