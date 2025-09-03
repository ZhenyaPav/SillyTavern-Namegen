# Fantastical Name Generator (SillyTavern Extension)

Adds a **Function Tool** called `fantasyName.generate` that uses the [`fantastical`](https://github.com/seiyria/fantastical) library to produce names for:
- **species**: human, elf, dwarf, goblin, etc. (some support `gender` and `allowMultipleNames`)
- **parties**: mysticOrder, militaryUnit, guild
- **places**: tavern
- **adventures**: adventure

## Install
1. In SillyTavern, open **Extensions → Install Extension** and paste your repo URL, or copy this folder into `data/<handle>/extensions/third-party/Extension-FantasticalNameGen`.
2. Enable the extension in **Extensions → Manage extensions**.
3. (Optional) If you want to use a local package instead of CDN, run `npm i fantastical` **inside this extension folder**, then ensure the built file is accessible at `./node_modules/fantastical/dist/index.js`.

> By default the extension will **auto-install via CDN** (jsDelivr) and cache the module code in `localStorage` for offline reuse.

## Settings
- **Use Function Tool** – toggles registration.
- **Prefer CDN** – load from CDN first if local import fails.
- **CDN URL** – override if you need to pin a version (e.g. `https://cdn.jsdelivr.net/npm/fantastical@1.0.5/dist/index.js`).
- **Cache library** – store fetched JS in browser storage and import from there next time.
- **Show toasts** – UI notifications on tool calls.

## Function Tool
**Name:** `fantasyName.generate`

**Parameters**
- `category`: `species | parties | places | adventures`
- `type`: generator name within that category (e.g. `human`, `elf`, `guild`, `tavern`, `adventure`, `mysticOrder`)
- `gender?`: `male | female` for supported species
- `allowMultipleNames?`: `boolean` (applies to some species like `human`)
- `count?`: `1..50`

**Returns:** newline-separated names (string)

**Examples**
- “Give me 5 dwarven names” → `{ category: "species", type: "dwarf", count: 5 }`
- “Name a shady guild” → `{ category: "parties", type: "guild" }`
- “Generate three tavern names” → `{ category: "places", type: "tavern", count: 3 }`
- “Female elven ranger name” → `{ category: "species", type: "elf", gender: "female" }`

## Notes
- This extension requires **Function Calling** to be enabled in your model’s settings.
- Works fully in the browser; no Extras server required. If you choose local `npm i`, the extension will attempt a relative import first, then fall back to CDN.