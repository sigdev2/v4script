// C++ library: <ios>, <ostream>, <istream>, <iostream>, <sstream>, <iomanip>, <fstream>,
// ostream_iterator and istream_iterator.
// Streams write and read through the FILEs of C (printf and std::cout share
// the output) or a std::string; numbers are formatted and parsed by the
// natives __v4_* (natives.js).
// The tables of declarations are written by tools/build-cpp-library.mjs.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    if (X.headers['v4script/ios'])
        return;

    X.addHeader('v4script/ios', [
        ['std', 3, 3, 'streamsize'],
        ['std', 4, 4, 'streamoff'],
        ['std', 5, 5, 'streampos'],
        ['std', 6, 6, 'ostream'],
        ['std', 8, 109, 'ios_base'],
        ['std', 110, 110, 'ios'],
        ['std', 112, 112, 'boolalpha'],
        ['std', 113, 113, 'noboolalpha'],
        ['std', 114, 114, 'showbase'],
        ['std', 115, 115, 'noshowbase'],
        ['std', 116, 116, 'showpoint'],
        ['std', 117, 117, 'noshowpoint'],
        ['std', 118, 118, 'showpos'],
        ['std', 119, 119, 'noshowpos'],
        ['std', 120, 120, 'skipws'],
        ['std', 121, 121, 'noskipws'],
        ['std', 122, 122, 'uppercase'],
        ['std', 123, 123, 'nouppercase'],
        ['std', 124, 124, 'unitbuf'],
        ['std', 125, 125, 'nounitbuf'],
        ['std', 126, 126, 'internal'],
        ['std', 127, 127, 'left'],
        ['std', 128, 128, 'right'],
        ['std', 129, 129, 'dec'],
        ['std', 130, 130, 'hex'],
        ['std', 131, 131, 'oct'],
        ['std', 132, 132, 'fixed'],
        ['std', 133, 133, 'scientific'],
        ['std', 134, 137, 'hexfloat'],
        ['std', 138, 138, 'defaultfloat']
    ], String.raw`
namespace std {
typedef long streamsize;
typedef long streamoff;
typedef long streampos;
class ostream;

class ios_base {
public:
    typedef unsigned int fmtflags;
    static const fmtflags boolalpha = 1;
    static const fmtflags dec = 2;
    static const fmtflags fixed = 4;
    static const fmtflags hex = 8;
    static const fmtflags internal = 16;
    static const fmtflags left = 32;
    static const fmtflags oct = 64;
    static const fmtflags right = 128;
    static const fmtflags scientific = 256;
    static const fmtflags showbase = 512;
    static const fmtflags showpoint = 1024;
    static const fmtflags showpos = 2048;
    static const fmtflags skipws = 4096;
    static const fmtflags unitbuf = 8192;
    static const fmtflags uppercase = 16384;
    static const fmtflags adjustfield = 176;
    static const fmtflags basefield = 74;
    static const fmtflags floatfield = 260;
    typedef unsigned int iostate;
    static const iostate goodbit = 0;
    static const iostate badbit = 1;
    static const iostate eofbit = 2;
    static const iostate failbit = 4;
    typedef unsigned int openmode;
    static const openmode app = 1;
    static const openmode ate = 2;
    static const openmode binary = 4;
    static const openmode in = 8;
    static const openmode out = 16;
    static const openmode trunc = 32;
    typedef int seekdir;
    static const seekdir beg = 0;
    static const seekdir cur = 1;
    static const seekdir end = 2;
    fmtflags __flags;
    streamsize __precision;
    streamsize __width;
    char __fill;
    iostate __state;
    ostream* __tie;
    ios_base() : __flags(skipws | dec), __precision(6), __width(0), __fill(' '), __state(0), __tie(0) {}
    ios_base(const ios_base&) = delete;
    ios_base& operator=(const ios_base&) = delete;
    virtual ~ios_base() {}
    fmtflags flags() const { return __flags; }
    fmtflags flags(fmtflags f) {
        fmtflags old = __flags;
        __flags = f;
        return old;
    }
    fmtflags setf(fmtflags f) {
        fmtflags old = __flags;
        __flags |= f;
        return old;
    }
    fmtflags setf(fmtflags f, fmtflags mask) {
        fmtflags old = __flags;
        __flags = (__flags & ~mask) | (f & mask);
        return old;
    }
    void unsetf(fmtflags mask) { __flags &= ~mask; }
    streamsize precision() const { return __precision; }
    streamsize precision(streamsize p) {
        streamsize old = __precision;
        __precision = p;
        return old;
    }
    streamsize width() const { return __width; }
    streamsize width(streamsize w) {
        streamsize old = __width;
        __width = w;
        return old;
    }
    char fill() const { return __fill; }
    char fill(char c) {
        char old = __fill;
        __fill = c;
        return old;
    }
    iostate rdstate() const { return __state; }
    void clear(iostate s = goodbit) { __state = s; }
    void setstate(iostate s) { __state |= s; }
    bool good() const { return __state == 0; }
    bool eof() const { return (__state & eofbit) != 0; }
    bool fail() const { return (__state & (failbit | badbit)) != 0; }
    bool bad() const { return (__state & badbit) != 0; }
    explicit operator bool() const { return !fail(); }
    bool operator!() const { return fail(); }
    static bool sync_with_stdio(bool sync = true) { return true; }
    ostream* tie() const { return __tie; }
    ostream* tie(ostream* other) {
        ostream* old = __tie;
        __tie = other;
        return old;
    }
    void exceptions(iostate) {}
    iostate exceptions() const { return 0; }
    void imbue(int) {}
};
typedef ios_base ios;

inline ios_base& boolalpha(ios_base& s) { s.setf(ios_base::boolalpha); return s; }
inline ios_base& noboolalpha(ios_base& s) { s.unsetf(ios_base::boolalpha); return s; }
inline ios_base& showbase(ios_base& s) { s.setf(ios_base::showbase); return s; }
inline ios_base& noshowbase(ios_base& s) { s.unsetf(ios_base::showbase); return s; }
inline ios_base& showpoint(ios_base& s) { s.setf(ios_base::showpoint); return s; }
inline ios_base& noshowpoint(ios_base& s) { s.unsetf(ios_base::showpoint); return s; }
inline ios_base& showpos(ios_base& s) { s.setf(ios_base::showpos); return s; }
inline ios_base& noshowpos(ios_base& s) { s.unsetf(ios_base::showpos); return s; }
inline ios_base& skipws(ios_base& s) { s.setf(ios_base::skipws); return s; }
inline ios_base& noskipws(ios_base& s) { s.unsetf(ios_base::skipws); return s; }
inline ios_base& uppercase(ios_base& s) { s.setf(ios_base::uppercase); return s; }
inline ios_base& nouppercase(ios_base& s) { s.unsetf(ios_base::uppercase); return s; }
inline ios_base& unitbuf(ios_base& s) { s.setf(ios_base::unitbuf); return s; }
inline ios_base& nounitbuf(ios_base& s) { s.unsetf(ios_base::unitbuf); return s; }
inline ios_base& internal(ios_base& s) { s.setf(ios_base::internal, ios_base::adjustfield); return s; }
inline ios_base& left(ios_base& s) { s.setf(ios_base::left, ios_base::adjustfield); return s; }
inline ios_base& right(ios_base& s) { s.setf(ios_base::right, ios_base::adjustfield); return s; }
inline ios_base& dec(ios_base& s) { s.setf(ios_base::dec, ios_base::basefield); return s; }
inline ios_base& hex(ios_base& s) { s.setf(ios_base::hex, ios_base::basefield); return s; }
inline ios_base& oct(ios_base& s) { s.setf(ios_base::oct, ios_base::basefield); return s; }
inline ios_base& fixed(ios_base& s) { s.setf(ios_base::fixed, ios_base::floatfield); return s; }
inline ios_base& scientific(ios_base& s) { s.setf(ios_base::scientific, ios_base::floatfield); return s; }
inline ios_base& hexfloat(ios_base& s) {
    s.setf(ios_base::fixed | ios_base::scientific, ios_base::floatfield);
    return s;
}
inline ios_base& defaultfloat(ios_base& s) { s.unsetf(ios_base::floatfield); return s; }
}
`);

    X.addHeader('v4script/ostream', [
        ['std', 3, 140, 'ostream'],
        ['std', 141, 144, 'operator<<'],
        ['std', 145, 148, 'operator<<'],
        ['std', 149, 152, 'operator<<'],
        ['std', 153, 160, 'operator<<'],
        ['std', 161, 161, 'operator<<'],
        ['std', 162, 162, 'operator<<'],
        ['std', 163, 166, 'operator<<'],
        ['std', 167, 170, 'operator<<'],
        ['std', 171, 174, 'endl'],
        ['std', 175, 178, 'ends'],
        ['std', 179, 179, 'flush']
    ], String.raw`
namespace std {
class ostream : public ios_base {
public:
    FILE* __file;
    // The formatting state: this stream, or the input half of an iostream.
    ios_base* __fmt;
    explicit ostream(FILE* file, ostream* tie = 0, fmtflags flags = 0) : __file(file), __fmt(this) {
        __tie = tie;
        __flags |= flags;
    }
    ostream(const ostream&) = delete;
    ostream& operator=(const ostream&) = delete;
    virtual ~ostream() {}
    // Output to a FILE as the sentry of C++ does it: the tied stream is
    // flushed first, the stream itself after the output with unitbuf.
    virtual void __write(const char* s, size_t n) {
        if (n == 0 || __file == 0)
            return;
        if (__fmt->__tie != 0)
            __fmt->__tie->flush();
        fwrite(s, 1, n, __file);
        if (__fmt->__flags & unitbuf)
            fflush(__file);
    }
    void __fill_out(size_t n) {
        char block[32];
        memset(block, __fmt->__fill, 32);
        while (n > 0) {
            size_t m = n < 32 ? n : 32;
            __write(block, m);
            n -= m;
        }
    }
    // Output with the width, the fill and the adjustment.
    void __put(const char* s, size_t n) {
        streamsize w = __fmt->__width;
        __fmt->__width = 0;
        if (w <= (streamsize)n) {
            __write(s, n);
            return;
        }
        size_t pad = w - n;
        fmtflags adjust = __fmt->__flags & adjustfield;
        if (adjust == left) {
            __write(s, n);
            __fill_out(pad);
        } else if (adjust == internal) {
            size_t prefix = 0;
            if (n > 0 && (s[0] == '-' || s[0] == '+'))
                prefix = 1;
            if (n > prefix + 1 && s[prefix] == '0' && (s[prefix + 1] == 'x' || s[prefix + 1] == 'X'))
                prefix += 2;
            __write(s, prefix);
            __fill_out(pad);
            __write(s + prefix, n - prefix);
        } else {
            __fill_out(pad);
            __write(s, n);
        }
    }
    ostream& __signed(long long v) {
        char text[128];
        if ((__fmt->__flags & basefield) == hex || (__fmt->__flags & basefield) == oct)
            return __unsigned((unsigned long long)v);
        __put(text, __v4_format_integer(text, v, 0, __fmt->__flags));
        return *this;
    }
    ostream& __unsigned(unsigned long long v) {
        char text[128];
        __put(text, __v4_format_integer(text, (long long)v, 1, __fmt->__flags));
        return *this;
    }
    ostream& __float(double v) {
        char text[400];
        __put(text, __v4_format_float(text, 400, v, __fmt->__flags, __fmt->__precision));
        return *this;
    }
    ostream& operator<<(bool v) {
        if (__fmt->__flags & boolalpha) {
            if (v)
                __put("true", 4);
            else
                __put("false", 5);
            return *this;
        }
        return __signed(v ? 1 : 0);
    }
    ostream& operator<<(short v) {
        if ((__fmt->__flags & basefield) == hex || (__fmt->__flags & basefield) == oct)
            return __unsigned((unsigned short)v);
        return __signed(v);
    }
    ostream& operator<<(unsigned short v) { return __unsigned(v); }
    ostream& operator<<(int v) {
        if ((__fmt->__flags & basefield) == hex || (__fmt->__flags & basefield) == oct)
            return __unsigned((unsigned int)v);
        return __signed(v);
    }
    ostream& operator<<(unsigned int v) { return __unsigned(v); }
    ostream& operator<<(long v) { return __signed(v); }
    ostream& operator<<(unsigned long v) { return __unsigned(v); }
    ostream& operator<<(long long v) { return __signed(v); }
    ostream& operator<<(unsigned long long v) { return __unsigned(v); }
    ostream& operator<<(float v) { return __float(v); }
    ostream& operator<<(double v) { return __float(v); }
    ostream& operator<<(long double v) { return __float((double)v); }
    ostream& operator<<(const void* p) {
        if (p == 0) {
            __put("0", 1);
            return *this;
        }
        char text[32];
        __put(text, snprintf(text, sizeof text, "%p", p));
        return *this;
    }
    ostream& operator<<(nullptr_t) {
        __put("nullptr", 7);
        return *this;
    }
    ostream& operator<<(ostream& (*manipulator)(ostream&)) { return manipulator(*this); }
    ostream& operator<<(ios_base& (*manipulator)(ios_base&)) {
        manipulator(*__fmt);
        return *this;
    }
    ostream& put(char c) {
        __write(&c, 1);
        return *this;
    }
    ostream& write(const char* s, streamsize n) {
        __write(s, n);
        return *this;
    }
    ostream& flush() {
        if (__file != 0)
            fflush(__file);
        return *this;
    }
    streampos tellp() { return -1; }
};
inline ostream& operator<<(ostream& os, char c) {
    os.__put(&c, 1);
    return os;
}
inline ostream& operator<<(ostream& os, signed char c) {
    os.__put((const char*)&c, 1);
    return os;
}
inline ostream& operator<<(ostream& os, unsigned char c) {
    os.__put((const char*)&c, 1);
    return os;
}
inline ostream& operator<<(ostream& os, const char* s) {
    if (s == 0) {
        os.setstate(ios_base::badbit);
        return os;
    }
    os.__put(s, strlen(s));
    return os;
}
inline ostream& operator<<(ostream& os, const signed char* s) { return os << (const char*)s; }
inline ostream& operator<<(ostream& os, const unsigned char* s) { return os << (const char*)s; }
inline ostream& operator<<(ostream& os, const string& s) {
    os.__put(s.data(), s.size());
    return os;
}
inline ostream& operator<<(ostream& os, string_view s) {
    os.__put(s.data(), s.size());
    return os;
}
inline ostream& endl(ostream& os) {
    os.put('\n');
    return os.flush();
}
inline ostream& ends(ostream& os) {
    os.put('\0');
    return os;
}
inline ostream& flush(ostream& os) { return os.flush(); }
}
`);

    X.addHeader('v4script/istream', [
        ['std', 3, 231, 'istream'],
        ['std', 232, 241, 'operator>>'],
        ['std', 242, 242, 'operator>>'],
        ['std', 243, 243, 'operator>>'],
        ['std', 244, 257, 'operator>>'],
        ['std', 258, 273, 'operator>>'],
        ['std', 274, 284, 'getline'],
        ['std', 285, 285, 'getline'],
        ['std', 286, 298, 'ws'],
        ['std', 300, 305, 'iostream']
    ], String.raw`
namespace std {
class istream : public ios_base {
public:
    FILE* __file;
    const string* __text;
    size_t __position;
    streamsize __count;
    explicit istream(FILE* file, ostream* tie = 0) : __file(file), __text(0), __position(0), __count(0) {
        __tie = tie;
    }
    istream(const istream&) = delete;
    istream& operator=(const istream&) = delete;
    virtual ~istream() {}
    // The sentry: a stream with an error reads nothing.
    bool __ready() {
        __count = 0;
        if (__state != 0) {
            __state |= failbit;
            return false;
        }
        return true;
    }
    void __status(int status) {
        if (status & 2)
            __state |= eofbit;
        if (status & 4)
            __state |= failbit;
    }
    bool __integer(long long& out, int isUnsigned) {
        if (!__ready())
            return false;
        int status = __v4_read_integer(__file, __text, &__position, &out, isUnsigned, __flags);
        __status(status);
        return (status & 1) != 0;
    }
    istream& __signed(long long& value, long long low, long long high) {
        long long x = 0;
        if (__integer(x, 0)) {
            if (x < low) {
                value = low;
                __state |= failbit;
            } else if (x > high) {
                value = high;
                __state |= failbit;
            } else {
                value = x;
            }
        } else if (__state & failbit) {
            value = 0;
        }
        return *this;
    }
    istream& operator>>(short& v) {
        long long x = v;
        __signed(x, -32768, 32767);
        v = (short)x;
        return *this;
    }
    istream& operator>>(int& v) {
        long long x = v;
        __signed(x, -2147483647LL - 1, 2147483647LL);
        v = (int)x;
        return *this;
    }
    istream& operator>>(long& v) {
        long long x = v;
        __signed(x, -9223372036854775807LL - 1, 9223372036854775807LL);
        v = (long)x;
        return *this;
    }
    istream& operator>>(long long& v) { return __signed(v, -9223372036854775807LL - 1, 9223372036854775807LL); }
    istream& operator>>(unsigned short& v) {
        long long x = 0;
        if (__integer(x, 1))
            v = (unsigned short)x;
        return *this;
    }
    istream& operator>>(unsigned int& v) {
        long long x = 0;
        if (__integer(x, 1))
            v = (unsigned int)x;
        return *this;
    }
    istream& operator>>(unsigned long& v) {
        long long x = 0;
        if (__integer(x, 1))
            v = (unsigned long)x;
        return *this;
    }
    istream& operator>>(unsigned long long& v) {
        long long x = 0;
        if (__integer(x, 1))
            v = (unsigned long long)x;
        return *this;
    }
    istream& operator>>(bool& v) {
        long long x = 0;
        if (__integer(x, 0)) {
            if (x == 0 || x == 1)
                v = x != 0;
            else {
                v = true;
                __state |= failbit;
            }
        } else if (__state & failbit) {
            v = false;
        }
        return *this;
    }
    istream& operator>>(double& v) {
        if (!__ready())
            return *this;
        double x = 0;
        int status = __v4_read_float(__file, __text, &__position, &x);
        __status(status);
        v = x;
        return *this;
    }
    istream& operator>>(float& v) {
        double x = v;
        *this >> x;
        v = (float)x;
        return *this;
    }
    istream& operator>>(long double& v) {
        double x = v;
        *this >> x;
        v = x;
        return *this;
    }
    istream& operator>>(ios_base& (*manipulator)(ios_base&)) {
        manipulator(*this);
        return *this;
    }
    istream& operator>>(istream& (*manipulator)(istream&)) { return manipulator(*this); }
    int get() {
        __count = 0;
        int c = __v4_read_char(__file, __text, &__position, 0);
        if (c < 0)
            __state |= eofbit | failbit;
        else
            __count = 1;
        return c;
    }
    istream& get(char& c) {
        int x = get();
        if (x >= 0)
            c = (char)x;
        return *this;
    }
    istream& getline(char* s, streamsize n, char delimiter = '\n') {
        if (!__ready())
            return *this;
        char* data = 0;
        size_t length = 0;
        int status = __v4_getline(__file, __text, &__position, delimiter, &data, &length, n - 1);
        __status(status);
        memcpy(s, data, length);
        s[length] = 0;
        __count = length;
        free(data);
        return *this;
    }
    istream& get(char* s, streamsize n, char delimiter = '\n') {
        streamsize i = 0;
        while (i < n - 1) {
            int c = peek();
            if (c < 0 || c == delimiter)
                break;
            s[i++] = (char)get();
        }
        s[i] = 0;
        if (i == 0)
            __state |= failbit;
        __count = i;
        return *this;
    }
    int peek() {
        if (__state != 0)
            return -1;
        int c = __v4_peek_char(__file, __text, &__position);
        if (c < 0)
            __state |= eofbit;
        return c;
    }
    istream& unget() {
        __state &= ~eofbit;
        if (__file == 0 && __position > 0)
            --__position;
        return *this;
    }
    istream& putback(char c) {
        __state &= ~eofbit;
        __v4_unget_char(__file, __text, &__position, (unsigned char)c);
        return *this;
    }
    istream& ignore(streamsize n = 1, int delimiter = -1) {
        if (__state != 0)
            return *this;
        __status(__v4_ignore(__file, __text, &__position, n, delimiter));
        return *this;
    }
    istream& read(char* s, streamsize n) {
        streamsize i = 0;
        while (i < n) {
            int c = __v4_read_char(__file, __text, &__position, 0);
            if (c < 0) {
                __state |= eofbit | failbit;
                break;
            }
            s[i++] = (char)c;
        }
        __count = i;
        return *this;
    }
    streamsize gcount() const { return __count; }
    istream& seekg(streampos position) {
        __position = position;
        __state &= ~eofbit;
        return *this;
    }
    istream& seekg(streamoff offset, seekdir direction) {
        if (__text != 0)
            __position = direction == beg ? offset : (direction == cur ? __position + offset : __text->size() + offset);
        __state &= ~eofbit;
        return *this;
    }
    streampos tellg() { return __file == 0 ? (streampos)__position : -1; }
    int sync() { return 0; }
};
inline istream& operator>>(istream& is, char& c) {
    if (!is.__ready())
        return is;
    int x = __v4_read_char(is.__file, is.__text, &is.__position, (is.__flags & ios_base::skipws) != 0);
    if (x < 0)
        is.setstate(ios_base::eofbit | ios_base::failbit);
    else
        c = (char)x;
    return is;
}
inline istream& operator>>(istream& is, signed char& c) { return is >> (char&)c; }
inline istream& operator>>(istream& is, unsigned char& c) { return is >> (char&)c; }
inline istream& operator>>(istream& is, string& s) {
    if (!is.__ready())
        return is;
    char* data = 0;
    size_t length = 0;
    int status = __v4_read_word(is.__file, is.__text, &is.__position, &data, &length);
    is.__status(status);
    if (status & 1) {
        s.assign(data, length);
        free(data);
    }
    is.__width = 0;
    return is;
}
inline istream& operator>>(istream& is, char* s) {
    if (!is.__ready())
        return is;
    char* data = 0;
    size_t length = 0;
    int status = __v4_read_word(is.__file, is.__text, &is.__position, &data, &length);
    is.__status(status);
    if (status & 1) {
        size_t limit = is.__width > 0 && (size_t)is.__width - 1 < length ? is.__width - 1 : length;
        memcpy(s, data, limit);
        s[limit] = 0;
        free(data);
    }
    is.__width = 0;
    return is;
}
inline istream& getline(istream& is, string& s, char delimiter) {
    if (!is.__ready())
        return is;
    char* data = 0;
    size_t length = 0;
    int status = __v4_getline(is.__file, is.__text, &is.__position, delimiter, &data, &length, -1);
    is.__status(status);
    s.assign(data, length);
    free(data);
    return is;
}
inline istream& getline(istream& is, string& s) { return getline(is, s, '\n'); }
inline istream& ws(istream& is) {
    for (;;) {
        int c = __v4_peek_char(is.__file, is.__text, &is.__position);
        if (c < 0) {
            is.setstate(ios_base::eofbit);
            break;
        }
        if (!isspace(c))
            break;
        __v4_read_char(is.__file, is.__text, &is.__position, 0);
    }
    return is;
}

class iostream : public istream, public ostream {
public:
    explicit iostream(FILE* in, FILE* out) : istream(in), ostream(out) {
        ostream::__fmt = static_cast<istream*>(this);
    }
};
}
`);

    X.addHeader('v4script/iostream', [
        ['std', 3, 3, 'cin'],
        ['std', 4, 4, 'cout'],
        ['std', 5, 5, 'cerr'],
        ['std', 6, 6, 'clog'],
        ['std', 7, 7, 'cin'],
        ['std', 8, 8, 'cout'],
        ['std', 9, 9, 'cerr'],
        ['std', 10, 10, 'clog']
    ], String.raw`
namespace std {
extern istream cin;
extern ostream cout;
extern ostream cerr;
extern ostream clog;
istream cin(stdin, &cout);
ostream cout(stdout);
ostream cerr(stderr, &cout, ios_base::unitbuf);
ostream clog(stderr);
}
`);

    X.addHeader('v4script/sstream', [
        ['std', 3, 12, 'ostringstream'],
        ['std', 13, 26, 'istringstream'],
        ['std', 27, 42, 'stringstream']
    ], String.raw`
namespace std {
class ostringstream : public ostream {
public:
    string __buffer;
    ostringstream() : ostream(0) {}
    explicit ostringstream(ios_base::openmode mode) : ostream(0) {}
    explicit ostringstream(const string& s, ios_base::openmode mode = ios_base::out) : ostream(0), __buffer(s) {}
    void __write(const char* s, size_t n) override { __buffer.append(s, n); }
    string str() const { return __buffer; }
    void str(const string& s) { __buffer = s; }
};
class istringstream : public istream {
public:
    string __buffer;
    istringstream() : istream(0) { __text = &__buffer; }
    explicit istringstream(ios_base::openmode mode) : istream(0) { __text = &__buffer; }
    explicit istringstream(const string& s, ios_base::openmode mode = ios_base::in) : istream(0), __buffer(s) {
        __text = &__buffer;
    }
    string str() const { return __buffer; }
    void str(const string& s) {
        __buffer = s;
        __position = 0;
    }
};
class stringstream : public iostream {
public:
    string __buffer;
    stringstream() : iostream(0, 0) { __text = &__buffer; }
    explicit stringstream(ios_base::openmode mode) : iostream(0, 0) { __text = &__buffer; }
    explicit stringstream(const string& s, ios_base::openmode mode = ios_base::in | ios_base::out)
        : iostream(0, 0), __buffer(s) {
        __text = &__buffer;
    }
    void __write(const char* s, size_t n) override { __buffer.append(s, n); }
    string str() const { return __buffer; }
    void str(const string& s) {
        __buffer = s;
        __position = 0;
    }
};
}
`);

    X.addHeader('v4script/fstream', [
        ['std', 3, 28, 'ifstream'],
        ['std', 29, 47, 'ofstream'],
        ['std', 48, 48, 'fstream']
    ], String.raw`
namespace std {
class ifstream : public istream {
public:
    ifstream() : istream(0) {}
    explicit ifstream(const char* name, ios_base::openmode mode = ios_base::in) : istream(fopen(name, "r")) {
        if (__file == 0)
            __state |= failbit;
    }
    explicit ifstream(const string& name, ios_base::openmode mode = ios_base::in) : istream(fopen(name.c_str(), "r")) {
        if (__file == 0)
            __state |= failbit;
    }
    ~ifstream() { close(); }
    void open(const char* name, ios_base::openmode mode = ios_base::in) {
        close();
        __file = fopen(name, "r");
        __state = __file == 0 ? failbit : goodbit;
    }
    void open(const string& name, ios_base::openmode mode = ios_base::in) { open(name.c_str(), mode); }
    bool is_open() const { return __file != 0; }
    void close() {
        if (__file != 0) {
            fclose(__file);
            __file = 0;
        }
    }
};
class ofstream : public ostream {
public:
    ofstream() : ostream(0) {}
    explicit ofstream(const char* name, ios_base::openmode mode = ios_base::out) : ostream(fopen(name, "w")) {
        if (__file == 0)
            __state |= failbit;
    }
    explicit ofstream(const string& name, ios_base::openmode mode = ios_base::out) : ostream(fopen(name.c_str(), "w")) {
        if (__file == 0)
            __state |= failbit;
    }
    void open(const char* name, ios_base::openmode mode = ios_base::out) {
        __file = fopen(name, "w");
        __state = __file == 0 ? failbit : goodbit;
    }
    void open(const string& name, ios_base::openmode mode = ios_base::out) { open(name.c_str(), mode); }
    bool is_open() const { return __file != 0; }
    void close() { __file = 0; }
};
typedef ifstream fstream;
}
`);

    X.addHeader('v4script/iomanip', [
        ['std', 3, 3, '__setw'],
        ['std', 4, 4, 'setw'],
        ['std', 5, 8, 'operator<<'],
        ['std', 9, 12, 'operator>>'],
        ['std', 13, 13, '__setprecision'],
        ['std', 14, 14, 'setprecision'],
        ['std', 15, 18, 'operator<<'],
        ['std', 19, 22, 'operator>>'],
        ['std', 23, 23, '__setfill'],
        ['std', 24, 24, 'setfill'],
        ['std', 25, 28, 'operator<<'],
        ['std', 29, 29, '__setbase'],
        ['std', 30, 30, 'setbase'],
        ['std', 31, 36, 'operator<<'],
        ['std', 37, 37, '__setiosflags'],
        ['std', 38, 38, 'setiosflags'],
        ['std', 39, 42, 'operator<<'],
        ['std', 43, 43, '__resetiosflags'],
        ['std', 44, 44, 'resetiosflags'],
        ['std', 45, 48, 'operator<<'],
        ['std', 49, 49, '__quoted'],
        ['std', 50, 52, 'quoted'],
        ['std', 53, 55, 'quoted'],
        ['std', 56, 67, 'operator<<']
    ], String.raw`
namespace std {
struct __setw { int __n; };
inline __setw setw(int n) { return __setw{n}; }
inline ostream& operator<<(ostream& os, __setw m) {
    os.__fmt->width(m.__n);
    return os;
}
inline istream& operator>>(istream& is, __setw m) {
    is.width(m.__n);
    return is;
}
struct __setprecision { int __n; };
inline __setprecision setprecision(int n) { return __setprecision{n}; }
inline ostream& operator<<(ostream& os, __setprecision m) {
    os.__fmt->precision(m.__n);
    return os;
}
inline istream& operator>>(istream& is, __setprecision m) {
    is.precision(m.__n);
    return is;
}
struct __setfill { char __c; };
inline __setfill setfill(char c) { return __setfill{c}; }
inline ostream& operator<<(ostream& os, __setfill m) {
    os.__fmt->fill(m.__c);
    return os;
}
struct __setbase { int __base; };
inline __setbase setbase(int base) { return __setbase{base}; }
inline ostream& operator<<(ostream& os, __setbase m) {
    os.__fmt->setf(m.__base == 16 ? ios_base::hex
                                  : (m.__base == 8 ? ios_base::oct : (m.__base == 10 ? ios_base::dec : 0)),
            ios_base::basefield);
    return os;
}
struct __setiosflags { ios_base::fmtflags __flags; };
inline __setiosflags setiosflags(ios_base::fmtflags flags) { return __setiosflags{flags}; }
inline ostream& operator<<(ostream& os, __setiosflags m) {
    os.__fmt->setf(m.__flags);
    return os;
}
struct __resetiosflags { ios_base::fmtflags __flags; };
inline __resetiosflags resetiosflags(ios_base::fmtflags flags) { return __resetiosflags{flags}; }
inline ostream& operator<<(ostream& os, __resetiosflags m) {
    os.__fmt->unsetf(m.__flags);
    return os;
}
struct __quoted { const string* __text; const char* __chars; char __delimiter; char __escape; };
inline __quoted quoted(const string& s, char delimiter = '"', char escape = '\\') {
    return __quoted{&s, 0, delimiter, escape};
}
inline __quoted quoted(const char* s, char delimiter = '"', char escape = '\\') {
    return __quoted{0, s, delimiter, escape};
}
inline ostream& operator<<(ostream& os, __quoted q) {
    string out(1, q.__delimiter);
    const char* s = q.__text != 0 ? q.__text->c_str() : q.__chars;
    size_t n = q.__text != 0 ? q.__text->size() : strlen(s);
    for (size_t i = 0; i < n; ++i) {
        if (s[i] == q.__delimiter || s[i] == q.__escape)
            out.push_back(q.__escape);
        out.push_back(s[i]);
    }
    out.push_back(q.__delimiter);
    return os << out;
}
}
`);

    X.addHeader('v4script/stream-iterators', [
        ['std', 3, 27, 'ostream_iterator'],
        ['std', 29, 60, 'istream_iterator'],
        ['std', 61, 64, 'operator=='],
        ['std', 65, 68, 'operator!=']
    ], String.raw`
namespace std {
template <class T, class C = char> class ostream_iterator {
public:
    typedef output_iterator_tag iterator_category;
    typedef void value_type;
    typedef void difference_type;
    typedef void pointer;
    typedef void reference;
    typedef C char_type;
    typedef ostream ostream_type;
    ostream_iterator(ostream& s) : __stream(&s), __delimiter(0) {}
    ostream_iterator(ostream& s, const C* delimiter) : __stream(&s), __delimiter(delimiter) {}
    ostream_iterator& operator=(const T& value) {
        *__stream << value;
        if (__delimiter != 0)
            *__stream << __delimiter;
        return *this;
    }
    ostream_iterator& operator*() { return *this; }
    ostream_iterator& operator++() { return *this; }
    ostream_iterator& operator++(int) { return *this; }

private:
    ostream* __stream;
    const C* __delimiter;
};
// The end of input is the iterator without a stream; a failed read ends it.
template <class T, class C = char, class D = ptrdiff_t> class istream_iterator {
public:
    typedef input_iterator_tag iterator_category;
    typedef T value_type;
    typedef D difference_type;
    typedef const T* pointer;
    typedef const T& reference;
    typedef C char_type;
    typedef istream istream_type;
    istream_iterator() : __stream(0), __value() {}
    istream_iterator(istream& s) : __stream(&s), __value() { __read(); }
    const T& operator*() const { return __value; }
    const T* operator->() const { return &__value; }
    istream_iterator& operator++() {
        __read();
        return *this;
    }
    istream_iterator operator++(int) {
        istream_iterator old = *this;
        __read();
        return old;
    }
    bool __equal(const istream_iterator& other) const { return __stream == other.__stream; }

private:
    void __read() {
        if (__stream != 0 && !(*__stream >> __value))
            __stream = 0;
    }
    istream* __stream;
    T __value;
};
template <class T, class C, class D>
bool operator==(const istream_iterator<T, C, D>& a, const istream_iterator<T, C, D>& b) {
    return a.__equal(b);
}
template <class T, class C, class D>
bool operator!=(const istream_iterator<T, C, D>& a, const istream_iterator<T, C, D>& b) {
    return !a.__equal(b);
}
}
`);
})(globalThis);
