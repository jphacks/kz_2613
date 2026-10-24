# Real-device validation gates (not yet run)

Each gate must record **PC OS / Minecraft exact version / smartphone OS & browser / network arrangement / operator / date / observed behavior / pass or fail**. Unit tests cannot replace these.

| Gate | Requirement | Procedure | Passing condition | Fallback |
|---|---|---|---|---|
| G1-A | Minecraft synthetic keyboard | On Windows 11, game focused, send W DOWN, delayed UP; Space/Shift/Ctrl; hotbar | Real character moves and STOPS on UP | Revisit input scan-code / target focus / game version |
| G1-B | Mouse buttons | Send left/right DOWN/UP, mine/place | Both press and release work | Revisit API/permission |
| **G1-C** | **Relative mouse look** | Test `MOUSEEVENTF_MOVE` without ABSOLUTE with dx/dy | Camera rotates without unwanted cursor jump | Different target version/input design |
| G1-D | Focus and safety | Hold W, minimize/switch windows and release | Never types into unrelated PC app, no stuck key | Fail closed, add explicit arm/focus guard |
| G2-A | Windows Wi-Fi AP | Disconnect upstream internet, start hotspot, join phones | PC reachable on isolated LAN | Dedicated local AP/Legacy AP |
| G2-B | 3 browsers | Android Chrome and iPhone Safari plus third phone HTTP & WS | All three connected, no cloud needed | Adjust network/firewall/client browser |
| G3-A | Roles/session | Join order, Start with 2/3 and 3/3; Pause/Resume | Host only, initial role fixed, button state reset | Fix session state machine |
| G3-B | Failure safety | Hold W/left-click, break Wi-Fi, background tab, host loss | Synthesized keys released by server | Watchdog/timeout/epoch changes |
| G4-A | Desktop shell | pywebview main thread + API background | PC UI responsive, three devices still connected | localhost desktop in browser |
| G4-B | Packaging | Build onedir on Windows11 without Python pre-installed | Launches local assets and API; WebView2 verified | Python venv runtime for demo |
| G5 | Demo | 3 people perform move+look+jump+place and Pause/Resume | Repeatable live demo in chosen Minecraft version | Simplify UI, preconfigure world |

## Recommended execution order
1. **G1-A/B/C first:** a five-minute Windows-only proof can invalidate the entire plan. Document exact version; do not assume 26.3 is installed.
2. **G2-A/B:** test real network before UI polish. Local HTTP may fail on "no internet" phones; check Wi-Fi retention and firewall.
3. Build session handshake + safe input state (G3); do not allow arbitrary LAN OS control.
4. Integrate PC shell and package (G4), then repeat demo (G5).

### Evidence template
```
Gate ID:
Test date / operator:
Windows version / Wi-Fi adapter:
Minecraft Java version, game settings and keybinds:
Phone models, OS/browser versions:
Steps actually performed:
Observed result (not expected result):
Pass / fail / conditional:
Issue / mitigation / link to commit or video:
```
