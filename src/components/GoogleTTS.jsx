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
    apiKey,
    text,
    prompt,
    languageCode = "en-US",
    voiceName = "en-US-Neural2-F",
    modelName = "en-US-Neural2-F",
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
                `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${apiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }
            );

            const data = await res.json();
            if (!res.ok) throw new Error(data.error?.message || res.statusText);
            if (!data.audioContent) throw new Error("No audioContent in response");

            // Decode base64 PCM → ArrayBuffer
            const binary = atob(data.audioContent);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = audioCtxRef.current;
            if (ctx.state === "suspended") await ctx.resume();

            const buffer = await ctx.decodeAudioData(bytes.buffer);

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