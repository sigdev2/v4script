// C++ library: the base - <cstddef>, <type_traits>, <utility>, <initializer_list>,
// <limits>, <new>, <exception>, <typeinfo>, <cmath> and the C headers in std. The
// text is C++ that the translator compiles (see library.js).
// The tables of declarations are written by tools/build-cpp-library.mjs.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    if (X.headers['v4script/base'])
        return;

    X.addHeader('v4script/base', [
        ['', 2, 2, ''],
        ['', 3, 3, ''],
        ['', 4, 4, ''],
        ['', 5, 5, ''],
        ['', 6, 6, ''],
        ['', 7, 7, ''],
        ['', 8, 8, ''],
        ['', 10, 27, ''],
        ['std', 30, 30, 'size_t'],
        ['std', 31, 31, 'ptrdiff_t'],
        ['std', 32, 32, 'nullptr_t'],
        ['std', 33, 33, 'max_align_t'],
        ['std', 34, 34, 'byte'],
        ['std', 36, 36, 'int8_t int16_t int32_t int64_t'],
        ['std', 37, 37, 'uint8_t uint16_t uint32_t uint64_t'],
        ['std', 38, 38, 'intptr_t uintptr_t intmax_t uintmax_t'],
        ['std', 39, 39, 'int_fast8_t int_fast16_t int_fast32_t int_fast64_t'],
        ['std', 40, 40, 'uint_fast8_t uint_fast16_t uint_fast32_t uint_fast64_t'],
        ['std', 41, 41, 'int_least8_t int_least16_t int_least32_t int_least64_t'],
        ['std', 42, 42, 'uint_least8_t uint_least16_t uint_least32_t uint_least64_t'],
        ['std', 45, 45, 'FILE fpos_t'],
        ['std', 46, 46, 'printf fprintf sprintf snprintf vprintf vfprintf'],
        ['std', 47, 47, 'vsprintf vsnprintf puts fputs putchar fputc putc'],
        ['std', 48, 48, 'getchar fgetc getc ungetc fgets scanf fscanf'],
        ['std', 49, 49, 'sscanf fflush perror fopen fclose feof ferror'],
        ['std', 50, 50, 'fwrite fread fseek ftell rewind clearerr remove'],
        ['std', 51, 51, 'setbuf setvbuf'],
        ['std', 52, 52, 'malloc calloc realloc free exit abort atexit'],
        ['std', 53, 53, 'atoi atol atoll atof strtol strtoul strtoll'],
        ['std', 54, 54, 'strtoull strtod strtof div ldiv div_t ldiv_t'],
        ['std', 55, 55, 'rand srand qsort bsearch getenv system _Exit'],
        ['std', 56, 56, 'strlen strnlen strcpy strncpy strcat strncat strcmp'],
        ['std', 57, 57, 'strncmp strcoll strchr strrchr strstr strdup strtok'],
        ['std', 58, 58, 'strspn strcspn strpbrk strerror memcpy memmove memset'],
        ['std', 59, 59, 'memcmp memchr'],
        ['std', 60, 60, 'isalpha isdigit isalnum isspace isupper islower'],
        ['std', 61, 61, 'ispunct isprint iscntrl isxdigit isgraph isblank'],
        ['std', 62, 62, 'toupper tolower'],
        ['std', 63, 63, 'time_t clock_t tm time clock difftime localtime'],
        ['std', 64, 64, 'gmtime mktime strftime ctime asctime'],
        ['std', 68, 74, 'integral_constant'],
        ['std', 75, 75, 'true_type'],
        ['std', 76, 76, 'false_type'],
        ['std', 77, 77, 'bool_constant'],
        ['std', 79, 79, 'is_same'],
        ['std', 80, 80, 'is_same'],
        ['std', 81, 81, 'remove_const'],
        ['std', 82, 82, 'remove_const'],
        ['std', 83, 83, 'remove_volatile'],
        ['std', 84, 84, 'remove_volatile'],
        ['std', 85, 85, 'remove_cv'],
        ['std', 86, 86, 'remove_reference'],
        ['std', 87, 87, 'remove_reference'],
        ['std', 88, 88, 'remove_reference'],
        ['std', 89, 89, 'remove_cvref'],
        ['std', 90, 90, 'remove_pointer'],
        ['std', 91, 91, 'remove_pointer'],
        ['std', 92, 92, 'remove_pointer'],
        ['std', 93, 93, 'remove_extent'],
        ['std', 94, 94, 'remove_extent'],
        ['std', 95, 95, 'remove_extent'],
        ['std', 96, 96, 'add_const'],
        ['std', 97, 97, 'add_volatile'],
        ['std', 98, 98, 'add_cv'],
        ['std', 99, 99, 'add_pointer'],
        ['std', 100, 100, 'add_lvalue_reference'],
        ['std', 101, 101, 'add_lvalue_reference'],
        ['std', 102, 102, 'add_rvalue_reference'],
        ['std', 103, 103, 'add_rvalue_reference'],
        ['std', 104, 104, 'type_identity'],
        ['std', 106, 106, 'conditional'],
        ['std', 107, 107, 'conditional'],
        ['std', 108, 108, 'enable_if'],
        ['std', 109, 109, 'enable_if'],
        ['std', 110, 110, '__void_type'],
        ['std', 111, 111, 'void_t'],
        ['std', 113, 113, 'is_void'],
        ['std', 114, 114, '__is_integral_base'],
        ['std', 115, 115, '__is_integral_base'],
        ['std', 116, 116, '__is_integral_base'],
        ['std', 117, 117, '__is_integral_base'],
        ['std', 118, 118, '__is_integral_base'],
        ['std', 119, 119, '__is_integral_base'],
        ['std', 120, 120, '__is_integral_base'],
        ['std', 121, 121, '__is_integral_base'],
        ['std', 122, 122, '__is_integral_base'],
        ['std', 123, 123, '__is_integral_base'],
        ['std', 124, 124, '__is_integral_base'],
        ['std', 125, 125, '__is_integral_base'],
        ['std', 126, 126, '__is_integral_base'],
        ['std', 127, 127, '__is_integral_base'],
        ['std', 128, 128, '__is_integral_base'],
        ['std', 129, 129, '__is_integral_base'],
        ['std', 130, 130, 'is_integral'],
        ['std', 131, 131, '__is_floating_base'],
        ['std', 132, 132, '__is_floating_base'],
        ['std', 133, 133, '__is_floating_base'],
        ['std', 134, 134, '__is_floating_base'],
        ['std', 135, 135, 'is_floating_point'],
        ['std', 136, 136, 'is_arithmetic'],
        ['std', 137, 137, '__is_pointer_base'],
        ['std', 138, 138, '__is_pointer_base'],
        ['std', 139, 139, 'is_pointer'],
        ['std', 140, 140, 'is_lvalue_reference'],
        ['std', 141, 141, 'is_lvalue_reference'],
        ['std', 142, 142, 'is_rvalue_reference'],
        ['std', 143, 143, 'is_rvalue_reference'],
        ['std', 144, 145, 'is_reference'],
        ['std', 146, 146, 'is_const'],
        ['std', 147, 147, 'is_const'],
        ['std', 148, 148, 'is_volatile'],
        ['std', 149, 149, 'is_volatile'],
        ['std', 150, 150, 'is_array'],
        ['std', 151, 151, 'is_array'],
        ['std', 152, 152, 'is_array'],
        ['std', 153, 153, 'is_function'],
        ['std', 154, 154, 'is_function'],
        ['std', 155, 155, 'is_class'],
        ['std', 156, 156, 'is_union'],
        ['std', 157, 157, 'is_enum'],
        ['std', 158, 158, 'is_empty'],
        ['std', 159, 159, 'is_polymorphic'],
        ['std', 160, 160, 'is_abstract'],
        ['std', 161, 161, 'is_final'],
        ['std', 162, 162, 'is_aggregate'],
        ['std', 163, 163, 'is_trivially_copyable'],
        ['std', 164, 164, 'is_trivially_destructible'],
        ['std', 165, 165, 'is_trivially_default_constructible'],
        ['std', 166, 166, 'is_standard_layout'],
        ['std', 167, 167, 'is_pod'],
        ['std', 168, 168, 'has_virtual_destructor'],
        ['std', 169, 169, 'is_base_of'],
        ['std', 170, 170, 'is_convertible'],
        ['std', 171, 171, 'is_assignable'],
        ['std', 172, 173, 'is_fundamental'],
        ['std', 174, 176, 'is_scalar'],
        ['std', 177, 178, 'is_object'],
        ['std', 179, 179, 'is_compound'],
        ['std', 180, 180, 'is_member_pointer'],
        ['std', 181, 181, '__is_signed_base'],
        ['std', 182, 182, '__is_signed_base'],
        ['std', 183, 183, 'is_signed'],
        ['std', 184, 184, '__is_unsigned_base'],
        ['std', 185, 185, '__is_unsigned_base'],
        ['std', 186, 186, 'is_unsigned'],
        ['std', 187, 187, 'underlying_type'],
        ['std', 188, 188, 'rank'],
        ['std', 189, 189, 'rank'],
        ['std', 190, 190, 'rank'],
        ['std', 191, 191, 'extent'],
        ['std', 192, 192, 'extent'],
        ['std', 194, 194, '__decay_base'],
        ['std', 195, 195, '__decay_base'],
        ['std', 196, 196, '__decay_base'],
        ['std', 197, 197, '__decay_base'],
        ['std', 198, 198, 'decay'],
        ['std', 200, 200, 'make_unsigned'],
        ['std', 201, 201, 'make_unsigned'],
        ['std', 202, 202, 'make_unsigned'],
        ['std', 203, 203, 'make_unsigned'],
        ['std', 204, 204, 'make_unsigned'],
        ['std', 205, 205, 'make_unsigned'],
        ['std', 206, 206, 'make_unsigned'],
        ['std', 207, 207, 'make_signed'],
        ['std', 208, 208, 'make_signed'],
        ['std', 209, 209, 'make_signed'],
        ['std', 210, 210, 'make_signed'],
        ['std', 211, 211, 'make_signed'],
        ['std', 212, 212, 'make_signed'],
        ['std', 213, 213, 'make_signed'],
        ['std', 215, 215, 'declval'],
        ['std', 217, 217, 'common_type'],
        ['std', 218, 218, 'common_type'],
        ['std', 219, 221, 'common_type'],
        ['std', 222, 224, 'common_type'],
        ['std', 225, 225, 'invoke_result'],
        ['std', 226, 226, 'result_of'],
        ['std', 227, 227, 'result_of'],
        ['std', 229, 229, 'is_constructible'],
        ['std', 230, 230, 'is_default_constructible'],
        ['std', 231, 232, 'is_copy_constructible'],
        ['std', 233, 234, 'is_move_constructible'],
        ['std', 235, 235, 'is_copy_assignable'],
        ['std', 236, 236, 'is_move_assignable'],
        ['std', 237, 237, 'is_nothrow_move_constructible'],
        ['std', 238, 238, 'is_nothrow_move_assignable'],
        ['std', 239, 239, 'is_nothrow_copy_constructible'],
        ['std', 240, 240, 'is_nothrow_default_constructible'],
        ['std', 241, 241, 'is_nothrow_destructible'],
        ['std', 242, 242, 'is_destructible'],
        ['std', 243, 243, 'is_trivially_copy_constructible'],
        ['std', 244, 244, 'is_trivially_move_constructible'],
        ['std', 245, 245, 'is_trivial'],
        ['std', 247, 247, 'is_same_v'],
        ['std', 248, 248, 'is_void_v'],
        ['std', 249, 249, 'is_integral_v'],
        ['std', 250, 250, 'is_floating_point_v'],
        ['std', 251, 251, 'is_arithmetic_v'],
        ['std', 252, 252, 'is_pointer_v'],
        ['std', 253, 253, 'is_reference_v'],
        ['std', 254, 254, 'is_lvalue_reference_v'],
        ['std', 255, 255, 'is_rvalue_reference_v'],
        ['std', 256, 256, 'is_const_v'],
        ['std', 257, 257, 'is_array_v'],
        ['std', 258, 258, 'is_class_v'],
        ['std', 259, 259, 'is_enum_v'],
        ['std', 260, 260, 'is_function_v'],
        ['std', 261, 261, 'is_empty_v'],
        ['std', 262, 262, 'is_polymorphic_v'],
        ['std', 263, 263, 'is_abstract_v'],
        ['std', 264, 264, 'is_signed_v'],
        ['std', 265, 265, 'is_unsigned_v'],
        ['std', 266, 266, 'is_scalar_v'],
        ['std', 267, 267, 'is_fundamental_v'],
        ['std', 268, 268, 'is_trivially_copyable_v'],
        ['std', 269, 269, 'is_trivially_destructible_v'],
        ['std', 270, 270, 'is_base_of_v'],
        ['std', 271, 271, 'is_convertible_v'],
        ['std', 272, 272, 'remove_const_t'],
        ['std', 273, 273, 'remove_volatile_t'],
        ['std', 274, 274, 'remove_cv_t'],
        ['std', 275, 275, 'remove_reference_t'],
        ['std', 276, 276, 'remove_cvref_t'],
        ['std', 277, 277, 'remove_pointer_t'],
        ['std', 278, 278, 'remove_extent_t'],
        ['std', 279, 279, 'add_const_t'],
        ['std', 280, 280, 'add_pointer_t'],
        ['std', 281, 281, 'add_lvalue_reference_t'],
        ['std', 282, 282, 'add_rvalue_reference_t'],
        ['std', 283, 283, 'decay_t'],
        ['std', 284, 284, 'enable_if_t'],
        ['std', 285, 285, 'conditional_t'],
        ['std', 286, 286, 'common_type_t'],
        ['std', 287, 287, 'underlying_type_t'],
        ['std', 288, 288, 'make_unsigned_t'],
        ['std', 289, 289, 'make_signed_t'],
        ['std', 290, 290, 'invoke_result_t'],
        ['std', 294, 296, 'move'],
        ['std', 297, 299, 'forward'],
        ['std', 300, 302, 'forward'],
        ['std', 303, 307, 'swap'],
        ['std', 308, 311, 'swap'],
        ['std', 312, 316, 'exchange'],
        ['std', 317, 317, 'as_const'],
        ['std', 318, 318, 'addressof'],
        ['std', 320, 320, 'piecewise_construct_t'],
        ['std', 321, 321, 'piecewise_construct'],
        ['std', 323, 361, 'pair'],
        ['std', 362, 362, 'pair'],
        ['std', 363, 365, 'operator=='],
        ['std', 366, 367, 'operator!='],
        ['std', 368, 370, 'operator<'],
        ['std', 371, 371, 'operator>'],
        ['std', 372, 373, 'operator<='],
        ['std', 374, 375, 'operator>='],
        ['std', 376, 379, 'make_pair'],
        ['std', 380, 380, 'swap'],
        ['std', 382, 382, 'tuple_size'],
        ['std', 383, 383, 'tuple_element'],
        ['std', 384, 384, 'tuple_size'],
        ['std', 385, 386, 'tuple_element'],
        ['std', 387, 387, 'tuple_size'],
        ['std', 388, 388, 'tuple_element'],
        ['std', 389, 389, 'tuple_element'],
        ['std', 390, 390, '__pair_get'],
        ['std', 391, 394, '__pair_get'],
        ['std', 395, 398, '__pair_get'],
        ['std', 399, 401, 'get'],
        ['std', 402, 405, 'get'],
        ['std', 406, 408, 'get'],
        ['std', 409, 409, 'get'],
        ['std', 410, 410, 'get'],
        ['std', 411, 411, 'get'],
        ['std', 412, 412, 'get'],
        ['std', 413, 413, 'tuple_element_t'],
        ['std', 414, 414, 'tuple_size_v'],
        ['std', 416, 419, 'integer_sequence'],
        ['std', 420, 420, 'index_sequence'],
        ['std', 421, 421, '__make_index'],
        ['std', 422, 422, '__make_index'],
        ['std', 423, 423, 'make_index_sequence'],
        ['std', 424, 424, 'index_sequence_for'],
        ['std', 428, 442, 'initializer_list'],
        ['std', 443, 443, 'begin'],
        ['std', 444, 444, 'end'],
        ['std', 448, 455, 'exception'],
        ['std', 456, 459, 'bad_exception'],
        ['std', 460, 463, 'bad_alloc'],
        ['std', 464, 467, 'bad_array_new_length'],
        ['std', 468, 471, 'bad_cast'],
        ['std', 472, 475, 'bad_typeid'],
        ['std', 476, 476, '__throw_bad_cast'],
        ['std', 478, 483, '__allocate'],
        ['std', 484, 484, '__deallocate'],
        ['std', 485, 500, 'allocator'],
        ['std', 501, 501, 'nothrow_t'],
        ['std', 502, 502, 'nothrow'],
        ['std', 503, 503, 'terminate'],
        ['std', 504, 504, 'uncaught_exception'],
        ['std', 505, 505, 'uncaught_exceptions'],
        ['std', 507, 518, 'type_info'],
        ['std', 522, 523, 'float_round_style round_indeterminate round_toward_zero round_to_nearest round_toward_infinity round_toward_neg_infinity'],
        ['std', 524, 524, 'float_denorm_style denorm_indeterminate denorm_absent denorm_present'],
        ['std', 525, 530, 'numeric_limits'],
        ['std', 531, 560, '__integer_limits'],
        ['std', 561, 561, 'numeric_limits'],
        ['std', 562, 562, 'numeric_limits'],
        ['std', 563, 563, 'numeric_limits'],
        ['std', 564, 564, 'numeric_limits'],
        ['std', 565, 565, 'numeric_limits'],
        ['std', 566, 566, 'numeric_limits'],
        ['std', 567, 567, 'numeric_limits'],
        ['std', 568, 568, 'numeric_limits'],
        ['std', 569, 569, 'numeric_limits'],
        ['std', 570, 570, 'numeric_limits'],
        ['std', 571, 571, 'numeric_limits'],
        ['std', 572, 573, 'numeric_limits'],
        ['std', 574, 575, 'numeric_limits'],
        ['std', 576, 577, 'numeric_limits'],
        ['std', 578, 579, 'numeric_limits'],
        ['std', 580, 609, 'numeric_limits'],
        ['std', 610, 639, 'numeric_limits'],
        ['std', 640, 640, 'numeric_limits'],
        ['std', 641, 641, 'numeric_limits'],
        ['std', 645, 645, 'sin cos tan asin acos atan atan2 sinh'],
        ['std', 646, 646, 'cosh tanh asinh acosh atanh exp exp2 expm1'],
        ['std', 647, 647, 'log log2 log10 log1p sqrt cbrt hypot pow'],
        ['std', 648, 648, 'floor ceil round trunc rint nearbyint fmod'],
        ['std', 649, 649, 'remainder fmin fmax fdim copysign nextafter fabs'],
        ['std', 650, 650, 'tgamma lgamma erf erfc fma ldexp frexp modf'],
        ['std', 651, 651, 'nan lround llround lrint'],
        ['std', 652, 652, 'sinf cosf tanf sqrtf fabsf floorf ceilf powf'],
        ['std', 653, 653, 'expf logf roundf truncf'],
        ['std', 654, 654, 'sin'],
        ['std', 655, 655, 'cos'],
        ['std', 656, 656, 'tan'],
        ['std', 657, 657, 'asin'],
        ['std', 658, 658, 'acos'],
        ['std', 659, 659, 'atan'],
        ['std', 660, 660, 'atan2'],
        ['std', 661, 661, 'sinh'],
        ['std', 662, 662, 'cosh'],
        ['std', 663, 663, 'tanh'],
        ['std', 664, 664, 'exp'],
        ['std', 665, 665, 'exp2'],
        ['std', 666, 666, 'log'],
        ['std', 667, 667, 'log2'],
        ['std', 668, 668, 'log10'],
        ['std', 669, 669, 'sqrt'],
        ['std', 670, 670, 'cbrt'],
        ['std', 671, 671, 'hypot'],
        ['std', 672, 672, 'pow'],
        ['std', 673, 673, 'pow'],
        ['std', 674, 674, 'floor'],
        ['std', 675, 675, 'ceil'],
        ['std', 676, 676, 'round'],
        ['std', 677, 677, 'trunc'],
        ['std', 678, 678, 'fmod'],
        ['std', 679, 679, 'fmin'],
        ['std', 680, 680, 'fmax'],
        ['std', 681, 681, 'fabs'],
        ['std', 682, 682, 'abs'],
        ['std', 683, 683, 'abs'],
        ['std', 684, 684, 'abs'],
        ['std', 685, 685, 'abs'],
        ['std', 686, 686, 'abs'],
        ['std', 687, 687, 'abs'],
        ['std', 688, 688, 'labs llabs'],
        ['std', 689, 689, 'isnan'],
        ['std', 690, 690, 'isinf'],
        ['std', 691, 691, 'isfinite'],
        ['std', 692, 692, 'isnormal'],
        ['std', 693, 693, 'signbit'],
        ['std', 694, 694, 'sqrt'],
        ['std', 695, 695, 'floor'],
        ['std', 696, 696, 'ceil'],
        ['std', 697, 697, 'log'],
        ['std', 698, 698, 'log2'],
        ['std', 699, 699, 'log10'],
        ['std', 700, 700, 'exp'],
        ['std', 701, 701, 'sin'],
        ['std', 702, 702, 'cos'],
        ['std', 703, 703, 'cbrt'],
        ['std', 704, 704, 'tan'],
        ['std', 705, 705, 'asin'],
        ['std', 706, 706, 'acos'],
        ['std', 707, 707, 'atan'],
        ['std', 708, 708, 'sinh'],
        ['std', 709, 709, 'cosh'],
        ['std', 710, 710, 'tanh'],
        ['std', 711, 711, 'exp2'],
        ['std', 712, 712, 'round'],
        ['std', 713, 713, 'trunc'],
        ['std', 714, 714, 'fabs'],
        ['std', 715, 715, 'pow'],
        ['std', 716, 716, 'fmod'],
        ['std', 717, 717, 'fmin'],
        ['std', 718, 718, 'fmax'],
        ['std', 719, 719, 'hypot'],
        ['std', 720, 720, 'atan2'],
        ['std', 721, 721, 'isnan'],
        ['std', 722, 722, 'isinf'],
        ['std', 723, 723, 'isfinite'],
        ['', 726, 726, 'abs'],
        ['', 727, 727, 'isnan'],
        ['', 728, 728, 'isinf'],
        ['', 729, 729, 'isfinite'],
        ['', 730, 730, 'isnormal'],
        ['', 731, 731, 'signbit']
    ], String.raw`
#undef NULL
#define NULL 0L
#undef isnan
#undef isinf
#undef isfinite
#undef signbit
#undef isnormal

extern "C" {
void __v4_terminate();
unsigned long __v4_hash_bytes(const void* data, unsigned long length, unsigned long seed);
int __v4_format_integer(char* out, long long value, int isUnsigned, unsigned flags);
int __v4_format_float(char* out, int size, double value, unsigned flags, long precision);
int __v4_read_integer(FILE* file, const void* text, unsigned long* position, long long* out, int isUnsigned,
                      unsigned flags);
int __v4_read_float(FILE* file, const void* text, unsigned long* position, double* out);
int __v4_read_word(FILE* file, const void* text, unsigned long* position, char** out, unsigned long* length);
int __v4_read_char(FILE* file, const void* text, unsigned long* position, int skip);
int __v4_peek_char(FILE* file, const void* text, unsigned long* position);
int __v4_unget_char(FILE* file, const void* text, unsigned long* position, int c);
int __v4_getline(FILE* file, const void* text, unsigned long* position, int delimiter, char** out,
                 unsigned long* length, long limit);
int __v4_ignore(FILE* file, const void* text, unsigned long* position, long count, int delimiter);
long long __v4_clock(int steady);
unsigned __v4_random_device();
}

namespace std {
typedef unsigned long size_t;
typedef long ptrdiff_t;
typedef decltype(nullptr) nullptr_t;
typedef long double max_align_t;
enum class byte : unsigned char {};

using ::int8_t; using ::int16_t; using ::int32_t; using ::int64_t;
using ::uint8_t; using ::uint16_t; using ::uint32_t; using ::uint64_t;
using ::intptr_t; using ::uintptr_t; using ::intmax_t; using ::uintmax_t;
using ::int_fast8_t; using ::int_fast16_t; using ::int_fast32_t; using ::int_fast64_t;
using ::uint_fast8_t; using ::uint_fast16_t; using ::uint_fast32_t; using ::uint_fast64_t;
using ::int_least8_t; using ::int_least16_t; using ::int_least32_t; using ::int_least64_t;
using ::uint_least8_t; using ::uint_least16_t; using ::uint_least32_t; using ::uint_least64_t;

// <cstdio>, <cstdlib>, <cstring>, <cctype>, <ctime>
using ::FILE; using ::fpos_t;
using ::printf; using ::fprintf; using ::sprintf; using ::snprintf; using ::vprintf; using ::vfprintf;
using ::vsprintf; using ::vsnprintf; using ::puts; using ::fputs; using ::putchar; using ::fputc; using ::putc;
using ::getchar; using ::fgetc; using ::getc; using ::ungetc; using ::fgets; using ::scanf; using ::fscanf;
using ::sscanf; using ::fflush; using ::perror; using ::fopen; using ::fclose; using ::feof; using ::ferror;
using ::fwrite; using ::fread; using ::fseek; using ::ftell; using ::rewind; using ::clearerr; using ::remove;
using ::setbuf; using ::setvbuf;
using ::malloc; using ::calloc; using ::realloc; using ::free; using ::exit; using ::abort; using ::atexit;
using ::atoi; using ::atol; using ::atoll; using ::atof; using ::strtol; using ::strtoul; using ::strtoll;
using ::strtoull; using ::strtod; using ::strtof; using ::div; using ::ldiv; using ::div_t; using ::ldiv_t;
using ::rand; using ::srand; using ::qsort; using ::bsearch; using ::getenv; using ::system; using ::_Exit;
using ::strlen; using ::strnlen; using ::strcpy; using ::strncpy; using ::strcat; using ::strncat; using ::strcmp;
using ::strncmp; using ::strcoll; using ::strchr; using ::strrchr; using ::strstr; using ::strdup; using ::strtok;
using ::strspn; using ::strcspn; using ::strpbrk; using ::strerror; using ::memcpy; using ::memmove; using ::memset;
using ::memcmp; using ::memchr;
using ::isalpha; using ::isdigit; using ::isalnum; using ::isspace; using ::isupper; using ::islower;
using ::ispunct; using ::isprint; using ::iscntrl; using ::isxdigit; using ::isgraph; using ::isblank;
using ::toupper; using ::tolower;
using ::time_t; using ::clock_t; using ::tm; using ::time; using ::clock; using ::difftime; using ::localtime;
using ::gmtime; using ::mktime; using ::strftime; using ::ctime; using ::asctime;

// --- <type_traits>

template <class T, T v> struct integral_constant {
    static constexpr T value = v;
    typedef T value_type;
    typedef integral_constant type;
    constexpr operator value_type() const noexcept { return value; }
    constexpr value_type operator()() const noexcept { return value; }
};
typedef integral_constant<bool, true> true_type;
typedef integral_constant<bool, false> false_type;
template <bool B> using bool_constant = integral_constant<bool, B>;

template <class T, class U> struct is_same : false_type {};
template <class T> struct is_same<T, T> : true_type {};
template <class T> struct remove_const { typedef T type; };
template <class T> struct remove_const<const T> { typedef T type; };
template <class T> struct remove_volatile { typedef T type; };
template <class T> struct remove_volatile<volatile T> { typedef T type; };
template <class T> struct remove_cv { typedef typename remove_volatile<typename remove_const<T>::type>::type type; };
template <class T> struct remove_reference { typedef T type; };
template <class T> struct remove_reference<T&> { typedef T type; };
template <class T> struct remove_reference<T&&> { typedef T type; };
template <class T> struct remove_cvref { typedef typename remove_cv<typename remove_reference<T>::type>::type type; };
template <class T> struct remove_pointer { typedef T type; };
template <class T> struct remove_pointer<T*> { typedef T type; };
template <class T> struct remove_pointer<T* const> { typedef T type; };
template <class T> struct remove_extent { typedef T type; };
template <class T> struct remove_extent<T[]> { typedef T type; };
template <class T, size_t N> struct remove_extent<T[N]> { typedef T type; };
template <class T> struct add_const { typedef const T type; };
template <class T> struct add_volatile { typedef volatile T type; };
template <class T> struct add_cv { typedef const volatile T type; };
template <class T> struct add_pointer { typedef typename remove_reference<T>::type* type; };
template <class T> struct add_lvalue_reference { typedef T& type; };
template <> struct add_lvalue_reference<void> { typedef void type; };
template <class T> struct add_rvalue_reference { typedef T&& type; };
template <> struct add_rvalue_reference<void> { typedef void type; };
template <class T> struct type_identity { typedef T type; };

template <bool B, class T, class F> struct conditional { typedef T type; };
template <class T, class F> struct conditional<false, T, F> { typedef F type; };
template <bool B, class T = void> struct enable_if {};
template <class T> struct enable_if<true, T> { typedef T type; };
template <class...> struct __void_type { typedef void type; };
template <class... T> using void_t = typename __void_type<T...>::type;

template <class T> struct is_void : is_same<typename remove_cv<T>::type, void> {};
template <class T> struct __is_integral_base : false_type {};
template <> struct __is_integral_base<bool> : true_type {};
template <> struct __is_integral_base<char> : true_type {};
template <> struct __is_integral_base<signed char> : true_type {};
template <> struct __is_integral_base<unsigned char> : true_type {};
template <> struct __is_integral_base<wchar_t> : true_type {};
template <> struct __is_integral_base<char16_t> : true_type {};
template <> struct __is_integral_base<char32_t> : true_type {};
template <> struct __is_integral_base<short> : true_type {};
template <> struct __is_integral_base<unsigned short> : true_type {};
template <> struct __is_integral_base<int> : true_type {};
template <> struct __is_integral_base<unsigned int> : true_type {};
template <> struct __is_integral_base<long> : true_type {};
template <> struct __is_integral_base<unsigned long> : true_type {};
template <> struct __is_integral_base<long long> : true_type {};
template <> struct __is_integral_base<unsigned long long> : true_type {};
template <class T> struct is_integral : __is_integral_base<typename remove_cv<T>::type> {};
template <class T> struct __is_floating_base : false_type {};
template <> struct __is_floating_base<float> : true_type {};
template <> struct __is_floating_base<double> : true_type {};
template <> struct __is_floating_base<long double> : true_type {};
template <class T> struct is_floating_point : __is_floating_base<typename remove_cv<T>::type> {};
template <class T> struct is_arithmetic : bool_constant<is_integral<T>::value || is_floating_point<T>::value> {};
template <class T> struct __is_pointer_base : false_type {};
template <class T> struct __is_pointer_base<T*> : true_type {};
template <class T> struct is_pointer : __is_pointer_base<typename remove_cv<T>::type> {};
template <class T> struct is_lvalue_reference : false_type {};
template <class T> struct is_lvalue_reference<T&> : true_type {};
template <class T> struct is_rvalue_reference : false_type {};
template <class T> struct is_rvalue_reference<T&&> : true_type {};
template <class T>
struct is_reference : bool_constant<is_lvalue_reference<T>::value || is_rvalue_reference<T>::value> {};
template <class T> struct is_const : false_type {};
template <class T> struct is_const<const T> : true_type {};
template <class T> struct is_volatile : false_type {};
template <class T> struct is_volatile<volatile T> : true_type {};
template <class T> struct is_array : false_type {};
template <class T> struct is_array<T[]> : true_type {};
template <class T, size_t N> struct is_array<T[N]> : true_type {};
template <class T> struct is_function : false_type {};
template <class R, class... A> struct is_function<R(A...)> : true_type {};
template <class T> struct is_class : bool_constant<__is_class(T)> {};
template <class T> struct is_union : bool_constant<__is_union(T)> {};
template <class T> struct is_enum : bool_constant<__is_enum(T)> {};
template <class T> struct is_empty : bool_constant<__is_empty(T)> {};
template <class T> struct is_polymorphic : bool_constant<__is_polymorphic(T)> {};
template <class T> struct is_abstract : bool_constant<__is_abstract(T)> {};
template <class T> struct is_final : bool_constant<__is_final(T)> {};
template <class T> struct is_aggregate : bool_constant<__is_aggregate(T)> {};
template <class T> struct is_trivially_copyable : bool_constant<__is_trivially_copyable(T)> {};
template <class T> struct is_trivially_destructible : bool_constant<__is_trivially_destructible(T)> {};
template <class T> struct is_trivially_default_constructible : bool_constant<__is_trivially_constructible(T)> {};
template <class T> struct is_standard_layout : bool_constant<__is_standard_layout(T)> {};
template <class T> struct is_pod : bool_constant<__is_trivially_copyable(T) && __is_standard_layout(T)> {};
template <class T> struct has_virtual_destructor : bool_constant<__has_virtual_destructor(T)> {};
template <class B, class D> struct is_base_of : bool_constant<__is_base_of(B, D)> {};
template <class F, class T> struct is_convertible : bool_constant<__is_convertible(F, T)> {};
template <class T, class U> struct is_assignable : bool_constant<__is_assignable(T, U)> {};
template <class T> struct is_fundamental : bool_constant<is_arithmetic<T>::value || is_void<T>::value ||
                                                         is_same<typename remove_cv<T>::type, nullptr_t>::value> {};
template <class T>
struct is_scalar : bool_constant<is_arithmetic<T>::value || is_enum<T>::value || is_pointer<T>::value ||
                                                    is_same<typename remove_cv<T>::type, nullptr_t>::value> {};
template <class T> struct is_object : bool_constant<!is_function<T>::value && !is_reference<T>::value &&
                                                    !is_void<T>::value> {};
template <class T> struct is_compound : bool_constant<!is_fundamental<T>::value> {};
template <class T> struct is_member_pointer : false_type {};
template <class T, bool = is_arithmetic<T>::value> struct __is_signed_base : false_type {};
template <class T> struct __is_signed_base<T, true> : bool_constant<T(-1) < T(0)> {};
template <class T> struct is_signed : __is_signed_base<T> {};
template <class T, bool = is_arithmetic<T>::value> struct __is_unsigned_base : false_type {};
template <class T> struct __is_unsigned_base<T, true> : bool_constant<T(0) < T(-1)> {};
template <class T> struct is_unsigned : __is_unsigned_base<T> {};
template <class T> struct underlying_type { typedef __underlying_type(T) type; };
template <class T> struct rank : integral_constant<size_t, 0> {};
template <class T> struct rank<T[]> : integral_constant<size_t, rank<T>::value + 1> {};
template <class T, size_t N> struct rank<T[N]> : integral_constant<size_t, rank<T>::value + 1> {};
template <class T, unsigned I = 0> struct extent : integral_constant<size_t, 0> {};
template <class T, size_t N> struct extent<T[N], 0> : integral_constant<size_t, N> {};

template <class T> struct __decay_base { typedef typename remove_cv<T>::type type; };
template <class T> struct __decay_base<T[]> { typedef T* type; };
template <class T, size_t N> struct __decay_base<T[N]> { typedef T* type; };
template <class R, class... A> struct __decay_base<R(A...)> { typedef R (*type)(A...); };
template <class T> struct decay { typedef typename __decay_base<typename remove_reference<T>::type>::type type; };

template <class T> struct make_unsigned { typedef T type; };
template <> struct make_unsigned<char> { typedef unsigned char type; };
template <> struct make_unsigned<signed char> { typedef unsigned char type; };
template <> struct make_unsigned<short> { typedef unsigned short type; };
template <> struct make_unsigned<int> { typedef unsigned int type; };
template <> struct make_unsigned<long> { typedef unsigned long type; };
template <> struct make_unsigned<long long> { typedef unsigned long long type; };
template <class T> struct make_signed { typedef T type; };
template <> struct make_signed<char> { typedef signed char type; };
template <> struct make_signed<unsigned char> { typedef signed char type; };
template <> struct make_signed<unsigned short> { typedef short type; };
template <> struct make_signed<unsigned int> { typedef int type; };
template <> struct make_signed<unsigned long> { typedef long type; };
template <> struct make_signed<unsigned long long> { typedef long long type; };

template <class T> typename add_rvalue_reference<T>::type declval() noexcept;

template <class... T> struct common_type;
template <class T> struct common_type<T> { typedef typename decay<T>::type type; };
template <class T, class U> struct common_type<T, U> {
    typedef typename decay<decltype(true ? declval<T>() : declval<U>())>::type type;
};
template <class T, class U, class V, class... R> struct common_type<T, U, V, R...> {
    typedef typename common_type<typename common_type<T, U>::type, V, R...>::type type;
};
template <class F, class... A> struct invoke_result { typedef decltype(declval<F>()(declval<A>()...)) type; };
template <class F> struct result_of;
template <class F, class... A> struct result_of<F(A...)> { typedef decltype(declval<F>()(declval<A>()...)) type; };

template <class T, class... A> struct is_constructible : bool_constant<__is_constructible(T, A...)> {};
template <class T> struct is_default_constructible : bool_constant<__is_constructible(T)> {};
template <class T> struct is_copy_constructible
    : bool_constant<__is_constructible1(T, typename add_lvalue_reference<const T>::type)> {};
template <class T> struct is_move_constructible
    : bool_constant<__is_constructible1(T, typename add_rvalue_reference<T>::type)> {};
template <class T> struct is_copy_assignable : true_type {};
template <class T> struct is_move_assignable : true_type {};
template <class T> struct is_nothrow_move_constructible : bool_constant<__is_nothrow_move_constructible(T)> {};
template <class T> struct is_nothrow_move_assignable : true_type {};
template <class T> struct is_nothrow_copy_constructible : true_type {};
template <class T> struct is_nothrow_default_constructible : true_type {};
template <class T> struct is_nothrow_destructible : true_type {};
template <class T> struct is_destructible : true_type {};
template <class T> struct is_trivially_copy_constructible : is_trivially_copyable<T> {};
template <class T> struct is_trivially_move_constructible : is_trivially_copyable<T> {};
template <class T> struct is_trivial : bool_constant<__is_trivially_copyable(T) && __is_trivially_constructible(T)> {};

template <class T, class U> inline constexpr bool is_same_v = is_same<T, U>::value;
template <class T> inline constexpr bool is_void_v = is_void<T>::value;
template <class T> inline constexpr bool is_integral_v = is_integral<T>::value;
template <class T> inline constexpr bool is_floating_point_v = is_floating_point<T>::value;
template <class T> inline constexpr bool is_arithmetic_v = is_arithmetic<T>::value;
template <class T> inline constexpr bool is_pointer_v = is_pointer<T>::value;
template <class T> inline constexpr bool is_reference_v = is_reference<T>::value;
template <class T> inline constexpr bool is_lvalue_reference_v = is_lvalue_reference<T>::value;
template <class T> inline constexpr bool is_rvalue_reference_v = is_rvalue_reference<T>::value;
template <class T> inline constexpr bool is_const_v = is_const<T>::value;
template <class T> inline constexpr bool is_array_v = is_array<T>::value;
template <class T> inline constexpr bool is_class_v = is_class<T>::value;
template <class T> inline constexpr bool is_enum_v = is_enum<T>::value;
template <class T> inline constexpr bool is_function_v = is_function<T>::value;
template <class T> inline constexpr bool is_empty_v = is_empty<T>::value;
template <class T> inline constexpr bool is_polymorphic_v = is_polymorphic<T>::value;
template <class T> inline constexpr bool is_abstract_v = is_abstract<T>::value;
template <class T> inline constexpr bool is_signed_v = is_signed<T>::value;
template <class T> inline constexpr bool is_unsigned_v = is_unsigned<T>::value;
template <class T> inline constexpr bool is_scalar_v = is_scalar<T>::value;
template <class T> inline constexpr bool is_fundamental_v = is_fundamental<T>::value;
template <class T> inline constexpr bool is_trivially_copyable_v = is_trivially_copyable<T>::value;
template <class T> inline constexpr bool is_trivially_destructible_v = is_trivially_destructible<T>::value;
template <class B, class D> inline constexpr bool is_base_of_v = is_base_of<B, D>::value;
template <class F, class T> inline constexpr bool is_convertible_v = is_convertible<F, T>::value;
template <class T> using remove_const_t = typename remove_const<T>::type;
template <class T> using remove_volatile_t = typename remove_volatile<T>::type;
template <class T> using remove_cv_t = typename remove_cv<T>::type;
template <class T> using remove_reference_t = typename remove_reference<T>::type;
template <class T> using remove_cvref_t = typename remove_cvref<T>::type;
template <class T> using remove_pointer_t = typename remove_pointer<T>::type;
template <class T> using remove_extent_t = typename remove_extent<T>::type;
template <class T> using add_const_t = typename add_const<T>::type;
template <class T> using add_pointer_t = typename add_pointer<T>::type;
template <class T> using add_lvalue_reference_t = typename add_lvalue_reference<T>::type;
template <class T> using add_rvalue_reference_t = typename add_rvalue_reference<T>::type;
template <class T> using decay_t = typename decay<T>::type;
template <bool B, class T = void> using enable_if_t = typename enable_if<B, T>::type;
template <bool B, class T, class F> using conditional_t = typename conditional<B, T, F>::type;
template <class... T> using common_type_t = typename common_type<T...>::type;
template <class T> using underlying_type_t = typename underlying_type<T>::type;
template <class T> using make_unsigned_t = typename make_unsigned<T>::type;
template <class T> using make_signed_t = typename make_signed<T>::type;
template <class F, class... A> using invoke_result_t = typename invoke_result<F, A...>::type;

// --- <utility>

template <class T> constexpr typename remove_reference<T>::type&& move(T&& t) noexcept {
    return static_cast<typename remove_reference<T>::type&&>(t);
}
template <class T> constexpr T&& forward(typename remove_reference<T>::type& t) noexcept {
    return static_cast<T&&>(t);
}
template <class T> constexpr T&& forward(typename remove_reference<T>::type&& t) noexcept {
    return static_cast<T&&>(t);
}
template <class T> void swap(T& a, T& b) {
    T tmp(std::move(a));
    a = std::move(b);
    b = std::move(tmp);
}
template <class T, size_t N> void swap(T (&a)[N], T (&b)[N]) {
    for (size_t i = 0; i < N; ++i)
        swap(a[i], b[i]);
}
template <class T, class U = T> T exchange(T& object, U&& value) {
    T old = std::move(object);
    object = std::forward<U>(value);
    return old;
}
template <class T> constexpr const T& as_const(T& t) noexcept { return t; }
template <class T> constexpr T* addressof(T& t) noexcept { return &t; }

struct piecewise_construct_t {};
inline constexpr piecewise_construct_t piecewise_construct = piecewise_construct_t();

template <class T1, class T2> struct pair {
    typedef T1 first_type;
    typedef T2 second_type;
    T1 first;
    T2 second;
    constexpr pair() : first(), second() {}
    constexpr pair(const T1& a, const T2& b) : first(a), second(b) {}
    template <class U1, class U2, class = typename enable_if<is_constructible<T1, U1&&>::value &&
                                                             is_constructible<T2, U2&&>::value>::type>
    constexpr pair(U1&& a, U2&& b) : first(std::forward<U1>(a)), second(std::forward<U2>(b)) {}
    template <class U1, class U2, class = typename enable_if<is_constructible<T1, const U1&>::value &&
                                                             is_constructible<T2, const U2&>::value>::type>
    constexpr pair(const pair<U1, U2>& p) : first(p.first), second(p.second) {}
    template <class U1, class U2, class = typename enable_if<is_constructible<T1, U1&&>::value &&
                                                             is_constructible<T2, U2&&>::value>::type>
    constexpr pair(pair<U1, U2>&& p) : first(std::forward<U1>(p.first)), second(std::forward<U2>(p.second)) {}
    pair(const pair&) = default;
    pair(pair&&) = default;
    pair& operator=(const pair& p) {
        first = p.first;
        second = p.second;
        return *this;
    }
    pair& operator=(pair&& p) {
        first = std::move(p.first);
        second = std::move(p.second);
        return *this;
    }
    template <class U1, class U2> pair& operator=(const pair<U1, U2>& p) {
        first = p.first;
        second = p.second;
        return *this;
    }
    void swap(pair& p) {
        using std::swap;
        swap(first, p.first);
        swap(second, p.second);
    }
};
template <class T1, class T2> pair(T1, T2) -> pair<T1, T2>;
template <class T1, class T2> constexpr bool operator==(const pair<T1, T2>& a, const pair<T1, T2>& b) {
    return a.first == b.first && a.second == b.second;
}
template <class T1, class T2>
constexpr bool operator!=(const pair<T1, T2>& a, const pair<T1, T2>& b) { return !(a == b); }
template <class T1, class T2> constexpr bool operator<(const pair<T1, T2>& a, const pair<T1, T2>& b) {
    return a.first < b.first || (!(b.first < a.first) && a.second < b.second);
}
template <class T1, class T2> constexpr bool operator>(const pair<T1, T2>& a, const pair<T1, T2>& b) { return b < a; }
template <class T1, class T2>
constexpr bool operator<=(const pair<T1, T2>& a, const pair<T1, T2>& b) { return !(b < a); }
template <class T1, class T2>
constexpr bool operator>=(const pair<T1, T2>& a, const pair<T1, T2>& b) { return !(a < b); }
template <class T1, class T2>
constexpr pair<typename decay<T1>::type, typename decay<T2>::type> make_pair(T1&& a, T2&& b) {
    return pair<typename decay<T1>::type, typename decay<T2>::type>(std::forward<T1>(a), std::forward<T2>(b));
}
template <class T1, class T2> void swap(pair<T1, T2>& a, pair<T1, T2>& b) { a.swap(b); }

template <class T> struct tuple_size;
template <size_t I, class T> struct tuple_element;
template <class T> struct tuple_size<const T> : tuple_size<T> {};
template <size_t I, class T>
struct tuple_element<I, const T> { typedef const typename tuple_element<I, T>::type type; };
template <class T1, class T2> struct tuple_size<pair<T1, T2>> : integral_constant<size_t, 2> {};
template <class T1, class T2> struct tuple_element<0, pair<T1, T2>> { typedef T1 type; };
template <class T1, class T2> struct tuple_element<1, pair<T1, T2>> { typedef T2 type; };
template <size_t I> struct __pair_get;
template <> struct __pair_get<0> {
    template <class T1, class T2> static T1& get(pair<T1, T2>& p) { return p.first; }
    template <class T1, class T2> static const T1& get(const pair<T1, T2>& p) { return p.first; }
};
template <> struct __pair_get<1> {
    template <class T1, class T2> static T2& get(pair<T1, T2>& p) { return p.second; }
    template <class T1, class T2> static const T2& get(const pair<T1, T2>& p) { return p.second; }
};
template <size_t I, class T1, class T2> typename tuple_element<I, pair<T1, T2>>::type& get(pair<T1, T2>& p) {
    return __pair_get<I>::get(p);
}
template <size_t I, class T1, class T2>
const typename tuple_element<I, pair<T1, T2>>::type& get(const pair<T1, T2>& p) {
    return __pair_get<I>::get(p);
}
template <size_t I, class T1, class T2> typename tuple_element<I, pair<T1, T2>>::type&& get(pair<T1, T2>&& p) {
    return std::move(__pair_get<I>::get(p));
}
template <class T, class U> T& get(pair<T, U>& p) { return p.first; }
template <class T, class U> const T& get(const pair<T, U>& p) { return p.first; }
template <class T, class U> T& get(pair<U, T>& p) { return p.second; }
template <class T, class U> const T& get(const pair<U, T>& p) { return p.second; }
template <size_t I, class T> using tuple_element_t = typename tuple_element<I, T>::type;
template <class T> inline constexpr size_t tuple_size_v = tuple_size<T>::value;

template <class T, T... I> struct integer_sequence {
    typedef T value_type;
    static constexpr size_t size() noexcept { return sizeof...(I); }
};
template <size_t... I> using index_sequence = integer_sequence<size_t, I...>;
template <size_t N, size_t... I> struct __make_index : __make_index<N - 1, N - 1, I...> {};
template <size_t... I> struct __make_index<0, I...> { typedef index_sequence<I...> type; };
template <size_t N> using make_index_sequence = typename __make_index<N>::type;
template <class... T> using index_sequence_for = make_index_sequence<sizeof...(T)>;

// --- <initializer_list>

template <class E> class initializer_list {
    const E* __array;
    size_t __length;
public:
    typedef E value_type;
    typedef const E& reference;
    typedef const E& const_reference;
    typedef size_t size_type;
    typedef const E* iterator;
    typedef const E* const_iterator;
    constexpr initializer_list() noexcept : __array(0), __length(0) {}
    constexpr size_t size() const noexcept { return __length; }
    constexpr const E* begin() const noexcept { return __array; }
    constexpr const E* end() const noexcept { return __array + __length; }
};
template <class E> constexpr const E* begin(initializer_list<E> list) noexcept { return list.begin(); }
template <class E> constexpr const E* end(initializer_list<E> list) noexcept { return list.end(); }

// --- <exception>, <new>, <typeinfo>

class exception {
public:
    exception() noexcept {}
    exception(const exception&) noexcept = default;
    exception& operator=(const exception&) noexcept = default;
    virtual ~exception() noexcept {}
    virtual const char* what() const noexcept { return "std::exception"; }
};
class bad_exception : public exception {
public:
    const char* what() const noexcept override { return "std::bad_exception"; }
};
class bad_alloc : public exception {
public:
    const char* what() const noexcept override { return "std::bad_alloc"; }
};
class bad_array_new_length : public bad_alloc {
public:
    const char* what() const noexcept override { return "std::bad_array_new_length"; }
};
class bad_cast : public exception {
public:
    const char* what() const noexcept override { return "std::bad_cast"; }
};
class bad_typeid : public exception {
public:
    const char* what() const noexcept override { return "std::bad_typeid"; }
};
inline void __throw_bad_cast() { throw bad_cast(); }
// The memory of the containers.
inline void* __allocate(size_t size) {
    void* memory = malloc(size == 0 ? 1 : size);
    if (memory == 0)
        throw bad_alloc();
    return memory;
}
inline void __deallocate(void* memory) noexcept { free(memory); }
template <class T> struct allocator {
    typedef T value_type;
    typedef size_t size_type;
    typedef ptrdiff_t difference_type;
    typedef T* pointer;
    typedef const T* const_pointer;
    typedef T& reference;
    typedef const T& const_reference;
    template <class U> struct rebind { typedef allocator<U> other; };
    allocator() noexcept {}
    template <class U> allocator(const allocator<U>&) noexcept {}
    T* allocate(size_t n) { return static_cast<T*>(__allocate(n * sizeof(T))); }
    void deallocate(T* p, size_t) noexcept { __deallocate(p); }
    bool operator==(const allocator&) const noexcept { return true; }
    bool operator!=(const allocator&) const noexcept { return false; }
};
struct nothrow_t { explicit nothrow_t() = default; };
inline constexpr nothrow_t nothrow = nothrow_t();
inline void terminate() noexcept { __v4_terminate(); }
inline bool uncaught_exception() noexcept { return false; }
inline int uncaught_exceptions() noexcept { return 0; }

class type_info {
    const char* __name;
    long __id;
    type_info(const type_info&) = delete;
    type_info& operator=(const type_info&) = delete;
public:
    const char* name() const noexcept { return __name[0] == '*' ? __name + 1 : __name; }
    bool operator==(const type_info& other) const noexcept { return __id == other.__id; }
    bool operator!=(const type_info& other) const noexcept { return __id != other.__id; }
    bool before(const type_info& other) const noexcept { return __id < other.__id; }
    size_t hash_code() const noexcept { return (size_t)__id; }
};

// --- <limits>

enum float_round_style { round_indeterminate = -1, round_toward_zero = 0, round_to_nearest = 1,
                         round_toward_infinity = 2, round_toward_neg_infinity = 3 };
enum float_denorm_style { denorm_indeterminate = -1, denorm_absent = 0, denorm_present = 1 };
template <class T> struct numeric_limits {
    static constexpr bool is_specialized = false;
    static constexpr T min() noexcept { return T(); }
    static constexpr T max() noexcept { return T(); }
    static constexpr T lowest() noexcept { return T(); }
};
template <class T, T Min, T Max, int Digits, int Digits10, bool Signed> struct __integer_limits {
    static constexpr bool is_specialized = true;
    static constexpr bool is_signed = Signed;
    static constexpr bool is_integer = true;
    static constexpr bool is_exact = true;
    static constexpr bool has_infinity = false;
    static constexpr bool has_quiet_NaN = false;
    static constexpr bool has_signaling_NaN = false;
    static constexpr bool is_bounded = true;
    static constexpr bool is_modulo = !Signed;
    static constexpr bool is_iec559 = false;
    static constexpr int digits = Digits;
    static constexpr int digits10 = Digits10;
    static constexpr int max_digits10 = 0;
    static constexpr int radix = 2;
    static constexpr int min_exponent = 0;
    static constexpr int max_exponent = 0;
    static constexpr int min_exponent10 = 0;
    static constexpr int max_exponent10 = 0;
    static constexpr float_round_style round_style = round_toward_zero;
    static constexpr T min() noexcept { return Min; }
    static constexpr T max() noexcept { return Max; }
    static constexpr T lowest() noexcept { return Min; }
    static constexpr T epsilon() noexcept { return 0; }
    static constexpr T round_error() noexcept { return 0; }
    static constexpr T infinity() noexcept { return 0; }
    static constexpr T quiet_NaN() noexcept { return 0; }
    static constexpr T signaling_NaN() noexcept { return 0; }
    static constexpr T denorm_min() noexcept { return 0; }
};
template <> struct numeric_limits<bool> : __integer_limits<bool, false, true, 1, 0, false> {};
template <> struct numeric_limits<char> : __integer_limits<char, -128, 127, 7, 2, true> {};
template <> struct numeric_limits<signed char> : __integer_limits<signed char, -128, 127, 7, 2, true> {};
template <> struct numeric_limits<unsigned char> : __integer_limits<unsigned char, 0, 255, 8, 2, false> {};
template <> struct numeric_limits<wchar_t> : __integer_limits<wchar_t, -2147483647 - 1, 2147483647, 31, 9, true> {};
template <> struct numeric_limits<char16_t> : __integer_limits<char16_t, 0, 65535, 16, 4, false> {};
template <> struct numeric_limits<char32_t> : __integer_limits<char32_t, 0, 4294967295U, 32, 9, false> {};
template <> struct numeric_limits<short> : __integer_limits<short, -32768, 32767, 15, 4, true> {};
template <> struct numeric_limits<unsigned short> : __integer_limits<unsigned short, 0, 65535, 16, 4, false> {};
template <> struct numeric_limits<int> : __integer_limits<int, -2147483647 - 1, 2147483647, 31, 9, true> {};
template <> struct numeric_limits<unsigned int> : __integer_limits<unsigned int, 0, 4294967295U, 32, 9, false> {};
template <> struct numeric_limits<long>
    : __integer_limits<long, -9223372036854775807L - 1, 9223372036854775807L, 63, 18, true> {};
template <> struct numeric_limits<unsigned long>
    : __integer_limits<unsigned long, 0, 18446744073709551615UL, 64, 19, false> {};
template <> struct numeric_limits<long long>
    : __integer_limits<long long, -9223372036854775807LL - 1, 9223372036854775807LL, 63, 18, true> {};
template <> struct numeric_limits<unsigned long long>
    : __integer_limits<unsigned long long, 0, 18446744073709551615ULL, 64, 19, false> {};
template <> struct numeric_limits<float> {
    static constexpr bool is_specialized = true;
    static constexpr bool is_signed = true;
    static constexpr bool is_integer = false;
    static constexpr bool is_exact = false;
    static constexpr bool has_infinity = true;
    static constexpr bool has_quiet_NaN = true;
    static constexpr bool has_signaling_NaN = true;
    static constexpr bool is_bounded = true;
    static constexpr bool is_modulo = false;
    static constexpr bool is_iec559 = true;
    static constexpr int digits = 24;
    static constexpr int digits10 = 6;
    static constexpr int max_digits10 = 9;
    static constexpr int radix = 2;
    static constexpr int min_exponent = -125;
    static constexpr int max_exponent = 128;
    static constexpr int min_exponent10 = -37;
    static constexpr int max_exponent10 = 38;
    static constexpr float_round_style round_style = round_to_nearest;
    static constexpr float min() noexcept { return 1.17549435e-38F; }
    static constexpr float max() noexcept { return 3.40282347e+38F; }
    static constexpr float lowest() noexcept { return -3.40282347e+38F; }
    static constexpr float epsilon() noexcept { return 1.19209290e-7F; }
    static constexpr float round_error() noexcept { return 0.5F; }
    static constexpr float infinity() noexcept { return __builtin_inff(); }
    static constexpr float quiet_NaN() noexcept { return __builtin_nanf(""); }
    static constexpr float signaling_NaN() noexcept { return __builtin_nanf(""); }
    static constexpr float denorm_min() noexcept { return 1.40129846e-45F; }
};
template <> struct numeric_limits<double> {
    static constexpr bool is_specialized = true;
    static constexpr bool is_signed = true;
    static constexpr bool is_integer = false;
    static constexpr bool is_exact = false;
    static constexpr bool has_infinity = true;
    static constexpr bool has_quiet_NaN = true;
    static constexpr bool has_signaling_NaN = true;
    static constexpr bool is_bounded = true;
    static constexpr bool is_modulo = false;
    static constexpr bool is_iec559 = true;
    static constexpr int digits = 53;
    static constexpr int digits10 = 15;
    static constexpr int max_digits10 = 17;
    static constexpr int radix = 2;
    static constexpr int min_exponent = -1021;
    static constexpr int max_exponent = 1024;
    static constexpr int min_exponent10 = -307;
    static constexpr int max_exponent10 = 308;
    static constexpr float_round_style round_style = round_to_nearest;
    static constexpr double min() noexcept { return 2.2250738585072014e-308; }
    static constexpr double max() noexcept { return 1.7976931348623157e+308; }
    static constexpr double lowest() noexcept { return -1.7976931348623157e+308; }
    static constexpr double epsilon() noexcept { return 2.2204460492503131e-16; }
    static constexpr double round_error() noexcept { return 0.5; }
    static constexpr double infinity() noexcept { return __builtin_huge_val(); }
    static constexpr double quiet_NaN() noexcept { return __builtin_nanf(""); }
    static constexpr double signaling_NaN() noexcept { return __builtin_nanf(""); }
    static constexpr double denorm_min() noexcept { return 4.9406564584124654e-324; }
};
template <> struct numeric_limits<long double> : numeric_limits<double> {};
template <class T> struct numeric_limits<const T> : numeric_limits<T> {};

// --- <cmath>, <cstdlib>: the overloads of C++

using ::sin; using ::cos; using ::tan; using ::asin; using ::acos; using ::atan; using ::atan2; using ::sinh;
using ::cosh; using ::tanh; using ::asinh; using ::acosh; using ::atanh; using ::exp; using ::exp2; using ::expm1;
using ::log; using ::log2; using ::log10; using ::log1p; using ::sqrt; using ::cbrt; using ::hypot; using ::pow;
using ::floor; using ::ceil; using ::round; using ::trunc; using ::rint; using ::nearbyint; using ::fmod;
using ::remainder; using ::fmin; using ::fmax; using ::fdim; using ::copysign; using ::nextafter; using ::fabs;
using ::tgamma; using ::lgamma; using ::erf; using ::erfc; using ::fma; using ::ldexp; using ::frexp; using ::modf;
using ::nan; using ::lround; using ::llround; using ::lrint;
using ::sinf; using ::cosf; using ::tanf; using ::sqrtf; using ::fabsf; using ::floorf; using ::ceilf; using ::powf;
using ::expf; using ::logf; using ::roundf; using ::truncf;
inline float sin(float x) { return ::sinf(x); }
inline float cos(float x) { return ::cosf(x); }
inline float tan(float x) { return ::tanf(x); }
inline float asin(float x) { return ::asinf(x); }
inline float acos(float x) { return ::acosf(x); }
inline float atan(float x) { return ::atanf(x); }
inline float atan2(float y, float x) { return ::atan2f(y, x); }
inline float sinh(float x) { return ::sinhf(x); }
inline float cosh(float x) { return ::coshf(x); }
inline float tanh(float x) { return ::tanhf(x); }
inline float exp(float x) { return ::expf(x); }
inline float exp2(float x) { return ::exp2f(x); }
inline float log(float x) { return ::logf(x); }
inline float log2(float x) { return ::log2f(x); }
inline float log10(float x) { return ::log10f(x); }
inline float sqrt(float x) { return ::sqrtf(x); }
inline float cbrt(float x) { return ::cbrtf(x); }
inline float hypot(float x, float y) { return ::hypotf(x, y); }
inline float pow(float x, float y) { return ::powf(x, y); }
inline double pow(double x, int y) { return ::pow(x, (double)y); }
inline float floor(float x) { return ::floorf(x); }
inline float ceil(float x) { return ::ceilf(x); }
inline float round(float x) { return ::roundf(x); }
inline float trunc(float x) { return ::truncf(x); }
inline float fmod(float x, float y) { return ::fmodf(x, y); }
inline float fmin(float x, float y) { return ::fminf(x, y); }
inline float fmax(float x, float y) { return ::fmaxf(x, y); }
inline float fabs(float x) { return ::fabsf(x); }
inline float abs(float x) { return ::fabsf(x); }
inline double abs(double x) { return ::fabs(x); }
inline long double abs(long double x) { return ::fabs(x); }
inline int abs(int x) { return x < 0 ? -x : x; }
inline long abs(long x) { return x < 0 ? -x : x; }
inline long long abs(long long x) { return x < 0 ? -x : x; }
using ::labs; using ::llabs;
inline bool isnan(double x) { return __isnan(x) != 0; }
inline bool isinf(double x) { return __isinf(x) != 0; }
inline bool isfinite(double x) { return __isfinite(x) != 0; }
inline bool isnormal(double x) { return __isfinite(x) && x != 0; }
inline bool signbit(double x) { return __signbit(x) != 0; }
template <class T> inline double sqrt(T x) { return ::sqrt((double)x); }
template <class T> inline double floor(T x) { return ::floor((double)x); }
template <class T> inline double ceil(T x) { return ::ceil((double)x); }
template <class T> inline double log(T x) { return ::log((double)x); }
template <class T> inline double log2(T x) { return ::log2((double)x); }
template <class T> inline double log10(T x) { return ::log10((double)x); }
template <class T> inline double exp(T x) { return ::exp((double)x); }
template <class T> inline double sin(T x) { return ::sin((double)x); }
template <class T> inline double cos(T x) { return ::cos((double)x); }
template <class T> inline double cbrt(T x) { return ::cbrt((double)x); }
template <class T> inline double tan(T x) { return ::tan((double)x); }
template <class T> inline double asin(T x) { return ::asin((double)x); }
template <class T> inline double acos(T x) { return ::acos((double)x); }
template <class T> inline double atan(T x) { return ::atan((double)x); }
template <class T> inline double sinh(T x) { return ::sinh((double)x); }
template <class T> inline double cosh(T x) { return ::cosh((double)x); }
template <class T> inline double tanh(T x) { return ::tanh((double)x); }
template <class T> inline double exp2(T x) { return ::exp2((double)x); }
template <class T> inline double round(T x) { return ::round((double)x); }
template <class T> inline double trunc(T x) { return ::trunc((double)x); }
template <class T> inline double fabs(T x) { return ::fabs((double)x); }
template <class T, class U> inline double pow(T x, U y) { return ::pow((double)x, (double)y); }
template <class T, class U> inline double fmod(T x, U y) { return ::fmod((double)x, (double)y); }
template <class T, class U> inline double fmin(T x, U y) { return ::fmin((double)x, (double)y); }
template <class T, class U> inline double fmax(T x, U y) { return ::fmax((double)x, (double)y); }
template <class T, class U> inline double hypot(T x, U y) { return ::hypot((double)x, (double)y); }
template <class T, class U> inline double atan2(T x, U y) { return ::atan2((double)x, (double)y); }
template <class T> inline bool isnan(T x) { return false; }
template <class T> inline bool isinf(T x) { return false; }
template <class T> inline bool isfinite(T x) { return true; }
}

using std::abs;
using std::isnan;
using std::isinf;
using std::isfinite;
using std::isnormal;
using std::signbit;
`);
})(globalThis);
