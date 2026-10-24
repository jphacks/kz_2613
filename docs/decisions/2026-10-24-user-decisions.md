# User-confirmed requirements and UI decisions (2026-10-24)

**Status:** design choices expressed by the user. Team-wide sign-off and hardware validation are separate.
**Precedence:** newer explicit user decisions supersede earlier ideas or proposals. The complete baseline is `../requirements/requirements-v0.2.md`.

## Product / environment
- Existing unmodified solo PC game becomes a shared cooperative experience: "ひとりのゲームを、みんなの冒険に。"
- Product working name: **Re:Cooplay** (リコプレ).
- MVP: **Minecraft Java Edition on Windows 11**, 3 phones controlling 1 game character. Aim for 2–4 in a later version.
- Android first for debugging, iPhone + Android web-browser support by design.
- Phones never receive streamed gameplay video. Everyone sees the actual PC display.
- In-game input must remain on local network and must not route via cloud or internet.
- Game launcher discovery (Steam/Minecraft) desirable but **not core**. Manual registration or manually launching Minecraft is sufficient for P0.

## P1/P2/P3 fixed Minecraft v0.1 mapping
| Slot | Participant | Inputs |
|---|---|---|
| P1 | first connected = host | WASD movement, Ctrl sprint |
| P2 | second connected | Mouse look (relative camera movement) |
| P3 | third connected | Space jump, Shift crouch, left/right mouse, hotbar 1–9 |

Role load, not button count, is the optimization target. Fixed slots for P0; role changes and balancing are improvements.

## Screen and interaction
- PC has **three proposed main screens**: (1) QR / number of participants, (2) game selection, (3) input-role confirmation. Review outcome: adequate as major screens, but precise transitions and states are **still proposed**, not independently user-signed-off.
- Host uses phone as PC **remote control**, looking at the PC screen; do not create a separate mobile game library flow.
- Host remote **minimum**: four arrows, Enter, Esc. Ideally also trackpad, left/right clicks and extra keys when feasible.
- In HOST_REMOTE (before Start or after Pause), host holds regular PC remote input privileges.
- All three must be connected before host can Start. Start takes ordinary remote input away from host and enables split player inputs; host keeps management privileges.
- Re:Cooplay Pause **stops Re:Cooplay injected input**, not necessarily Minecraft time. It releases all held keys and buttons and returns host remote control; host resumes explicitly.
- Any participant disconnect during cooperative play forces a safe stop. Host disconnect never automatically transfers host privileges. Reconnect returns original slot, never reorders first-joined roles.
- For inventory, Pause restores host control, but full inventory interaction needs mouse/E-key extras (P1); preconfigure hotbar for minimum demo.
- On game exit/reselection, keep session, participants and role assignments.
- MVP movement UI minimum D-pad (desired analog-looking thumbstick); look minimum directional buttons (desired swipe area).

## Open hardware-dependent questions; not blockers for repository initialization
- Exact Minecraft Java version and default keybinds; Minecraft must accept synthetic relative mouse and keyboard input.
- Host-PC Wi-Fi NIC, whether Windows 11 Mobile Hotspot works without upstream internet, and firewall settings.
- Actual 3 handsets and browsers for validation; latency observations.
- Actual observed keyboard-only coverage of each chosen PC/Minecraft menu.

Do not silently convert future ideas from minutes into P0 features.
