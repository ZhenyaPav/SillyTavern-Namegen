# SillyTavern Name Generator Extension

Simple SillyTavern extension that provides fantasy name generation using the `fantastical` npm package.

Features:
- Extension tab with a toggle to enable/disable the function tool.
- Function tool "GenerateName" for use with SillyTavern function-calling.
- Slash command `/generateName` to quickly test name generation.

Installation:
- Drop this folder into SillyTavern's `public/third-party` as `SillyTavern-Namegen`.
- No manual `npm install` is required for the browser; the extension auto-loads `fantastical` from a CDN when needed.
- Optionally, you can vendor a local copy of `fantastical` at `third-party/SillyTavern-Namegen/lib/fantastical.js` to avoid CDN usage.

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
- Places: `tavern`.
- Adventures: `adventure`.

