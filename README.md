# Billionaire Chess

A browser-based 3D chess game with local play and online rooms. The Node.js server serves the static game and handles WebSocket multiplayer.

## Time controls

Before starting a game, choose **Untimed**, **3 + 0**, **10 + 5**, or **15 + 10**. Clocks run in local and online games; online clocks are synchronized to the server and a timeout ends the game.

## Deploy to Render

This repository includes `render.yaml`, so Render can create the service from the blueprint.

1. Push this repository to GitHub or GitLab.
2. In the Render dashboard, choose **New +** and select **Blueprint**.
3. Connect the repository and select this project as the repository root.
4. Review the service settings from `render.yaml`:
   - Environment: Node
   - Build command: `npm ci`
   - Start command: `npm start`
   - Health check: `/health`
   - Runtime environment: `NODE_ENV=production`
5. Click **Apply** and wait for the build and deployment to finish.
6. Open the generated Render URL and test the game.
7. Test online play by opening the URL in two browsers or devices, then create a room in one and join its code in the other.

You can also create a **Web Service** manually and enter the commands above. Do not set `PORT` yourself; Render supplies it automatically.

### Deployment notes

- The browser uses the same origin for WebSockets, so HTTPS deployments use `wss://` automatically.
- Active rooms and game state are stored in server memory. A restart, crash, or free-instance sleep disconnects active games; players must create or join a room again.
- No Render environment secrets are required for the current implementation.
