import { useEffect, useRef, useCallback, useState } from "react";

/**
 * GoogleTTS
 *
 * Props:
 *   apiKey        {string}  - Google Cloud API key
 *   text          {string}  - Text to synthesize — triggers on change
 *   prompt        {string}  - Optional style prompt (v1beta1 input.prompt)
 *   languageCode  {string}  - e.g. "en-US"          default: "en-US"
 *   voiceName     {string}  - e.g. "en-US-Neural2-F" default: "en-US-Neural2-F"
 *   modelName     {string}  - e.g. "en-US-Neural2-F" default: "en-US-Neural2-F"
 *   pitch         {number}  - -20 to 20              default: 0
 *   speakingRate  {number}  - 0.25 to 4.0            default: 1.0
 *   onStart       {func}    - called when audio starts playing
 *   onEnd         {func}    - called when audio finishes naturally
 *   onError       {func}    - called with Error on failure
 *
 * Renders nothing. Pure behaviour component.
 *
 * Usage:
 *   <GoogleTTS
 *     apiKey="YOUR_KEY"
 *     text={transcript}
 *     languageCode="en-US"
 *     voiceName="en-US-Neural2-F"
 *     pitch={0}
 *     speakingRate={1.0}
 *     onStart={() => setPlaying(true)}
 *     onEnd={() => setPlaying(false)}
 *     onError={err => console.error(err)}
 *   />
 */
export default function GoogleTTS({
    speechUrl,
    apiKey,
    text,
    prompt,
    languageCode = "en-US",
    voiceName = "Achernar",
    modelName = "gemini-3.1-flash-tts-preview",
    pitch = 0,
    speakingRate = 1.0,
    onStart,
    onEnd,
    onError,
}) {
    const audioCtxRef = useRef(null);
    const sourceRef = useRef(null);
    const debounceRef = useRef(null);
    const naturalEndRef = useRef(false);

    const stopCurrent = useCallback(() => {
        if (sourceRef.current) {
            naturalEndRef.current = false;
            try { sourceRef.current.stop(); } catch (_) { }
            sourceRef.current = null;
        }
    }, []);

    const synthesize = useCallback(async (inputText) => {
        stopCurrent();

        const payload = {
            audioConfig: {
                audioEncoding: "LINEAR16",
                pitch,
                speakingRate,
            },
            input: {
                ...(prompt ? { prompt } : {}),
                text: inputText,
            },
            voice: {
                languageCode,
                name: voiceName,
                modelName,
            },
        };

        try {
            const res = await fetch(
                speechUrl,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }
            );

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || res.statusText);
            }

            // 1. Get the response as an ArrayBuffer directly
            const arrayBuffer = await res.arrayBuffer();

            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = audioCtxRef.current;
            if (ctx.state === "suspended") await ctx.resume();

            // 2. Decode the binary directly (no more atob or base64 loops!)
            const buffer = await ctx.decodeAudioData(arrayBuffer);

            const source = ctx.createBufferSource();
            source.buffer = buffer;

            source.connect(ctx.destination);
            sourceRef.current = source;

            // onended fires for both natural end AND manual stop().
            // naturalEndRef distinguishes the two.
            naturalEndRef.current = true;
            source.onended = () => {
                sourceRef.current = null;
                if (naturalEndRef.current) {
                    onEnd?.();
                }
            };

            source.start(0);
            onStart?.();
        } catch (err) {
            onError?.(err);
        }
    }, [apiKey, languageCode, voiceName, modelName, pitch, speakingRate, prompt, stopCurrent, onStart, onEnd, onError]);

    useEffect(() => {
        if (!text?.trim()) {
            stopCurrent();
            return;
        }

        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => synthesize(text), 800);

        return () => clearTimeout(debounceRef.current);
    }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        return () => {
            stopCurrent();
            audioCtxRef.current?.close();
        };
    }, [stopCurrent]);

    return null;
}