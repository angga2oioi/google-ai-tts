# google-ai-tts

A headless React component for Google Cloud Text-to-Speech. Drop it anywhere in your tree — it renders nothing, handles everything.

## Features

- 🔇 **Headless** — zero UI, pure audio behaviour
- ⚡ **Debounced** — avoids redundant API calls while text is still changing
- 🔄 **Auto-cancels** — stops previous audio before starting new synthesis
- 🎛️ **Fully controllable** — pitch, speed, voice, language, style prompt
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
        apiKey={process.env.REACT_APP_GOOGLE_TTS_KEY}
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
| `apiKey` | `string` | **required** | Google Cloud API key |
| `text` | `string` | **required** | Text to synthesize. A new value triggers synthesis. |
| `prompt` | `string` | — | Optional style prompt passed as `input.prompt` (v1beta1 only) |
| `languageCode` | `string` | `"en-US"` | BCP-47 language tag, e.g. `"id-ID"`, `"ja-JP"` |
| `voiceName` | `string` | `"en-US-Neural2-F"` | Voice name from the [voice list](https://cloud.google.com/text-to-speech/docs/voices) |
| `modelName` | `string` | `"en-US-Neural2-F"` | TTS model name |
| `pitch` | `number` | `0` | Pitch adjustment from `-20` to `20` |
| `speakingRate` | `number` | `1.0` | Speaking rate from `0.25` to `4.0` |
| `onStart` | `() => void` | — | Called when audio begins playing |
| `onEnd` | `() => void` | — | Called when audio finishes naturally (not on manual stop) |
| `onError` | `(err: Error) => void` | — | Called if the API request or audio decoding fails |

## Examples

### Different language and voice

```jsx
<GoogleTTS
  apiKey={apiKey}
  text="Halo, apa kabar?"
  languageCode="id-ID"
  voiceName="id-ID-Neural2-A"
/>
```

### Adjusted rate and pitch

```jsx
<GoogleTTS
  apiKey={apiKey}
  text={narration}
  speakingRate={1.25}
  pitch={-4}
/>
```

### With a style prompt (v1beta1)

```jsx
<GoogleTTS
  apiKey={apiKey}
  text="Welcome aboard."
  prompt="Speak in a calm, professional tone."
  voiceName="en-US-Neural2-D"
/>
```

### Wiring to a loading indicator

```jsx
const [status, setStatus] = React.useState('idle') // 'idle' | 'loading' | 'playing' | 'error'

<GoogleTTS
  apiKey={apiKey}
  text={text}
  onStart={() => setStatus('playing')}
  onEnd={() => setStatus('idle')}
  onError={() => setStatus('error')}
/>
```

## Behaviour Notes

**Debouncing** — synthesis fires 800 ms after `text` stops changing. This prevents rapid API calls when `text` is bound to a live input or streaming source.

**Auto-cancel** — if `text` changes while audio is playing, the current audio stops immediately and new synthesis begins after the debounce delay.

**Natural end detection** — `onEnd` only fires when audio completes on its own. It does not fire when synthesis is interrupted by a new `text` value or component unmount.

**AudioContext lifecycle** — a single `AudioContext` is created on first synthesis and reused for the lifetime of the component. It is closed when the component unmounts.

## Security

⚠️ **Never expose your API key in client-side code in production.** Instead, proxy requests through your own backend:

1. Create a server route (e.g. `POST /api/tts`) that forwards requests to Google and returns the audio.
2. Fork the component and replace the `fetch` call to point at your proxy.
3. Apply authentication and rate limiting on your server.

## API Reference

This component uses the [Google Cloud Text-to-Speech v1beta1 REST API](https://cloud.google.com/text-to-speech/docs/reference/rest/v1beta1/text/synthesize). Audio is returned as `LINEAR16`-encoded base64 and decoded via the Web Audio API.

## Browser Support

Requires [`AudioContext`](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext) support. All modern browsers are supported. Safari requires a user gesture before audio can play (standard Web Audio restriction).

## License

MIT