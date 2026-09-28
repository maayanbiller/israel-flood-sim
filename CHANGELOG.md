# Project Log & Changelog

## 2026-09-28: Version Control and Safety Upgrades
- Initialized local git repository.
- Configured `.gitignore` to keep temporary debugging files and test output images out of version control.
- Pushed initial project setup to GitHub at `https://github.com/maayanbiller/israel-flood-sim`.
- Archived deprecated mapping experiments (CartoDB, MapLibre, CesiumJS, and previous ThreeJS iterations) into the `archive/` directory to focus purely on the custom WebGL `flood_fill.html` implementation.
- Refactored the `auto_approve.py` Antigravity Lifecycle Hook to strictly use lightning-fast offline keyword heuristics, blocking destructive terminal commands (like `rm`, `del`) without any network/API overhead or timeouts.

## 2026-09-27: Automated Testing & AI Security
- Built Playwright automation scripts (`test_sim.py`, `test_levels.py`) to launch a headless browser, interact with the WebGL slider, and capture screenshot evidence of flooding without manual user intervention.
- Prototyped a "PreToolUse" security hook for the Antigravity agent, using `gemini-3.8-flash` to evaluate terminal commands before they execute. (Later reverted in favor of a faster offline keyword checker).

## 2026-09-26: Simulation Physics & Rendering Fixes
- Addressed inverted rendering bug: Discovered that `THREE.DataTexture` loads bottom-to-top unlike `TextureLoader`. Explicitly applied `maskTexture.flipY = true` so the physics mask aligns geographically with the satellite imagery (fixing the bug where Gaza flooded before Tel Aviv).
- Added a secondary natural flood origin point at the bottom edge (Gulf of Aqaba / Red Sea) so Eilat floods naturally at 0m rather than waiting for Mediterranean overspill.
- Reduced overall terrain exaggeration multiplier to `0.5` per user request for a more realistic topographic scale.
- Verified physical accuracy mathematically using `verify_flood.py`. Confirmed Eilat (32m), Tel Aviv (19m), and Gaza (38m) flood between 0m-50m, while the Dead Sea (-414m) remains blocked by mountains until 400m, and Jerusalem (747m) is only soaked at 1000m.

## Pre-2026-09-26: Initial Prototyping
- Evaluated multiple 3D mapping engines (CesiumJS, MapLibre) but rejected them due to API key requirements, watermarks, and excessive UI clutter.
- Settled on a pure vanilla HTML/WebGL stack using Three.js.
- Fetched and stitched custom Mapzen terrain elevation data (`elev.png`) and ArcGIS satellite imagery (`sat.jpg`) into a seamless 3x5 tile grid covering the entire region.
- Wrote a custom GLSL vertex and fragment shader, coupled with a Breadth-First Search (BFS) flood-fill algorithm in JavaScript, to accurately simulate water levels rising across realistic topography based on connected terrain.
