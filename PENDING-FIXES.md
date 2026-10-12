# Pending fixes

Backlog for dota2-hue-sync. The 2026-10-11 review scored the repo 3/3/2/3 (architecture,
performance, design, maintainability); the items under "Done" are what closed each finding.

## Open

### Needs a live match

- [ ] **Check what `player.kill_streak` counts.** The fixture shows a streak of 7 with 3 kills; spree
      thresholds assume it is consecutive kills without dying.

### Needs a decision

- [ ] **Archive `dota2-hue`, `dota2-gsi-minimal`, `dota2-gsi-c` and `../old_shit`**; scrub the two
      committed OBS passwords first. Sibling repos, not touched from here.

### node-hue-edk (sibling repo)

- [ ] `Hue.initialize()` leaves the EDK thread alive on failure so `process.exit` can hang.
- [ ] `Hue` reads `bridge.json` from the working directory and ignores `HUE_BRIDGE_IP` when that file
      exists, so a fake-bridge smoke test connects to the real bridge.
- [ ] Wrapper prints nothing for most effects (the app logs `[effect]` itself now).

### Nice to have

- [ ] Arrow-hit vs arrow-cast from minimap enemy positions; needs `minimap` back in the GSI cfg
      (~38 MB per match of payload).
- [ ] `player:resources:gold_changed` and `mana_changed` are emitted quietly with no consumer.
- [ ] `EventDispatcher` logs to the console itself; inject a logger if output ever needs routing.

## Done

### 2026-10-12, live Dark Seer match (9041920415, 42 min, recorded to `fixtures/match_9041920415.jsonl.gz`)

- [x] Scheduler, death countdown with re-sync across a pause, buyback, idle on disconnect and
      reconnect all behaved on real lights. Restarting mid-match now adopts the live state.
- [x] Found and fixed live: listener started before the lights subscribed; reconnect while dead
      ran the start flash over the ripple and a second ripple; a death on the post-game screen
      started an 84 s countdown over idle; level-up effects blocked ability casts; the ultimate
      was dropped behind a level-up.
- [x] Added: Dark Seer Normal Punch; per-item events (Soul Ring, Blink, Arcane Boots, Medallion,
      Solar Crest, Shiva's Guard, ...) firing once per cast; Ion Shell shortened to 1.5 s (cast
      every 12 s); item and map event names in the log.

### 2026-10-12, third pass (entertainment channels)

- [x] Living Room area placed end to end: 3 channels instead of 1, matching the wrapper's three
      channel ids, so the health bar and waves now show across the strip. `bun run area-channels`
      shows or applies the layout. Seven channels are not reachable for the Hue gradient lightstrip
      (LCX004): the bridge allows two positions per light within -1..1, derives channels from their
      spacing (3 end to end, 4 across the cube's diagonal) and rejects a `channels` PUT. Seven exist
      only on the Play gradient lightstrip (LCX001).

### 2026-10-12, second pass (architecture)

- [x] Effect catalog (`src/game/effect-catalog.ts`) is the single source of truth: parameters,
      defaults, length, wrapper call. Config loader validates against it (unknown type, parameter,
      colour, priority; missing required parameter). Showcase generated from it (987 -> 102 lines).
- [x] Detector split into pure, synchronous per-domain detectors under `src/game/detectors/`; the
      coordinator returns events and knows nothing about the dispatcher. No `Promise.all` over sync
      work, common fields built once per frame, no `Date` per event.
- [x] `DotaEffectManager` is constructed with a connected `Hue`, the validated bindings and a
      scheduler; `connectHue()` owns the retry loop; `index.ts` is the composition root. Manager state
      machine tested under a manual clock with a recording fake Hue.
- [x] `EventDispatcher.emit` typed with `GameEventType` only; `GameEventType` derived from
      `GAME_EVENTS`.
- [x] `routes.ts` owns watchdog, recorder and state; no module-level mutable state. `game` no longer
      imports from `server` (`src/util/number.ts`).
- [x] Hue start-up failure exits 1 after retries; `HUE_DISABLED=1` runs GSI-only.
- [x] Scheduler simplified to one effect, preempt-or-drop; the queue was tried and removed.
- [x] 49 tests: fixture replay (1,924 frames), synthetic sequences, pure detectors, config and
      catalog, scheduler, manager.

### 2026-10-12, first pass (behaviour)

- [x] Fixture `fixtures/match_8200614096.jsonl.gz`, `GSI_RECORD_DIR` recorder, replay harness.
- [x] Heartbeats and resume-after-pause diffed against the last frame; cold start only on the first
      frame or a match-id change. Fixed `game:started` re-firing and the death countdown restarting.
- [x] Death and respawn from `hero.alive`; buyback from `hero.buyback_cooldown`; match end also from
      `map.win_team`, once per match; disconnect drops to idle; reconnect restores state.
- [x] Items diffed by name: combines and slot moves are not drops; a new match is not a sale.
- [x] `map:*` events, `player:status:*` flags, `game:reconnected`, full `DOTA_GameState` enum.
- [x] Countdown follows `hero.respawn_seconds` (`player:combat:respawn_tick`), re-synced on drift.
- [x] GSI cfg trimmed to the seven nodes read, heartbeat 5 s; `gsi:data` spread removed.
- [x] Celestial Quiver, multikill, killing spree, first blood, buyback effects.
- [x] `GSI_AUTH_TOKEN`, loopback-only listener, SIGTERM, server stopped on shutdown.

### 2026-10-11

- [x] node-hue-edk v1.1.0: multi-area connect, real `selectGroup` result, `getGroups()`,
      numeric group id -> Clip v2 UUID.
- [x] Breathing stopped on recovery; init retries; dual-stack listener; `[event]`/`[effect]` logs.
