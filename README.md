# 🦊 Foxy

See every network request your React Native app makes: which line of code made it, which screen was showing, and which team owns that code.

Foxy is a developer tool for [MetaMask Mobile](https://github.com/MetaMask/metamask-mobile), built by a MetaMask engineer for the MetaMask Mobile team and for the open source contributors who work on the app alongside us. Use it to audit what the app requests on a screen such as Onboarding and decide what can be deferred, moved or dropped. It records every `fetch` and `XMLHttpRequest` in a debug build, symbolicates the JS call stack through Metro, and shows the result in a live dashboard. Unlike a proxy such as Charles, it knows *who* made the call, and it installs before the app's engine boots so early requests are not missed.

- **Timeline and Endpoints** views, with identical-duplicate detection, failures, waterfall and per-endpoint latency
- **Code owners** from `CODEOWNERS` (app files and `@metamask/*` packages), plus links to the exact line on GitHub
- **Markers and phases** to split a capture into flows, with Keep / Defer / Move / Drop **verdicts** per phase
- **Exports** to JSON, CSV and Markdown, and an **MCP server** so an AI agent can drive and read a capture
- Debug builds only, opt-in, and header values for credentials are redacted

The full feature reference is in the **[guide](docs/GUIDE.md)**.

## Install

**The app.** Download `Foxy-<version>-arm64.dmg` (Apple Silicon Mac), drag Foxy to Applications and open it. The first time, it asks for your MetaMask Mobile checkout (a folder whose `package.json` is named `metamask`). You can change it later from **Foxy > Choose MetaMask Mobile Folder…**.

Foxy is not signed with an Apple Developer ID, so macOS blocks the first launch of a downloaded copy. Right-click it and choose Open, or run `xattr -dr com.apple.quarantine /Applications/Foxy.app` once. Closing the window leaves Foxy recording (click the Dock icon to bring it back); Quit stops it. Settings, cache and the raw log live in `~/Library/Application Support/Foxy` (**Foxy > Show Data Folder**).

**From source.** Needs Node 20+.

```bash
npm install
npm run desktop                                  # the same Electron app
FOXY_REPO=/path/to/metamask-mobile npm start     # or only the server, then open http://localhost:8098
npm run dist                                     # builds dist/Foxy-<version>-arm64.dmg and .zip
```

## Use it

Foxy needs a small bridge inside the app. It ships with MetaMask Mobile at `app/dev-tools/Foxy` (it is not part of this repo) and turns on when `FOXY="true"` is set in the app's `.js.env`. Foxy sets that for you.

1. Open Foxy and pick your MetaMask Mobile folder. Restart Metro (`yarn watch:clean`) if Foxy says `.js.env` changed.
2. Start the debug app (`yarn start:ios` or `yarn start:android`). Requests stream into the dashboard.
3. For a fresh capture, press **Clear** (in the menu), then fresh install and launch. Press `M` to drop a marker (for example `Onboarding visible`) as things happen. Press `?` for the in-app guide.

A Metro reload, crash or relaunch of the app continues the capture on screen, so markers and request numbers carry on; only Clear starts over.

On setup Foxy also: runs `adb reverse tcp:8098 tcp:8098` for attached Android devices, prints the `FOXY_URL` line a physical iPhone needs, downloads the core monorepo's `CODEOWNERS` for `@metamask/*` team chips when there is no `../core` checkout, and installs a `foxy` agent skill into the checkout (skip with `FOXY_SKIP_SKILL=1`). `node setup.mjs --check` prints the checklist without changing anything.

## Agent access (MCP)

**Foxy > Copy MCP Config…** copies a ready config. The app's binary runs `mcp.mjs` itself, so nothing else has to be installed:

```bash
claude mcp add foxy -e ELECTRON_RUN_AS_NODE=1 -- /Applications/Foxy.app/Contents/MacOS/Foxy /Applications/Foxy.app/Contents/Resources/app/mcp.mjs
```

From source: `claude mcp add foxy -- node /path/to/foxy/mcp.mjs`. The tools (`network_list`, `marker_add`, `network_export_phase`, `audit_get`, and more) are listed in the [guide](docs/GUIDE.md#agent-access-mcp).

## Configuration

| Variable | Default | What it does |
| --- | --- | --- |
| `FOXY_REPO` | current folder | The MetaMask Mobile checkout Foxy reads |
| `FOXY_PORT` | `8098` | Dashboard and app connection port |
| `FOXY_METRO` | `http://localhost:8081` | Metro, used to symbolicate stacks |
| `FOXY_CORE` | `../core` or a cached download | MetaMask core checkout, for `@metamask/*` owners |
| `FOXY_GITHUB_REPO`, `FOXY_GITHUB_REF` | your `origin` | Where call-site links point |
| `FOXY_BODIES` | off | Set `"true"` in the app's `.js.env` to record capped request and response bodies (use throwaway wallets only) |
| `FOXY_LOG_FILE`, `FOXY_AUDIT_FILE`, `FOXY_CACHE_DIR` | Foxy folder | Where the raw log, verdicts and cache are kept |

## Development

```bash
npm test         # 74 tests; two read real CODEOWNERS files and run only when FOXY_REPO and FOXY_CORE are set
npm run smoke    # starts the desktop shell headless and checks the dashboard answers
npm run pack     # unpacked Foxy.app in dist/ for a quick look
```

## License

[MIT](LICENSE) for Foxy's own code. MetaMask artwork, the wordmark font and third-party software are listed in [NOTICE](NOTICE) and are not covered by it.
