# CNC-Designer

A browser-based design tool for creative uses of a hobby CNC machine
(built around an [MPCNC](https://docs.v1e.com/mpcnc/intro/) running FluidNC).

Design something, get a rough 2D preview of the result, and export G-code
that distinguishes working moves from positioning moves, each with its own
Z height and feed rate.

**Status: early prototype.** The shared core, the user interface and modules
for basic shapes, SVG import, G-code import (Sandify), text and string art
exist. G-code from the app
has been run on the machine; a string art piece has not been made with it
yet. The remaining use cases below are still to come.

## Planned use cases

Each use case is a module on top of a shared core:

1. Milling text and imported paths (SVG) at a given depth
2. String art: design nail patterns and thread routing, preview the result,
   export a drilling program and threading instructions
3. Import of [Sandify](https://sandify.org) patterns, with Z handling added
4. Painting with a brush instead of a cutter

See the [user guide](docs/user-guide.md) for how to use the app and the
[changelog](CHANGELOG.md) for what is new.

## How it works

- A project consists of **layers**. Each layer is created by a design module
  and placed in the work area (position, rotation, scale).
- Each layer is assigned an **operation**: follow paths at a working Z, or
  drill points. An operation holds safe Z, working Z, feed rates, depth per
  pass and the tool.
- Layers with the same tool end up in one **G-code file**; tools are changed
  by hand between files.
- Projects are saved to and opened from your own computer. Nothing is stored
  on the server. The browser only remembers the snap grid setting.

### Coordinates, zero point and work area

- All values are millimetres. X points to the right, Y to the back, Z up.
- **Z = 0 is the workpiece surface.** Negative Z is inside the material.
- The zero point is set by hand at the machine. The generated programs never
  change it: no homing, no `G54`, no `G10`, no `G92`.
- The **work area** is the range a program may move in, given as minimum and
  maximum per axis relative to the zero point, e.g. X −200…200, Y −200…200,
  Z −10…90. The zero point must lie inside it. Both the allowed range and the
  range actually used are written into the header of every G-code file.
- If any move would leave the work area, the file is not exported and the
  offending moves are listed.
- The **workpiece** is separate from the work area and only used for display
  and warnings.

### Generated G-code

- Written for FluidNC (Grbl dialect): `G21 G90 G94 G17`, then `G0`/`G1` only.
- The tool may stand anywhere when a program starts. The first move goes to
  safe Z, the second to the start position in X/Y.
- Positioning moves happen at safe Z, either as rapid moves (`G0`) or with
  their own feed rate (`G1`).
- By default a program ends at safe Z above the last position. Optionally it
  moves to a given end position, Z first, then X/Y.
- There are no spindle commands; the router is switched by hand.

Always check a new program with the tool well above the workpiece first.

## Running it

The easiest way is the published version:
**https://myhomemydata.github.io/CNC-Designer/**. It needs nothing but a
current browser. The app stores nothing on the server; projects, G-code and
SVG files are saved on your own computer. It is updated with every change on
`main`.

To run it yourself: the app is a set of static files and has to be served by
a web server; opening `index.html` from disk does not work. It always uses
port 8090.

### Docker

```bash
docker compose up -d --build
```

Then open `http://<host>:8090/`. Stop it with `docker compose down`.

### systemd service (without Docker)

Requires Node.js 22.12 or newer (for the build), Python 3 and systemd.
From a checkout of this repository:

```bash
sudo deploy/install.sh
```

This builds the app, copies it to `/opt/cnc-designer/www` and starts the
service `cnc-designer`. To upgrade, update the checkout and run the script
again. To remove everything: `sudo cnc-designer-uninstall`.

## Development

Requirements: Node.js 22.12 or newer (see `.nvmrc`).

```bash
npm install
npm run dev      # development server at http://localhost:8090
npm run check    # type check, lint, format check and tests
npm run test:e2e # browser tests (once: npx playwright install chromium)
npm run build    # production build in dist/
```

The development server and the Docker container use the same port, so only
one of them can run at a time.

The checks, the build and the browser tests also run on GitHub for every
pull request and for `main` (`.github/workflows/ci.yml`).

Source layout:

- `src/core/` – geometry, work area, operations, toolpaths, G-code and
  project files; plain TypeScript without UI dependencies
- `src/modules/` – one design module per use case (see `src/modules/types.ts`
  for the interface, `src/modules/registry.tsx` for the list)
- `src/ui/` – the React user interface
- `tests/` – automated tests
- `e2e/` – browser tests of the main workflows
- `docs/` – [user guide](docs/user-guide.md)
- `deploy/` – files for running the app as a service

This project is developed with the help of an AI assistant (Claude Code by
Anthropic). AI-assisted commits carry a `Co-Authored-By` trailer.

## Third-party components

The app embeds the fonts Roboto, Merriweather, Oswald and Dancing Script
(Latin subsets, from the `@fontsource` packages). They are licensed under
the [SIL Open Font License 1.1](https://openfontlicense.org/); the license
texts are part of those packages. Libraries used at run time: React,
opentype.js, svgpath, zod (MIT) and saxes (ISC).

## License

[MIT](LICENSE)
