# Midnight Vault

[![best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/toller892/best-heist-game-20261122-0559/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/toller892/best-heist-game-20261122-0559/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559)

Midnight Vault is an original top-down 2D stealth heist game that runs in a
desktop browser from static files, with no build step and no network request.
Cross three rooms — Gallery, Vault, Penthouse — steal the Starlight Diamond in
each one, and reach the green EXIT before the guards and cameras raise the
alarm to 100.

Guards patrol waypoint loops with yellow vision cones that turn red when they
are alerted; detection only counts inside a cone with true line of sight past
walls and display cases. Cameras sweep fixed arcs from the walls. Gems
scattered through the rooms buy tools: a smoke bomb, an EMP that kills the
cameras for 6 seconds, and a noisemaker that lures the nearest guard away.
Vent corridors hide you but slow you down; the central hall is fast and
exposed. Score is loot value plus a time bonus, minus the alarm at the end,
and the best score is kept in your browser.

## Play

Run it locally with:

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome.

Controls: WASD or arrow keys to move, Shift to sneak (slower, harder to
spot), 1/2/3 to pick a tool, Space or click to use it, P to pause, M to mute.

## Layout

- `game/index.html` — the page, a full-window canvas and nothing else.
- `game/src/config.js` — tuning numbers and the three room layouts.
- `game/src/random.js` — the seeded random generator.
- `game/src/world.js` — the rules and state: guards, cameras, alarm, tools, loot.
- `game/src/input.js` — keyboard and pointer input.
- `game/src/render.js` — drawing only.
- `game/src/shots.js` — the screenshot scenes and their autopilot.
- `game/src/audio.js` — the tiny WebAudio synth for pickup, alarm and caught blips.
- `game/src/main.js` — boot and the fixed 1/60 s loop.
- `main.ts` — hands the entry in: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json`.

## Entry

This is an entry in the [best heist game bounty](https://make.fun/bounty/best-heist-game-20261122-0559) on make.fun.

Optional: earn referral rewards, a second way to make money — try make.fun
with my referral link: https://make.fun/r/e484k5h4
