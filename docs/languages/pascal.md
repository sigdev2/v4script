# Pascal

Pascal in the dialect of Free Pascal 3.2.2 (mode `objfpc`, as in Lazarus),
translated into JavaScript by v4script: procedural programs in the style of
Turbo Pascal - records, sets, pointers, files, `goto`, units - and Object
Pascal with classes, properties and exceptions. The results match Free
Pascal: the same number format in `Write`, the same integer arithmetic
(`Int64`), the same `Random` sequence, the same `FloatToStr` and `Format`,
the same lines and fills in `Graph`.

```pascal
// Prices from standard input: the total and the most expensive item
uses SysUtils;
var
  item, best: string;
  price, total, most: Double;
begin
  total := 0; most := 0;
  while not Eof do
  begin
    ReadLn(item);
    ReadLn(price);
    total := total + price;
    if price > most then
    begin
      most := price;
      best := item;
    end;
  end;
  WriteLn(Format('Total: %.2f', [total]));
  WriteLn('Most expensive: ', best);
  WriteLn(Greet(best));        // a function of the host module "app"
end.
```

## A unit is a part of the program

 - All Pascal units are one program. A unit may be a whole program
   (`program Name; … begin … end.`), a library `unit`, or just statements
   mixed with declarations: `var`, `const`, `type`, routines and classes
   may go between statements, `begin … end` is optional.
 - Variables, constants, types, routines and classes of a unit are visible
   in the units that run later. `uses` acts further too: a unit used in one
   piece of code is visible in the next ones.
 - **The variables of a unit start again** at every run of it - from zero
   or from their initial value (`var n: Integer = 5;`). Other units do not
   reset them: `total := total + 5` in another unit adds to the old value.
   `Runtime::reset()` starts the whole program again.
 - **Running a unit again** declares its routines, types and classes
   again: the new ones replace the old ones. If a routine changed its
   parameters and code of another unit calls it the old way, the call is
   the error
   `the routine "…" has changed: run the blocks that call it again`: run
   that unit again.
 - A unit with a translation error changes nothing. A run-time error stops
   the program; what it assigned stays.
 - **The value of a unit** is its last expression statement outside
   routines: `6 * 7` gives `42`, `Fib(90)` the result of the function. The
   value is shown as the JavaScript console shows it: a string as text, a
   record as an object, an array as an array.
 - Names ignore case and may be non-Latin (`итог := 0`).

## Modes and directives

| Directive | What it does |
| --- | --- |
| `{$mode objfpc}` | the default: `Integer` is 32 bits, `string` a long string, `Result`, exceptions, classes |
| `{$mode delphi}` | almost as `objfpc` |
| `{$mode tp}`, `{$mode fpc}` | as Turbo Pascal: `Integer` is 16 bits, `string` a short string (up to 255 characters) |
| `{$H+}`, `{$H-}` | `string` is a long or a short string |
| `{$I-}`, `{$I+}` | I/O errors do not stop the program but go to `IOResult` |
| `{$I name}`, `{$INCLUDE name}` | inserts the text of a host file in place of the directive |
| `{$B+}` | `and` and `or` evaluate both sides |
| `{$C+}`, `{$ASSERTIONS ON}` | turns `Assert` on |
| `{$J-}` | typed constants cannot be changed |
| `{$SCOPEDENUMS ON}` | enumeration values only through the type: `TColor.Red` |
| `{$DEFINE x}`, `{$IFDEF x}`, `{$IFNDEF}`, `{$IF expression}`, `{$ELSE}`, `{$ENDIF}` | conditional compilation; `FPC`, `VER3_2_2`, `CPUX86_64`, `LINUX`, `UNIX`, `V4SCRIPT` are defined |

Other directives (`{$APPTYPE}`, `{$GOTO ON}`, `{$MODESWITCH}`…) are accepted
and change nothing. Comments are `{ … }`, `(* … *)` and `//`.

## Numbers

| Type | What it is |
| --- | --- |
| `ShortInt`, `Byte` | 8 bits: −128…127, 0…255 |
| `SmallInt`, `Word` | 16 bits |
| `Integer` | 32 bits (16 in `{$mode tp}`) |
| `LongInt`, `LongWord`, `Cardinal` | 32 bits |
| `Int64`, `QWord` | 64 bits |
| `Single` | a float with 7-8 significant digits |
| `Double`, `Real` | a float with 15-17 significant digits |
| `Extended` | stored as `Double`, printed as Free Pascal prints it (21 digits) |
| `Comp`, `Currency` | an integer and a number with 4 decimals, as in Free Pascal, but stored as a `Double` (exact up to 2^53 units) |

 - Arithmetic is that of 64-bit Free Pascal: `+ - * div mod` on integers
   are computed in `Int64` without loss, an assignment to a narrow type
   truncates: `b := 200; b := b + 100` gives 44 for a `Byte`. `Int64`
   overflow wraps instead of stopping the program (`{$Q+}` has no effect).
 - `/` always gives a float; `div` and `mod` are integer and drop the
   fraction: `-7 div 2` is −3, `-7 mod 2` is −1. Division by zero is the
   error `Division by zero`.
 - `$FF` is hexadecimal, `%101` binary, `&17` octal.
 - `Write` prints a float with an exponent, as Free Pascal does:
   `WriteLn(1/3)` is ` 3.3333333333333331E-001`; `x:8:2` - 8 characters
   with 2 decimals, `x:0:2` - without leading spaces. An integer and a
   string with `:n` are padded with spaces on the left. `Str`, `Val`,
   `FloatToStr`, `FloatToStrF`, `FormatFloat` and `Format` give the same
   digits as Free Pascal, including its rounding of the last digit.
 - `Round` rounds a half to even: `Round(2.5)` is 2, `Round(3.5)` is 4.
 - `Random` and `Randomize` give the same sequence as Free Pascal (the
   Mersenne Twister): without `Randomize` the first `Random(100)` are 54,
   59, 71, 84, 60. `RandSeed` can be set.

## Strings and characters

 - `string` (in `objfpc`) is a string of any length, `ShortString` and
   `string[n]` are at most 255 and `n` characters: a longer one is cut. A
   string keeps UTF-8 bytes, as Free Pascal on Linux: `Length('Привет')` is
   12, `s[1]` the first byte. Output, `Pos`, `Copy` and comparison work
   with any text, while positions and lengths count bytes.
 - `Char` is one byte (`#65`, `'A'`, `^M`), `WideChar` a UTF-16 unit.
   `'It''s'` is a quote in a string, `'a'#13#10'b'` character codes in a
   string.
 - `+` joins strings and characters; comparison goes by bytes.
 - `UpCase`, `UpperCase`, `LowerCase` change Latin letters only;
   `AnsiUpperCase`, `AnsiLowerCase`, `AnsiCompareText` any letters.

## What is supported

| Area | Constructs |
| --- | --- |
| Declarations | `program`, `unit` (`interface`, `implementation`, `initialization`, `finalization`), `uses`, `label`, `const` (and typed constants), `type`, `var` (with initial values), `procedure`, `function`, `forward`, nested routines, `overload` |
| Types | integers, floats, `Boolean` (and `ByteBool`, `WordBool`, `LongBool`), `Char`, `string`, enumerations (with values: `(One = 1, Two)`), subranges (`1..10`, `'a'..'z'`), `array` (multidimensional, any bounds), dynamic arrays (`array of`), open arrays, `array of const`, records (with variant parts), sets `set of`, pointers (`^T`, `@x`, `New`, `Dispose`), files (`Text`, `file of T`), procedural types (`procedure of object` too), Turbo Pascal `object`, classes and class references (`class of`) |
| Statements | `:=` (and `+=`, `-=`, `*=`, `/=`), `if … then … else`, `case` (with ranges, `else` and `otherwise`, over strings), `for … to/downto`, `for … in` (arrays, strings, sets, class enumerators), `while`, `repeat … until`, `with`, `goto`, `Break`, `Continue`, `Exit` (and `Exit(value)`), `Halt`, `try … except`, `try … finally`, `raise` |
| Parameters | by value, `var`, `const`, `out`, default values (`x: Integer = 0`), open arrays (`array of Integer`), `array of const` |

| Area | Built-in routines |
| --- | --- |
| Output and input | `Write`, `WriteLn`, `WriteStr`, `Read`, `ReadLn`, `Str`, `Val` |
| Numbers | `Abs`, `Sqr`, `Sqrt`, `Sin`, `Cos`, `ArcTan`, `Exp`, `Ln`, `Int`, `Frac`, `Round`, `Trunc`, `Pi`, `Random`, `Randomize`, `Odd`, `Hi`, `Lo`, `Swap` |
| Ordinals | `Ord`, `Chr`, `Succ`, `Pred`, `Inc`, `Dec`, `High`, `Low`, `Include`, `Exclude` |
| Strings and arrays | `Length`, `SetLength`, `Copy`, `Pos`, `Delete`, `Insert`, `Concat`, `UpCase`, `LowerCase`, `StringOfChar` |
| Memory | `New`, `Dispose`, `Assigned`, `Addr`, `SizeOf`, `BitSizeOf`, `Default`, `FillChar`, `Move` |
| Files | `Assign`, `AssignFile`, `Reset`, `Rewrite`, `Append`, `Close`, `CloseFile`, `Flush`, `Erase`, `Rename`, `Seek`, `Truncate`, `Eof`, `Eoln`, `SeekEof`, `SeekEoln`, `FilePos`, `FileSize`, `IOResult` |
| Other | `Assert`, `RunError`, `ParamCount` (0), `ParamStr` |

## Routines

 - The result of a function is `Result := …` or an assignment to its
   name. The name of the function inside it in an expression is the result
   too (a recursive call in `{$mode tp}`); a call with arguments is always
   a call.
 - `var` and `out` pass a variable, a field or an element by reference; a
   record and an array passed by value are copied, `const` ones are not.
 - Nested routines see the variables of the outer one; a procedural
   variable (`op := @Add`, `op := Add`) keeps a top-level routine, and
   `procedure … of object` a method with its object.
 - Overloading goes by the number and types of parameters; `overload` is
   optional except in `{$mode delphi}`.
 - Recursion goes up to 10 000 nested calls (1000 on Android), deeper is
   `Stack overflow`.

## Classes

```pascal
type
  TShape = class
  private
    FName: string;
  public
    constructor Create(const AName: string);
    function Area: Double; virtual; abstract;
    property Name: string read FName;
  end;

  TCircle = class(TShape)
    R: Double;
    constructor Create(ARadius: Double);
    function Area: Double; override;
  end;

constructor TShape.Create(const AName: string);
begin
  FName := AName;
end;

constructor TCircle.Create(ARadius: Double);
begin
  inherited Create('circle');
  R := ARadius;
end;

function TCircle.Area: Double;
begin
  Result := Pi * R * R;
end;

var s: TShape;
begin
  s := TCircle.Create(2);
  try
    WriteLn(s.Name, ' ', s.Area:0:2, ' ', s is TCircle);
  finally
    s.Free;
  end;
end.
```

 - Inheritance from `TObject` (if no ancestor is given), `virtual`,
   `override`, `abstract`, `reintroduce`, `inherited`, `class function`,
   `class var`, `static`; visibility `private`, `protected`, `public`,
   `published`; properties with fields and access methods, indexed
   (`Items[i]`), `default`, `index`; `is`, `as`, `Self`, `ClassName`,
   `ClassType`, `InheritsFrom`, class references
   (`TShapeClass = class of TShape`) and virtual constructors.
 - An object is a reference: `a := b` does not copy it. `Free` and
   `Destroy` call the destructors, but memory is freed by the garbage
   collector; an object after `Free` can still be used by mistake - Free
   Pascal would not allow that.
 - Turbo Pascal `object` (`TShape = object … end`) is a value, like a
   record, with methods and `virtual`; `New(p, Init(…))` and
   `Dispose(p, Done)` work.
 - Generics (`generic`, `specialize`), interfaces, operator overloading
   and records with methods are not supported yet.

## Exceptions

 - `raise Exception.Create('text')`,
   `try … except on E: EConvertError do … end`, `try … finally … end`,
   `raise` without an object in `except` re-raises. The exception classes
   are in the unit `SysUtils`: `Exception`, `EConvertError`, `EDivByZero`,
   `ERangeError`, `EAccessViolation`, `EInOutError`, `EArgumentException`
   and others, as in Free Pascal.
 - With `SysUtils` used, a run-time error becomes an exception of its
   class (division by zero is `EDivByZero`), and `except` catches it;
   without `SysUtils` it stops the program:
   `Runtime error 200: Division by zero`.
 - A JavaScript error inside `try` is caught as an exception; a
   dereference of `nil` is `EAccessViolation`.

| Message | When |
| --- | --- |
| `Range check error` (201) | an array or string index out of bounds |
| `Division by zero` (200) | `div` or `mod` by zero |
| `Access violation` (216) | access to `nil`: an object, a pointer |
| `Stack overflow` (202) | too deep recursion |
| `Invalid floating point operation` (207), `Floating point overflow` (205) | `Sqrt(-1)`, `Ln(0)`, an infinity in a variable |
| `Invalid type cast` (219) | a failed `as`, an unsuitable JavaScript value |
| `File not found` (2), `File not open` (103), `Read past end of file` (100)… | file errors |
| `Assertion failed` (227) | a false `Assert` |
| `Abstract method called` (211) | a call of an `abstract` method |
| `Identifier not found "x"`, `Incompatible types: …`, `Syntax error, ";" expected…` | translation errors, as from the Free Pascal compiler |

An unhandled exception shows as `ClassName: text`, without `SysUtils` as
`An unhandled exception occurred: …`.

## Units

| Unit | What is in it |
| --- | --- |
| `System` | always used: the built-in routines, `TObject`, `RandSeed`, `ExitCode`, `LineEnding`, `MaxInt`… |
| `SysUtils` | exceptions, `IntToStr`, `IntToHex`, `StrToInt`, `StrToIntDef`, `TryStrToInt`, `StrToInt64`, `FloatToStr`, `FloatToStrF`, `FormatFloat`, `StrToFloat`, `StrToFloatDef`, `TryStrToFloat`, `BoolToStr`, `StrToBool`, `Format`, `UpperCase`, `LowerCase`, `AnsiUpperCase`, `AnsiLowerCase`, `Trim`, `TrimLeft`, `TrimRight`, `CompareStr`, `CompareText`, `SameText`, `QuotedStr`, `AnsiQuotedStr`, `AnsiDequotedStr`, `StringReplace`, `AnsiPos`, `LastDelimiter`, `WrapText`, `AdjustLineBreaks`, file names (`ExtractFileName`, `ExtractFileExt`, `ChangeFileExt`…), `FileExists`, `DeleteFile`, `RenameFile`, date and time (`Now`, `Date`, `Time`, `EncodeDate`, `DecodeDate`, `EncodeTime`, `DecodeTime`, `DayOfWeek`, `IsLeapYear`, `IncMonth`, `FormatDateTime`, `DateToStr`, `TimeToStr`, `DateTimeToStr`), `GetTickCount64`, `Sleep`, `FreeAndNil`, `Abort`, `FormatSettings` |
| `Math` | `Min`, `Max`, `InRange`, `EnsureRange`, `DivMod`, `Sign`, `IsZero`, `IsNan`, `IsInfinite`, `SameValue`, `CompareValue`, `RoundTo`, `SimpleRoundTo`, `Ceil`, `Floor`, `Power`, `IntPower`, `Log10`, `Log2`, `LogN`, `LnXP1`, `Hypot`, `Tan`, `Cotan`, `ArcSin`, `ArcCos`, `ArcTan2`, `SinCos`, `SinH`, `CosH`, `TanH` and the inverse ones, angle conversion (`DegToRad`, `RadToDeg`…), `Sum`, `SumInt`, `Mean`, `Variance`, `StdDev`, `MinValue`, `MaxValue`, `RandomRange`, `RandG`, `IfThen` |
| `StrUtils` | `ReverseString`, `DupeString`, `LeftStr`, `RightStr`, `MidStr`, `PosEx`, `RPos`, `NPos`, `StartsStr`, `EndsStr`, `ContainsStr`, `StartsText`, `EndsText`, `ContainsText` (and `Ansi…`), `ReplaceStr`, `ReplaceText`, `IndexStr`, `IndexText`, `MatchStr`, `PadLeft`, `PadRight`, `PadCenter`, `AddChar`, `AddCharR`, `StuffString`, `DelSpace`, `DelSpace1`, `DelChars`, `Tab2Space`, `Copy2Symb`, `Copy2Space` (and `…Del`), `WordCount`, `WordPosition`, `ExtractWord`, `ExtractDelimited`, `SplitString`, `IntToBin`, `IntToRoman`, `RomanToInt`, `Hex2Dec`, `Dec2Numb`, `Numb2Dec`, `Space`, `IsEmptyStr`, `IfThen` |
| `Classes` | `TStrings`, `TStringList` (`Add`, `Insert`, `Delete`, `IndexOf`, `Find`, `Sort`, `CustomSort`, `Sorted`, `Duplicates`, `CaseSensitive`, `Text`, `CommaText`, `DelimitedText`, `Delimiter`, `StrictDelimiter`, `Names`, `Values`, `Objects`, `OwnsObjects`, `OnChange`, `LoadFromFile`, `SaveToFile`), `TList` and `TFPList` (lists of pointers and objects with `Sort`), `TPersistent`, `TNotifyEvent` |
| `Contnrs` | `TObjectList`, `TStack`, `TQueue`, `TObjectStack`, `TObjectQueue` |
| `Crt` | `Delay`, `ClrScr` (clears the output), `WhereX`, `WhereY`, color constants, `KeyPressed` and `ReadKey` (standard input); `GotoXY`, `TextColor`, `TextBackground`, `Window`, `Sound` change nothing in the output |
| `Graph` | BGI graphics on the canvas of the host, see [below](#graphics) |

**Own units** are host files: `uses Geometry;` loads the host file
`Geometry.pas` (or `.pp`, `.p`), `uses Geometry in 'geo.pas';` a file with
another name. A unit is a normal `unit` with `interface` and
`implementation`; its `initialization` runs when it is used for the first
time. A changed file is loaded again at the next run of a unit that uses
it. An error inside a unit names it and its line.

## Files

 - `Assign(f, 'data.txt'); Reset(f)` opens a host file for reading.
   `ReadLn(f, a, b)` reads numbers separated by spaces, `ReadLn(f, s)` a
   whole line, `Eof(f)`, `Eoln(f)`, `SeekEof(f)` as in Free Pascal.
 - `Rewrite` and `Append` write a file **in the memory of the program**: it
   can be read again (`Reset`), `FileExists`, `DeleteFile`,
   `TStringList.SaveToFile` and `LoadFromFile` use it. Such files do not
   reach the host and live until the engine is reset. A file in memory
   hides a host file of the same name.
 - Typed files (`file of TRec`) are in memory too: `Write`, `Read`, `Seek`,
   `FilePos`, `FileSize`, `Truncate`.
 - A file error stops the program (`File not found`); with `{$I-}` it only
   goes to `IOResult`.

## Input

`Read` and `ReadLn` without a file read standard input of the host, as in
Free Pascal: `Read(a, b)` reads numbers across lines, `ReadLn(s)` the rest
of a line; `Eof` and `SeekEof` tell the end of input. `ReadKey` (unit
`Crt`) takes the next character of input, `KeyPressed` tells whether input
is ready.

## Graphics

The unit `Graph` is BGI graphics (Turbo Pascal and Free Pascal):
`InitGraph` turns it on, and the canvas of the host (`Host::canvas`) gets
the size of the screen. What was drawn appears when the run ends and at
`Delay` and `Sleep`.

```pascal
uses Graph, Crt;
var gd, gm, x: SmallInt;
begin
  gd := VGA; gm := VGAHi;          // 640 × 480, 16 colors
  InitGraph(gd, gm, '');
  for x := 0 to 60 do
  begin
    ClearDevice;
    SetColor(Yellow);
    SetFillStyle(SolidFill, Red);
    FillEllipse(50 + x * 9, 240, 40, 40);
    OutTextXY(10, 10, 'Frame ' + Chr(48 + x mod 10));
    Delay(30);
  end;
end.
```

| Driver and mode | Screen | Colors |
| --- | --- | --- |
| `VGA`, `VGALo` / `VGAMed` / `VGAHi` | 640 × 200 / 350 / 480 | 16 (the EGA palette) |
| `Detect` | as `VGA`, `VGAHi` | 16 |
| `D1bit`, `D2bit`, `D4bit`, `D6bit`, `D8bit` + `m320x200` … `m2048x1536` | the chosen one | 2, 4, 16, 64, 256 (a palette) |
| `D15bit`, `D16bit`, `D24bit`, `D32bit` + a mode | the chosen one | colors as numbers: `$FF0000` is red for `D24bit` and `D32bit` |

 - Figures: `PutPixel`, `GetPixel`, `Line`, `LineTo`, `LineRel`, `MoveTo`,
   `Rectangle`, `Bar`, `Bar3D`, `Circle`, `Arc`, `Ellipse`, `FillEllipse`,
   `PieSlice`, `Sector`, `DrawPoly`, `FillPoly`, `FloodFill`,
   `ClearDevice`, `ClearViewPort`, `SetViewPort` (with clipping).
 - Styles: `SetColor`, `SetBkColor`, `SetLineStyle` (solid, dotted,
   dashed, a user pattern, thickness 1 and 3), `SetFillStyle` (12
   patterns), `SetFillPattern`, `SetWriteMode` (`XORPut`), `SetPalette`,
   `SetRGBPalette`, `GetImage`, `PutImage`, `ImageSize`.
 - Text: `OutText`, `OutTextXY`, `TextWidth`, `TextHeight`, `SetTextStyle`
   (an 8 × 8 font, magnification, horizontal and vertical),
   `SetTextJustify`, `SetUserCharSize`. Vector BGI fonts (`.chr`) are not
   supported - the bitmap font is used instead. The font has Latin letters
   and ASCII symbols; it has no Cyrillic letters.
 - `CloseGraph` turns graphics off and leaves the canvas as it is.
 - `Write` prints to the output in graphics mode too, not onto the
   picture.

## Waiting

`Delay(ms)` (unit `Crt`) and `Sleep(ms)` (`SysUtils`) really wait: the run
ends and the program goes on in a timer of the engine (see
[programs that wait](README.md#shared-rules)).

## JavaScript and host modules

A JavaScript value lives in variables of the type `JSValue` (or `Variant`).
Its properties and methods go after a dot: `t.title`, `t.value('B2')`,
`ctx.fillStyle := 'red'`, `ctx.fillRect(0, 0, 50, 40)`; `a[i]` of a
JavaScript array is an element. Member names keep their case, as in
JavaScript.

| Name | What it gives |
| --- | --- |
| `JS` | the JavaScript global object: `JS.Math.max(1, 5)`, `JS.JSON.stringify(x)` |
| `JSArray(a, b, …)`, `JSObject` | a new array, a new empty object |
| `JSNew(constructor, arguments…)` | `new`: `JSNew(JS.Map)` |
| `JSFunction(@Routine)` | a Pascal routine as a JavaScript function |
| `JSNull`, `JSUndefined`, `JSIsNull(x)`, `JSTypeOf(x)` | `null`, `undefined`, the check, `typeof` |

 - Pascal values go to JavaScript by their type: numbers and strings as
   they are, an array as an array, a record as an object with fields, a set
   as an array, an enumeration value as its name. Back, a `JSValue` is
   assigned to a variable of any simple type: `n := t.rows.length`,
   `s := t.value('A2')`; a number in a string is taken too. Explicitly:
   `Integer(x)`, `Double(x)`, `string(x)`, `Boolean(x)`.
 - A `JSValue` with a number or a string works in expressions with them:
   `t.rows.length - 1`; two `JSValue`s compare as in JavaScript.
 - `JS.name := JSFunction(@Square)` gives JavaScript a function
   `name(…)`: its arguments are converted to the parameter types, the
   result is returned. `var` parameters are not allowed in such a routine.
 - These are names of the program, not keywords: a variable `JS` hides
   them in its code.
 - **Host modules**: a module `app` is the unit `App` with routines in
   PascalCase: `App.Greet('Ann')`, `App.IsEven(4)`, `App.Counter` (a getter
   is a function without parentheses). A global module is used implicitly:
   `Greet('Ann')`, `Counter`; a routine with the name of a `System` routine
   is reached only as `App.Name`. A function without a result is a
   procedure. Types: `int` is `Int64`, `number` `Double`, `string`
   `String`, `bool` `Boolean`, `value` and `array` `JSValue`; optional
   parameters give overloads.

```pascal
var canvas, ctx: JSValue;
begin
  canvas := JS.canvas;     // a canvas the application put into a global variable
  ctx := canvas.getContext('2d');
  ctx.fillStyle := 'orange';
  ctx.fillRect(10, 10, 120, 80);
  WriteLn(JS.Math.max(1, 5), ' ', JSTypeOf(ctx));
end.
```

## Differences from Free Pascal

 - Array and string indices are always checked (in Free Pascal only with
   `{$R+}`); an assignment outside the range of a type truncates the value,
   as Free Pascal without `{$R+}`; `{$R+}` and `{$Q+}` change nothing else.
 - `Extended` is computed with the precision of `Double`: the last digits
   of `Extended` computations (`Sin`, `Exp`, `Ln`, `Pi`) may differ.
 - `Comp` and `Currency` are stored as `Double`: values beyond 2^53 units
   (about 9·10^15 for `Comp`, 9·10^11 for `Currency`) lose their last
   digits, and the extreme values of the types cannot be represented.
 - A float overflow (an infinity) is detected on assignment and output, not
   in every operation.
 - `TStringList.Sort`, `CustomSort` and `TList.Sort` are stable merge
   sorts: Free Pascal uses a quicksort with a random pivot, so equal items
   may come in another order there, and its sort consumes `Random` numbers
   (the `Random` sequence after a sort differs).
 - `Graph`: lines, rectangles, bars, fill patterns, polygons, flood fill,
   XOR mode and text placement match Free Pascal (`ptcgraph`) pixel for
   pixel; circles, arcs and ellipses may differ in a few pixels of their
   outline, and some glyphs of the 8 × 8 font differ (it is the font of
   QB64-PE).
 - Missing: generics, interfaces, operator overloading, records with
   methods, `PChar` and memory routines (`GetMem`, `FreeMem`, pointer
   arithmetic), assembler, threads, writing host files, the units `Dos`,
   `SysCall`, `Windows`.
 - `AnsiUpperCase` and the `Ansi…Text` comparisons understand any
   alphabet.
 - An object after `Free` goes on existing until garbage collection.

Shared rules: [languages](README.md#shared-rules). Internals:
[Pascal in the translator](../internals/pascal.md).
