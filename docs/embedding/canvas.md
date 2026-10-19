# Graphics

Programs draw on a canvas object that looks like an HTML canvas: `width`,
`height` and `getContext("2d")`. The application gives one through
`Host::canvas` (BASIC `SCREEN`, Pascal `Graph`) and, if it wants, to other
languages through a host module or a global variable.

## ImageCanvas

The target `V4Script::ImageCanvas` (option `V4SCRIPT_BUILD_CANVAS`, links
Qt Gui) draws into a `QImage`:

```cpp
#include <v4script/ImageCanvas.hpp>

v4script::ImageCanvas canvas; // outlives the runtime that keeps the callback
v4script::Runtime runtime;
runtime.setCanvas([&canvas, &runtime]() { return canvas.jsValue(runtime.jsEngine()); });
// Other languages and JavaScript reach it through a global variable:
runtime.jsEngine()->globalObject().setProperty("canvas", canvas.jsValue(runtime.jsEngine()));

runtime.run("basic", "SCREEN 13: CIRCLE (160, 100), 50, 14");
canvas.image().save("circle.png");
```

 - `jsValue(engine)` gives the same canvas object on every call for an
   engine; after `Runtime::reset()` call it again for the new engine.
 - The canvas starts at 300 × 150 pixels, as an HTML canvas; a new size
   (`width`, `height`, `resize`) clears the picture. `image()` is
   transparent where nothing was drawn.
 - `changed()` is emitted when something was drawn (a view may repaint),
   `resized()` when the size changes.
 - Text is drawn with Qt fonts, so the application needs a
   `QGuiApplication`; on a server without a display use
   `QT_QPA_PLATFORM=offscreen` (see [examples/canvas](../../examples/canvas)).

The 2D context supports:

| Group | Members |
| --- | --- |
| State | `fillStyle`, `strokeStyle`, `lineWidth`, `lineCap`, `lineJoin`, `globalAlpha`, `font`, `textAlign`, `textBaseline`, `save()`, `restore()` |
| Rectangles | `fillRect`, `strokeRect`, `clearRect` |
| Paths | `beginPath`, `moveTo`, `lineTo`, `rect`, `arc`, `quadraticCurveTo`, `bezierCurveTo`, `closePath`, `fill`, `stroke` |
| Text | `fillText`, `strokeText`, `measureText` (`width`) |
| Pixels | `createImageData`, `getImageData`, `putImageData` (with an optional dirty region), `drawImage` (an `ImageData` or another `ImageCanvas`, with an optional target size) |

Colors are CSS names, `#rgb`, `#rrggbb`, `rgb()` and `rgba()` (no
gradients, patterns, transforms or clipping).

## A Qt Quick Canvas

A QML `Canvas` item works as the host canvas too: return the item wrapped
by the engine that runs the programs (with `Engine` on the application's
`QQmlEngine`). The graphics of BASIC and Pascal use only `width`, `height`,
`getContext("2d")`, `createImageData`, `putImageData` with a dirty region,
`drawImage` of image data, and call `requestPaint()` when the canvas has
it. In Qt 6.4 `putImageData(image, x, y)` with three arguments draws
nothing on a Qt Quick canvas; v4script always passes the region.

## How BASIC and Pascal draw

BASIC (`SCREEN`) and Pascal (`InitGraph`) keep their own frame buffer and
put the changed region on the canvas when a run ends, before a wait
(`SLEEP`, `_LIMIT`, `Delay`) and at `_DISPLAY`. They set the size of the
canvas to the size of the screen (BASIC doubles the small modes, e.g.
`SCREEN 13` is 640 × 400 on the canvas). Without a host canvas they still
run and `POINT`/`GetPixel` read the frame buffer, but nothing is shown.
