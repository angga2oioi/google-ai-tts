# google-ai-tts

A headless React component for Google Cloud Text-to-Speech. Drop it anywhere in your tree — it renders nothing, handles everything.

## Features

- 🔇 **Headless** — zero UI, pure audio behaviour
- ⚡ **Debounced** — avoids redundant API calls while text is still changing
- 🔄 **Auto-cancels** — stops previous audio before starting new synthesis
- 📦 **Preload** — fetch and decode multiple clips upfront, play them instantly on demand
- 🎛️ **Per-clip overrides** — each preloaded entry can use its own voice, language, speed, and more
- 🧹 **Cleans up** — stops audio and closes AudioContext on unmount

## Requirements

- React ≥ 17
- A [Google Cloud Text-to-Speech API key](https://cloud.google.com/text-to-speech/docs/before-you-begin)

## Installation

```bash
npm install github:angga2oioi/google-ai-tts
# or
yarn add github:angga2oioi/google-ai-tts
# or
pnpm add https://github.com/angga2oioi/google-ai-tts
```

## Quick Start

```jsx
import { GoogleTTS } from 'google-ai-tts'

function App() {
  const [text, setText] = React.useState('')
  const [playing, setPlaying] = React.useState(false)

  return (
    <>
      <textarea onChange={e => setText(e.target.value)} />

      <GoogleTTS
        speechUrl={YOUR_SPEECH_URL}
        text={text}
        onStart={() => setPlaying(true)}
        onEnd={() => setPlaying(false)}
        onError={err => console.error(err)}
      />

      {playing && <p>Speaking…</p>}
    </>
  )
}
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `speechUrl` | `string` | **required** | Backend URL |
| `text` | `string` | — | Text to synthesize. A new value triggers synthesis after an 800 ms debounce. Supports inline audio tags e.g. `[whispers]`, `[laughs]`. |
| `prompt` | `string` | — | Natural language style prompt e.g. `"Speak in a calm, professional tone"` |
| `preloadTexts` | `Array<string \| PreloadEntry>` | — | Clips to fetch and decode in the background on mount. Each item is either a plain string (uses component defaults) or a `PreloadEntry` object with per-clip overrides. See [Preload entries](#preload-entries). |
| `playSpeechRef` | `React.MutableRefObject` | — | Attach a ref to receive the imperative playback API. See [Imperative API](#imperative-api). |
| `languageCode` | `string` | `"en-US"` | BCP-47 language tag, e.g. `"id-ID"`, `"ja-JP"` |
| `voiceName` | `string` | `"Charon"` | Speaker ID from the 30 prebuilt voices e.g. `"Puck"`, `"Kore"`, `"Charon"`. Check it [here](https://ai.google.dev/gemini-api/docs/speech-generation#voices) |
| `modelName` | `string` | `"gemini-2.5-flash-tts"` | Gemini TTS model. See [supported models](#supported-models). |
| `pitch` | `number` | `0` | Pitch adjustment from `-20` to `20` |
| `speakingRate` | `number` | `1.0` | Speaking rate from `0.25` to `4.0` |
| `onStart` | `() => void` | — | Called when audio begins playing |
| `onEnd` | `() => void` | — | Called when audio finishes naturally (not on manual stop) |
| `onLoaded` | `() => void` | — | Reactive mode: called when the clip is decoded and ready, just before playback begins |
| `onAllLoaded` | `() => void` | — | Preload mode: called once every entry in `preloadTexts` has been decoded successfully |
| `onError` | `(err: Error) => void` | — | Called if the API request or audio decoding fails |
| `onPreloadProgress` | `(loaded: number, total: number) => void` | — | Called after each `preloadTexts` entry finishes decoding |

### Supported models

| `modelName` | Best for |
|---|---|
| `gemini-3.1-flash-tts-preview` | Latest — 70+ languages, 200+ audio tags |
| `gemini-2.5-pro-tts` | Studio quality |
| `gemini-2.5-flash-tts` | Low latency (default) |
| `gemini-2.5-flash-lite-preview-tts` | Fastest / lowest cost |

### Preload entries

Each item in `preloadTexts` can be a plain string or a `PreloadEntry` object:

```ts
type PreloadEntry = {
  text: string          // required
  languageCode?: string
  voiceName?: string
  modelName?: string
  pitch?: number
  speakingRate?: number
  prompt?: string
}
```

Plain strings use the component-level defaults. Object entries are merged on top of the defaults, so you only need to specify what differs:

```jsx
preloadTexts={[
  "Hello!",                                           // uses component defaults
  { text: "Halo!", languageCode: "id-ID", voiceName: "id-ID-Neural2-A" },
  { text: "Welcome.", speakingRate: 0.9, pitch: -2 },
]}
```

## Imperative API

When you pass a `playSpeechRef`, the component populates it with a control object after mount:

| Method | Signature | Description |
|---|---|---|
| `play` | `(index: number) => Promise<void>` | Plays the preloaded buffer at `index`, using that entry's resolved params. Falls back to an on-demand fetch if not yet cached. |
| `stop` | `() => void` | Stops any currently playing audio immediately. |
| `isReady` | `(index: number) => boolean` | Returns `true` if the buffer at `index` is decoded and ready to play. |
| `readyCount` | `() => number` | Returns the total number of fully loaded buffers. |

## Examples

### Preload clips with mixed languages and voices

```jsx
const ttsRef = React.useRef()

<GoogleTTS
  speechUrl={YOUR_SPEECH_URL}
  voiceName="Puck"
  preloadTexts={[
    "Welcome to the tour.",
    { text: "Selamat datang.", languageCode: "id-ID", voiceName: "id-ID-Neural2-A" },
    { text: "Thank you!", speakingRate: 1.2 },
  ]}
  playSpeechRef={ttsRef}
  onAllLoaded={() => setButtonsEnabled(true)}
  onPreloadProgress={(loaded, total) =>
    console.log(`${loaded} / ${total} clips ready`)
  }
  onStart={() => setPlaying(true)}
  onEnd={() => setPlaying(false)}
  onError={console.error}
/>

// Play instantly from cache:
<button onClick={() => ttsRef.current.play(0)}>English</button>
<button onClick={() => ttsRef.current.play(1)}>Indonesian</button>
```

### Reactive mode (text changes drive synthesis)

```jsx
<GoogleTTS
  speechUrl={YOUR_SPEECH_URL}
  text={transcript}
  onLoaded={() => setStatus('ready')}
  onStart={() => setPlaying(true)}
  onEnd={() => setPlaying(false)}
/>
```

### Both modes together

The two modes are independent and can run simultaneously — `text` drives reactive synthesis while `preloadTexts` + `playSpeechRef` handle on-demand playback.

```jsx
<GoogleTTS
  speechUrl={YOUR_SPEECH_URL}
  text={liveCaption}
  preloadTexts={uiSoundLines}
  playSpeechRef={ttsRef}
/>
```

### Adjusted rate and pitch

```jsx
<GoogleTTS
  speechUrl={YOUR_SPEECH_URL}
  text={narration}
  speakingRate={1.25}
  pitch={-4}
/>
```

### With a style prompt

```jsx
<GoogleTTS
  speechUrl={YOUR_SPEECH_URL}
  text="Welcome aboard."
  prompt="Speak in a calm, professional tone."
  voiceName="en-US-Neural2-D"
/>
```

### Wiring to a loading indicator

```jsx
const [status, setStatus] = React.useState('idle') // 'idle' | 'loading' | 'playing' | 'error'

<GoogleTTS
  speechUrl={YOUR_SPEECH_URL}
  text={text}
  onStart={() => setStatus('playing')}
  onEnd={() => setStatus('idle')}
  onError={() => setStatus('error')}
/>
```

## Behaviour Notes

**Debouncing** — reactive synthesis fires 800 ms after `text` stops changing. This prevents rapid API calls when `text` is bound to a live input or streaming source.

**Auto-cancel** — if `text` changes while audio is playing, the current audio stops immediately and new synthesis begins after the debounce delay.

**Per-entry overrides** — each `preloadTexts` entry is merged with the component-level defaults at fetch time. Only the fields you specify are overridden; everything else inherits from the component props.

**Cache invalidation** — if any component-level default prop changes (`languageCode`, `voiceName`, `modelName`, `pitch`, `speakingRate`), the entire preload cache is cleared and entries are re-fetched on next use. Per-entry overrides are always respected regardless of this.

**Parallel preloading** — all entries in `preloadTexts` are fetched and decoded concurrently via `Promise.all`. A slow or failed entry does not block the others.

**Preload deduplication** — each index is fetched at most once per cache lifetime. If `preloadTexts` changes reference but an entry is already cached or in-flight, it is skipped.

**On-demand fallback** — calling `play(index)` before that entry has finished preloading triggers an immediate on-demand fetch for that index only; the result is cached for future calls.

**Natural end detection** — `onEnd` only fires when audio completes on its own. It does not fire when synthesis is interrupted by a new `text` value, a `stop()` call, or component unmount.

**`onLoaded` vs `onStart`** — in reactive mode, `onLoaded` fires the moment a clip is decoded and queued, while `onStart` fires when the first audio sample is sent to the speakers. In practice these are milliseconds apart, but `onLoaded` is useful for updating UI state (e.g. hiding a spinner) before the audible playback begins.

**`onAllLoaded`** — fires exactly once per `preloadTexts` array, after the last entry decodes successfully. It does not fire again if the array reference changes and some entries were already cached (use `onPreloadProgress` to track incremental progress instead).

**AudioContext lifecycle** — a single `AudioContext` is created on first synthesis and reused for the lifetime of the component. It is closed when the component unmounts.

## Browser Support

Requires [`AudioContext`](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext) support. All modern browsers are supported. Safari requires a user gesture before audio can play (standard Web Audio restriction).

## License

MIT