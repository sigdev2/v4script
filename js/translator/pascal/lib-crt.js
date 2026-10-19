// Pascal: the Crt unit. The console of the host is not a text screen:
// ClrScr clears it, WhereX and WhereY count the output, Delay really
// waits; colors, windows and the cursor are remembered but do not change
// the output; keys come from the standard input.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    Pascal.libraryUnits = Pascal.libraryUnits || Object.create(null);
    if (Pascal.libraryUnits.crt)
        return;

    var SOURCE = [
        'unit Crt;',
        'interface',
        'const',
        '  BW40 = 0; CO40 = 1; BW80 = 2; CO80 = 3; Mono = 7; Font8x8 = 256; C40 = CO40; C80 = CO80;',
        '  Black = 0; Blue = 1; Green = 2; Cyan = 3; Red = 4; Magenta = 5; Brown = 6; LightGray = 7;',
        '  DarkGray = 8; LightBlue = 9; LightGreen = 10; LightCyan = 11; LightRed = 12; LightMagenta = 13;',
        '  Yellow = 14; White = 15; Blink = 128;',
        'type',
        '  tcrtcoord = 1..255;',
        'var',
        '  CheckBreak: Boolean;',
        '  CheckEOF: Boolean;',
        '  DirectVideo: Boolean;',
        '  CheckSnow: Boolean;',
        '  LastMode: Word = 3;',
        '  TextAttr: Byte = $07;',
        '  WindMin: Word = $0;',
        '  WindMax: Word = $184F;',
        'procedure AssignCrt(var F: Text);',
        'function KeyPressed: Boolean; external;',
        'function ReadKey: Char; external;',
        'procedure TextMode(Mode: Word);',
        'procedure Window(X1, Y1, X2, Y2: Byte);',
        'procedure GotoXY(X, Y: tcrtcoord);',
        'function WhereX: tcrtcoord; external;',
        'function WhereY: tcrtcoord; external;',
        'procedure ClrScr; external;',
        'procedure ClrEol;',
        'procedure InsLine;',
        'procedure DelLine;',
        'procedure TextColor(Color: Byte);',
        'procedure TextBackground(Color: Byte);',
        'procedure LowVideo;',
        'procedure HighVideo;',
        'procedure NormVideo;',
        'procedure Sound(Hz: Word);',
        'procedure NoSound;',
        'procedure CursorOn;',
        'procedure CursorOff;',
        'procedure CursorBig;',
        'implementation',
        'procedure AssignCrt(var F: Text); begin F := Output; end;',
        'procedure TextMode(Mode: Word); begin LastMode := Mode; TextAttr := $07; ClrScr; end;',
        'procedure Window(X1, Y1, X2, Y2: Byte); begin WindMin := (Y1 - 1) shl 8 + (X1 - 1); WindMax := (Y2 - 1) shl 8 + (X2 - 1); end;',
        'procedure GotoXY(X, Y: tcrtcoord); begin end;',
        'procedure ClrEol; begin end;',
        'procedure InsLine; begin end;',
        'procedure DelLine; begin end;',
        'procedure TextColor(Color: Byte); begin TextAttr := (Color and $8F) or (TextAttr and $70); end;',
        'procedure TextBackground(Color: Byte); begin TextAttr := (TextAttr and $8F) or ((Color shl 4) and $70); end;',
        'procedure LowVideo; begin TextAttr := TextAttr and $F7; end;',
        'procedure HighVideo; begin TextAttr := TextAttr or $08; end;',
        'procedure NormVideo; begin TextAttr := $07; end;',
        'procedure Sound(Hz: Word); begin end;',
        'procedure NoSound; begin end;',
        'procedure CursorOn; begin end;',
        'procedure CursorOff; begin end;',
        'procedure CursorBig; begin end;',
        'end.'
    ].join('\n');

    function natives(rt) {
        return {
            methods: {},
            routines: {
                wherex: function () { return Math.min(255, rt.column + 1); },
                wherey: function () { return Math.min(255, rt.row + 1); },
                clrscr: function () {
                    rt.flush();
                    rt.column = 0;
                    rt.row = 0;
                    rt.env.clear();
                },
                // Keys are characters of standard input; a line break is #13.
                readkey: function () {
                    var input = rt.input();
                    if (!Pascal.moreInput(rt, input))
                        return 26;
                    var code = input.data.charCodeAt(input.pos++);
                    return code === 10 ? 13 : code;
                },
                keypressed: function () {
                    var input = rt.input();
                    return input.pos < input.data.length || rt.env.input.isReady();
                }
            }
        };
    }

    Pascal.libraryUnits.crt = {
        title: 'Crt',
        source: SOURCE,
        natives: natives,
        builtins: function (scope) {
            scope.define('delay', { kind: 'builtin', name: 'delay', text: 'Delay', handler: Pascal.waitBuiltin('Delay') });
        }
    };
})(globalThis);
