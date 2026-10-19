// The HTML canvas that ImageCanvas (src/ImageCanvas.cpp) shows to programs:
// the object itself and a subset of its 2D context. State, paths and image
// data live here; drawing goes to the native canvas with the state of the
// moment. The file evaluates to `function (native, number)` that gives the
// same canvas object for the same native canvas.
(function () {
    'use strict';

    var canvases = {};
    var NAMED = { transparent: '#00000000' };

    function hex(value) {
        var text = Math.max(0, Math.min(255, Math.round(value))).toString(16);
        return text.length < 2 ? '0' + text : text;
    }

    // CSS colors that QColor does not read itself become #aarrggbb.
    function color(value) {
        if (typeof value !== 'string')
            return '#ff000000';
        var text = value.trim().toLowerCase();
        if (NAMED[text] !== undefined)
            return NAMED[text];
        var match = /^rgba?\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*(?:,\s*([-\d.]+)\s*)?\)$/.exec(text);
        if (match !== null) {
            var alpha = match[4] === undefined ? 1 : Number(match[4]);
            return '#' + hex(alpha * 255) + hex(Number(match[1])) + hex(Number(match[2])) + hex(Number(match[3]));
        }
        return text;
    }

    function bufferOf(data) {
        // A view on a part of a buffer is copied: the native side gets whole buffers.
        if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength)
            return data.buffer;
        return new Uint8ClampedArray(data).buffer;
    }

    function ImageData(width, height, data) {
        this.width = width;
        this.height = height;
        this.data = data || new Uint8ClampedArray(width * height * 4);
    }

    var STATE = ['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'font', 'textAlign', 'textBaseline',
                 'lineCap', 'lineJoin'];

    function Context(canvas, native) {
        this.canvas = canvas;
        this.native = native;
        this.fillStyle = '#000000';
        this.strokeStyle = '#000000';
        this.lineWidth = 1;
        this.globalAlpha = 1;
        this.font = '10px sans-serif';
        this.textAlign = 'start';
        this.textBaseline = 'alphabetic';
        this.lineCap = 'butt';
        this.lineJoin = 'miter';
        this.path = [];
        this.saved = [];
    }

    Context.prototype.state = function () {
        return {
            fillStyle: color(this.fillStyle),
            strokeStyle: color(this.strokeStyle),
            lineWidth: Number(this.lineWidth),
            globalAlpha: Number(this.globalAlpha),
            font: String(this.font),
            textAlign: String(this.textAlign),
            textBaseline: String(this.textBaseline),
            lineCap: String(this.lineCap),
            lineJoin: String(this.lineJoin)
        };
    };

    Context.prototype.save = function () {
        var copy = {};
        for (var index = 0; index < STATE.length; ++index)
            copy[STATE[index]] = this[STATE[index]];
        this.saved.push(copy);
    };

    Context.prototype.restore = function () {
        var copy = this.saved.pop();
        if (copy === undefined)
            return;
        for (var index = 0; index < STATE.length; ++index)
            this[STATE[index]] = copy[STATE[index]];
    };

    Context.prototype.fillRect = function (x, y, width, height) {
        this.native.fillRect(x, y, width, height, this.state());
    };

    Context.prototype.strokeRect = function (x, y, width, height) {
        this.native.strokeRect(x, y, width, height, this.state());
    };

    Context.prototype.clearRect = function (x, y, width, height) {
        this.native.clearRect(x, y, width, height);
    };

    Context.prototype.beginPath = function () {
        this.path = [];
    };

    Context.prototype.moveTo = function (x, y) {
        this.path.push({ op: 'M', x: Number(x), y: Number(y) });
    };

    Context.prototype.lineTo = function (x, y) {
        this.path.push({ op: 'L', x: Number(x), y: Number(y) });
    };

    Context.prototype.rect = function (x, y, width, height) {
        this.path.push({ op: 'R', x: Number(x), y: Number(y), width: Number(width), height: Number(height) });
    };

    Context.prototype.arc = function (x, y, radius, start, end, anticlockwise) {
        this.path.push({ op: 'A', x: Number(x), y: Number(y), radius: Number(radius), start: Number(start),
                         end: Number(end), anticlockwise: !!anticlockwise });
    };

    Context.prototype.quadraticCurveTo = function (cx, cy, x, y) {
        this.path.push({ op: 'Q', cx: Number(cx), cy: Number(cy), x: Number(x), y: Number(y) });
    };

    Context.prototype.bezierCurveTo = function (c1x, c1y, c2x, c2y, x, y) {
        this.path.push({ op: 'C', c1x: Number(c1x), c1y: Number(c1y), c2x: Number(c2x), c2y: Number(c2y),
                         x: Number(x), y: Number(y) });
    };

    Context.prototype.closePath = function () {
        this.path.push({ op: 'Z' });
    };

    Context.prototype.fill = function () {
        this.native.drawPath(this.path, true, this.state());
    };

    Context.prototype.stroke = function () {
        this.native.drawPath(this.path, false, this.state());
    };

    Context.prototype.fillText = function (text, x, y) {
        this.native.drawText(String(text), x, y, true, this.state());
    };

    Context.prototype.strokeText = function (text, x, y) {
        this.native.drawText(String(text), x, y, false, this.state());
    };

    Context.prototype.measureText = function (text) {
        return { width: this.native.measureText(String(text), this.state()) };
    };

    Context.prototype.createImageData = function (width, height) {
        if (width instanceof ImageData)
            return new ImageData(width.width, width.height);
        return new ImageData(Math.max(1, Math.abs(width | 0)), Math.max(1, Math.abs(height | 0)));
    };

    Context.prototype.getImageData = function (x, y, width, height) {
        var buffer = this.native.getPixels(x | 0, y | 0, width | 0, height | 0);
        return new ImageData(width | 0, height | 0, new Uint8ClampedArray(buffer));
    };

    Context.prototype.putImageData = function (image, x, y, dirtyX, dirtyY, dirtyWidth, dirtyHeight) {
        this.native.putPixels(bufferOf(image.data), image.width, image.height, x | 0, y | 0,
                              dirtyX === undefined ? 0 : dirtyX | 0, dirtyY === undefined ? 0 : dirtyY | 0,
                              dirtyWidth === undefined ? image.width : dirtyWidth | 0,
                              dirtyHeight === undefined ? image.height : dirtyHeight | 0);
    };

    // drawImage(image, x, y) and drawImage(image, x, y, width, height): image
    // data (as in Qt Quick) or another canvas.
    Context.prototype.drawImage = function (image, x, y, width, height) {
        var source = image && image.__v4scriptCanvas;
        var drawWidth = width === undefined ? (source ? source.width : image.width) : Number(width);
        var drawHeight = height === undefined ? (source ? source.height : image.height) : Number(height);
        if (source)
            this.native.drawCanvas(source, Number(x), Number(y), drawWidth, drawHeight, this.state());
        else
            this.native.drawPixels(bufferOf(image.data), image.width, image.height, Number(x), Number(y), drawWidth,
                                   drawHeight, this.state());
    };

    function makeCanvas(native) {
        var context = null;
        var canvas = {
            get width() { return native.width; },
            set width(value) { native.width = value | 0; },
            get height() { return native.height; },
            set height(value) { native.height = value | 0; },
            getContext: function (type) {
                if (type !== '2d')
                    return null;
                if (context === null)
                    context = new Context(canvas, native);
                return context;
            },
            // Qt Quick Canvas has it; here everything is drawn at once.
            requestPaint: function () {
            }
        };
        Object.defineProperty(canvas, '__v4scriptCanvas', { value: native });
        return canvas;
    }

    return function (native, number) {
        if (canvases[number] === undefined)
            canvases[number] = makeCanvas(native);
        return canvases[number];
    };
})()
