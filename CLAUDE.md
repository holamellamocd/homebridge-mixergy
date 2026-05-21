# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # Compile TypeScript → dist/
npm run watch        # Incremental compile in watch mode
npm run lint         # ESLint over src/
```

There are no automated tests. Build success (`npm run build`) is the primary correctness check.

## Architecture

This is a **Homebridge dynamic platform plugin** that bridges [Mixergy](https://mixergy.co.uk) smart hot water cylinders into Apple HomeKit.

### Data flow

1. **`src/index.ts`** — entry point; registers `MixergyPlatform` with Homebridge under the alias `Mixergy`.
2. **`src/platform.ts`** — `MixergyPlatform` implements `DynamicPlatformPlugin`. On `didFinishLaunching` it authenticates, calls `getTanks()`, then creates or restores a `MixergyTankAccessory` per tank. After initial setup it polls `refreshAll()` on `pollIntervalSeconds` (default 30 s). Stale cached accessories (tanks no longer on the account) are unregistered automatically.
3. **`src/mixergyApi.ts`** — `MixergyApi` wraps `https://www.mixergy.io/api/v2`. Auth is JWT-based (`/account/login` → `token`). Expired tokens trigger an automatic single re-authentication via `authenticate()`. Key methods: `getTanks`, `getLatestMeasurement`, `setCharge`, `getSchedule`, `setDefaultHeatSource`.
4. **`src/platformAccessory.ts`** — `MixergyTankAccessory` holds all HomeKit service wiring for one tank. `refresh()` is called by the platform on every poll cycle.

### HomeKit service mapping

Each tank exposes multiple services on a single accessory — a deliberate workaround for HomeKit's limited native UI for non-standard devices:

| HomeKit Service | Mixergy concept | Why this service |
|---|---|---|
| `HumiditySensor` | Tank charge (0–100 %) | % shows on the tile; `BatterySensor` buries it in the detail view |
| `TemperatureSensor` | Water temperature (top of tank) | Optional — config `showTemperatureSensor: false` removes it |
| `Lightbulb` | Heating on/off + charge target | Brightness slider = 0–100 % charge target; toggle = start/stop |
| `Television` + `InputSource` × 3 | Heat source selector | Only HomeKit service with a native multi-option picker |

The `Television` service is always reported as `ACTIVE` — it is a selector, not a power switch. Any `onSet` to power it off is immediately overridden back to ACTIVE.

### Config schema (`config.schema.json`)

Defines the Homebridge UI form. `lowChargeThreshold` appears here but is **not yet implemented** in the plugin code — it is reserved for future use.

### TypeScript setup

- `strict: true`, target `ES2022`, output to `dist/` as CommonJS.
- `homebridge` is a `peerDependency` and `devDependency` — use types from it but do not bundle it.
- No test framework is configured; rely on TypeScript compilation and manual testing with a real Homebridge instance.
