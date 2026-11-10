# Skyward

Monorepo for a single-player game based on Brandon Sanderson's first Skyward book, using TypeScript, Vite, and Three.js.

The main menu renders an empty procedural Three.js hangar. Free flight opens a hangar carousel for Poco, Largo, Scout, and M-Bot. Use the side arrows or left/right keys to cycle airframes with directional slide transitions. Actual flight and multiplayer are not implemented yet.

The top-right profile uses provisional relative game stats, not canonical ship specifications. Reduced-motion preferences disable slide animations.

Ship geometry is traced from the drawings in `.files`, with reconstructed depth from their side/front views. The selection screen includes orbit controls, orthographic top/side/front views, and the original references. These are reference-based reconstructions, not verified exact 3D replicas.

## Development

Requires Node.js 20+ and npm.

```sh
npm install
npm run dev
```

Run `npm run build` for a typechecked production build, `npm run typecheck` for TypeScript checks, and `npm run preview` to serve the build.

Run `npx playwright test` for selection/navigation checks and model screenshots in `test-results`. The browser configuration uses installed Microsoft Edge.

## Workspaces

- `web`: all current game code and assets; builds to `web/dist`.
- `server`: placeholder for future multiplayer services.
- `packages/shared`: placeholder for future shared simulation and physics.

