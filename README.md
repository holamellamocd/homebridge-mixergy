# homebridge-mixergy

A [Homebridge](https://homebridge.io) plugin for [Mixergy](https://mixergy.co.uk) smart hot water cylinders.

Exposes your Mixergy tank to Apple HomeKit so you can monitor and control it from the Home app or via Siri.

## Features

- **Tank Charge** — hot water level displayed as a 0–100% value directly on the accessory tile
- **Water Temperature** — current hot water temperature at the top of the tank (°C), optional
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
  "showTemperatureSensor": true
}
```

### Options

| Option | Default | Description |
|---|---|---|
| `username` | — | Your Mixergy account email |
| `password` | — | Your Mixergy account password |
| `pollIntervalSeconds` | `30` | How often to fetch tank data (10–300 seconds) |
| `onChargeTarget` | `100` | Charge % to request when the Heating switch is turned on |
| `showTemperatureSensor` | `true` | Set to `false` to hide the temperature tile (it can appear misleadingly as an air temperature sensor in the Home app) |

## HomeKit services

Each tank appears as a single accessory with up to four services:

| Service | What it shows |
|---|---|
| Humidity Sensor | Tank charge level (0–100%) — displayed prominently on the accessory tile |
| Temperature Sensor | Hot water temperature at the top of the tank (optional, see config) |
| Switch | Heating on/off |
| Television (input) | Active heat source — Electric, Indirect, or Heat Pump |

> The tank charge is exposed as a Humidity Sensor rather than a Battery so the percentage appears directly on the tile in the Home app, rather than being buried in the accessory detail view.

> The heat source selector uses the HomeKit Television input API, which gives a proper multi-option picker in the Home app. This is a common pattern for accessories that need a "select one of N" control.

## Requirements

- Node.js 18 or later
- Homebridge 1.6 or later
- A Mixergy account with at least one registered tank

## License

MIT
