# Skyward

Monorepo for a single-player game based on Brandon Sanderson's first Skyward book, using TypeScript, Vite, and Three.js.

The main menu renders an empty procedural Three.js hangar. Free flight opens a hangar carousel for Poco, Largo, Scout, and M-Bot. Use the side arrows or left/right keys to cycle airframes with directional slide transitions. Actual flight and multiplayer are not implemented yet.

The top-right profile uses provisional relative game stats, not canonical ship specifications. Reduced-motion preferences disable slide animations.

Ship geometry is traced from the drawings in `.files`, with reconstructed depth from their side/front views. The selection screen includes orbit controls, orthographic top/side/front views, and the original references. These are reference-based reconstructions, not verified exact 3D replicas.

`web/src/ships.ts` holds each ship's traced panels and cross sections. `web/src/ship-geometry.ts` builds rounded hulls, tapered beveled wings, framed canopies, intakes, and stern assemblies. Heights are recorded in reference-image pixel units alongside plan coordinates. The monochrome drawings do not specify colors, so materials use a neutral metal and glass palette.

## Development

Requires Node.js 20+ and npm.

```sh
npm install
npm run dev
```

Run `npm run build` for a typechecked production build, `npm run typecheck` for TypeScript checks, and `npm run preview` to serve the build.

Run `npx playwright test` for selection/navigation checks and model screenshots in `test-results`. The browser configuration uses installed Microsoft Edge.

`tests/ship-models.spec.ts` additionally checks source-based length/span proportions and finite geometry, then generates a top/side/front comparison sheet for every ship. These sheets support visual review; passing the checks does not prove an exact artwork match.

## Workspaces

- `web`: all current game code and assets; builds to `web/dist`.
- `server`: placeholder for future multiplayer services.
- `packages/shared`: placeholder for future shared simulation and physics.

