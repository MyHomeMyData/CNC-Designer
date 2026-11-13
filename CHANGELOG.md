# Changelog

## Unreleased

- Basic shapes: ellipse, with handles at the ends of its axes
- Snap grid for moving layers and pulling edges, 10 mm by default,
  adjustable in whole millimetres; Alt switches it off for one drag
- Rectangle: handles in the middle of the edges; pulling one moves that
  edge and changes the width or the height
- Rectangle: optional rounded corners with one radius for all four
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
