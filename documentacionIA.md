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
- El frontend sigue usando el mismo proxy de Vite (`/health`, `/auth`, `/realtime` → Fastify).
- La sesión exige JWT, igual que el resto de rutas protegidas.

El audio en sí no pasa por Fastify: una vez negociado el SDP, el micrófono y la voz del modelo van por **WebRTC** entre el navegador y OpenAI.

```
Navegador                     Fastify                      OpenAI
   |                             |                             |
   |  getUserMedia (mic)         |                             |
   |  RTCPeerConnection + SDP     |                             |
   |-- POST /realtime/session ->                                 |
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

El asistente responde en el **idioma en que le hablen** (español, inglés u otro). Las instrucciones viven en `backend/src/assistant/` (ensambladas por `buildSession.ts` y usadas desde `backend/src/routes/realtime.ts`). La transcripción no fija idioma, para que Whisper detecte el del usuario.

### 2. Endpoint protegido de sesión

Archivo: `backend/src/routes/realtime.ts`, registrado en `backend/src/app.ts`.

- Ruta: `POST /realtime/session`
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

1. Pide el micrófono (`captureMicrophone` en `audioSession.ts`): `getUserMedia` con `echoCancellation`, `noiseSuppression` (y `voiceIsolation` si existe) y `autoGainControl` apagado. Se verifica con `track.getSettings()` qué se aplicó de verdad. Ver sección de eco.
2. Crea un `RTCPeerConnection` y añade el track del micrófono (el procesado lo hace el navegador; no hay pipeline propio en el camino del audio).
3. Reproduce el audio remoto en un `<audio autoPlay playsInline>` (`peer.ontrack`).
4. Con el stream remoto y el mic se crea el `echoMonitor` (solo análisis, no toca el audio) y el `voiceGuard` (ver sección de eco).
5. `watchMicrophone` vigila el track (`ended`, `mute`/`unmute`, `devicechange`, permisos, `visibilitychange`) y recupera el mic con `replaceTrack` sin renegociar.
6. Crea el data channel `oai-events` (eventos de Realtime: tools, `response.created` / `response.done`).
7. `createOffer` → `setLocalDescription`.
8. Espera a que ICE termine (máximo 2 s) para mandar candidatos más completos, útil en red local / móvil.
9. `POST /realtime/session` con el SDP y la voz elegida.
10. `setRemoteDescription` con la respuesta.
11. Estado `live`.

**No se mutea el micrófono** mientras Isi habla. El usuario puede interrumpirla: la interrupción la decide `voiceGuard` (ver sección de eco), no el VAD del servidor a ciegas.

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

El backend sigue en HTTP; Vite proxya las rutas de la API. El audio WebRTC va directo a OpenAI.

### 7. Eco del altavoz y ruido de fondo

Con auriculares no hay problema: el mic no oye a Isi. Con altavoz el mic recoge su propia voz, el VAD cree que habla el usuario y ella se corta o se “autocorrige”.

**Qué no se usa:** apagar el mic mientras ella habla (no se podría interrumpir) ni temporizadores de silencio arbitrarios.

**Causa raíz.** El VAD del servidor solo ve el audio que llega por WebRTC. Si el eco llega a ese audio, lo interpreta como un turno nuevo, cancela la respuesta y la conversación entra en bucle. Ningún filtro del lado del servidor puede distinguir eco de voz, así que la decisión se toma en el cliente, donde sí se conoce lo que suena por el altavoz.

**Capas (de abajo arriba):**

1. **AEC/NS nativo del navegador** (`audioSession.ts`). Constraints explícitas y verificadas con `getSettings()`; se degradan por niveles si el navegador las rechaza. AGC apagado a propósito (amplificaría el residual de eco).
2. **Detector local de voz real** (`echoGate.ts`, puro y testeable). Compara el nivel del mic con el eco esperado: `acoplamiento k × nivel remoto`, aprendido solo en tramos sin voz del usuario. Si el mic supera de forma sostenida lo que el altavoz explica (~200 ms), se confirma voz del usuario. Reglas aprendidas con estimación del ruido de fondo.
3. **Monitor de audio** (`echoMonitor.ts`). Mide nivel de mic y del stream remoto (filtrados a banda de voz) con `AnalyserNode`; solo analiza. Informa si la referencia es fiable (`healthy`).
4. **Orquestador** (`voiceGuard.ts`). Mientras el asistente suena, desactiva `create_response` e `interrupt_response` del servidor (`session.update`) y decide él:
   - voz del usuario confirmada → interrupción voluntaria (`response.cancel` + `output_audio_buffer.clear`);
   - habla sin confirmar (eco o usuario muy bajo) → no corta; su item se borra si es eco, o la petición queda **diferida** y se atiende al terminar el asistente (no se pierde);
   - fuera de reproducción el control vuelve a ser el nativo (`semantic_vad`).
5. **Verificación por contenido** (`echoTranscript.ts`). Una transcripción solapada con la voz del asistente se considera eco si ≥65 % de sus palabras forman tramos de ≥3 palabras seguidas copiados de lo que el asistente dijo. Reutilizar vocabulario suelto («las», «de la tarde») no cuenta, así que una petición nueva no se confunde con eco. Límite conocido: eco con una palabra mal transcrita (cobertura ~0,57) no se detecta por texto; ahí actúan las capas 2-4.
6. **Degradación segura.** Si el monitor no es fiable (sin referencia, iOS con analyser remoto mudo, CPU saturada) o la reproducción no es observable, `voiceGuard` devuelve el control al VAD nativo con `interrupt_response` activo. Así nunca queda un asistente «sordo».
7. **Aprendizaje de falsos positivos.** Si una interrupción resulta ser eco (la transcripción copia al asistente), se sube el umbral del detector.

**Ciclo de vida del micrófono** (`watchMicrophone` + `recoverMicrophone`): si el track termina, se silencia por el sistema (llamada, otra app), se desconecta el dispositivo, se revoca el permiso o la PWA vuelve a primer plano, se intenta recapturar y se sustituye con `RTCRtpSender.replaceTrack`; el estado se informa al usuario con mensajes específicos (`describeMicError`).

**Diferencias por plataforma:**

| Plataforma | Comportamiento |
| --- | --- |
| Chrome/Edge Android y escritorio | AEC nativo fiable; análisis local completo. |
| Safari iOS / PWA instalada | El AEC viene ligado al VPIO del sistema y `applyConstraints` suele ignorarse. El analyser del stream remoto puede estar mudo → se usan los eventos `output_audio_buffer.*` o se degrada al VAD nativo. |
| Firefox | `noiseSuppression`/AEC según versión; el detector se calibra solo con lo que mida. |

**No se activa el AEC propio.** `aec-processor.js` (FDAF de una partición, FFT 1024) solo modela ~5 ms de retardo de eco, insuficiente para altavoz+navegador (decenas/cientos de ms), y tiene un bloqueo de inicialización con `H=0`. Medido en un banco de pruebas: ~2 dB de ERLE. Tampoco se usa `@sapphi-red/web-noise-suppressor`. `voicePipeline.ts`, `aec-processor.js` y esa dependencia son **código sin uso** y pueden eliminarse.

**OpenAI `audio.input.noise_reduction: far_field`** sigue activo en el servidor.

**Pruebas sin dispositivo** (`frontend/scripts/`), desde `frontend/`:

```bash
../node_modules/.bin/esbuild scripts/simulate-echo-gate.ts --bundle --platform=node --format=cjs --outfile=/tmp/g.cjs && node /tmp/g.cjs
../node_modules/.bin/esbuild scripts/simulate-voice-guard.ts --bundle --platform=node --format=cjs --outfile=/tmp/v.cjs && node /tmp/v.cjs
```

La primera simula eco con distintos acoplamientos y voz del usuario por encima; la segunda reproduce los eventos Realtime de 9 escenarios (eco ignorado, interrupción voluntaria con y sin respuesta activa, petición baja diferida, auriculares, peticiones consecutivas, falso positivo, degradación, saludo inicial).

**Limitaciones asumidas:**

- Con AEC pobre, un usuario que habla muy bajo encima del altavoz no podrá interrumpir; su petición se atiende al acabar el asistente.
- Si el residual de eco es muy alto o el volumen se duplica a mitad de respuesta, puede haber un corte falso antes de que el detector se autocorrija.
- `conversation.item.truncate` no está implementado tras una interrupción (el modelo cree que dijo todo).
- AGC apagado: una voz muy baja puede llegar con poco nivel.
- `voiceIsolation` es experimental y solo se pide si el navegador lo expone.

### 8. Respuestas de voz sin relleno (preámbulos)

`gpt-realtime-2.x` genera **preámbulos hablados por defecto** antes de llamar a una tool («déjame revisar…») y el prompt solo los reduce, no los elimina. Medido con `backend/scripts/probe-preamble.ts` (sesión real, entrada por audio sintetizado):

- El `response.create` que el cliente enviaba tras cada tool llevaba `instructions`. En Realtime eso **sustituye** las instrucciones de la sesión en esa respuesta, así que se perdían las reglas de estilo y el modelo rellenaba («si quieres, puedo ayudarte a añadir alguna», «toca relajarse un poco»). Ahora se envía sin `instructions` (`frontend/src/assistant/tools/runtime.ts`).
- Sección `# PREÁMBULOS: DESACTIVADOS` al inicio del prompt de voz y una nota en la descripción de cada tool (`backend/src/assistant/prompts/voice.ts`, `buildSession.ts`).
- `reasoning.effort` configurable con `OPENAI_REALTIME_REASONING_EFFORT` (por defecto `low`). `minimal`/`none` eliminaron los preámbulos pero dejaron sin responder ~30-45 % de los turnos, por eso no se usan.
- Red de seguridad en el cliente (`frontend/src/audio/preambleSuppressor.ts`): si la transcripción de una respuesta delata un preámbulo, silencia el reproductor y vacía el audio pendiente. El silencio es acotado (termina en la siguiente respuesta o 1,5 s tras `response.done`), nunca permanente. Simulación: `frontend/scripts/simulate-preamble-suppressor.ts`.

Límite: las primeras palabras del preámbulo (~1 s) pueden llegar a oírse antes de que la transcripción permita detectarlo.

### 9. Idioma del saludo y de la transcripción

- **Saludo:** el cliente lo envía con `response.create` + `instructions`, que sustituye al prompt de sesión; sin una indicación de idioma salía en inglés 6 de cada 10 veces. Ahora fija «en español» hasta que el usuario hable (`prompts/greeting.ts` y su respaldo en `frontend/src/assistant/runtime/greeting.ts`): 0/16 en inglés (`backend/scripts/probe-greeting.ts`).
- **Transcripción de lo que dice el usuario:** `whisper-1` alucinaba otros idiomas con audio corto o ruidoso (incluso con `language=es`). Ahora usa `gpt-4o-transcribe` con una pista de contexto en el prompt y sin fijar `language` (la app es multilingüe). Configurable con `OPENAI_REALTIME_TRANSCRIPTION_MODEL` (`gpt-4o-mini-transcribe` es la opción más barata). Medido con `backend/scripts/probe-transcription.ts [reps] [duro]`.
- **Orden del chat:** la transcripción es asíncrona y puede llegar después de que el asistente empezó a responder; el mensaje del usuario se inserta antes de esas respuestas usando el instante en que terminó de hablar (`appendUserMessage(text, spokenAt)`).
- **Respuesta duplicada:** el respaldo que crea una respuesta tras el turno del usuario no se dispara si el servidor ya respondió a ese turno (contador `responseSeq` en `useRealtimeVoice.ts`).

## Archivos involucrados

| Archivo | Rol |
| --- | --- |
| `backend/.env` / `.env.example` | `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL` |
| `backend/src/config.ts` | Lee esas variables |
| `backend/src/voices.ts` | Voces permitidas |
| `backend/src/routes/realtime.ts` | Crea la llamada; instrucciones y tools salen de `backend/src/assistant/`, VAD, `far_field` |
| `backend/src/app.ts` | Registra la ruta |
| `frontend/src/hooks/useRealtimeVoice.ts` | WebRTC + guardia de voz + recuperación de mic + llamada al API |
| `frontend/src/audio/audioSession.ts` | Captura de mic con constraints, vigilancia del track, errores |
| `frontend/src/audio/echoGate.ts` | Detector local de voz del usuario frente a eco |
| `frontend/src/audio/echoMonitor.ts` | Medición de niveles mic/remoto |
| `frontend/src/audio/echoTranscript.ts` | Verificación de eco por contenido |
| `frontend/src/audio/voiceGuard.ts` | Turnos, interrupción voluntaria, peticiones diferidas, degradación |
| `frontend/scripts/simulate-*.ts` | Simulaciones sin dispositivo |
| `frontend/src/audio/voicePipeline.ts`, `aec-processor.js` | Sin uso (AEC propio descartado) |
| `frontend/src/lib/voices.ts` | Catálogo de voces en UI |
| `frontend/src/lib/voice-assistant.tsx` | Contexto global de la llamada |
| `frontend/src/pages/Dashboard.tsx` | Controles Hablar / voz / colgar |
| `frontend/src/lib/realtimeTools.ts` | Ejecuta tools (tareas + `query_prestamo`) |
| `backend/src/integrations/prestamo/client.ts` | Cliente HTTP hacia PrestamoApp (Atlas) |
| `backend/src/routes/integrations/prestamo.ts` | Proxy JWT `/api/integrations/prestamo/*` |
| `frontend/package.json` | `@sapphi-red/web-noise-suppressor` (sin uso) |

## Integración Atlas (PrestamoApp)

**Atlas** es el sistema financiero de préstamos (Multipréstamos): caja, créditos, cuotas, cobros, mora, clientes, ingresos y egresos. Cuando el usuario dice «Atlas», «multipréstamos», «la caja», «cobros» o «mora», Isi debe usar `query_prestamo`.

**Agenda personal** (recordatorios del usuario en esta app) es distinta: usa `list_tasks` y herramientas de tareas. «Mi agenda» / «mis pendientes» → personal; «agenda de cobros» / «quién paga» → Atlas.

Isi consulta datos de Atlas mediante `query_prestamo`. El modelo recibe JSON y razona; **no hay respuestas predefinidas ni datos mock** en el proxy ni en las tools.

### Flujo

```
Usuario (voz) → OpenAI Realtime → query_prestamo
  → frontend/realtimeTools.ts (JWT)
  → ec-assistant GET /api/integrations/prestamo/{recurso}
  → PrestamoApp GET /integrations/hub/{recurso} (X-API-Key)
```

### Configuración (`backend/.env`)

```env
PRESTAMO_API_URL=http://127.0.0.1:8083
PRESTAMO_HUB_API_KEY=<misma que HUB_INTEGRATION_API_KEY en PrestamoApp>
PRESTAMO_TENANT=atlas
```

En PrestamoApp (`backend/prestamo-app/.env`): `HUB_INTEGRATION_API_KEY` debe coincidir.

### Sin respuestas hardcodeadas

| Área | Fuente de verdad | Qué no hace el código |
| --- | --- | --- |
| Atlas (caja, cuotas, ingresos…) | `query_prestamo` → Hub PrestamoApp | No inventa cifras ni listas; solo pasa JSON al modelo |
| Agenda personal | `list_tasks` / CRUD de tareas | No devuelve tareas de ejemplo |
| Errores de tool | Mensajes de validación (`ok: false`) | El modelo los interpreta; no son respuestas al usuario listas para leer |

El único texto generado fuera de las tools es el **saludo inicial** al conectar (una frase, vía `response.create` en el cliente) y mensajes de **estado de UI** («Conectando», «Consultando Atlas»).

### Recursos disponibles (`query_prestamo.resource`)

| resource | Para qué sirve |
| --- | --- |
| `caja-chica` | Resumen del periodo (hoy, ayer, semana, mes, año): saldos, totales ingresos/egresos/desembolsos. Params: `fecha`, `fechaInicio`/`fechaFin` o `year` |
| `caja-chica-detalle` | Desglose por categoría (cuotas pagadas, gastos empresa, etc.) |
| `ingresos` | Movimientos de ingreso de **caja** (campo `motivo`; sin cliente de crédito) |
| `egresos` | Egresos de caja del periodo **incluyendo desembolsos de crédito** (`totalEgresos`, `egresos[]` con `motivo`, `desembolsos[]`) |
| `desembolsos` | Lista de créditos desembolsados con datos del crédito |
| `creditos` | Búsqueda/consulta de créditos; con `id` incluye cuotas |
| _(no expuesto a Isi)_ | Hub `/resumen` y `/liquidez` en PrestamoApp = KPIs globales; Isi usa `caja-chica` + período (default hoy) |
| `cuotas-vencidas` | Cuotas en mora **con nombre de cliente** (`usuario` / `clienteNombre`) |
| `clientes` | Búsqueda por nombre, DUI, teléfono |
| `pagos` | Cuotas pagadas y abonos del periodo **con cliente** (desglose de cobros) |

Atlas no expone «liquidez» a Isi: la caja es `caja-chica` (saldo inicial, cuánto hay, ingresos/egresos del período; desembolsos en egresos).

Parámetros opcionales en `params`: `fecha` (un día), `fechaInicio`, `fechaFin`, `year`, `q`, `id`, `limit`, `estado`.

### Prioridad temporal

Por defecto Isi trabaja **solo con el período pedido**. El Hub filtra en servidor; la respuesta incluye `fechaInicio` y `fechaFin`.

**Resolución automática de períodos** (`frontend/src/lib/prestamoPeriod.ts`): en `query_prestamo`, el modelo puede pasar `params.periodo` con la expresión del usuario y la app convierte a fechas antes de llamar al API:

| `params.periodo` (ejemplos) | Rango resuelto |
| --- | --- |
| hoy, ayer | Un solo día |
| esta semana | Lunes de esta semana → hoy |
| semana pasada | Lunes a domingo de la semana anterior |
| este mes | Día 1 del mes → hoy |
| mes pasado | Mes calendario anterior completo |
| este año / año pasado | Año en curso o anterior |

También acepta `fecha`, `fechaInicio`/`fechaFin` en YYYY-MM-DD, o las mismas expresiones relativas en esos campos.

- **Cada pregunta con fechas distintas** → nueva llamada; no reutilizar JSON anterior.
- Comparar dos períodos → dos llamadas separadas, sin mezclar filas ni sumar entre períodos.
- Sin período explícito en ingresos/egresos/desembolsos/pagos → `periodo=hoy`.

### Motivos en ingresos y egresos

Cada fila de `ingresos` / `egresos` trae **`motivo`** (string o `null`). Son movimientos de caja, no cobros de cuotas.

**Cobros vs ingresos:** para «quién pagó», «de qué fueron los cobros/ingresos de clientes» o el desglose tras un total del día, usar `pagos` (trae `usuario`/`clienteNombre`). Mora con nombres → `cuotas-vencidas`. Follow-ups de detalle → nueva llamada a la tool; no reutilizar solo el monto de una consulta anterior.

| Pregunta del usuario | Comportamiento |
| --- | --- |
| «¿Cuánto tenemos en caja?» | Solo el saldo del período |
| «¿De dónde viene?» / «¿Cuál fue el motivo?» | Resume el `motivo` (monto/tipo si hace falta) |
| «Léeme el motivo exacto» / textual | Cita el texto literal del campo |
| `motivo` null | Decirlo; no inventar |

### Créditos y desembolsos (respuesta breve primero)

Al preguntar por un crédito o desembolso, Isi responde solo **nombre del cliente** y **monto**, y pregunta si quiere más detalle. Los datos están disponibles en la consulta (frecuencia, fechas, conteos y totales de cuotas, etc.); el desglose cuota por cuota requiere `params.id`. Solo profundiza si el usuario confirma o pregunta algo concreto (ej. cuotas vencidas, total pendiente).

Isi puede llamar `query_prestamo` varias veces en una conversación (p. ej. comparar períodos), pero **cada respuesta al usuario debe basarse solo en la consulta del período que pidió**, sin mezclar datos de llamadas previas salvo que el usuario pida explícitamente una comparación entre dos períodos ya consultados.

### Pruebas de voz sugeridas

- «¿Cuál es la caja chica de Atlas?»
- «¿Cómo va el mes?» (ingresos vs egresos)
- «¿Por qué tenemos esa cantidad en caja?» (movimientos con motivo)
- «¿Cuánto tenemos en mora?»
- «¿Podemos desembolsar 50 mil?» (`caja-chica` + razonamiento)
- «Busca a Juan y dime qué debe»

## Cómo probarlo

1. Pegar la key en `backend/.env` (`OPENAI_API_KEY=sk-...`).
2. `npm run dev` (o `npm run dev:https` si pruebas desde el teléfono).
3. Iniciar sesión, elegir voz, pulsar **Hablar**, aceptar el micrófono.
4. Hablar con naturalidad; **Colgar** corta la sesión.

## Qué no se hizo (a propósito)

- La API key no se expone al cliente ni se usa WebSocket con la key en el browser.
- No se mutea el mic para el eco del altavoz: AEC nativo + decisión de turnos en el cliente.
- No se usa Krisp ni servicios de denoise de pago.

## Referencias

- [Realtime API with WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc) — flujo unificado `/v1/realtime/calls`
- [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations) — voces y `session.audio.output.voice`
- [@sapphi-red/web-noise-suppressor](https://github.com/sapphi-red/web-noise-suppressor) — RNNoise y Speex en AudioWorklet
- [xiph/rnnoise](https://github.com/xiph/rnnoise) — modelo de supresión de ruido
- [OpenAI Realtime models](https://developers.openai.com/api/docs/models/gpt-realtime-2.1) — `gpt-realtime-2.1` / `gpt-realtime-2.1-mini`
