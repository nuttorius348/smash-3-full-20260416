## Node Server (Required for GIFs + Multiplayer)

### 1) Install dependencies (first time only)

```
npm install
```

### 2) Start the server

```
node server/multiplayer-server.js
```

Optional: pass a custom port

```
node server/multiplayer-server.js 7777
```

### 3) Open the game in a browser

```
http://localhost:7777
```

For LAN play, use your machine's IP (replace 7777 if you changed it):

```
http://<your-lan-ip>:7777
```

### Notes

- The GIF sprite decoder is loaded from `assets/vendor/gifuct.min.js`, so running the Node server is required for animated GIF sprites.
- If you open `index.html` directly, GIFs will appear static.
