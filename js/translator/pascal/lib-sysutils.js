// Pascal: the SysUtils unit - exceptions (in Pascal), conversions of
// strings and numbers, Format, date and time (the external routines are in
// JavaScript).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    Pascal.libraryUnits = Pascal.libraryUnits || Object.create(null);
    if (Pascal.libraryUnits.sysutils)
        return;

    var J = T.J;
    var t = Pascal.t;
    var utf8 = T.utf8;
    var i64 = T.i64;
    var u64 = T.u64;
    var big = T.big;

    var SOURCE = [
        'unit SysUtils;',
        'interface',
        'type',
        '  Exception = class(TObject)',
        '  private',
        '    FMessage: string;',
        '    FHelpContext: LongInt;',
        '  public',
        '    constructor Create(const Msg: string);',
        '    constructor CreateFmt(const Msg: string; const Args: array of const);',
        '    constructor CreateHelp(const Msg: string; AHelpContext: LongInt);',
        '    function ToString: string; override;',
        '    property Message: string read FMessage write FMessage;',
        '    property HelpContext: LongInt read FHelpContext write FHelpContext;',
        '  end;',
        '  ExceptClass = class of Exception;',
        '  EAbort = class(Exception);',
        '  EExternal = class(Exception);',
        '  EIntError = class(EExternal);',
        '  EDivByZero = class(EIntError);',
        '  ERangeError = class(EIntError);',
        '  EIntOverflow = class(EIntError);',
        '  EMathError = class(EExternal);',
        '  EInvalidOp = class(EMathError);',
        '  EZeroDivide = class(EMathError);',
        '  EOverflow = class(EMathError);',
        '  EUnderflow = class(EMathError);',
        '  EAccessViolation = class(EExternal);',
        '  EBusError = class(EAccessViolation);',
        '  EPrivilege = class(EExternal);',
        '  EStackOverflow = class(EExternal);',
        '  EControlC = class(EExternal);',
        '  EHeapMemoryError = class(Exception);',
        '  EOutOfMemory = class(EHeapMemoryError);',
        '  EInvalidPointer = class(EHeapMemoryError);',
        '  EInOutError = class(Exception)',
        '  public',
        '    ErrorCode: Integer;',
        '  end;',
        '  EConvertError = class(Exception);',
        '  EAbstractError = class(Exception);',
        '  EAssertionFailed = class(Exception);',
        '  EInvalidCast = class(Exception);',
        '  EVariantError = class(Exception);',
        '  EObjectCheck = class(Exception);',
        '  ENotImplemented = class(Exception);',
        '  EArgumentException = class(Exception);',
        '  EArgumentOutOfRangeException = class(EArgumentException);',
        '  EArgumentNilException = class(EArgumentException);',
        '  EInvalidOpException = class(Exception);',
        '  ENotSupportedException = class(Exception);',
        '  ENoConstructException = class(Exception);',
        '  EOSError = class(Exception)',
        '  public',
        '    ErrorCode: LongInt;',
        '  end;',
        '  EFileNotFoundException = class(Exception);',
        '  EDirectoryNotFoundException = class(Exception);',
        '  EPathNotFoundException = class(Exception);',
        '  TReplaceFlags = set of (rfReplaceAll, rfIgnoreCase);',
        '  TFloatFormat = (ffGeneral, ffExponent, ffFixed, ffNumber, ffCurrency);',
        '  TDateTime = Double;',
        '  TDate = TDateTime;',
        '  TTime = TDateTime;',
        '  TSysCharSet = set of Char;',
        '  TStringArray = array of string;',
        '  TBytes = array of Byte;',
        '  TFormatSettings = record',
        '    CurrencyFormat: Byte;',
        '    NegCurrFormat: Byte;',
        '    ThousandSeparator: Char;',
        '    DecimalSeparator: Char;',
        '    CurrencyDecimals: Byte;',
        '    DateSeparator: Char;',
        '    TimeSeparator: Char;',
        '    ListSeparator: Char;',
        '    CurrencyString: string;',
        '    ShortDateFormat: string;',
        '    LongDateFormat: string;',
        '    TimeAMString: string;',
        '    TimePMString: string;',
        '    ShortTimeFormat: string;',
        '    LongTimeFormat: string;',
        '    ShortMonthNames: array[1..12] of string;',
        '    LongMonthNames: array[1..12] of string;',
        '    ShortDayNames: array[1..7] of string;',
        '    LongDayNames: array[1..7] of string;',
        '    TwoDigitYearCenturyWindow: Word;',
        '  end;',
        'const',
        '  sLineBreak = LineEnding;',
        '  HexDisplayPrefix = \'$\';',
        '  MinDateTime: TDateTime = -693593.0;',
        '  MaxDateTime: TDateTime = 2958465.99999999;',
        '  HoursPerDay = 24;',
        '  MinsPerHour = 60;',
        '  SecsPerMin = 60;',
        '  MSecsPerSec = 1000;',
        '  MinsPerDay = 1440;',
        '  SecsPerDay = 86400;',
        '  MSecsPerDay = 86400000;',
        '  DateDelta = 693594;',
        '  UnixDateDelta = 25569;',
        'var',
        '  DefaultFormatSettings: TFormatSettings;',
        '',
        'function IntToStr(Value: LongInt): string; overload; external;',
        'function IntToStr(Value: Int64): string; overload; external;',
        'function IntToStr(Value: QWord): string; overload; external;',
        'function IntToHex(Value: Int64; Digits: Integer): string; overload; external;',
        'function IntToHex(Value: Int64): string; overload; external;',
        'function StrToInt(const S: string): LongInt; external;',
        'function StrToInt64(const S: string): Int64; external;',
        'function StrToQWord(const S: string): QWord; external;',
        'function StrToUInt(const S: string): Cardinal; external;',
        'function StrToIntDef(const S: string; Default: LongInt): LongInt; external;',
        'function StrToInt64Def(const S: string; Default: Int64): Int64; external;',
        'function StrToQWordDef(const S: string; Default: QWord): QWord; external;',
        'function TryStrToInt(const S: string; out Value: LongInt): Boolean; external;',
        'function TryStrToInt64(const S: string; out Value: Int64): Boolean; external;',
        'function TryStrToQWord(const S: string; out Value: QWord): Boolean; external;',
        'function FloatToStr(Value: Extended): string; overload; external;',
        'function FloatToStr(Value: Double): string; overload; external;',
        'function FloatToStr(Value: Single): string; overload; external;',
        'function FloatToStrF(Value: Extended; Format: TFloatFormat; Precision, Digits: Integer): string; overload; external;',
        'function FloatToStrF(Value: Double; Format: TFloatFormat; Precision, Digits: Integer): string; overload; external;',
        'function FloatToStrF(Value: Single; Format: TFloatFormat; Precision, Digits: Integer): string; overload; external;',
        'function FormatFloat(const Format: string; Value: Extended): string; external;',
        'function StrToFloat(const S: string): Extended; external;',
        'function StrToFloatDef(const S: string; const Default: Extended): Extended; external;',
        'function TryStrToFloat(const S: string; out Value: Double): Boolean; overload; external;',
        'function TryStrToFloat(const S: string; out Value: Single): Boolean; overload; external;',
        'function TryStrToFloat(const S: string; out Value: Extended): Boolean; overload; external;',
        'function BoolToStr(B: Boolean; UseBoolStrs: Boolean = False): string; overload; external;',
        'function BoolToStr(B: Boolean; const TrueS, FalseS: string): string; overload; external;',
        'function StrToBool(const S: string): Boolean; external;',
        'function StrToBoolDef(const S: string; Default: Boolean): Boolean; external;',
        'function TryStrToBool(const S: string; out Value: Boolean): Boolean; external;',
        'function Format(const Fmt: string; const Args: array of const): string; external;',
        'function UpperCase(const S: string): string; external;',
        'function AnsiUpperCase(const S: string): string; external;',
        'function AnsiLowerCase(const S: string): string; external;',
        'function Trim(const S: string): string; external;',
        'function TrimLeft(const S: string): string; external;',
        'function TrimRight(const S: string): string; external;',
        'function CompareStr(const S1, S2: string): Integer; external;',
        'function CompareText(const S1, S2: string): Integer; external;',
        'function SameText(const S1, S2: string): Boolean; external;',
        'function SameStr(const S1, S2: string): Boolean; external;',
        'function AnsiCompareStr(const S1, S2: string): Integer; external;',
        'function AnsiCompareText(const S1, S2: string): Integer; external;',
        'function AnsiSameText(const S1, S2: string): Boolean; external;',
        'function AnsiSameStr(const S1, S2: string): Boolean; external;',
        'function QuotedStr(const S: string): string; external;',
        'function AnsiQuotedStr(const S: string; Quote: Char): string; external;',
        'function AnsiDequotedStr(const S: string; AQuote: Char): string; external;',
        'function StringReplace(const S, OldPattern, NewPattern: string; Flags: TReplaceFlags): string; external;',
        'function AnsiPos(const Substr, S: string): Integer; external;',
        'function LastDelimiter(const Delimiters, S: string): Integer; external;',
        'function IsDelimiter(const Delimiters, S: string; Index: Integer): Boolean; external;',
        'function AdjustLineBreaks(const S: string): string; external;',
        'function WrapText(const Line: string; MaxCol: Integer): string; external;',
        'function ExtractFileName(const FileName: string): string; external;',
        'function ExtractFileExt(const FileName: string): string; external;',
        'function ExtractFilePath(const FileName: string): string; external;',
        'function ExtractFileDir(const FileName: string): string; external;',
        'function ChangeFileExt(const FileName, Extension: string): string; external;',
        'function IncludeTrailingPathDelimiter(const Path: string): string; external;',
        'function ExcludeTrailingPathDelimiter(const Path: string): string; external;',
        'function FileExists(const FileName: string): Boolean; external;',
        'function DeleteFile(const FileName: string): Boolean; external;',
        'function RenameFile(const OldName, NewName: string): Boolean; external;',
        'function GetEnvironmentVariable(const Name: string): string; external;',
        'function Now: TDateTime; external;',
        'function Date: TDateTime; external;',
        'function Time: TDateTime; external;',
        'function EncodeDate(Year, Month, Day: Word): TDateTime; external;',
        'function EncodeTime(Hour, Min, Sec, MSec: Word): TDateTime; external;',
        'procedure DecodeDate(const DateTime: TDateTime; out Year, Month, Day: Word); external;',
        'procedure DecodeTime(const DateTime: TDateTime; out Hour, Min, Sec, MSec: Word); external;',
        'function DayOfWeek(DateTime: TDateTime): Integer; external;',
        'function IsLeapYear(Year: Word): Boolean; external;',
        'function IncMonth(const DateTime: TDateTime; NumberOfMonths: Integer = 1): TDateTime; external;',
        'function FormatDateTime(const FormatStr: string; DateTime: TDateTime): string; external;',
        'function DateToStr(Date: TDateTime): string; external;',
        'function TimeToStr(Time: TDateTime): string; external;',
        'function DateTimeToStr(DateTime: TDateTime): string; external;',
        'function GetTickCount: LongWord; external;',
        'function GetTickCount64: QWord; external;',
        'procedure Abort;',
        'procedure FreeAndNil(var Obj); external;',
        'procedure Beep; external;',
        '',
        'implementation',
        '',
        'constructor Exception.Create(const Msg: string);',
        'begin',
        '  inherited Create;',
        '  FMessage := Msg;',
        'end;',
        '',
        'constructor Exception.CreateFmt(const Msg: string; const Args: array of const);',
        'begin',
        '  inherited Create;',
        '  FMessage := Format(Msg, Args);',
        'end;',
        '',
        'constructor Exception.CreateHelp(const Msg: string; AHelpContext: LongInt);',
        'begin',
        '  inherited Create;',
        '  FMessage := Msg;',
        '  FHelpContext := AHelpContext;',
        'end;',
        '',
        'function Exception.ToString: string;',
        'begin',
        '  Result := ClassName + \': \' + Message;',
        'end;',
        '',
        'procedure Abort;',
        'begin',
        '  raise EAbort.Create(\'Operation aborted\');',
        'end;',
        '',
        'end.'
    ].join('\n');

    function settings(session) {
        return session.V['sysutils$defaultformatsettings'];
    }

    function convertError(rt, text) {
        var made = rt.session.makeException('econverterror', text);
        made.stack = new Error(text).stack;
        throw made;
    }

    // An integer from a string with a check: as StrToInt of FPC (Val, an error raises EConvertError).
    function parseInt(rt, text, ik) {
        var parsed = Pascal.valInt(text, ik);
        if (parsed.code !== 0)
            convertError(rt, '"' + text + '" is an invalid integer');
        return parsed.value;
    }

    function trimSpaces(text, left, right) {
        var start = 0, end = text.length;
        if (left)
            while (start < end && text.charCodeAt(start) <= 32)
                ++start;
        if (right)
            while (end > start && text.charCodeAt(end - 1) <= 32)
                --end;
        return text.substring(start, end);
    }

    function upperAscii(text) {
        return text.replace(/[a-z]+/g, function (part) { return part.toUpperCase(); });
    }
    function lowerAscii(text) {
        return text.replace(/[A-Z]+/g, function (part) { return part.toLowerCase(); });
    }

    function compare(left, right) {
        return left < right ? -1 : (left > right ? 1 : 0);
    }

    // FloatToStr for Val: the decimal separator from the settings.
    function textToFloat(rt, session, source) {
        var ds = String.fromCharCode(settings(session).decimalseparator);
        var text = trimSpaces(source, true, true);
        if (ds !== '.') {
            if (text.indexOf('.') >= 0)
                return null;
            text = text.split(ds).join('.');
        }
        var parsed = Pascal.valReal(text);
        return parsed.code === 0 ? parsed.value : null;
    }

    // --- Date and time (TDateTime - days since 30.12.1899, local time)

    var DAY = 86400000;
    var EPOCH = Date.UTC(1899, 11, 30);

    function toDateTime(date) {
        var local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(),
                             date.getSeconds(), date.getMilliseconds());
        return (local - EPOCH) / DAY;
    }

    // The parts of a TDateTime: year, month, day, hours, minutes, seconds, ms, day of week.
    function parts(dt) {
        var days = Math.floor(dt);
        var ms = Math.round(Math.abs(dt - days) * DAY);
        if (dt < 0 && dt !== days)
            ms = Math.round((dt - days) * DAY);
        var date = new Date(EPOCH + days * DAY);
        return {
            year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
            hour: Math.floor(ms / 3600000), minute: Math.floor(ms / 60000) % 60, second: Math.floor(ms / 1000) % 60,
            ms: ms % 1000, dow: date.getUTCDay() + 1
        };
    }

    function two(value) {
        return (value < 10 ? '0' : '') + value;
    }

    // FormatDateTime: d dd ddd dddd ddddd dddddd m mm mmm mmmm yy yyyy
    // h hh n nn s ss z zzz am/pm a/p ampm c t tt / : "literals".
    function formatDateTime(session, format, dt, nesting) {
        var fs = settings(session);
        var dateParts = parts(dt);
        var out = '';
        var position = 0;
        var clock12 = /am\/pm|a\/p|ampm/i.test(format);
        var lastWasHour = false;
        while (position < format.length) {
            var character = format.charAt(position);
            var lower = character.toLowerCase();
            var run = 1;
            while (position + run < format.length && format.charAt(position + run).toLowerCase() === lower)
                ++run;
            if (character === '"' || character === "'") {
                var end = format.indexOf(character, position + 1);
                if (end < 0)
                    end = format.length;
                out += format.substring(position + 1, end);
                position = end + 1;
                continue;
            }
            if (/^am\/pm/i.test(format.substr(position, 5))) {
                out += dateParts.hour < 12 ? fs.timeamstring : fs.timepmstring;
                position += 5;
                continue;
            }
            if (/^a\/p/i.test(format.substr(position, 3))) {
                out += dateParts.hour < 12 ? (character === 'A' ? 'A' : 'a') : (character === 'A' ? 'P' : 'p');
                position += 3;
                continue;
            }
            if (/^ampm/i.test(format.substr(position, 4))) {
                out += dateParts.hour < 12 ? fs.timeamstring : fs.timepmstring;
                position += 4;
                continue;
            }
            switch (lower) {
            case 'y':
                out += run <= 2 ? two(dateParts.year % 100) : String(dateParts.year);
                break;
            case 'm':
                if (lastWasHour && run <= 2)
                    out += run === 1 ? String(dateParts.minute) : two(dateParts.minute);
                else if (run === 1)
                    out += String(dateParts.month);
                else if (run === 2)
                    out += two(dateParts.month);
                else if (run === 3)
                    out += fs.shortmonthnames[dateParts.month - 1];
                else
                    out += fs.longmonthnames[dateParts.month - 1];
                break;
            case 'd':
                if (run === 1)
                    out += String(dateParts.day);
                else if (run === 2)
                    out += two(dateParts.day);
                else if (run === 3)
                    out += fs.shortdaynames[dateParts.dow - 1];
                else if (run === 4)
                    out += fs.longdaynames[dateParts.dow - 1];
                else if (run === 5)
                    out += formatDateTime(session, fs.shortdateformat, dt, (nesting || 0) + 1);
                else
                    out += formatDateTime(session, fs.longdateformat, dt, (nesting || 0) + 1);
                break;
            case 'h': {
                var hour = dateParts.hour;
                if (clock12) {
                    hour = hour % 12;
                    if (hour === 0)
                        hour = 12;
                }
                out += run === 1 ? String(hour) : two(hour);
                break;
            }
            case 'n':
                out += run === 1 ? String(dateParts.minute) : two(dateParts.minute);
                break;
            case 's':
                out += run === 1 ? String(dateParts.second) : two(dateParts.second);
                break;
            case 'z':
                out += run >= 3 ? ('00' + dateParts.ms).slice(-3) : String(dateParts.ms);
                break;
            case 't':
                out += formatDateTime(session, run === 1 ? fs.shorttimeformat : fs.longtimeformat, dt, (nesting || 0) + 1);
                break;
            case 'c':
                out += formatDateTime(session, fs.shortdateformat, dt, (nesting || 0) + 1);
                if (dt !== Math.floor(dt))
                    out += ' ' + formatDateTime(session, fs.longtimeformat, dt, (nesting || 0) + 1);
                break;
            case '/':
                out += String.fromCharCode(fs.dateseparator);
                break;
            case ':':
                out += String.fromCharCode(fs.timeseparator);
                break;
            default:
                out += format.substr(position, run);
            }
            lastWasHour = lower === 'h' || (lastWasHour && (lower === ' ' || lower === ':'));
            position += run;
        }
        return out;
    }

    function natives(rt, session) {
        var table = {};
        table.inttostr = function (value) {
            return typeof value === 'number' ? String(value) : i64.str(value);
        };
        table.inttohex = [
            function (value, digits) {
                var text = u64.str(u64.fromSigned(value), 16).toUpperCase();
                while (text.length < digits)
                    text = '0' + text;
                return text;
            },
            function (value) {
                return u64.str(u64.fromSigned(value), 16).toUpperCase().replace(/^/, '');
            }
        ];
        table.inttohex[1] = function (value) {
            var text = u64.str(u64.fromSigned(value), 16).toUpperCase();
            while (text.length < 16)
                text = '0' + text;
            return text;
        };
        table.strtoint = function (text) { return parseInt(rt, text, 'i32'); };
        table.strtoint64 = function (text) { return parseInt(rt, text, 'i64'); };
        table.strtoqword = function (text) { return parseInt(rt, text, 'u64'); };
        table.strtouint = function (text) { return parseInt(rt, text, 'u32'); };
        function intDef(ik) {
            return function (text, def) {
                var parsed = Pascal.valInt(text, ik);
                return parsed.code === 0 ? parsed.value : def;
            };
        }
        table.strtointdef = intDef('i32');
        table.strtoint64def = intDef('i64');
        table.strtoqworddef = intDef('u64');
        function tryInt(ik) {
            return function (text, owner, key) {
                var parsed = Pascal.valInt(text, ik);
                if (parsed.code !== 0)
                    return false;
                owner[key] = parsed.value;
                return true;
            };
        }
        table.trystrtoint = tryInt('i32');
        table.trystrtoint64 = tryInt('i64');
        table.trystrtoqword = tryInt('u64');
        table.floattostr = ['f80', 'f64', 'f32'].map(function (kind) {
            return function (value) {
                return Pascal.floatToStr(value, kind, settings(session));
            };
        });
        table.floattostrf = [
            function (value, format, precision, digits) {
                return Pascal.floatToStrF(value, format, precision, digits, 'f80', settings(session));
            },
            function (value, format, precision, digits) {
                return Pascal.floatToStrF(value, format, precision, digits, 'f64', settings(session));
            },
            function (value, format, precision, digits) {
                return Pascal.floatToStrF(value, format, precision, digits, 'f32', settings(session));
            }
        ];
        table.formatfloat = function (format, value) {
            return Pascal.formatFloat(format, value, 'f80', settings(session));
        };
        table.strtofloat = function (text) {
            var value = textToFloat(rt, session, text);
            if (value === null)
                convertError(rt, '"' + text + '" is an invalid float');
            return value;
        };
        table.strtofloatdef = function (text, def) {
            var value = textToFloat(rt, session, text);
            return value === null ? def : value;
        };
        var tryFloat = function (round) {
            return function (text, owner, key) {
                var value = textToFloat(rt, session, text);
                if (value === null)
                    return false;
                owner[key] = round ? Math.fround(value) : value;
                return true;
            };
        };
        table.trystrtofloat = [tryFloat(false), tryFloat(true), tryFloat(false)];
        table.booltostr = [
            function (value, useBoolStrs) { return useBoolStrs ? (value ? 'True' : 'False') : (value ? '-1' : '0'); },
            function (value, trueS, falseS) { return value ? trueS : falseS; }
        ];
        function tryBool(text) {
            var parsed = Pascal.valReal(upperAscii(text));
            if (parsed.code === 0)
                return parsed.value !== 0;
            var upper = upperAscii(text);
            if (upper === 'TRUE')
                return true;
            if (upper === 'FALSE')
                return false;
            return null;
        }
        table.strtobool = function (text) {
            var value = tryBool(text);
            if (value === null)
                convertError(rt, '"' + text + '" is not a valid boolean.');
            return value;
        };
        table.strtobooldef = function (text, def) {
            var value = tryBool(text);
            return value === null ? def : value;
        };
        table.trystrtobool = function (text, owner, key) {
            var value = tryBool(text);
            if (value === null)
                return false;
            owner[key] = value;
            return true;
        };
        table.format = function (fmt, args) {
            return Pascal.format(rt, fmt, args, settings(session));
        };
        table.uppercase = upperAscii;
        table.ansiuppercase = function (text) { return utf8.encode(utf8.decode(text).toUpperCase()); };
        table.ansilowercase = function (text) { return utf8.encode(utf8.decode(text).toLowerCase()); };
        table.trim = function (text) { return trimSpaces(text, true, true); };
        table.trimleft = function (text) { return trimSpaces(text, true, false); };
        table.trimright = function (text) { return trimSpaces(text, false, true); };
        table.comparestr = function (left, right) {
            // The difference of the first differing bytes or of the lengths (as FPC).
            var length = Math.min(left.length, right.length);
            for (var index = 0; index < length; ++index) {
                var difference = left.charCodeAt(index) - right.charCodeAt(index);
                if (difference !== 0)
                    return difference;
            }
            return left.length - right.length;
        };
        table.comparetext = function (left, right) { return table.comparestr(lowerAscii(left), lowerAscii(right)); };
        table.sametext = function (left, right) { return lowerAscii(left) === lowerAscii(right); };
        table.samestr = function (left, right) { return left === right; };
        table.ansicomparestr = function (left, right) { return compare(utf8.decode(left), utf8.decode(right)); };
        table.ansicomparetext = function (left, right) {
            return compare(utf8.decode(left).toLowerCase(), utf8.decode(right).toLowerCase());
        };
        table.ansisametext = function (left, right) {
            return utf8.decode(left).toLowerCase() === utf8.decode(right).toLowerCase();
        };
        table.ansisamestr = function (left, right) { return left === right; };
        table.quotedstr = function (text) { return "'" + text.split("'").join("''") + "'"; };
        table.ansiquotedstr = function (text, quote) {
            var mark = String.fromCharCode(quote);
            return mark + text.split(mark).join(mark + mark) + mark;
        };
        table.ansidequotedstr = function (text, quote) {
            var mark = String.fromCharCode(quote);
            if (text.charAt(0) !== mark)
                return text;
            var out = '';
            for (var index = 1; index < text.length; ++index) {
                var character = text.charAt(index);
                if (character === mark) {
                    if (text.charAt(index + 1) === mark) {
                        out += mark;
                        ++index;
                        continue;
                    }
                    return out;
                }
                out += character;
            }
            return text;
        };
        table.stringreplace = function (text, oldPattern, newPattern, flags) {
            var all = (flags & 1) !== 0, ignoreCase = (flags & 2) !== 0;
            if (oldPattern.length === 0)
                return text;
            var haystack = ignoreCase ? upperAscii(text) : text;
            var needle = ignoreCase ? upperAscii(oldPattern) : oldPattern;
            var out = '';
            var from = 0;
            for (;;) {
                var found = haystack.indexOf(needle, from);
                if (found < 0)
                    break;
                out += text.substring(from, found) + newPattern;
                from = found + oldPattern.length;
                if (!all)
                    break;
            }
            return out + text.substring(from);
        };
        table.ansipos = function (sub, text) { return sub.length === 0 ? 0 : text.indexOf(sub) + 1; };
        table.lastdelimiter = function (delimiters, text) {
            for (var index = text.length - 1; index >= 0; --index) {
                if (delimiters.indexOf(text.charAt(index)) >= 0)
                    return index + 1;
            }
            return 0;
        };
        table.isdelimiter = function (delimiters, text, index) {
            if (index < 1 || index > text.length)
                return false;
            return delimiters.indexOf(text.charAt(index - 1)) >= 0;
        };
        table.adjustlinebreaks = function (text) { return text.replace(/\r\n|\r/g, '\n'); };
        table.wraptext = function (line, maxCol) {
            var words = line.split(' ');
            var lines = [];
            var current = '';
            words.forEach(function (word) {
                if (current.length > 0 && current.length + 1 + word.length > maxCol) {
                    lines.push(current);
                    current = word;
                } else {
                    current = current.length > 0 ? current + ' ' + word : word;
                }
            });
            lines.push(current);
            return lines.join('\n');
        };
        table.extractfilename = function (name) {
            var at = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
            return name.substring(at + 1);
        };
        table.extractfileext = function (name) {
            var file = table.extractfilename(name);
            var dot = file.lastIndexOf('.');
            return dot < 0 ? '' : file.substring(dot);
        };
        table.extractfilepath = function (name) {
            var at = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
            return name.substring(0, at + 1);
        };
        table.extractfiledir = function (name) {
            var at = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
            return at <= 0 ? name.substring(0, Math.max(at, 0)) : name.substring(0, at);
        };
        table.changefileext = function (name, extension) {
            var file = table.extractfilename(name);
            var dot = file.lastIndexOf('.');
            var base = dot < 0 ? name : name.substring(0, name.length - file.length + dot);
            return base + extension;
        };
        table.includetrailingpathdelimiter = function (path) { return /\/$/.test(path) ? path : path + '/'; };
        table.excludetrailingpathdelimiter = function (path) { return path.replace(/\/$/, ''); };
        table.fileexists = function (name) {
            if (session.memoryFiles[name] !== undefined)
                return true;
            var text = session.env.readModule(utf8.decode(name));
            return text !== null && text !== undefined;
        };
        table.deletefile = function (name) {
            if (session.memoryFiles[name] === undefined)
                return false;
            delete session.memoryFiles[name];
            return true;
        };
        table.renamefile = function (oldName, newName) {
            if (session.memoryFiles[oldName] === undefined)
                return false;
            session.memoryFiles[newName] = session.memoryFiles[oldName];
            delete session.memoryFiles[oldName];
            return true;
        };
        table.getenvironmentvariable = function () { return ''; };
        table.now = function () { return toDateTime(new Date()); };
        table.date = function () { return Math.floor(toDateTime(new Date())); };
        table.time = function () {
            var now = toDateTime(new Date());
            return now - Math.floor(now);
        };
        table.encodedate = function (year, month, day) {
            var date = Date.UTC(year, month - 1, day);
            var check = new Date(date);
            if (month < 1 || month > 12 || day < 1 || check.getUTCDate() !== day || year < 1 || year > 9999)
                convertError(rt, 'Invalid date : ' + year + '/' + month + '/' + day);
            return (date - EPOCH) / DAY;
        };
        table.encodetime = function (hour, min, sec, msec) {
            if (hour > 23 || min > 59 || sec > 59 || msec > 999)
                convertError(rt, 'Invalid time encoding : ' + hour + ':' + min + ':' + sec + '.' + msec);
            return (((hour * 60 + min) * 60 + sec) * 1000 + msec) / DAY;
        };
        table.decodedate = function (dt, yo, yk, mo, mk, do_, dk) {
            var dateParts = parts(dt);
            yo[yk] = dateParts.year;
            mo[mk] = dateParts.month;
            do_[dk] = dateParts.day;
        };
        table.decodetime = function (dt, ho, hk, mo, mk, so, sk, zo, zk) {
            var dateParts = parts(dt);
            ho[hk] = dateParts.hour;
            mo[mk] = dateParts.minute;
            so[sk] = dateParts.second;
            zo[zk] = dateParts.ms;
        };
        table.dayofweek = function (dt) { return parts(dt).dow; };
        table.isleapyear = function (year) { return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0); };
        table.incmonth = function (dt, months) {
            var dateParts = parts(dt);
            var total = dateParts.year * 12 + (dateParts.month - 1) + months;
            var year = Math.floor(total / 12), month = total % 12;
            var last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
            var day = Math.min(dateParts.day, last);
            return (Date.UTC(year, month, day) - EPOCH) / DAY + (dt - Math.floor(dt));
        };
        table.formatdatetime = function (format, dt) { return formatDateTime(session, format, dt); };
        table.datetostr = function (dt) { return formatDateTime(session, 'ddddd', dt); };
        table.timetostr = function (dt) { return formatDateTime(session, 'tt', dt); };
        table.datetimetostr = function (dt) { return formatDateTime(session, 'c', dt); };
        var started = Date.now();
        table.gettickcount = function () { return (Date.now() - started) >>> 0; };
        table.gettickcount64 = function () { return Date.now() - started; };
        table.freeandnil = function (reference) {
            var object = reference.v;
            reference.v = null;
            if (object !== null && object !== undefined)
                object[session.tobject.methods.destroy[0].slot]();
        };
        table.beep = function () {};
        return { methods: {}, routines: table };
    }

    // The values of DefaultFormatSettings (as in FPC for Linux).
    function initSettings(session) {
        var fs = session.V['sysutils$defaultformatsettings'];
        fs.currencyformat = 1;
        fs.negcurrformat = 5;
        fs.thousandseparator = 44;
        fs.decimalseparator = 46;
        fs.currencydecimals = 2;
        fs.dateseparator = 45;
        fs.timeseparator = 58;
        fs.listseparator = 44;
        fs.currencystring = '$';
        fs.shortdateformat = 'd/m/y';
        fs.longdateformat = 'dd" "mmmm" "yyyy';
        fs.timeamstring = 'AM';
        fs.timepmstring = 'PM';
        fs.shorttimeformat = 'hh:nn';
        fs.longtimeformat = 'hh:nn:ss';
        ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].forEach(function (name, index) {
            fs.shortmonthnames[index] = name;
        });
        ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November',
         'December'].forEach(function (name, index) { fs.longmonthnames[index] = name; });
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(function (name, index) { fs.shortdaynames[index] = name; });
        ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].forEach(function (name, index) {
            fs.longdaynames[index] = name;
        });
        fs.twodigityearcenturywindow = 50;
    }

    Pascal.libraryUnits.sysutils = {
        title: 'SysUtils',
        source: SOURCE,
        natives: natives,
        builtins: function (scope) {
            scope.define('sleep', { kind: 'builtin', name: 'sleep', text: 'Sleep', handler: Pascal.waitBuiltin('Sleep') });
        },
        after: function (session, unit) {
            initSettings(session);
            // FormatSettings is the same object as DefaultFormatSettings;
            // the old globals DecimalSeparator and others are its fields.
            var settingsSymbol = unit.scope.names.defaultformatsettings;
            unit.scope.define('formatsettings', settingsSymbol);
            var type = settingsSymbol.type;
            ['DecimalSeparator', 'ThousandSeparator', 'DateSeparator', 'TimeSeparator', 'ShortDateFormat', 'LongDateFormat',
             'ShortTimeFormat', 'LongTimeFormat', 'CurrencyString', 'CurrencyDecimals', 'ListSeparator'].forEach(function (name) {
                var field = type.fieldMap[name.toLowerCase()];
                unit.scope.define(name.toLowerCase(), {
                    kind: 'var', storage: 'system', name: name.toLowerCase(), text: name, type: field.type,
                    ref: function () {
                        return new Pascal.PropRef(field.type, J.mem(J.id('$V'), settingsSymbol.js), J.str(field.js));
                    }
                });
            });
        }
    };
    void t;
    void big;
})(globalThis);
