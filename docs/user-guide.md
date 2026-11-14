# User guide

CNC-Designer turns simple designs into G-code for a hobby CNC machine
running FluidNC. This guide describes how to use the app. For installation
see the [README](../README.md).

## The screen

- **Left:** the layers of the design and the settings of the selected layer.
- **Middle:** the drawing. The dashed frame is the work area, the coloured
  rectangle the workpiece, the red and green arrows mark the zero point.
- **Right:** three tabs. _Setup_ holds work area, workpiece and what happens
  at the end of a program. _Operations_ holds the machining settings.
  _G-code_ shows the programs, their problems, and the download buttons.
- **Top:** new, open and save a project, export the drawing, undo and redo.

Numbers may be typed with a decimal point or a decimal comma. A value takes
effect when you press Enter or leave the field; Escape discards it.

## Before you start: zero point and work area

The app does not know where things are on your machine. You tell it in
which range a program may move, relative to the zero point you set at the
machine before starting the program.

- **Z = 0 is the top surface of the workpiece.** Negative Z is inside the
  material, positive Z above it.
- The **work area** is given as _from … to_ for X, Y and Z. Negative values
  are fine: X from −200 to 200 means the zero point is in the middle. The
  zero point must lie inside the work area.
- The generated programs never change the zero point.
- The **workpiece** is only drawn and used for warnings. It may be smaller
  than the work area.

Every G-code file states the allowed range and the range the program really
uses in its first lines, so you can check them at the machine before
setting the zero point.

## Layers

A design consists of layers. Choose a kind of layer and press _Add layer_:

| Kind        | What it is                                              |
| ----------- | ------------------------------------------------------- |
| Basic shape | A line, rectangle, circle, ellipse, or a grid of points |
| SVG import  | Paths from an SVG file                                  |
| Text        | Letters as outlines                                     |
| String art  | Nails to drill, with threads strung between them        |

Layers are worked from top to bottom. The arrows change the order, the
checkbox hides a layer (hidden layers are not exported), ✕ deletes it.

### Placing a layer

- **Drag** a layer by one of its lines to move it. Dragging empty space
  moves the view; the mouse wheel zooms; _Fit_ shows the whole work area.
- The selected layer has **handles**: the squares at the corners scale it,
  the circle on top rotates it (hold Shift for steps of 15°).
- With **Snap** switched on (below the drawing), dragging stops at
  multiples of the grid width next to it, 10 mm to begin with; any whole
  number of millimetres can be set. A moved layer is put on the grid with
  its origin, the point that _Position X/Y_ show. A pulled edge of a
  rectangle lands on a grid line; if the rectangle is turned at an angle,
  its side becomes a multiple of the grid width instead. Scaling and
  rotating are not snapped, and typed numbers are never changed. Hold
  **Alt** to drag freely for once. The setting is remembered by the
  browser, not stored in the project.
- Under _Placement_ you can type position, rotation and scale, set the size
  directly, turn by 90°, mirror, centre the layer on the workpiece or make
  it fill the workpiece.

### Basic shape

A **rectangle** has a square handle in the middle of each edge. Pull one to
move that edge: the opposite edge stays where it is, and _Width_ or _Height_
changes. Unlike the corner handles, this changes the rectangle itself and
not its scale.

An **ellipse** is given by its width and height, with its centre at the
layer position. It has the same four handles, at the ends of its axes.

_Corner radius_ rounds all four corners with the same radius; 0 gives sharp
corners. The radius is limited to half of the shorter side, and the size of
the rectangle stays the same.

### SVG import

Outlines of all visible shapes are imported: paths, rectangles, circles,
ellipses, lines, polygons, groups and references. Fill and line width are
ignored. Text and embedded images are skipped, with a note in the panel;
convert text to paths in your drawing program first.

- _Plain numbers_ decides what a number without a unit means. The SVG
  standard says pixels (96 per inch). Files from Sandify use millimetres;
  the app recognises them and switches by itself.
- _Curve tolerance_ is the largest deviation allowed when curves are turned
  into short straight moves.

### Text

Type the text (line breaks start new lines) and choose a font. _Letter
height_ is the height of a capital letter in millimetres. Six fonts come
with the app; _Use a font file…_ takes any font in TTF, OTF or WOFF format
and stores it in the project.

The position of a text layer refers to the baseline of its last line: the
left end, the middle or the right end of it, depending on the alignment.
Earlier lines stand above. Only descenders, as in g or p, reach below.

Letters are drawn as outlines: the tool follows the edge of each letter.
Single-line engraving fonts are not supported yet.

### String art

A string art layer is a pattern of nails with threads strung between them.
The machine drills the holes for the nails; the threads are strung by hand,
following printed instructions. The drawing shows the threads in their
colours on a board of the colour you choose, so you can judge the result
before drilling. A new layer is given a drilling operation.

#### Templates

The quickest start is a template. Each has a few settings of its own:

| Template            | What it is                                                                                   | Settings                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Circle with axes    | A circle with two axes, a star inside and curves at the rim                                  | Radius, nails per row                                                                                              |
| Parabola star       | A star outline of triangles that point outwards                                              | Number of triangles, outer radius, triangle height, nails per leg                                                  |
| Spokes and tangents | Spokes around the centre and, between them, rows that touch a circle; two colours take turns | Number of spokes, where they begin and end, radius of the circle the other rows touch, their length, nails per row |
| Cardioid            | A times table on a circle; factor 2 gives a heart-shaped curve                               | Radius, nails, factor                                                                                              |

In _Spokes and tangents_ every thread runs there and back. With _One thread
per colour_ the fans at the rim and the star in the middle are strung with
a single thread per colour instead of two; the lines are the same.

Changing a template setting builds rows and threads anew and keeps the
names, colours and visibility of the threads.

#### Designs of your own

Below the template settings the design is laid open: its rows of nails and
its threads. Changing rows, repetitions or thread rules there turns the
layer into a design of your own (_Own design_); the template settings
disappear.

- A **row of nails** follows a straight line, a circle or ellipse (or a
  part of one) or a polygon. Nails are spread evenly, by number or by
  distance. Coordinates are relative to the layer position.
- **Repetitions** turns all rows that many times around the layer
  position. Nails that fall on the same spot become one nail.
- A **thread** has a name and a colour and consists of **parts**. A part
  joins two rows by a rule: nail _i_ of the first row goes to nail
  _a × i + b_ of the second. _Set rule_ offers the common ones. _Count the
  target row from its far end_ turns the second row around; this is what
  makes a parabola in a corner when both rows start in that corner.
  _To repetition_ joins a row with the one in the next repetition (1) or
  further on.
- _First nail_, _Every … nail_ and _Lines_ limit a part to a section of
  the row.
- _Thread runs_ _there and back_ zigzags between two rows; _as a chain_
  works on one closed row, where each line starts at the nail the last one
  ended on.
- A thread with several **colours** uses them in turn from repetition to
  repetition. Each colour is one piece of thread.
- _Double: there and back_ strings every line twice, so the thread ends
  on the nail it began at.

Each colour of a thread is strung in one piece, knotted only at its first
and last nail. Where the end of one part and the beginning of the next are
different nails, the thread has to cross over; these **crossings** are
counted under _Result_. Often one nail more or less per row removes them.

_Result_ also shows the number of nails and the length of each thread, with
one turn around every nail included. Nails closer together than _Smallest
distance_ are reported. The lengths belong to the design as it is drawn in
the panel; if you scale the layer under _Placement_, they no longer fit.

#### Drilling and stringing

The nails are the points of the layer. Give the layer's drilling operation
the depth and tool you need and export the G-code as for any other layer.

_Stringing instructions_ opens a page for printing:

- a drawing of the nails. Every row on the board has its own letters, which
  stand at its nail 1; every fifth nail carries its number. A nail shared
  by two rows is named after the row that comes first in the alphabet.
- a picture of the finished piece and the list of rows
- for each thread its length, the nail to tie it to, and the nails in the
  order the thread goes round them, such as `A1 B1 B2 A2`. An arrow (⇢)
  marks a crossing.

The drawing fills the page and is not to scale, and it shows the design
before the layer is turned, mirrored or scaled.

## Operations

An operation says how a layer is machined. Assign one to each layer under
_Machining_. A layer without an operation is only drawn.

There are two kinds:

- **Follow paths** moves the tool along the paths at the working Z, in
  several passes if you set a depth per pass.
- **Drill points** goes straight down at each point, optionally in pecks
  that lift the drill to clear chips.

| Setting          | Meaning                                                            |
| ---------------- | ------------------------------------------------------------------ |
| Tool             | Layers whose operations name the same tool go into one G-code file |
| Tool diameter    | Width of the trace in the preview; it does not shift the path      |
| Safe Z           | Height for positioning moves, above the surface                    |
| Working Z        | Depth of the work; negative values are inside the material         |
| Feed X/Y, Feed Z | Speed of working moves and of moving down into the work            |
| Positioning      | Rapid moves (`G0`), or moves with a feed rate of their own (`G1`)  |

The tool follows the path with its centre. There is no compensation for the
tool radius; if you need exact outside or inside dimensions, export the
drawing and use a CAM program such as FreeCAD.

_Shorten positioning moves_ (per layer) joins paths whose ends meet,
reorders paths and starts closed paths at the nearest point. Switch it off
if the order or direction of your design matters.

## Preview

_Result preview_ draws every working move as wide as the tool, darker where
it is deeper. _Positioning moves_ shows the moves at safe Z as dashed lines.
It is a rough impression, not a simulation.

## G-code

The _G-code_ tab lists one program per tool with path lengths, estimated
time and the range it uses. Errors block the download:

- a move would leave the work area,
- safe Z or working Z do not fit the work area,
- the end position is below safe Z or outside the work area.

Warnings, e.g. work outside the workpiece, do not block it.

How a program runs:

1. The tool may stand anywhere in the work area. It first moves to safe Z,
   then to the start position.
2. It works through the layers in order.
3. It lifts to safe Z and stays there, or moves to the end position set
   under _Setup_, Z first.

There are no spindle commands; switch the router on before you start.
Run a new program with the tool well above the workpiece first.

## Projects and export

- _Save_ downloads the project as a `.cncd.json` file; _Open…_ reads it
  again. Projects exist only where you save them; nothing is kept on the
  server. The app warns before you leave with unsaved changes.
- _Export SVG_ saves the drawing in millimetres. Imported into FreeCAD,
  everything lies at the same coordinates as in the project.
