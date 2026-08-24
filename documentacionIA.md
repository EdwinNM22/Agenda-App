# Documentación: integración de voz con GPT Realtime

Esta nota describe cómo se añadió la conversación por voz al dashboard de Agenda: qué se eligió, por qué, y qué archivos tocaron.

## Objetivo

Que un usuario autenticado pueda hablar con el modelo desde el dashboard (hablar / colgar), elegir voz, y que la **API key de OpenAI nunca llegue al navegador**.

## Decisión de arquitectura

OpenAI Realtime admite dos formas de conectar el navegador:

1. **Token efímero**: el backend pide una clave corta a OpenAI y el navegador habla **directo** con `api.openai.com`.
2. **Interfaz unificada (la que usamos)**: el navegador envía su oferta WebRTC (SDP) a **nuestro backend**. El backend, con la API key, llama a OpenAI y devuelve la respuesta SDP.

Se eligió la opción 2 porque:

- `OPENAI_API_KEY` solo vive en `backend/.env`.
- El frontend sigue usando el mismo proxy de Vite (`/api` → Fastify).
- La sesión exige JWT, igual que el resto de rutas protegidas.

El audio en sí no pasa por Fastify: una vez negociado el SDP, el micrófono y la voz del modelo van por **WebRTC** entre el navegador y OpenAI.

```
Navegador                     Fastify                      OpenAI
   |                             |                             |
   |  getUserMedia (mic)         |                             |
   |  RTCPeerConnection + SDP     |                             |
   |-- POST /api/realtime/session ->                             |
   |  { sdp, voice } + JWT       |                             |
   |                             |-- POST /v1/realtime/calls -->
   |                             |   Bearer OPENAI_API_KEY     |
   |                             |   FormData: sdp + session   |
   |                             |<-- SDP answer ----------------|
   |<-- { sdp } -----------------|                             |
   |  setRemoteDescription        |                             |
   |  <======== audio WebRTC ================================> |
```

## Pasos que se siguieron

### 1. Configuración, sin romper el arranque

Se añadieron variables en `backend/.env` y `backend/.env.example`:

```env
OPENAI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini
```

En `backend/src/config.ts` se leen, pero **no son obligatorias al arrancar**. Si falta la key, el resto de la app funciona; al pulsar “Hablar” el backend responde 503 (`Falta OPENAI_API_KEY en backend/.env`).

El modelo por defecto es `gpt-realtime-2.1-mini` (API general). Se puede cambiar con `OPENAI_REALTIME_MODEL`.

El asistente siempre responde en **español**, aunque el usuario hable en inglés. Eso va en las instrucciones de `backend/src/routes/realtime.ts`.

### 2. Endpoint protegido de sesión

Archivo: `backend/src/routes/realtime.ts`, registrado en `backend/src/app.ts` bajo el prefijo `/api`.

- Ruta: `POST /api/realtime/session`
- Auth: `onRequest: [app.authenticate]` (mismo JWT del login)
- Body: `{ sdp: string, voice?: string }`
- Si no hay API key → 503
- Si OpenAI rechaza → 502 con el mensaje de error (sin loguear secretos)

El backend arma un `FormData` (como pide la guía actual de WebRTC unificado):

- `sdp`: oferta del navegador
- `session`: JSON con tipo `realtime`, modelo y voz:

```json
{
  "type": "realtime",
  "model": "gpt-realtime-2.1-mini",
  "audio": {
    "input": {
      "noise_reduction": { "type": "far_field" },
      "turn_detection": {
        "type": "server_vad",
        "threshold": 0.5,
        "silence_duration_ms": 500,
        "prefix_padding_ms": 300,
        "interrupt_response": true,
        "create_response": true
      }
    },
    "output": {
      "voice": "marin"
    }
  }
}
```

Luego hace:

`POST https://api.openai.com/v1/realtime/calls`

Cabeceras:

- `Authorization: Bearer <OPENAI_API_KEY>`
- `OpenAI-Safety-Identifier`: SHA-256 de `agenda:<userId>` (identificador estable y sin PII; OpenAI lo pide en este flujo)

La respuesta de OpenAI es el SDP de respuesta; se reenvía al cliente como `{ sdp }`.

No se usa el endpoint antiguo `/v1/realtime/sessions` (beta). El flujo actual es `client_secrets` o, en nuestro caso, `/v1/realtime/calls`.

### 3. WebRTC en el frontend

Archivo: `frontend/src/hooks/useRealtimeVoice.ts`.

Al pulsar **Hablar**:

1. Pide el micrófono (`getUserMedia` con `echoCancellation: true`; `autoGainControl` apagado para no amplificar el eco del altavoz).
2. Pasa el mic por el pipeline de voz (AEC + RNNoise/Speex). Ver sección de eco.
3. Crea un `RTCPeerConnection` y añade el **track ya limpio**, no el mic crudo.
4. Reproduce el audio remoto en un `<audio autoPlay playsInline>` (`peer.ontrack`).
5. Ese mismo audio remoto se clona y se usa como referencia del AEC (`setEchoReference`).
6. Crea el data channel `oai-events` (eventos de Realtime: tools, `response.created` / `response.done`).
7. `createOffer` → `setLocalDescription`.
8. Espera a que ICE termine (máximo 2 s) para mandar candidatos más completos, útil en red local / móvil.
9. `POST /api/realtime/session` con el SDP y la voz elegida.
10. `setRemoteDescription` con la respuesta.
11. Estado `live`.

**No se mutea el micrófono** mientras Isi habla. El usuario puede interrumpirla. `interrupt_response` está en `true`.

**Colgar** cierra el peer, para los tracks del micrófono y limpia el `<audio>`. Si el usuario cuelga a mitad de la conexión, un contador `generation` evita aplicar una respuesta vieja.

### 4. Dashboard

Archivo: `frontend/src/pages/Dashboard.tsx`.

- Botón **Hablar** / **Colgar**
- Estados: idle, connecting, live, error
- Selector de voz (shadcn `Select`)
- La voz se guarda en `localStorage` (`agenda.realtimeVoice`)
- Durante connecting/live el selector se bloquea: OpenAI **no deja cambiar la voz** después de que el modelo ya emitió audio en esa sesión. Hay que colgar y volver a hablar.

### 5. Voces

Listas paralelas (no hay paquete compartido en el monorepo):

- `frontend/src/lib/voices.ts` — opciones y etiquetas de UI
- `backend/src/voices.ts` — allowlist; si llega una voz inválida, se usa `marin`

Voces de Realtime: `marin`, `cedar`, `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`.  
OpenAI recomienda **marin** y **cedar**. El default de la app es `marin`.

Al inicio no se enviaba voz: OpenAI aplicaba la suya. Ahora va en `session.audio.output.voice` al crear la llamada.

### 6. HTTPS y acceso desde otro dispositivo

El micrófono en el navegador exige **contexto seguro**:

- En `http://localhost` suele funcionar.
- En `http://192.168.x.x` (otro dispositivo) **no**.

Por eso ya existía `npm run dev:https` (certificado local con `@vitejs/plugin-basic-ssl`, Vite en `host: true`). Desde el móvil hay que abrir `https://IP_DE_LA_PC:5173` y aceptar el aviso del certificado.

El backend sigue en HTTP; Vite proxya `/api`. El audio WebRTC va directo a OpenAI.

### 7. Eco del altavoz y ruido de fondo

Con auriculares no hay problema: el mic no oye a Isi. Con altavoz el mic recoge su propia voz, el VAD cree que habla el usuario y ella se corta o se “autocorrige”.

**Qué no se usa:** apagar el mic mientras ella habla. Eso obliga a esperar y no deja responder rápido.

**Qué se usa:**

1. **AEC del navegador** — `echoCancellation: true` en `getUserMedia`.
2. **AEC propio (AudioWorklet)** — `frontend/src/audio/aec-processor.js`. Resta la voz de Isi (referencia = stream remoto) del micrófono con un filtro adaptativo en frecuencia (FDAF + Wiener). Si el usuario habla encima (double-talk), no se come su voz.
3. **Librería `@sapphi-red/web-noise-suppressor` (^0.4.0)** — npm, MIT. Nodos Web Audio para suprimir ruido:
   - Primero **RNNoise** (`RnnoiseWorkletNode` + WASM de [xiph/rnnoise](https://github.com/xiph/rnnoise) vía [@shiguredo/rnnoise-wasm](https://github.com/shiguredo/rnnoise-wasm)). Exige sample rate 48 kHz.
   - Si RNNoise no carga, **Speex** (`SpeexWorkletNode`, preprocess de SpeexDSP).
   - Si ambos fallan, el audio sigue (AEC + AEC del browser).
4. **OpenAI `audio.input.noise_reduction: far_field`** — pensado para mic de portátil / sala, no de auricular pegado a la boca.

El pipeline se arma en `frontend/src/audio/voicePipeline.ts` y se engancha desde `useRealtimeVoice`. El mic **nunca se apaga**.

`@sapphi-red/web-noise-suppressor` hace `class … extends AudioWorkletNode` **al importarse**. Eso tumba la página si el navegador no tiene Worklets (HTTP sin HTTPS, WebView, etc.). Por eso el paquete se carga con `import()` **solo al pulsar Hablar**, no al abrir la app. Si no hay `AudioWorkletNode`, se usa el micrófono sin RNNoise.

```
mic (getUserMedia, echoCancellation)
        │
        ▼
  AEC worklet  ←── clon del audio remoto (voz de Isi)
        │
        ▼
  RNNoise (o Speex)
        │
        ▼
  MediaStreamDestination → track WebRTC hacia OpenAI
```

Dependencia en `frontend/package.json`:

```json
"@sapphi-red/web-noise-suppressor": "^0.4.0"
```

Imports del paquete: `loadRnnoise`, `loadSpeex`, `RnnoiseWorkletNode`, `SpeexWorkletNode`, más los assets `rnnoiseWorklet.js`, `rnnoise.wasm`, `rnnoise_simd.wasm`, `speexWorklet.js`, `speex.wasm`.

## Archivos involucrados

| Archivo | Rol |
| --- | --- |
| `backend/.env` / `.env.example` | `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL` |
| `backend/src/config.ts` | Lee esas variables |
| `backend/src/voices.ts` | Voces permitidas |
| `backend/src/routes/realtime.ts` | Crea la llamada, instrucciones (español), tools, VAD, `far_field` |
| `backend/src/app.ts` | Registra la ruta |
| `frontend/src/hooks/useRealtimeVoice.ts` | WebRTC + pipeline de voz + llamada al API |
| `frontend/src/audio/voicePipeline.ts` | AEC + RNNoise/Speex |
| `frontend/src/audio/aec-processor.js` | AudioWorklet de cancelación de eco |
| `frontend/src/lib/voices.ts` | Catálogo de voces en UI |
| `frontend/src/lib/voice-assistant.tsx` | Contexto global de la llamada |
| `frontend/src/pages/Dashboard.tsx` | Controles Hablar / voz / colgar |
| `frontend/package.json` | `@sapphi-red/web-noise-suppressor` |

## Cómo probarlo

1. Pegar la key en `backend/.env` (`OPENAI_API_KEY=sk-...`).
2. `npm run dev` (o `npm run dev:https` si pruebas desde el teléfono).
3. Iniciar sesión, elegir voz, pulsar **Hablar**, aceptar el micrófono.
4. Hablar con naturalidad; **Colgar** corta la sesión.

## Qué no se hizo (a propósito)

- La API key no se expone al cliente ni se usa WebSocket con la key en el browser.
- No se mutea el mic para el eco del altavoz: se cancela en audio.
- No se usa Krisp ni servicios de denoise de pago.

## Referencias

- [Realtime API with WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc) — flujo unificado `/v1/realtime/calls`
- [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations) — voces y `session.audio.output.voice`
- [@sapphi-red/web-noise-suppressor](https://github.com/sapphi-red/web-noise-suppressor) — RNNoise y Speex en AudioWorklet
- [xiph/rnnoise](https://github.com/xiph/rnnoise) — modelo de supresión de ruido
- [OpenAI Realtime models](https://developers.openai.com/api/docs/models/gpt-realtime-2.1) — `gpt-realtime-2.1` / `gpt-realtime-2.1-mini`
