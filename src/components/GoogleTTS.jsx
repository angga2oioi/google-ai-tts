import { useEffect, useRef, useCallback, useState } from "react";

/**
 * GoogleTTS
 *
 * Two modes that can be used together:
 *
 * ── Reactive mode (original) ──────────────────────────────────────────────
 *   text          {string}   Text to synthesize on change (debounced 800ms)
 *   prompt        {string}   Optional style prompt
 *
 * ── Preload mode (new) ────────────────────────────────────────────────────
 *   preloadTexts  {string[]} Array of strings to fetch & decode on mount
 *                            (or whenever the array reference changes)
 *
 * ── Imperative playback (new) ─────────────────────────────────────────────
 *   playSpeechRef {React.MutableRefObject}
 *                            Attach a ref here; after mount it will hold:
 *                            { play(index), stop(), isReady(index) }
 *
 * All other props (speechUrl, languageCode, voiceName, …) are shared.
 *
 * Usage:
 *   const ttsRef = useRef();
 *
 *   <GoogleTTS
 *     speechUrl="/api/tts"
 *     preloadTexts={["Hello!", "How are you?", "Goodbye!"]}
 *     playSpeechRef={ttsRef}
 *     onStart={() => setPlaying(true)}
 *     onEnd={()   => setPlaying(false)}
 *     onError={console.error}
 *   />
 *
 *   // later:
 *   ttsRef.current.play(1);   // plays "How are you?"
 *   ttsRef.current.stop();
 *   ttsRef.current.isReady(0); // true once decoded
 */
export default function GoogleTTS({
  speechUrl,
  apiKey,
  // reactive mode
  text,
  prompt,
  // preload mode
  preloadTexts,
  playSpeechRef,
  // voice config
  languageCode  = "en-US",
  voiceName     = "Achernar",
  modelName     = "gemini-3.1-flash-tts-preview",
  pitch         = 0,
  speakingRate  = 1.0,
  // callbacks
  onStart,
  onEnd,
  onError,
  onPreloadProgress, // (loadedCount, totalCount) => void
}) {
  const audioCtxRef    = useRef(null);
  const sourceRef      = useRef(null);
  const debounceRef    = useRef(null);
  const naturalEndRef  = useRef(false);
  // Map<index, AudioBuffer>
  const preloadCache   = useRef(new Map());
  // Track in-flight fetches so we don't double-fetch
  const inFlight       = useRef(new Set());

  // ── Shared helpers ────────────────────────────────────────────────────────

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

  // ── Core fetch + decode ───────────────────────────────────────────────────

  const fetchAndDecode = useCallback(async (inputText) => {
    const payload = {
      ...(prompt ? { prompt } : {}),
      text: inputText,
      languageCode,
      modelName,
      voiceName,
      pitch,
      speakingRate,
    };

    const res = await fetch(speechUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || res.statusText);
    }

    const arrayBuffer = await res.arrayBuffer();
    const ctx = getAudioCtx();
    return ctx.decodeAudioData(arrayBuffer);
  }, [speechUrl, prompt, languageCode, modelName, voiceName, pitch, speakingRate, getAudioCtx]);

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

  // ── Reactive mode (original behaviour) ───────────────────────────────────

  const synthesize = useCallback(async (inputText) => {
    stopCurrent();
    try {
      const buffer = await fetchAndDecode(inputText);
      await playBuffer(buffer);
    } catch (err) {
      onError?.(err);
    }
  }, [fetchAndDecode, playBuffer, stopCurrent, onError]);

  useEffect(() => {
    if (!text?.trim()) { stopCurrent(); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => synthesize(text), 800);
    return () => clearTimeout(debounceRef.current);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Preload mode ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!preloadTexts?.length) return;

    let cancelled = false;
    let loaded = 0;
    const total = preloadTexts.length;

    preloadTexts.forEach(async (t, i) => {
      // Skip if already cached or in-flight
      if (preloadCache.current.has(i) || inFlight.current.has(i)) return;

      inFlight.current.add(i);
      try {
        const buffer = await fetchAndDecode(t);
        if (cancelled) return;
        preloadCache.current.set(i, buffer);
        loaded++;
        onPreloadProgress?.(loaded, total);
      } catch (err) {
        if (!cancelled) onError?.(err);
      } finally {
        inFlight.current.delete(i);
      }
    });

    return () => { cancelled = true; };
  }, [preloadTexts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Imperative API via ref ────────────────────────────────────────────────

  useEffect(() => {
    if (!playSpeechRef) return;

    playSpeechRef.current = {
      /**
       * play(index)
       * Plays the preloaded buffer at `index`.
       * Falls back to fetching on-demand if not yet cached.
       */
      play: async (index) => {
        try {
          let buffer = preloadCache.current.get(index);

          if (!buffer) {
            const t = preloadTexts?.[index];
            if (!t) throw new Error(`No text at index ${index}`);
            buffer = await fetchAndDecode(t);
            preloadCache.current.set(index, buffer);
          }

          await playBuffer(buffer);
        } catch (err) {
          onError?.(err);
        }
      },

      /** stop() — stops any currently playing audio */
      stop: stopCurrent,

      /** isReady(index) — true if the buffer is cached and ready */
      isReady: (index) => preloadCache.current.has(index),

      /** readyCount() — number of buffers fully loaded */
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