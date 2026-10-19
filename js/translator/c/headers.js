// C: built-in headers - declarations of the standard library (the
// functions are in libc.js) and of the JavaScript API (js.h).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    if (C.headers)
        return;

    var headers = {};

    headers['stddef.h'] = [
        'typedef unsigned long size_t;',
        'typedef long ptrdiff_t;',
        'typedef int wchar_t;',
        'typedef long max_align_t;',
        '#define NULL ((void *)0)',
        '#define offsetof(type, member) __builtin_offsetof(type, member)'
    ];

    headers['stdbool.h'] = [
        '#define __bool_true_false_are_defined 1'
    ];

    headers['stdarg.h'] = [
        'typedef __builtin_va_list va_list;',
        '#define va_start(ap, last) __builtin_va_start(ap, last)',
        '#define va_arg(ap, type) __builtin_va_arg(ap, type)',
        '#define va_end(ap) __builtin_va_end(ap)',
        '#define va_copy(dest, src) __builtin_va_copy(dest, src)'
    ];

    headers['stdint.h'] = [
        'typedef signed char int8_t;', 'typedef short int16_t;', 'typedef int int32_t;', 'typedef long int64_t;',
        'typedef unsigned char uint8_t;', 'typedef unsigned short uint16_t;', 'typedef unsigned int uint32_t;',
        'typedef unsigned long uint64_t;',
        'typedef signed char int_least8_t;', 'typedef short int_least16_t;', 'typedef int int_least32_t;',
        'typedef long int_least64_t;', 'typedef unsigned char uint_least8_t;', 'typedef unsigned short uint_least16_t;',
        'typedef unsigned int uint_least32_t;', 'typedef unsigned long uint_least64_t;',
        'typedef signed char int_fast8_t;', 'typedef long int_fast16_t;', 'typedef long int_fast32_t;',
        'typedef long int_fast64_t;', 'typedef unsigned char uint_fast8_t;', 'typedef unsigned long uint_fast16_t;',
        'typedef unsigned long uint_fast32_t;', 'typedef unsigned long uint_fast64_t;',
        'typedef long intptr_t;', 'typedef unsigned long uintptr_t;', 'typedef long intmax_t;', 'typedef unsigned long uintmax_t;',
        '#define INT8_MIN (-128)', '#define INT8_MAX 127', '#define UINT8_MAX 255',
        '#define INT16_MIN (-32768)', '#define INT16_MAX 32767', '#define UINT16_MAX 65535',
        '#define INT32_MIN (-2147483647-1)', '#define INT32_MAX 2147483647', '#define UINT32_MAX 4294967295U',
        '#define INT64_MIN (-9223372036854775807L-1)', '#define INT64_MAX 9223372036854775807L',
        '#define UINT64_MAX 18446744073709551615UL',
        '#define INTPTR_MIN INT64_MIN', '#define INTPTR_MAX INT64_MAX', '#define UINTPTR_MAX UINT64_MAX',
        '#define INTMAX_MIN INT64_MIN', '#define INTMAX_MAX INT64_MAX', '#define UINTMAX_MAX UINT64_MAX',
        '#define SIZE_MAX UINT64_MAX', '#define PTRDIFF_MIN INT64_MIN', '#define PTRDIFF_MAX INT64_MAX',
        '#define INT8_C(c) c', '#define INT16_C(c) c', '#define INT32_C(c) c', '#define INT64_C(c) c ## L',
        '#define UINT8_C(c) c', '#define UINT16_C(c) c', '#define UINT32_C(c) c ## U', '#define UINT64_C(c) c ## UL'
    ];

    headers['inttypes.h'] = [
        '#include <stdint.h>',
        '#define PRId8 "d"', '#define PRId16 "d"', '#define PRId32 "d"', '#define PRId64 "ld"',
        '#define PRIi32 "i"', '#define PRIi64 "li"', '#define PRIu8 "u"', '#define PRIu16 "u"', '#define PRIu32 "u"',
        '#define PRIu64 "lu"', '#define PRIx32 "x"', '#define PRIx64 "lx"', '#define PRIX64 "lX"', '#define PRIdMAX "ld"',
        '#define PRIuMAX "lu"', '#define PRIdPTR "ld"', '#define SCNd32 "d"', '#define SCNd64 "ld"'
    ];

    headers['limits.h'] = [
        '#define CHAR_BIT 8', '#define SCHAR_MIN (-128)', '#define SCHAR_MAX 127', '#define UCHAR_MAX 255',
        '#define CHAR_MIN (-128)', '#define CHAR_MAX 127', '#define MB_LEN_MAX 16',
        '#define SHRT_MIN (-32768)', '#define SHRT_MAX 32767', '#define USHRT_MAX 65535',
        '#define INT_MIN (-2147483647-1)', '#define INT_MAX 2147483647', '#define UINT_MAX 4294967295U',
        '#define LONG_MIN (-9223372036854775807L-1)', '#define LONG_MAX 9223372036854775807L',
        '#define ULONG_MAX 18446744073709551615UL',
        '#define LLONG_MIN (-9223372036854775807LL-1)', '#define LLONG_MAX 9223372036854775807LL',
        '#define ULLONG_MAX 18446744073709551615ULL'
    ];

    headers['float.h'] = [
        '#define FLT_RADIX 2', '#define FLT_MANT_DIG 24', '#define DBL_MANT_DIG 53', '#define FLT_DIG 6', '#define DBL_DIG 15',
        '#define FLT_EPSILON 1.19209290e-7F', '#define DBL_EPSILON 2.2204460492503131e-16',
        '#define FLT_MAX 3.40282347e+38F', '#define DBL_MAX 1.7976931348623157e+308',
        '#define FLT_MIN 1.17549435e-38F', '#define DBL_MIN 2.2250738585072014e-308',
        '#define LDBL_MAX DBL_MAX', '#define LDBL_MIN DBL_MIN', '#define LDBL_EPSILON DBL_EPSILON', '#define LDBL_DIG DBL_DIG',
        '#define FLT_MAX_EXP 128', '#define DBL_MAX_EXP 1024', '#define FLT_MIN_EXP (-125)', '#define DBL_MIN_EXP (-1021)'
    ];

    headers['errno.h'] = [
        'extern int errno;', '#define EDOM 33', '#define ERANGE 34', '#define EINVAL 22', '#define ENOENT 2', '#define ENOMEM 12'
    ];

    headers['stdio.h'] = [
        '#include <stddef.h>',
        '#include <stdarg.h>',
        'typedef struct _IO_FILE FILE;',
        'typedef long fpos_t;',
        'extern FILE *stdin;', 'extern FILE *stdout;', 'extern FILE *stderr;',
        '#define EOF (-1)', '#define BUFSIZ 8192', '#define FILENAME_MAX 4096', '#define SEEK_SET 0', '#define SEEK_CUR 1',
        '#define SEEK_END 2',
        'int printf(const char *format, ...);',
        'int fprintf(FILE *stream, const char *format, ...);',
        'int sprintf(char *str, const char *format, ...);',
        'int snprintf(char *str, size_t size, const char *format, ...);',
        'int vprintf(const char *format, va_list ap);',
        'int vfprintf(FILE *stream, const char *format, va_list ap);',
        'int vsprintf(char *str, const char *format, va_list ap);',
        'int vsnprintf(char *str, size_t size, const char *format, va_list ap);',
        'int puts(const char *s);',
        'int fputs(const char *s, FILE *stream);',
        'int putchar(int c);',
        'int fputc(int c, FILE *stream);',
        'int putc(int c, FILE *stream);',
        'int getchar(void);',
        'int fgetc(FILE *stream);',
        'int getc(FILE *stream);',
        'int ungetc(int c, FILE *stream);',
        'char *fgets(char *s, int size, FILE *stream);',
        'int scanf(const char *format, ...);',
        'int fscanf(FILE *stream, const char *format, ...);',
        'int sscanf(const char *str, const char *format, ...);',
        'int fflush(FILE *stream);',
        'void perror(const char *s);',
        'FILE *fopen(const char *path, const char *mode);',
        'int fclose(FILE *stream);',
        'int feof(FILE *stream);',
        'int ferror(FILE *stream);',
        'size_t fwrite(const void *ptr, size_t size, size_t count, FILE *stream);',
        'size_t fread(void *ptr, size_t size, size_t count, FILE *stream);',
        'int fseek(FILE *stream, long offset, int whence);',
        'long ftell(FILE *stream);',
        'void rewind(FILE *stream);',
        'void clearerr(FILE *stream);',
        'int remove(const char *path);',
        'void setbuf(FILE *stream, char *buf);',
        'int setvbuf(FILE *stream, char *buf, int mode, size_t size);',
        '#define _IONBF 2', '#define _IOLBF 1', '#define _IOFBF 0'
    ];

    headers['stdlib.h'] = [
        '#include <stddef.h>',
        '#define EXIT_SUCCESS 0', '#define EXIT_FAILURE 1', '#define RAND_MAX 2147483647',
        'typedef struct { int quot; int rem; } div_t;',
        'typedef struct { long quot; long rem; } ldiv_t;',
        'void *malloc(size_t size);',
        'void *calloc(size_t count, size_t size);',
        'void *realloc(void *ptr, size_t size);',
        'void free(void *ptr);',
        'void *aligned_alloc(size_t alignment, size_t size);',
        '_Noreturn void exit(int status);',
        '_Noreturn void abort(void);',
        '_Noreturn void _Exit(int status);',
        'int atexit(void (*function)(void));',
        'int atoi(const char *s);',
        'long atol(const char *s);',
        'long long atoll(const char *s);',
        'double atof(const char *s);',
        'long strtol(const char *s, char **end, int base);',
        'unsigned long strtoul(const char *s, char **end, int base);',
        'long long strtoll(const char *s, char **end, int base);',
        'unsigned long long strtoull(const char *s, char **end, int base);',
        'double strtod(const char *s, char **end);',
        'float strtof(const char *s, char **end);',
        'int abs(int x);',
        'long labs(long x);',
        'long long llabs(long long x);',
        'div_t div(int a, int b);',
        'ldiv_t ldiv(long a, long b);',
        'int rand(void);',
        'void srand(unsigned int seed);',
        'void qsort(void *base, size_t count, size_t size, int (*compare)(const void *, const void *));',
        'void *bsearch(const void *key, const void *base, size_t count, size_t size, int (*compare)(const void *, const void *));',
        'char *getenv(const char *name);',
        'int system(const char *command);'
    ];

    headers['string.h'] = [
        '#include <stddef.h>',
        'size_t strlen(const char *s);',
        'size_t strnlen(const char *s, size_t max);',
        'char *strcpy(char *dst, const char *src);',
        'char *strncpy(char *dst, const char *src, size_t n);',
        'char *strcat(char *dst, const char *src);',
        'char *strncat(char *dst, const char *src, size_t n);',
        'int strcmp(const char *a, const char *b);',
        'int strncmp(const char *a, const char *b, size_t n);',
        'int strcoll(const char *a, const char *b);',
        'char *strchr(const char *s, int c);',
        'char *strrchr(const char *s, int c);',
        'char *strstr(const char *haystack, const char *needle);',
        'char *strdup(const char *s);',
        'char *strndup(const char *s, size_t n);',
        'char *strtok(char *s, const char *delimiters);',
        'size_t strspn(const char *s, const char *accept);',
        'size_t strcspn(const char *s, const char *reject);',
        'char *strpbrk(const char *s, const char *accept);',
        'char *strerror(int code);',
        'void *memcpy(void *dst, const void *src, size_t n);',
        'void *memmove(void *dst, const void *src, size_t n);',
        'void *memset(void *s, int c, size_t n);',
        'int memcmp(const void *a, const void *b, size_t n);',
        'void *memchr(const void *s, int c, size_t n);',
        'int strcasecmp(const char *a, const char *b);',
        'int strncasecmp(const char *a, const char *b, size_t n);'
    ];

    headers['strings.h'] = [
        '#include <string.h>'
    ];

    var mathFunctions = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
                         'exp', 'exp2', 'expm1', 'log', 'log2', 'log10', 'log1p', 'sqrt', 'cbrt', 'fabs', 'floor', 'ceil',
                         'round', 'trunc', 'rint', 'nearbyint', 'tgamma', 'lgamma', 'erf', 'erfc'];
    var mathBinary = ['pow', 'atan2', 'hypot', 'fmod', 'remainder', 'fmin', 'fmax', 'fdim', 'copysign', 'nextafter'];
    headers['math.h'] = [
        '#define M_PI 3.14159265358979323846', '#define M_E 2.7182818284590452354', '#define M_SQRT2 1.41421356237309504880',
        '#define M_LN2 0.69314718055994530942', '#define M_LN10 2.30258509299404568402', '#define M_PI_2 1.57079632679489661923',
        '#define M_PI_4 0.78539816339744830962', '#define M_1_PI 0.31830988618379067154', '#define M_2_PI 0.63661977236758134308',
        '#define M_LOG2E 1.4426950408889634074', '#define M_LOG10E 0.43429448190325182765', '#define M_SQRT1_2 0.70710678118654752440',
        '#define INFINITY (__builtin_inff())', '#define NAN (__builtin_nanf(""))', '#define HUGE_VAL (__builtin_huge_val())',
        '#define HUGE_VALF (__builtin_inff())',
        'float __builtin_inff(void);', 'float __builtin_nanf(const char *tag);', 'double __builtin_huge_val(void);',
        'double fma(double x, double y, double z);', 'double ldexp(double x, int exp);', 'double frexp(double x, int *exp);',
        'double modf(double x, double *integer);', 'double nan(const char *tag);', 'long lround(double x);',
        'long long llround(double x);', 'long lrint(double x);',
        'int __isnan(double x);', 'int __isinf(double x);', 'int __isfinite(double x);', 'int __signbit(double x);',
        '#define isnan(x) __isnan(x)', '#define isinf(x) __isinf(x)', '#define isfinite(x) __isfinite(x)',
        '#define signbit(x) __signbit(x)', '#define isnormal(x) (__isfinite(x) && (x) != 0)'
    ].concat(mathFunctions.map(function (name) {
        return 'double ' + name + '(double x); float ' + name + 'f(float x);';
    })).concat(mathBinary.map(function (name) {
        return 'double ' + name + '(double x, double y); float ' + name + 'f(float x, float y);';
    }));

    headers['ctype.h'] = ['isalpha', 'isdigit', 'isalnum', 'isspace', 'isupper', 'islower', 'ispunct', 'isprint',
                          'iscntrl', 'isxdigit', 'isgraph', 'isblank', 'toupper', 'tolower'].map(function (name) {
        return 'int ' + name + '(int c);';
    });

    headers['time.h'] = [
        '#include <stddef.h>',
        'typedef long time_t;', 'typedef long clock_t;',
        '#define CLOCKS_PER_SEC 1000000L',
        'struct tm { int tm_sec; int tm_min; int tm_hour; int tm_mday; int tm_mon; int tm_year; int tm_wday; int tm_yday; int tm_isdst; long tm_gmtoff; const char *tm_zone; };',
        'struct timespec { time_t tv_sec; long tv_nsec; };',
        'time_t time(time_t *result);',
        'clock_t clock(void);',
        'double difftime(time_t end, time_t start);',
        'struct tm *localtime(const time_t *time);',
        'struct tm *gmtime(const time_t *time);',
        'time_t mktime(struct tm *tm);',
        'size_t strftime(char *s, size_t max, const char *format, const struct tm *tm);',
        'char *ctime(const time_t *time);',
        'char *asctime(const struct tm *tm);',
        'int nanosleep(const struct timespec *request, struct timespec *remaining);'
    ];

    headers['unistd.h'] = [
        'typedef unsigned int useconds_t;',
        'unsigned int sleep(unsigned int seconds);',
        'int usleep(useconds_t microseconds);'
    ];

    headers['assert.h'] = [
        '_Noreturn void __assert_fail(const char *expression, const char *file, unsigned int line, const char *function);',
        '#ifdef NDEBUG',
        '#define assert(e) ((void)0)',
        '#else',
        '#define assert(e) ((e) ? (void)0 : __assert_fail(#e, __FILE__, __LINE__, __func__))',
        '#endif',
        '#define static_assert _Static_assert'
    ];

    // Values of JavaScript; host modules have headers of their own
    // (C.hostHeader).
    headers['js.h'] = [
        '#include <stddef.h>',
        'typedef struct js_object *js_value;',
        'js_value js_global(void);',
        'js_value js_get(js_value object, const char *name);',
        'void js_set(js_value object, const char *name, ...);',
        'js_value js_call(js_value object, const char *method, ...);',
        'js_value js_invoke(js_value function, ...);',
        'js_value js_new(js_value constructor, ...);',
        'js_value js_index(js_value array, long index);',
        'void js_set_index(js_value array, long index, ...);',
        'long js_length(js_value value);',
        'double js_number(js_value value);',
        'long long js_int(js_value value);',
        'char *js_string(js_value value);',
        'int js_bool(js_value value);',
        'int js_is_null(js_value value);',
        'const char *js_type(js_value value);',
        'js_value js_from_int(long long value);',
        'js_value js_from_double(double value);',
        'js_value js_from_string(const char *value);',
        'js_value js_from_bool(int value);',
        'js_value js_array(int count, ...);',
        'js_value js_object(const char *key, ...);',
        'js_value js_function(void *function);'
    ];

    var texts = {};
    Object.keys(headers).forEach(function (name) {
        texts[name] = headers[name].join('\n') + '\n';
    });
    C.headers = texts;

    // Names that the built-in headers declare: a function of a host module
    // never hides them.
    var declared = Object.create(null);
    Object.keys(texts).forEach(function (name) {
        var pattern = /([A-Za-z_]\w*)\s*\(/g;
        var found;
        while ((found = pattern.exec(texts[name])) !== null)
            declared[found[1]] = true;
    });

    var C_PARAMETER = { string: 'const char *', number: 'double', int: 'long long', bool: '_Bool', value: 'js_value',
                        array: 'js_value' };
    var C_RESULT = { void: 'void', string: 'char *', number: 'double', int: 'long long', bool: '_Bool',
                     value: 'js_value', array: 'js_value' };

    // Header <name.h> of a host module: every function as name_function
    // (app_greet) and, unless a built-in header has the name, as function
    // (greet) too. Optional parameters are passed as NULL or 0.
    C.hostHeader = function (module) {
        var lines = ['#include <js.h>'];
        var names = [];
        module.functions.forEach(function (fn) {
            var parameters = [];
            var count = fn.getter ? 0 : fn.parameters.length;
            for (var index = 0; index < count; ++index)
                parameters.push(C_PARAMETER[fn.parameters[index].type] + ' ' + fn.parameters[index].name);
            var tail = '(' + (parameters.length > 0 ? parameters.join(', ') : 'void') + ');';
            var result = C_RESULT[fn.result] + ' ';
            var prefixed = module.names.snake + '_' + fn.names.snake;
            lines.push(result + prefixed + tail);
            names.push({ name: prefixed, fn: fn });
            if (!declared[fn.names.snake]) {
                lines.push(result + fn.names.snake + tail);
                names.push({ name: fn.names.snake, fn: fn });
            }
        });
        return { text: lines.join('\n').replace(/\* /g, '*') + '\n', names: names };
    };

    // Headers included in every unit (as if by #include): a unit does not
    // need #include <stdio.h> for printf.
    C.implicitHeaders = ['stddef.h', 'stdbool.h', 'stdarg.h', 'stdint.h', 'inttypes.h', 'limits.h', 'float.h', 'errno.h',
                         'stdio.h', 'stdlib.h', 'string.h', 'math.h', 'ctype.h', 'time.h', 'unistd.h', 'assert.h', 'js.h'];
})(globalThis);
