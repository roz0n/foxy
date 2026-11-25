---
name: foxy
description: Gets the Foxy network-request dashboard running and explains what it shows. Use when someone wants to run Foxy, audit which network requests the MetaMask Mobile app makes, find who or which screen made a request, or when Foxy shows no requests, the Android or physical iPhone cannot connect, owner chips are missing, or the dashboard will not start. Covers prerequisite checks, the one-command setup, troubleshooting and the MCP tools.
maturity: experimental
---

# Foxy

Foxy captures every `fetch` and `XMLHttpRequest` the app makes in a debug build, with the JS call stack, the code owner of the calling file and the screen the app was showing. It runs as a local server plus a dashboard, shipped as the double-click Foxy desktop app (or run from the standalone Foxy repo with `npm start`). Foxy is a standalone app and owns the bridge inside the MetaMask Mobile app: it installs it into the checkout (`app/dev-tools/Foxy/`, one import in `index.js`, `FOXY="true"` in `.js.env`), so the checkout needs nothing beforehand. The Foxy repo's `README.md` is the full reference for the dashboard.

This skill only applies to MetaMask Mobile. If `app/dev-tools/Foxy/` does not exist in the checkout, that is normal before the first run: Foxy installs it (the desktop app asks first, `node setup.mjs` does it). To take it out again use **File > Remove Foxy from App…** or `node setup.mjs --uninstall`. The one tracked change it makes is a single import line in `index.js`, which must not be committed.

## The normal path: open Foxy

For a person with the Foxy app the whole flow is **open Foxy, pick the MetaMask Mobile folder once**. From the Foxy repo it is `FOXY_REPO=<mobile checkout> npm start`. Do not walk them through manual steps first. Both run `setup.mjs`, which fixes everything below that it can, then start the server on <http://localhost:8098>.

| Prerequisite | What Foxy does about it |
| --- | --- |
| Node version | Compares with `engines.node` and warns on a mismatch |
| `ws` package | Bundled in the app; from source, `npm install` in the Foxy folder |
| `FOXY="true"` in `.js.env` | Creates `.js.env` from `.js.env.example` if absent, turns the flag on (uncomments or adds it). Never touches `FOXY_URL` or `FOXY_BODIES` |
| Metro restart | Tells the user to run `yarn watch:clean` when `.js.env` changed, because the flag is read when the bundle is built |
| Metro reachable on `:8081` | Warns when it is not, since stacks are symbolicated through it |
| Owner chips for `@metamask/*` | Uses a sibling `../core` checkout, otherwise downloads core's `CODEOWNERS` into Foxy's cache folder (refreshed weekly) |
| Android device or emulator | Runs `adb reverse tcp:8098 tcp:8098` for every attached device |
| Physical iPhone | Prints the exact `FOXY_URL` line with the Mac's LAN address |
| Port `8098` | Says so when another program owns it, and exits quietly when Foxy is already running |
| This skill | Installs itself into `.claude/skills`, `.agents/skills` and `.cursor/skills` (all gitignored) |

Afterwards the user has to do the parts only they can: build or start the debug app (`yarn start:ios` or `yarn start:android`, JS-only changes need no native rebuild), launch it, and watch the Timeline. Press `M` in the dashboard to drop a marker such as "Onboarding visible" so the capture splits into phases.

## Answering "how do I…" questions about the dashboard

People ask the agent instead of reading the guide. The full reference is `docs/GUIDE.md` in the Foxy repo, and the dashboard's `?` guide says the same. These are the answers that come up most.

- **What called the fetch?** The Timeline's **Call Site** column shows the method that called `fetch`. Under it, `↳` names what called that method when the stack still has it: the nearest app frame (a hook or component), otherwise the next `@metamask` controller method. When there is no `↳` line, the stack ended there, because Hermes keeps no async stack after an `await`. Foxy never guesses a caller. **Launched From** is the screen the app was on. Click a row for the whole call chain.
- **Column order.** ID, Method, Status, Host, Path, Call Site, Launched From, Code Owners, Started At, Time, Duration, Waterfall, like Charles, Proxyman and Chrome DevTools. Drag headers to reorder, drag edges to resize, **Reset Columns** (menu) restores the defaults.
- **Highlight rows.** Open a row and click the highlighter icon at the right of its request line, or press `H`. Highlighted rows are tinted MetaMask orange. The **Highlighted** toggle beside Failed and Duplicates shows only those. Highlights survive a dashboard reload. **Menu > Clear Highlights** removes them all and is greyed out when there are none. **Clear** removes them with the capture.
- **Log storage.** Foxy appends every request to a log file (`logs/foxy.jsonl` in the data folder, or `FOXY_LOG_FILE`). Only `replay.mjs` reads it. **Menu > Log Storage** shows its size and path, and **Clear Log File** empties it without touching the capture on screen or the audit verdicts. It is in the dashboard menu only, so it works in the app, a browser tab and `npm start`; the desktop app's **Foxy > Show Data Folder** opens the folder. The API is `GET /api/storage` and `POST /api/storage/clear`.
- **Two menus (desktop app).** The in-app menu button holds everything about the capture and the view and works in a browser too. The macOS menu bar holds only OS things: File (switch folder, Recent Folders, Finder, Set Up App) and Foxy (Open Dashboard in Browser, Show Data Folder, Copy MCP Config…). There is no preferences window, on purpose.
- **Pick my team's requests.** Filters panel: every CODEOWNERS team is listed even before it makes a request. Star yours, then use **My teams**. **Highlighted** is also a quick filter there, and a toggle in the toolbar.
- **Export a markdown table.** Menu > Export…: **Markdown table, copy** or **Markdown file** (`.md`). A copy leaves the dialog open (it shows *Copied!*); a download closes it.
- **What is in an export header?** Every export (JSON, CSV, markdown, the agent JSON) says it is from Foxy and records the Foxy version, when it was exported (local ISO time and zone), the scope and request counts, when the capture started, the app (platform, OS, device, MetaMask Mobile version and build, environment), the source checkout (branch, commit, uncommitted changes), the GitHub repo and ref, Metro and the machine. The app details come from the app's bridge, so an older app build leaves those lines out. CSV has them as `# ` comment lines (pandas: `comment='#'`), markdown as a quote block, JSON in `foxy` / `exportedBy`.
- **Date and time.** The Timeline has **Started At** (wall clock, hover for the date) next to the relative **Time** and **Duration**; Endpoints has **First Call At**. Exports use local ISO 8601 with the UTC offset (`startedAt`, `finishedAt`, `firstCallAt`, `lastCallAt`; CSV `Started at`, `Finished at`, `First call at`, `Last call at`).
- **What does "via" mean?** In Code Owners, a solid chip is the team that owns the file that called `fetch`. A dashed chip with a `↳` arrow is *via*: the team that owns the caller behind it (the `↳` line under Call Site), which started the request by going through someone else's code. Hover it for the same explanation; the Guide's Reading the Timeline topic shows both. In CSV it is the *Via caller* column; in markdown, `(via)` follows the team; in the audit JSON it is `ownersViaCaller`.
- **Several code owners.** The Code Owners column shows the call site's teams, then a dashed chip for the team that owns the `↳` caller when it differs (a hook owned by one team calling through a controller owned by another). Filtering by either team matches. The audit export lists them as `codeOwners` and `ownersViaCaller`.
- **Switch the MetaMask Mobile checkout.** Desktop app: the **Switch Folder…** button at the top of the in-app menu, **File > Switch MetaMask Mobile Folder…** (`⌘O`), or pick one from **Recent Folders**. Foxy restarts to apply it and warns first if that would drop a capture. If another Foxy (for example `npm start`) is serving the window, the new folder is used on the next launch. From source, set `FOXY_REPO`.
- **Markers vanished after the app reloaded.** They should not: a relaunched app continues the same capture, with a toast saying so. If they are gone, **Clear** was pressed or an older Foxy is still running on port 8098. Quit it and open the current one.
- **Where is the data?** Desktop app: **Foxy > Show Data Folder** (logs, audit verdicts, CODEOWNERS cache). From source: the Foxy folder.

When a question is not here, read `docs/GUIDE.md`, then answer from it rather than from memory.

## Diagnosing without changing anything

```bash
FOXY_REPO=<mobile checkout> node setup.mjs --check
```

Prints the same checklist but writes nothing, so it is safe to run first when someone says "Foxy does not work". Read its output before guessing.

## Troubleshooting

Work down this list. Most problems are the first two.

1. **Dashboard is empty.** The app never connected. Check in order:
   - `.js.env` has `export FOXY="true"` and Metro was restarted with `yarn watch:clean` afterwards (the flag is read when the bundle is built, so a plain reload may keep the old value).
   - The app is a debug build. Foxy is a no-op in release builds.
   - Android: `adb reverse tcp:8098 tcp:8098` for the device in use (`adb devices`). Restart Foxy after plugging in or restarting an emulator.
   - Physical iPhone: set `export FOXY_URL="ws://<mac-lan-ip>:8098/app"` in `.js.env` (the phone and Mac must be on the same network), then restart Metro.
   - Requests made before JS loads (native prefetches) are never seen. That is a limit, not a bug.
2. **Call sites are not shown as `app/...` files.** Foxy symbolicates stacks through Metro, so it has to be running on `:8081`. Start it, or set `FOXY_METRO` to its URL.
3. **No team chips on `@metamask/*` calls.** Core `CODEOWNERS` is missing: reconnect to the internet and restart Foxy, or clone `MetaMask/core` next to this repo. App files with no owner show `unowned`; that is correct.
4. **"Launched from" says "Not reported".** That capture came from an older build of the app. Restart the app once.
5. **Port in use.** `lsof -ti tcp:8098` shows the owner. If it is an earlier Foxy, open the dashboard instead; otherwise stop it or set `FOXY_PORT` and make `FOXY_URL` match.
6. **GitHub links point at the wrong lines.** Links use `HEAD` when it is on a remote branch, otherwise the merge-base with `origin/main`. Push the branch, or set `FOXY_GITHUB_REPO` and `FOXY_GITHUB_REF`.

## Safety rules for agents

- Never turn on `FOXY_BODIES`. It records request and response bodies, which can contain tokens and personal data. Only suggest it when the user asks and is using a throwaway wallet.
- `.js.env` is gitignored and holds the user's local secrets. Edit only the `FOXY*` lines, never print the file, never commit it.
- Header values for credentials are already redacted by Foxy; do not try to recover them.

## Reading the data (agents)

Humans use the dashboard. Agents can read the same capture through the MCP server:

```bash
claude mcp add foxy -- node <foxy repo>/mcp.mjs   # the app's Foxy > Copy MCP Config… gives the binary form
```

Tools: `network_list`, `network_get`, `network_summary`, `network_export_markdown`, `marker_add`, `network_clear`, `status`. Use `marker_add` to label what the app is doing, `network_summary` to find identical duplicates, failures and third-party chatter, and `network_export_markdown` for a markdown table to paste wherever you are writing it up. An old capture can be replayed without an app: `node replay.mjs [logfile] [port]`.

## Changing Foxy itself

- Run the tests: `npm test` in the Foxy repo. The bridge's own Jest tests (`bridge/*.test.ts`) need a MetaMask Mobile checkout: set up an app with Foxy, copy them next to the installed files in `app/dev-tools/Foxy`, then `yarn jest app/dev-tools/Foxy` there (and remove the copies).
- The bridge source is `bridge/` in the Foxy repo; `setup.mjs` copies it into the checkout. Edit it there, never in the checkout.
- Prerequisite logic is `setup.mjs` in the Foxy repo (pure helpers, covered by `setup.test.mjs`). Add a new prerequisite there, and a row to the table above.
- This file is authored at `skill/skill.md` in the Foxy repo. The copies in `.claude`, `.agents` and `.cursor` are generated by `setup.mjs`; edit the source, not the copies.
