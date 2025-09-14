# SillyTavern Name Generator Extension

Lightweight name generator for SillyTavern backed by the `fantastical` library. Includes a vendored browser build, so it works fully offline (no runtime CDN requests). Settlements (village/town/city/hamlet) are friendly aliases that reuse the human name generator for results.

## Install (recommended)
- In SillyTavern Web UI, open the Extensions installer.
- Paste this repository URL and install:
  - https://github.com/ZhenyaPav/SillyTavern-Namegen
- After install, open the extension’s settings and enable as needed.

## Use
- Toggle the Function Tool in the extension settings to expose the tool "GenerateName" for function-calling.
- Slash command: `/generateName [kind] --gender male|female [--allowMultipleNames true|false]`
  - Examples:
    - `/generateName` (defaults to `human male`)
    - `/generateName elf --gender female`
    - `/generateName tavern`

## Common kinds
- Species: `human`, `elf`, `dwarf`, `halfling`, `gnome`, `goblin`, `orc`, `fairy`, `highelf`, `woodelf`, `darkelf`, `halfelf`.
- Groups: `guild`, `mysticOrder`, `militaryUnit`.
- Places: `tavern`, and settlements: `village`, `town`, `city`, `hamlet`.

Notes
- Settlements use the human generator and support `--allowMultipleNames` (defaults true for settlements, false for plain `human`).
- Gender is used for species that support it; for `human` it’s accepted but ignored by the library.
