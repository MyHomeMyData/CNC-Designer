# CNC-Designer

A browser-based design tool for creative uses of a hobby CNC machine
(built around an [MPCNC](https://docs.v1e.com/mpcnc/intro/) running FluidNC).

**Status: planning / design phase. There is no usable software yet.**

## Goals

Design something, get a rough 2D preview of the result, and export G-code
that distinguishes working moves from positioning moves, each with its own
Z height and feed rate.

Planned use cases, each implemented as a module on top of a shared core:

1. Milling text and imported paths (SVG) at a given depth
2. String art: design nail patterns and thread routing, preview the result,
   export a drilling program and threading instructions
3. Import of [Sandify](https://sandify.org) patterns, with Z handling added
4. Painting with a brush instead of a cutter

## Planned architecture

- Static web app written in TypeScript; no backend, no login
- Projects are saved to and loaded from the local machine
- Deployable in the home network as a Docker container or a system service

## Development

This project is developed with the help of an AI assistant (Claude Code by
Anthropic). AI-assisted commits carry a `Co-Authored-By` trailer.

## License

[MIT](LICENSE)
