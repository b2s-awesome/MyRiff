import { useCallback, useEffect, useRef } from 'react'
import { SoundTouchNode } from '@soundtouchjs/audio-worklet'
import processorUrl from '@soundtouchjs/audio-worklet/processor?url'
import type { RefObject } from 'react'
import type { AppSettings, EffectName } from '../../shared/types'

const FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
type AudioContextWithSink = AudioContext & { setSinkId?: (deviceId: string) => Promise<void> }

export function useAudioEngine(audioRef: RefObject<HTMLAudioElement | null>, settings: AppSettings | null, nextAudioRef?: RefObject<HTMLAudioElement | null>) {
  const contextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const soundTouchRef = useRef<SoundTouchNode | null>(null)
  const nextSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const nextSoundTouchRef = useRef<SoundTouchNode | null>(null)
  const primaryFadeGainRef = useRef<GainNode | null>(null)
  const nextFadeGainRef = useRef<GainNode | null>(null)
  const inputRef = useRef<GainNode | null>(null)
  const filtersRef = useRef<BiquadFilterNode[]>([])
  const distortionRef = useRef<WaveShaperNode | null>(null)
  const convolverRef = useRef<ConvolverNode | null>(null)
  const dryRef = useRef<GainNode | null>(null)
  const wetRef = useRef<GainNode | null>(null)
  const reverbMixRef = useRef<GainNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  const setOutputDevice = useCallback(async (deviceId: string) => {
    const ctx = contextRef.current
    if (!ctx) return
    const setSinkId = (ctx as AudioContextWithSink).setSinkId
    if (typeof setSinkId !== 'function') {
      if (deviceId) throw new Error('This Electron runtime cannot route processed playback to a selected output device. Choose System default in Audio Settings.')
      return
    }
    try { await setSinkId.call(ctx, deviceId || '') }
    catch (error) { throw new Error(`Audio output routing failed: ${error instanceof Error ? error.message : 'the selected device could not be opened.'}`) }
  }, [])
  const widthSplitterRef = useRef<ChannelSplitterNode | null>(null)
  const widthMergerRef = useRef<ChannelMergerNode | null>(null)
  const widthGainsRef = useRef<GainNode[]>([])

  const rebuildGraph = useCallback(() => {
    const ctx = contextRef.current; const input = inputRef.current; const analyser = analyserRef.current
    if (!ctx || !input || !analyser) return
    try {
      input.disconnect()
      for (const node of filtersRef.current) node.disconnect()
      distortionRef.current?.disconnect(); dryRef.current?.disconnect(); wetRef.current?.disconnect()
      convolverRef.current?.disconnect(); reverbMixRef.current?.disconnect(); analyser.disconnect()
      widthSplitterRef.current?.disconnect(); widthMergerRef.current?.disconnect()
      for (const node of widthGainsRef.current) node.disconnect()
      let current: AudioNode = input
      const uniqueChain: EffectName[] = (settings?.effectChain?.length ? settings.effectChain : (['eq', 'distortion', 'reverb'] as EffectName[])).filter((name, i, all) => all.indexOf(name) === i)
      // A/B bypass must skip the entire DSP chain, not just stereo width.
      // Keeping the source connected directly to the analyser below gives a true clean-signal comparison.
      if (!settings?.effectsBypass) {
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
      }
      const width = settings?.effectsBypass ? 1 : Math.max(0, Math.min(2, settings?.stereoWidth ?? 1))
      const splitter = widthSplitterRef.current; const merger = widthMergerRef.current; const widthGains = widthGainsRef.current
      if (splitter && merger && widthGains.length === 4 && Math.abs(width - 1) > 0.001) {
        const mid = (1 + width) / 2; const side = (1 - width) / 2
        widthGains[0].gain.value = mid; widthGains[1].gain.value = side
        widthGains[2].gain.value = side; widthGains[3].gain.value = mid
        current.connect(splitter)
        splitter.connect(widthGains[0], 0); widthGains[0].connect(merger, 0, 0)
        splitter.connect(widthGains[1], 1); widthGains[1].connect(merger, 0, 0)
        splitter.connect(widthGains[2], 0); widthGains[2].connect(merger, 0, 1)
        splitter.connect(widthGains[3], 1); widthGains[3].connect(merger, 0, 1)
        current = merger
      }
      current.connect(analyser); analyser.connect(ctx.destination)
    } catch (error) { console.warn('MyRiff audio graph rebuild failed:', error) }
  }, [settings?.effectChain, settings?.stereoWidth, settings?.effectsBypass])

  const ensureGraph = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    if (!contextRef.current) {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextCtor) throw new Error('This environment does not support the Web Audio API.')
      const ctx: AudioContext = new AudioContextCtor()
      if (settings?.audioOutputDeviceId) {
        const setSinkId = (ctx as AudioContextWithSink).setSinkId
        if (typeof setSinkId !== 'function') {
          await ctx.close().catch(() => undefined)
          throw new Error('This Electron runtime cannot route processed playback to a selected output device. Choose System default in Audio Settings.')
        }
        try { await setSinkId.call(ctx, settings.audioOutputDeviceId) }
        catch (error) {
          await ctx.close().catch(() => undefined)
          throw new Error(`Audio output routing failed: ${error instanceof Error ? error.message : 'the selected device could not be opened.'}`)
        }
      }
      const source = ctx.createMediaElementSource(audio)
      const input = ctx.createGain()
      const primaryFadeGain = ctx.createGain(); primaryFadeGain.gain.value = 1
      const nextFadeGain = ctx.createGain(); nextFadeGain.gain.value = 0
      let soundTouch: SoundTouchNode | null = null
      try {
        await SoundTouchNode.register(ctx, processorUrl)
        soundTouch = new SoundTouchNode({ context: ctx })
        source.connect(soundTouch); soundTouch.connect(primaryFadeGain)
        audio.preservesPitch = true
      } catch (error) {
        console.warn('MyRiff pitch-preserving time-stretch worklet could not start; using native playback rate:', error)
        soundTouch = null
        source.connect(primaryFadeGain)
      }
      let nextSource: MediaElementAudioSourceNode | null = null
      let nextSoundTouch: SoundTouchNode | null = null
      const nextAudio = nextAudioRef?.current
      if (nextAudio) {
        try {
          nextSource = ctx.createMediaElementSource(nextAudio)
          if (soundTouch) {
            nextSoundTouch = new SoundTouchNode({ context: ctx })
            nextSource.connect(nextSoundTouch); nextSoundTouch.connect(nextFadeGain)
            nextAudio.preservesPitch = true
          } else nextSource.connect(nextFadeGain)
        } catch (error) {
          console.warn('MyRiff preloaded-track DSP could not use the worklet; using native rate control:', error)
          if (nextSource && !nextSoundTouch) nextSource.connect(nextFadeGain)
          nextSoundTouch = null
        }
      }
      primaryFadeGain.connect(input)
      nextFadeGain.connect(input)
      const filters: BiquadFilterNode[] = []
      FREQUENCIES.forEach((fallbackFrequency, index) => {
        const maxFrequency = Math.min(20000, ctx.sampleRate / 2)
        const frequency = Math.max(20, Math.min(maxFrequency, settings?.eqFrequencies?.[index] ?? fallbackFrequency))
        const filter = ctx.createBiquadFilter(); filter.type = 'peaking'; filter.frequency.value = frequency; filter.Q.value = Math.max(0.3, Math.min(8, settings?.eqQ ?? 1.1)); filter.gain.value = 0
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
      const widthSplitter = ctx.createChannelSplitter(2); const widthMerger = ctx.createChannelMerger(2)
      const widthGains = [ctx.createGain(), ctx.createGain(), ctx.createGain(), ctx.createGain()]
      sourceRef.current = source; soundTouchRef.current = soundTouch
      nextSourceRef.current = nextSource; nextSoundTouchRef.current = nextSoundTouch
      primaryFadeGainRef.current = primaryFadeGain; nextFadeGainRef.current = nextFadeGain
      inputRef.current = input; filtersRef.current = filters; distortionRef.current = distortion
      widthSplitterRef.current = widthSplitter; widthMergerRef.current = widthMerger; widthGainsRef.current = widthGains
      dryRef.current = dry; wetRef.current = wet; reverbMixRef.current = reverbMix; convolverRef.current = convolver; analyserRef.current = analyser
      contextRef.current = ctx
      rebuildGraph()
      if (soundTouch) { const tempo = Math.max(0.5, Math.min(2, settings?.effectTempo ?? 1)); audio.playbackRate = 1; audio.preservesPitch = true; soundTouch.playbackRate.value = tempo; soundTouch.pitch.value = 1; soundTouch.pitchSemitones.value = Math.max(-24, Math.min(24, settings?.effectPitch ?? 0)) }
      if (nextSoundTouch) { nextSoundTouch.playbackRate.value = Math.max(0.5, Math.min(2, settings?.effectTempo ?? 1)); nextSoundTouch.pitch.value = 1; nextSoundTouch.pitchSemitones.value = Math.max(-24, Math.min(24, settings?.effectPitch ?? 0)) }
    }
    if (contextRef.current.state === 'suspended') await contextRef.current.resume()
  }, [audioRef, rebuildGraph, settings?.audioOutputDeviceId, settings?.eqQ, settings?.eqFrequencies])

  useEffect(() => { if (contextRef.current) rebuildGraph() }, [settings?.effectChain, settings?.stereoWidth, settings?.effectsBypass, rebuildGraph])

  const resetCrossfade = useCallback(() => {
    const ctx = contextRef.current; const primary = primaryFadeGainRef.current?.gain; const secondary = nextFadeGainRef.current?.gain
    if (!ctx || !primary || !secondary) return
    const now = ctx.currentTime
    primary.cancelScheduledValues(now); secondary.cancelScheduledValues(now)
    primary.setTargetAtTime(1, now, 0.012); secondary.setTargetAtTime(0, now, 0.012)
  }, [])

  const crossfadeToNext = useCallback((seconds: number) => {
    const ctx = contextRef.current; const primary = primaryFadeGainRef.current?.gain; const secondary = nextFadeGainRef.current?.gain
    if (!ctx || !primary || !secondary || !Number.isFinite(seconds) || seconds <= 0) return false
    const now = ctx.currentTime
    const duration = Math.max(0.08, Math.min(20, seconds))
    const primaryStart = Math.max(0, Math.min(1, primary.value))
    const secondaryStart = Math.max(0, Math.min(1, secondary.value))
    const sampleCount = 65
    const primaryCurve = new Float32Array(sampleCount)
    const secondaryCurve = new Float32Array(sampleCount)
    for (let i = 0; i < sampleCount; i++) {
      const progress = i / (sampleCount - 1)
      const angle = progress * Math.PI / 2
      primaryCurve[i] = primaryStart * Math.cos(angle)
      secondaryCurve[i] = secondaryStart + (1 - secondaryStart) * Math.sin(angle)
    }
    primary.cancelScheduledValues(now); secondary.cancelScheduledValues(now)
    primary.setValueAtTime(primaryStart, now); secondary.setValueAtTime(secondaryStart, now)
    // Equal-power curves avoid the perceived mid-fade dip of linear amplitude ramps.
    primary.setValueCurveAtTime(primaryCurve, now, duration)
    secondary.setValueCurveAtTime(secondaryCurve, now, duration)
    return true
  }, [])

  const handoffToMain = useCallback((seconds = 0.16) => {
    const ctx = contextRef.current; const primary = primaryFadeGainRef.current?.gain; const secondary = nextFadeGainRef.current?.gain
    if (!ctx || !primary || !secondary) return false
    const now = ctx.currentTime; const end = now + Math.max(0.04, Math.min(2, seconds))
    primary.cancelScheduledValues(now); secondary.cancelScheduledValues(now)
    primary.setValueAtTime(primary.value, now); secondary.setValueAtTime(secondary.value, now)
    primary.linearRampToValueAtTime(1, end); secondary.linearRampToValueAtTime(0, end)
    return true
  }, [])

  useEffect(() => {
    if (!settings) return
    const now = contextRef.current?.currentTime ?? 0
    const bypass = settings.effectsBypass
    const eqQ = Math.max(0.3, Math.min(8, settings.eqQ ?? 1.1))
    const maxFrequency = Math.min(20000, (contextRef.current?.sampleRate ?? 44100) / 2)
    filtersRef.current.forEach((filter, index) => {
      const frequency = Math.max(20, Math.min(maxFrequency, settings.eqFrequencies?.[index] ?? FREQUENCIES[index]))
      filter.frequency.setTargetAtTime(frequency, now, .025)
      filter.Q.setTargetAtTime(eqQ, now, .025)
    })
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
    const tempo = Math.max(0.5, Math.min(2, settings.effectTempo))
    const pitch = Math.max(-24, Math.min(24, settings.effectPitch))
    if (audioRef.current) {
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
    if (nextAudioRef?.current) {
      if (nextSoundTouchRef.current) {
        nextAudioRef.current.preservesPitch = true
        nextAudioRef.current.playbackRate = 1
        nextSoundTouchRef.current.playbackRate.setTargetAtTime(tempo, now, .02)
        nextSoundTouchRef.current.pitch.setTargetAtTime(1, now, .02)
        nextSoundTouchRef.current.pitchSemitones.setTargetAtTime(pitch, now, .02)
      } else {
        nextAudioRef.current.preservesPitch = false
        nextAudioRef.current.playbackRate = Math.max(.25, Math.min(4, tempo * Math.pow(2, pitch / 12)))
      }
    }
  }, [settings, audioRef, nextAudioRef])

  useEffect(() => () => {
    soundTouchRef.current?.disconnect(); nextSoundTouchRef.current?.disconnect()
    sourceRef.current?.disconnect(); nextSourceRef.current?.disconnect()
    primaryFadeGainRef.current?.disconnect(); nextFadeGainRef.current?.disconnect()
    widthSplitterRef.current?.disconnect(); widthMergerRef.current?.disconnect(); widthGainsRef.current.forEach(node => node.disconnect())
    contextRef.current?.close().catch(() => undefined)
  }, [])
  return { ensureGraph, setOutputDevice, context: contextRef, analyser: analyserRef, crossfadeToNext, handoffToMain, resetCrossfade }
}
