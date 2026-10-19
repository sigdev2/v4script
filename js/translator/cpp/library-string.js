// C++ library: <string>, <string_view>, <iterator> basics, <stdexcept>, std::hash.
// std::string is a class (not a template) with the layout of libstdc++: a
// pointer, the size and a buffer of 15 characters or the capacity.
// The tables of declarations are written by tools/build-cpp-library.mjs.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    if (X.headers['v4script/iterator'])
        return;

    X.addHeader('v4script/iterator', [
        ['std', 3, 3, 'input_iterator_tag'],
        ['std', 4, 4, 'output_iterator_tag'],
        ['std', 5, 5, 'forward_iterator_tag'],
        ['std', 6, 6, 'bidirectional_iterator_tag'],
        ['std', 7, 7, 'random_access_iterator_tag'],
        ['std', 8, 8, 'contiguous_iterator_tag'],
        ['std', 10, 16, 'iterator_traits'],
        ['std', 17, 23, 'iterator_traits'],
        ['std', 24, 30, 'iterator_traits'],
        ['std', 31, 37, 'iterator'],
        ['std', 39, 39, '__is_random_access'],
        ['std', 40, 40, '__is_random_access'],
        ['std', 42, 43, '__distance'],
        ['std', 44, 49, '__distance'],
        ['std', 50, 52, 'distance'],
        ['std', 53, 53, '__advance'],
        ['std', 54, 62, '__advance'],
        ['std', 63, 66, '__advance'],
        ['std', 67, 69, 'advance'],
        ['std', 70, 73, 'next'],
        ['std', 74, 77, 'prev'],
        ['std', 79, 131, 'reverse_iterator'],
        ['std', 132, 134, 'operator=='],
        ['std', 135, 137, 'operator!='],
        ['std', 138, 140, 'operator<'],
        ['std', 141, 143, 'operator>'],
        ['std', 144, 146, 'operator<='],
        ['std', 147, 149, 'operator>='],
        ['std', 150, 153, 'operator-'],
        ['std', 154, 157, 'operator+'],
        ['std', 158, 158, 'make_reverse_iterator'],
        ['std', 160, 190, 'move_iterator'],
        ['std', 191, 191, 'make_move_iterator'],
        ['std', 193, 193, 'begin'],
        ['std', 194, 194, 'begin'],
        ['std', 195, 195, 'end'],
        ['std', 196, 196, 'end'],
        ['std', 197, 197, 'begin'],
        ['std', 198, 198, 'end'],
        ['std', 199, 199, 'cbegin'],
        ['std', 200, 200, 'cend'],
        ['std', 201, 201, 'rbegin'],
        ['std', 202, 202, 'rend'],
        ['std', 203, 203, 'rbegin'],
        ['std', 204, 204, 'rend'],
        ['std', 205, 205, 'size'],
        ['std', 206, 206, 'size'],
        ['std', 207, 207, 'empty'],
        ['std', 208, 208, 'empty'],
        ['std', 209, 209, 'data'],
        ['std', 210, 210, 'data'],
        ['std', 211, 211, 'data']
    ], String.raw`
namespace std {
struct input_iterator_tag {};
struct output_iterator_tag {};
struct forward_iterator_tag : public input_iterator_tag {};
struct bidirectional_iterator_tag : public forward_iterator_tag {};
struct random_access_iterator_tag : public bidirectional_iterator_tag {};
struct contiguous_iterator_tag : public random_access_iterator_tag {};

template <class I> struct iterator_traits {
    typedef typename I::iterator_category iterator_category;
    typedef typename I::value_type value_type;
    typedef typename I::difference_type difference_type;
    typedef typename I::pointer pointer;
    typedef typename I::reference reference;
};
template <class T> struct iterator_traits<T*> {
    typedef random_access_iterator_tag iterator_category;
    typedef T value_type;
    typedef ptrdiff_t difference_type;
    typedef T* pointer;
    typedef T& reference;
};
template <class T> struct iterator_traits<const T*> {
    typedef random_access_iterator_tag iterator_category;
    typedef T value_type;
    typedef ptrdiff_t difference_type;
    typedef const T* pointer;
    typedef const T& reference;
};
template <class C, class T, class D = ptrdiff_t, class P = T*, class R = T&> struct iterator {
    typedef C iterator_category;
    typedef T value_type;
    typedef D difference_type;
    typedef P pointer;
    typedef R reference;
};

template <class I> constexpr bool __is_random_access(random_access_iterator_tag) { return true; }
template <class I> constexpr bool __is_random_access(input_iterator_tag) { return false; }

template <class I> typename iterator_traits<I>::difference_type
__distance(I first, I last, random_access_iterator_tag) { return last - first; }
template <class I> typename iterator_traits<I>::difference_type __distance(I first, I last, input_iterator_tag) {
    typename iterator_traits<I>::difference_type n = 0;
    for (; first != last; ++first)
        ++n;
    return n;
}
template <class I> typename iterator_traits<I>::difference_type distance(I first, I last) {
    return __distance(first, last, typename iterator_traits<I>::iterator_category());
}
template <class I, class D> void __advance(I& it, D n, random_access_iterator_tag) { it += n; }
template <class I, class D> void __advance(I& it, D n, bidirectional_iterator_tag) {
    if (n > 0) {
        while (n--)
            ++it;
    } else {
        while (n++)
            --it;
    }
}
template <class I, class D> void __advance(I& it, D n, input_iterator_tag) {
    while (n--)
        ++it;
}
template <class I, class D> void advance(I& it, D n) {
    __advance(it, n, typename iterator_traits<I>::iterator_category());
}
template <class I> I next(I it, typename iterator_traits<I>::difference_type n = 1) {
    std::advance(it, n);
    return it;
}
template <class I> I prev(I it, typename iterator_traits<I>::difference_type n = 1) {
    std::advance(it, -n);
    return it;
}

template <class I> class reverse_iterator {
protected:
    I current;
public:
    typedef I iterator_type;
    typedef typename iterator_traits<I>::iterator_category iterator_category;
    typedef typename iterator_traits<I>::value_type value_type;
    typedef typename iterator_traits<I>::difference_type difference_type;
    typedef typename iterator_traits<I>::pointer pointer;
    typedef typename iterator_traits<I>::reference reference;
    reverse_iterator() : current() {}
    explicit reverse_iterator(I it) : current(it) {}
    template <class U> reverse_iterator(const reverse_iterator<U>& other) : current(other.base()) {}
    I base() const { return current; }
    reference operator*() const {
        I tmp = current;
        return *--tmp;
    }
    pointer operator->() const {
        I tmp = current;
        --tmp;
        return &*tmp;
    }
    reverse_iterator& operator++() {
        --current;
        return *this;
    }
    reverse_iterator operator++(int) {
        reverse_iterator tmp = *this;
        --current;
        return tmp;
    }
    reverse_iterator& operator--() {
        ++current;
        return *this;
    }
    reverse_iterator operator--(int) {
        reverse_iterator tmp = *this;
        ++current;
        return tmp;
    }
    reverse_iterator operator+(difference_type n) const { return reverse_iterator(current - n); }
    reverse_iterator operator-(difference_type n) const { return reverse_iterator(current + n); }
    reverse_iterator& operator+=(difference_type n) {
        current -= n;
        return *this;
    }
    reverse_iterator& operator-=(difference_type n) {
        current += n;
        return *this;
    }
    reference operator[](difference_type n) const { return *(*this + n); }
};
template <class I> bool operator==(const reverse_iterator<I>& a, const reverse_iterator<I>& b) {
    return a.base() == b.base();
}
template <class I> bool operator!=(const reverse_iterator<I>& a, const reverse_iterator<I>& b) {
    return a.base() != b.base();
}
template <class I> bool operator<(const reverse_iterator<I>& a, const reverse_iterator<I>& b) {
    return b.base() < a.base();
}
template <class I> bool operator>(const reverse_iterator<I>& a, const reverse_iterator<I>& b) {
    return a.base() < b.base();
}
template <class I> bool operator<=(const reverse_iterator<I>& a, const reverse_iterator<I>& b) {
    return !(a.base() < b.base());
}
template <class I> bool operator>=(const reverse_iterator<I>& a, const reverse_iterator<I>& b) {
    return !(b.base() < a.base());
}
template <class I> typename reverse_iterator<I>::difference_type operator-(const reverse_iterator<I>& a,
                                                                            const reverse_iterator<I>& b) {
    return b.base() - a.base();
}
template <class I> reverse_iterator<I> operator+(typename reverse_iterator<I>::difference_type n,
                                                 const reverse_iterator<I>& it) {
    return it + n;
}
template <class I> reverse_iterator<I> make_reverse_iterator(I it) { return reverse_iterator<I>(it); }

template <class I> class move_iterator {
    I current;
public:
    typedef I iterator_type;
    typedef typename iterator_traits<I>::iterator_category iterator_category;
    typedef typename iterator_traits<I>::value_type value_type;
    typedef typename iterator_traits<I>::difference_type difference_type;
    typedef I pointer;
    typedef value_type&& reference;
    move_iterator() : current() {}
    explicit move_iterator(I it) : current(it) {}
    I base() const { return current; }
    reference operator*() const { return std::move(*current); }
    move_iterator& operator++() {
        ++current;
        return *this;
    }
    move_iterator operator++(int) {
        move_iterator tmp = *this;
        ++current;
        return tmp;
    }
    move_iterator& operator--() {
        --current;
        return *this;
    }
    difference_type operator-(const move_iterator& other) const { return current - other.current; }
    move_iterator operator+(difference_type n) const { return move_iterator(current + n); }
    bool operator==(const move_iterator& other) const { return current == other.current; }
    bool operator!=(const move_iterator& other) const { return current != other.current; }
};
template <class I> move_iterator<I> make_move_iterator(I it) { return move_iterator<I>(it); }

template <class C> auto begin(C& c) -> decltype(c.begin()) { return c.begin(); }
template <class C> auto begin(const C& c) -> decltype(c.begin()) { return c.begin(); }
template <class C> auto end(C& c) -> decltype(c.end()) { return c.end(); }
template <class C> auto end(const C& c) -> decltype(c.end()) { return c.end(); }
template <class T, size_t N> constexpr T* begin(T (&a)[N]) noexcept { return a; }
template <class T, size_t N> constexpr T* end(T (&a)[N]) noexcept { return a + N; }
template <class C> auto cbegin(const C& c) -> decltype(c.begin()) { return c.begin(); }
template <class C> auto cend(const C& c) -> decltype(c.end()) { return c.end(); }
template <class C> auto rbegin(C& c) -> decltype(c.rbegin()) { return c.rbegin(); }
template <class C> auto rend(C& c) -> decltype(c.rend()) { return c.rend(); }
template <class C> auto rbegin(const C& c) -> decltype(c.rbegin()) { return c.rbegin(); }
template <class C> auto rend(const C& c) -> decltype(c.rend()) { return c.rend(); }
template <class C> auto size(const C& c) -> decltype(c.size()) { return c.size(); }
template <class T, size_t N> constexpr size_t size(const T (&a)[N]) noexcept { return N; }
template <class C> auto empty(const C& c) -> decltype(c.empty()) { return c.empty(); }
template <class T, size_t N> constexpr bool empty(const T (&a)[N]) noexcept { return false; }
template <class C> auto data(C& c) -> decltype(c.data()) { return c.data(); }
template <class C> auto data(const C& c) -> decltype(c.data()) { return c.data(); }
template <class T, size_t N> constexpr T* data(T (&a)[N]) noexcept { return a; }
}
`);

    X.addHeader('v4script/string', [
        ['std', 3, 3, 'hash'],
        ['std', 4, 4, 'char_traits'],
        ['std', 5, 18, 'char_traits'],
        ['std', 21, 28, '__compare_lengths'],
        ['std', 30, 30, 'string_view'],
        ['std', 32, 518, 'string'],
        ['std', 519, 519, '__string_alias'],
        ['std', 521, 527, 'operator+'],
        ['std', 528, 531, 'operator+'],
        ['std', 532, 535, 'operator+'],
        ['std', 536, 539, 'operator+'],
        ['std', 540, 544, 'operator+'],
        ['std', 545, 548, 'operator+'],
        ['std', 549, 553, 'operator+'],
        ['std', 554, 557, 'operator+'],
        ['std', 558, 562, 'operator+'],
        ['std', 563, 566, 'operator+'],
        ['std', 567, 571, 'operator+'],
        ['std', 572, 574, 'operator=='],
        ['std', 575, 575, 'operator=='],
        ['std', 576, 576, 'operator=='],
        ['std', 577, 577, 'operator!='],
        ['std', 578, 578, 'operator!='],
        ['std', 579, 579, 'operator!='],
        ['std', 580, 580, 'operator<'],
        ['std', 581, 581, 'operator<'],
        ['std', 582, 582, 'operator<'],
        ['std', 583, 583, 'operator>'],
        ['std', 584, 584, 'operator>'],
        ['std', 585, 585, 'operator>'],
        ['std', 586, 586, 'operator<='],
        ['std', 587, 587, 'operator<='],
        ['std', 588, 588, 'operator<='],
        ['std', 589, 589, 'operator>='],
        ['std', 590, 590, 'operator>='],
        ['std', 591, 591, 'operator>='],
        ['std', 592, 592, 'swap'],
        ['std', 593, 593, 'basic_string'],
        ['std', 594, 597, 'basic_string'],
        ['std', 601, 671, 'string_view'],
        ['std', 672, 672, 'operator=='],
        ['std', 673, 673, 'operator!='],
        ['std', 674, 674, 'operator<'],
        ['std', 675, 675, 'operator>'],
        ['std', 676, 676, 'operator<='],
        ['std', 677, 677, 'operator>='],
        ['std', 678, 678, 'string'],
        ['std', 679, 679, 'string'],
        ['std', 680, 680, 'string'],
        ['std', 681, 681, 'string'],
        ['std', 685, 691, 'logic_error'],
        ['std', 692, 696, 'domain_error'],
        ['std', 697, 701, 'invalid_argument'],
        ['std', 702, 706, 'length_error'],
        ['std', 707, 711, 'out_of_range'],
        ['std', 712, 718, 'runtime_error'],
        ['std', 719, 723, 'range_error'],
        ['std', 724, 728, 'overflow_error'],
        ['std', 729, 733, 'underflow_error'],
        ['std', 735, 741, 'string'],
        ['std', 745, 748, 'to_string'],
        ['std', 749, 752, 'to_string'],
        ['std', 753, 756, 'to_string'],
        ['std', 757, 760, 'to_string'],
        ['std', 761, 764, 'to_string'],
        ['std', 765, 768, 'to_string'],
        ['std', 769, 772, 'to_string'],
        ['std', 773, 773, 'to_string'],
        ['std', 774, 774, 'to_string'],
        ['std', 776, 788, '__string_to_long'],
        ['std', 789, 791, 'stoi'],
        ['std', 792, 794, 'stol'],
        ['std', 795, 797, 'stoll'],
        ['std', 798, 810, 'stoul'],
        ['std', 811, 823, 'stoull'],
        ['std', 824, 836, 'stod'],
        ['std', 837, 837, 'stof'],
        ['std', 838, 838, 'stold'],
        ['std', 842, 844, 'hash'],
        ['std', 845, 847, 'hash'],
        ['std', 848, 852, 'hash'],
        ['std', 853, 857, 'hash'],
        ['std', 858, 862, 'hash'],
        ['std', 863, 867, 'hash'],
        ['std', 868, 872, 'hash'],
        ['std::+literals::+string_literals', 876, 876, 'operator""s'],
        ['std::+literals::+string_view_literals', 879, 879, 'operator""sv']
    ], String.raw`
namespace std {
template <class T> struct hash;
template <class T> struct char_traits;
template <> struct char_traits<char> {
    typedef char char_type;
    typedef int int_type;
    static size_t length(const char* s) { return strlen(s); }
    static int compare(const char* a, const char* b, size_t n) { return memcmp(a, b, n); }
    static char* copy(char* d, const char* s, size_t n) { return (char*)memcpy(d, s, n); }
    static char* move(char* d, const char* s, size_t n) { return (char*)memmove(d, s, n); }
    static void assign(char& d, const char& s) { d = s; }
    static bool eq(char a, char b) { return a == b; }
    static bool lt(char a, char b) { return (unsigned char)a < (unsigned char)b; }
    static int_type eof() { return -1; }
    static int_type to_int_type(char c) { return (unsigned char)c; }
    static char to_char_type(int_type c) { return (char)c; }
};

// The difference of the lengths, as libstdc++ compares them.
inline int __compare_lengths(size_t a, size_t b) {
    long long difference = (long long)(a - b);
    if (difference > 2147483647LL)
        return 2147483647;
    if (difference < -2147483648LL)
        return -2147483647 - 1;
    return (int)difference;
}

class string_view;

class string {
    char* __data;
    size_t __size;
    union {
        char __local[16];
        size_t __capacity;
    };
    bool __is_local() const { return __data == __local; }
    // Room for n characters (the contents are kept), with the growth of
    // libstdc++: at least twice the old capacity.
    void __reserve(size_t n) {
        size_t old = capacity();
        if (n <= old)
            return;
        if (n < 2 * old)
            n = 2 * old;
        char* data = (char*)malloc(n + 1);
        memcpy(data, __data, __size + 1);
        if (!__is_local())
            free(__data);
        __data = data;
        __capacity = n;
    }
    void __init(const char* s, size_t n) {
        __data = __local;
        __size = 0;
        if (n > 15) {
            __data = (char*)malloc(n + 1);
            __capacity = n;
        }
        if (n)
            memcpy(__data, s, n);
        __data[n] = 0;
        __size = n;
    }
    void __out_of_range(const char* where, size_t pos) const;
public:
    typedef char value_type;
    typedef char_traits<char> traits_type;
    typedef size_t size_type;
    typedef ptrdiff_t difference_type;
    typedef char& reference;
    typedef const char& const_reference;
    typedef char* pointer;
    typedef const char* const_pointer;
    typedef char* iterator;
    typedef const char* const_iterator;
    typedef std::reverse_iterator<char*> reverse_iterator;
    typedef std::reverse_iterator<const char*> const_reverse_iterator;
    static const size_t npos = (size_t)-1;

    string() noexcept {
        __data = __local;
        __size = 0;
        __local[0] = 0;
    }
    string(const char* s) { __init(s, strlen(s)); }
    string(const char* s, size_t n) { __init(s, n); }
    string(size_t n, char c) {
        __init("", 0);
        __reserve(n);
        memset(__data, c, n);
        __size = n;
        __data[n] = 0;
    }
    string(const string& other) { __init(other.__data, other.__size); }
    string(string&& other) noexcept {
        if (other.__is_local()) {
            __data = __local;
            memcpy(__local, other.__local, 16);
        } else {
            __data = other.__data;
            __capacity = other.__capacity;
        }
        __size = other.__size;
        other.__data = other.__local;
        other.__size = 0;
        other.__local[0] = 0;
    }
    string(const string& other, size_t pos, size_t n = npos) {
        if (pos > other.__size)
            other.__out_of_range("basic_string::basic_string", pos);
        size_t count = n > other.__size - pos ? other.__size - pos : n;
        __init(other.__data + pos, count);
    }
    string(initializer_list<char> list) { __init(list.begin(), list.size()); }
    template <class I> string(I first, I last) {
        __init("", 0);
        for (; first != last; ++first)
            push_back(*first);
    }
    explicit string(const string_view& view);
    string(nullptr_t) = delete;
    ~string() {
        if (!__is_local())
            free(__data);
    }

    string& operator=(const string& other) {
        if (this != &other)
            assign(other.__data, other.__size);
        return *this;
    }
    string& operator=(string&& other) noexcept {
        if (this == &other)
            return *this;
        if (other.__is_local()) {
            assign(other.__data, other.__size);
        } else {
            if (!__is_local())
                free(__data);
            __data = other.__data;
            __capacity = other.__capacity;
            __size = other.__size;
            other.__data = other.__local;
        }
        other.__size = 0;
        other.__local[0] = 0;
        return *this;
    }
    string& operator=(const char* s) { return assign(s, strlen(s)); }
    string& operator=(char c) { return assign(1, c); }
    string& operator=(initializer_list<char> list) { return assign(list.begin(), list.size()); }
    string& operator=(const string_view& view);

    string& assign(const char* s, size_t n) {
        if (n > capacity()) {
            char* data = (char*)malloc(n + 1);
            if (!__is_local())
                free(__data);
            __data = data;
            __capacity = n;
        }
        memmove(__data, s, n);
        __size = n;
        __data[n] = 0;
        return *this;
    }
    string& assign(const char* s) { return assign(s, strlen(s)); }
    string& assign(const string& other) { return *this = other; }
    string& assign(string&& other) { return *this = std::move(other); }
    string& assign(const string& other, size_t pos, size_t n = npos) { return *this = other.substr(pos, n); }
    string& assign(size_t n, char c) {
        clear();
        return append(n, c);
    }
    template <class I> string& assign(I first, I last) {
        clear();
        for (; first != last; ++first)
            push_back(*first);
        return *this;
    }
    string& assign(initializer_list<char> list) { return assign(list.begin(), list.size()); }

    size_t size() const noexcept { return __size; }
    size_t length() const noexcept { return __size; }
    size_t max_size() const noexcept { return 0x3fffffffffffffffUL; }
    size_t capacity() const noexcept { return __is_local() ? 15 : __capacity; }
    bool empty() const noexcept { return __size == 0; }
    void reserve(size_t n = 0) {
        if (n > capacity()) {
            char* data = (char*)malloc(n + 1);
            memcpy(data, __data, __size + 1);
            if (!__is_local())
                free(__data);
            __data = data;
            __capacity = n;
        }
    }
    void shrink_to_fit() {}
    void clear() noexcept {
        __size = 0;
        __data[0] = 0;
    }
    void resize(size_t n, char c) {
        if (n > __size)
            append(n - __size, c);
        else {
            __size = n;
            __data[n] = 0;
        }
    }
    void resize(size_t n) { resize(n, '\0'); }

    char& operator[](size_t i) { return __data[i]; }
    const char& operator[](size_t i) const { return __data[i]; }
    char& at(size_t i) {
        if (i >= __size)
            __out_of_range("basic_string::at", i);
        return __data[i];
    }
    const char& at(size_t i) const {
        if (i >= __size)
            __out_of_range("basic_string::at", i);
        return __data[i];
    }
    char& front() { return __data[0]; }
    const char& front() const { return __data[0]; }
    char& back() { return __data[__size - 1]; }
    const char& back() const { return __data[__size - 1]; }
    const char* c_str() const noexcept { return __data; }
    const char* data() const noexcept { return __data; }
    char* data() noexcept { return __data; }
    operator string_view() const noexcept;

    char* begin() noexcept { return __data; }
    const char* begin() const noexcept { return __data; }
    char* end() noexcept { return __data + __size; }
    const char* end() const noexcept { return __data + __size; }
    const char* cbegin() const noexcept { return __data; }
    const char* cend() const noexcept { return __data + __size; }
    reverse_iterator rbegin() noexcept { return reverse_iterator(end()); }
    const_reverse_iterator rbegin() const noexcept { return const_reverse_iterator(end()); }
    reverse_iterator rend() noexcept { return reverse_iterator(begin()); }
    const_reverse_iterator rend() const noexcept { return const_reverse_iterator(begin()); }
    const_reverse_iterator crbegin() const noexcept { return const_reverse_iterator(end()); }
    const_reverse_iterator crend() const noexcept { return const_reverse_iterator(begin()); }

    string& append(const char* s, size_t n) {
        if (__size + n > capacity()) {
            // s may point into this string.
            size_t offset = s - __data;
            bool inside = s >= __data && s < __data + __size;
            __reserve(__size + n);
            if (inside)
                s = __data + offset;
        }
        memmove(__data + __size, s, n);
        __size += n;
        __data[__size] = 0;
        return *this;
    }
    string& append(const char* s) { return append(s, strlen(s)); }
    string& append(const string& other) { return append(other.__data, other.__size); }
    string& append(const string& other, size_t pos, size_t n = npos) {
        if (pos > other.__size)
            other.__out_of_range("basic_string::append", pos);
        return append(other.__data + pos, n > other.__size - pos ? other.__size - pos : n);
    }
    string& append(size_t n, char c) {
        __reserve(__size + n);
        memset(__data + __size, c, n);
        __size += n;
        __data[__size] = 0;
        return *this;
    }
    template <class I> string& append(I first, I last) {
        for (; first != last; ++first)
            push_back(*first);
        return *this;
    }
    string& append(initializer_list<char> list) { return append(list.begin(), list.size()); }
    string& operator+=(const string& other) { return append(other.__data, other.__size); }
    string& operator+=(const char* s) { return append(s, strlen(s)); }
    string& operator+=(char c) {
        push_back(c);
        return *this;
    }
    string& operator+=(initializer_list<char> list) { return append(list.begin(), list.size()); }
    string& operator+=(const string_view& view);
    void push_back(char c) {
        if (__size == capacity())
            __reserve(__size + 1);
        __data[__size++] = c;
        __data[__size] = 0;
    }
    void pop_back() {
        --__size;
        __data[__size] = 0;
    }

    string& insert(size_t pos, const char* s, size_t n) {
        if (pos > __size)
            __out_of_range("basic_string::insert", pos);
        string tail(__data + pos, __size - pos);
        __size = pos;
        append(s, n);
        append(tail);
        return *this;
    }
    string& insert(size_t pos, const char* s) { return insert(pos, s, strlen(s)); }
    string& insert(size_t pos, const string& other) { return insert(pos, other.__data, other.__size); }
    string& insert(size_t pos, size_t n, char c) {
        string fill(n, c);
        return insert(pos, fill.__data, n);
    }
    char* insert(const char* at, char c) {
        size_t pos = at - __data;
        insert(pos, &c, 1);
        return __data + pos;
    }
    char* insert(const char* at, size_t n, char c) {
        size_t pos = at - __data;
        insert(pos, n, c);
        return __data + pos;
    }
    template <class I> char* insert(const char* at, I first, I last) {
        size_t pos = at - __data;
        string items(first, last);
        insert(pos, items);
        return __data + pos;
    }
    string& erase(size_t pos = 0, size_t n = npos) {
        if (pos > __size)
            __out_of_range("basic_string::erase", pos);
        size_t count = n > __size - pos ? __size - pos : n;
        memmove(__data + pos, __data + pos + count, __size - pos - count + 1);
        __size -= count;
        return *this;
    }
    char* erase(const char* at) {
        size_t pos = at - __data;
        erase(pos, 1);
        return __data + pos;
    }
    char* erase(const char* first, const char* last) {
        size_t pos = first - __data;
        erase(pos, last - first);
        return __data + pos;
    }
    string& replace(size_t pos, size_t n, const char* s, size_t count) {
        if (pos > __size)
            __out_of_range("basic_string::replace", pos);
        size_t removed = n > __size - pos ? __size - pos : n;
        string result(__data, pos);
        result.append(s, count);
        result.append(__data + pos + removed, __size - pos - removed);
        return *this = std::move(result);
    }
    string& replace(size_t pos, size_t n, const string& other) { return replace(pos, n, other.__data, other.__size); }
    string& replace(size_t pos, size_t n, const char* s) { return replace(pos, n, s, strlen(s)); }
    string& replace(size_t pos, size_t n, size_t count, char c) {
        string fill(count, c);
        return replace(pos, n, fill.__data, count);
    }
    string& replace(const char* first, const char* last, const string& other) {
        return replace(first - __data, last - first, other.__data, other.__size);
    }
    string& replace(const char* first, const char* last, const char* s) {
        return replace(first - __data, last - first, s, strlen(s));
    }
    string substr(size_t pos = 0, size_t n = npos) const {
        if (pos > __size)
            __out_of_range("basic_string::substr", pos);
        return string(__data + pos, n > __size - pos ? __size - pos : n);
    }
    size_t copy(char* out, size_t n, size_t pos = 0) const {
        if (pos > __size)
            __out_of_range("basic_string::copy", pos);
        size_t count = n > __size - pos ? __size - pos : n;
        memcpy(out, __data + pos, count);
        return count;
    }
    void swap(string& other) noexcept {
        string tmp(std::move(other));
        other = std::move(*this);
        *this = std::move(tmp);
    }

    size_t find(const char* s, size_t pos, size_t n) const {
        if (n == 0)
            return pos <= __size ? pos : npos;
        for (size_t i = pos; i + n <= __size; ++i) {
            if (__data[i] == s[0] && memcmp(__data + i, s, n) == 0)
                return i;
        }
        return npos;
    }
    size_t find(const string& s, size_t pos = 0) const noexcept { return find(s.__data, pos, s.__size); }
    size_t find(const char* s, size_t pos = 0) const { return find(s, pos, strlen(s)); }
    size_t find(char c, size_t pos = 0) const noexcept {
        for (size_t i = pos; i < __size; ++i) {
            if (__data[i] == c)
                return i;
        }
        return npos;
    }
    size_t rfind(const char* s, size_t pos, size_t n) const {
        if (n > __size)
            return npos;
        size_t i = __size - n;
        if (pos < i)
            i = pos;
        for (;; --i) {
            if (memcmp(__data + i, s, n) == 0)
                return i;
            if (i == 0)
                return npos;
        }
    }
    size_t rfind(const string& s, size_t pos = npos) const noexcept { return rfind(s.__data, pos, s.__size); }
    size_t rfind(const char* s, size_t pos = npos) const { return rfind(s, pos, strlen(s)); }
    size_t rfind(char c, size_t pos = npos) const noexcept {
        if (__size == 0)
            return npos;
        size_t i = pos < __size - 1 ? pos : __size - 1;
        for (;; --i) {
            if (__data[i] == c)
                return i;
            if (i == 0)
                return npos;
        }
    }
    size_t find_first_of(const char* s, size_t pos, size_t n) const {
        for (size_t i = pos; i < __size; ++i) {
            if (memchr(s, __data[i], n) != 0)
                return i;
        }
        return npos;
    }
    size_t find_first_of(const string& s, size_t pos = 0) const noexcept {
        return find_first_of(s.__data, pos, s.__size);
    }
    size_t find_first_of(const char* s, size_t pos = 0) const { return find_first_of(s, pos, strlen(s)); }
    size_t find_first_of(char c, size_t pos = 0) const noexcept { return find(c, pos); }
    size_t find_last_of(const char* s, size_t pos, size_t n) const {
        if (__size == 0)
            return npos;
        size_t i = pos < __size - 1 ? pos : __size - 1;
        for (;; --i) {
            if (memchr(s, __data[i], n) != 0)
                return i;
            if (i == 0)
                return npos;
        }
    }
    size_t find_last_of(const string& s, size_t pos = npos) const noexcept {
        return find_last_of(s.__data, pos, s.__size);
    }
    size_t find_last_of(const char* s, size_t pos = npos) const { return find_last_of(s, pos, strlen(s)); }
    size_t find_last_of(char c, size_t pos = npos) const noexcept { return rfind(c, pos); }
    size_t find_first_not_of(const char* s, size_t pos, size_t n) const {
        for (size_t i = pos; i < __size; ++i) {
            if (memchr(s, __data[i], n) == 0)
                return i;
        }
        return npos;
    }
    size_t find_first_not_of(const string& s, size_t pos = 0) const noexcept {
        return find_first_not_of(s.__data, pos, s.__size);
    }
    size_t find_first_not_of(const char* s, size_t pos = 0) const { return find_first_not_of(s, pos, strlen(s)); }
    size_t find_first_not_of(char c, size_t pos = 0) const noexcept { return find_first_not_of(&c, pos, 1); }
    size_t find_last_not_of(const char* s, size_t pos, size_t n) const {
        if (__size == 0)
            return npos;
        size_t i = pos < __size - 1 ? pos : __size - 1;
        for (;; --i) {
            if (memchr(s, __data[i], n) == 0)
                return i;
            if (i == 0)
                return npos;
        }
    }
    size_t find_last_not_of(const string& s, size_t pos = npos) const noexcept {
        return find_last_not_of(s.__data, pos, s.__size);
    }
    size_t find_last_not_of(const char* s, size_t pos = npos) const { return find_last_not_of(s, pos, strlen(s)); }
    size_t find_last_not_of(char c, size_t pos = npos) const noexcept { return find_last_not_of(&c, pos, 1); }

    int compare(const char* s, size_t n) const {
        size_t count = __size < n ? __size : n;
        int result = memcmp(__data, s, count);
        if (result != 0)
            return result;
        return __compare_lengths(__size, n);
    }
    int compare(const string& other) const noexcept { return compare(other.__data, other.__size); }
    int compare(const char* s) const { return compare(s, strlen(s)); }
    int compare(size_t pos, size_t n, const string& other) const { return substr(pos, n).compare(other); }
    int compare(size_t pos, size_t n, const char* s) const { return substr(pos, n).compare(s); }
    int compare(size_t pos, size_t n, const string& other, size_t pos2, size_t n2 = npos) const {
        return substr(pos, n).compare(other.substr(pos2, n2));
    }
    bool starts_with(const char* s) const {
        size_t n = strlen(s);
        return n <= __size && memcmp(__data, s, n) == 0;
    }
    bool starts_with(char c) const { return __size > 0 && __data[0] == c; }
    bool ends_with(const char* s) const {
        size_t n = strlen(s);
        return n <= __size && memcmp(__data + __size - n, s, n) == 0;
    }
    bool ends_with(char c) const { return __size > 0 && __data[__size - 1] == c; }
    bool contains(const char* s) const { return find(s) != npos; }
    bool contains(char c) const { return find(c) != npos; }
};
typedef string __string_alias;

inline string operator+(const string& a, const string& b) {
    string result;
    result.reserve(a.size() + b.size());
    result.append(a);
    result.append(b);
    return result;
}
inline string operator+(string&& a, const string& b) {
    a.append(b);
    return std::move(a);
}
inline string operator+(const string& a, string&& b) {
    b.insert(0, a);
    return std::move(b);
}
inline string operator+(string&& a, string&& b) {
    a.append(b);
    return std::move(a);
}
inline string operator+(const string& a, const char* b) {
    string result(a);
    result.append(b);
    return result;
}
inline string operator+(string&& a, const char* b) {
    a.append(b);
    return std::move(a);
}
inline string operator+(const char* a, const string& b) {
    string result(a);
    result.append(b);
    return result;
}
inline string operator+(const char* a, string&& b) {
    b.insert(0, a);
    return std::move(b);
}
inline string operator+(const string& a, char c) {
    string result(a);
    result.push_back(c);
    return result;
}
inline string operator+(string&& a, char c) {
    a.push_back(c);
    return std::move(a);
}
inline string operator+(char c, const string& b) {
    string result(1, c);
    result.append(b);
    return result;
}
inline bool operator==(const string& a, const string& b) noexcept {
    return a.size() == b.size() && memcmp(a.data(), b.data(), a.size()) == 0;
}
inline bool operator==(const string& a, const char* b) { return a.compare(b) == 0; }
inline bool operator==(const char* a, const string& b) { return b.compare(a) == 0; }
inline bool operator!=(const string& a, const string& b) noexcept { return !(a == b); }
inline bool operator!=(const string& a, const char* b) { return a.compare(b) != 0; }
inline bool operator!=(const char* a, const string& b) { return b.compare(a) != 0; }
inline bool operator<(const string& a, const string& b) noexcept { return a.compare(b) < 0; }
inline bool operator<(const string& a, const char* b) { return a.compare(b) < 0; }
inline bool operator<(const char* a, const string& b) { return b.compare(a) > 0; }
inline bool operator>(const string& a, const string& b) noexcept { return a.compare(b) > 0; }
inline bool operator>(const string& a, const char* b) { return a.compare(b) > 0; }
inline bool operator>(const char* a, const string& b) { return b.compare(a) < 0; }
inline bool operator<=(const string& a, const string& b) noexcept { return a.compare(b) <= 0; }
inline bool operator<=(const string& a, const char* b) { return a.compare(b) <= 0; }
inline bool operator<=(const char* a, const string& b) { return b.compare(a) >= 0; }
inline bool operator>=(const string& a, const string& b) noexcept { return a.compare(b) >= 0; }
inline bool operator>=(const string& a, const char* b) { return a.compare(b) >= 0; }
inline bool operator>=(const char* a, const string& b) { return b.compare(a) <= 0; }
inline void swap(string& a, string& b) noexcept { a.swap(b); }
template <class C> class basic_string;
template <> class basic_string<char> : public string {
public:
    using string::string;
};

// --- string_view

class string_view {
    const char* __data;
    size_t __size;
public:
    typedef char value_type;
    typedef const char* iterator;
    typedef const char* const_iterator;
    typedef size_t size_type;
    static const size_t npos = (size_t)-1;
    constexpr string_view() noexcept : __data(0), __size(0) {}
    constexpr string_view(const char* s, size_t n) : __data(s), __size(n) {}
    string_view(const char* s) : __data(s), __size(strlen(s)) {}
    string_view(const string_view&) = default;
    string_view& operator=(const string_view&) = default;
    constexpr size_t size() const noexcept { return __size; }
    constexpr size_t length() const noexcept { return __size; }
    constexpr bool empty() const noexcept { return __size == 0; }
    constexpr const char* data() const noexcept { return __data; }
    constexpr const char* begin() const noexcept { return __data; }
    constexpr const char* end() const noexcept { return __data + __size; }
    constexpr const char& operator[](size_t i) const { return __data[i]; }
    const char& at(size_t i) const { return __data[i]; }
    constexpr const char& front() const { return __data[0]; }
    constexpr const char& back() const { return __data[__size - 1]; }
    void remove_prefix(size_t n) {
        __data += n;
        __size -= n;
    }
    void remove_suffix(size_t n) { __size -= n; }
    string_view substr(size_t pos = 0, size_t n = npos) const {
        return string_view(__data + pos, n > __size - pos ? __size - pos : n);
    }
    int compare(string_view other) const {
        size_t count = __size < other.__size ? __size : other.__size;
        int result = memcmp(__data, other.__data, count);
        if (result != 0)
            return result;
        return __compare_lengths(__size, other.__size);
    }
    size_t find(string_view s, size_t pos = 0) const {
        if (s.__size == 0)
            return pos <= __size ? pos : npos;
        for (size_t i = pos; i + s.__size <= __size; ++i) {
            if (memcmp(__data + i, s.__data, s.__size) == 0)
                return i;
        }
        return npos;
    }
    size_t find(char c, size_t pos = 0) const {
        for (size_t i = pos; i < __size; ++i) {
            if (__data[i] == c)
                return i;
        }
        return npos;
    }
    size_t rfind(char c, size_t pos = npos) const {
        if (__size == 0)
            return npos;
        size_t i = pos < __size - 1 ? pos : __size - 1;
        for (;; --i) {
            if (__data[i] == c)
                return i;
            if (i == 0)
                return npos;
        }
    }
    bool starts_with(string_view s) const { return s.__size <= __size && memcmp(__data, s.__data, s.__size) == 0; }
    bool ends_with(string_view s) const {
        return s.__size <= __size && memcmp(__data + __size - s.__size, s.__data, s.__size) == 0;
    }
};
inline bool operator==(string_view a, string_view b) noexcept { return a.compare(b) == 0; }
inline bool operator!=(string_view a, string_view b) noexcept { return a.compare(b) != 0; }
inline bool operator<(string_view a, string_view b) noexcept { return a.compare(b) < 0; }
inline bool operator>(string_view a, string_view b) noexcept { return a.compare(b) > 0; }
inline bool operator<=(string_view a, string_view b) noexcept { return a.compare(b) <= 0; }
inline bool operator>=(string_view a, string_view b) noexcept { return a.compare(b) >= 0; }
inline string::string(const string_view& view) { __init(view.data(), view.size()); }
inline string& string::operator=(const string_view& view) { return assign(view.data(), view.size()); }
inline string& string::operator+=(const string_view& view) { return append(view.data(), view.size()); }
inline string::operator string_view() const noexcept { return string_view(__data, __size); }

// --- <stdexcept>

class logic_error : public exception {
    string __message;
public:
    explicit logic_error(const string& message) : __message(message) {}
    explicit logic_error(const char* message) : __message(message) {}
    const char* what() const noexcept override { return __message.c_str(); }
};
class domain_error : public logic_error {
public:
    explicit domain_error(const string& message) : logic_error(message) {}
    explicit domain_error(const char* message) : logic_error(message) {}
};
class invalid_argument : public logic_error {
public:
    explicit invalid_argument(const string& message) : logic_error(message) {}
    explicit invalid_argument(const char* message) : logic_error(message) {}
};
class length_error : public logic_error {
public:
    explicit length_error(const string& message) : logic_error(message) {}
    explicit length_error(const char* message) : logic_error(message) {}
};
class out_of_range : public logic_error {
public:
    explicit out_of_range(const string& message) : logic_error(message) {}
    explicit out_of_range(const char* message) : logic_error(message) {}
};
class runtime_error : public exception {
    string __message;
public:
    explicit runtime_error(const string& message) : __message(message) {}
    explicit runtime_error(const char* message) : __message(message) {}
    const char* what() const noexcept override { return __message.c_str(); }
};
class range_error : public runtime_error {
public:
    explicit range_error(const string& message) : runtime_error(message) {}
    explicit range_error(const char* message) : runtime_error(message) {}
};
class overflow_error : public runtime_error {
public:
    explicit overflow_error(const string& message) : runtime_error(message) {}
    explicit overflow_error(const char* message) : runtime_error(message) {}
};
class underflow_error : public runtime_error {
public:
    explicit underflow_error(const string& message) : runtime_error(message) {}
    explicit underflow_error(const char* message) : runtime_error(message) {}
};

inline void string::__out_of_range(const char* where, size_t pos) const {
    char text[160];
    snprintf(text, sizeof text, "%s: __pos (which is %zu) > this->size() (which is %zu)", where, pos, __size);
    if (strcmp(where, "basic_string::at") == 0)
        snprintf(text, sizeof text, "basic_string::at: __n (which is %zu) >= this->size() (which is %zu)", pos, __size);
    throw out_of_range(text);
}

// --- Numbers to strings and back

inline string to_string(int value) {
    char text[16];
    return string(text, snprintf(text, sizeof text, "%d", value));
}
inline string to_string(unsigned value) {
    char text[16];
    return string(text, snprintf(text, sizeof text, "%u", value));
}
inline string to_string(long value) {
    char text[24];
    return string(text, snprintf(text, sizeof text, "%ld", value));
}
inline string to_string(unsigned long value) {
    char text[24];
    return string(text, snprintf(text, sizeof text, "%lu", value));
}
inline string to_string(long long value) {
    char text[24];
    return string(text, snprintf(text, sizeof text, "%lld", value));
}
inline string to_string(unsigned long long value) {
    char text[24];
    return string(text, snprintf(text, sizeof text, "%llu", value));
}
inline string to_string(double value) {
    char text[328];
    return string(text, snprintf(text, sizeof text, "%f", value));
}
inline string to_string(float value) { return to_string((double)value); }
inline string to_string(long double value) { return to_string((double)value); }

inline long __string_to_long(const char* name, const string& s, size_t* index, int base, long low, long high) {
    const char* begin = s.c_str();
    char* end;
    errno = 0;
    long value = strtol(begin, &end, base);
    if (end == begin)
        throw invalid_argument(name);
    if (errno == ERANGE || value < low || value > high)
        throw out_of_range(name);
    if (index)
        *index = end - begin;
    return value;
}
inline int stoi(const string& s, size_t* index = 0, int base = 10) {
    return (int)__string_to_long("stoi", s, index, base, -2147483647L - 1, 2147483647L);
}
inline long stol(const string& s, size_t* index = 0, int base = 10) {
    return __string_to_long("stol", s, index, base, -9223372036854775807L - 1, 9223372036854775807L);
}
inline long long stoll(const string& s, size_t* index = 0, int base = 10) {
    return __string_to_long("stoll", s, index, base, -9223372036854775807L - 1, 9223372036854775807L);
}
inline unsigned long stoul(const string& s, size_t* index = 0, int base = 10) {
    const char* begin = s.c_str();
    char* end;
    errno = 0;
    unsigned long value = strtoul(begin, &end, base);
    if (end == begin)
        throw invalid_argument("stoul");
    if (errno == ERANGE)
        throw out_of_range("stoul");
    if (index)
        *index = end - begin;
    return value;
}
inline unsigned long long stoull(const string& s, size_t* index = 0, int base = 10) {
    const char* begin = s.c_str();
    char* end;
    errno = 0;
    unsigned long long value = strtoull(begin, &end, base);
    if (end == begin)
        throw invalid_argument("stoull");
    if (errno == ERANGE)
        throw out_of_range("stoull");
    if (index)
        *index = end - begin;
    return value;
}
inline double stod(const string& s, size_t* index = 0) {
    const char* begin = s.c_str();
    char* end;
    errno = 0;
    double value = strtod(begin, &end);
    if (end == begin)
        throw invalid_argument("stod");
    if (errno == ERANGE)
        throw out_of_range("stod");
    if (index)
        *index = end - begin;
    return value;
}
inline float stof(const string& s, size_t* index = 0) { return (float)stod(s, index); }
inline long double stold(const string& s, size_t* index = 0) { return stod(s, index); }

// --- std::hash

template <class T> struct hash {
    size_t operator()(const T& value) const noexcept { return (size_t)value; }
};
template <class T> struct hash<T*> {
    size_t operator()(T* value) const noexcept { return (size_t)value; }
};
template <> struct hash<float> {
    size_t operator()(float value) const noexcept {
        return value == 0.0f ? 0 : __v4_hash_bytes(&value, sizeof value, 0xc70f6907UL);
    }
};
template <> struct hash<double> {
    size_t operator()(double value) const noexcept {
        return value == 0.0 ? 0 : __v4_hash_bytes(&value, sizeof value, 0xc70f6907UL);
    }
};
template <> struct hash<long double> {
    size_t operator()(long double value) const noexcept {
        return value == 0.0 ? 0 : __v4_hash_bytes(&value, sizeof value, 0xc70f6907UL);
    }
};
template <> struct hash<string> {
    size_t operator()(const string& value) const noexcept {
        return __v4_hash_bytes(value.data(), value.size(), 0xc70f6907UL);
    }
};
template <> struct hash<string_view> {
    size_t operator()(string_view value) const noexcept {
        return __v4_hash_bytes(value.data(), value.size(), 0xc70f6907UL);
    }
};

inline namespace literals {
inline namespace string_literals {
inline string operator""s(const char* s, size_t n) { return string(s, n); }
}
inline namespace string_view_literals {
inline string_view operator""sv(const char* s, size_t n) { return string_view(s, n); }
}
}
}
`);
})(globalThis);
