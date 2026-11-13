; CNC-Designer 0.1.0
; Program: Sample: Quadrat fuer Juergen
; Tool: 2 mm end mill
;
; The zero point is set by hand at the machine; this program does not
; change it. Z = 0 is the workpiece surface, positive Z is above it.
; The tool may stand anywhere inside the work area at program start.
;
; Work area (allowed): X -200.000 .. 200.000  Y -200.000 .. 200.000  Z -10.000 .. 90.000
; Used by this program: X -50.000 .. 50.000  Y -50.000 .. 50.000  Z -2.000 .. 5.000
; Safe Z: 5.000
; Path length: 913.1 mm working, 39.1 mm positioning
; Estimated time: 0:01:36 (h:mm:ss, without acceleration)

G21 ; millimetres
G90 ; absolute coordinates
G94 ; feed rate in mm/min
G17 ; XY plane

; --- Square ---
G0 Z5.000
G0 X-50.000 Y-50.000
G1 Z-1.000 F200
G1 X50.000 F600
G1 Y50.000
G1 X-50.000
G1 Y-50.000
G1 Z-2.000 F200
G1 X50.000 F600
G1 Y50.000
G1 X-50.000
G1 Y-50.000
G0 Z5.000

; --- Diagonal ---
G0 X-40.000 Y-40.000
G1 Z-0.500 F200
G1 X40.000 Y40.000 F600
G0 Z5.000

; --- End of program ---
