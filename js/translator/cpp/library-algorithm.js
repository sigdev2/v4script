// C++ library: <functional> function objects, <algorithm>, <numeric>.
// sort, nth_element and the heap functions order equal elements as
// libstdc++ does (introsort; the samples compare the results with g++).
// The tables of declarations are written by tools/build-cpp-library.mjs.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    if (X.headers['v4script/function-objects'])
        return;

    X.addHeader('v4script/function-objects', [
        ['std', 3, 5, 'less'],
        ['std', 6, 8, 'greater'],
        ['std', 9, 11, 'less_equal'],
        ['std', 12, 14, 'greater_equal'],
        ['std', 15, 17, 'equal_to'],
        ['std', 18, 20, 'not_equal_to'],
        ['std', 21, 24, 'less'],
        ['std', 25, 28, 'greater'],
        ['std', 29, 34, 'equal_to'],
        ['std', 35, 37, 'plus'],
        ['std', 38, 40, 'minus'],
        ['std', 41, 43, 'multiplies'],
        ['std', 44, 46, 'divides'],
        ['std', 47, 49, 'modulus'],
        ['std', 50, 52, 'negate'],
        ['std', 53, 55, 'plus'],
        ['std', 56, 58, 'minus'],
        ['std', 59, 61, 'multiplies'],
        ['std', 62, 64, 'logical_and'],
        ['std', 65, 67, 'logical_or'],
        ['std', 68, 70, 'logical_not'],
        ['std', 71, 73, 'bit_and'],
        ['std', 74, 76, 'bit_or'],
        ['std', 77, 79, 'bit_xor'],
        ['std', 80, 82, 'bit_not'],
        ['std', 83, 88, 'unary_negate'],
        ['std', 89, 89, 'not1'],
        ['std', 90, 96, '__not_fn'],
        ['std', 97, 99, 'not_fn'],
        ['std', 102, 104, '__less_iterators'],
        ['std', 105, 107, '__equal_iterators']
    ], String.raw`
namespace std {
template <class T = void> struct less {
    constexpr bool operator()(const T& a, const T& b) const { return a < b; }
};
template <class T = void> struct greater {
    constexpr bool operator()(const T& a, const T& b) const { return b < a; }
};
template <class T = void> struct less_equal {
    constexpr bool operator()(const T& a, const T& b) const { return !(b < a); }
};
template <class T = void> struct greater_equal {
    constexpr bool operator()(const T& a, const T& b) const { return !(a < b); }
};
template <class T = void> struct equal_to {
    constexpr bool operator()(const T& a, const T& b) const { return a == b; }
};
template <class T = void> struct not_equal_to {
    constexpr bool operator()(const T& a, const T& b) const { return a != b; }
};
template <> struct less<void> {
    typedef int is_transparent;
    template <class T, class U> constexpr auto operator()(T&& a, U&& b) const -> decltype(a < b) { return a < b; }
};
template <> struct greater<void> {
    typedef int is_transparent;
    template <class T, class U> constexpr auto operator()(T&& a, U&& b) const -> decltype(b < a) { return b < a; }
};
template <> struct equal_to<void> {
    typedef int is_transparent;
    template <class T, class U> constexpr auto operator()(T&& a, U&& b) const -> decltype(a == b) {
        return a == b;
    }
};
template <class T = void> struct plus {
    constexpr T operator()(const T& a, const T& b) const { return a + b; }
};
template <class T = void> struct minus {
    constexpr T operator()(const T& a, const T& b) const { return a - b; }
};
template <class T = void> struct multiplies {
    constexpr T operator()(const T& a, const T& b) const { return a * b; }
};
template <class T = void> struct divides {
    constexpr T operator()(const T& a, const T& b) const { return a / b; }
};
template <class T = void> struct modulus {
    constexpr T operator()(const T& a, const T& b) const { return a % b; }
};
template <class T = void> struct negate {
    constexpr T operator()(const T& a) const { return -a; }
};
template <> struct plus<void> {
    template <class T, class U> constexpr auto operator()(T&& a, U&& b) const -> decltype(a + b) { return a + b; }
};
template <> struct minus<void> {
    template <class T, class U> constexpr auto operator()(T&& a, U&& b) const -> decltype(a - b) { return a - b; }
};
template <> struct multiplies<void> {
    template <class T, class U> constexpr auto operator()(T&& a, U&& b) const -> decltype(a * b) { return a * b; }
};
template <class T = void> struct logical_and {
    constexpr bool operator()(const T& a, const T& b) const { return a && b; }
};
template <class T = void> struct logical_or {
    constexpr bool operator()(const T& a, const T& b) const { return a || b; }
};
template <class T = void> struct logical_not {
    constexpr bool operator()(const T& a) const { return !a; }
};
template <class T = void> struct bit_and {
    constexpr T operator()(const T& a, const T& b) const { return a & b; }
};
template <class T = void> struct bit_or {
    constexpr T operator()(const T& a, const T& b) const { return a | b; }
};
template <class T = void> struct bit_xor {
    constexpr T operator()(const T& a, const T& b) const { return a ^ b; }
};
template <class T = void> struct bit_not {
    constexpr T operator()(const T& a) const { return ~a; }
};
template <class P> class unary_negate {
    P predicate;
public:
    explicit unary_negate(const P& p) : predicate(p) {}
    template <class T> bool operator()(const T& x) const { return !predicate(x); }
};
template <class P> unary_negate<P> not1(const P& p) { return unary_negate<P>(p); }
template <class F> class __not_fn {
    F function;
public:
    explicit __not_fn(F f) : function(std::move(f)) {}
    template <class... A> bool operator()(A&&... args) { return !function(std::forward<A>(args)...); }
    template <class... A> bool operator()(A&&... args) const { return !function(std::forward<A>(args)...); }
};
template <class F> __not_fn<typename decay<F>::type> not_fn(F&& f) {
    return __not_fn<typename decay<F>::type>(std::forward<F>(f));
}

// Comparisons of the algorithms without a comparator.
struct __less_iterators {
    template <class A, class B> bool operator()(const A& a, const B& b) const { return a < b; }
};
struct __equal_iterators {
    template <class A, class B> bool operator()(const A& a, const B& b) const { return a == b; }
};
}
`);

    X.addHeader('v4script/algorithm', [
        ['std', 5, 11, 'all_of'],
        ['std', 12, 18, 'any_of'],
        ['std', 19, 19, 'none_of'],
        ['std', 20, 24, 'for_each'],
        ['std', 25, 29, 'for_each_n'],
        ['std', 30, 36, 'find'],
        ['std', 37, 43, 'find_if'],
        ['std', 44, 50, 'find_if_not'],
        ['std', 51, 59, 'find_first_of'],
        ['std', 60, 62, 'find_first_of'],
        ['std', 63, 73, 'adjacent_find'],
        ['std', 74, 74, 'adjacent_find'],
        ['std', 75, 82, 'count'],
        ['std', 83, 90, 'count_if'],
        ['std', 91, 97, 'mismatch'],
        ['std', 98, 100, 'mismatch'],
        ['std', 101, 107, 'mismatch'],
        ['std', 108, 110, 'mismatch'],
        ['std', 111, 117, 'equal'],
        ['std', 118, 120, 'equal'],
        ['std', 121, 127, 'equal'],
        ['std', 128, 130, 'equal'],
        ['std', 131, 143, 'search'],
        ['std', 144, 146, 'search'],
        ['std', 147, 166, 'search_n'],
        ['std', 167, 169, 'search_n'],
        ['std', 170, 182, 'find_end'],
        ['std', 183, 185, 'find_end'],
        ['std', 189, 193, 'copy'],
        ['std', 194, 198, 'copy_n'],
        ['std', 199, 207, 'copy_if'],
        ['std', 208, 212, 'copy_backward'],
        ['std', 213, 217, 'move'],
        ['std', 218, 222, 'move_backward'],
        ['std', 223, 226, 'fill'],
        ['std', 227, 231, 'fill_n'],
        ['std', 232, 236, 'transform'],
        ['std', 237, 241, 'transform'],
        ['std', 242, 245, 'generate'],
        ['std', 246, 250, 'generate_n'],
        ['std', 251, 263, 'remove'],
        ['std', 264, 276, 'remove_if'],
        ['std', 277, 285, 'remove_copy'],
        ['std', 286, 294, 'remove_copy_if'],
        ['std', 295, 300, 'replace'],
        ['std', 301, 306, 'replace_if'],
        ['std', 307, 311, 'replace_copy'],
        ['std', 312, 316, 'replace_copy_if'],
        ['std', 317, 320, 'iter_swap'],
        ['std', 321, 325, 'swap_ranges'],
        ['std', 326, 333, '__reverse'],
        ['std', 334, 343, '__reverse'],
        ['std', 344, 346, 'reverse'],
        ['std', 347, 354, 'reverse_copy'],
        ['std', 355, 373, 'rotate'],
        ['std', 374, 376, 'rotate_copy'],
        ['std', 377, 388, 'unique'],
        ['std', 389, 389, 'unique'],
        ['std', 390, 404, 'unique_copy'],
        ['std', 405, 407, 'unique_copy'],
        ['std', 411, 414, 'is_partitioned'],
        ['std', 415, 426, '__partition'],
        ['std', 427, 447, '__partition'],
        ['std', 448, 450, 'partition'],
        ['std', 451, 476, 'stable_partition'],
        ['std', 477, 488, 'partition_copy'],
        ['std', 489, 504, 'partition_point'],
        ['std', 508, 523, 'lower_bound'],
        ['std', 524, 526, 'lower_bound'],
        ['std', 527, 542, 'upper_bound'],
        ['std', 543, 545, 'upper_bound'],
        ['std', 546, 548, 'equal_range'],
        ['std', 549, 551, 'equal_range'],
        ['std', 552, 555, 'binary_search'],
        ['std', 556, 558, 'binary_search'],
        ['std', 562, 570, '__push_heap'],
        ['std', 571, 587, '__adjust_heap'],
        ['std', 588, 593, '__pop_heap'],
        ['std', 594, 598, 'push_heap'],
        ['std', 599, 602, 'push_heap'],
        ['std', 603, 608, 'pop_heap'],
        ['std', 609, 612, 'pop_heap'],
        ['std', 613, 626, '__make_heap'],
        ['std', 627, 627, 'make_heap'],
        ['std', 628, 631, 'make_heap'],
        ['std', 632, 637, '__sort_heap'],
        ['std', 638, 638, 'sort_heap'],
        ['std', 639, 642, 'sort_heap'],
        ['std', 643, 653, 'is_heap_until'],
        ['std', 654, 654, 'is_heap_until'],
        ['std', 655, 657, 'is_heap'],
        ['std', 658, 658, 'is_heap'],
        ['std', 662, 669, '__log2'],
        ['std', 670, 680, '__unguarded_linear_insert'],
        ['std', 681, 693, '__insertion_sort'],
        ['std', 694, 697, '__unguarded_insertion_sort'],
        ['std', 698, 705, '__final_insertion_sort'],
        ['std', 706, 721, '__move_median_to_first'],
        ['std', 722, 734, '__unguarded_partition'],
        ['std', 735, 739, '__unguarded_partition_pivot'],
        ['std', 740, 746, '__heap_select'],
        ['std', 747, 759, '__introsort_loop'],
        ['std', 760, 765, 'sort'],
        ['std', 766, 769, 'sort'],
        ['std', 770, 773, 'partial_sort'],
        ['std', 774, 777, 'partial_sort'],
        ['std', 778, 790, 'partial_sort_copy'],
        ['std', 791, 793, 'partial_sort_copy'],
        ['std', 794, 809, '__introselect'],
        ['std', 810, 814, 'nth_element'],
        ['std', 815, 818, 'nth_element'],
        ['std', 819, 828, 'is_sorted_until'],
        ['std', 829, 829, 'is_sorted_until'],
        ['std', 830, 832, 'is_sorted'],
        ['std', 833, 833, 'is_sorted'],
        ['std', 837, 849, 'merge'],
        ['std', 850, 852, 'merge'],
        ['std', 853, 884, '__merge_sort'],
        ['std', 885, 894, 'stable_sort'],
        ['std', 895, 898, 'stable_sort'],
        ['std', 899, 926, 'inplace_merge'],
        ['std', 927, 929, 'inplace_merge'],
        ['std', 930, 938, 'includes'],
        ['std', 939, 941, 'includes'],
        ['std', 942, 957, 'set_union'],
        ['std', 958, 960, 'set_union'],
        ['std', 961, 976, 'set_intersection'],
        ['std', 977, 979, 'set_intersection'],
        ['std', 980, 996, 'set_difference'],
        ['std', 997, 999, 'set_difference'],
        ['std', 1000, 1020, 'set_symmetric_difference'],
        ['std', 1021, 1023, 'set_symmetric_difference'],
        ['std', 1027, 1027, 'min'],
        ['std', 1028, 1028, 'min'],
        ['std', 1029, 1029, 'max'],
        ['std', 1030, 1030, 'max'],
        ['std', 1031, 1033, 'minmax'],
        ['std', 1034, 1036, 'minmax'],
        ['std', 1037, 1046, 'min_element'],
        ['std', 1047, 1047, 'min_element'],
        ['std', 1048, 1057, 'max_element'],
        ['std', 1058, 1058, 'max_element'],
        ['std', 1059, 1085, 'minmax_element'],
        ['std', 1086, 1088, 'minmax_element'],
        ['std', 1089, 1089, 'min'],
        ['std', 1090, 1092, 'min'],
        ['std', 1093, 1093, 'max'],
        ['std', 1094, 1096, 'max'],
        ['std', 1097, 1100, 'minmax'],
        ['std', 1101, 1103, 'clamp'],
        ['std', 1104, 1106, 'clamp'],
        ['std', 1107, 1115, 'lexicographical_compare'],
        ['std', 1116, 1118, 'lexicographical_compare'],
        ['std', 1122, 1143, 'next_permutation'],
        ['std', 1144, 1146, 'next_permutation'],
        ['std', 1147, 1168, 'prev_permutation'],
        ['std', 1169, 1171, 'prev_permutation'],
        ['std', 1172, 1205, 'is_permutation'],
        ['std', 1206, 1208, 'is_permutation']
    ], String.raw`
namespace std {
// --- Non-modifying

template <class I, class P> bool all_of(I first, I last, P p) {
    for (; first != last; ++first) {
        if (!p(*first))
            return false;
    }
    return true;
}
template <class I, class P> bool any_of(I first, I last, P p) {
    for (; first != last; ++first) {
        if (p(*first))
            return true;
    }
    return false;
}
template <class I, class P> bool none_of(I first, I last, P p) { return !std::any_of(first, last, p); }
template <class I, class F> F for_each(I first, I last, F f) {
    for (; first != last; ++first)
        f(*first);
    return f;
}
template <class I, class N, class F> I for_each_n(I first, N n, F f) {
    for (; n > 0; --n, ++first)
        f(*first);
    return first;
}
template <class I, class T> I find(I first, I last, const T& value) {
    for (; first != last; ++first) {
        if (*first == value)
            return first;
    }
    return last;
}
template <class I, class P> I find_if(I first, I last, P p) {
    for (; first != last; ++first) {
        if (p(*first))
            return first;
    }
    return last;
}
template <class I, class P> I find_if_not(I first, I last, P p) {
    for (; first != last; ++first) {
        if (!p(*first))
            return first;
    }
    return last;
}
template <class I, class F, class P> I find_first_of(I first, I last, F sfirst, F slast, P p) {
    for (; first != last; ++first) {
        for (F it = sfirst; it != slast; ++it) {
            if (p(*first, *it))
                return first;
        }
    }
    return last;
}
template <class I, class F> I find_first_of(I first, I last, F sfirst, F slast) {
    return std::find_first_of(first, last, sfirst, slast, __equal_iterators());
}
template <class I, class P> I adjacent_find(I first, I last, P p) {
    if (first == last)
        return last;
    I next = first;
    while (++next != last) {
        if (p(*first, *next))
            return first;
        first = next;
    }
    return last;
}
template <class I> I adjacent_find(I first, I last) { return std::adjacent_find(first, last, __equal_iterators()); }
template <class I, class T> typename iterator_traits<I>::difference_type count(I first, I last, const T& value) {
    typename iterator_traits<I>::difference_type n = 0;
    for (; first != last; ++first) {
        if (*first == value)
            ++n;
    }
    return n;
}
template <class I, class P> typename iterator_traits<I>::difference_type count_if(I first, I last, P p) {
    typename iterator_traits<I>::difference_type n = 0;
    for (; first != last; ++first) {
        if (p(*first))
            ++n;
    }
    return n;
}
template <class I1, class I2, class P> pair<I1, I2> mismatch(I1 first1, I1 last1, I2 first2, P p) {
    while (first1 != last1 && p(*first1, *first2)) {
        ++first1;
        ++first2;
    }
    return pair<I1, I2>(first1, first2);
}
template <class I1, class I2> pair<I1, I2> mismatch(I1 first1, I1 last1, I2 first2) {
    return std::mismatch(first1, last1, first2, __equal_iterators());
}
template <class I1, class I2, class P> pair<I1, I2> mismatch(I1 first1, I1 last1, I2 first2, I2 last2, P p) {
    while (first1 != last1 && first2 != last2 && p(*first1, *first2)) {
        ++first1;
        ++first2;
    }
    return pair<I1, I2>(first1, first2);
}
template <class I1, class I2> pair<I1, I2> mismatch(I1 first1, I1 last1, I2 first2, I2 last2) {
    return std::mismatch(first1, last1, first2, last2, __equal_iterators());
}
template <class I1, class I2, class P> bool equal(I1 first1, I1 last1, I2 first2, P p) {
    for (; first1 != last1; ++first1, ++first2) {
        if (!p(*first1, *first2))
            return false;
    }
    return true;
}
template <class I1, class I2> bool equal(I1 first1, I1 last1, I2 first2) {
    return std::equal(first1, last1, first2, __equal_iterators());
}
template <class I1, class I2, class P> bool equal(I1 first1, I1 last1, I2 first2, I2 last2, P p) {
    for (; first1 != last1 && first2 != last2; ++first1, ++first2) {
        if (!p(*first1, *first2))
            return false;
    }
    return first1 == last1 && first2 == last2;
}
template <class I1, class I2> bool equal(I1 first1, I1 last1, I2 first2, I2 last2) {
    return std::equal(first1, last1, first2, last2, __equal_iterators());
}
template <class I1, class I2, class P> I1 search(I1 first, I1 last, I2 sfirst, I2 slast, P p) {
    for (;; ++first) {
        I1 it = first;
        for (I2 sit = sfirst;; ++it, ++sit) {
            if (sit == slast)
                return first;
            if (it == last)
                return last;
            if (!p(*it, *sit))
                break;
        }
    }
}
template <class I1, class I2> I1 search(I1 first, I1 last, I2 sfirst, I2 slast) {
    return std::search(first, last, sfirst, slast, __equal_iterators());
}
template <class I, class N, class T, class P> I search_n(I first, I last, N count, const T& value, P p) {
    if (count <= 0)
        return first;
    for (; first != last; ++first) {
        if (!p(*first, value))
            continue;
        I start = first;
        N n = 1;
        for (;;) {
            if (n == count)
                return start;
            if (++first == last)
                return last;
            if (!p(*first, value))
                break;
            ++n;
        }
    }
    return last;
}
template <class I, class N, class T> I search_n(I first, I last, N count, const T& value) {
    return std::search_n(first, last, count, value, __equal_iterators());
}
template <class I1, class I2, class P> I1 find_end(I1 first, I1 last, I2 sfirst, I2 slast, P p) {
    if (sfirst == slast)
        return last;
    I1 result = last;
    for (;;) {
        I1 found = std::search(first, last, sfirst, slast, p);
        if (found == last)
            return result;
        result = found;
        first = found;
        ++first;
    }
}
template <class I1, class I2> I1 find_end(I1 first, I1 last, I2 sfirst, I2 slast) {
    return std::find_end(first, last, sfirst, slast, __equal_iterators());
}

// --- Modifying

template <class I, class O> O copy(I first, I last, O out) {
    for (; first != last; ++first, ++out)
        *out = *first;
    return out;
}
template <class I, class N, class O> O copy_n(I first, N n, O out) {
    for (; n > 0; --n, ++first, ++out)
        *out = *first;
    return out;
}
template <class I, class O, class P> O copy_if(I first, I last, O out, P p) {
    for (; first != last; ++first) {
        if (p(*first)) {
            *out = *first;
            ++out;
        }
    }
    return out;
}
template <class I, class O> O copy_backward(I first, I last, O out) {
    while (first != last)
        *--out = *--last;
    return out;
}
template <class I, class O> O move(I first, I last, O out) {
    for (; first != last; ++first, ++out)
        *out = std::move(*first);
    return out;
}
template <class I, class O> O move_backward(I first, I last, O out) {
    while (first != last)
        *--out = std::move(*--last);
    return out;
}
template <class I, class T> void fill(I first, I last, const T& value) {
    for (; first != last; ++first)
        *first = value;
}
template <class O, class N, class T> O fill_n(O out, N n, const T& value) {
    for (; n > 0; --n, ++out)
        *out = value;
    return out;
}
template <class I, class O, class F> O transform(I first, I last, O out, F f) {
    for (; first != last; ++first, ++out)
        *out = f(*first);
    return out;
}
template <class I1, class I2, class O, class F> O transform(I1 first1, I1 last1, I2 first2, O out, F f) {
    for (; first1 != last1; ++first1, ++first2, ++out)
        *out = f(*first1, *first2);
    return out;
}
template <class I, class G> void generate(I first, I last, G g) {
    for (; first != last; ++first)
        *first = g();
}
template <class O, class N, class G> O generate_n(O out, N n, G g) {
    for (; n > 0; --n, ++out)
        *out = g();
    return out;
}
template <class I, class T> I remove(I first, I last, const T& value) {
    first = std::find(first, last, value);
    if (first == last)
        return first;
    I result = first;
    for (++first; first != last; ++first) {
        if (!(*first == value)) {
            *result = std::move(*first);
            ++result;
        }
    }
    return result;
}
template <class I, class P> I remove_if(I first, I last, P p) {
    first = std::find_if(first, last, p);
    if (first == last)
        return first;
    I result = first;
    for (++first; first != last; ++first) {
        if (!p(*first)) {
            *result = std::move(*first);
            ++result;
        }
    }
    return result;
}
template <class I, class O, class T> O remove_copy(I first, I last, O out, const T& value) {
    for (; first != last; ++first) {
        if (!(*first == value)) {
            *out = *first;
            ++out;
        }
    }
    return out;
}
template <class I, class O, class P> O remove_copy_if(I first, I last, O out, P p) {
    for (; first != last; ++first) {
        if (!p(*first)) {
            *out = *first;
            ++out;
        }
    }
    return out;
}
template <class I, class T> void replace(I first, I last, const T& old_value, const T& new_value) {
    for (; first != last; ++first) {
        if (*first == old_value)
            *first = new_value;
    }
}
template <class I, class P, class T> void replace_if(I first, I last, P p, const T& new_value) {
    for (; first != last; ++first) {
        if (p(*first))
            *first = new_value;
    }
}
template <class I, class O, class T> O replace_copy(I first, I last, O out, const T& old_value, const T& new_value) {
    for (; first != last; ++first, ++out)
        *out = *first == old_value ? new_value : *first;
    return out;
}
template <class I, class O, class P, class T> O replace_copy_if(I first, I last, O out, P p, const T& new_value) {
    for (; first != last; ++first, ++out)
        *out = p(*first) ? new_value : *first;
    return out;
}
template <class A, class B> void iter_swap(A a, B b) {
    using std::swap;
    swap(*a, *b);
}
template <class I1, class I2> I2 swap_ranges(I1 first1, I1 last1, I2 first2) {
    for (; first1 != last1; ++first1, ++first2)
        std::iter_swap(first1, first2);
    return first2;
}
template <class I> void __reverse(I first, I last, bidirectional_iterator_tag) {
    for (;;) {
        if (first == last || first == --last)
            return;
        std::iter_swap(first, last);
        ++first;
    }
}
template <class I> void __reverse(I first, I last, random_access_iterator_tag) {
    if (first == last)
        return;
    --last;
    while (first < last) {
        std::iter_swap(first, last);
        ++first;
        --last;
    }
}
template <class I> void reverse(I first, I last) {
    std::__reverse(first, last, typename iterator_traits<I>::iterator_category());
}
template <class I, class O> O reverse_copy(I first, I last, O out) {
    while (first != last) {
        --last;
        *out = *last;
        ++out;
    }
    return out;
}
template <class I> I rotate(I first, I middle, I last) {
    if (first == middle)
        return last;
    if (middle == last)
        return first;
    I result = first;
    std::advance(result, std::distance(middle, last));
    I next = middle;
    while (first != next) {
        std::iter_swap(first, next);
        ++first;
        ++next;
        if (next == last)
            next = middle;
        else if (first == middle)
            middle = next;
    }
    return result;
}
template <class I, class O> O rotate_copy(I first, I middle, I last, O out) {
    return std::copy(first, middle, std::copy(middle, last, out));
}
template <class I, class P> I unique(I first, I last, P p) {
    first = std::adjacent_find(first, last, p);
    if (first == last)
        return last;
    I dest = first;
    ++first;
    while (++first != last) {
        if (!p(*dest, *first))
            *++dest = std::move(*first);
    }
    return ++dest;
}
template <class I> I unique(I first, I last) { return std::unique(first, last, __equal_iterators()); }
template <class I, class O, class P> O unique_copy(I first, I last, O out, P p) {
    if (first == last)
        return out;
    typename iterator_traits<I>::value_type value = *first;
    *out = value;
    ++out;
    while (++first != last) {
        if (!p(value, *first)) {
            value = *first;
            *out = value;
            ++out;
        }
    }
    return out;
}
template <class I, class O> O unique_copy(I first, I last, O out) {
    return std::unique_copy(first, last, out, __equal_iterators());
}

// --- Partitions

template <class I, class P> bool is_partitioned(I first, I last, P p) {
    first = std::find_if_not(first, last, p);
    return std::none_of(first, last, p);
}
template <class I, class P> I __partition(I first, I last, P p, forward_iterator_tag) {
    first = std::find_if_not(first, last, p);
    if (first == last)
        return first;
    for (I next = first; ++next != last;) {
        if (p(*next)) {
            std::iter_swap(first, next);
            ++first;
        }
    }
    return first;
}
template <class I, class P> I __partition(I first, I last, P p, bidirectional_iterator_tag) {
    for (;;) {
        for (;;) {
            if (first == last)
                return first;
            if (!p(*first))
                break;
            ++first;
        }
        --last;
        for (;;) {
            if (first == last)
                return first;
            if (p(*last))
                break;
            --last;
        }
        std::iter_swap(first, last);
        ++first;
    }
}
template <class I, class P> I partition(I first, I last, P p) {
    return std::__partition(first, last, p, typename iterator_traits<I>::iterator_category());
}
template <class I, class P> I stable_partition(I first, I last, P p) {
    typedef typename iterator_traits<I>::value_type V;
    typename iterator_traits<I>::difference_type n = std::distance(first, last);
    if (n == 0)
        return first;
    V* rejected = static_cast<V*>(__allocate(sizeof(V) * n));
    V* rejected_end = rejected;
    I out = first;
    for (I it = first; it != last; ++it) {
        if (p(*it)) {
            *out = std::move(*it);
            ++out;
        } else {
            ::new (rejected_end) V(std::move(*it));
            ++rejected_end;
        }
    }
    I result = out;
    for (V* it = rejected; it != rejected_end; ++it) {
        *out = std::move(*it);
        ++out;
        it->~V();
    }
    __deallocate(rejected);
    return result;
}
template <class I, class O1, class O2, class P> pair<O1, O2> partition_copy(I first, I last, O1 yes, O2 no, P p) {
    for (; first != last; ++first) {
        if (p(*first)) {
            *yes = *first;
            ++yes;
        } else {
            *no = *first;
            ++no;
        }
    }
    return pair<O1, O2>(yes, no);
}
template <class I, class P> I partition_point(I first, I last, P p) {
    typename iterator_traits<I>::difference_type n = std::distance(first, last);
    while (n > 0) {
        typename iterator_traits<I>::difference_type half = n / 2;
        I middle = first;
        std::advance(middle, half);
        if (p(*middle)) {
            first = middle;
            ++first;
            n -= half + 1;
        } else {
            n = half;
        }
    }
    return first;
}

// --- Binary search

template <class I, class T, class C> I lower_bound(I first, I last, const T& value, C comp) {
    typename iterator_traits<I>::difference_type n = std::distance(first, last);
    while (n > 0) {
        typename iterator_traits<I>::difference_type half = n >> 1;
        I middle = first;
        std::advance(middle, half);
        if (comp(*middle, value)) {
            first = middle;
            ++first;
            n = n - half - 1;
        } else {
            n = half;
        }
    }
    return first;
}
template <class I, class T> I lower_bound(I first, I last, const T& value) {
    return std::lower_bound(first, last, value, __less_iterators());
}
template <class I, class T, class C> I upper_bound(I first, I last, const T& value, C comp) {
    typename iterator_traits<I>::difference_type n = std::distance(first, last);
    while (n > 0) {
        typename iterator_traits<I>::difference_type half = n >> 1;
        I middle = first;
        std::advance(middle, half);
        if (comp(value, *middle)) {
            n = half;
        } else {
            first = middle;
            ++first;
            n = n - half - 1;
        }
    }
    return first;
}
template <class I, class T> I upper_bound(I first, I last, const T& value) {
    return std::upper_bound(first, last, value, __less_iterators());
}
template <class I, class T, class C> pair<I, I> equal_range(I first, I last, const T& value, C comp) {
    return pair<I, I>(std::lower_bound(first, last, value, comp), std::upper_bound(first, last, value, comp));
}
template <class I, class T> pair<I, I> equal_range(I first, I last, const T& value) {
    return std::equal_range(first, last, value, __less_iterators());
}
template <class I, class T, class C> bool binary_search(I first, I last, const T& value, C comp) {
    I it = std::lower_bound(first, last, value, comp);
    return it != last && !comp(value, *it);
}
template <class I, class T> bool binary_search(I first, I last, const T& value) {
    return std::binary_search(first, last, value, __less_iterators());
}

// --- Heaps (the sift of the classic STL; priority_queue depends on it)

template <class I, class D, class T, class C> void __push_heap(I first, D hole, D top, T value, C& comp) {
    D parent = (hole - 1) / 2;
    while (hole > top && comp(*(first + parent), value)) {
        *(first + hole) = std::move(*(first + parent));
        hole = parent;
        parent = (hole - 1) / 2;
    }
    *(first + hole) = std::move(value);
}
template <class I, class D, class T, class C> void __adjust_heap(I first, D hole, D length, T value, C& comp) {
    D top = hole;
    D child = hole;
    while (child < (length - 1) / 2) {
        child = 2 * (child + 1);
        if (comp(*(first + child), *(first + (child - 1))))
            --child;
        *(first + hole) = std::move(*(first + child));
        hole = child;
    }
    if ((length & 1) == 0 && child == (length - 2) / 2) {
        child = 2 * (child + 1);
        *(first + hole) = std::move(*(first + (child - 1)));
        hole = child - 1;
    }
    std::__push_heap(first, hole, top, std::move(value), comp);
}
template <class I, class C> void __pop_heap(I first, I last, I result, C& comp) {
    typedef typename iterator_traits<I>::difference_type D;
    typename iterator_traits<I>::value_type value = std::move(*result);
    *result = std::move(*first);
    std::__adjust_heap(first, D(0), D(last - first), std::move(value), comp);
}
template <class I, class C> void push_heap(I first, I last, C comp) {
    typedef typename iterator_traits<I>::difference_type D;
    typename iterator_traits<I>::value_type value = std::move(*(last - 1));
    std::__push_heap(first, D((last - first) - 1), D(0), std::move(value), comp);
}
template <class I> void push_heap(I first, I last) {
    __less_iterators comp;
    std::push_heap(first, last, comp);
}
template <class I, class C> void pop_heap(I first, I last, C comp) {
    if (last - first > 1) {
        --last;
        std::__pop_heap(first, last, last, comp);
    }
}
template <class I> void pop_heap(I first, I last) {
    __less_iterators comp;
    std::pop_heap(first, last, comp);
}
template <class I, class C> void __make_heap(I first, I last, C& comp) {
    typedef typename iterator_traits<I>::difference_type D;
    D length = last - first;
    if (length < 2)
        return;
    D parent = (length - 2) / 2;
    for (;;) {
        typename iterator_traits<I>::value_type value = std::move(*(first + parent));
        std::__adjust_heap(first, parent, length, std::move(value), comp);
        if (parent == 0)
            return;
        --parent;
    }
}
template <class I, class C> void make_heap(I first, I last, C comp) { std::__make_heap(first, last, comp); }
template <class I> void make_heap(I first, I last) {
    __less_iterators comp;
    std::__make_heap(first, last, comp);
}
template <class I, class C> void __sort_heap(I first, I last, C& comp) {
    while (last - first > 1) {
        --last;
        std::__pop_heap(first, last, last, comp);
    }
}
template <class I, class C> void sort_heap(I first, I last, C comp) { std::__sort_heap(first, last, comp); }
template <class I> void sort_heap(I first, I last) {
    __less_iterators comp;
    std::__sort_heap(first, last, comp);
}
template <class I, class C> I is_heap_until(I first, I last, C comp) {
    typename iterator_traits<I>::difference_type n = last - first;
    typename iterator_traits<I>::difference_type parent = 0;
    for (typename iterator_traits<I>::difference_type child = 1; child < n; ++child) {
        if (comp(*(first + parent), *(first + child)))
            return first + child;
        if ((child & 1) == 0)
            ++parent;
    }
    return last;
}
template <class I> I is_heap_until(I first, I last) { return std::is_heap_until(first, last, __less_iterators()); }
template <class I, class C> bool is_heap(I first, I last, C comp) {
    return std::is_heap_until(first, last, comp) == last;
}
template <class I> bool is_heap(I first, I last) { return std::is_heap_until(first, last) == last; }

// --- Sorting: introsort as in the classic STL

inline long __log2(long n) {
    long result = 0;
    while (n > 1) {
        n >>= 1;
        ++result;
    }
    return result;
}
template <class I, class C> void __unguarded_linear_insert(I last, C& comp) {
    typename iterator_traits<I>::value_type value = std::move(*last);
    I next = last;
    --next;
    while (comp(value, *next)) {
        *last = std::move(*next);
        last = next;
        --next;
    }
    *last = std::move(value);
}
template <class I, class C> void __insertion_sort(I first, I last, C& comp) {
    if (first == last)
        return;
    for (I it = first + 1; it != last; ++it) {
        if (comp(*it, *first)) {
            typename iterator_traits<I>::value_type value = std::move(*it);
            std::move_backward(first, it, it + 1);
            *first = std::move(value);
        } else {
            std::__unguarded_linear_insert(it, comp);
        }
    }
}
template <class I, class C> void __unguarded_insertion_sort(I first, I last, C& comp) {
    for (I it = first; it != last; ++it)
        std::__unguarded_linear_insert(it, comp);
}
template <class I, class C> void __final_insertion_sort(I first, I last, C& comp) {
    if (last - first > 16) {
        std::__insertion_sort(first, first + 16, comp);
        std::__unguarded_insertion_sort(first + 16, last, comp);
    } else {
        std::__insertion_sort(first, last, comp);
    }
}
template <class I, class C> void __move_median_to_first(I result, I a, I b, I c, C& comp) {
    if (comp(*a, *b)) {
        if (comp(*b, *c))
            std::iter_swap(result, b);
        else if (comp(*a, *c))
            std::iter_swap(result, c);
        else
            std::iter_swap(result, a);
    } else if (comp(*a, *c)) {
        std::iter_swap(result, a);
    } else if (comp(*b, *c)) {
        std::iter_swap(result, c);
    } else {
        std::iter_swap(result, b);
    }
}
template <class I, class C> I __unguarded_partition(I first, I last, I pivot, C& comp) {
    for (;;) {
        while (comp(*first, *pivot))
            ++first;
        --last;
        while (comp(*pivot, *last))
            --last;
        if (!(first < last))
            return first;
        std::iter_swap(first, last);
        ++first;
    }
}
template <class I, class C> I __unguarded_partition_pivot(I first, I last, C& comp) {
    I middle = first + (last - first) / 2;
    std::__move_median_to_first(first, first + 1, middle, last - 1, comp);
    return std::__unguarded_partition(first + 1, last, first, comp);
}
template <class I, class C> void __heap_select(I first, I middle, I last, C& comp) {
    std::__make_heap(first, middle, comp);
    for (I it = middle; it < last; ++it) {
        if (comp(*it, *first))
            std::__pop_heap(first, middle, it, comp);
    }
}
template <class I, class C> void __introsort_loop(I first, I last, long depth, C& comp) {
    while (last - first > 16) {
        if (depth == 0) {
            std::__heap_select(first, last, last, comp);
            std::__sort_heap(first, last, comp);
            return;
        }
        --depth;
        I cut = std::__unguarded_partition_pivot(first, last, comp);
        std::__introsort_loop(cut, last, depth, comp);
        last = cut;
    }
}
template <class I, class C> void sort(I first, I last, C comp) {
    if (first == last)
        return;
    std::__introsort_loop(first, last, std::__log2(last - first) * 2, comp);
    std::__final_insertion_sort(first, last, comp);
}
template <class I> void sort(I first, I last) {
    __less_iterators comp;
    std::sort(first, last, comp);
}
template <class I, class C> void partial_sort(I first, I middle, I last, C comp) {
    std::__heap_select(first, middle, last, comp);
    std::__sort_heap(first, middle, comp);
}
template <class I> void partial_sort(I first, I middle, I last) {
    __less_iterators comp;
    std::partial_sort(first, middle, last, comp);
}
template <class I, class O, class C> O partial_sort_copy(I first, I last, O rfirst, O rlast, C comp) {
    O rit = rfirst;
    for (; first != last && rit != rlast; ++first, ++rit)
        *rit = *first;
    std::__make_heap(rfirst, rit, comp);
    typedef typename iterator_traits<O>::difference_type D;
    for (; first != last; ++first) {
        if (comp(*first, *rfirst))
            std::__adjust_heap(rfirst, D(0), D(rit - rfirst), typename iterator_traits<O>::value_type(*first), comp);
    }
    std::__sort_heap(rfirst, rit, comp);
    return rit;
}
template <class I, class O> O partial_sort_copy(I first, I last, O rfirst, O rlast) {
    return std::partial_sort_copy(first, last, rfirst, rlast, __less_iterators());
}
template <class I, class C> void __introselect(I first, I nth, I last, long depth, C& comp) {
    while (last - first > 3) {
        if (depth == 0) {
            std::__heap_select(first, nth + 1, last, comp);
            std::iter_swap(first, nth);
            return;
        }
        --depth;
        I cut = std::__unguarded_partition_pivot(first, last, comp);
        if (cut <= nth)
            first = cut;
        else
            last = cut;
    }
    std::__insertion_sort(first, last, comp);
}
template <class I, class C> void nth_element(I first, I nth, I last, C comp) {
    if (first == last || nth == last)
        return;
    std::__introselect(first, nth, last, std::__log2(last - first) * 2, comp);
}
template <class I> void nth_element(I first, I nth, I last) {
    __less_iterators comp;
    std::nth_element(first, nth, last, comp);
}
template <class I, class C> I is_sorted_until(I first, I last, C comp) {
    if (first == last)
        return last;
    I next = first;
    for (++next; next != last; first = next, ++next) {
        if (comp(*next, *first))
            return next;
    }
    return next;
}
template <class I> I is_sorted_until(I first, I last) { return std::is_sorted_until(first, last, __less_iterators()); }
template <class I, class C> bool is_sorted(I first, I last, C comp) {
    return std::is_sorted_until(first, last, comp) == last;
}
template <class I> bool is_sorted(I first, I last) { return std::is_sorted_until(first, last) == last; }

// --- Merging (stable_sort is a merge sort: stable results are unique)

template <class I1, class I2, class O, class C> O merge(I1 first1, I1 last1, I2 first2, I2 last2, O out, C comp) {
    while (first1 != last1 && first2 != last2) {
        if (comp(*first2, *first1)) {
            *out = *first2;
            ++first2;
        } else {
            *out = *first1;
            ++first1;
        }
        ++out;
    }
    return std::copy(first2, last2, std::copy(first1, last1, out));
}
template <class I1, class I2, class O> O merge(I1 first1, I1 last1, I2 first2, I2 last2, O out) {
    return std::merge(first1, last1, first2, last2, out, __less_iterators());
}
template <class I, class V, class C> void __merge_sort(I first, I last, V* buffer, C& comp) {
    typename iterator_traits<I>::difference_type n = last - first;
    if (n <= 16) {
        std::__insertion_sort(first, last, comp);
        return;
    }
    I middle = first + n / 2;
    std::__merge_sort(first, middle, buffer, comp);
    std::__merge_sort(middle, last, buffer, comp);
    if (!comp(*middle, *(middle - 1)))
        return;
    V* buffer_end = buffer;
    for (I it = first; it != middle; ++it, ++buffer_end)
        ::new (buffer_end) V(std::move(*it));
    V* left = buffer;
    I right = middle;
    I out = first;
    while (left != buffer_end && right != last) {
        if (comp(*right, *left)) {
            *out = std::move(*right);
            ++right;
        } else {
            *out = std::move(*left);
            ++left;
        }
        ++out;
    }
    for (; left != buffer_end; ++left, ++out)
        *out = std::move(*left);
    for (V* it = buffer; it != buffer_end; ++it)
        it->~V();
}
template <class I, class C> void stable_sort(I first, I last, C comp) {
    typedef typename iterator_traits<I>::value_type V;
    typename iterator_traits<I>::difference_type n = last - first;
    if (n < 2)
        return;
    long half = (n + 1) / 2;
    V* buffer = static_cast<V*>(__allocate(sizeof(V) * half));
    std::__merge_sort(first, last, buffer, comp);
    __deallocate(buffer);
}
template <class I> void stable_sort(I first, I last) {
    __less_iterators comp;
    std::stable_sort(first, last, comp);
}
template <class I, class C> void inplace_merge(I first, I middle, I last, C comp) {
    typedef typename iterator_traits<I>::value_type V;
    typename iterator_traits<I>::difference_type n = std::distance(first, middle);
    if (n == 0 || middle == last)
        return;
    V* buffer = static_cast<V*>(__allocate(sizeof(V) * n));
    V* buffer_end = buffer;
    for (I it = first; it != middle; ++it, ++buffer_end)
        ::new (buffer_end) V(std::move(*it));
    V* left = buffer;
    I right = middle;
    I out = first;
    while (left != buffer_end && right != last) {
        if (comp(*right, *left)) {
            *out = std::move(*right);
            ++right;
        } else {
            *out = std::move(*left);
            ++left;
        }
        ++out;
    }
    for (; left != buffer_end; ++left, ++out)
        *out = std::move(*left);
    for (V* it = buffer; it != buffer_end; ++it)
        it->~V();
    __deallocate(buffer);
}
template <class I> void inplace_merge(I first, I middle, I last) {
    std::inplace_merge(first, middle, last, __less_iterators());
}
template <class I1, class I2, class C> bool includes(I1 first1, I1 last1, I2 first2, I2 last2, C comp) {
    for (; first2 != last2; ++first1) {
        if (first1 == last1 || comp(*first2, *first1))
            return false;
        if (!comp(*first1, *first2))
            ++first2;
    }
    return true;
}
template <class I1, class I2> bool includes(I1 first1, I1 last1, I2 first2, I2 last2) {
    return std::includes(first1, last1, first2, last2, __less_iterators());
}
template <class I1, class I2, class O, class C> O set_union(I1 first1, I1 last1, I2 first2, I2 last2, O out, C comp) {
    for (; first1 != last1; ++out) {
        if (first2 == last2)
            return std::copy(first1, last1, out);
        if (comp(*first2, *first1)) {
            *out = *first2;
            ++first2;
        } else {
            *out = *first1;
            if (!comp(*first1, *first2))
                ++first2;
            ++first1;
        }
    }
    return std::copy(first2, last2, out);
}
template <class I1, class I2, class O> O set_union(I1 first1, I1 last1, I2 first2, I2 last2, O out) {
    return std::set_union(first1, last1, first2, last2, out, __less_iterators());
}
template <class I1, class I2, class O, class C>
O set_intersection(I1 first1, I1 last1, I2 first2, I2 last2, O out, C comp) {
    while (first1 != last1 && first2 != last2) {
        if (comp(*first1, *first2)) {
            ++first1;
        } else {
            if (!comp(*first2, *first1)) {
                *out = *first1;
                ++out;
                ++first1;
            }
            ++first2;
        }
    }
    return out;
}
template <class I1, class I2, class O> O set_intersection(I1 first1, I1 last1, I2 first2, I2 last2, O out) {
    return std::set_intersection(first1, last1, first2, last2, out, __less_iterators());
}
template <class I1, class I2, class O, class C>
O set_difference(I1 first1, I1 last1, I2 first2, I2 last2, O out, C comp) {
    while (first1 != last1) {
        if (first2 == last2)
            return std::copy(first1, last1, out);
        if (comp(*first1, *first2)) {
            *out = *first1;
            ++out;
            ++first1;
        } else {
            if (!comp(*first2, *first1))
                ++first1;
            ++first2;
        }
    }
    return out;
}
template <class I1, class I2, class O> O set_difference(I1 first1, I1 last1, I2 first2, I2 last2, O out) {
    return std::set_difference(first1, last1, first2, last2, out, __less_iterators());
}
template <class I1, class I2, class O, class C>
O set_symmetric_difference(I1 first1, I1 last1, I2 first2, I2 last2, O out, C comp) {
    while (first1 != last1) {
        if (first2 == last2)
            return std::copy(first1, last1, out);
        if (comp(*first1, *first2)) {
            *out = *first1;
            ++out;
            ++first1;
        } else {
            if (comp(*first2, *first1)) {
                *out = *first2;
                ++out;
            } else {
                ++first1;
            }
            ++first2;
        }
    }
    return std::copy(first2, last2, out);
}
template <class I1, class I2, class O> O set_symmetric_difference(I1 first1, I1 last1, I2 first2, I2 last2, O out) {
    return std::set_symmetric_difference(first1, last1, first2, last2, out, __less_iterators());
}

// --- Minimum and maximum

template <class T> constexpr const T& min(const T& a, const T& b) { return b < a ? b : a; }
template <class T, class C> constexpr const T& min(const T& a, const T& b, C comp) { return comp(b, a) ? b : a; }
template <class T> constexpr const T& max(const T& a, const T& b) { return a < b ? b : a; }
template <class T, class C> constexpr const T& max(const T& a, const T& b, C comp) { return comp(a, b) ? b : a; }
template <class T> constexpr pair<const T&, const T&> minmax(const T& a, const T& b) {
    return b < a ? pair<const T&, const T&>(b, a) : pair<const T&, const T&>(a, b);
}
template <class T, class C> constexpr pair<const T&, const T&> minmax(const T& a, const T& b, C comp) {
    return comp(b, a) ? pair<const T&, const T&>(b, a) : pair<const T&, const T&>(a, b);
}
template <class I, class C> I min_element(I first, I last, C comp) {
    if (first == last)
        return first;
    I result = first;
    while (++first != last) {
        if (comp(*first, *result))
            result = first;
    }
    return result;
}
template <class I> I min_element(I first, I last) { return std::min_element(first, last, __less_iterators()); }
template <class I, class C> I max_element(I first, I last, C comp) {
    if (first == last)
        return first;
    I result = first;
    while (++first != last) {
        if (comp(*result, *first))
            result = first;
    }
    return result;
}
template <class I> I max_element(I first, I last) { return std::max_element(first, last, __less_iterators()); }
template <class I, class C> pair<I, I> minmax_element(I first, I last, C comp) {
    I smallest = first, largest = first;
    if (first == last)
        return pair<I, I>(smallest, largest);
    while (++first != last) {
        I it = first;
        if (++first == last) {
            if (comp(*it, *smallest))
                smallest = it;
            else if (!comp(*it, *largest))
                largest = it;
            break;
        }
        if (comp(*first, *it)) {
            if (comp(*first, *smallest))
                smallest = first;
            if (!comp(*it, *largest))
                largest = it;
        } else {
            if (comp(*it, *smallest))
                smallest = it;
            if (!comp(*first, *largest))
                largest = first;
        }
    }
    return pair<I, I>(smallest, largest);
}
template <class I> pair<I, I> minmax_element(I first, I last) {
    return std::minmax_element(first, last, __less_iterators());
}
template <class T> T min(initializer_list<T> list) { return *std::min_element(list.begin(), list.end()); }
template <class T, class C> T min(initializer_list<T> list, C comp) {
    return *std::min_element(list.begin(), list.end(), comp);
}
template <class T> T max(initializer_list<T> list) { return *std::max_element(list.begin(), list.end()); }
template <class T, class C> T max(initializer_list<T> list, C comp) {
    return *std::max_element(list.begin(), list.end(), comp);
}
template <class T> pair<T, T> minmax(initializer_list<T> list) {
    pair<const T*, const T*> result = std::minmax_element(list.begin(), list.end());
    return pair<T, T>(*result.first, *result.second);
}
template <class T> constexpr const T& clamp(const T& value, const T& low, const T& high) {
    return value < low ? low : (high < value ? high : value);
}
template <class T, class C> constexpr const T& clamp(const T& value, const T& low, const T& high, C comp) {
    return comp(value, low) ? low : (comp(high, value) ? high : value);
}
template <class I1, class I2, class C> bool lexicographical_compare(I1 first1, I1 last1, I2 first2, I2 last2, C comp) {
    for (; first1 != last1 && first2 != last2; ++first1, ++first2) {
        if (comp(*first1, *first2))
            return true;
        if (comp(*first2, *first1))
            return false;
    }
    return first1 == last1 && first2 != last2;
}
template <class I1, class I2> bool lexicographical_compare(I1 first1, I1 last1, I2 first2, I2 last2) {
    return std::lexicographical_compare(first1, last1, first2, last2, __less_iterators());
}

// --- Permutations

template <class I, class C> bool next_permutation(I first, I last, C comp) {
    if (first == last)
        return false;
    I it = last;
    if (first == --it)
        return false;
    for (;;) {
        I next = it;
        if (comp(*--it, *next)) {
            I swapped = last;
            while (!comp(*it, *--swapped)) {
            }
            std::iter_swap(it, swapped);
            std::reverse(next, last);
            return true;
        }
        if (it == first) {
            std::reverse(first, last);
            return false;
        }
    }
}
template <class I> bool next_permutation(I first, I last) {
    return std::next_permutation(first, last, __less_iterators());
}
template <class I, class C> bool prev_permutation(I first, I last, C comp) {
    if (first == last)
        return false;
    I it = last;
    if (first == --it)
        return false;
    for (;;) {
        I next = it;
        if (comp(*next, *--it)) {
            I swapped = last;
            while (!comp(*--swapped, *it)) {
            }
            std::iter_swap(it, swapped);
            std::reverse(next, last);
            return true;
        }
        if (it == first) {
            std::reverse(first, last);
            return false;
        }
    }
}
template <class I> bool prev_permutation(I first, I last) {
    return std::prev_permutation(first, last, __less_iterators());
}
template <class I1, class I2, class P> bool is_permutation(I1 first1, I1 last1, I2 first2, P p) {
    for (; first1 != last1; ++first1, ++first2) {
        if (!p(*first1, *first2))
            break;
    }
    if (first1 == last1)
        return true;
    I2 last2 = first2;
    std::advance(last2, std::distance(first1, last1));
    for (I1 it = first1; it != last1; ++it) {
        bool seen = false;
        for (I1 before = first1; before != it; ++before) {
            if (p(*before, *it)) {
                seen = true;
                break;
            }
        }
        if (seen)
            continue;
        long matches = 0;
        for (I2 other = first2; other != last2; ++other) {
            if (p(*it, *other))
                ++matches;
        }
        long own = 0;
        for (I1 other = it; other != last1; ++other) {
            if (p(*it, *other))
                ++own;
        }
        if (matches != own)
            return false;
    }
    return true;
}
template <class I1, class I2> bool is_permutation(I1 first1, I1 last1, I2 first2) {
    return std::is_permutation(first1, last1, first2, __equal_iterators());
}
}
`);

    X.addHeader('v4script/numeric', [
        ['std', 3, 7, 'accumulate'],
        ['std', 8, 12, 'accumulate'],
        ['std', 13, 13, 'reduce'],
        ['std', 14, 16, 'reduce'],
        ['std', 17, 19, 'reduce'],
        ['std', 20, 24, 'inner_product'],
        ['std', 25, 30, 'inner_product'],
        ['std', 31, 33, 'transform_reduce'],
        ['std', 34, 38, 'transform_reduce'],
        ['std', 39, 49, 'partial_sum'],
        ['std', 50, 51, 'partial_sum'],
        ['std', 52, 54, 'inclusive_scan'],
        ['std', 55, 57, 'inclusive_scan'],
        ['std', 58, 67, 'exclusive_scan'],
        ['std', 68, 70, 'exclusive_scan'],
        ['std', 71, 82, 'adjacent_difference'],
        ['std', 83, 85, 'adjacent_difference'],
        ['std', 86, 89, 'iota'],
        ['std', 90, 100, 'gcd'],
        ['std', 101, 108, 'lcm']
    ], String.raw`
namespace std {
template <class I, class T> T accumulate(I first, I last, T init) {
    for (; first != last; ++first)
        init = std::move(init) + *first;
    return init;
}
template <class I, class T, class F> T accumulate(I first, I last, T init, F f) {
    for (; first != last; ++first)
        init = f(std::move(init), *first);
    return init;
}
template <class I, class T> T reduce(I first, I last, T init) { return std::accumulate(first, last, init); }
template <class I, class T, class F> T reduce(I first, I last, T init, F f) {
    return std::accumulate(first, last, init, f);
}
template <class I> typename iterator_traits<I>::value_type reduce(I first, I last) {
    return std::accumulate(first, last, typename iterator_traits<I>::value_type());
}
template <class I1, class I2, class T> T inner_product(I1 first1, I1 last1, I2 first2, T init) {
    for (; first1 != last1; ++first1, ++first2)
        init = std::move(init) + *first1 * *first2;
    return init;
}
template <class I1, class I2, class T, class F1, class F2>
T inner_product(I1 first1, I1 last1, I2 first2, T init, F1 sum, F2 product) {
    for (; first1 != last1; ++first1, ++first2)
        init = sum(std::move(init), product(*first1, *first2));
    return init;
}
template <class I1, class I2, class T> T transform_reduce(I1 first1, I1 last1, I2 first2, T init) {
    return std::inner_product(first1, last1, first2, init);
}
template <class I, class T, class F1, class F2> T transform_reduce(I first, I last, T init, F1 sum, F2 transform) {
    for (; first != last; ++first)
        init = sum(std::move(init), transform(*first));
    return init;
}
template <class I, class O, class F> O partial_sum(I first, I last, O out, F f) {
    if (first == last)
        return out;
    typename iterator_traits<I>::value_type sum = *first;
    *out = sum;
    while (++first != last) {
        sum = f(std::move(sum), *first);
        *++out = sum;
    }
    return ++out;
}
template <class I, class O>
O partial_sum(I first, I last, O out) { return std::partial_sum(first, last, out, plus<>()); }
template <class I, class O, class F> O inclusive_scan(I first, I last, O out, F f) {
    return std::partial_sum(first, last, out, f);
}
template <class I, class O> O inclusive_scan(I first, I last, O out) {
    return std::partial_sum(first, last, out, plus<>());
}
template <class I, class O, class T, class F> O exclusive_scan(I first, I last, O out, T init, F f) {
    while (first != last) {
        T value = init;
        init = f(init, *first);
        ++first;
        *out = value;
        ++out;
    }
    return out;
}
template <class I, class O, class T> O exclusive_scan(I first, I last, O out, T init) {
    return std::exclusive_scan(first, last, out, init, plus<>());
}
template <class I, class O, class F> O adjacent_difference(I first, I last, O out, F f) {
    if (first == last)
        return out;
    typename iterator_traits<I>::value_type previous = *first;
    *out = previous;
    while (++first != last) {
        typename iterator_traits<I>::value_type value = *first;
        *++out = f(value, std::move(previous));
        previous = std::move(value);
    }
    return ++out;
}
template <class I, class O> O adjacent_difference(I first, I last, O out) {
    return std::adjacent_difference(first, last, out, minus<>());
}
template <class I, class T> void iota(I first, I last, T value) {
    for (; first != last; ++first, ++value)
        *first = value;
}
template <class M, class N> constexpr typename common_type<M, N>::type gcd(M m, N n) {
    typedef typename common_type<M, N>::type R;
    R a = m < 0 ? -R(m) : R(m);
    R b = n < 0 ? -R(n) : R(n);
    while (b != 0) {
        R t = a % b;
        a = b;
        b = t;
    }
    return a;
}
template <class M, class N> constexpr typename common_type<M, N>::type lcm(M m, N n) {
    typedef typename common_type<M, N>::type R;
    if (m == 0 || n == 0)
        return 0;
    R a = m < 0 ? -R(m) : R(m);
    R b = n < 0 ? -R(n) : R(n);
    return a / std::gcd(a, b) * b;
}
}
`);
})(globalThis);
