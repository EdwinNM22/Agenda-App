# Agenda

Agenda personal con recordatorios. Arquitectura inicial **toda en TypeScript**:

- `backend/` — Fastify, JWT, MariaDB (`mysql2`)
- `frontend/` — Vite, React, shadcn/ui

Sin Docker. MariaDB corre en tu máquina.

## Arranque

1. Ajusta `backend/.env` si tu usuario/clave de MariaDB son distintos. El seed actual usa la base `test_agenda` porque el usuario local solo tiene privilegios sobre `test_*`.
2. MariaDB en marcha: `systemctl start mariadb`
3. Instala, crea el usuario de prueba y levanta API + frontend:

```bash
npm install
npm run seed
npm run dev
```

En la terminal Vite muestra dos URLs:

- Local: `http://localhost:5173`
- Network: `http://TU_IP:5173` — úsala desde el móvil u otro dispositivo en la misma Wi‑Fi

Para APIs del navegador que exigen HTTPS:

```bash
npm run dev:https
```

Luego entra a `https://TU_IP:5173`. El certificado es local; el navegador pedirá aceptar la advertencia. El backend sigue en HTTP; Vite proxya `/health`, `/auth`, `/tasks`, `/ws` y `/uploads`.

Si no carga desde el otro dispositivo, abre el puerto 5173 en el firewall (`sudo ufw allow 5173` o el equivalente en firewalld).

Usuario de prueba:

- correo: `admin@agenda.local`
- contraseña: `agenda123`

El login guarda un JWT y abre un dashboard con voz (GPT Realtime) y un botón para cerrar sesión.

Pon tu clave en `backend/.env` (`OPENAI_API_KEY`). El navegador nunca la ve: el backend crea la sesión y el micrófono va por WebRTC. Desde otro dispositivo usa `npm run dev:https` para que el micrófono funcione.

## PWA (iOS y Android)

La app se puede instalar en la pantalla de inicio. Hace falta HTTPS (producción o `npm run dev:https`).

### Instalar

- **Android / Chrome:** menú del navegador → Instalar aplicación, o Ajustes → Instalar app.
- **iPhone / iPad:** Safari → Compartir → Añadir a pantalla de inicio.

Tras el build, `index.html` no debe cachearse; el service worker (`sw.js`) tampoco.

### Iconos

Cuatro JPG, mismo nombre y tamaño:

- `frontend/public/apple-touch-icon.jpg` — 180×180 (iOS)
- `frontend/public/pwa/icon-192x192.jpg` — 192×192
- `frontend/public/pwa/icon-512x512.jpg` — 512×512
- `frontend/public/pwa/maskable-512x512.jpg` — 512×512 (logo centrado, ~10% de margen)
