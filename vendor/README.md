# vendor

Files the Foxy dashboard serves from `/vendor/*` so it works offline.

- `foxy-loading.riv`: the animated MetaMask fox used as the logo (Rive file; artboard `Loading`, animation `Loop`, which loops forever, and a state machine `State Machine 1` whose first frame is the still pose shown when you pause). It is MetaMask's artwork, copied from MetaMask Mobile's `app/animations`, and is not covered by Foxy's MIT license (see `NOTICE`).
- `rive.js` and `rive.wasm`: the [Rive](https://rive.app) web runtime, `@rive-app/canvas@2.55.0` (MIT licensed), copied unmodified from the npm package. To update it, replace both files with the same version from `@rive-app/canvas`.

If `foxy-loading.riv` is missing the dashboard falls back to the 🦊 emoji, so you can swap in your own animation under the same name.
