import { RotateCcw, SlidersHorizontal, Waves } from 'lucide-react'
import type { AppSettings } from '../../../shared/types'

const frequencies = ['31 Hz','62 Hz','125 Hz','250 Hz','500 Hz','1 kHz','2 kHz','4 kHz','8 kHz','16 kHz']
const presets: Record<string, number[]> = {
  Flat: [0,0,0,0,0,0,0,0,0,0], Rock: [5,3,2,0,-2,-1,2,4,5,5], Jazz: [3,2,1,2,-1,-1,0,2,3,4], Classical: [4,3,2,1,-1,-1,0,2,3,4], 'Bass Boost': [8,6,4,2,0,0,0,0,0,0], Pop: [-1,2,4,4,1,-1,0,2,3,2], Vocal: [-3,-2,0,2,4,4,3,1,0,-1]
}
export default function EffectsPanel({ settings, onChange }: { settings: AppSettings; onChange: (p: Partial<AppSettings>) => void }) {
  const updateBand = (index: number, value: number) => { const next = [...settings.eqBands]; next[index] = value; onChange({ eqBands: next, eqPreset: 'Custom' }) }
  return <div className="effects-panel">
    <div className="panel-title-row"><div><span className="eyebrow">PLAYBACK LAB</span><h2>Sound shaping</h2><p className="muted">Effects are applied live while audio plays.</p></div><SlidersHorizontal size={24}/></div>
    <div className="effects-card"><div className="settings-row"><label>Equalizer preset</label><select value={presets[settings.eqPreset] ? settings.eqPreset : 'Custom'} onChange={e => { const name = e.target.value; onChange({ eqPreset: name, eqBands: presets[name] || settings.eqBands }) }}>{Object.keys(presets).map(p => <option key={p}>{p}</option>)}<option>Custom</option></select><button className="subtle-button" onClick={() => onChange({ eqPreset: 'Flat', eqBands: [...presets.Flat] })}><RotateCcw size={15}/> Reset</button></div>
      <div className="eq-row">{frequencies.map((f, i) => <label className="eq-band" key={f}><span>{f}</span><input aria-label={`${f} equalizer gain`} type="range" min={-12} max={12} step={0.5} value={settings.eqBands[i] ?? 0} onChange={e => updateBand(i, Number(e.target.value))}/><b>{(settings.eqBands[i] ?? 0) > 0 ? '+' : ''}{settings.eqBands[i] ?? 0}</b></label>)}</div><div className="eq-axis"><span>−12 dB</span><span>0 dB</span><span>+12 dB</span></div>
    </div>
    <div className="effects-card control-grid">
      <Control title="Tempo" value={settings.effectTempo} min={0.5} max={2} step={0.05} display={`${settings.effectTempo.toFixed(2)}×`} onChange={v => onChange({ effectTempo: v })}/>
      <Control title="Pitch shift" value={settings.effectPitch} min={-12} max={12} step={1} display={`${settings.effectPitch > 0 ? '+' : ''}${settings.effectPitch} st`} onChange={v => onChange({ effectPitch: v })}/>
      <Control title="Reverb" value={settings.effectReverb} min={0} max={1} step={0.02} display={settings.effectReverb === 0 ? 'Off' : `${Math.round(settings.effectReverb*100)}% wet`} onChange={v => onChange({ effectReverb: v })}/>
      <Control title="Distortion" value={settings.effectDistortion} min={0} max={1} step={0.02} display={settings.effectDistortion === 0 ? 'Off' : `${Math.round(settings.effectDistortion*100)}%`} onChange={v => onChange({ effectDistortion: v })}/>
      <p className="subtle-note"><Waves size={15}/> Independent pitch and tempo use the SoundTouch AudioWorklet when available. If the worklet cannot start, playback falls back to native rate control. The bypass switch in Advanced Settings gives a quick clean-signal comparison.</p>
    </div>
  </div>
}
function Control({ title, value, min, max, step, display, onChange }: { title: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void }) {
  return <label className="effect-control"><span className="effect-control-head"><b>{title}</b><strong>{display}</strong></span><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}/><span className="control-limits"><small>{min}</small><small>{max}</small></span></label>
}
