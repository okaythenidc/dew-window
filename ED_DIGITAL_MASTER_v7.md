# EARTH DEPARTMENT — DIGITAL RANGE
## Master Document v7
*Updated end of day 3 build session, May 2026*

---

## WHAT THIS IS

A catalog of digital experiences released under the Earth Department name. Format follows function — experiences, tools, or apps. The only requirements: genuinely useful or genuinely felt, executed with craft, true to the brief below.

---

## THE BRIEF

> "I want them to feel whimsy. I want them to feel joy. I want them to forget about their troubles. If they're depressed I want to give them a moment of relief. If they're worried I want them to feel a moment of peace. If they're curious I want them to feel excitement. If they're sad I want them to feel loved."

Everything we build serves this. If it doesn't, we kill it.

---

## THE DESIGN LANGUAGE

Products don't need to share the same visual DNA — but they should feel like they belong to the same sensibility. Each product can introduce its own aesthetic thread. What matters is that the connection between consecutive products feels intentional, not forced.

The first through line: **cold glass, condensation, fingerprints, refraction, light through water, impermanence.** Introduced by the dew window, inherited by the cube.

---

## HOW WE WORK

- **Ken** is creative director. Approves all creative decisions. Nothing ships without his sign-off.
- **Claude** (project panel) handles strategy, creative direction support, active pushback, and writes prompts for Claude Code. Challenge is welcome in both directions.
- **Claude Code** handles all development, working out of the local project folder.
- **Nothing is precious.** Kill it and restart if it's not working. Question everything.

### Claude Code discipline
- Confirm approach before building. Never present a complete system when a piece was asked for.
- Changes are surgical. Never touch code outside the scope of the current task.
- All prompts must be self-contained — include save, commit and push in every prompt that touches code.
- End of every session: diff what changed, synthesise updated master doc, increment version number.

### Prompt format rule
Every Claude Code prompt must be one complete block including the git commit at the end. Never split into multiple messages.

---

## PRODUCT ONE — DEW WINDOW

### What it is
A web app that turns your screen into a cold morning window covered in condensation. Your finger — or mouse — draws through the fog. The condensation slowly reforms. Ephemeral by nature.

### Live URL
https://okaythenidc.github.io/dew-window/

### Local development
cd ~/Desktop/EARTH-SOFTWARE/Condensation\ web\ app && python3 -m http.server 8080

cd ~/Desktop/EARTH-SOFTWARE && claude --dangerously-skip-permissions

http://localhost:8080

### File architecture
- `index.html` — entry point
- `engine.jsx` — physics and rendering (~950 lines). Five canvas layers: scene, fog, mask, drops, composite.
- `app.jsx` — top level component, scenes, UI chrome, camera, tweaks defaults
- `tweaks-panel.jsx` — floating draggable control panel (styles injected as __TWEAKS_STYLE string — CSS overrides won't work, must edit the string directly)
- `styles.css` — dark glassmorphism theme

### Architecture notes

**Tweaks state:** Two parallel systems — React state (UI display) and tweaksRef.current (physics engine reads every frame). Both update on slider change.

**Tweaks panel:** Styles are in the `__TWEAKS_STYLE` injected string inside tweaks-panel.jsx. External CSS cannot override these. Mobile bottom sheet styles must go in that string.

**spawnAmbient:** Clears and refills droplet array. cellSize controls density — lower = more drops. Currently: desktop 13, mobile 24. Mobile uses `window.innerWidth < 768` check.

**Merge check:** Grid-bucketed O(n) spatial hash. Runs unconditionally every frame.

**Drop cap:** 18000 drops max, trimmed to 12000.

**Slide threshold:** Default 8. Drops with r >= 8 start sliding.

**Tilt:** Uses DeviceOrientationEvent. iOS requires permission — requested on toggle AND on page load. gamma = left/right, beta = front/back. Formula: gx = gamma/90, gy = (beta-45)/90.

---

## DEW WINDOW — SESSION 3 CHANGES

### Completed this session
- Density fixed — cellSize 13 desktop, 24 mobile
- Spatial bucketing merge — O(n) instead of O(n²), lag eliminated on desktop
- Drop aspect ratio — each drop gets random scaleX/scaleY via `aspect` field
- Teardrop deformation — direction-aware, points toward velocity not hardcoded down
- Wind range extended ±2, multiplier 4.0x — actually moves drops sideways at max
- Deflection on merge collision — drops nudge sideways instead of teleporting
- Random spontaneous activation reduced 0.97 → 0.015
- Wipe spawn offset reduced — drops spawn closer to stroke
- Smooth drift vx — `_wx` field for gradual horizontal wander
- Rim gradient removed — was hardcoding circular read on every drop
- Highlight randomised — position and shape vary per drop using d.seed
- GitHub Pages deployed — live at okaythenidc.github.io/dew-window/
- Mobile toolbar — tool dock and scene bar repositioned via inline styles
- Tweaks panel — mobile bottom sheet via __TWEAKS_STYLE media query
- Tilt — iOS permission fix, works with screen locked to portrait, physical rotation changes drop direction
- refogSpeed default lowered 0.8 → 0.2
- tiltEnabled default true

### Still to fix next session
- Mobile density still too sparse (cellSize 24 → try 18-20 and test perf)
- Upside-down bounce bug — deflection logic misbehaves when gravity reversed
- Slight tilt forward bias — natural hand angle offset needs tuning
- Occasional drop spawn disconnect from stroke path
- Drop shape — circular read still persists on some drops (highlight partially fixed, rim removed, but clear lens layer still circular)

### First thing next session
Update this MD with any overnight thoughts, then tackle mobile density + upside-down bounce. In that order.

---

## PRODUCT TWO — THE ORACLE CUBE

### What it is
A perfect glass cube in Three.js. Full 3D space — user can orbit around it. Constant fluid movement inside even at rest. Shake it and it surfaces a response. Wet glass, cold surface, fingerprints left as you interact.

### Status
Scoping. Builds after product one ships.

---

## OPEN QUESTIONS
- Final response pool for the cube — Ken to write/curate
- Whether products live on earthdepartment.com or their own microsites
