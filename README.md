# CST Grill Card

A Home Assistant Lovelace card for **Chain Smoker CST 1-Pot** grill controllers, styled after the CST1Pot iPhone app (dark gradient, neon-cyan arc gauge, OFF/HEAT/SMOKE pills, set-temp − / +, smoke-level pills 1–5, chamber graph). The app's bottom navigation (**Control · Temps · Cooks · Settings**) is shown as tabs across the top of the card.

The card only reads the entities that the native **ESPHome integration** already creates and calls normal HA services (`switch`, `select`, `number`, `button`). It never talks to the grill directly, uses no cloud relay and no MQTT.

## Install

### HACS (custom repository)
1. HACS → ⋮ → **Custom repositories** → add `https://github.com/jazzmonger/cst-grill-card`, category **Dashboard**.
   (The repo is private: HACS needs a GitHub token that can read it, or make the repo public.)
2. Install **CST Grill Card**, then reload the browser.

### Manual
1. Copy `dist/cst-grill-card.js` to `/config/www/cst-grill-card.js`.
2. Settings → Dashboards → ⋮ → **Resources** → add `/local/cst-grill-card.js` as **JavaScript module**.
3. Hard-refresh the browser.

## Use
Add card → search **CST Grill Card**. The visual editor has a grill (ESPHome device) picker and per-entity overrides. YAML:

```yaml
type: custom:cst-grill-card
device_id: <optional, auto-picks the first grill>
default_tab: control   # control | temps | cooks | settings
hours: 4               # graph window
entities:              # optional overrides
  chamber: sensor.chain_smoker_1_pot_chamber_temperature
```

## Entities (auto-detected by suffix on the device)
| key | entity (suffix) | ESPHome source |
|---|---|---|
| chamber | `sensor.*_chamber_temperature` | Chamber Temperature |
| firepot | `sensor.*_firepot_temperature` | FirePot Temperature |
| setpoint | `number.*_smoker_set_temperature` | Smoker Set Temperature (140–450, step 5) |
| power | `switch.*_smoker_power` | Smoker Power |
| mode | `select.*_cook_mode` | Cook Mode (Heat/Smoke) |
| smoke | `select.*_p_select` | P Select (P0–P4 → pills 1–5) |
| fan / auger / hotrod | `switch.*_fan`, `*_auger`, `*_hotrod` | -Fan, -Auger, -HotRod |
| manual_auger / manual_hotrod | `switch.*_manual_auger`, `*_manual_hotrod` | Manual Auger / Hotrod |
| pellet | `sensor.*_pellet_level` | Pellet Level |
| links | `binary_sensor.*_tailnet_vpn_linked`, `*_phone_lan_linked`, `*_ble_client_linked`, `*_home_assistant_api_linked` | link icons |
| settings | `switch.*_settings_units_fahrenheit`, `*_settings_theme_dark`, `number.*_settings_brightness`, `*_settings_relight_f`, `*_settings_pellet_warn_pct`, `*_settings_chamber_cal_offset_f`, `switch.*_pellet_tof_sensor` | web_api / pellet |
| prime | `button.*_manual_prime_90/180/350/cancel` | Manual Prime |
| about | `sensor.*_firmware_version`, `*_lan_hostname`, `*_tailscale_tailnet_ip` | text sensors |
| safety | `button.*_emergency_stop`, `*_controller_restart` | control |

The temperature chart and Cooks list use HA's recorder history (`history/history_during_period`).

## Build
```
npm install
npm run build   # → dist/cst-grill-card.js
```
`demo/index.html` renders the card with a mock `hass` for previews.

Based on [custom-cards/boilerplate-card](https://github.com/custom-cards/boilerplate-card) (MIT).
