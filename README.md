# homebridge-mixergy

A [Homebridge](https://homebridge.io) plugin for [Mixergy](https://mixergy.co.uk) smart hot water cylinders.

Exposes your Mixergy tank to Apple HomeKit so you can monitor and control it from the Home app or via Siri.

## Features

- **Water Temperature** — current hot water temperature at the top of the tank (°C)
- **Tank Charge** — hot water level as a 0–100% battery gauge, with a low-water alert (configurable threshold)
- **Heating switch** — turn heating on (charges to a target %) or off
- **Heat Source selector** — choose between Electric, Indirect, and Heat Pump using a native HomeKit input picker

Tanks are auto-discovered from your Mixergy account — no serial number configuration needed.

## Installation

```bash
npm install -g homebridge-mixergy
```

Or install via the [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) by searching for `homebridge-mixergy`.

## Configuration

Add the following to the `platforms` array in your Homebridge `config.json`:

```json
{
  "platform": "Mixergy",
  "name": "Mixergy",
  "username": "your@email.com",
  "password": "yourpassword",
  "pollIntervalSeconds": 30,
  "onChargeTarget": 100,
  "lowChargeThreshold": 20
}
```

### Options

| Option | Default | Description |
|---|---|---|
| `username` | — | Your Mixergy account email |
| `password` | — | Your Mixergy account password |
| `pollIntervalSeconds` | `30` | How often to fetch tank data (10–300 seconds) |
| `onChargeTarget` | `100` | Charge % to request when the Heating switch is turned on |
| `lowChargeThreshold` | `20` | Charge % below which the low-water alert triggers |

## HomeKit services

Each tank appears as a single accessory with four services:

| Service | What it shows |
|---|---|
| Temperature Sensor | Hot water temperature at the top of the tank |
| Battery | Tank charge level (0–100%), charging state, low-water alert |
| Switch | Heating on/off |
| Television (input) | Active heat source — Electric, Indirect, or Heat Pump |

> The heat source selector uses the HomeKit Television input API, which gives a proper multi-option picker in the Home app. This is a common pattern for accessories that need a "select one of N" control.

## Requirements

- Node.js 18 or later
- Homebridge 1.6 or later
- A Mixergy account with at least one registered tank

## License

MIT
