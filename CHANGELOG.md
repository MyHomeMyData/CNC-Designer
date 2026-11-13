# Changelog

## Unreleased

- Text: the position of a text layer now refers to the baseline of the last
  line instead of the first, so it marks the lower edge of the whole block.
  Multi-line texts in existing projects move up by the height of the lines
  above the last one and need to be placed again.

## 0.1.0 – 2026-11-13

First usable version.

- Shared core: geometry, work area as minimum and maximum per axis around a
  zero point set at the machine, operations (follow paths, drill points),
  toolpaths, G-code for FluidNC, project files
- Design modules: basic shapes, SVG import, text with embedded or
  user-supplied fonts
- Placing layers with the mouse (move, scale, rotate) and by numbers
- Rough preview of the result, positioning moves shown separately
- Shorter positioning moves by joining and reordering paths
- Export of G-code (one file per tool) and of the design as SVG
- Deployment as Docker container or systemd service on port 8090
