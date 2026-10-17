import { useCallback, useEffect, useRef } from 'react'
import { SoundTouchNode } from '@soundtouchjs/audio-worklet'
import processorUrl from '@soundtouchjs/audio-worklet/processor?url'
import type { RefObject } from 'react'
import type { AppSettings, EffectName } from '../../shared/types'

const FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export function useAudioEngine(audioRef: RefObject<HTMLAudioElement | null>, settings: AppSettings | null) {
  const contextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const soundTouchRef = useRef<SoundTouchNode | null>(null)
  const inputRef = useRef<GainNode | null>(null)
  const filtersRef = useRef<BiquadFilterNode[]>([])
  const distortionRef = useRef<WaveShaperNode | null>(null)
  const convolverRef = useRef<ConvolverNode | null>(null)
  const dryRef = useRef<GainNode | null>(null)
  const wetRef = useRef<GainNode | null>(null)
  const reverbMixRef = useRef<GainNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  const rebuildGraph = useCallback(() => {
    const ctx = contextRef.current; const input = inputRef.current; const analyser = analyserRef.current
    if (!ctx || !input || !analyser) return
    try {
      input.disconnect()
      for (const node of filtersRef.current) node.disconnect()
      distortionRef.current?.disconnect(); dryRef.current?.disconnect(); wetRef.current?.disconnect()
      convolverRef.current?.disconnect(); reverbMixRef.current?.disconnect(); analyser.disconnect()
      let current: AudioNode = input
      const uniqueChain: EffectName[] = (settings?.effectChain?.length ? settings.effectChain : ['eq', 'distortion', 'reverb']).filter((name, i, all) => all.indexOf(name) === i)
      for (const effect of uniqueChain) {
        if (effect === 'eq') {
          const filters = filtersRef.current
          if (filters.length) {
            current.connect(filters[0])
            for (let i = 1; i < filters.length; i++) filters[i - 1].connect(filters[i])
            current = filters[filters.length - 1]
          }
        } else if (effect === 'distortion' && distortionRef.current) {
          current.connect(distortionRef.current); current = distortionRef.current
        } else if (effect === 'reverb' && dryRef.current && wetRef.current && convolverRef.current && reverbMixRef.current) {
          current.connect(dryRef.current); dryRef.current.connect(reverbMixRef.current)
          current.connect(convolverRef.current); convolverRef.current.connect(wetRef.current); wetRef.current.connect(reverbMixRef.current)
          current = reverbMixRef.current
        }
      }
      current.connect(analyser); analyser.connect(ctx.destination)
    } catch (error) { console.warn('MyRiff audio graph rebuild failed:', error) }
  }, [settings?.effectChain])

  const ensureGraph = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    if (!contextRef.current) {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextCtor) throw new Error('This environment does not support the Web Audio API.')
      const ctx: AudioContext = new AudioContextCtor()
      const source = ctx.createMediaElementSource(audio)
      const input = ctx.createGain()
      let soundTouch: SoundTouchNode | null = null
      try {
        await SoundTouchNode.register(ctx, processorUrl)
        soundTouch = new SoundTouchNode({ context: ctx })
        soundTouch.connect(input)
        audio.preservesPitch = false
      } catch (error) {
        console.warn('MyRiff pitch-preserving time-stretch worklet could not start; using native playback rate:', error)
        soundTouch = null
      }
      const filters: BiquadFilterNode[] = []
      FREQUENCIES.forEach(frequency => {
        const filter = ctx.createBiquadFilter(); filter.type = 'peaking'; filter.frequency.value = frequency; filter.Q.value = 1.1; filter.gain.value = 0
        filters.push(filter)
      })
      const distortion = ctx.createWaveShaper(); distortion.oversample = '4x'
      const dry = ctx.createGain(); const wet = ctx.createGain(); const reverbMix = ctx.createGain(); const convolver = ctx.createConvolver()
      const impulseLength = Math.round(ctx.sampleRate * 2.2)
      const impulse = ctx.createBuffer(2, impulseLength, ctx.sampleRate)
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel)
        for (let i = 0; i < impulseLength; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseLength, 2.6)
      }
      convolver.buffer = impulse
      const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = .82
      if (soundTouch) source.connect(soundTouch); else source.connect(input)
      sourceRef.current = source; soundTouchRef.current = soundTouch; inputRef.current = input; filtersRef.current = filters; distortionRef.current = distortion
      dryRef.current = dry; wetRef.current = wet; reverbMixRef.current = reverbMix; convolverRef.current = convolver; analyserRef.current = analyser
      contextRef.current = ctx
      const setSinkId = (ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> }).setSinkId
      if (settings?.audioOutputDeviceId && setSinkId) await setSinkId.call(ctx, settings.audioOutputDeviceId).catch(error => console.warn('Audio output selection failed:', error))
      rebuildGraph()
      if (soundTouch) { const tempo = Math.max(0.5, Math.min(2, settings?.effectTempo ?? 1)); audio.playbackRate = 1; audio.preservesPitch = true; soundTouch.playbackRate.value = tempo; soundTouch.pitch.value = 1; soundTouch.pitchSemitones.value = Math.max(-24, Math.min(24, settings?.effectPitch ?? 0)) }
    }
    if (contextRef.current.state === 'suspended') await contextRef.current.resume()
  }, [audioRef, rebuildGraph, settings?.audioOutputDeviceId])

  useEffect(() => { if (contextRef.current) rebuildGraph() }, [settings?.effectChain, rebuildGraph])

  useEffect(() => {
    if (!settings) return
    const now = contextRef.current?.currentTime ?? 0
    const bypass = settings.effectsBypass
    settings.eqBands.forEach((gain, index) => {
      if (filtersRef.current[index]) filtersRef.current[index].gain.setTargetAtTime(bypass ? 0 : Math.max(-18, Math.min(18, gain)), now, .025)
    })
    const distortion = Math.max(0, Math.min(1, settings.effectDistortion))
    if (distortionRef.current) {
      const curve = new Float32Array(44100); const amount = 1 + distortion * 80
      for (let i = 0; i < curve.length; i++) { const x = (i * 2) / (curve.length - 1) - 1; curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x)) }
      distortionRef.current.curve = !bypass && distortion > 0 ? curve : null
    }
    const reverb = Math.max(0, Math.min(1, settings.effectReverb))
    if (dryRef.current) dryRef.current.gain.setTargetAtTime(bypass ? 1 : 1 - reverb * .45, now, .03)
    if (wetRef.current) wetRef.current.gain.setTargetAtTime(bypass ? 0 : reverb * .8, now, .03)
    if (audioRef.current) {
      const tempo = Math.max(0.5, Math.min(2, settings.effectTempo))
      const pitch = Math.max(-24, Math.min(24, settings.effectPitch))
      if (soundTouchRef.current) {
        audioRef.current.preservesPitch = true
        audioRef.current.playbackRate = 1
        soundTouchRef.current.playbackRate.setTargetAtTime(tempo, now, .02)
        soundTouchRef.current.pitch.setTargetAtTime(1, now, .02)
        soundTouchRef.current.pitchSemitones.setTargetAtTime(pitch, now, .02)
      } else {
        // Fallback if AudioWorklet loading is unavailable in a platform-specific packaged build.
        audioRef.current.preservesPitch = false
        audioRef.current.playbackRate = Math.max(.25, Math.min(4, tempo * Math.pow(2, pitch / 12)))
      }
    }
  }, [settings, audioRef])

  useEffect(() => () => { soundTouchRef.current?.disconnect(); contextRef.current?.close().catch(() => undefined) }, [])
  return { ensureGraph, context: contextRef, analyser: analyserRef }
}
