# Browser and local network access

Lumen's desktop process remains the owner of its local database, Bible files, and presentation state. The browser client uses a versioned service boundary implemented by the Electron host. Desktop IPC and browser requests call the same registered handlers.

## Use it

1. Start Lumen on the computer that has the installed Bible library and service data.
2. Open **Ajustes → Acceso desde otros dispositivos** and enable access.
3. Scan the QR code from a device on the same private network to connect automatically. Or open the displayed address and enter the access code manually.
4. Disable access in Lumen when finished.

### Outside the church network (Tailscale)

The LAN address only works on the same Wi-Fi or cable network. To connect from mobile data or another network, install [Tailscale](https://tailscale.com/download) on the host and on the phone, signed in to the same account. Ajustes then shows a **Desde fuera de la iglesia** section with a QR code for the host's Tailscale address (a `100.64.0.0/10` address). If Tailscale is not detected, that section lists the setup steps and offers a download button. Tailscale encrypts the traffic between devices, so the port does not need to be forwarded on the router.

Detection is address-based: any interface with an address in `100.64.0.0/10` counts as Tailscale. Mobile carriers can also use that range, so the QR may appear on a host that is not on Tailscale. Scanning it then fails to connect, and the host should be checked for Tailscale.

The host computer and Lumen must remain running. Scanning the QR opens the operator/controller app with the short pairing code in a query parameter. The browser immediately exchanges it for a high-entropy session token and removes the query parameter from the address bar. Manually opened addresses use the same six-digit code in the access screen. Browser sessions are kept in the browser's local storage and do not expire by time, so a device stays connected across tab and browser restarts. **Cambiar código** in Ajustes replaces the six-digit code at once; the old code stops working, but devices that are already paired stay connected. Disabling access closes the LAN listener and invalidates all paired sessions and the code. Restarting Lumen on the host also ends all sessions, because they are held in memory.

## Browser features

The web operator supports installed and online Bible reading, Bible downloads and removal, settings, history, service queue, favorites, songs, texts, saved slide decks, and live projection control. Browser clients share one operator state on the host. The QR code does not open or expose a projector browser view; the congregation output remains in the host computer's separate Electron projector window.

Native file dialogs (Bible/background/slide import), physical display enumeration, desktop auto-update, and operating-system shortcuts remain desktop-only. Import media and select displays on the host before operating remotely. The host projector window can be reopened from the desktop operator app.

## Service contract

The current contract is versioned under `/api/v1`:

- `POST /api/v1/rpc` accepts `{ "channel": "...", "args": [...] }` and returns `{ "result": ... }`. The server enforces an explicit channel allow-list.
- `GET /api/v1/events` is an authenticated Server-Sent Events stream for projector state, settings, Bible download progress, and slide conversion progress. It replays the latest projector/settings events on connection.
- `POST /api/v1/session` exchanges `{ "code": "123456" }` for a random session token.
- `GET /api/v1/session` refreshes the browser's media authorization for an existing session.
- `GET /media/<managed-path>` serves only files from Lumen's managed background and slide image directories. Pairing sets a path-scoped, HttpOnly cookie so native `<img>` and `<video>` requests can authenticate without exposing the session token to media elements; video byte-range requests are supported.

Every API call from a LAN client requires `Authorization: Bearer <session-token>`. Media requests use the scoped cookie set during pairing or session refresh. Pairing codes contain six digits and are generated randomly when LAN access is enabled. Five failed attempts from one client address lock out further pairing attempts from that address for 15 minutes. A successful pairing exchanges the short code for a random 256-bit session token, so ordinary API requests do not use the six-digit code. The token stays valid until access is turned off or Lumen restarts. Anyone who can pair receives operator-level access; there are no separate viewer/operator roles yet.

## Network and development notes

The service listens only on loopback until access is enabled. Enabling LAN access binds the service to all network interfaces; the host firewall may ask to allow Lumen. Use this only on a trusted private network. The service uses HTTP for local-network traffic: do not forward the port to the public internet or use it on an untrusted Wi-Fi network.

During development, Vite proxies `/api` and `/media` to the Electron service. Local browser development works at `http://localhost:43123` while `pnpm dev` is running. To use a tablet during development, enable LAN access in the desktop app; it serves the current production build from port `43124` with the same pairing flow. The development server itself remains bound to loopback.

The `/api/v1` boundary is the integration point for a future mobile client. Before shipping a native mobile app or exposing Lumen beyond a trusted LAN, add TLS, per-user accounts/roles, broader API rate limiting, audited request schemas, and a stable client SDK. The current browser adapter is not an internet-facing service.
