import { useState } from 'react'
import { ArrowDown, ArrowUp, ListOrdered, RotateCcw, SlidersHorizontal, Waves } from 'lucide-react'
import type { AppSettings, EffectName } from '../../../shared/types'

const defaultFrequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
const formatFrequency = (value: number) => value >= 1000 ? `${Number((value / 1000).toFixed(2))} kHz` : `${Math.round(value)} Hz`
const presets: Record<string, number[]> = {
  Flat: [0,0,0,0,0,0,0,0,0,0], Rock: [5,3,2,0,-2,-1,2,4,5,5], Jazz: [3,2,1,2,-1,-1,0,2,3,4], Classical: [4,3,2,1,-1,-1,0,2,3,4], 'Bass Boost': [8,6,4,2,0,0,0,0,0,0], Pop: [-1,2,4,4,1,-1,0,2,3,2], Vocal: [-3,-2,0,2,4,4,3,1,0,-1]
}
export default function EffectsPanel({ settings, onChange }: { settings: AppSettings; onChange: (p: Partial<AppSettings>) => void }) {
  const [frequencyDrafts, setFrequencyDrafts] = useState<Record<number, string>>({})
  const updateBand = (index: number, value: number) => { const next = [...settings.eqBands]; next[index] = value; onChange({ eqBands: next, eqPreset: 'Custom' }) }
  const updateFrequency = (index: number, value: number) => {
    const next = [...(settings.eqFrequencies?.length === 10 ? settings.eqFrequencies : defaultFrequencies)]
    next[index] = Math.max(20, Math.min(20000, Number.isFinite(value) && value > 0 ? value : defaultFrequencies[index]))
    onChange({ eqFrequencies: next })
  }
  const commitFrequency = (index: number) => {
    const raw = frequencyDrafts[index]
    if (raw !== undefined) {
      const value = Number(raw)
      if (raw.trim() && Number.isFinite(value) && value > 0) updateFrequency(index, value)
      setFrequencyDrafts(old => { const next = { ...old }; delete next[index]; return next })
    }
  }
  const resetFrequencies = () => { setFrequencyDrafts({}); onChange({ eqFrequencies: [...defaultFrequencies] }) }
  const effectChain: EffectName[] = settings.effectChain?.length ? settings.effectChain : ['eq', 'distortion', 'reverb']
  const effectLabels: Record<EffectName, string> = { eq: '10-band equalizer', distortion: 'Distortion / saturation', reverb: 'Reverb / room' }
  const moveEffect = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= effectChain.length) return
    const next = [...effectChain]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange({ effectChain: next })
  }
  return <div className="effects-panel">
    <div className="panel-title-row"><div><span className="eyebrow">PLAYBACK LAB</span><h2>Sound shaping</h2><p className="muted">Effects are applied live while audio plays.</p></div><SlidersHorizontal size={24}/></div>
    <div className="effects-card"><div className="settings-row"><label>Equalizer preset</label><select value={presets[settings.eqPreset] ? settings.eqPreset : 'Custom'} onChange={e => { const name = e.target.value; onChange({ eqPreset: name, eqBands: presets[name] || settings.eqBands }) }}>{Object.keys(presets).map(p => <option key={p}>{p}</option>)}<option>Custom</option></select><button className="subtle-button" onClick={() => onChange({ eqPreset: 'Flat', eqBands: [...presets.Flat] })}><RotateCcw size={15}/> Reset gain</button><button className="subtle-button" onClick={resetFrequencies}>Reset centres</button></div>
      <div className="eq-row">{defaultFrequencies.map((fallback, i) => { const frequency = settings.eqFrequencies?.[i] ?? fallback; const label = formatFrequency(frequency); return <label className="eq-band" key={i}><span>{label}</span><input aria-label={`${label} equalizer gain`} type="range" min={-12} max={12} step={0.5} value={settings.eqBands[i] ?? 0} onChange={e => updateBand(i, Number(e.target.value))}/><b>{(settings.eqBands[i] ?? 0) > 0 ? '+' : ''}{settings.eqBands[i] ?? 0}</b><input className="eq-frequency-input" aria-label={`Band ${i + 1} centre frequency in Hz`} title="Centre frequency in Hz (20–20000)" type="number" min={20} max={20000} step={1} value={frequencyDrafts[i] ?? String(frequency)} onChange={e => setFrequencyDrafts(old => ({ ...old, [i]: e.target.value }))} onBlur={() => commitFrequency(i)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}/></label>})}</div><div className="eq-axis"><span>−12 dB</span><span>0 dB</span><span>+12 dB</span></div>
    </div>
    <div className="effects-card effect-chain-card">
      <div className="effect-chain-header"><div><span className="eyebrow">SIGNAL ROUTING</span><h3><ListOrdered size={16}/> Effect chain</h3><p>Reorder the live DSP graph. Changes apply to the current playback session.</p></div><button className={`subtle-button ${settings.effectsBypass ? 'effect-bypass-active' : ''}`} aria-pressed={settings.effectsBypass} onClick={() => onChange({ effectsBypass: !settings.effectsBypass })}>{settings.effectsBypass ? 'A/B: clean signal' : 'A/B: processed signal'}</button></div>
      <div className="effect-chain-list">{effectChain.map((effect, index) => <div className="effect-chain-row" key={effect}><span className="effect-chain-number">{index + 1}</span><span className="effect-chain-name">{effectLabels[effect]}</span><div className="effect-chain-move"><button className="icon-button" type="button" title={`Move ${effectLabels[effect]} up`} aria-label={`Move ${effectLabels[effect]} up`} disabled={index === 0} onClick={() => moveEffect(index, -1)}><ArrowUp size={14}/></button><button className="icon-button" type="button" title={`Move ${effectLabels[effect]} down`} aria-label={`Move ${effectLabels[effect]} down`} disabled={index === effectChain.length - 1} onClick={() => moveEffect(index, 1)}><ArrowDown size={14}/></button></div></div>)}</div>
      <p className="subtle-note"><Waves size={15}/> A/B toggles the DSP bypass without seeking or restarting the track, so you can compare the same passage.</p>
    </div>
    <div className="effects-card control-grid">
      <Control title="EQ bandwidth (Q)" value={settings.eqQ} min={0.3} max={8} step={0.1} display={settings.eqQ.toFixed(1)} onChange={v => onChange({ eqQ: v })}/>
      <Control title="Stereo width" value={settings.stereoWidth} min={0} max={2} step={0.05} display={Math.abs(settings.stereoWidth - 1) < 0.025 ? 'Neutral' : settings.stereoWidth < 1 ? `${Math.round(settings.stereoWidth*100)}% narrow` : `${Math.round(settings.stereoWidth*100)}% wide`} onChange={v => onChange({ stereoWidth: v })}/>
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
