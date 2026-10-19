// The host module "app" of the samples and tests: tools/run-samples.mjs and
// tests/LanguagesTest.cpp use this file. It evaluates to a factory that
// makes a fresh module (the counter starts at zero).
(function () {
    'use strict';

    var counter = 0;
    var log = [];
    var object = {
        canvasObject: null,
        greet: function (name) { return 'Hello, ' + name + '!'; },
        add: function (a, b) { return a + b; },
        isEven: function (n) { return n % 2 === 0; },
        point: function (x, y) { return { x: x, y: y }; },
        range: function (count) {
            var list = [];
            for (var index = 0; index < count; ++index)
                list.push(index);
            return list;
        },
        describe: function (value) { return value === undefined ? 'nothing' : JSON.stringify(value); },
        log: function (text) { log.push(String(text)); },
        fail: function (message) { throw new RangeError(message); },
        get counter() { return ++counter; },
        get logged() { return log.slice(); },
        get canvas() { return this.canvasObject; }
    };
    return {
        name: 'app',
        object: object,
        global: true,
        functions: [
            { name: 'greet', parameters: [{ name: 'name', type: 'string' }], result: 'string' },
            { name: 'add', parameters: [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }], result: 'number' },
            { name: 'isEven', parameters: [{ name: 'n', type: 'int' }], result: 'bool' },
            { name: 'point', parameters: [{ name: 'x', type: 'number' }, { name: 'y', type: 'number' }], result: 'value' },
            { name: 'range', parameters: [{ name: 'count', type: 'int' }], result: 'array' },
            { name: 'describe', parameters: [{ name: 'value', type: 'value', optional: true }], result: 'string' },
            { name: 'log', parameters: [{ name: 'text', type: 'string' }], result: 'void' },
            { name: 'fail', parameters: [{ name: 'message', type: 'string' }], result: 'void' },
            { name: 'counter', parameters: [], result: 'int', getter: true },
            { name: 'logged', parameters: [], result: 'array', getter: true },
            { name: 'canvas', parameters: [], result: 'value', getter: true }
        ]
    };
})
