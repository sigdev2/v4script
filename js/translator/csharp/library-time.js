// C#: time - TimeSpan and DateTime on ticks (100 ns) as in .NET, the
// invariant formats of dates, Stopwatch, and System.Diagnostics.Debug
// (its calls do nothing: a release build of csc drops them).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.library.units['system.time/TimeSpan'])
        return;

    CS.addLibrary('system.time', String.raw`
namespace System;

public readonly struct TimeSpan : IComparable, IComparable<TimeSpan>, IEquatable<TimeSpan>, IFormattable
{
    public const long TicksPerMillisecond = 10000;
    public const long TicksPerSecond = 10000000;
    public const long TicksPerMinute = 600000000;
    public const long TicksPerHour = 36000000000;
    public const long TicksPerDay = 864000000000;
    public static readonly TimeSpan Zero = new TimeSpan(0);
    public static readonly TimeSpan MaxValue = new TimeSpan(long.MaxValue);
    public static readonly TimeSpan MinValue = new TimeSpan(long.MinValue);
    internal readonly long _ticks;
    public TimeSpan(long ticks) { _ticks = ticks; }
    public TimeSpan(int hours, int minutes, int seconds) { _ticks = TimeToTicks(0, hours, minutes, seconds, 0); }
    public TimeSpan(int days, int hours, int minutes, int seconds) { _ticks = TimeToTicks(days, hours, minutes, seconds, 0); }
    public TimeSpan(int days, int hours, int minutes, int seconds, int milliseconds) { _ticks = TimeToTicks(days, hours, minutes, seconds, milliseconds); }
    private static long TimeToTicks(int days, int hours, int minutes, int seconds, int milliseconds)
    {
        decimal total = ((decimal)days * 86400 + (decimal)hours * 3600 + (decimal)minutes * 60 + seconds) * 1000 + milliseconds;
        total *= TicksPerMillisecond;
        if (total > long.MaxValue || total < long.MinValue)
            throw new ArgumentOutOfRangeException(null, "TimeSpan overflowed because the duration is too long.");
        return (long)total;
    }
    public long Ticks => _ticks;
    public int Days => (int)(_ticks / TicksPerDay);
    public int Hours => (int)(_ticks / TicksPerHour % 24);
    public int Minutes => (int)(_ticks / TicksPerMinute % 60);
    public int Seconds => (int)(_ticks / TicksPerSecond % 60);
    public int Milliseconds => (int)(_ticks / TicksPerMillisecond % 1000);
    public int Microseconds => (int)(_ticks / 10 % 1000);
    public int Nanoseconds => (int)(_ticks % 10 * 100);
    public double TotalDays => (double)_ticks / TicksPerDay;
    public double TotalHours => (double)_ticks / TicksPerHour;
    public double TotalMinutes => (double)_ticks / TicksPerMinute;
    public double TotalSeconds => (double)_ticks / TicksPerSecond;
    public double TotalMilliseconds
    {
        get
        {
            double value = (double)_ticks / TicksPerMillisecond;
            if (value > 922337203685477)
                return 922337203685477;
            if (value < -922337203685477)
                return -922337203685477;
            return value;
        }
    }
    public double TotalMicroseconds => (double)_ticks / 10;
    private static TimeSpan Interval(double value, double scale)
    {
        if (double.IsNaN(value))
            throw new ArgumentException("TimeSpan does not accept floating point Not-a-Number values.");
        double ticks = value * scale;
        if (ticks > long.MaxValue || ticks < long.MinValue)
            throw new OverflowException("TimeSpan overflowed because the duration is too long.");
        return new TimeSpan((long)ticks);
    }
    public static TimeSpan FromDays(double value) => Interval(value, TicksPerDay);
    public static TimeSpan FromHours(double value) => Interval(value, TicksPerHour);
    public static TimeSpan FromMinutes(double value) => Interval(value, TicksPerMinute);
    public static TimeSpan FromSeconds(double value) => Interval(value, TicksPerSecond);
    public static TimeSpan FromMilliseconds(double value) => Interval(value, TicksPerMillisecond);
    public static TimeSpan FromMicroseconds(double value) => Interval(value, 10);
    public static TimeSpan FromTicks(long value) => new TimeSpan(value);
    public TimeSpan Add(TimeSpan ts)
    {
        long result = _ticks + ts._ticks;
        if ((_ticks >> 63 == ts._ticks >> 63) && (_ticks >> 63 != result >> 63))
            throw new OverflowException("TimeSpan overflowed because the duration is too long.");
        return new TimeSpan(result);
    }
    public TimeSpan Subtract(TimeSpan ts)
    {
        long result = _ticks - ts._ticks;
        if ((_ticks >> 63 != ts._ticks >> 63) && (_ticks >> 63 != result >> 63))
            throw new OverflowException("TimeSpan overflowed because the duration is too long.");
        return new TimeSpan(result);
    }
    public TimeSpan Multiply(double factor) => Interval(_ticks, factor);
    public TimeSpan Divide(double divisor) => Interval(_ticks, 1 / divisor);
    public double Divide(TimeSpan ts) => (double)_ticks / ts._ticks;
    public TimeSpan Negate()
    {
        if (_ticks == long.MinValue)
            throw new OverflowException("Negating the minimum value of a twos complement number is invalid.");
        return new TimeSpan(-_ticks);
    }
    public TimeSpan Duration()
    {
        if (_ticks == long.MinValue)
            throw new OverflowException("The duration cannot be returned for TimeSpan.MinValue because the absolute value of TimeSpan.MinValue exceeds the value of TimeSpan.MaxValue.");
        return new TimeSpan(_ticks >= 0 ? _ticks : -_ticks);
    }
    public static TimeSpan operator +(TimeSpan t1, TimeSpan t2) => t1.Add(t2);
    public static TimeSpan operator -(TimeSpan t1, TimeSpan t2) => t1.Subtract(t2);
    public static TimeSpan operator -(TimeSpan t) => t.Negate();
    public static TimeSpan operator +(TimeSpan t) => t;
    public static TimeSpan operator *(TimeSpan timeSpan, double factor) => timeSpan.Multiply(factor);
    public static TimeSpan operator *(double factor, TimeSpan timeSpan) => timeSpan.Multiply(factor);
    public static TimeSpan operator /(TimeSpan timeSpan, double divisor) => timeSpan.Divide(divisor);
    public static double operator /(TimeSpan t1, TimeSpan t2) => t1.Divide(t2);
    public static bool operator ==(TimeSpan t1, TimeSpan t2) => t1._ticks == t2._ticks;
    public static bool operator !=(TimeSpan t1, TimeSpan t2) => t1._ticks != t2._ticks;
    public static bool operator <(TimeSpan t1, TimeSpan t2) => t1._ticks < t2._ticks;
    public static bool operator <=(TimeSpan t1, TimeSpan t2) => t1._ticks <= t2._ticks;
    public static bool operator >(TimeSpan t1, TimeSpan t2) => t1._ticks > t2._ticks;
    public static bool operator >=(TimeSpan t1, TimeSpan t2) => t1._ticks >= t2._ticks;
    public static int Compare(TimeSpan t1, TimeSpan t2) => t1._ticks.CompareTo(t2._ticks);
    public int CompareTo(TimeSpan value) => _ticks.CompareTo(value._ticks);
    public int CompareTo(object value)
    {
        if (value == null)
            return 1;
        if (value is TimeSpan other)
            return _ticks.CompareTo(other._ticks);
        throw new ArgumentException("Object must be of type TimeSpan.");
    }
    public bool Equals(TimeSpan obj) => _ticks == obj._ticks;
    public override bool Equals(object value) => value is TimeSpan other && _ticks == other._ticks;
    public static bool Equals(TimeSpan t1, TimeSpan t2) => t1._ticks == t2._ticks;
    public override int GetHashCode() => _ticks.GetHashCode();
    // The constant format: [-][d.]hh:mm:ss[.fffffff].
    public override string ToString() => Format("c");
    public string ToString(string format) => Format(format);
    public string ToString(string format, IFormatProvider formatProvider) => Format(format);
    private string Format(string format)
    {
        if (string.IsNullOrEmpty(format) || format == "c" || format == "t" || format == "T")
            return Standard(false, false);
        if (format == "g")
            return Standard(true, false);
        if (format == "G")
            return Standard(true, true);
        return Custom(format);
    }
    private string Standard(bool general, bool longForm)
    {
        long ticks = _ticks;
        var builder = new System.Text.StringBuilder();
        ulong magnitude = ticks < 0 ? (ulong)(-(ticks + 1)) + 1 : (ulong)ticks;
        if (ticks < 0)
            builder.Append('-');
        ulong days = magnitude / (ulong)TicksPerDay;
        ulong rest = magnitude % (ulong)TicksPerDay;
        int hours = (int)(rest / (ulong)TicksPerHour);
        int minutes = (int)(rest / (ulong)TicksPerMinute % 60);
        int seconds = (int)(rest / (ulong)TicksPerSecond % 60);
        int fraction = (int)(rest % (ulong)TicksPerSecond);
        if (general)
        {
            if (days != 0 || longForm)
                builder.Append(days).Append(':');
            builder.Append(longForm ? hours.ToString("00") : hours.ToString()).Append(':').Append(minutes.ToString("00")).Append(':').Append(seconds.ToString("00"));
            if (longForm)
                builder.Append('.').Append(fraction.ToString("0000000"));
            else if (fraction != 0)
                builder.Append('.').Append(fraction.ToString("0000000").TrimEnd('0'));
            return builder.ToString();
        }
        if (days != 0)
            builder.Append(days).Append('.');
        builder.Append(hours.ToString("00")).Append(':').Append(minutes.ToString("00")).Append(':').Append(seconds.ToString("00"));
        if (fraction != 0)
            builder.Append('.').Append(fraction.ToString("0000000"));
        return builder.ToString();
    }
    private string Custom(string format)
    {
        var builder = new System.Text.StringBuilder();
        long ticks = _ticks < 0 ? -_ticks : _ticks;
        int days = (int)(ticks / TicksPerDay);
        int hours = (int)(ticks / TicksPerHour % 24);
        int minutes = (int)(ticks / TicksPerMinute % 60);
        int seconds = (int)(ticks / TicksPerSecond % 60);
        int fraction = (int)(ticks % TicksPerSecond);
        int i = 0;
        while (i < format.Length)
        {
            char ch = format[i];
            int count = 1;
            while (i + count < format.Length && format[i + count] == ch && ch != '\\' && ch != '\'' && ch != '"')
                count++;
            switch (ch)
            {
                case 'd':
                    builder.Append(days.ToString(new string('0', count)));
                    break;
                case 'h':
                    builder.Append(hours.ToString(count >= 2 ? "00" : "0"));
                    break;
                case 'm':
                    builder.Append(minutes.ToString(count >= 2 ? "00" : "0"));
                    break;
                case 's':
                    builder.Append(seconds.ToString(count >= 2 ? "00" : "0"));
                    break;
                case 'f':
                    builder.Append(fraction.ToString("0000000").Substring(0, Math.Min(count, 7)));
                    break;
                case 'F':
                    builder.Append(fraction.ToString("0000000").Substring(0, Math.Min(count, 7)).TrimEnd('0'));
                    break;
                case '\\':
                    if (i + 1 < format.Length)
                        builder.Append(format[i + 1]);
                    count = 2;
                    break;
                case '\'':
                case '"':
                {
                    int end = format.IndexOf(ch, i + 1);
                    if (end < 0)
                        throw new FormatException("Input string was not in a correct format.");
                    builder.Append(format, i + 1, end - i - 1);
                    count = end - i + 1;
                    break;
                }
                case '%':
                    break;
                default:
                    throw new FormatException("Input string was not in a correct format.");
            }
            i += count;
        }
        return builder.ToString();
    }
    public static TimeSpan Parse(string s)
    {
        if (s == null)
            throw new ArgumentNullException("input");
        if (!TryParse(s, out var result))
            throw new FormatException("String '" + s + "' was not recognized as a valid TimeSpan.");
        return result;
    }
    public static bool TryParse(string s, out TimeSpan result)
    {
        result = Zero;
        if (s == null)
            return false;
        s = s.Trim();
        bool negative = s.StartsWith("-");
        if (negative)
            s = s.Substring(1);
        long days = 0;
        string time = s;
        int dot = s.IndexOf('.');
        int colon = s.IndexOf(':');
        if (dot >= 0 && (colon < 0 || dot < colon))
        {
            if (!long.TryParse(s.Substring(0, dot), out days))
                return false;
            time = s.Substring(dot + 1);
        }
        else if (colon < 0)
        {
            if (!long.TryParse(s, out days))
                return false;
            result = new TimeSpan((negative ? -days : days) * TicksPerDay);
            return true;
        }
        string[] parts = time.Split(':');
        if (parts.Length < 2 || parts.Length > 3)
            return false;
        if (!int.TryParse(parts[0], out int hours) || !int.TryParse(parts[1], out int minutes) || hours > 23 || minutes > 59)
            return false;
        long seconds = 0;
        long fraction = 0;
        if (parts.Length == 3)
        {
            string secondPart = parts[2];
            int point = secondPart.IndexOf('.');
            if (point >= 0)
            {
                string digits = secondPart.Substring(point + 1);
                if (digits.Length == 0 || digits.Length > 7 || !long.TryParse(digits, out fraction))
                    return false;
                for (int k = digits.Length; k < 7; k++)
                    fraction *= 10;
                secondPart = secondPart.Substring(0, point);
            }
            if (!long.TryParse(secondPart, out seconds) || seconds > 59)
                return false;
        }
        long total = days * TicksPerDay + hours * TicksPerHour + minutes * TicksPerMinute + seconds * TicksPerSecond + fraction;
        result = new TimeSpan(negative ? -total : total);
        return true;
    }
}

// A Guid keeps its text in the format D (lowercase).
public readonly struct Guid : IComparable, IComparable<Guid>, IEquatable<Guid>, IFormattable
{
    public static readonly Guid Empty = default(Guid);
    private readonly string _value;
    public Guid(string g)
    {
        if (g == null)
            throw new ArgumentNullException("g");
        if (!TryParse(g, out Guid result))
            throw new FormatException("Unrecognized Guid format.");
        _value = result._value;
    }
    public Guid(byte[] b)
    {
        if (b == null)
            throw new ArgumentNullException("b");
        if (b.Length != 16)
            throw new ArgumentException("Byte array for Guid must be exactly 16 bytes long.", "b");
        int[] order = { 3, 2, 1, 0, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13, 14, 15 };
        var builder = new System.Text.StringBuilder();
        for (int i = 0; i < 16; i++)
        {
            if (i == 4 || i == 6 || i == 8 || i == 10)
                builder.Append('-');
            builder.Append(b[order[i]].ToString("x2"));
        }
        _value = builder.ToString();
    }
    private Guid(string value, bool normalized) { _value = value; }
    private string Text => _value ?? "00000000-0000-0000-0000-000000000000";
    public static Guid NewGuid()
    {
        var random = Random.Shared;
        var bytes = new byte[16];
        random.NextBytes(bytes);
        bytes[7] = (byte)((bytes[7] & 0x0F) | 0x40);
        bytes[8] = (byte)((bytes[8] & 0x3F) | 0x80);
        return new Guid(bytes);
    }
    public static Guid Parse(string input)
    {
        if (input == null)
            throw new ArgumentNullException("input");
        if (!TryParse(input, out Guid result))
            throw new FormatException("Unrecognized Guid format.");
        return result;
    }
    public static bool TryParse(string input, out Guid result)
    {
        result = Empty;
        if (input == null)
            return false;
        string s = input.Trim();
        if ((s.StartsWith("{") && s.EndsWith("}")) || (s.StartsWith("(") && s.EndsWith(")")))
            s = s.Substring(1, s.Length - 2);
        string hex = s.Replace("-", "");
        if (hex.Length != 32)
            return false;
        if (s.Length == 36 && (s[8] != '-' || s[13] != '-' || s[18] != '-' || s[23] != '-'))
            return false;
        if (s.Length != 32 && s.Length != 36)
            return false;
        foreach (char c in hex)
            if (!char.IsAsciiHexDigit(c))
                return false;
        hex = hex.ToLowerInvariant();
        result = new Guid(hex.Substring(0, 8) + "-" + hex.Substring(8, 4) + "-" + hex.Substring(12, 4) + "-" + hex.Substring(16, 4) + "-" +
                          hex.Substring(20), true);
        return true;
    }
    public byte[] ToByteArray()
    {
        string hex = Text.Replace("-", "");
        int[] order = { 3, 2, 1, 0, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13, 14, 15 };
        var bytes = new byte[16];
        for (int i = 0; i < 16; i++)
            bytes[order[i]] = Convert.ToByte(hex.Substring(i * 2, 2), 16);
        return bytes;
    }
    public override string ToString() => Text;
    public string ToString(string format) => ToString(format, null);
    public string ToString(string format, IFormatProvider provider)
    {
        if (string.IsNullOrEmpty(format) || format == "D" || format == "d")
            return Text;
        switch (format)
        {
            case "N":
            case "n":
                return Text.Replace("-", "");
            case "B":
            case "b":
                return "{" + Text + "}";
            case "P":
            case "p":
                return "(" + Text + ")";
        }
        throw new FormatException("Format string can be only \"D\", \"d\", \"N\", \"n\", \"P\", \"p\", \"B\", \"b\", \"X\" or \"x\".");
    }
    public bool Equals(Guid g) => Text == g.Text;
    public override bool Equals(object o) => o is Guid g && Text == g.Text;
    public override int GetHashCode() => Text.GetHashCode();
    public int CompareTo(Guid value) => string.CompareOrdinal(Text, value.Text) < 0 ? -1 : (Text == value.Text ? 0 : 1);
    public int CompareTo(object value)
    {
        if (value == null)
            return 1;
        if (value is Guid g)
            return CompareTo(g);
        throw new ArgumentException("Object must be of type GUID.", "value");
    }
    public static bool operator ==(Guid a, Guid b) => a.Text == b.Text;
    public static bool operator !=(Guid a, Guid b) => a.Text != b.Text;
}

public enum DayOfWeek { Sunday = 0, Monday = 1, Tuesday = 2, Wednesday = 3, Thursday = 4, Friday = 5, Saturday = 6 }

public enum DateTimeKind { Unspecified = 0, Utc = 1, Local = 2 }

public readonly struct DateTime : IComparable, IComparable<DateTime>, IEquatable<DateTime>, IFormattable
{
    private const long TicksPerMillisecond = 10000;
    private const long TicksPerSecond = 10000000;
    private const long TicksPerMinute = 600000000;
    private const long TicksPerHour = 36000000000;
    private const long TicksPerDay = 864000000000;
    private const long MaxTicks = 3155378975999999999;
    private static readonly int[] DaysToMonth365 = { 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365 };
    private static readonly int[] DaysToMonth366 = { 0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366 };
    private static readonly string[] MonthNames = { "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" };
    private static readonly string[] DayNames = { "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" };
    public static readonly DateTime MinValue = new DateTime(0L);
    public static readonly DateTime MaxValue = new DateTime(MaxTicks);
    public static readonly DateTime UnixEpoch = new DateTime(621355968000000000L, DateTimeKind.Utc);
    private readonly long _ticks;
    private readonly DateTimeKind _kind;
    public DateTime(long ticks)
    {
        if (ticks < 0 || ticks > MaxTicks)
            throw new ArgumentOutOfRangeException("ticks", "Ticks must be between DateTime.MinValue.Ticks and DateTime.MaxValue.Ticks.");
        _ticks = ticks;
        _kind = DateTimeKind.Unspecified;
    }
    public DateTime(long ticks, DateTimeKind kind)
    {
        if (ticks < 0 || ticks > MaxTicks)
            throw new ArgumentOutOfRangeException("ticks", "Ticks must be between DateTime.MinValue.Ticks and DateTime.MaxValue.Ticks.");
        _ticks = ticks;
        _kind = kind;
    }
    public DateTime(int year, int month, int day) : this(DateToTicks(year, month, day)) { }
    public DateTime(int year, int month, int day, int hour, int minute, int second)
        : this(DateToTicks(year, month, day) + TimeToTicks(hour, minute, second)) { }
    public DateTime(int year, int month, int day, int hour, int minute, int second, DateTimeKind kind)
        : this(DateToTicks(year, month, day) + TimeToTicks(hour, minute, second), kind) { }
    public DateTime(int year, int month, int day, int hour, int minute, int second, int millisecond)
        : this(DateToTicks(year, month, day) + TimeToTicks(hour, minute, second) + MillisecondTicks(millisecond)) { }
    public DateTime(int year, int month, int day, int hour, int minute, int second, int millisecond, DateTimeKind kind)
        : this(DateToTicks(year, month, day) + TimeToTicks(hour, minute, second) + MillisecondTicks(millisecond), kind) { }
    private static long MillisecondTicks(int millisecond)
    {
        if (millisecond < 0 || millisecond >= 1000)
            throw new ArgumentOutOfRangeException("millisecond", "Valid values are between 0 and 999, inclusive.");
        return millisecond * TicksPerMillisecond;
    }
    private static long DateToTicks(int year, int month, int day)
    {
        if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1)
            throw new ArgumentOutOfRangeException(null, "Year, Month, and Day parameters describe an un-representable DateTime.");
        int[] days = IsLeapYear(year) ? DaysToMonth366 : DaysToMonth365;
        if (day > days[month] - days[month - 1])
            throw new ArgumentOutOfRangeException(null, "Year, Month, and Day parameters describe an un-representable DateTime.");
        int y = year - 1;
        int n = y * 365 + y / 4 - y / 100 + y / 400 + days[month - 1] + day - 1;
        return n * TicksPerDay;
    }
    private static long TimeToTicks(int hour, int minute, int second)
    {
        if (hour < 0 || hour >= 24 || minute < 0 || minute >= 60 || second < 0 || second >= 60)
            throw new ArgumentOutOfRangeException(null, "Hour, Minute, and Second parameters describe an un-representable DateTime.");
        return hour * TicksPerHour + minute * TicksPerMinute + second * TicksPerSecond;
    }
    public static bool IsLeapYear(int year)
    {
        if (year < 1 || year > 9999)
            throw new ArgumentOutOfRangeException("year", "Year must be between 1 and 9999.");
        return (year & 3) == 0 && ((year % 100) != 0 || (year % 400) == 0);
    }
    public static int DaysInMonth(int year, int month)
    {
        if (month < 1 || month > 12)
            throw new ArgumentOutOfRangeException("month", "Month must be between one and twelve.");
        int[] days = IsLeapYear(year) ? DaysToMonth366 : DaysToMonth365;
        return days[month] - days[month - 1];
    }
    // part: 0 year, 1 day of the year, 2 month, 3 day.
    private int GetDatePart(int part)
    {
        int n = (int)(_ticks / TicksPerDay);
        int y400 = n / 146097;
        n -= y400 * 146097;
        int y100 = n / 36524;
        if (y100 == 4)
            y100 = 3;
        n -= y100 * 36524;
        int y4 = n / 1461;
        n -= y4 * 1461;
        int y1 = n / 365;
        if (y1 == 4)
            y1 = 3;
        if (part == 0)
            return y400 * 400 + y100 * 100 + y4 * 4 + y1 + 1;
        n -= y1 * 365;
        if (part == 1)
            return n + 1;
        bool leapYear = y1 == 3 && (y4 != 24 || y100 == 3);
        int[] days = leapYear ? DaysToMonth366 : DaysToMonth365;
        int m = (n >> 5) + 1;
        while (n >= days[m])
            m++;
        if (part == 2)
            return m;
        return n - days[m - 1] + 1;
    }
    public long Ticks => _ticks;
    public DateTimeKind Kind => _kind;
    public int Year => GetDatePart(0);
    public int Month => GetDatePart(2);
    public int Day => GetDatePart(3);
    public int DayOfYear => GetDatePart(1);
    public DayOfWeek DayOfWeek => (DayOfWeek)((int)(_ticks / TicksPerDay + 1) % 7);
    public int Hour => (int)(_ticks / TicksPerHour % 24);
    public int Minute => (int)(_ticks / TicksPerMinute % 60);
    public int Second => (int)(_ticks / TicksPerSecond % 60);
    public int Millisecond => (int)(_ticks / TicksPerMillisecond % 1000);
    public DateTime Date => new DateTime(_ticks - _ticks % TicksPerDay, _kind);
    public TimeSpan TimeOfDay => new TimeSpan(_ticks % TicksPerDay);
    public static DateTime Now => new DateTime(NowTicks(false), DateTimeKind.Local);
    public static DateTime UtcNow => new DateTime(NowTicks(true), DateTimeKind.Utc);
    public static DateTime Today => Now.Date;
    private static extern long NowTicks(bool utc);
    public DateTime Add(TimeSpan value) => AddTicks(value.Ticks);
    public DateTime AddTicks(long value)
    {
        long ticks = _ticks + value;
        if (ticks < 0 || ticks > MaxTicks)
            throw new ArgumentOutOfRangeException("value", "The added or subtracted value results in an un-representable DateTime.");
        return new DateTime(ticks, _kind);
    }
    private DateTime AddUnits(double value, long scale)
    {
        double ticks = value * scale;
        if (ticks > MaxTicks || ticks < -MaxTicks)
            throw new ArgumentOutOfRangeException("value", "Value to add was out of range.");
        return AddTicks((long)ticks);
    }
    public DateTime AddDays(double value) => AddUnits(value, TicksPerDay);
    public DateTime AddHours(double value) => AddUnits(value, TicksPerHour);
    public DateTime AddMinutes(double value) => AddUnits(value, TicksPerMinute);
    public DateTime AddSeconds(double value) => AddUnits(value, TicksPerSecond);
    public DateTime AddMilliseconds(double value) => AddUnits(value, TicksPerMillisecond);
    public DateTime AddMonths(int months)
    {
        if (months < -120000 || months > 120000)
            throw new ArgumentOutOfRangeException("months", "Months value must be between +/-120000.");
        int y = GetDatePart(0), m = GetDatePart(2), d = GetDatePart(3);
        int i = m - 1 + months;
        if (i >= 0)
        {
            m = i % 12 + 1;
            y = y + i / 12;
        }
        else
        {
            m = 12 + (i + 1) % 12;
            y = y + (i - 11) / 12;
        }
        if (y < 1 || y > 9999)
            throw new ArgumentOutOfRangeException("months", "The added or subtracted value results in an un-representable DateTime.");
        int days = DaysInMonth(y, m);
        if (d > days)
            d = days;
        return new DateTime(DateToTicks(y, m, d) + _ticks % TicksPerDay, _kind);
    }
    public DateTime AddYears(int value)
    {
        if (value < -10000 || value > 10000)
            throw new ArgumentOutOfRangeException("years", "Years value must be between +/-10000.");
        return AddMonths(value * 12);
    }
    public TimeSpan Subtract(DateTime value) => new TimeSpan(_ticks - value._ticks);
    public DateTime Subtract(TimeSpan value) => AddTicks(-value.Ticks);
    public static DateTime operator +(DateTime d, TimeSpan t) => d.Add(t);
    public static DateTime operator -(DateTime d, TimeSpan t) => d.Subtract(t);
    public static TimeSpan operator -(DateTime d1, DateTime d2) => d1.Subtract(d2);
    public static bool operator ==(DateTime d1, DateTime d2) => d1._ticks == d2._ticks;
    public static bool operator !=(DateTime d1, DateTime d2) => d1._ticks != d2._ticks;
    public static bool operator <(DateTime t1, DateTime t2) => t1._ticks < t2._ticks;
    public static bool operator <=(DateTime t1, DateTime t2) => t1._ticks <= t2._ticks;
    public static bool operator >(DateTime t1, DateTime t2) => t1._ticks > t2._ticks;
    public static bool operator >=(DateTime t1, DateTime t2) => t1._ticks >= t2._ticks;
    public static int Compare(DateTime t1, DateTime t2) => t1._ticks.CompareTo(t2._ticks);
    public int CompareTo(DateTime value) => _ticks.CompareTo(value._ticks);
    public int CompareTo(object value)
    {
        if (value == null)
            return 1;
        if (value is DateTime other)
            return _ticks.CompareTo(other._ticks);
        throw new ArgumentException("Object must be of type DateTime.");
    }
    public bool Equals(DateTime value) => _ticks == value._ticks;
    public override bool Equals(object value) => value is DateTime other && _ticks == other._ticks;
    public static bool Equals(DateTime t1, DateTime t2) => t1._ticks == t2._ticks;
    public override int GetHashCode() => _ticks.GetHashCode();
    public DateTime ToUniversalTime() => new DateTime(_ticks, DateTimeKind.Utc);
    public DateTime ToLocalTime() => new DateTime(_ticks, DateTimeKind.Local);
    public static DateTime SpecifyKind(DateTime value, DateTimeKind kind) => new DateTime(value._ticks, kind);
    public long ToBinary() => _ticks;
    public static DateTime FromBinary(long dateData) => new DateTime(dateData);
    public string ToShortDateString() => Format("MM/dd/yyyy");
    public string ToLongDateString() => Format("dddd, dd MMMM yyyy");
    public string ToShortTimeString() => Format("HH:mm");
    public string ToLongTimeString() => Format("HH:mm:ss");
    public override string ToString() => Format("MM/dd/yyyy HH:mm:ss");
    public string ToString(string format) => Format(Expand(format));
    public string ToString(IFormatProvider provider) => ToString();
    public string ToString(string format, IFormatProvider provider) => Format(Expand(format));
    private string Expand(string format)
    {
        if (string.IsNullOrEmpty(format))
            return "MM/dd/yyyy HH:mm:ss";
        if (format.Length > 1)
            return format;
        switch (format[0])
        {
            case 'd': return "MM/dd/yyyy";
            case 'D': return "dddd, dd MMMM yyyy";
            case 'f': return "dddd, dd MMMM yyyy HH:mm";
            case 'F': return "dddd, dd MMMM yyyy HH:mm:ss";
            case 'g': return "MM/dd/yyyy HH:mm";
            case 'G': return "MM/dd/yyyy HH:mm:ss";
            case 'm':
            case 'M': return "MMMM dd";
            case 'o':
            case 'O': return "yyyy'-'MM'-'dd'T'HH':'mm':'ss'.'fffffffK";
            case 'r':
            case 'R': return "ddd, dd MMM yyyy HH':'mm':'ss 'GMT'";
            case 's': return "yyyy'-'MM'-'dd'T'HH':'mm':'ss";
            case 't': return "HH:mm";
            case 'T': return "HH:mm:ss";
            case 'u': return "yyyy'-'MM'-'dd HH':'mm':'ss'Z'";
            case 'y':
            case 'Y': return "yyyy MMMM";
        }
        throw new FormatException("Input string was not in a correct format.");
    }
    private string Format(string format)
    {
        var builder = new System.Text.StringBuilder();
        int i = 0;
        while (i < format.Length)
        {
            char ch = format[i];
            int count = 1;
            while (i + count < format.Length && format[i + count] == ch && "dfFghHKmMstyz".IndexOf(ch) >= 0)
                count++;
            switch (ch)
            {
                case 'd':
                    if (count <= 2)
                        builder.Append(Day.ToString(count == 2 ? "00" : "0"));
                    else
                        builder.Append(count == 3 ? DayNames[(int)DayOfWeek].Substring(0, 3) : DayNames[(int)DayOfWeek]);
                    break;
                case 'M':
                    if (count <= 2)
                        builder.Append(Month.ToString(count == 2 ? "00" : "0"));
                    else
                        builder.Append(count == 3 ? MonthNames[Month - 1].Substring(0, 3) : MonthNames[Month - 1]);
                    break;
                case 'y':
                {
                    int year = Year;
                    if (count <= 2)
                        builder.Append((year % 100).ToString(count == 2 ? "00" : "0"));
                    else
                        builder.Append(year.ToString(new string('0', count)));
                    break;
                }
                case 'h':
                {
                    int hour = Hour % 12;
                    if (hour == 0)
                        hour = 12;
                    builder.Append(hour.ToString(count >= 2 ? "00" : "0"));
                    break;
                }
                case 'H':
                    builder.Append(Hour.ToString(count >= 2 ? "00" : "0"));
                    break;
                case 'm':
                    builder.Append(Minute.ToString(count >= 2 ? "00" : "0"));
                    break;
                case 's':
                    builder.Append(Second.ToString(count >= 2 ? "00" : "0"));
                    break;
                case 'f':
                case 'F':
                {
                    string digits = ((int)(_ticks % TicksPerSecond)).ToString("0000000").Substring(0, Math.Min(count, 7));
                    builder.Append(ch == 'F' ? digits.TrimEnd('0') : digits);
                    break;
                }
                case 't':
                    builder.Append(count == 1 ? (Hour < 12 ? "A" : "P") : (Hour < 12 ? "AM" : "PM"));
                    break;
                case 'K':
                    if (_kind == DateTimeKind.Utc)
                        builder.Append('Z');
                    else if (_kind == DateTimeKind.Local)
                        builder.Append("+00:00");
                    break;
                case 'z':
                    builder.Append(count == 1 ? "+0" : (count == 2 ? "+00" : "+00:00"));
                    break;
                case 'g':
                    builder.Append("A.D.");
                    break;
                case ':':
                case '/':
                    builder.Append(ch);
                    break;
                case '\\':
                    if (i + 1 < format.Length)
                        builder.Append(format[i + 1]);
                    count = 2;
                    break;
                case '\'':
                case '"':
                {
                    int end = format.IndexOf(ch, i + 1);
                    if (end < 0)
                        throw new FormatException("Cannot find a matching quote character for the character '" + ch + "'.");
                    builder.Append(format, i + 1, end - i - 1);
                    count = end - i + 1;
                    break;
                }
                case '%':
                    break;
                default:
                    builder.Append(ch);
                    break;
            }
            i += count;
        }
        return builder.ToString();
    }
    public static DateTime Parse(string s)
    {
        if (s == null)
            throw new ArgumentNullException("s");
        if (!TryParse(s, out var result))
            throw new FormatException("String '" + s + "' was not recognized as a valid DateTime.");
        return result;
    }
    public static DateTime Parse(string s, IFormatProvider provider) => Parse(s);
    public static bool TryParse(string s, out DateTime result)
    {
        result = MinValue;
        if (s == null)
            return false;
        s = s.Trim();
        int year, month, day;
        string rest;
        int space = s.IndexOfAny(new[] { ' ', 'T' });
        string datePart = space < 0 ? s : s.Substring(0, space);
        rest = space < 0 ? "" : s.Substring(space + 1).Trim();
        string[] parts;
        if (datePart.IndexOf('-') > 0)
        {
            parts = datePart.Split('-');
            if (parts.Length != 3 || !int.TryParse(parts[0], out year) || !int.TryParse(parts[1], out month) || !int.TryParse(parts[2], out day))
                return false;
        }
        else
        {
            parts = datePart.Split('/');
            if (parts.Length != 3 || !int.TryParse(parts[0], out month) || !int.TryParse(parts[1], out day) || !int.TryParse(parts[2], out year))
                return false;
        }
        int hour = 0, minute = 0, second = 0;
        long fraction = 0;
        DateTimeKind kind = DateTimeKind.Unspecified;
        if (rest.Length > 0)
        {
            if (rest.EndsWith("Z"))
            {
                kind = DateTimeKind.Utc;
                rest = rest.Substring(0, rest.Length - 1);
            }
            string[] time = rest.Split(':');
            if (time.Length < 2 || time.Length > 3 || !int.TryParse(time[0], out hour) || !int.TryParse(time[1], out minute))
                return false;
            if (time.Length == 3)
            {
                string secondText = time[2];
                int point = secondText.IndexOf('.');
                if (point >= 0)
                {
                    string digits = secondText.Substring(point + 1);
                    if (digits.Length == 0 || digits.Length > 7 || !long.TryParse(digits, out fraction))
                        return false;
                    for (int k = digits.Length; k < 7; k++)
                        fraction *= 10;
                    secondText = secondText.Substring(0, point);
                }
                if (!int.TryParse(secondText, out second))
                    return false;
            }
        }
        if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > DaysInMonth(year, month) || hour > 23 || minute > 59 || second > 59)
            return false;
        result = new DateTime(DateToTicks(year, month, day) + TimeToTicks(hour, minute, second) + fraction, kind);
        return true;
    }
}

public readonly struct DateOnly : IComparable<DateOnly>, IEquatable<DateOnly>
{
    private readonly int _dayNumber;
    private DateOnly(int dayNumber) { _dayNumber = dayNumber; }
    public DateOnly(int year, int month, int day) { _dayNumber = (int)(new DateTime(year, month, day).Ticks / TimeSpan.TicksPerDay); }
    public static DateOnly FromDateTime(DateTime dateTime) => new DateOnly((int)(dateTime.Ticks / TimeSpan.TicksPerDay));
    public static DateOnly FromDayNumber(int dayNumber) => new DateOnly(dayNumber);
    private DateTime AsDateTime => new DateTime(_dayNumber * TimeSpan.TicksPerDay);
    public int Year => AsDateTime.Year;
    public int Month => AsDateTime.Month;
    public int Day => AsDateTime.Day;
    public int DayNumber => _dayNumber;
    public DayOfWeek DayOfWeek => AsDateTime.DayOfWeek;
    public int DayOfYear => AsDateTime.DayOfYear;
    public DateOnly AddDays(int value) => new DateOnly(_dayNumber + value);
    public DateOnly AddMonths(int value) => FromDateTime(AsDateTime.AddMonths(value));
    public DateOnly AddYears(int value) => FromDateTime(AsDateTime.AddYears(value));
    public DateTime ToDateTime(TimeOnly time) => new DateTime(_dayNumber * TimeSpan.TicksPerDay + time.Ticks);
    public int CompareTo(DateOnly value) => _dayNumber.CompareTo(value._dayNumber);
    public bool Equals(DateOnly value) => _dayNumber == value._dayNumber;
    public override bool Equals(object value) => value is DateOnly other && _dayNumber == other._dayNumber;
    public override int GetHashCode() => _dayNumber;
    public static bool operator ==(DateOnly left, DateOnly right) => left._dayNumber == right._dayNumber;
    public static bool operator !=(DateOnly left, DateOnly right) => left._dayNumber != right._dayNumber;
    public static bool operator <(DateOnly left, DateOnly right) => left._dayNumber < right._dayNumber;
    public static bool operator >(DateOnly left, DateOnly right) => left._dayNumber > right._dayNumber;
    public static bool operator <=(DateOnly left, DateOnly right) => left._dayNumber <= right._dayNumber;
    public static bool operator >=(DateOnly left, DateOnly right) => left._dayNumber >= right._dayNumber;
    public override string ToString() => AsDateTime.ToString("MM/dd/yyyy");
    public string ToString(string format) => AsDateTime.ToString(format == "d" || format == null ? "MM/dd/yyyy" : format);
}

public readonly struct TimeOnly : IComparable<TimeOnly>, IEquatable<TimeOnly>
{
    private readonly long _ticks;
    public TimeOnly(long ticks) { _ticks = ticks; }
    public TimeOnly(int hour, int minute) : this(new TimeSpan(hour, minute, 0).Ticks) { }
    public TimeOnly(int hour, int minute, int second) : this(new TimeSpan(hour, minute, second).Ticks) { }
    public long Ticks => _ticks;
    public int Hour => new TimeSpan(_ticks).Hours;
    public int Minute => new TimeSpan(_ticks).Minutes;
    public int Second => new TimeSpan(_ticks).Seconds;
    public static TimeOnly FromDateTime(DateTime dateTime) => new TimeOnly(dateTime.TimeOfDay.Ticks);
    public TimeSpan ToTimeSpan() => new TimeSpan(_ticks);
    public int CompareTo(TimeOnly value) => _ticks.CompareTo(value._ticks);
    public bool Equals(TimeOnly value) => _ticks == value._ticks;
    public override bool Equals(object value) => value is TimeOnly other && _ticks == other._ticks;
    public override int GetHashCode() => _ticks.GetHashCode();
    public override string ToString() => new DateTime(_ticks).ToString("HH:mm");
}
`);

    CS.addLibrary('system.diagnostics', String.raw`
namespace System.Diagnostics;

public class Stopwatch
{
    public static readonly long Frequency = 10000000;
    public static readonly bool IsHighResolution = true;
    private long _elapsed;
    private long _start;
    private bool _running;
    public Stopwatch() { }
    public static Stopwatch StartNew()
    {
        var watch = new Stopwatch();
        watch.Start();
        return watch;
    }
    public static extern long GetTimestamp();
    public static TimeSpan GetElapsedTime(long startingTimestamp) => new TimeSpan(GetTimestamp() - startingTimestamp);
    public bool IsRunning => _running;
    public void Start()
    {
        if (!_running)
        {
            _start = GetTimestamp();
            _running = true;
        }
    }
    public void Stop()
    {
        if (_running)
        {
            _elapsed += GetTimestamp() - _start;
            _running = false;
        }
    }
    public void Reset()
    {
        _elapsed = 0;
        _running = false;
    }
    public void Restart()
    {
        _elapsed = 0;
        _start = GetTimestamp();
        _running = true;
    }
    public long ElapsedTicks => _running ? _elapsed + GetTimestamp() - _start : _elapsed;
    public TimeSpan Elapsed => new TimeSpan(ElapsedTicks);
    public long ElapsedMilliseconds => ElapsedTicks / 10000;
    public override string ToString() => Elapsed.ToString();
}

public static class Debug
{
    public static void WriteLine(string message) { }
    public static void WriteLine(object value) { }
    public static void WriteLine(string format, params object[] args) { }
    public static void Write(string message) { }
    public static void Write(object value) { }
    public static void Assert(bool condition) { }
    public static void Assert(bool condition, string message) { }
    public static void Fail(string message) { }
    public static void Print(string message) { }
}

public static class Trace
{
    public static void WriteLine(string message) { }
    public static void WriteLine(object value) { }
    public static void Write(string message) { }
    public static void Assert(bool condition) { }
    public static void Assert(bool condition, string message) { }
    public static void TraceInformation(string message) { }
}

public sealed class ConditionalAttribute : Attribute
{
    public ConditionalAttribute(string conditionString) { }
}

public sealed class DebuggerDisplayAttribute : Attribute
{
    public DebuggerDisplayAttribute(string value) { }
}

public sealed class DebuggerStepThroughAttribute : Attribute { }
`);

    var natives = CS.natives;

    // Ticks since 0001-01-01: 621355968000000000 at the Unix epoch; the
    // local time is the time zone of the host.
    natives['System.DateTime'] = {
        'NowTicks(bool)': function (utc) {
            var now = Date.now();
            var offset = utc ? 0 : -new Date(now).getTimezoneOffset() * 60000;
            return T.i64.add(T.i64.mul(now + offset, 10000), T.i64.parse('621355968000000000', 10));
        }
    };

    var start = Date.now();
    natives['System.Diagnostics.Stopwatch'] = {
        'GetTimestamp()': function () {
            var now = typeof performance !== 'undefined' && performance !== null && typeof performance.now === 'function'
                ? performance.now() : Date.now() - start;
            return Math.floor(now * 10000);
        }
    };
})(globalThis);
