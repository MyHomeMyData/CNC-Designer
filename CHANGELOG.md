# Changelog

## Unreleased

- String art: rows of nails on spirals, and the template _Twisted
  polygons_: polygons that shrink and turn towards the centre, with nail
  settings of their own (3 mm smallest distance, 1.2 mm nails), strung
  from the innermost nail outwards
- String art: threads can run round the repetitions: the same nail in each
  repetition in turn, then the next nail
- String art: a new layer starts in the middle of the workpiece instead of
  at the zero point
- The app is published on GitHub Pages:
  https://myhomemydata.github.io/CNC-Designer/

## 0.3.0 – 2026-11-14

- G-code import: a new kind of layer that takes the paths from a G-code
  file. Files from Sandify are split into their layers and the ways
  between them, which can be switched on and off; start and end code for
  the sand table is skipped. Heights and feed rates come from the operation
- Checks and browser tests run on GitHub for every pull request and for
  `main`

## 0.2.0 – 2026-11-14

- String art: a new kind of layer. Rows of nails on lines, circles,
  ellipses and polygons, repeated around a centre; threads strung between
  rows by a rule, shown in their colours on a board of a chosen colour;
  thread lengths; the nails are drilled with the existing drilling
  operation
- String art templates with their own settings: circle with axes, parabola
  star, spokes and tangents, cardioid
- String art: printable stringing instructions with named nails and the
  way of every thread
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
