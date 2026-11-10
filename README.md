# Skyward

Monorepo for a single-player game based on Brandon Sanderson's first Skyward book, using TypeScript, Vite, and Three.js.

The main menu renders an empty procedural Three.js hangar. Free flight opens a hangar carousel for Poco, Largo, Scout, and M-Bot. Use the side arrows or left/right keys to cycle airframes, then **Launch free flight** to pilot the selected ship above a procedural desert planet. Multiplayer remains a placeholder.

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

## Free flight

The planet has a 600,000 m radius and 9.81 m/s² surface gravity, decreasing with the inverse square of distance from its center. The surface consists mostly of desert plains, with sparse hills from five layers of seeded 3D Perlin noise. All current code remains in `web`.

Terrain follows the seeded-generation idea in `.files/generation.txt` and the triangular rendering in `.files/planet.txt`. Instead of precomputing a highly subdivided global mesh, six spherical cube faces are managed as quadtrees. Each patch contains indexed triangles. Proximity to a quadrant determines subdivision up to level 14; patches are generated within a per-frame budget and distant child meshes are disposed. Parent coverage and edge skirts conceal incomplete loading and neighboring detail differences. Press **V** to inspect the triangles. Rendering uses a floating origin centered on the ship; physics and noise retain absolute planet coordinates.

Flight uses a fixed 120 Hz simulation, arcade steering, coordinated banked turns, directional thrust, braking, and surface collision. The acclivity ring cancels radial gravity and controls vertical thrust, allowing stationary hovering at zero throttle. Disabling it restores gravity; forward flight supplies a simplified aerodynamic lift assist. These are provisional game physics rather than a full aerodynamic simulation.

| Control | Action |
| --- | --- |
| W / S | Increase / decrease throttle |
| A / D | Yaw left / right |
| Mouse up / down | Pitch down / up (invertible in Controls) |
| Mouse left / right | Roll left / right |
| Shift / Ctrl | Vertical thrust up / down with the ring |
| Space | Airbrake and reduce throttle |
| B | Boost |
| H | Toggle acclivity ring |
| C | Chase / nose camera |
| V | Terrain triangle view |
| P / Escape | Pause, reset position, or return to hangar |

Flight uses keyboard and mouse controls. Open **Controls** from the HUD or pause menu to invert mouse pitch; the preference is saved locally. Move over the flight view to steer, or click the terrain to capture the mouse; Escape releases it and pauses. `tests/flight.spec.ts` checks reproducible terrain, quadrant boundaries, near/far LOD, hovering, gravity, acceleration, turning, surface contact, and the launch/pause/return flow.

## Workspaces

- `web`: all current game code and assets; builds to `web/dist`.
- `server`: placeholder for future multiplayer services.
- `packages/shared`: placeholder for future shared simulation and physics.

