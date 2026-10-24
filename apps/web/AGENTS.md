# Web implementation notes

- Inherit root `AGENTS.md`/product decisions. Build one React project with a mobile controller view and desktop view; do not introduce separate native mobile applications.
- P0: D-pad for P1, directional-look buttons for P2, action buttons for P3; richer thumbstick/swipe after the basic workflow works.
- `pointerdown/up/cancel`, `touch-action: none`, visibility/page lifecycle, and multi-touch must release controls safely.
- Never treat client-provided role, host, or mode as trusted; backend is authoritative.
- Show clearly when not connected. The current starter is deliberately a **nonfunctional placeholder**.
