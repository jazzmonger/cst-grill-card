import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ENTITY_DEFS, findGrillDevices, resolveEntities } from './entities';
/* eslint-disable @typescript-eslint/no-explicit-any */

@customElement('cst-grill-card-editor')
export class CstGrillCardEditor extends LitElement {
  @property({ attribute: false }) public hass: any;
  @state() private _config: any = {};
  @state() private _showEnts = false;
  setConfig(c: any) { this._config = { ...c }; }

  private _set(patch: any) {
    this._config = { ...this._config, ...patch };
    for (const k of Object.keys(this._config)) if (this._config[k] === '' || this._config[k] === undefined) delete this._config[k];
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
  }
  private _setEnt(key: string, val: string) {
    const e = { ...(this._config.entities ?? {}) };
    if (val) e[key] = val; else delete e[key];
    this._set({ entities: Object.keys(e).length ? e : undefined });
  }

  render() {
    if (!this.hass) return html``;
    const devs = findGrillDevices(this.hass);
    const auto = resolveEntities(this.hass, this._config.device_id ?? devs[0]?.id, {});
    return html`
      <div class="f"><label>Grill (ESPHome device)</label>
        <select @change=${(e: any) => this._set({ device_id: e.target.value })}>
          <option value="" ?selected=${!this._config.device_id}>Auto (first grill found)</option>
          ${devs.map((d) => html`<option value=${d.id} ?selected=${this._config.device_id === d.id}>${d.name}</option>`)}
        </select></div>
      <div class="f"><label>Title (optional)</label><input .value=${this._config.title ?? ''} @change=${(e: any) => this._set({ title: e.target.value })}></div>
      <div class="f"><label>Default tab</label>
        <select @change=${(e: any) => this._set({ default_tab: e.target.value })}>
          ${['', 'control', 'temps', 'cooks', 'settings'].map((t) => html`<option value=${t} ?selected=${(this._config.default_tab ?? '') === t}>${t || 'control (default)'}</option>`)}
        </select></div>
      <div class="f"><label>Graph window (hours)</label>
        <select @change=${(e: any) => this._set({ hours: e.target.value ? parseFloat(e.target.value) : undefined })}>
          ${[0.5, 1, 2, 4, 8, 12, 24].map((h) => html`<option value=${h} ?selected=${(this._config.hours ?? 4) === h}>${h}</option>`)}
        </select></div>
      <button @click=${() => (this._showEnts = !this._showEnts)}>${this._showEnts ? '▾' : '▸'} Entity overrides</button>
      ${this._showEnts ? Object.entries(ENTITY_DEFS).map(([k, d]) => html`
        <div class="f"><label>${d.label} <small>(${d.domain})</small></label>
          <input list="ents-${d.domain}" placeholder=${auto[k] ?? 'not found'} .value=${this._config.entities?.[k] ?? ''}
            @change=${(e: any) => this._setEnt(k, e.target.value.trim())}></div>`) : ''}
      ${[...new Set(Object.values(ENTITY_DEFS).map((d) => d.domain))].map((dom) => html`<datalist id="ents-${dom}">
        ${Object.keys(this.hass.states).filter((id) => id.startsWith(dom + '.')).map((id) => html`<option value=${id}></option>`)}</datalist>`)}
    `;
  }
  static styles = css`
    .f { display:flex; flex-direction:column; margin-bottom:10px; } label { font-size:12px; color:var(--secondary-text-color); margin-bottom:3px; }
    input, select { padding:8px; border-radius:6px; border:1px solid var(--divider-color); background:var(--card-background-color); color:var(--primary-text-color); }
    button { margin:4px 0 10px; background:none; border:0; color:var(--primary-color); cursor:pointer; font-size:14px; padding:0; }
  `;
}
