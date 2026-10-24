// Entity map derived from the CST1Pot ESPHome YAML (packages/*.yaml).
// ESPHome entity_ids are <domain>.<node>_<slug(name)>, so we match by suffix.
export interface EntityDef { domain: string; suffix: string; label: string; yaml: string }

export const ENTITY_DEFS: Record<string, EntityDef> = {
  chamber:       { domain: 'sensor', suffix: 'chamber_temperature', label: 'Chamber temperature', yaml: 'cs1pot_sensors: "Chamber Temperature" (rtd_temperature_f)' },
  firepot:       { domain: 'sensor', suffix: 'firepot_temperature', label: 'FirePot temperature', yaml: 'cs1pot_firepot_tc: "FirePot Temperature"' },
  setpoint:      { domain: 'number', suffix: 'smoker_set_temperature', label: 'Set temperature', yaml: 'cs1pot_control: "Smoker Set Temperature" 140-450 step 5' },
  power:         { domain: 'switch', suffix: 'smoker_power', label: 'Smoker power', yaml: 'cs1pot_control: "Smoker Power" (go)' },
  mode:          { domain: 'select', suffix: 'cook_mode', label: 'Cook mode', yaml: 'cs1pot_control: "Cook Mode" Heat/Smoke' },
  smoke:         { domain: 'select', suffix: 'p_select', label: 'Smoke level (P select)', yaml: 'cs1pot_control: "P Select" P0-P4/Adaptive' },
  status:        { domain: 'sensor', suffix: 'status_message', label: 'Status message', yaml: 'cs1pot_control: "Status Message" (text_sensor)' },
  fan:           { domain: 'switch', suffix: 'fan', label: 'Fan (GPIO)', yaml: 'cs1pot_gpio: "-Fan"' },
  auger:         { domain: 'switch', suffix: 'auger', label: 'Auger (GPIO)', yaml: 'cs1pot_gpio: "-Auger"' },
  hotrod:        { domain: 'switch', suffix: 'hotrod', label: 'Hot rod (GPIO)', yaml: 'cs1pot_gpio: "-HotRod"' },
  manual_auger:  { domain: 'switch', suffix: 'manual_auger', label: 'Manual auger', yaml: 'cs1pot_web_api: "Manual Auger"' },
  manual_hotrod: { domain: 'switch', suffix: 'manual_hotrod', label: 'Manual hot rod', yaml: 'cs1pot_web_api: "Manual Hotrod"' },
  prime_active:  { domain: 'binary_sensor', suffix: 'prime_active', label: 'Prime active', yaml: 'cs1pot_web_api: "Prime Active"' },
  prime_90:      { domain: 'button', suffix: 'manual_prime_90', label: 'Prime 90', yaml: 'cs1pot_web_api: "Manual Prime 90"' },
  prime_180:     { domain: 'button', suffix: 'manual_prime_180', label: 'Prime 180', yaml: 'cs1pot_web_api: "Manual Prime 180"' },
  prime_350:     { domain: 'button', suffix: 'manual_prime_350', label: 'Prime 350', yaml: 'cs1pot_web_api: "Manual Prime 350"' },
  prime_cancel:  { domain: 'button', suffix: 'manual_prime_cancel', label: 'Prime cancel', yaml: 'cs1pot_web_api: "Manual Prime Cancel"' },
  estop:         { domain: 'button', suffix: 'emergency_stop', label: 'Emergency stop', yaml: 'cs1pot_control: "Emergency Stop"' },
  pellet:        { domain: 'sensor', suffix: 'pellet_level', label: 'Pellet level %', yaml: 'cs1pot_sensors: "Pellet Level"' },
  pellet_tof:    { domain: 'switch', suffix: 'pellet_tof_sensor', label: 'Pellet ToF sensor', yaml: 'cs1pot_pellet_sensor: "Pellet ToF Sensor"' },
  units_f:       { domain: 'switch', suffix: 'settings_units_fahrenheit', label: 'Units Fahrenheit', yaml: 'cs1pot_web_api' },
  theme_dark:    { domain: 'switch', suffix: 'settings_theme_dark', label: 'Grill theme dark', yaml: 'cs1pot_web_api' },
  brightness:    { domain: 'number', suffix: 'settings_brightness', label: 'Display brightness', yaml: 'cs1pot_web_api' },
  relight:       { domain: 'number', suffix: 'settings_relight_f', label: 'Relight threshold °F', yaml: 'cs1pot_web_api' },
  pellet_warn:   { domain: 'number', suffix: 'settings_pellet_warn_pct', label: 'Pellet warning %', yaml: 'cs1pot_web_api' },
  chamber_cal:   { domain: 'number', suffix: 'settings_chamber_cal_offset_f', label: 'Chamber cal offset °F', yaml: 'cs1pot_web_api' },
  firmware:      { domain: 'sensor', suffix: 'firmware_version', label: 'Firmware version', yaml: 'cs1pot_settings_ui (text_sensor)' },
  hostname:      { domain: 'sensor', suffix: 'lan_hostname', label: 'LAN hostname', yaml: 'cs1pot_settings_ui (text_sensor)' },
  wifi_ssid:     { domain: 'sensor', suffix: 'wifi_ssid', label: 'Wi-Fi SSID', yaml: 'wifi_info ssid' },
  wifi_ip:       { domain: 'sensor', suffix: 'wifi_ip_address', label: 'Wi-Fi IP', yaml: 'wifi_info ip_address' },
  tailnet_ip:    { domain: 'sensor', suffix: 'tailscale_tailnet_ip', label: 'Tailnet IP', yaml: 'cs1pot_tailnet (text_sensor)' },
  link_vpn:      { domain: 'binary_sensor', suffix: 'tailnet_vpn_linked', label: 'VPN linked', yaml: 'cs1pot_link_icons' },
  link_lan:      { domain: 'binary_sensor', suffix: 'phone_lan_linked', label: 'Wi-Fi (phone LAN) linked', yaml: 'cs1pot_link_icons' },
  link_ble:      { domain: 'binary_sensor', suffix: 'ble_client_linked', label: 'BLE linked', yaml: 'cs1pot_link_icons' },
  link_ha:       { domain: 'binary_sensor', suffix: 'home_assistant_api_linked', label: 'HA API linked', yaml: 'cs1pot_web_api' },
  restart:       { domain: 'button', suffix: 'controller_restart', label: 'Controller restart', yaml: 'cs1pot_control: "Controller Restart"' },
};
// text_sensor maps to HA "sensor" domain.

export const PILL_TO_P = ['P0', 'P1', 'P2', 'P3', 'P4'];
export const pillForP = (p?: string): number | null => {
  const i = PILL_TO_P.indexOf(p ?? '');
  return i < 0 ? null : i + 1;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveEntities(hass: any, deviceId?: string, overrides: Record<string, string> = {}): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  const reg = hass?.entities ?? {};
  let ids: string[] = Object.keys(hass?.states ?? {});
  if (deviceId) {
    const onDev = Object.values(reg).filter((e: any) => e.device_id === deviceId).map((e: any) => e.entity_id);
    if (onDev.length) ids = onDev;
  }
  for (const [key, def] of Object.entries(ENTITY_DEFS)) {
    if (overrides[key]) { out[key] = overrides[key]; continue; }
    const want = `_${def.suffix}`;
    const cands = ids.filter((id) => id.startsWith(def.domain + '.') && (id.endsWith(want) || id === `${def.domain}.${def.suffix}`));
    // Prefer the shortest match (avoids e.g. "auger" matching "manual_auger").
    cands.sort((a, b) => a.length - b.length);
    const exact = cands.filter((c) => !/_manual_(auger|hotrod)$/.test(c) || def.suffix.startsWith('manual'));
    out[key] = exact[0];
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function findGrillDevices(hass: any): { id: string; name: string }[] {
  const devs = hass?.devices ?? {};
  const reg = hass?.entities ?? {};
  const hasSetpoint = new Set(Object.values(reg).filter((e: any) => String(e.entity_id).endsWith('_smoker_set_temperature')).map((e: any) => e.device_id));
  return Object.values(devs).filter((d: any) => hasSetpoint.has(d.id)).map((d: any) => ({ id: d.id, name: d.name_by_user || d.name }));
}
