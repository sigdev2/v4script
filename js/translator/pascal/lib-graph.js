// Pascal: the Graph unit (BGI) on the canvas of the host. Drawing goes to
// a frame buffer of palette indices (or of colors in the direct color
// modes); the canvas gets it at the end of a run and of each of its steps
// (Delay). The drawing algorithms are our own; their results follow the
// Graph unit of Free Pascal 3.2.2 closely, the known differences are in
// docs/internals/pascal.md. Text uses the 8x8 font of QB64-PE; stroked
// fonts (.CHR) are not available.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    Pascal.libraryUnits = Pascal.libraryUnits || Object.create(null);
    if (Pascal.libraryUnits.graph)
        return;

    // The 8x8 font of QB64-PE (MIT, see THIRD_PARTY_NOTICES.md): the 256
    // characters of code page 437, eight rows each, the high bit on the left.
    var FONT_HEX = 
        '00000000000000007e81a581bd99817e7effdbffc3e7ff7e6cfefefe7c38100010387cfe7c381000387c38fefe7c387c1010387cfe7c387c' +
        '0000183c3c180000ffffe7c3c3e7ffff003c664242663c00ffc399bdbd99c3ff0f070f7dcccccc783c6666663c187e183f333f303070f0e0' +
        '7f637f636367e6c0995a3ce7e73c5a9980e0f8fef8e08000020e3efe3e0e0200183c7e18187e3c1866666666660066007fdbdb7b1b1b1b00' +
        '3e63386c6c38cc78000000007e7e7e00183c7e187e3c18ff183c7e1818181800181818187e3c180000180cfe0c180000003060fe60300000' +
        '0000c0c0c0fe0000002466ff6624000000183c7effff000000ffff7e3c180000000000000000000030787830300030006c6c6c0000000000' +
        '6c6cfe6cfe6c6c00307cc0780cf8300000c6cc183066c600386c3876dccc76006060c0000000000018306060603018006030181818306000' +
        '00663cff3c660000003030fc303000000000000000303060000000fc000000000000000000303000060c183060c080007cc6cedef6e67c00' +
        '307030303030fc0078cc0c3860ccfc0078cc0c380ccc78001c3c6cccfe0c1e00fcc0f80c0ccc78003860c0f8cccc7800fccc0c1830303000' +
        '78cccc78cccc780078cccc7c0c18700000303000003030000030300000303060183060c0603018000000fc0000fc00006030180c18306000' +
        '78cc0c18300030007cc6dededec078003078ccccfccccc00fc66667c6666fc003c66c0c0c0663c00f86c6666666cf800fe6268786862fe00' +
        'fe6268786860f0003c66c0c0ce663e00ccccccfccccccc0078303030303078001e0c0c0ccccc7800e6666c786c66e600f06060606266fe00' +
        'c6eefefed6c6c600c6e6f6decec6c600386cc6c6c66c3800fc66667c6060f00078ccccccdc781c00fc66667c6c66e60078cce0701ccc7800' +
        'fcb4303030307800ccccccccccccfc00cccccccccc783000c6c6c6d6feeec600c6c66c38386cc600cccccc7830307800fec68c183266fe00' +
        '7860606060607800c06030180c060200781818181818780010386cc60000000000000000000000ff30301800000000000000780c7ccc7600' +
        'e060607c6666dc00000078ccc0cc78001c0c0c7ccccc7600000078ccfcc07800386c60f06060f000000076cccc7c0cf8e0606c766666e600' +
        '30007030303078000c000c0c0ccccc78e060666c786ce60070303030303078000000ccfefed6c6000000f8cccccccc00000078cccccc7800' +
        '0000dc66667c60f0000076cccc7c0c1e0000dc766660f00000007cc0780cf80010307c30303418000000cccccccc76000000cccccc783000' +
        '0000c6d6fefe6c000000c66c386cc6000000cccccc7c0cf80000fc983064fc001c3030e030301c001818180018181800e030301c3030e000' +
        '76dc0000000000000010386cc6c6fe0078ccc0cc78180c7800cc00cccccc7e001c0078ccfcc078007ec33c063e663f00cc00780c7ccc7e00' +
        'e000780c7ccc7e003030780c7ccc7e00000078c0c0780c387ec33c667e603c00cc0078ccfcc07800e00078ccfcc07800cc00703030307800' +
        '7cc6381818183c00e000703030307800c6386cc6fec6c60030300078ccfccc001c00fc607860fc0000007f0c7fcc7f003e6cccfeccccce00' +
        '78cc0078cccc780000cc0078cccc780000e00078cccc780078cc00cccccc7e0000e000cccccc7e0000cc00cccc7c0cf8c3183c66663c1800' +
        'cc00cccccccc780018187ec0c07e1818386c64f060e6fc00cccc78fc30fc3030f8ccccfac6cfc6c70e1b183c1818d8701c00780c7ccc7e00' +
        '3800703030307800001c0078cccc7800001c00cccccc7e0000f800f8cccccc00fc00ccecfcdccc003c6c6c3e007e0000386c6c38007c0000' +
        '30003060c0cc7800000000fcc0c00000000000fc0c0c0000c3c6ccde3366cc0fc3c6ccdb376fcf031818001818181800003366cc66330000' +
        '00cc663366cc0000228822882288228855aa55aa55aa55aadb77dbeedb77dbee181818181818181818181818f81818181818f818f8181818' +
        '36363636f636363600000000fe3636360000f818f81818183636f606f636363636363636363636360000fe06f63636363636f606fe000000' +
        '36363636fe0000001818f818f800000000000000f8181818181818181f00000018181818ff00000000000000ff181818181818181f181818' +
        '00000000ff00000018181818ff18181818181f181f1818183636363637363636363637303f00000000003f30373636363636f700ff000000' +
        '0000ff00f736363636363730373636360000ff00ff0000003636f700f73636361818ff00ff00000036363636ff0000000000ff00ff181818' +
        '00000000ff363636363636363f00000018181f181f00000000001f181f181818000000003f36363636363636ff3636361818ff18ff181818' +
        '18181818f8000000000000001f181818ffffffffffffffff00000000fffffffff0f0f0f0f0f0f0f00f0f0f0f0f0f0f0fffffffff00000000' +
        '000076dcc8dc76000078ccf8ccf8c0c000fcccc0c0c0c00000fe6c6c6c6c6c00fccc603060ccfc0000007ed8d8d8700000666666667c60c0' +
        '0076dc1818181800fc3078cccc7830fc386cc6fec66c3800386cc6c66c6cee001c30187ccccc780000007edbdb7e0000060c7edbdb7e60c0' +
        '3860c0f8c060380078cccccccccccc0000fc00fc00fc00003030fc303000fc00603018306000fc00183060301800fc000e1b1b1818181818' +
        '1818181818d8d870303000fc003030000076dc0076dc0000386c6c3800000000000000181800000000000000180000000f0c0c0cec6c3c1c' +
        '786c6c6c6c000000701830607800000000003c3c3c3c00000000000000000000';
    var FONT = [];
    for (var at = 0; at < FONT_HEX.length; at += 2)
        FONT.push(parseInt(FONT_HEX.substr(at, 2), 16));

    // The default VGA palette in the levels of its DAC (0..63): the 16 EGA
    // colors, 16 grays, nine rings of 24 hues (three brightnesses by three
    // saturations) and 8 blacks. Graph shows a level times 4.
    var EGA_LEVELS = [
        [0, 0, 0], [0, 0, 42], [0, 42, 0], [0, 42, 42], [42, 0, 0], [42, 0, 42], [42, 21, 0], [42, 42, 42],
        [21, 21, 21], [21, 21, 63], [21, 63, 21], [21, 63, 63], [63, 21, 21], [63, 21, 63], [63, 63, 21], [63, 63, 63]
    ];
    var GRAY_LEVELS = [0, 5, 8, 11, 14, 17, 20, 24, 28, 32, 36, 40, 45, 50, 56, 63];
    // A ring: the lowest level, three steps and the highest.
    var RINGS = [
        [0, 16, 31, 47, 63], [31, 39, 47, 55, 63], [45, 49, 54, 58, 63],
        [0, 7, 14, 21, 28], [14, 17, 21, 24, 28], [20, 22, 24, 26, 28],
        [0, 4, 8, 12, 16], [8, 10, 12, 14, 16], [11, 12, 13, 15, 16]
    ];

    function rgbOfLevels(red, green, blue) {
        return (red * 4 << 16) | (green * 4 << 8) | (blue * 4);
    }

    var DEFAULT_PALETTE = (function () {
        var palette = EGA_LEVELS.map(function (levels) { return rgbOfLevels(levels[0], levels[1], levels[2]); });
        GRAY_LEVELS.forEach(function (level) { palette.push(rgbOfLevels(level, level, level)); });
        RINGS.forEach(function (ring) {
            var lo = ring[0], hi = ring[4];
            var up = ring.slice(0, 4), down = [hi, ring[3], ring[2], ring[1]];
            var index;
            // Blue to magenta, to red, to yellow, to green, to cyan, to blue.
            for (index = 0; index < 4; ++index)
                palette.push(rgbOfLevels(up[index], lo, hi));
            for (index = 0; index < 4; ++index)
                palette.push(rgbOfLevels(hi, lo, down[index]));
            for (index = 0; index < 4; ++index)
                palette.push(rgbOfLevels(hi, up[index], lo));
            for (index = 0; index < 4; ++index)
                palette.push(rgbOfLevels(down[index], hi, lo));
            for (index = 0; index < 4; ++index)
                palette.push(rgbOfLevels(lo, hi, up[index]));
            for (index = 0; index < 4; ++index)
                palette.push(rgbOfLevels(lo, down[index], hi));
        });
        while (palette.length < 256)
            palette.push(0);
        return palette;
    })();

    // The 8x8 patterns of EmptyFill ... CloseDotFill; UserFill is set by
    // SetFillPattern.
    var FILL_PATTERNS = [
        [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
        [0xff, 0xff, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00], [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80],
        [0x07, 0x0e, 0x1c, 0x38, 0x70, 0xe0, 0xc1, 0x83], [0x07, 0x83, 0xc1, 0xe0, 0x70, 0x38, 0x1c, 0x0e],
        [0x5a, 0x2d, 0x96, 0x4b, 0xa5, 0xd2, 0x69, 0xb4], [0xff, 0x88, 0x88, 0x88, 0xff, 0x88, 0x88, 0x88],
        [0x18, 0x24, 0x42, 0x81, 0x81, 0x42, 0x24, 0x18], [0xcc, 0x33, 0xcc, 0x33, 0xcc, 0x33, 0xcc, 0x33],
        [0x80, 0x00, 0x08, 0x00, 0x80, 0x00, 0x08, 0x00], [0x88, 0x00, 0x22, 0x00, 0x88, 0x00, 0x22, 0x00]
    ];
    var USER_FILL = 12;
    // The 16-pixel patterns of SolidLn, DottedLn, CenterLn and DashedLn
    // (the first pixel is the high bit); UserBitLn takes its own.
    var LINE_PATTERNS = [0xffff, 0xcccc, 0xfc78, 0xf8f8];
    var USER_BIT_LN = 4;

    var WRITE_COPY = 0, WRITE_XOR = 1, WRITE_OR = 2, WRITE_AND = 3, WRITE_NOT = 4;

    // The modes of the VGA driver: width, height, x aspect, name.
    var VGA_MODES = [[640, 200, 4500, 'EGA'], [640, 350, 7750, 'EGA'], [640, 480, 10000, 'VGA']];
    var VGA = 9, DETECT = 0;
    // The resolutions of the modes m320x200 (30001) ... m2048x1536 (30015).
    var RESOLUTIONS = [[320, 200], [320, 256], [320, 400], [512, 384], [640, 200], [640, 256], [640, 350], [640, 400],
                       [640, 480], [800, 600], [832, 624], [1024, 768], [1280, 1024], [1600, 1200], [2048, 1536]];
    var FIRST_RESOLUTION = 30001;
    // The colors of the drivers D1bit (11) ... D32bit (20).
    var DEPTHS = { 11: 2, 12: 4, 13: 16, 14: 64, 15: 256, 16: 4096, 17: 32768, 18: 65536, 19: 16777216, 20: 16777216 };

    var GR_ERROR = -11, GR_INVALID_MODE = -10, GR_FONT_NOT_FOUND = -8, GR_INVALID_FONT_NUM = -14;
    var ERROR_MESSAGES = {
        '-1': 'Graphics driver not installed', '-2': 'Graphics hardware not detected',
        '-5': 'Not enough memory for graphics', '-6': 'Not enough memory for graphics',
        '-7': 'Not enough memory for graphics', '-8': 'Font file not found', '-9': 'Not enough memory to load font',
        '-10': 'Invalid graphics mode', '-11': 'Graphics error', '-12': 'Graphics I/O error', '-13': 'Invalid font',
        '-14': 'Invalid font', '-18': 'Invalid driver version'
    };

    // Angles of arcs: Free Pascal takes them modulo 361.
    var ANGLE_MODULUS = 361;

    function degrees(radians) {
        var value = radians * 180 / Math.PI;
        return value < 0 ? value + 360 : value;
    }

    function radians(value) {
        return value * Math.PI / 180;
    }

    // The outline of an ellipse with radii radiusX, radiusY in its first
    // quadrant by the midpoint algorithm: points [dx, dy] from [0, radiusY]
    // to [radiusX, 0], dy upwards.
    function quadrant(radiusX, radiusY) {
        var points = [];
        if (radiusY === 0) {
            for (var dx = 0; dx <= radiusX; ++dx)
                points.push([dx, 0]);
            return points;
        }
        var squareX = radiusX * radiusX, squareY = radiusY * radiusY;
        var x = 0, y = radiusY;
        var decision = squareY - squareX * radiusY + squareX / 4;
        while (squareY * x < squareX * y) {
            points.push([x, y]);
            if (decision < 0) {
                decision += squareY * (2 * x + 3);
            } else {
                decision += squareY * (2 * x + 3) + squareX * (2 - 2 * y);
                --y;
            }
            ++x;
        }
        decision = squareY * (x + 0.5) * (x + 0.5) + squareX * (y - 1) * (y - 1) - squareX * squareY;
        while (y >= 0) {
            points.push([x, y]);
            if (decision > 0) {
                decision += squareX * (3 - 2 * y);
            } else {
                decision += squareY * (2 * x + 2) + squareX * (3 - 2 * y);
                ++x;
            }
            --y;
        }
        return points;
    }

    // The whole outline: every point once, [dx, dy] with dy upwards.
    function outline(radiusX, radiusY) {
        var seen = Object.create(null);
        var points = [];
        quadrant(radiusX, radiusY).forEach(function (point) {
            var mirrors = [[point[0], point[1]], [-point[0], point[1]], [-point[0], -point[1]], [point[0], -point[1]]];
            mirrors.forEach(function (mirrored) {
                var key = mirrored[0] + ',' + mirrored[1];
                if (seen[key] === undefined) {
                    seen[key] = true;
                    points.push(mirrored);
                }
            });
        });
        return points;
    }

    // The angle of a point of an ellipse in degrees [0, 360): the angle of
    // its parameter (x = radiusX cos t, y = radiusY sin t).
    function pointAngle(dx, dy, radiusX, radiusY) {
        return degrees(Math.atan2(radiusY === 0 ? dy : dy / radiusY, radiusX === 0 ? dx : dx / radiusX));
    }

    // The range of an arc: angles modulo 361. A start after the end draws
    // an arc the other way round (through 0), but a sector from the smaller
    // angle to the bigger one.
    function arcRange(start, end, sector) {
        start %= ANGLE_MODULUS;
        end %= ANGLE_MODULUS;
        if (end < start)
            return { start: end, end: start, outside: !sector };
        return { start: start, end: end, outside: false };
    }

    function inRange(range, angle) {
        var inside = angle >= range.start && angle <= range.end;
        return inside !== range.outside;
    }

    function Graph(rt) {
        this.rt = rt;
        this.initialized = false;
        this.result = 0;
        this.width = 640;
        this.height = 480;
        this.colors = 16;
        this.direct = false;
        this.driver = VGA;
        this.mode = 2;
        this.xAspect = 10000;
        this.yAspect = 10000;
        this.pixels = null;
        this.palette = DEFAULT_PALETTE.slice();
        this.context = null;
        this.canvas = null;
        this.dirty = null;
        this.arc = { x: 0, y: 0, xStart: 0, yStart: 0, xEnd: 0, yEnd: 0 };
        this.userFill = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
        this.defaults();
    }

    // GraphDefaults.
    Graph.prototype.defaults = function () {
        this.color = 15;
        this.setBkColor(0);
        this.lineStyle = 0;
        this.linePattern = 0;
        this.lineBits = LINE_PATTERNS[0];
        this.thickness = 1;
        this.fillPattern = 1;
        this.fillColor = this.colors - 1;
        this.writeMode = WRITE_COPY;
        this.view = { x1: 0, y1: 0, x2: this.width - 1, y2: this.height - 1, clip: true };
        this.x = 0;
        this.y = 0;
        this.text = { font: 0, direction: 0, size: 1, horiz: 0, vert: 2 };
    };

    Graph.prototype.mask = function (color) {
        return (color & (this.colors - 1)) >>> 0;
    };

    // --- Pixels (absolute coordinates)

    Graph.prototype.touch = function (x, y) {
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

    Graph.prototype.touchAll = function () {
        if (this.pixels !== null)
            this.dirty = { x0: 0, y0: 0, x1: this.width - 1, y1: this.height - 1 };
    };

    // Inside the screen and, with clipping on, the viewport.
    Graph.prototype.visible = function (x, y) {
        var view = this.view;
        if (view.clip && (x < view.x1 || x > view.x2 || y < view.y1 || y > view.y2))
            return false;
        return x >= 0 && y >= 0 && x < this.width && y < this.height;
    };

    Graph.prototype.store = function (x, y, color, mode) {
        var at = y * this.width + x;
        var value = this.mask(color);
        switch (mode) {
        case WRITE_XOR: this.pixels[at] ^= value; break;
        case WRITE_OR: this.pixels[at] |= value; break;
        case WRITE_AND: this.pixels[at] &= value; break;
        case WRITE_NOT: this.pixels[at] = this.mask(~color); break;
        default: this.pixels[at] = value;
        }
        this.touch(x, y);
    };

    Graph.prototype.plot = function (x, y, color, mode) {
        if (this.visible(x, y))
            this.store(x, y, color, mode);
    };

    Graph.prototype.read = function (x, y) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height)
            return 0;
        return this.pixels[y * this.width + x];
    };

    // A pixel of the fill pattern: the fill color for a set bit, the
    // background for a clear one; the pattern is fixed to the screen.
    Graph.prototype.patternColor = function (x, y) {
        var rows = this.fillPattern === USER_FILL ? this.userFill : FILL_PATTERNS[this.fillPattern];
        return (rows[y & 7] & (0x80 >> (x & 7))) !== 0 ? this.fillColor : this.bkColor;
    };

    Graph.prototype.fillSpan = function (x1, x2, y) {
        for (var x = Math.min(x1, x2); x <= Math.max(x1, x2); ++x) {
            if (this.visible(x, y))
                this.store(x, y, this.patternColor(x, y), WRITE_COPY);
        }
    };

    // --- Lines

    // The part of a segment inside a rectangle (Cohen - Sutherland, the
    // cut points truncated): [x1, y1, x2, y2] or null.
    function clipSegment(x1, y1, x2, y2, left, top, right, bottom) {
        var code = function (x, y) {
            return (x < left ? 1 : (x > right ? 2 : 0)) | (y < top ? 4 : (y > bottom ? 8 : 0));
        };
        var code1 = code(x1, y1), code2 = code(x2, y2);
        for (;;) {
            if ((code1 | code2) === 0)
                return [x1, y1, x2, y2];
            if ((code1 & code2) !== 0)
                return null;
            var outside = code1 !== 0 ? code1 : code2;
            var x, y;
            if ((outside & 1) !== 0) {
                x = left;
                y = y1 + Math.trunc((y2 - y1) * (left - x1) / (x2 - x1));
            } else if ((outside & 2) !== 0) {
                x = right;
                y = y1 + Math.trunc((y2 - y1) * (right - x1) / (x2 - x1));
            } else if ((outside & 4) !== 0) {
                y = top;
                x = x1 + Math.trunc((x2 - x1) * (top - y1) / (y2 - y1));
            } else {
                y = bottom;
                x = x1 + Math.trunc((x2 - x1) * (bottom - y1) / (y2 - y1));
            }
            if (outside === code1) {
                x1 = x;
                y1 = y;
                code1 = code(x, y);
            } else {
                x2 = x;
                y2 = y;
                code2 = code(x, y);
            }
        }
    }

    // A line between absolute points with the line style, thickness and
    // write mode (Bresenham). With clipping on, the line is cut to the
    // viewport first; pixels off the screen are left out. The style
    // pattern goes along the line, but is fixed to the screen on
    // horizontal and vertical lines.
    Graph.prototype.drawLine = function (x1, y1, x2, y2) {
        var view = this.view;
        if (view.clip) {
            var part = clipSegment(x1, y1, x2, y2, view.x1, view.y1, view.x2, view.y2);
            if (part === null)
                return;
            x1 = part[0];
            y1 = part[1];
            x2 = part[2];
            y2 = part[3];
        }
        var dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
        var sx = x2 >= x1 ? 1 : -1, sy = y2 >= y1 ? 1 : -1;
        var xMajor = dx >= dy;
        var steps = xMajor ? dx : dy;
        var error = xMajor ? 2 * dy - dx : 2 * dx - dy;
        var bits = this.lineStyle === 0 ? 0xffff : this.lineBits;
        var x = x1, y = y1;
        for (var step = 0; step <= steps; ++step) {
            var place = y1 === y2 ? x : (x1 === x2 ? y : step);
            if ((bits & (0x8000 >>> (place & 15))) !== 0)
                this.thickPlot(x, y, xMajor);
            if (error >= 0) {
                if (xMajor)
                    y += sy;
                else
                    x += sx;
                error -= 2 * steps;
            }
            error += 2 * (xMajor ? dy : dx);
            if (xMajor)
                x += sx;
            else
                y += sy;
        }
    };

    // A pixel of a line: three across the line when it is thick.
    Graph.prototype.thickPlot = function (x, y, xMajor) {
        if (this.thickness === 1) {
            this.plot(x, y, this.color, this.writeMode);
        } else if (xMajor) {
            for (var dy = -1; dy <= 1; ++dy)
                this.plot(x, y + dy, this.color, this.writeMode);
        } else {
            for (var dx = -1; dx <= 1; ++dx)
                this.plot(x + dx, y, this.color, this.writeMode);
        }
    };

    // Line in viewport coordinates.
    Graph.prototype.line = function (x1, y1, x2, y2) {
        var view = this.view;
        this.drawLine(x1 + view.x1, y1 + view.y1, x2 + view.x1, y2 + view.y1);
    };

    Graph.prototype.moveTo = function (x, y) {
        this.x = x;
        this.y = y;
    };

    Graph.prototype.lineTo = function (x, y) {
        this.line(this.x, this.y, x, y);
        this.moveTo(x, y);
    };

    Graph.prototype.rectangle = function (x1, y1, x2, y2) {
        var swap;
        if (x1 > x2) { swap = x1; x1 = x2; x2 = swap; }
        if (y1 > y2) { swap = y1; y1 = y2; y2 = swap; }
        // Every side stops before the next corner: no pixel twice.
        this.line(x1, y1, x2 - 1, y1);
        this.line(x2, y1, x2, y2 - 1);
        this.line(x2, y2, x1 + 1, y2);
        this.line(x1, y2, x1, y1 + 1);
    };

    Graph.prototype.drawPoly = function (points) {
        for (var at = 0; at + 1 < points.length; ++at)
            this.line(points[at][0], points[at][1], points[at + 1][0], points[at + 1][1]);
    };

    // --- Areas

    Graph.prototype.bar = function (x1, y1, x2, y2) {
        var view = this.view;
        for (var y = Math.min(y1, y2); y <= Math.max(y1, y2); ++y)
            this.fillSpan(x1 + view.x1, x2 + view.x1, y + view.y1);
    };

    Graph.prototype.bar3d = function (x1, y1, x2, y2, depth, top) {
        var swap;
        if (x1 > x2) { swap = x1; x1 = x2; x2 = swap; }
        if (y1 > y2) { swap = y1; y1 = y2; y2 = swap; }
        this.bar(x1, y1, x2, y2);
        this.rectangle(x1, y1, x2, y2);
        if (top) {
            this.line(x1, y1, x1 + depth, y1 - depth);
            this.line(x1 + depth, y1 - depth, x2 + depth, y1 - depth);
        }
        if (depth !== 0) {
            this.line(x2 + depth, y1 - depth, x2 + depth, y2 - depth);
            this.line(x2 + depth, y2 - depth, x2, y2);
            if (top)
                this.line(x2, y1, x2 + depth, y1 - depth);
        }
    };

    // FillPoly: the inside by the even-odd rule, then the outline.
    Graph.prototype.fillPoly = function (points) {
        var count = points.length;
        if (count === 0)
            return;
        var view = this.view;
        var top = Infinity, bottom = -Infinity;
        points.forEach(function (point) {
            top = Math.min(top, point[1]);
            bottom = Math.max(bottom, point[1]);
        });
        for (var y = top; y <= bottom; ++y) {
            var crossings = [];
            for (var pointIndex = 0; pointIndex < count; ++pointIndex) {
                var edgeStart = points[pointIndex], edgeEnd = points[(pointIndex + 1) % count];
                if (edgeStart[1] === edgeEnd[1])
                    continue;
                var low = edgeStart[1] < edgeEnd[1] ? edgeStart : edgeEnd;
                var high = edgeStart[1] < edgeEnd[1] ? edgeEnd : edgeStart;
                if (y < low[1] || y >= high[1])
                    continue;
                crossings.push(low[0] + (y - low[1]) * (high[0] - low[0]) / (high[1] - low[1]));
            }
            crossings.sort(function (first, second) { return first - second; });
            for (var crossing = 0; crossing + 1 < crossings.length; crossing += 2) {
                var from = Math.ceil(crossings[crossing]), to = Math.floor(crossings[crossing + 1]);
                if (from <= to)
                    this.fillSpan(from + view.x1, to + view.x1, y + view.y1);
            }
        }
        for (var edge = 0; edge < count; ++edge) {
            var lineStart = points[edge], lineEnd = points[(edge + 1) % count];
            this.line(lineStart[0], lineStart[1], lineEnd[0], lineEnd[1]);
        }
    };

    // FloodFill: the 4-connected area of pixels that are not the border
    // color, within the viewport, gets the fill pattern.
    Graph.prototype.floodFill = function (x, y, border) {
        var view = this.view;
        border = this.mask(border);
        x += view.x1;
        y += view.y1;
        var left = Math.max(view.x1, 0), right = Math.min(view.x2, this.width - 1);
        var topLimit = Math.max(view.y1, 0), bottomLimit = Math.min(view.y2, this.height - 1);
        if (x < left || x > right || y < topLimit || y > bottomLimit || this.read(x, y) === border)
            return;
        var width = right - left + 1;
        var seen = new Uint8Array(width * (bottomLimit - topLimit + 1));
        var self = this;
        var open = function (px, py) {
            return seen[(py - topLimit) * width + px - left] === 0 && self.read(px, py) !== border;
        };
        var spans = [];
        var stack = [[x, y]];
        while (stack.length > 0) {
            var seed = stack.pop();
            var sy = seed[1];
            if (!open(seed[0], sy))
                continue;
            var x1 = seed[0], x2 = seed[0];
            while (x1 > left && open(x1 - 1, sy))
                --x1;
            while (x2 < right && open(x2 + 1, sy))
                ++x2;
            for (var px = x1; px <= x2; ++px)
                seen[(sy - topLimit) * width + px - left] = 1;
            spans.push([x1, x2, sy]);
            [sy - 1, sy + 1].forEach(function (ny) {
                if (ny < topLimit || ny > bottomLimit)
                    return;
                var inside = false;
                for (var nx = x1; nx <= x2; ++nx) {
                    var free = open(nx, ny);
                    if (free && !inside)
                        stack.push([nx, ny]);
                    inside = free;
                }
            });
        }
        spans.forEach(function (span) {
            self.fillSpan(span[0], span[1], span[2]);
        });
    };

    // --- Arcs

    // An ellipse or its arc around (x, y) in viewport coordinates; fill -
    // 'ellipse' or 'sector' to fill the inside first. Sets the coordinates
    // of GetArcCoords.
    Graph.prototype.ellipse = function (x, y, start, end, radiusX, radiusY, fill) {
        var view = this.view;
        // A radius of 0 counts as 1; both radii of 1 give a point.
        radiusX = Math.max(radiusX, 1);
        radiusY = Math.max(radiusY, 1);
        var cx = x + view.x1, cy = y + view.y1;
        var range = fill === 'ellipse' ? { start: 0, end: 360, outside: false } : arcRange(start, end, fill === 'sector');
        this.arc = {
            x: x, y: y,
            xStart: x + Math.round(radiusX * Math.cos(radians(range.start))),
            yStart: y - Math.round(radiusY * Math.sin(radians(range.start))),
            xEnd: x + Math.round(radiusX * Math.cos(radians(range.end))),
            yEnd: y - Math.round(radiusY * Math.sin(radians(range.end)))
        };
        var points = radiusX === 1 && radiusY === 1 ? [[0, 0]] : outline(radiusX, radiusY);
        if (fill !== undefined)
            this.fillArc(cx, cy, radiusX, radiusY, points, fill === 'sector' ? range : null);
        var self = this;
        var radii = this.thickness === 1 ? [0] : [-1, 0, 1];
        radii.forEach(function (delta) {
            var ra = radiusX + delta, rb = radiusY + delta;
            if (ra < 0 || rb < 0)
                return;
            (delta === 0 ? points : outline(ra, rb)).forEach(function (point) {
                if (inRange(range, pointAngle(point[0], point[1], ra, rb)))
                    self.plot(cx + point[0], cy - point[1], self.color, WRITE_COPY);
            });
        });
        if (fill === 'sector') {
            this.line(this.arc.xStart, this.arc.yStart, x, y);
            this.line(x, y, this.arc.xEnd, this.arc.yEnd);
        }
    };

    // The inside of an ellipse (range null) or of its sector: rows between
    // the outline points, each pixel of a sector by its angle.
    Graph.prototype.fillArc = function (cx, cy, radiusX, radiusY, points, range) {
        var widths = Object.create(null);
        points.forEach(function (point) {
            var width = widths[point[1]];
            widths[point[1]] = width === undefined ? Math.abs(point[0]) : Math.max(width, Math.abs(point[0]));
        });
        for (var dy = -radiusY; dy <= radiusY; ++dy) {
            var width = widths[dy];
            if (width === undefined)
                continue;
            for (var dx = -width; dx <= width; ++dx) {
                if (range !== null && (dx !== 0 || dy !== 0) && !inRange(range, pointAngle(dx, dy, radiusX, radiusY)))
                    continue;
                if (this.visible(cx + dx, cy - dy))
                    this.store(cx + dx, cy - dy, this.patternColor(cx + dx, cy - dy), WRITE_COPY);
            }
        }
    };

    Graph.prototype.circleRadius = function (radius) {
        return Math.trunc(radius * this.xAspect / this.yAspect);
    };

    // --- Clearing

    Graph.prototype.clearViewPort = function () {
        var view = this.view;
        for (var y = Math.max(view.y1, 0); y <= Math.min(view.y2, this.height - 1); ++y) {
            for (var x = Math.max(view.x1, 0); x <= Math.min(view.x2, this.width - 1); ++x)
                this.store(x, y, this.bkColor, WRITE_COPY);
        }
        this.moveTo(0, 0);
    };

    Graph.prototype.clearDevice = function () {
        if (this.pixels !== null) {
            this.pixels.fill(this.mask(this.bkColor));
            this.touchAll();
        }
        this.moveTo(0, 0);
    };

    Graph.prototype.setViewPort = function (x1, y1, x2, y2, clip) {
        if (x1 < 0 || y1 < 0 || x1 > x2 || y1 > y2 || x2 >= this.width || y2 >= this.height) {
            this.result = GR_ERROR;
            return;
        }
        this.view = { x1: x1, y1: y1, x2: x2, y2: y2, clip: clip };
        this.moveTo(0, 0);
    };

    // The background color: its index, which the palette modes also show
    // as color 0.
    Graph.prototype.setBkColor = function (color) {
        this.bkColor = color;
        if (!this.direct && this.colors > 2 && color >= 0 && color < 256)
            this.palette[0] = DEFAULT_PALETTE[color];
        this.touchAll();
    };

    Graph.prototype.setLineStyle = function (style, pattern, thickness) {
        if (style < 0 || style > USER_BIT_LN || (thickness !== 1 && thickness !== 3)) {
            this.result = GR_ERROR;
            return;
        }
        this.lineStyle = style;
        this.linePattern = pattern & 0xffff;
        this.lineBits = style === USER_BIT_LN ? pattern & 0xffff : LINE_PATTERNS[style];
        this.thickness = thickness;
    };

    // --- Text in the 8x8 font

    Graph.prototype.textWidth = function (text) {
        return text.length * 8 * this.text.size;
    };

    Graph.prototype.textHeight = function () {
        return 8 * this.text.size;
    };

    // OutTextXY: (x, y) in viewport coordinates is the point the
    // justification refers to; vertical text goes upwards.
    Graph.prototype.outText = function (x, y, text) {
        var settings = this.text;
        var size = settings.size;
        var width = this.textWidth(text), height = this.textHeight();
        var view = this.view;
        var left, top;
        if (settings.direction === 0) {
            left = x - (settings.horiz === 1 ? width >> 1 : (settings.horiz === 2 ? width : 0));
            top = y - (settings.vert === 1 ? height >> 1 : (settings.vert === 0 ? height : 0));
        } else {
            left = x - (settings.horiz === 1 ? height >> 1 : (settings.horiz === 2 ? height : 0));
            top = y + (settings.vert === 1 ? width >> 1 : (settings.vert === 0 ? 0 : width));
        }
        left += view.x1;
        top += view.y1;
        for (var position = 0; position < text.length; ++position) {
            var glyph = (text.charCodeAt(position) & 255) * 8;
            for (var row = 0; row < 8; ++row) {
                var bits = FONT[glyph + row];
                for (var column = 0; column < 8; ++column) {
                    if ((bits & (0x80 >> column)) === 0)
                        continue;
                    var along = (position * 8 + column) * size;
                    for (var sy = 0; sy < size; ++sy) {
                        for (var sx = 0; sx < size; ++sx) {
                            if (settings.direction === 0)
                                this.plot(left + along + sx, top + row * size + sy, this.color, WRITE_COPY);
                            else
                                this.plot(left + row * size - sy, top - along + sx, this.color, WRITE_COPY);
                        }
                    }
                }
            }
        }
    };

    // --- Canvas

    Graph.prototype.attach = function () {
        var canvas = this.rt.env.canvas();
        if (canvas === undefined || canvas === null)
            return;
        canvas.width = this.width;
        canvas.height = this.height;
        this.context = canvas.getContext('2d');
        this.canvas = canvas;
        this.touchAll();
    };

    // The color of a pixel value as 0xRRGGBB.
    Graph.prototype.rgb = function (value) {
        if (!this.direct)
            return this.palette[value] || 0;
        if (this.colors === 65536)
            return ((value >> 11 & 31) * 255 / 31 << 16) | ((value >> 5 & 63) * 255 / 63 << 8) | ((value & 31) * 255 / 31);
        if (this.colors === 32768)
            return ((value >> 10 & 31) * 255 / 31 << 16) | ((value >> 5 & 31) * 255 / 31 << 8) | ((value & 31) * 255 / 31);
        if (this.colors === 4096)
            return ((value >> 8 & 15) * 17 << 16) | ((value >> 4 & 15) * 17 << 8) | ((value & 15) * 17);
        return value & 0xffffff;
    };

    Graph.prototype.present = function () {
        var dirty = this.dirty;
        if (dirty === null || this.context === null)
            return;
        this.dirty = null;
        var width = dirty.x1 - dirty.x0 + 1, height = dirty.y1 - dirty.y0 + 1;
        var image = this.context.createImageData(width, height);
        var data = image.data;
        var out = 0;
        for (var y = dirty.y0; y <= dirty.y1; ++y) {
            var row = y * this.width;
            for (var x = dirty.x0; x <= dirty.x1; ++x) {
                var color = this.rgb(this.pixels[row + x]);
                data[out++] = (color >> 16) & 255;
                data[out++] = (color >> 8) & 255;
                data[out++] = color & 255;
                data[out++] = 255;
            }
        }
        // Qt 6.4 draws nothing with the three-argument putImageData.
        this.context.putImageData(image, dirty.x0, dirty.y0, 0, 0, width, height);
        if (typeof this.canvas.requestPaint === 'function')
            this.canvas.requestPaint();
    };

    // --- The unit in Pascal

    var SOURCE = [
        'unit Graph;',
        'interface',
        'type',
        '  ColorType = LongWord;',
        '  RGBRec = packed record Red, Green, Blue: SmallInt; end;',
        '  PaletteType = record Size: LongInt; Colors: array[0..255] of RGBRec; end;',
        '  LineSettingsType = record LineStyle, Pattern, Thickness: Word; end;',
        '  TextSettingsType = record Font, Direction, CharSize, Horiz, Vert: Word; end;',
        '  FillSettingsType = record Pattern: Word; Color: ColorType; end;',
        '  FillPatternType = array[1..8] of Byte;',
        '  PointType = record X, Y: SmallInt; end;',
        '  ViewPortType = record X1, Y1, X2, Y2: SmallInt; Clip: Boolean; end;',
        '  ArcCoordsType = record X, Y, XStart, YStart, XEnd, YEnd: SmallInt; end;',
        'const',
        '  grOk = 0; grNoInitGraph = -1; grNotDetected = -2; grFileNotFound = -3; grInvalidDriver = -4;',
        '  grNoLoadMem = -5; grNoScanMem = -6; grNoFloodMem = -7; grFontNotFound = -8; grNoFontMem = -9;',
        '  grInvalidMode = -10; grError = -11; grIOerror = -12; grInvalidFont = -13; grInvalidFontNum = -14;',
        '  grInvalidVersion = -18;',
        '  Black = 0; Blue = 1; Green = 2; Cyan = 3; Red = 4; Magenta = 5; Brown = 6; LightGray = 7;',
        '  DarkGray = 8; LightBlue = 9; LightGreen = 10; LightCyan = 11; LightRed = 12; LightMagenta = 13;',
        '  Yellow = 14; White = 15;',
        '  EGABlack = 0; EGABlue = 1; EGAGreen = 2; EGACyan = 3; EGARed = 4; EGAMagenta = 5; EGALightgray = 7;',
        '  EGABrown = 20; EGADarkgray = 56; EGALightblue = 57; EGALightgreen = 58; EGALightcyan = 59;',
        '  EGALightred = 60; EGALightmagenta = 61; EGAYellow = 62; EGAWhite = 63;',
        '  SolidLn = 0; DottedLn = 1; CenterLn = 2; DashedLn = 3; UserBitLn = 4;',
        '  NormWidth = 1; ThickWidth = 3;',
        '  DefaultFont = 0; TriplexFont = 1; SmallFont = 2; SansSerifFont = 3; GothicFont = 4; ScriptFont = 5;',
        '  SimpleFont = 6; TSCRFont = 7; LCOMFont = 8; EuroFont = 9; BoldFont = 10;',
        '  HorizDir = 0; VertDir = 1; UserCharSize = 0;',
        '  ClipOn = True; ClipOff = False; TopOn = True; TopOff = False;',
        '  EmptyFill = 0; SolidFill = 1; LineFill = 2; LtSlashFill = 3; SlashFill = 4; BkSlashFill = 5;',
        '  LtBkSlashFill = 6; HatchFill = 7; XHatchFill = 8; InterleaveFill = 9; WideDotFill = 10;',
        '  CloseDotFill = 11; UserFill = 12;',
        '  NormalPut = 0; CopyPut = 0; XORPut = 1; OrPut = 2; AndPut = 3; NotPut = 4;',
        '  LeftText = 0; CenterText = 1; RightText = 2; BottomText = 0; TopText = 2;',
        '  CurrentDriver = -128; Detect = 0; CGA = 1; MCGA = 2; EGA = 3; EGA64 = 4; EGAMono = 5; HercMono = 7;',
        '  VGA = 9; VESA = 10; D1bit = 11; D2bit = 12; D4bit = 13; D6bit = 14; D8bit = 15; D12bit = 16;',
        '  D15bit = 17; D16bit = 18; D24bit = 19; D32bit = 20; Default = 0;',
        '  VGALo = 0; VGAMed = 1; VGAHi = 2;',
        '  detectMode = 30000; m320x200 = 30001; m320x256 = 30002; m320x400 = 30003; m512x384 = 30004;',
        '  m640x200 = 30005; m640x256 = 30006; m640x350 = 30007; m640x400 = 30008; m640x480 = 30009;',
        '  m800x600 = 30010; m832x624 = 30011; m1024x768 = 30012; m1280x1024 = 30013; m1600x1200 = 30014;',
        '  m2048x1536 = 30015;',
        '  MaxColors = 255;',
        'procedure InitGraph(var GraphDriver, GraphMode: SmallInt; const PathToDriver: string); external;',
        'procedure DetectGraph(var GraphDriver, GraphMode: SmallInt); external;',
        'procedure CloseGraph; external;',
        'procedure RestoreCrtMode; external;',
        'procedure SetGraphMode(Mode: SmallInt); external;',
        'function GetGraphMode: SmallInt; external;',
        'function GetMaxMode: SmallInt; external;',
        'function GetModeName(ModeNumber: SmallInt): string; external;',
        'function GetDriverName: string; external;',
        'function GraphResult: SmallInt; external;',
        'function GraphErrorMsg(ErrorCode: SmallInt): string; external;',
        'procedure GraphDefaults; external;',
        'function GetMaxX: SmallInt; external;',
        'function GetMaxY: SmallInt; external;',
        'function GetMaxColor: ColorType; external;',
        'function GetPaletteSize: SmallInt; external;',
        'procedure PutPixel(X, Y: SmallInt; Color: ColorType); external;',
        'function GetPixel(X, Y: SmallInt): ColorType; external;',
        'procedure Line(X1, Y1, X2, Y2: SmallInt); external;',
        'procedure LineTo(X, Y: SmallInt); external;',
        'procedure LineRel(Dx, Dy: SmallInt); external;',
        'procedure MoveTo(X, Y: SmallInt); external;',
        'procedure MoveRel(Dx, Dy: SmallInt); external;',
        'function GetX: SmallInt; external;',
        'function GetY: SmallInt; external;',
        'procedure Rectangle(X1, Y1, X2, Y2: SmallInt); external;',
        'procedure Bar(X1, Y1, X2, Y2: SmallInt); external;',
        'procedure Bar3D(X1, Y1, X2, Y2: SmallInt; Depth: Word; Top: Boolean); external;',
        'procedure Circle(X, Y: SmallInt; Radius: Word); external;',
        'procedure Arc(X, Y: SmallInt; StAngle, EndAngle, Radius: Word); external;',
        'procedure Ellipse(X, Y: SmallInt; StAngle, EndAngle: Word; XRadius, YRadius: Word); external;',
        'procedure FillEllipse(X, Y: SmallInt; XRadius, YRadius: Word); external;',
        'procedure PieSlice(X, Y, StAngle, EndAngle: SmallInt; Radius: Word); external;',
        'procedure Sector(X, Y: SmallInt; StAngle, EndAngle, XRadius, YRadius: Word); external;',
        'procedure DrawPoly(NumPoints: Word; var PolyPoints); external;',
        'procedure FillPoly(NumPoints: Word; var PolyPoints); external;',
        'procedure FloodFill(X, Y: SmallInt; Border: ColorType); external;',
        'procedure ClearDevice; external;',
        'procedure ClearViewPort; external;',
        'procedure SetViewPort(X1, Y1, X2, Y2: SmallInt; Clip: Boolean); external;',
        'procedure GetViewSettings(var ViewPort: ViewPortType); external;',
        'procedure SetColor(Color: ColorType); external;',
        'function GetColor: ColorType; external;',
        'procedure SetBkColor(ColorNum: ColorType); external;',
        'function GetBkColor: ColorType; external;',
        'procedure SetLineStyle(LineStyle: Word; Pattern: Word; Thickness: Word); external;',
        'procedure GetLineSettings(var LineInfo: LineSettingsType); external;',
        'procedure SetFillStyle(Pattern: Word; Color: ColorType); external;',
        'procedure SetFillPattern(Pattern: FillPatternType; Color: ColorType); external;',
        'procedure GetFillSettings(var FillInfo: FillSettingsType); external;',
        'procedure GetFillPattern(var FillPattern: FillPatternType); external;',
        'procedure SetWriteMode(WriteMode: SmallInt); external;',
        'procedure OutText(const TextString: string); external;',
        'procedure OutTextXY(X, Y: SmallInt; const TextString: string); external;',
        'function TextWidth(const TextString: string): Word; external;',
        'function TextHeight(const TextString: string): Word; external;',
        'procedure SetTextStyle(Font, Direction: Word; CharSize: Word); external;',
        'procedure SetTextJustify(Horiz, Vert: Word); external;',
        'procedure GetTextSettings(var TextInfo: TextSettingsType); external;',
        'procedure SetUserCharSize(MultX, DivX, MultY, DivY: Word); external;',
        'procedure SetPalette(ColorNum: Word; Color: ShortInt); external;',
        'procedure SetRGBPalette(ColorNum, RedValue, GreenValue, BlueValue: SmallInt); external;',
        'procedure GetRGBPalette(ColorNum: SmallInt; var RedValue, GreenValue, BlueValue: SmallInt); external;',
        'procedure GetPalette(var Palette: PaletteType); external;',
        'procedure GetDefaultPalette(var Palette: PaletteType); external;',
        'procedure SetAllPalette(var Palette); external;',
        'procedure GetArcCoords(var ArcCoords: ArcCoordsType); external;',
        'procedure GetAspectRatio(var Xasp, Yasp: Word); external;',
        'procedure SetAspectRatio(Xasp, Yasp: Word); external;',
        'function ImageSize(X1, Y1, X2, Y2: SmallInt): LongInt; external;',
        'procedure GetImage(X1, Y1, X2, Y2: SmallInt; var Bitmap); external;',
        'procedure PutImage(X, Y: SmallInt; var Bitmap; BitBlt: Word); external;',
        'procedure SetActivePage(Page: Word); external;',
        'procedure SetVisualPage(Page: Word); external;',
        'implementation',
        'end.'
    ].join('\n');

    // The points of a polygon: an array of PointType or pairs of integers.
    function pointList(value, count) {
        var points = [];
        if (ArrayBuffer.isView(value) || (Array.isArray(value) && typeof value[0] === 'number')) {
            for (var pointIndex = 0; pointIndex < count && 2 * pointIndex + 1 < value.length; ++pointIndex)
                points.push([value[2 * pointIndex], value[2 * pointIndex + 1]]);
            return points;
        }
        for (var item = 0; item < count && item < value.length; ++item)
            points.push([value[item].x, value[item].y]);
        return points;
    }

    // A palette entry as Graph reports it: what SetRGBPalette stores keeps
    // the bits 2..9 of each value.
    function storedLevel(value) {
        return value & 0x3fc;
    }

    function natives(rt) {
        var getGraph = function () {
            if (rt.graphics === null)
                rt.graphics = new Graph(rt);
            return rt.graphics;
        };
        var ready = function () {
            var graph = getGraph();
            if (!graph.initialized)
                rt.re(201, 'Graphics not initialized (call InitGraph)');
            return graph;
        };
        var table = {};
        table.initgraph = function (driverOwner, driverKey, modeOwner, modeKey) {
            var graph = getGraph();
            var driver = driverOwner[driverKey], mode = modeOwner[modeKey];
            var width, height, colors = 16, aspect = 10000, name;
            if (driver === DETECT) {
                driver = VGA;
                mode = 2;
            }
            if (driver === VGA) {
                var spec = VGA_MODES[mode];
                if (spec === undefined) {
                    graph.result = GR_INVALID_MODE;
                    return;
                }
                width = spec[0];
                height = spec[1];
                aspect = spec[2];
                name = spec[3];
            } else if (DEPTHS[driver] !== undefined) {
                var resolution = RESOLUTIONS[mode - FIRST_RESOLUTION];
                if (resolution === undefined) {
                    graph.result = GR_INVALID_MODE;
                    return;
                }
                width = resolution[0];
                height = resolution[1];
                colors = DEPTHS[driver];
                if (width === 320 && height === 200)
                    aspect = 8333;
                name = colors > 256 ? 'VESA' : 'VGA';
            } else {
                graph.result = GR_INVALID_MODE;
                return;
            }
            graph.width = width;
            graph.height = height;
            graph.colors = colors;
            graph.direct = colors > 256;
            graph.xAspect = aspect;
            graph.yAspect = 10000;
            graph.driver = driver;
            graph.mode = mode;
            graph.modeName = width + ' x ' + height + ' ' + name;
            graph.palette = DEFAULT_PALETTE.slice();
            graph.levels = null;
            graph.pixels = new Uint32Array(width * height);
            graph.initialized = true;
            graph.defaults();
            graph.clearDevice();
            graph.attach();
            graph.result = 0;
            driverOwner[driverKey] = driver;
            modeOwner[modeKey] = mode;
        };
        table.detectgraph = function (driverOwner, driverKey, modeOwner, modeKey) {
            driverOwner[driverKey] = VGA;
            modeOwner[modeKey] = 2;
        };
        table.closegraph = function () {
            getGraph().initialized = false;
        };
        table.restorecrtmode = function () {};
        table.setgraphmode = function (mode) {
            var box = { driver: ready().driver, mode: mode };
            table.initgraph(box, 'driver', box, 'mode');
        };
        table.getgraphmode = function () { return getGraph().mode; };
        table.getmaxmode = function () {
            return getGraph().driver === VGA ? 2 : FIRST_RESOLUTION + RESOLUTIONS.length - 1;
        };
        table.getmodename = function (mode) {
            var graph = getGraph();
            if (graph.driver === VGA)
                return VGA_MODES[mode] ? VGA_MODES[mode][0] + ' x ' + VGA_MODES[mode][1] + ' ' + VGA_MODES[mode][3] : '';
            var resolution = RESOLUTIONS[mode - FIRST_RESOLUTION];
            return resolution ? resolution[0] + ' x ' + resolution[1] + ' ' + (graph.colors > 256 ? 'VESA' : 'VGA') : '';
        };
        table.getdrivername = function () { return getGraph().driver === VGA ? 'VGA' : 'VESA'; };
        table.graphresult = function () {
            var graph = getGraph();
            var result = graph.result;
            graph.result = 0;
            return result;
        };
        table.grapherrormsg = function (code) { return ERROR_MESSAGES[code] || ''; };
        table.graphdefaults = function () { ready().defaults(); };
        table.getmaxx = function () { return getGraph().width - 1; };
        table.getmaxy = function () { return getGraph().height - 1; };
        table.getmaxcolor = function () { return getGraph().colors - 1; };
        table.getpalettesize = function () {
            var graph = getGraph();
            return graph.direct ? 0 : Math.max(16, graph.colors);
        };
        table.putpixel = function (x, y, color) {
            var graph = ready();
            graph.plot(x + graph.view.x1, y + graph.view.y1, color, WRITE_COPY);
        };
        table.getpixel = function (x, y) {
            var graph = ready();
            return graph.read(x + graph.view.x1, y + graph.view.y1);
        };
        table.line = function (x1, y1, x2, y2) { ready().line(x1, y1, x2, y2); };
        table.lineto = function (x, y) { ready().lineTo(x, y); };
        table.linerel = function (dx, dy) {
            var graph = ready();
            graph.lineTo(graph.x + dx, graph.y + dy);
        };
        table.moveto = function (x, y) { ready().moveTo(x, y); };
        table.moverel = function (dx, dy) {
            var graph = ready();
            graph.moveTo(graph.x + dx, graph.y + dy);
        };
        table.getx = function () { return getGraph().x; };
        table.gety = function () { return getGraph().y; };
        table.rectangle = function (x1, y1, x2, y2) { ready().rectangle(x1, y1, x2, y2); };
        table.bar = function (x1, y1, x2, y2) { ready().bar(x1, y1, x2, y2); };
        table.bar3d = function (x1, y1, x2, y2, depth, top) { ready().bar3d(x1, y1, x2, y2, depth, top); };
        table.circle = function (x, y, radius) {
            var graph = ready();
            if (radius === 0)
                return;
            var saved = graph.arc;
            graph.ellipse(x, y, 0, 360, radius, graph.circleRadius(radius));
            graph.arc = saved;
        };
        table.arc = function (x, y, start, end, radius) {
            var graph = ready();
            graph.ellipse(x, y, start, end, radius, graph.circleRadius(radius));
        };
        table.ellipse = function (x, y, start, end, radiusX, radiusY) {
            ready().ellipse(x, y, start, end, radiusX, radiusY);
        };
        table.fillellipse = function (x, y, radiusX, radiusY) {
            ready().ellipse(x, y, 0, 360, radiusX, radiusY, 'ellipse');
        };
        table.pieslice = function (x, y, start, end, radius) {
            var graph = ready();
            graph.ellipse(x, y, start, end, radius, graph.circleRadius(radius), 'sector');
        };
        table.sector = function (x, y, start, end, radiusX, radiusY) {
            ready().ellipse(x, y, start, end, radiusX, radiusY, 'sector');
        };
        table.drawpoly = function (count, points) { ready().drawPoly(pointList(points, count)); };
        table.fillpoly = function (count, points) { ready().fillPoly(pointList(points, count)); };
        table.floodfill = function (x, y, border) { ready().floodFill(x, y, border); };
        table.cleardevice = function () { ready().clearDevice(); };
        table.clearviewport = function () { ready().clearViewPort(); };
        table.setviewport = function (x1, y1, x2, y2, clip) { ready().setViewPort(x1, y1, x2, y2, clip); };
        table.getviewsettings = function (view) {
            var current = getGraph().view;
            view.x1 = current.x1;
            view.y1 = current.y1;
            view.x2 = current.x2;
            view.y2 = current.y2;
            view.clip = current.clip;
        };
        table.setcolor = function (color) { getGraph().color = color; };
        table.getcolor = function () { return getGraph().color; };
        table.setbkcolor = function (color) { getGraph().setBkColor(color); };
        table.getbkcolor = function () { return getGraph().bkColor; };
        table.setlinestyle = function (style, pattern, thickness) {
            getGraph().setLineStyle(style, pattern, thickness);
        };
        table.getlinesettings = function (info) {
            var graph = getGraph();
            info.linestyle = graph.lineStyle;
            info.pattern = graph.linePattern;
            info.thickness = graph.thickness;
        };
        table.setfillstyle = function (pattern, color) {
            var graph = getGraph();
            if (pattern > USER_FILL || color > graph.colors - 1) {
                graph.result = GR_ERROR;
                return;
            }
            graph.fillPattern = pattern;
            graph.fillColor = color;
        };
        table.setfillpattern = function (pattern, color) {
            var graph = getGraph();
            if (color > graph.colors - 1) {
                graph.result = GR_ERROR;
                return;
            }
            for (var row = 0; row < 8; ++row)
                graph.userFill[row] = pattern[row];
            graph.fillPattern = USER_FILL;
            graph.fillColor = color;
        };
        table.getfillsettings = function (info) {
            var graph = getGraph();
            info.pattern = graph.fillPattern;
            info.color = graph.fillColor;
        };
        table.getfillpattern = function (pattern) {
            var graph = getGraph();
            for (var row = 0; row < 8; ++row)
                pattern[row] = graph.userFill[row];
        };
        // Lines know two write modes: CopyPut and XORPut.
        table.setwritemode = function (mode) {
            if (mode === WRITE_COPY || mode === WRITE_XOR)
                getGraph().writeMode = mode;
        };
        table.outtext = function (text) {
            var graph = ready();
            graph.outText(graph.x, graph.y, text);
            if (graph.text.direction === 0 && graph.text.horiz === 0)
                graph.x += graph.textWidth(text);
        };
        table.outtextxy = function (x, y, text) { ready().outText(x, y, text); };
        table.textwidth = function (text) { return getGraph().textWidth(text); };
        table.textheight = function (text) { return getGraph().textHeight(text); };
        // Only the 8x8 font: the stroked ones report a missing file.
        table.settextstyle = function (font, direction, size) {
            var graph = getGraph();
            if (font > 10) {
                graph.result = GR_INVALID_FONT_NUM;
                return;
            }
            if (font !== 0)
                graph.result = GR_FONT_NOT_FOUND;
            graph.text.font = 0;
            graph.text.direction = direction === 1 ? 1 : 0;
            graph.text.size = Math.max(1, Math.min(size, 10));
        };
        table.settextjustify = function (horiz, vert) {
            var graph = getGraph();
            if (horiz > 2 || vert > 2) {
                graph.result = GR_ERROR;
                return;
            }
            graph.text.horiz = horiz;
            graph.text.vert = vert;
        };
        table.gettextsettings = function (info) {
            var text = getGraph().text;
            info.font = text.font;
            info.direction = text.direction;
            info.charsize = text.size;
            info.horiz = text.horiz;
            info.vert = text.vert;
        };
        table.setusercharsize = function () {};
        table.setrgbpalette = function (color, red, green, blue) {
            var graph = getGraph();
            if (graph.direct || color < 0 || color >= 256) {
                graph.result = GR_ERROR;
                return;
            }
            graph.palette[color] = (Math.min(storedLevel(red), 255) << 16) | (Math.min(storedLevel(green), 255) << 8) |
                Math.min(storedLevel(blue), 255);
            graph.levels = graph.levels || {};
            graph.levels[color] = [storedLevel(red), storedLevel(green), storedLevel(blue)];
            graph.touchAll();
        };
        table.setpalette = function (color, value) {
            var graph = getGraph();
            if (graph.direct || color >= graph.colors) {
                graph.result = GR_ERROR;
                return;
            }
            graph.palette[color] = DEFAULT_PALETTE[value & 255];
            if (graph.levels)
                delete graph.levels[color];
            graph.touchAll();
        };
        table.getrgbpalette = function (color, redOwner, redKey, greenOwner, greenKey, blueOwner, blueKey) {
            var graph = getGraph();
            var levels = graph.levels && graph.levels[color];
            var value = graph.palette[color] || 0;
            redOwner[redKey] = levels ? levels[0] : (value >> 16) & 255;
            greenOwner[greenKey] = levels ? levels[1] : (value >> 8) & 255;
            blueOwner[blueKey] = levels ? levels[2] : value & 255;
        };
        var fillPalette = function (palette, colors) {
            palette.size = table.getpalettesize();
            for (var colorIndex = 0; colorIndex < 256; ++colorIndex) {
                palette.colors[colorIndex].red = (colors[colorIndex] >> 16) & 255;
                palette.colors[colorIndex].green = (colors[colorIndex] >> 8) & 255;
                palette.colors[colorIndex].blue = colors[colorIndex] & 255;
            }
        };
        table.getpalette = function (palette) { fillPalette(palette, getGraph().palette); };
        table.getdefaultpalette = function (palette) { fillPalette(palette, DEFAULT_PALETTE); };
        // Entries with -1 in a component stay as they are.
        table.setallpalette = function (palette) {
            var graph = getGraph();
            if (palette === null || palette.colors === undefined)
                return;
            for (var colorIndex = 0; colorIndex < Math.min(palette.size, 256); ++colorIndex) {
                var entry = palette.colors[colorIndex];
                if (entry.red !== -1 && entry.green !== -1 && entry.blue !== -1)
                    graph.palette[colorIndex] = ((entry.red & 255) << 16) | ((entry.green & 255) << 8) |
                        (entry.blue & 255);
            }
            graph.touchAll();
        };
        table.getarccoords = function (coords) {
            var arc = getGraph().arc;
            coords.x = arc.x;
            coords.y = arc.y;
            coords.xstart = arc.xStart;
            coords.ystart = arc.yStart;
            coords.xend = arc.xEnd;
            coords.yend = arc.yEnd;
        };
        table.getaspectratio = function (xOwner, xKey, yOwner, yKey) {
            var graph = getGraph();
            xOwner[xKey] = graph.xAspect;
            yOwner[yKey] = graph.yAspect;
        };
        table.setaspectratio = function (x, y) {
            var graph = getGraph();
            graph.xAspect = x;
            graph.yAspect = y;
        };
        // The size Free Pascal reports: 12 bytes and two per pixel.
        table.imagesize = function (x1, y1, x2, y2) { return 12 + (x2 - x1 + 1) * (y2 - y1 + 1) * 2; };
        // The picture of GetImage is kept in a hidden property of the
        // buffer variable.
        table.getimage = function (x1, y1, x2, y2, buffer) {
            var graph = ready();
            var view = graph.view;
            var width = Math.max(0, x2 - x1 + 1), height = Math.max(0, y2 - y1 + 1);
            var data = new Uint32Array(width * height);
            for (var y = 0; y < height; ++y) {
                for (var x = 0; x < width; ++x)
                    data[y * width + x] = graph.read(x1 + x + view.x1, y1 + y + view.y1);
            }
            if (buffer !== null && typeof buffer === 'object')
                Object.defineProperty(buffer, '$image', { value: { w: width, h: height, data: data },
                                                          configurable: true, writable: true });
        };
        table.putimage = function (x0, y0, buffer, operation) {
            var graph = ready();
            var image = buffer !== null && typeof buffer === 'object' ? buffer.$image : undefined;
            if (image === undefined)
                return;
            var view = graph.view;
            for (var y = 0; y < image.h; ++y) {
                for (var x = 0; x < image.w; ++x)
                    graph.plot(x0 + x + view.x1, y0 + y + view.y1, image.data[y * image.w + x], operation);
            }
        };
        table.setactivepage = function () {};
        table.setvisualpage = function () {};
        return { methods: {}, routines: table };
    }

    Pascal.libraryUnits.graph = { title: 'Graph', source: SOURCE, natives: natives };
})(globalThis);
