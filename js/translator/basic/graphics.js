// BASIC: QBasic graphics on the host canvas. The screen is a frame buffer
// (palette indices or RGB colors in the mode _NEWIMAGE(..., 32)); drawing
// goes to the buffer, the canvas gets it when a run or its step ends.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Basic = T.basic;
    if (Basic.Screen)
        return;

    var fail = Basic.fail;

    // SCREEN modes: size, number of colors, zoom on the canvas.
    var MODES = {
        1: { width: 320, height: 200, colors: 4, sx: 2, sy: 2 },
        2: { width: 640, height: 200, colors: 2, sx: 1, sy: 2 },
        7: { width: 320, height: 200, colors: 16, sx: 2, sy: 2 },
        8: { width: 640, height: 200, colors: 16, sx: 1, sy: 2 },
        9: { width: 640, height: 350, colors: 16, sx: 1, sy: 1 },
        11: { width: 640, height: 480, colors: 2, sx: 1, sy: 1 },
        12: { width: 640, height: 480, colors: 16, sx: 1, sy: 1 },
        13: { width: 320, height: 200, colors: 256, sx: 2, sy: 2 }
    };

    var EGA = [0x000000, 0x0000AA, 0x00AA00, 0x00AAAA, 0xAA0000, 0xAA00AA, 0xAA5500, 0xAAAAAA, 0x555555, 0x5555FF,
               0x55FF55, 0x55FFFF, 0xFF5555, 0xFF55FF, 0xFFFF55, 0xFFFFFF];

    // The default VGA palette (SCREEN 13): 16 EGA colors, grays, 9 rings
    // of 24 hues, 8 blacks.
    var VGA = EGA.concat([
        0x000000, 0x141414, 0x202020, 0x2D2D2D, 0x393939, 0x454545, 0x515151, 0x616161, 0x717171, 0x828282, 0x929292,
        0xA2A2A2, 0xB6B6B6, 0xCACACA, 0xE3E3E3, 0xFFFFFF
    ]);
    (function () {
        // A ring of hues from brightness steps: lo - no color, steps - the rise.
        function ring(lo, steps, hi) {
            var up = [lo].concat(steps).concat([hi]);
            var down = up.slice().reverse();
            var colors = [];
            var rgb = function (red, green, blue) { return (red << 16) | (green << 8) | blue; };
            var index;
            for (index = 0; index < 4; ++index)
                colors.push(rgb(up[index], lo, hi));
            for (index = 0; index < 4; ++index)
                colors.push(rgb(hi, lo, down[index]));
            for (index = 0; index < 4; ++index)
                colors.push(rgb(hi, up[index], lo));
            for (index = 0; index < 4; ++index)
                colors.push(rgb(down[index], hi, lo));
            for (index = 0; index < 4; ++index)
                colors.push(rgb(lo, hi, up[index]));
            for (index = 0; index < 4; ++index)
                colors.push(rgb(lo, down[index], hi));
            return colors;
        }
        var rings = [
            [0x00, [0x41, 0x7D, 0xBE], 0xFF], [0x7D, [0x9E, 0xBE, 0xDF], 0xFF], [0xB6, [0xC6, 0xDB, 0xEB], 0xFF],
            [0x00, [0x1C, 0x39, 0x55], 0x71], [0x39, [0x45, 0x55, 0x61], 0x71], [0x51, [0x59, 0x61, 0x69], 0x71],
            [0x00, [0x10, 0x20, 0x31], 0x41], [0x20, [0x28, 0x31, 0x39], 0x41], [0x2D, [0x31, 0x35, 0x3D], 0x41]
        ];
        rings.forEach(function (spec) { VGA = VGA.concat(ring(spec[0], spec[1], spec[2])); });
        for (var index = 0; index < 8; ++index)
            VGA.push(0);
    })();
    Basic.VGA_PALETTE = VGA;

    function defaultPalette(mode, colors) {
        if (colors === 256)
            return VGA.slice();
        if (colors === 16)
            return EGA.slice();
        if (colors === 4)
            return [0x000000, 0x00AAAA, 0xAA00AA, 0xAAAAAA];
        return [0x000000, 0xFFFFFF];
    }

    function Screen(rt, mode, width, height, colors) {
        var spec = MODES[mode] || { width: width, height: height, colors: colors, sx: 1, sy: 1 };
        this.rt = rt;
        this.mode = mode;
        this.width = spec.width;
        this.height = spec.height;
        this.colors = spec.colors;
        this.truecolor = spec.colors === 32;
        this.sx = spec.sx;
        this.sy = spec.sy;
        this.palette = this.truecolor ? null : defaultPalette(mode, spec.colors);
        this.pixels = new Uint32Array(this.width * this.height);
        this.foreground = this.truecolor ? 0xFFFFFFFF : (spec.colors === 256 ? 15 : spec.colors - 1);
        this.background = this.truecolor ? 0xFF000000 : 0;
        if (this.truecolor)
            this.pixels.fill(this.background);
        this.lastX = this.width / 2;
        this.lastY = this.height / 2;
        this.window = null;
        // DRAW: the color of the last figure, the scale and the rotation persist between DRAWs.
        this.drawColor = this.foreground;
        this.drawScale = 1;
        this.drawAngle = 0;
        this.dirty = { x0: 0, y0: 0, x1: this.width - 1, y1: this.height - 1 };
        this.context = null;
        this.image = null;
    }
    Basic.Screen = Screen;

    Screen.prototype.touch = function (x, y) {
        var dirty = this.dirty;
        if (dirty === null) {
            this.dirty = { x0: x, y0: y, x1: x, y1: y };
            return;
        }
        if (x < dirty.x0)
            dirty.x0 = x;
        if (x > dirty.x1)
            dirty.x1 = x;
        if (y < dirty.y0)
            dirty.y0 = y;
        if (y > dirty.y1)
            dirty.y1 = y;
    };

    Screen.prototype.touchAll = function () {
        this.dirty = { x0: 0, y0: 0, x1: this.width - 1, y1: this.height - 1 };
    };

    Screen.prototype.color = function (value) {
        if (this.truecolor)
            return value >>> 0;
        if (value < 0 || value >= this.colors)
            fail(5);
        return value;
    };

    // Coordinates: WINDOW mapping, then SINGLE and rounding half to even.
    Screen.prototype.mapX = function (x) {
        var window = this.window;
        if (window !== null)
            x = (x - window.x1) * (this.width - 1) / (window.x2 - window.x1);
        return Basic.roundEven(Math.fround(x));
    };
    Screen.prototype.mapY = function (y) {
        var window = this.window;
        if (window !== null)
            y = window.screen
                ? (y - window.y1) * (this.height - 1) / (window.y2 - window.y1)
                : (window.y2 - y) * (this.height - 1) / (window.y2 - window.y1);
        return Basic.roundEven(Math.fround(y));
    };

    // A screen point as floats (not rounded) and back to WINDOW coordinates.
    Screen.prototype.mapXf = function (x) {
        var window = this.window;
        return window === null ? x : (x - window.x1) * (this.width - 1) / (window.x2 - window.x1);
    };
    Screen.prototype.mapYf = function (y) {
        var window = this.window;
        if (window === null)
            return y;
        return window.screen
            ? (y - window.y1) * (this.height - 1) / (window.y2 - window.y1)
            : (window.y2 - y) * (this.height - 1) / (window.y2 - window.y1);
    };
    Screen.prototype.unmapX = function (x) {
        var window = this.window;
        return window === null ? x : window.x1 + x * (window.x2 - window.x1) / (this.width - 1);
    };
    Screen.prototype.unmapY = function (y) {
        var window = this.window;
        if (window === null)
            return y;
        return window.screen
            ? window.y1 + y * (window.y2 - window.y1) / (this.height - 1)
            : window.y2 - y * (window.y2 - window.y1) / (this.height - 1);
    };

    Screen.prototype.plot = function (x, y, color) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height)
            return;
        this.pixels[y * this.width + x] = color;
        this.touch(x, y);
    };

    // POINT(n): the last point - 0, 1 on the screen, 2, 3 in WINDOW coordinates.
    Screen.prototype.lastPoint = function (which) {
        switch (which) {
        case 0: return this.mapX(this.lastX);
        case 1: return this.mapY(this.lastY);
        case 2: return this.lastX;
        case 3: return this.lastY;
        }
        fail(5);
    };

    Screen.prototype.point = function (x, y) {
        var px = this.mapX(x), py = this.mapY(y);
        if (px < 0 || py < 0 || px >= this.width || py >= this.height)
            return -1;
        var value = this.pixels[py * this.width + px];
        return this.truecolor ? value | 0 : value;
    };

    // A point with STEP: relative to the last one.
    Screen.prototype.resolve = function (x, y, relative) {
        if (relative)
            return { x: this.lastX + x, y: this.lastY + y };
        return { x: x, y: y };
    };

    Screen.prototype.pset = function (x, y, relative, color, reset) {
        var position = this.resolve(x, y, relative);
        var colorValue = color === null ? (reset ? this.background : this.foreground) : this.color(color);
        if (!reset)
            this.drawColor = colorValue;
        this.plot(this.mapX(position.x), this.mapY(position.y), colorValue);
        this.lastX = position.x;
        this.lastY = position.y;
    };

    // A line: steps along the long axis, the other one as a SINGLE rounded,
    // as in QBasic (after QB64: qb32_line); style - 16 bits of the pattern,
    // the high bit first.
    Screen.prototype.segment = function (x1, y1, x2, y2, color, style) {
        var fround = Math.fround;
        var pattern = style === null ? 0xFFFF : style & 0xFFFF;
        var bits = (pattern + pattern * 65536) >>> 0;
        var lengthX = Math.abs(x1 - x2), lengthY = Math.abs(y1 - y2);
        var slope = 0, step = 0, offset, along;
        if (lengthX > lengthY) {
            along = fround(y1);
            if (lengthX !== 0) {
                slope = fround(fround(y2 - y1) / lengthX);
                step = x2 >= x1 ? 1 : -1;
            }
            for (offset = 0; offset <= lengthX; ++offset) {
                bits = ((bits << 1) | (bits >>> 31)) >>> 0;
                if (bits & 1)
                    this.plot(x1, Math.trunc(along < 0 ? fround(along - 0.5) : fround(along + 0.5)), color);
                x1 += step;
                along = fround(along + slope);
            }
        } else {
            along = fround(x1);
            if (lengthY !== 0) {
                slope = fround(fround(x2 - x1) / lengthY);
                step = y2 >= y1 ? 1 : -1;
            }
            for (offset = 0; offset <= lengthY; ++offset) {
                bits = ((bits << 1) | (bits >>> 31)) >>> 0;
                if (bits & 1)
                    this.plot(Math.trunc(along < 0 ? fround(along - 0.5) : fround(along + 0.5)), y1, color);
                y1 += step;
                along = fround(along + slope);
            }
        }
    };

    Screen.prototype.line = function (from, to, color, box, style) {
        var start = from !== null ? this.resolve(from.x, from.y, from.relative) : { x: this.lastX, y: this.lastY };
        var end = this.resolve(to.x, to.y, to.relative);
        var colorValue = color === null ? this.foreground : this.color(color);
        this.drawColor = colorValue;
        var x0 = this.mapX(start.x), y0 = this.mapY(start.y), x1 = this.mapX(end.x), y1 = this.mapY(end.y);
        var pattern = style === null ? null : style & 0xFFFF;
        if (box === 'bf') {
            var left = Math.max(0, Math.min(x0, x1)), right = Math.min(this.width - 1, Math.max(x0, x1));
            var top = Math.max(0, Math.min(y0, y1)), bottom = Math.min(this.height - 1, Math.max(y0, y1));
            for (var y = top; y <= bottom; ++y) {
                var row = y * this.width;
                for (var x = left; x <= right; ++x)
                    this.pixels[row + x] = colorValue;
            }
            if (left <= right && top <= bottom) {
                this.touch(left, top);
                this.touch(right, bottom);
            }
        } else if (box === 'b') {
            this.segment(x0, y0, x1, y0, colorValue, pattern);
            this.segment(x1, y0, x1, y1, colorValue, pattern);
            this.segment(x1, y1, x0, y1, colorValue, pattern);
            this.segment(x0, y1, x0, y0, colorValue, pattern);
        } else {
            this.segment(x0, y0, x1, y1, colorValue, pattern);
        }
        this.lastX = end.x;
        this.lastY = end.y;
    };

    // The default aspect of CIRCLE: 4/3 of the screen aspect of QBasic.
    var ASPECTS = { 1: 200 / 320, 2: 200 / 640, 7: 200 / 320, 8: 200 / 640, 9: 350 / 640, 11: 480 / 640,
                    12: 480 / 640, 13: 200 / 320 };

    // CIRCLE: an ellipse (aspect), an arc from start to end (radians; a
    // negative angle also draws a radius to the center; end < start - the
    // arc "outside"). The points are as in QBasic (after QB64: sub_circle).
    Screen.prototype.circle = function (center, radius, color, start, end, aspect) {
        var PI = 3.1415926535897932, PI2 = 6.2831853071795865;
        var position = this.resolve(center.x, center.y, center.relative);
        var colorValue = color === null ? this.foreground : this.color(color);
        this.drawColor = colorValue;
        this.lastX = position.x;
        this.lastY = position.y;
        if (start === null)
            start = 0;
        if (end === null)
            end = PI2;
        var lineToStart = false, lineFromEnd = false;
        if (start < 0 || (start === 0 && 1 / start < 0)) {
            lineToStart = true;
            start = -start;
        }
        if (end < 0 || (end === 0 && 1 / end < 0)) {
            lineFromEnd = true;
            end = -end;
        }
        if (start > PI2 || end > PI2)
            fail(5);
        var exclusive = false;
        if (end < start) {
            var swap = start;
            start = end;
            end = swap;
            var swapLine = lineToStart;
            lineToStart = lineFromEnd;
            lineFromEnd = swapLine;
            exclusive = true;
        }
        var x = position.x, y = position.y, rimX = x + radius;
        if (this.window !== null) {
            var window = this.window;
            var scale = (this.width - 1) / (window.x2 - window.x1);
            x = (x - window.x1) * scale;
            y = window.screen
                ? (y - window.y1) * (this.height - 1) / (window.y2 - window.y1)
                : (window.y2 - y) * (this.height - 1) / (window.y2 - window.y1);
            rimX = (rimX - window.x1) * scale;
        }
        var ix = x < 0 ? Math.trunc(x - 0.5) : Math.trunc(x + 0.5);
        var iy = y < 0 ? Math.trunc(y - 0.5) : Math.trunc(y + 0.5);
        var pixelRadius = Math.abs(rimX - x);
        var xspan = pixelRadius, yspan = pixelRadius;
        if (aspect === null)
            aspect = ASPECTS[this.mode] !== undefined ? 4 * ASPECTS[this.mode] / 3 : 1;
        if (aspect >= 0) {
            if (aspect < 1)
                yspan *= aspect;
            if (aspect > 1)
                xspan /= aspect;
        } else if (aspect > -1) {
            yspan *= 1 + aspect;
        }
        var self = this;
        var plot = function (px, py) {
            self.plot(px, py, colorValue);
        };
        var pixels = Math.trunc(PI2 * pixelRadius / 4 + 0.5);
        var arc1 = 0, arc2 = PI, arc3 = PI, arc4 = PI2;
        var arcinc = (PI / 2) / pixels;
        var sinb = Math.sin(arcinc), cosb = Math.cos(arcinc);
        var lastPlottedX = -1, lastPlottedY = 0, lastCheckedX = -1, lastCheckedY = 0;
        if (lineToStart) {
            this.segment(ix, iy, ix + Math.trunc(Math.cos(start) * xspan + 0.5),
                         iy - Math.trunc(Math.sin(start) * yspan - 0.5), colorValue, null);
        }
        var px = 1, py = 0, step = 0, forced = false;
        var inside = function (arc) {
            return exclusive ? (arc <= start || arc >= end) : (arc >= start && arc <= end);
        };
        for (;;) {
            var x2 = Math.trunc(px * xspan + 0.5);
            var y2 = Math.trunc(py * yspan - 0.5);
            var draw;
            if (forced) {
                draw = true;
            } else if (step === 0) {
                lastCheckedX = x2;
                lastCheckedY = y2;
                draw = true;
            } else {
                draw = Math.abs(x2 - lastPlottedX) >= 2 || Math.abs(y2 - lastPlottedY) >= 2;
            }
            if (draw) {
                if (inside(arc1))
                    plot(ix + lastCheckedX, iy + lastCheckedY);
                if (inside(arc2))
                    plot(ix - lastCheckedX, iy + lastCheckedY);
                if (inside(arc3))
                    plot(ix - lastCheckedX, iy - lastCheckedY);
                if (inside(arc4))
                    plot(ix + lastCheckedX, iy - lastCheckedY);
                if (step > pixels)
                    break;
                lastPlottedX = lastCheckedX;
                lastPlottedY = lastCheckedY;
            }
            lastCheckedX = x2;
            lastCheckedY = y2;
            if (step > pixels)
                break;
            ++step;
            if (step > pixels) {
                // The last point at once, without a step.
                forced = true;
                continue;
            }
            var next = px * cosb + py * sinb;
            py = py * cosb - px * sinb;
            px = next;
            arc1 += arcinc;
            arc2 -= arcinc;
            arc3 += arcinc;
            arc4 -= arcinc;
        }
        if (lineFromEnd) {
            this.segment(ix, iy, ix + Math.trunc(Math.cos(end) * xspan + 0.5),
                         iy - Math.trunc(Math.sin(end) * yspan - 0.5), colorValue, null);
        }
    };

    // PAINT: fills up to the border color (by default the fill color).
    Screen.prototype.paint = function (point, color, border) {
        var position = this.resolve(point.x, point.y, point.relative);
        var fill = color === null ? this.foreground : this.color(color);
        var edge = border === null ? fill : this.color(border);
        this.lastX = position.x;
        this.lastY = position.y;
        this.drawColor = fill;
        this.paintAt(this.mapX(position.x), this.mapY(position.y), fill, edge);
    };

    Screen.prototype.paintAt = function (x, y, fill, edge) {
        var width = this.width, height = this.height, pixels = this.pixels;
        if (x < 0 || y < 0 || x >= width || y >= height)
            return;
        var stack = [x, y];
        while (stack.length > 0) {
            var sy = stack.pop(), sx = stack.pop();
            var row = sy * width;
            if (pixels[row + sx] === edge || pixels[row + sx] === fill)
                continue;
            var left = sx, right = sx;
            while (left > 0 && pixels[row + left - 1] !== edge && pixels[row + left - 1] !== fill)
                --left;
            while (right < width - 1 && pixels[row + right + 1] !== edge && pixels[row + right + 1] !== fill)
                ++right;
            for (var column = left; column <= right; ++column)
                pixels[row + column] = fill;
            this.touch(left, sy);
            this.touch(right, sy);
            for (var dir = -1; dir <= 1; dir += 2) {
                var ny = sy + dir;
                if (ny < 0 || ny >= height)
                    continue;
                var nrow = ny * width;
                var inside = false;
                for (var nx = left; nx <= right; ++nx) {
                    var value = pixels[nrow + nx];
                    var open = value !== edge && value !== fill;
                    if (open && !inside) {
                        stack.push(nx, ny);
                        inside = true;
                    } else if (!open) {
                        inside = false;
                    }
                }
            }
        }
    };

    Screen.prototype.clear = function () {
        this.pixels.fill(this.background);
        this.lastX = this.width / 2;
        this.lastY = this.height / 2;
        this.touchAll();
    };

    Screen.prototype.setColor = function (foreground, background) {
        if (foreground !== null)
            this.foreground = this.drawColor = this.color(foreground);
        if (background !== null)
            this.background = this.color(background);
    };

    // PALETTE index, color: in the VGA modes color = 65536 * blue + 256 *
    // green + red (each 0..63).
    Screen.prototype.setPalette = function (attribute, value) {
        if (this.truecolor)
            fail(5);
        if (attribute === null) {
            this.palette = defaultPalette(this.mode, this.colors);
        } else {
            if (attribute < 0 || attribute >= this.palette.length)
                fail(5);
            var scale = function (component) { return Math.round((component & 63) * 255 / 63); };
            this.palette[attribute] = (scale(value) << 16) | (scale(value >> 8) << 8) | scale(value >> 16);
        }
        this.touchAll();
    };

    Screen.prototype.setWindow = function (screen, x1, y1, x2, y2) {
        if (x1 === null) {
            this.window = null;
            return;
        }
        if (x1 === x2 || y1 === y2)
            fail(5);
        this.window = { screen: screen, x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2),
                        y2: Math.max(y1, y2) };
    };

    // DRAW (after QB64: sub_draw): U D L R E F G H [n], M x,y (M+x,-y is
    // relative), the prefixes B (move without drawing) and N (return), C
    // color, S scale (4 is a pixel), A n - rotation by n * 90°, TA angle, P
    // fill, border. Horizontal steps are corrected for the 4:3 screen.
    Screen.prototype.draw = function (commands) {
        var text = commands;
        var length = text.length;
        var index = 0;
        var self = this;
        var stretch = ASPECTS[this.mode] !== undefined ? 4 / ((3 / this.height) * this.width) : 1;
        var inverseStretch = 1 / stretch;
        var vx, vy, hx, hy, ex, ey, fx, fy;
        var vectors = function () {
            vx = 0; vy = -1; ex = stretch; ey = -1; hx = stretch; hy = 0; fx = stretch; fy = 1;
            if (self.drawAngle) {
                var radians = self.drawAngle * 0.0174532925199433;
                var sin = Math.sin(radians), cos = Math.cos(radians);
                var rotate = function (x, y) { return [x * cos + y * sin, y * cos - x * sin]; };
                var turned = rotate(vx, vy); vx = turned[0]; vy = turned[1];
                turned = rotate(hx, hy); hx = turned[0]; hy = turned[1];
                turned = rotate(ex, ey); ex = turned[0]; ey = turned[1];
                turned = rotate(fx, fy); fx = turned[0]; fy = turned[1];
            }
        };
        vectors();
        var px = this.mapXf(this.lastX), py = this.mapYf(this.lastY);
        var color = this.drawColor;
        var blank = false, back = false;
        // A number: digits, a point, a sign in front; undefined - no number.
        var number = function () {
            var value = 0, sign = 1, seen = false, point = false, scale = 0.1;
            for (;;) {
                if (index >= length)
                    break;
                var ch = text.charAt(index);
                if (ch === ' ' || ch === '\t') {
                    ++index;
                    continue;
                }
                if (ch >= '0' && ch <= '9') {
                    if (point) {
                        value += Number(ch) * scale;
                        scale /= 10;
                    } else {
                        value = value * 10 + Number(ch);
                    }
                    seen = true;
                    ++index;
                    continue;
                }
                if ((ch === '-' || ch === '+') && !seen && !point) {
                    if (ch === '-')
                        sign = -sign;
                    ++index;
                    continue;
                }
                if (ch === '.' && !point) {
                    point = true;
                    ++index;
                    continue;
                }
                break;
            }
            return seen ? value * sign : undefined;
        };
        var required = function () {
            var value = number();
            if (value === undefined)
                fail(5);
            return value;
        };
        var integer = function () {
            var value = required();
            if (value !== Math.trunc(value))
                fail(5);
            return value;
        };
        var moveTo = function (x2, y2) {
            if (!blank)
                self.segment(Basic.roundEven(px), Basic.roundEven(py), Basic.roundEven(x2), Basic.roundEven(y2), color, null);
            if (!back) {
                px = x2;
                py = y2;
            }
            blank = back = false;
        };
        var DIRECTIONS = { U: 1, D: -1, L: -2, R: 2, E: 3, F: 4, G: -3, H: -4 };
        while (index < length) {
            var command = text.charAt(index).toUpperCase();
            ++index;
            if (command === ' ' || command === '\t' || command === ';')
                continue;
            if (DIRECTIONS[command] !== undefined) {
                var which = DIRECTIONS[command];
                var sign = which < 0 ? -1 : 1;
                var kind = Math.abs(which);
                var xx = kind === 1 ? vx : kind === 2 ? hx : kind === 3 ? ex : fx;
                var yy = kind === 1 ? vy : kind === 2 ? hy : kind === 3 ? ey : fy;
                var steps = number();
                if (steps === undefined)
                    steps = 1;
                xx *= sign * steps * inverseStretch;
                yy *= sign * steps;
                moveTo(px + xx * this.drawScale, py + yy * this.drawScale);
                continue;
            }
            switch (command) {
            case 'B':
                blank = true;
                break;
            case 'N':
                back = true;
                break;
            case 'M': {
                while (text.charAt(index) === ' ' || text.charAt(index) === '\t')
                    ++index;
                var relative = text.charAt(index) === '+' || text.charAt(index) === '-';
                var x2 = required();
                if (text.charAt(index) !== ',')
                    fail(5);
                ++index;
                var y2 = required();
                if (relative) {
                    var mx = (x2 * inverseStretch) * hx - (y2 * inverseStretch) * vx;
                    var my = x2 * hy - y2 * vy;
                    x2 = px + mx * this.drawScale;
                    y2 = py + my * this.drawScale;
                }
                moveTo(x2, y2);
                break;
            }
            case 'C':
                color = this.color(integer());
                this.drawColor = color;
                break;
            case 'S': {
                var scale = required();
                if (scale < 0)
                    fail(5);
                this.drawScale = scale / 4;
                break;
            }
            case 'A': {
                var quarter = required();
                if (quarter !== 0 && quarter !== 1 && quarter !== 2 && quarter !== 3)
                    fail(5);
                this.drawAngle = quarter * 90;
                vectors();
                break;
            }
            case 'T':
                while (text.charAt(index) === ' ' || text.charAt(index) === '\t')
                    ++index;
                if (text.charAt(index).toUpperCase() !== 'A')
                    fail(5);
                ++index;
                this.drawAngle = required();
                vectors();
                break;
            case 'P': {
                var fill = integer();
                if (text.charAt(index) !== ',')
                    fail(5);
                ++index;
                var edge = integer();
                this.paintAt(Basic.roundEven(px), Basic.roundEven(py), this.color(fill), this.color(edge));
                break;
            }
            default:
                fail(5);
            }
        }
        this.lastX = this.unmapX(px);
        this.lastY = this.unmapY(py);
    };

    // --- Output to the canvas

    Screen.prototype.attach = function () {
        var canvas = this.rt.env.canvas();
        if (canvas === undefined || canvas === null)
            return;
        canvas.width = this.width * this.sx;
        canvas.height = this.height * this.sy;
        this.context = canvas.getContext('2d');
        this.canvas = canvas;
        this.touchAll();
    };

    Screen.prototype.present = function () {
        var dirty = this.dirty;
        if (dirty === null || this.context === null)
            return;
        this.dirty = null;
        var sx = this.sx, sy = this.sy;
        var frameWidth = dirty.x1 - dirty.x0 + 1, frameHeight = dirty.y1 - dirty.y0 + 1;
        // Writing into image data is the most expensive part (every element
        // is a Qt call), so the frame keeps its own size and drawImage
        // scales it (the pixels stay sharp).
        var image = this.context.createImageData(frameWidth, frameHeight);
        var data = image.data;
        var palette = this.palette, pixels = this.pixels, width = this.width;
        var out = 0;
        for (var y = dirty.y0; y <= dirty.y1; ++y) {
            var row = y * width;
            for (var x = dirty.x0; x <= dirty.x1; ++x) {
                var value = pixels[row + x];
                var rgb = palette !== null ? palette[value] : value;
                data[out++] = (rgb >> 16) & 255;
                data[out++] = (rgb >> 8) & 255;
                data[out++] = rgb & 255;
                data[out++] = 255;
            }
        }
        if (sx === 1 && sy === 1) {
            // Qt 6.4: putImageData with three arguments draws nothing - with a region it does.
            this.context.putImageData(image, dirty.x0, dirty.y0, 0, 0, frameWidth, frameHeight);
        } else {
            this.context.drawImage(image, dirty.x0 * sx, dirty.y0 * sy, frameWidth * sx, frameHeight * sy);
        }
        if (typeof this.canvas.requestPaint === 'function')
            this.canvas.requestPaint();
    };

    // --- Commands for the translated code

    var Runtime = Basic.Runtime;

    Runtime.prototype.screen = function (mode) {
        if (mode === 0) {
            this.graphics = null;
            return;
        }
        if (MODES[mode] === undefined)
            fail(5);
        this.graphics = new Screen(this, mode);
        this.graphics.attach();
    };

    // SCREEN _NEWIMAGE(width, height, mode): mode 32 - RGB colors, 256 and
    // 13 - the VGA palette, 12 and others - 16 colors.
    Runtime.prototype.newImage = function (width, height, mode) {
        if (width < 1 || height < 1 || width > 4096 || height > 4096)
            fail(5);
        return { width: width, height: height, mode: mode };
    };

    Runtime.prototype.screenImage = function (image) {
        if (typeof image === 'number') {
            this.screen(image);
            return;
        }
        var colors = image.mode === 32 ? 32 : (image.mode === 256 || image.mode === 13 ? 256 : 16);
        this.graphics = new Screen(this, 'image', image.width, image.height, colors);
        this.graphics.attach();
    };

    Runtime.prototype.g = function () {
        if (this.graphics === null)
            fail(5);
        return this.graphics;
    };

    Runtime.prototype.colorStatement = function (foreground, background) {
        if (this.graphics !== null)
            this.graphics.setColor(foreground, background);
    };

    Runtime.prototype.rgb = function (red, green, blue, truecolor) {
        var clamp = function (value) { return Math.max(0, Math.min(255, Math.round(value))); };
        var value = (0xFF000000 | (clamp(red) << 16) | (clamp(green) << 8) | clamp(blue)) >>> 0;
        if (truecolor || this.graphics === null || this.graphics.truecolor)
            return value;
        // The nearest palette color.
        var palette = this.graphics.palette;
        var best = 0, bestDistance = Infinity;
        for (var index = 0; index < palette.length; ++index) {
            var entry = palette[index];
            var redDelta = ((entry >> 16) & 255) - clamp(red);
            var greenDelta = ((entry >> 8) & 255) - clamp(green);
            var blueDelta = (entry & 255) - clamp(blue);
            var distance = redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta;
            if (distance < bestDistance) {
                bestDistance = distance;
                best = index;
            }
        }
        return best;
    };

    Runtime.prototype.screenSize = function (height) {
        var screen = this.graphics;
        if (screen === null)
            return height ? 25 : 80;
        return height ? screen.height : screen.width;
    };
})(globalThis);
