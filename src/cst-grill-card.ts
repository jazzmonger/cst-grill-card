import { LitElement, html, css, svg, nothing, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { resolveEntities, pillForP, PILL_TO_P, findGrillDevices } from './entities';
import './editor';

const VERSION = '0.1.2';
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface CstGrillCardConfig {
  type: string;
  device_id?: string;
  title?: string;
  default_tab?: 'control' | 'temps' | 'cooks' | 'settings';
  hours?: number;
  entities?: Record<string, string>;
}

type Pt = [number, number];
// Average points into fixed time buckets so dense sensors (thousands of samples/day) draw cleanly.
function bucket(pts: Pt[], t0: number, t1: number, n: number): Pt[] {
  if (pts.length <= n) return pts;
  const w = (t1 - t0) / n, sum = new Array(n).fill(0), cnt = new Array(n).fill(0);
  for (const [t, v] of pts) { const i = Math.min(n - 1, Math.max(0, Math.floor((t - t0) / w))); sum[i] += v; cnt[i]++; }
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) if (cnt[i]) out.push([t0 + (i + 0.5) * w, sum[i] / cnt[i]]);
  return out;
}
const TABS = [
  { id: 'control', label: 'Control', icon: 'mdi:view-dashboard-outline' },
  { id: 'temps', label: 'Temps', icon: 'mdi:chart-line' },
  { id: 'cooks', label: 'Cooks', icon: 'mdi:calendar-month-outline' },
  { id: 'settings', label: 'Settings', icon: 'mdi:cog-outline' },
] as const;
const WINDOWS = [0.5, 1, 2, 4, 8, 12, 24];

@customElement('cst-grill-card')
export class CstGrillCard extends LitElement {
  @property({ attribute: false }) public hass: any;
  @state() private _config!: CstGrillCardConfig;
  @state() private _tab = 'control';
  @state() private _hist: Record<string, Pt[]> = {};
  @state() private _cooks: { start: number; end: number; peak?: number }[] = [];
  @state() private _win = 4;
  @state() private _optSet?: number;
  private _setTimer?: number;
  private _histAt = 0;

  static getConfigElement() { return document.createElement('cst-grill-card-editor'); }
  static getStubConfig(hass: any) {
    const d = findGrillDevices(hass)[0];
    return { type: 'custom:cst-grill-card', ...(d ? { device_id: d.id } : {}) };
  }

  setConfig(config: CstGrillCardConfig) {
    if (!config) throw new Error('Invalid configuration');
    this._config = { hours: 4, ...config };
    this._tab = config.default_tab ?? this._tab;
    this._win = Math.max(0, WINDOWS.indexOf(this._config.hours ?? 4));
  }
  getCardSize() { return 9; }
  getGridOptions() { return { columns: 12, min_columns: 6, rows: 'auto' }; }

  private get ents() {
    let dev = this._config.device_id;
    if (!dev && this.hass) dev = findGrillDevices(this.hass)[0]?.id;
    return resolveEntities(this.hass, dev, this._config.entities ?? {});
  }
  private st(key: string) { const id = this.ents[key]; return id ? this.hass?.states?.[id] : undefined; }
  private num(key: string): number | undefined { const s = this.st(key); const v = parseFloat(s?.state); return isNaN(v) ? undefined : v; }
  private on(key: string) { return this.st(key)?.state === 'on'; }
  private call(domain: string, service: string, key: string, data: any = {}) {
    const id = this.ents[key]; if (!id) return;
    this.hass.callService(domain, service, { entity_id: id, ...data });
  }

  protected updated(ch: PropertyValues) {
    if (ch.has('hass') && this.hass && Date.now() - this._histAt > 60_000) this._loadHistory();
  }

  private async _loadHistory() {
    this._histAt = Date.now();
    const e = this.ents;
    const hrs = Math.max(WINDOWS[WINDOWS.length - 1], 24);
    const ids = [e.chamber, e.firepot, e.setpoint].filter(Boolean) as string[];
    if (!ids.length || !this.hass?.callWS) return;
    const now = new Date();
    try {
      const r: any = await this.hass.callWS({
        type: 'history/history_during_period',
        start_time: new Date(now.getTime() - hrs * 3600e3).toISOString(),
        end_time: now.toISOString(), entity_ids: ids, minimal_response: true, no_attributes: true,
      });
      const h: Record<string, Pt[]> = {};
      for (const [k, key] of [[e.chamber, 'chamber'], [e.firepot, 'firepot'], [e.setpoint, 'setpoint']] as const) {
        if (!k || !r[k]) continue;
        h[key] = r[k].map((p: any) => [((p.lu ?? p.last_updated) as number) * (p.lu ? 1000 : 1), parseFloat(p.s ?? p.state)] as Pt)
          .filter((p: Pt) => !isNaN(p[1]));
      }
      this._hist = h;
      if (e.power) {
        const pr: any = await this.hass.callWS({
          type: 'history/history_during_period',
          start_time: new Date(now.getTime() - 14 * 86400e3).toISOString(),
          end_time: now.toISOString(), entity_ids: [e.power], minimal_response: true, no_attributes: true,
        });
        const rows = pr[e.power] ?? []; const cooks: { start: number; end: number; peak?: number }[] = [];
        let start: number | null = null;
        for (const p of rows) {
          const t = (p.lu ?? 0) * 1000; const s = p.s ?? p.state;
          if (s === 'on' && start === null) start = t;
          if (s !== 'on' && start !== null) { cooks.push({ start, end: t }); start = null; }
        }
        if (start !== null) cooks.push({ start, end: Date.now() });
        // Merge on/off blips < 5 min apart, then drop runs under 10 min (test toggles).
        const merged: typeof cooks = [];
        for (const c of cooks) {
          const last = merged[merged.length - 1];
          if (last && c.start - last.end < 5 * 60e3) last.end = c.end; else merged.push({ ...c });
        }
        cooks.splice(0, cooks.length, ...merged.filter((c) => c.end - c.start >= 10 * 60e3));
        for (const c of cooks) {
          const pts = (h.chamber ?? []).filter((p) => p[0] >= c.start && p[0] <= c.end);
          if (pts.length) c.peak = Math.max(...pts.map((p) => p[1]));
        }
        this._cooks = cooks.reverse();
      }
    } catch (err) { /* history not available (e.g. recorder excluded) */ }
  }

  // ---------- actions ----------
  private _mode(m: 'Off' | 'Heat' | 'Smoke') {
    if (m === 'Off') return this.call('switch', 'turn_off', 'power');
    this.call('select', 'select_option', 'mode', { option: m });
    if (!this.on('power')) this.call('switch', 'turn_on', 'power');
  }
  private _nudge(d: number) {
    const s = this.st('setpoint'); if (!s) return;
    const step = s.attributes.step ?? 5, min = s.attributes.min ?? 140, max = s.attributes.max ?? 450;
    const cur = this._optSet ?? parseFloat(s.state);
    this._optSet = Math.min(max, Math.max(min, cur + d * step));
    clearTimeout(this._setTimer);
    this._setTimer = window.setTimeout(() => {
      this.call('number', 'set_value', 'setpoint', { value: this._optSet });
      window.setTimeout(() => (this._optSet = undefined), 2500);
    }, 600);
  }
  private _toggle(key: string) { this.call('switch', 'toggle', key); }
  private _press(key: string) { this.call('button', 'press', key); }

  // ---------- render ----------
  render() {
    if (!this._config || !this.hass) return nothing;
    return html`<ha-card>
      ${this._config.title ? html`<div class="title">${this._config.title}</div>` : nothing}
      <div class="tabs" role="tablist">
        ${TABS.map((t) => html`<button role="tab" class="tab ${this._tab === t.id ? 'active' : ''}" aria-selected=${this._tab === t.id}
            @click=${() => (this._tab = t.id)}><ha-icon icon=${t.icon}></ha-icon><span>${t.label}</span></button>`)}
      </div>
      <div class="body">
        ${this._tab === 'control' ? this._control() : this._tab === 'temps' ? this._temps() : this._tab === 'cooks' ? this._cooksTab() : this._settings()}
      </div>
    </ha-card>`;
  }

  private _control() {
    const power = this.on('power');
    const mode = this.st('mode')?.state;
    const setF = this._optSet ?? this.num('setpoint');
    const pill = pillForP(this.st('smoke')?.state);
    const smokeOn = power && mode === 'Smoke';
    const status = this.st('status')?.state;
    const pellet = this.num('pellet');
    return html`
      <div class="modes">
        <button class="mode ${!power ? 'on' : ''}" @click=${() => this._mode('Off')}>OFF</button>
        <button class="mode ${power && mode === 'Heat' ? 'on' : ''}" @click=${() => this._mode('Heat')}>HEAT</button>
        <button class="mode ${smokeOn ? 'on' : ''}" @click=${() => this._mode('Smoke')}>SMOKE</button>
      </div>
      <div class="gaugeRow">
        <div class="rail">
          ${this._badge('Fan', 'mdi:fan', this.on('fan'), () => this._toggle('fan'))}
          ${this._badge('Auger', 'mdi:screw-lag', this.on('auger') || this.on('prime_active'), () => this._toggle('manual_auger'))}
          ${this._badge('Ign', 'mdi:fire', this.on('hotrod'), () => this._toggle('manual_hotrod'))}
        </div>
        ${this._gauge(this.num('chamber'), this.num('firepot'), setF)}
        <div class="rail">
          ${this._badge('VPN', 'mdi:shield-lock-outline', this.on('link_vpn'))}
          ${this._badge('Wi-Fi', 'mdi:wifi', this.on('link_lan') || this.on('link_ha'))}
          ${this._badge('BLE', 'mdi:bluetooth', this.on('link_ble'))}
        </div>
      </div>
      <div class="setRow">
        <button class="round" @click=${() => this._nudge(-1)}><ha-icon icon="mdi:minus"></ha-icon></button>
        <div class="setVal"><div class="lbl">SET</div><div class="big">${setF !== undefined ? Math.round(setF) : '--'}<small>°F</small></div></div>
        <button class="round" @click=${() => this._nudge(1)}><ha-icon icon="mdi:plus"></ha-icon></button>
      </div>
      <div class="lblc">Smoke Level</div>
      <div class="pills">
        ${[1, 2, 3, 4, 5].map((n) => html`<button class="pill ${pill === n ? 'on' : ''}" @click=${() => this.call('select', 'select_option', 'smoke', { option: PILL_TO_P[n - 1] })}>${n}</button>`)}
      </div>
      ${pellet !== undefined && (this.st('pellet_tof') ? this.on('pellet_tof') : true) ? html`
        <div class="pellet"><span>Pellets</span><div class="bar"><div style="width:${Math.max(0, Math.min(100, pellet))}%"></div></div><span>${Math.round(pellet)}%</span></div>` : nothing}
      ${this._chart(WINDOWS[this._win], 130, false)}
      ${status && status !== 'unknown' ? html`<div class="status">${status}</div>` : nothing}`;
  }

  private _badge(label: string, icon: string, on: boolean, tap?: () => void) {
    return html`<button class="badge ${on ? 'on' : ''} ${tap ? '' : 'ro'}" @click=${tap ?? (() => {})}>
      <ha-icon icon=${icon}></ha-icon><span>${label}</span></button>`;
  }

  private _gauge(ch?: number, fp?: number, set?: number) {
    const R = 80, cx = 100, cy = 100, a0 = 135, sweep = 270, lo = 0, hi = 500;
    const pos = (v: number) => a0 + (sweep * (Math.min(hi, Math.max(lo, v)) - lo)) / (hi - lo);
    const pt = (deg: number, r = R) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
    const arc = (d1: number, d2: number) => { const [x1, y1] = pt(d1), [x2, y2] = pt(d2); return `M${x1} ${y1} A${R} ${R} 0 ${d2 - d1 > 180 ? 1 : 0} 1 ${x2} ${y2}`; };
    const [tx1, ty1] = set !== undefined ? pt(pos(set), R - 12) : [0, 0];
    const [tx2, ty2] = set !== undefined ? pt(pos(set), R + 12) : [0, 0];
    return html`<svg class="gauge" viewBox="0 0 200 180">
      ${svg`<path d=${arc(a0, a0 + sweep)} class="track"/>`}
      ${ch !== undefined ? svg`<path d=${arc(a0, Math.max(a0 + 0.5, pos(ch)))} class="fill"/>` : nothing}
      ${set !== undefined ? svg`<line x1=${tx1} y1=${ty1} x2=${tx2} y2=${ty2} class="tick"/>` : nothing}
      ${svg`<text x="100" y="62" class="glbl">CHAMBER</text>
      <text x="100" y="112" class="gval">${ch !== undefined ? Math.round(ch) : '--'}°</text>
      <text x="100" y="140" class="gfp">🔥 ${fp !== undefined ? Math.round(fp) + '°F' : '--'}</text>`}
    </svg>`;
  }

  private _chart(hours: number, h: number, big: boolean) {
    const now = Date.now(), t0 = now - hours * 3600e3, W = 340, PADL = 30;
    const series = (['chamber', 'firepot', 'setpoint'] as const).map((k) => {
      const raw = this._hist[k] ?? [];
      const live = this.num(k);
      const pts = raw.filter((p) => p[0] >= t0);
      const before = raw.filter((p) => p[0] < t0).pop();
      if (before) pts.unshift([t0, before[1]]);
      if (live !== undefined) pts.push([now, live]);
      return { k, pts: k === 'setpoint' ? pts : bucket(pts, t0, now, 300) };
    }).filter((s) => big || s.k !== 'firepot');
    const all = series.flatMap((s) => s.pts.map((p) => p[1]));
    const ymin = all.length ? Math.floor(Math.min(...all) / 25) * 25 : 0;
    const ymax = all.length ? Math.ceil((Math.max(...all) + 1) / 25) * 25 : 500;
    const X = (t: number) => PADL + ((t - t0) / (now - t0)) * (W - PADL - 4);
    const Y = (v: number) => 6 + (1 - (v - ymin) / (ymax - ymin || 1)) * (h - 22);
    const path = (pts: Pt[], step: boolean) => pts.map((p, i) => {
      if (i === 0) return `M${X(p[0])} ${Y(p[1])}`;
      return step ? `H${X(p[0])} V${Y(p[1])}` : `L${X(p[0])} ${Y(p[1])}`;
    }).join(' ');
    const label = hours < 1 ? `${hours * 60}m` : `${hours}h`;
    return html`<div class="chart">
      <div class="chartHead"><span>Temperature · ${label}</span>
        <span class="legend"><i class="c"></i>Chamber${big ? html`<i class="f"></i>FirePot` : nothing}<i class="s"></i>Set</span>
        <span class="zoom"><button @click=${() => (this._win = Math.max(0, this._win - 1))}><ha-icon icon="mdi:magnify-plus-outline"></ha-icon></button><button @click=${() => (this._win = Math.min(WINDOWS.length - 1, this._win + 1))}><ha-icon icon="mdi:magnify-minus-outline"></ha-icon></button></span>
      </div>
      <svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" style="height:${h}px">
        ${[0, 0.5, 1].map((f) => { const v = ymin + f * (ymax - ymin); return svg`<line x1=${PADL} x2=${W} y1=${Y(v)} y2=${Y(v)} class="grid"/><text x="2" y=${Y(v) + 3} class="ax">${Math.round(v)}</text>`; })}
        ${series.map((s) => s.pts.length > 1 ? svg`<path d=${path(s.pts, s.k === 'setpoint')} class="ln ${s.k}"/>` : nothing)}
      </svg></div>`;
  }

  private _temps() {
    const ch = this.num('chamber'), fp = this.num('firepot'), set = this._optSet ?? this.num('setpoint');
    return html`
      <div class="tiles">
        <div class="tile"><div class="lbl">Chamber</div><div class="tv cy">${ch !== undefined ? Math.round(ch) : '--'}°F</div></div>
        <div class="tile"><div class="lbl">FirePot</div><div class="tv fp">${fp !== undefined ? Math.round(fp) : '--'}°F</div></div>
        <div class="tile"><div class="lbl">Set</div><div class="tv">${set !== undefined ? Math.round(set) : '--'}°F</div></div>
      </div>
      <div class="wins">${WINDOWS.map((w, i) => html`<button class="pill sm ${i === this._win ? 'on' : ''}" @click=${() => (this._win = i)}>${w < 1 ? w * 60 + 'm' : w + 'h'}</button>`)}</div>
      ${this._chart(WINDOWS[this._win], 240, true)}`;
  }

  private _cooksTab() {
    const fmt = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const dur = (ms: number) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
    return html`<div class="group"><div class="ghead">Recent cooks (14 days, from Smoker Power history)</div>
      ${this._cooks.length ? this._cooks.map((c) => html`<div class="row"><ha-icon icon="mdi:grill-outline"></ha-icon>
        <div class="rmain"><div>${fmt(c.start)}</div><div class="sub">${dur(c.end - c.start)}${c.peak ? ` · peak ${Math.round(c.peak)}°F` : ''}</div></div></div>`)
        : html`<div class="row sub">No cooks of 10 min or longer yet.</div>`}
    </div>`;
  }

  private _numRow(key: string, label: string) {
    const s = this.st(key); if (!s) return nothing;
    const a = s.attributes;
    return html`<div class="row"><div class="rmain">${label}</div>
      <input type="range" min=${a.min} max=${a.max} step=${a.step} .value=${s.state}
        @change=${(e: any) => this.call('number', 'set_value', key, { value: parseFloat(e.target.value) })}>
      <span class="val">${s.state}${a.unit_of_measurement ? ' ' + a.unit_of_measurement : ''}</span></div>`;
  }
  private _swRow(key: string, label: string) {
    if (!this.st(key)) return nothing;
    return html`<div class="row"><div class="rmain">${label}</div><ha-switch .checked=${this.on(key)} @change=${() => this._toggle(key)}></ha-switch></div>`;
  }
  private _btnRow(key: string, label: string, danger = false) {
    if (!this.st(key)) return nothing;
    return html`<div class="row link ${danger ? 'danger' : ''}" @click=${() => (danger ? confirm(`${label}?`) && this._press(key) : this._press(key))}>${label}</div>`;
  }
  private _infoRow(key: string, label: string) {
    const s = this.st(key); if (!s) return nothing;
    return html`<div class="row"><div class="rmain">${label}</div><span class="val">${s.state}</span></div>`;
  }

  private _settings() {
    return html`
      <div class="group"><div class="ghead">Display</div>
        ${this._swRow('units_f', 'Fahrenheit')}${this._swRow('theme_dark', 'Dark theme')}${this._numRow('brightness', 'Brightness')}</div>
      <div class="group"><div class="ghead">Cooking</div>
        ${this._numRow('relight', 'Relight below')}${this._numRow('chamber_cal', 'Chamber offset')}
        ${this._swRow('pellet_tof', 'Pellet sensor')}${this._numRow('pellet_warn', 'Pellet warning')}</div>
      <div class="group"><div class="ghead">Prime auger</div>
        ${this._btnRow('prime_90', 'Prime 90 s')}${this._btnRow('prime_180', 'Prime 180 s')}${this._btnRow('prime_350', 'Prime 350 s')}${this._btnRow('prime_cancel', 'Cancel prime')}</div>
      <div class="group"><div class="ghead">About</div>
        ${this._infoRow('firmware', 'Firmware')}${this._infoRow('hostname', 'Hostname')}${this._infoRow('wifi_ssid', 'Wi-Fi network')}${this._infoRow('wifi_ip', 'IP address')}${this._infoRow('tailnet_ip', 'Tailnet IP')}
        ${this._btnRow('restart', 'Restart controller', true)}${this._btnRow('estop', 'Emergency stop', true)}</div>
      <div class="ver">cst-grill-card ${VERSION}</div>`;
  }

  static styles = css`
    :host { --neon:#2EE6FF; --neonFill:#5AECFC; --neonDim:#0A3A44; --track:#1C3844; --muted:#6B7380; --fp:#FF5F3C; --yel:#EAB308; --err:#F472B6; --pillTxt:#051014; }
    ha-card { background: linear-gradient(#080A0C, #101216); color:#fff; overflow:hidden; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Roboto, sans-serif; }
    .title { padding:12px 16px 0; font-size:17px; font-weight:600; text-align:center; }
    .tabs { display:flex; border-bottom:1px solid #1d2128; }
    .tab { flex:1; background:none; border:0; color:var(--muted); padding:10px 4px 8px; display:flex; flex-direction:column; align-items:center; gap:2px; font-size:11px; font-weight:600; cursor:pointer; border-bottom:2px solid transparent; letter-spacing:.2px; }
    .tab ha-icon { --mdc-icon-size:20px; }
    .tab.active { color:var(--neon); border-bottom-color:var(--neon); }
    .body { padding:10px 16px 14px; }
    button { font-family:inherit; }
    .modes { display:flex; gap:8px; }
    .mode { flex:1; background:#0C0E12; color:var(--muted); border:1px solid var(--neonDim); border-radius:10px; padding:9px 0; font-weight:800; font-size:15px; letter-spacing:1px; cursor:pointer; }
    .mode.on { background:var(--neonFill); color:var(--pillTxt); border-color:var(--neon); box-shadow:0 0 12px rgba(46,230,255,.35); }
    .gaugeRow { display:flex; align-items:center; gap:6px; margin-top:6px; }
    .rail { display:flex; flex-direction:column; gap:8px; width:54px; }
    .badge { background:none; border:0; color:var(--muted); display:flex; flex-direction:column; align-items:center; font-size:10px; font-weight:600; cursor:pointer; padding:2px; }
    .badge.ro { cursor:default; }
    .badge ha-icon { --mdc-icon-size:22px; }
    .badge.on { color:var(--neon); filter:drop-shadow(0 0 4px rgba(46,230,255,.6)); }
    .gauge { flex:1; max-height:200px; }
    .track { fill:none; stroke:var(--track); stroke-width:12; stroke-linecap:round; }
    .fill { fill:none; stroke:var(--neon); stroke-width:12; stroke-linecap:round; filter:drop-shadow(0 0 4px rgba(46,230,255,.7)); }
    .tick { stroke:#fff; stroke-width:3; stroke-linecap:round; }
    .glbl { fill:var(--muted); font-size:10px; font-weight:700; text-anchor:middle; letter-spacing:1.5px; }
    .gval { fill:#fff; font-size:44px; font-weight:800; text-anchor:middle; }
    .gfp { fill:var(--fp); font-size:13px; font-weight:700; text-anchor:middle; }
    .setRow { display:flex; align-items:center; justify-content:center; gap:22px; margin-top:-8px; }
    .round { width:40px; height:40px; border-radius:20px; background:#0C0E12; border:1px solid var(--neonDim); color:var(--neon); cursor:pointer; display:flex; align-items:center; justify-content:center; }
    .setVal { text-align:center; min-width:100px; }
    .lbl { color:var(--muted); font-size:11px; font-weight:700; letter-spacing:1px; }
    .big { font-size:32px; font-weight:800; color:var(--neon); }
    .big small { font-size:15px; color:var(--muted); margin-left:2px; }
    .lblc { color:var(--muted); font-size:14px; font-weight:600; text-align:center; margin-top:6px; }
    .pills { display:flex; gap:8px; justify-content:center; margin-top:6px; }
    .pill { width:44px; height:30px; border-radius:15px; background:#0C0E12; border:1px solid var(--neonDim); color:var(--muted); font-weight:800; cursor:pointer; }
    .pill.sm { width:auto; padding:0 10px; height:26px; font-size:12px; }
    .pill.on { background:var(--neonFill); color:var(--pillTxt); border-color:var(--neon); }
    .pellet { display:flex; align-items:center; gap:8px; font-size:11px; color:var(--muted); margin-top:8px; }
    .bar { flex:1; height:6px; border-radius:3px; background:var(--track); overflow:hidden; } .bar div { height:100%; background:var(--neon); }
    .chart { background:#0C0E12; border:1px solid #1d2128; border-radius:12px; padding:6px 8px; margin-top:10px; }
    .chart svg { width:100%; display:block; }
    .chartHead { display:flex; align-items:center; gap:8px; font-size:11px; color:var(--muted); font-weight:600; }
    .legend { flex:1; display:flex; align-items:center; gap:4px; justify-content:flex-end; }
    .legend i { width:10px; height:2px; display:inline-block; margin-left:6px; } .legend .c{background:var(--neon)} .legend .f{background:var(--fp)} .legend .s{background:#fff}
    .zoom button { background:none; border:0; color:var(--muted); cursor:pointer; padding:0 2px; } .zoom ha-icon { --mdc-icon-size:16px; }
    .grid { stroke:#1d2128; stroke-width:1; } .ax { fill:var(--muted); font-size:9px; }
    .ln { fill:none; stroke-width:2; vector-effect:non-scaling-stroke; } .ln.chamber{stroke:var(--neon)} .ln.firepot{stroke:var(--fp)} .ln.setpoint{stroke:#fff; stroke-dasharray:4 3; stroke-width:1.2}
    .status { margin-top:8px; font-size:11px; color:var(--muted); text-align:center; }
    .tiles { display:flex; gap:8px; } .tile { flex:1; background:#0C0E12; border:1px solid #1d2128; border-radius:12px; padding:8px; text-align:center; }
    .tv { font-size:22px; font-weight:800; margin-top:2px; } .tv.cy{color:var(--neon)} .tv.fp{color:var(--fp)}
    .wins { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; margin-top:10px; }
    .group { background:#0C0E12; border-radius:10px; margin-bottom:14px; overflow:hidden; }
    .ghead { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; padding:8px 12px 4px; background:#080A0C; }
    .row { display:flex; align-items:center; gap:10px; padding:9px 12px; font-size:13px; border-top:1px solid #161a20; min-height:22px; }
    .row ha-icon { color:var(--neon); --mdc-icon-size:18px; }
    .rmain { flex:1; } .sub { color:var(--muted); font-size:11px; } .val { color:var(--muted); font-size:12px; min-width:44px; text-align:right; }
    .row input[type=range] { width:40%; accent-color:var(--neon); }
    .row.link { color:var(--neon); cursor:pointer; } .row.danger { color:var(--err); }
    .ver { text-align:center; color:var(--muted); font-size:10px; }
  `;
}

(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({ type: 'cst-grill-card', name: 'CST Grill Card', description: 'Chain Smoker 1-Pot grill controller (ESPHome), styled like the CST1Pot app.', preview: true });
console.info(`%c CST-GRILL-CARD %c ${VERSION} `, 'color:#051014;background:#2EE6FF;font-weight:700', 'color:#2EE6FF;background:#0C0E12');
