# SillyTavern Name Generator Extension

Simple SillyTavern extension that provides fantasy name generation using the `fantastical` npm package. Now ships with a vendored browser build of `fantastical` to avoid runtime CDN fetches. Settlement kinds (village/town/city/hamlet) are aliases that use the library's human name generator for results.

Features:
- Extension tab with a toggle to enable/disable the function tool.
- Function tool "GenerateName" for use with SillyTavern function-calling.
- Slash command `/generateName` to quickly test name generation.

Installation:
- Drop this folder into SillyTavern's `public/third-party` as `SillyTavern-Namegen`.
- The extension loads the local vendored library file at `third-party/SillyTavern-Namegen/lib/fantastical.js` and does not use external CDNs at runtime.
- If the file is missing, run `npm run fetch:fantastical` inside this folder to download it.

Usage:
- Toggle the function tool under Extensions -> Name Generator.
- Slash command: `/generateName [kind] --gender male|female`
  - Examples:
    - `/generateName` (defaults to `human male`)
    - `/generateName elf --gender female`
    - `/generateName tavern`

Supported kinds (common):
- Species: `human`, `elf`, `highelf`, `woodelf`, `darkelf`, `halfelf`, `dwarf`, `halfling`, `gnome`, `goblin`, `orc`, `ogre`, `fairy`, `highfairy`, `cavePerson`.
- Parties: `guild`, `mysticOrder`, `militaryUnit`.
- Places: `tavern`; Settlements: `village`, `town`, `city`, `hamlet` (use human generator).
- Adventures: `adventure`.

Adding new categories:
- Map aliases in `resolveGenerator()` to either an existing fantastical export (preferred) or to a namespace you handle in `generateName()`.
- Example: settlements are mapped to `settlement/*` and resolved by calling `human({ allowMultipleNames: true })` under the hood.

Gender handling:
- Species that accept gender receive `male`/`female` when provided. Humans receive an options object; we include `gender` there as well for consistency, even though the library ignores it.
