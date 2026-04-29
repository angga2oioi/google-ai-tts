import { useEffect, useRef, useCallback } from "react";

/**
 * GoogleTTS
 *
 * Two modes that can be used together:
 *
 * ── Reactive mode ─────────────────────────────────────────────────────────
 *   text          {string}   Text to synthesize on change (debounced 800ms)
 *   prompt        {string}   Optional style prompt
 *
 * ── Preload mode ──────────────────────────────────────────────────────────
 *   preloadTexts  {Array<string | PreloadEntry>}
 *                            Strings or objects to fetch & decode on mount.
 *                            Each object can override any voice param:
 *                            { text, languageCode, voiceName, modelName,
 *                              pitch, speakingRate, prompt }
 *                            Plain strings use the component-level defaults.
 *
 * ── Imperative playback ───────────────────────────────────────────────────
 *   playSpeechRef {React.MutableRefObject}
 *                            After mount holds: { play(index), stop(),
 *                            isReady(index), readyCount() }
 *
 * Usage:
 *   const ttsRef = useRef()
 *
 *   <GoogleTTS
 *     speechUrl="/api/tts"
 *     preloadTexts={[
 *       "Hello!",
 *       { text: "Halo!", languageCode: "id-ID", voiceName: "id-ID-Neural2-A" },
 *       { text: "Welcome.", speakingRate: 0.9, pitch: -2 },
 *     ]}
 *     playSpeechRef={ttsRef}
 *     onStart={() => setPlaying(true)}
 *     onEnd={()   => setPlaying(false)}
 *     onError={console.error}
 *   />
 *
 *   ttsRef.current.play(1)    // plays "Halo!" with id-ID voice
 *   ttsRef.current.stop()
 *   ttsRef.current.isReady(0) // true once decoded
 *
 * ── Loaded events ─────────────────────────────────────────────────────────
 *   onLoaded      {func}     Reactive mode: called when the clip is decoded
 *                            and ready, just before playback begins.
 *   onAllLoaded   {func}     Preload mode: called once every entry in
 *                            preloadTexts has been decoded successfully.
 */
export default function GoogleTTS({
  speechUrl,
  // reactive mode
  text,
  prompt,
  // preload mode
  preloadTexts,
  playSpeechRef,
  // component-level voice defaults
  languageCode  = "en-US",
  voiceName     = "Charon",
  modelName     = "gemini-2.5-flash-tts",
  pitch         = 0,
  speakingRate  = 1.0,
  // callbacks
  onStart,
  onEnd,
  onError,
  onLoaded,
  onAllLoaded,
  onPreloadProgress,
}) {
  const audioCtxRef   = useRef(null);
  const sourceRef     = useRef(null);
  const debounceRef   = useRef(null);
  const naturalEndRef = useRef(false);
  // Map<index, AudioBuffer>
  const preloadCache  = useRef(new Map());
  // Set<index> — tracks in-flight fetches to avoid duplicates
  const inFlight      = useRef(new Set());

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current =
        new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  const stopCurrent = useCallback(() => {
    if (sourceRef.current) {
      naturalEndRef.current = false;
      try { sourceRef.current.stop(); } catch (_) {}
      sourceRef.current = null;
    }
  }, []);

  /**
   * Merge component-level defaults with a preload entry's per-entry overrides.
   * Accepts a plain string or a { text, ...overrides } object.
   */
  const resolveParams = useCallback((entry) => {
    const defaults = { languageCode, voiceName, modelName, pitch, speakingRate, prompt };
    if (typeof entry === "string") return { ...defaults, text: entry };
    const { text: t, ...overrides } = entry;
    return { ...defaults, ...overrides, text: t };
  }, [languageCode, voiceName, modelName, pitch, speakingRate, prompt]);

  // ── Core fetch + decode ───────────────────────────────────────────────────

  const fetchAndDecode = useCallback(async (params) => {
    const res = await fetch(speechUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(params),
    });
    if (!res.ok) throw new Error((await res.text()) || res.statusText);
    return getAudioCtx().decodeAudioData(await res.arrayBuffer());
  }, [speechUrl, getAudioCtx]);

  // ── Play an AudioBuffer ───────────────────────────────────────────────────

  const playBuffer = useCallback(async (buffer) => {
    stopCurrent();
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") await ctx.resume();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    sourceRef.current = source;

    naturalEndRef.current = true;
    source.onended = () => {
      sourceRef.current = null;
      if (naturalEndRef.current) onEnd?.();
    };

    source.start(0);
    onStart?.();
  }, [stopCurrent, getAudioCtx, onStart, onEnd]);

  // ── Reactive mode ─────────────────────────────────────────────────────────

  const synthesize = useCallback(async (inputText) => {
    stopCurrent();
    try {
      const buffer = await fetchAndDecode(
        resolveParams(inputText)
      );
      onLoaded?.();
      await playBuffer(buffer);
    } catch (err) {
      onError?.(err);
    }
  }, [fetchAndDecode, resolveParams, playBuffer, stopCurrent, onLoaded, onError]);

  useEffect(() => {
    if (!text?.trim()) { stopCurrent(); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => synthesize(text), 800);
    return () => clearTimeout(debounceRef.current);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Preload mode ──────────────────────────────────────────────────────────

  // Clear cache when component-level defaults change so stale buffers
  // (that were encoded with old params) aren't replayed.
  useEffect(() => {
    preloadCache.current.clear();
    inFlight.current.clear();
  }, [languageCode, voiceName, modelName, pitch, speakingRate]);

  useEffect(() => {
    if (!preloadTexts?.length) return;

    let cancelled = false;
    let loaded = 0;
    const total = preloadTexts.length;

    preloadTexts.forEach(async (entry, i) => {
      if (preloadCache.current.has(i) || inFlight.current.has(i)) return;
      inFlight.current.add(i);
      try {
        const buffer = await fetchAndDecode(resolveParams(entry));
        if (cancelled) return;
        preloadCache.current.set(i, buffer);
        loaded++;
        onPreloadProgress?.(loaded, total);
        if (loaded === total) onAllLoaded?.();
      } catch (err) {
        if (!cancelled) onError?.(err);
      } finally {
        inFlight.current.delete(i);
      }
    });

    return () => { cancelled = true; };
  }, [preloadTexts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Imperative API ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!playSpeechRef) return;

    playSpeechRef.current = {
      /**
       * play(index)
       * Plays the preloaded buffer at `index`, respecting that entry's
       * per-entry param overrides. Falls back to an on-demand fetch if
       * not yet cached.
       */
      play: async (index) => {
        try {
          let buffer = preloadCache.current.get(index);
          if (!buffer) {
            const entry = preloadTexts?.[index];
            if (!entry) throw new Error(`No text at index ${index}`);
            buffer = await fetchAndDecode(resolveParams(entry));
            preloadCache.current.set(index, buffer);
          }
          await playBuffer(buffer);
        } catch (err) {
          onError?.(err);
        }
      },

      /** stop() — stops any currently playing audio */
      stop: stopCurrent,

      /** isReady(index) — true if the buffer is cached and ready to play */
      isReady: (index) => preloadCache.current.has(index),

      /** readyCount() — number of fully loaded buffers */
      readyCount: () => preloadCache.current.size,
    };
  }); // runs every render so callbacks stay fresh

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopCurrent();
      audioCtxRef.current?.close();
    };
  }, [stopCurrent]);

  return null;
}