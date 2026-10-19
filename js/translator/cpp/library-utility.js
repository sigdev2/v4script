// C++ library: <tuple>, <functional> (std::function, reference_wrapper),
// <memory> (unique_ptr, shared_ptr, weak_ptr) and <optional>.
// tuple<H, R...> derives from tuple<R...>: the elements are built from the
// last one and laid out as in libstdc++.
// The tables of declarations are written by tools/build-cpp-library.mjs.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    if (X.headers['v4script/tuple'])
        return;

    X.addHeader('v4script/tuple', [
        ['std', 3, 3, 'tuple'],
        ['std', 4, 8, 'tuple'],
        ['std', 9, 75, 'tuple'],
        ['std', 77, 77, 'tuple_size'],
        ['std', 78, 80, 'tuple_element'],
        ['std', 81, 81, 'tuple_element'],
        ['std', 84, 89, '__tuple_at'],
        ['std', 90, 95, '__tuple_at'],
        ['std', 96, 98, 'get'],
        ['std', 99, 102, 'get'],
        ['std', 103, 105, 'get'],
        ['std', 106, 106, '__type_index'],
        ['std', 107, 107, '__type_index'],
        ['std', 108, 109, '__type_index'],
        ['std', 110, 112, 'get'],
        ['std', 113, 115, 'get'],
        ['std', 117, 119, 'make_tuple'],
        ['std', 120, 120, 'tie'],
        ['std', 121, 123, 'forward_as_tuple'],
        ['std', 124, 126, '__ignore_type'],
        ['std', 127, 127, 'ignore'],
        ['std', 129, 131, '__apply'],
        ['std', 132, 135, 'apply'],
        ['std', 136, 138, '__make_from_tuple'],
        ['std', 139, 142, 'make_from_tuple'],
        ['std', 144, 148, '__tuple_cat2'],
        ['std', 149, 149, 'tuple_cat'],
        ['std', 150, 150, 'tuple_cat'],
        ['std', 151, 154, 'tuple_cat'],
        ['std', 156, 164, '__tuple_compare'],
        ['std', 165, 168, '__tuple_compare'],
        ['std', 169, 171, 'operator=='],
        ['std', 172, 174, 'operator!='],
        ['std', 175, 177, 'operator<'],
        ['std', 178, 178, 'operator>'],
        ['std', 179, 181, 'operator<='],
        ['std', 182, 184, 'operator>='],
        ['std', 185, 185, 'swap']
    ], String.raw`
namespace std {
template <class... T> class tuple;
template <> class tuple<> {
public:
    constexpr tuple() noexcept {}
    void swap(tuple&) noexcept {}
};
template <class H, class... R> class tuple<H, R...> : private tuple<R...> {
public:
    typedef H __head_type;
    typedef tuple<R...> __tail_type;
    H __head;

    __tail_type& __tail() noexcept { return static_cast<__tail_type&>(*this); }
    const __tail_type& __tail() const noexcept { return static_cast<const __tail_type&>(*this); }

    constexpr tuple() : __tail_type(), __head() {}
    constexpr tuple(const H& head, const R&... rest) : __tail_type(rest...), __head(head) {}
    template <class U, class... V,
              class = typename enable_if<sizeof...(V) == sizeof...(R) && is_constructible<H, U&&>::value &&
                                         !is_same<typename decay<U>::type, tuple>::value>::type>
    constexpr tuple(U&& head, V&&... rest) : __tail_type(std::forward<V>(rest)...), __head(std::forward<U>(head)) {}
    tuple(const tuple&) = default;
    tuple(tuple&&) = default;
    template <class UH, class... U, class = typename enable_if<sizeof...(U) == sizeof...(R)>::type>
    constexpr tuple(const tuple<UH, U...>& other) : __tail_type(other.__tail()), __head(other.__head) {}
    template <class UH, class... U, class = typename enable_if<sizeof...(U) == sizeof...(R)>::type>
    constexpr tuple(tuple<UH, U...>&& other)
        : __tail_type(std::move(other.__tail())), __head(std::forward<UH>(other.__head)) {}
    template <class U1, class U2, class = typename enable_if<sizeof...(R) == 1>::type>
    constexpr tuple(const pair<U1, U2>& p) : __tail_type(p.second), __head(p.first) {}
    template <class U1, class U2, class = typename enable_if<sizeof...(R) == 1>::type>
    constexpr tuple(pair<U1, U2>&& p) : __tail_type(std::forward<U2>(p.second)), __head(std::forward<U1>(p.first)) {}

    tuple& operator=(const tuple& other) {
        __head = other.__head;
        __tail() = other.__tail();
        return *this;
    }
    tuple& operator=(tuple&& other) {
        __head = std::forward<H>(other.__head);
        __tail() = std::move(other.__tail());
        return *this;
    }
    template <class UH, class... U, class = typename enable_if<sizeof...(U) == sizeof...(R)>::type>
    tuple& operator=(const tuple<UH, U...>& other) {
        __head = other.__head;
        __tail() = other.__tail();
        return *this;
    }
    template <class UH, class... U, class = typename enable_if<sizeof...(U) == sizeof...(R)>::type>
    tuple& operator=(tuple<UH, U...>&& other) {
        __head = std::forward<UH>(other.__head);
        __tail() = std::move(other.__tail());
        return *this;
    }
    template <class U1, class U2, class = typename enable_if<sizeof...(R) == 1>::type>
    tuple& operator=(const pair<U1, U2>& p) {
        __head = p.first;
        __tail().__head = p.second;
        return *this;
    }
    template <class U1, class U2, class = typename enable_if<sizeof...(R) == 1>::type>
    tuple& operator=(pair<U1, U2>&& p) {
        __head = std::forward<U1>(p.first);
        __tail().__head = std::forward<U2>(p.second);
        return *this;
    }
    void swap(tuple& other) {
        using std::swap;
        swap(__head, other.__head);
        __tail().swap(other.__tail());
    }
};

template <class... T> struct tuple_size<tuple<T...>> : integral_constant<size_t, sizeof...(T)> {};
template <class H, class... R> struct tuple_element<0, tuple<H, R...>> {
    typedef H type;
};
template <size_t I, class H, class... R> struct tuple_element<I, tuple<H, R...>> : tuple_element<I - 1, tuple<R...>> {};

// The subtuple whose head is element I.
template <size_t I, class H, class... R> constexpr auto& __tuple_at(tuple<H, R...>& t) noexcept {
    if constexpr (I == 0)
        return t;
    else
        return std::__tuple_at<I - 1>(t.__tail());
}
template <size_t I, class H, class... R> constexpr const auto& __tuple_at(const tuple<H, R...>& t) noexcept {
    if constexpr (I == 0)
        return t;
    else
        return std::__tuple_at<I - 1>(t.__tail());
}
template <size_t I, class... T> constexpr typename tuple_element<I, tuple<T...>>::type& get(tuple<T...>& t) noexcept {
    return std::__tuple_at<I>(t).__head;
}
template <size_t I, class... T>
constexpr const typename tuple_element<I, tuple<T...>>::type& get(const tuple<T...>& t) noexcept {
    return std::__tuple_at<I>(t).__head;
}
template <size_t I, class... T> constexpr typename tuple_element<I, tuple<T...>>::type&& get(tuple<T...>&& t) noexcept {
    return std::forward<typename tuple_element<I, tuple<T...>>::type>(std::__tuple_at<I>(t).__head);
}
template <class T, class... Types> struct __type_index;
template <class T, class... R> struct __type_index<T, T, R...> : integral_constant<size_t, 0> {};
template <class T, class H, class... R> struct __type_index<T, H, R...>
    : integral_constant<size_t, __type_index<T, R...>::value + 1> {};
template <class T, class... Types> constexpr T& get(tuple<Types...>& t) noexcept {
    return std::get<__type_index<T, Types...>::value>(t);
}
template <class T, class... Types> constexpr const T& get(const tuple<Types...>& t) noexcept {
    return std::get<__type_index<T, Types...>::value>(t);
}

template <class... T> constexpr tuple<typename decay<T>::type...> make_tuple(T&&... args) {
    return tuple<typename decay<T>::type...>(std::forward<T>(args)...);
}
template <class... T> constexpr tuple<T&...> tie(T&... args) noexcept { return tuple<T&...>(args...); }
template <class... T> constexpr tuple<T&&...> forward_as_tuple(T&&... args) noexcept {
    return tuple<T&&...>(std::forward<T>(args)...);
}
struct __ignore_type {
    template <class T> const __ignore_type& operator=(const T&) const { return *this; }
};
inline constexpr __ignore_type ignore = __ignore_type();

template <class F, class T, size_t... I> constexpr decltype(auto) __apply(F&& f, T&& t, index_sequence<I...>) {
    return std::forward<F>(f)(std::get<I>(std::forward<T>(t))...);
}
template <class F, class T> constexpr decltype(auto) apply(F&& f, T&& t) {
    return std::__apply(std::forward<F>(f), std::forward<T>(t),
                        make_index_sequence<tuple_size<typename remove_reference<T>::type>::value>());
}
template <class T, class Tuple, size_t... I> constexpr T __make_from_tuple(Tuple&& t, index_sequence<I...>) {
    return T(std::get<I>(std::forward<Tuple>(t))...);
}
template <class T, class Tuple> constexpr T make_from_tuple(Tuple&& t) {
    return std::__make_from_tuple<T>(std::forward<Tuple>(t),
                                     make_index_sequence<tuple_size<typename remove_reference<Tuple>::type>::value>());
}

template <class... A, class... B, size_t... I, size_t... J>
constexpr tuple<A..., B...> __tuple_cat2(const tuple<A...>& a, const tuple<B...>& b, index_sequence<I...>,
                                         index_sequence<J...>) {
    return tuple<A..., B...>(std::get<I>(a)..., std::get<J>(b)...);
}
inline constexpr tuple<> tuple_cat() { return tuple<>(); }
template <class... A> constexpr tuple<A...> tuple_cat(const tuple<A...>& a) { return a; }
template <class... A, class... B, class... Rest>
constexpr auto tuple_cat(const tuple<A...>& a, const tuple<B...>& b, const Rest&... rest) {
    return std::tuple_cat(std::__tuple_cat2(a, b, index_sequence_for<A...>(), index_sequence_for<B...>()), rest...);
}

template <size_t I, size_t N> struct __tuple_compare {
    template <class A, class B> static constexpr bool equal(const A& a, const B& b) {
        return std::get<I>(a) == std::get<I>(b) && __tuple_compare<I + 1, N>::equal(a, b);
    }
    template <class A, class B> static constexpr bool less(const A& a, const B& b) {
        return std::get<I>(a) < std::get<I>(b) ||
               (!(std::get<I>(b) < std::get<I>(a)) && __tuple_compare<I + 1, N>::less(a, b));
    }
};
template <size_t N> struct __tuple_compare<N, N> {
    template <class A, class B> static constexpr bool equal(const A&, const B&) { return true; }
    template <class A, class B> static constexpr bool less(const A&, const B&) { return false; }
};
template <class... T, class... U> constexpr bool operator==(const tuple<T...>& a, const tuple<U...>& b) {
    return __tuple_compare<0, sizeof...(T)>::equal(a, b);
}
template <class... T, class... U> constexpr bool operator!=(const tuple<T...>& a, const tuple<U...>& b) {
    return !(a == b);
}
template <class... T, class... U> constexpr bool operator<(const tuple<T...>& a, const tuple<U...>& b) {
    return __tuple_compare<0, sizeof...(T)>::less(a, b);
}
template <class... T, class... U> constexpr bool operator>(const tuple<T...>& a, const tuple<U...>& b) { return b < a; }
template <class... T, class... U> constexpr bool operator<=(const tuple<T...>& a, const tuple<U...>& b) {
    return !(b < a);
}
template <class... T, class... U> constexpr bool operator>=(const tuple<T...>& a, const tuple<U...>& b) {
    return !(a < b);
}
template <class... T> void swap(tuple<T...>& a, tuple<T...>& b) { a.swap(b); }
}
`);

    X.addHeader('v4script/functional', [
        ['std', 3, 14, 'reference_wrapper'],
        ['std', 15, 15, 'ref'],
        ['std', 16, 16, 'ref'],
        ['std', 17, 17, 'cref'],
        ['std', 18, 20, 'cref'],
        ['std', 21, 23, 'invoke'],
        ['std', 25, 28, 'bad_function_call'],
        ['std', 29, 33, '__function_base'],
        ['std', 34, 45, '__function_holder'],
        ['std', 46, 46, 'function'],
        ['std', 47, 89, 'function'],
        ['std', 90, 90, 'operator=='],
        ['std', 91, 91, 'operator=='],
        ['std', 92, 92, 'operator!='],
        ['std', 93, 93, 'operator!='],
        ['std', 94, 94, 'swap']
    ], String.raw`
namespace std {
template <class T> class reference_wrapper {
    T* __pointer;
public:
    typedef T type;
    reference_wrapper(T& ref) noexcept : __pointer(std::addressof(ref)) {}
    reference_wrapper(const reference_wrapper&) noexcept = default;
    reference_wrapper& operator=(const reference_wrapper&) noexcept = default;
    operator T&() const noexcept { return *__pointer; }
    T& get() const noexcept { return *__pointer; }
    template <class... A>
    decltype(auto) operator()(A&&... args) const { return (*__pointer)(std::forward<A>(args)...); }
};
template <class T> reference_wrapper<T> ref(T& t) noexcept { return reference_wrapper<T>(t); }
template <class T> reference_wrapper<T> ref(reference_wrapper<T> t) noexcept { return t; }
template <class T> reference_wrapper<const T> cref(const T& t) noexcept { return reference_wrapper<const T>(t); }
template <class T> reference_wrapper<const T> cref(reference_wrapper<T> t) noexcept {
    return reference_wrapper<const T>(t.get());
}
template <class F, class... A> decltype(auto) invoke(F&& f, A&&... args) {
    return std::forward<F>(f)(std::forward<A>(args)...);
}

class bad_function_call : public exception {
public:
    const char* what() const noexcept override { return "bad_function_call"; }
};
template <class R, class... A> struct __function_base {
    virtual ~__function_base() {}
    virtual R __call(A&&... args) = 0;
    virtual __function_base* __clone() const = 0;
};
template <class F, class R, class... A> struct __function_holder : __function_base<R, A...> {
    F __function;
    explicit __function_holder(const F& f) : __function(f) {}
    explicit __function_holder(F&& f) : __function(std::move(f)) {}
    R __call(A&&... args) override {
        if constexpr (is_void<R>::value)
            __function(std::forward<A>(args)...);
        else
            return __function(std::forward<A>(args)...);
    }
    __function_base<R, A...>* __clone() const override { return new __function_holder(__function); }
};
template <class F> class function;
template <class R, class... A> class function<R(A...)> {
    __function_base<R, A...>* __callable;
    template <class F> static bool __empty(const F&) { return false; }
    template <class T> static bool __empty(T* pointer) { return pointer == 0; }
    template <class F> static bool __empty(const function<F>& other) { return !other; }
public:
    typedef R result_type;
    function() noexcept : __callable(0) {}
    function(nullptr_t) noexcept : __callable(0) {}
    function(const function& other) : __callable(other.__callable == 0 ? 0 : other.__callable->__clone()) {}
    function(function&& other) noexcept : __callable(other.__callable) { other.__callable = 0; }
    template <class F, class = typename enable_if<!is_same<typename decay<F>::type, function>::value>::type>
    function(F f) : __callable(0) {
        if (!__empty(f))
            __callable = new __function_holder<F, R, A...>(std::move(f));
    }
    ~function() { delete __callable; }
    function& operator=(const function& other) {
        function(other).swap(*this);
        return *this;
    }
    function& operator=(function&& other) noexcept {
        function(std::move(other)).swap(*this);
        return *this;
    }
    function& operator=(nullptr_t) noexcept {
        delete __callable;
        __callable = 0;
        return *this;
    }
    template <class F, class = typename enable_if<!is_same<typename decay<F>::type, function>::value>::type>
    function& operator=(F&& f) {
        function(std::forward<F>(f)).swap(*this);
        return *this;
    }
    void swap(function& other) noexcept { std::swap(__callable, other.__callable); }
    explicit operator bool() const noexcept { return __callable != 0; }
    R operator()(A... args) const {
        if (__callable == 0)
            throw bad_function_call();
        return __callable->__call(std::forward<A>(args)...);
    }
};
template <class F> bool operator==(const function<F>& f, nullptr_t) noexcept { return !f; }
template <class F> bool operator==(nullptr_t, const function<F>& f) noexcept { return !f; }
template <class F> bool operator!=(const function<F>& f, nullptr_t) noexcept { return (bool)f; }
template <class F> bool operator!=(nullptr_t, const function<F>& f) noexcept { return (bool)f; }
template <class F> void swap(function<F>& a, function<F>& b) noexcept { a.swap(b); }
}
`);

    X.addHeader('v4script/memory', [
        ['std', 3, 8, 'default_delete'],
        ['std', 9, 12, 'default_delete'],
        ['std', 14, 19, '__deleter_holder'],
        ['std', 20, 26, '__deleter_holder'],
        ['std', 28, 86, 'unique_ptr'],
        ['std', 87, 135, 'unique_ptr'],
        ['std', 136, 138, 'make_unique'],
        ['std', 139, 142, 'make_unique'],
        ['std', 143, 145, 'operator=='],
        ['std', 146, 148, 'operator!='],
        ['std', 149, 151, 'operator<'],
        ['std', 152, 152, 'operator=='],
        ['std', 153, 153, 'operator=='],
        ['std', 154, 154, 'operator!='],
        ['std', 155, 155, 'operator!='],
        ['std', 156, 156, 'swap'],
        ['std', 157, 159, 'hash'],
        ['std', 161, 164, 'bad_weak_ptr'],
        ['std', 166, 185, '__shared_count'],
        ['std', 186, 192, '__shared_count_pointer'],
        ['std', 193, 203, '__shared_count_inplace'],
        ['std', 205, 205, 'weak_ptr'],
        ['std', 206, 206, 'enable_shared_from_this'],
        ['std', 207, 325, 'shared_ptr'],
        ['std', 326, 333, 'make_shared'],
        ['std', 334, 336, 'operator=='],
        ['std', 337, 339, 'operator!='],
        ['std', 340, 342, 'operator<'],
        ['std', 343, 343, 'operator=='],
        ['std', 344, 344, 'operator=='],
        ['std', 345, 345, 'operator!='],
        ['std', 346, 346, 'operator!='],
        ['std', 347, 347, 'swap'],
        ['std', 348, 350, 'static_pointer_cast'],
        ['std', 351, 353, 'const_pointer_cast'],
        ['std', 354, 357, 'dynamic_pointer_cast'],
        ['std', 358, 360, 'reinterpret_pointer_cast'],
        ['std', 361, 363, 'get_deleter'],
        ['std', 364, 366, 'hash'],
        ['std', 368, 427, 'weak_ptr'],
        ['std', 428, 428, 'swap'],
        ['std', 430, 442, 'enable_shared_from_this'],
        ['std', 443, 443, 'owner_less'],
        ['std', 444, 446, 'owner_less'],
        ['std', 447, 449, 'owner_less']
    ], String.raw`
namespace std {
template <class T> struct default_delete {
    constexpr default_delete() noexcept = default;
    template <class U, class = typename enable_if<is_convertible<U*, T*>::value>::type>
    default_delete(const default_delete<U>&) noexcept {}
    void operator()(T* p) const { delete p; }
};
template <class T> struct default_delete<T[]> {
    constexpr default_delete() noexcept = default;
    void operator()(T* p) const { delete[] p; }
};
// An empty deleter takes no room (a base), others are a member.
template <class D, bool = __is_empty(D) && !__is_final(D)> struct __deleter_holder : private D {
    __deleter_holder() : D() {}
    template <class E> explicit __deleter_holder(E&& d) : D(std::forward<E>(d)) {}
    D& __deleter() noexcept { return *this; }
    const D& __deleter() const noexcept { return *this; }
};
template <class D> struct __deleter_holder<D, false> {
    D __value;
    __deleter_holder() : __value() {}
    template <class E> explicit __deleter_holder(E&& d) : __value(std::forward<E>(d)) {}
    D& __deleter() noexcept { return __value; }
    const D& __deleter() const noexcept { return __value; }
};

template <class T, class D = default_delete<T>> class unique_ptr : private __deleter_holder<D> {
    T* __pointer;
public:
    typedef T* pointer;
    typedef T element_type;
    typedef D deleter_type;
    constexpr unique_ptr() noexcept : __pointer(0) {}
    constexpr unique_ptr(nullptr_t) noexcept : __pointer(0) {}
    explicit unique_ptr(T* p) noexcept : __pointer(p) {}
    unique_ptr(T* p, const D& d) noexcept : __deleter_holder<D>(d), __pointer(p) {}
    unique_ptr(unique_ptr&& other) noexcept
        : __deleter_holder<D>(std::forward<D>(other.get_deleter())), __pointer(other.release()) {}
    template <class U, class E, class = typename enable_if<is_convertible<U*, T*>::value>::type>
    unique_ptr(unique_ptr<U, E>&& other) noexcept
        : __deleter_holder<D>(std::forward<E>(other.get_deleter())), __pointer(other.release()) {}
    unique_ptr(const unique_ptr&) = delete;
    unique_ptr& operator=(const unique_ptr&) = delete;
    ~unique_ptr() {
        if (__pointer != 0)
            get_deleter()(__pointer);
    }
    unique_ptr& operator=(unique_ptr&& other) noexcept {
        reset(other.release());
        get_deleter() = std::forward<D>(other.get_deleter());
        return *this;
    }
    template <class U, class E, class = typename enable_if<is_convertible<U*, T*>::value>::type>
    unique_ptr& operator=(unique_ptr<U, E>&& other) noexcept {
        reset(other.release());
        get_deleter() = std::forward<E>(other.get_deleter());
        return *this;
    }
    unique_ptr& operator=(nullptr_t) noexcept {
        reset();
        return *this;
    }
    typename add_lvalue_reference<T>::type operator*() const { return *__pointer; }
    T* operator->() const noexcept { return __pointer; }
    T* get() const noexcept { return __pointer; }
    D& get_deleter() noexcept { return this->__deleter(); }
    const D& get_deleter() const noexcept { return this->__deleter(); }
    explicit operator bool() const noexcept { return __pointer != 0; }
    T* release() noexcept {
        T* p = __pointer;
        __pointer = 0;
        return p;
    }
    void reset(T* p = 0) noexcept {
        T* old = __pointer;
        __pointer = p;
        if (old != 0)
            get_deleter()(old);
    }
    void swap(unique_ptr& other) noexcept {
        using std::swap;
        swap(__pointer, other.__pointer);
        swap(get_deleter(), other.get_deleter());
    }
};
template <class T, class D> class unique_ptr<T[], D> : private __deleter_holder<D> {
    T* __pointer;
public:
    typedef T* pointer;
    typedef T element_type;
    typedef D deleter_type;
    constexpr unique_ptr() noexcept : __pointer(0) {}
    constexpr unique_ptr(nullptr_t) noexcept : __pointer(0) {}
    explicit unique_ptr(T* p) noexcept : __pointer(p) {}
    unique_ptr(T* p, const D& d) noexcept : __deleter_holder<D>(d), __pointer(p) {}
    unique_ptr(unique_ptr&& other) noexcept
        : __deleter_holder<D>(std::forward<D>(other.get_deleter())), __pointer(other.release()) {}
    unique_ptr(const unique_ptr&) = delete;
    unique_ptr& operator=(const unique_ptr&) = delete;
    ~unique_ptr() {
        if (__pointer != 0)
            get_deleter()(__pointer);
    }
    unique_ptr& operator=(unique_ptr&& other) noexcept {
        reset(other.release());
        get_deleter() = std::forward<D>(other.get_deleter());
        return *this;
    }
    unique_ptr& operator=(nullptr_t) noexcept {
        reset();
        return *this;
    }
    T& operator[](size_t i) const { return __pointer[i]; }
    T* get() const noexcept { return __pointer; }
    D& get_deleter() noexcept { return this->__deleter(); }
    const D& get_deleter() const noexcept { return this->__deleter(); }
    explicit operator bool() const noexcept { return __pointer != 0; }
    T* release() noexcept {
        T* p = __pointer;
        __pointer = 0;
        return p;
    }
    void reset(T* p = 0) noexcept {
        T* old = __pointer;
        __pointer = p;
        if (old != 0)
            get_deleter()(old);
    }
    void swap(unique_ptr& other) noexcept {
        using std::swap;
        swap(__pointer, other.__pointer);
        swap(get_deleter(), other.get_deleter());
    }
};
template <class T, class... A> typename enable_if<!is_array<T>::value, unique_ptr<T>>::type make_unique(A&&... args) {
    return unique_ptr<T>(new T(std::forward<A>(args)...));
}
template <class T> typename enable_if<is_array<T>::value && extent<T>::value == 0, unique_ptr<T>>::type
make_unique(size_t n) {
    return unique_ptr<T>(new typename remove_extent<T>::type[n]());
}
template <class T, class D, class U, class E> bool operator==(const unique_ptr<T, D>& a, const unique_ptr<U, E>& b) {
    return a.get() == b.get();
}
template <class T, class D, class U, class E> bool operator!=(const unique_ptr<T, D>& a, const unique_ptr<U, E>& b) {
    return a.get() != b.get();
}
template <class T, class D, class U, class E> bool operator<(const unique_ptr<T, D>& a, const unique_ptr<U, E>& b) {
    return a.get() < b.get();
}
template <class T, class D> bool operator==(const unique_ptr<T, D>& a, nullptr_t) noexcept { return !a; }
template <class T, class D> bool operator==(nullptr_t, const unique_ptr<T, D>& a) noexcept { return !a; }
template <class T, class D> bool operator!=(const unique_ptr<T, D>& a, nullptr_t) noexcept { return (bool)a; }
template <class T, class D> bool operator!=(nullptr_t, const unique_ptr<T, D>& a) noexcept { return (bool)a; }
template <class T, class D> void swap(unique_ptr<T, D>& a, unique_ptr<T, D>& b) noexcept { a.swap(b); }
template <class T, class D> struct hash<unique_ptr<T, D>> {
    size_t operator()(const unique_ptr<T, D>& p) const noexcept { return (size_t)p.get(); }
};

class bad_weak_ptr : public exception {
public:
    const char* what() const noexcept override { return "bad_weak_ptr"; }
};
// The control block: the counts, then what owns the object.
struct __shared_count {
    int __shared;
    int __weak;
    __shared_count() noexcept : __shared(1), __weak(1) {}
    virtual ~__shared_count() {}
    virtual void __dispose() noexcept = 0;
    virtual void* __deleter_address() noexcept { return 0; }
    void __add_shared() noexcept { ++__shared; }
    void __add_weak() noexcept { ++__weak; }
    void __release_shared() noexcept {
        if (--__shared == 0) {
            __dispose();
            __release_weak();
        }
    }
    void __release_weak() noexcept {
        if (--__weak == 0)
            delete this;
    }
};
template <class P, class D> struct __shared_count_pointer : __shared_count {
    P __pointer;
    D __deleter;
    __shared_count_pointer(P p, D d) : __pointer(p), __deleter(std::move(d)) {}
    void __dispose() noexcept override { __deleter(__pointer); }
    void* __deleter_address() noexcept override { return &__deleter; }
};
template <class T> struct __shared_count_inplace : __shared_count {
    union {
        char __none;
        T __object;
    };
    template <class... A> explicit __shared_count_inplace(A&&... args) {
        ::new (static_cast<void*>(&__object)) T(std::forward<A>(args)...);
    }
    ~__shared_count_inplace() {}
    void __dispose() noexcept override { __object.~T(); }
};

template <class T> class weak_ptr;
template <class T> class enable_shared_from_this;
template <class T> class shared_ptr {
public:
    typedef typename remove_extent<T>::type element_type;
    typedef weak_ptr<T> weak_type;
    element_type* __pointer;
    __shared_count* __count;

    // A new owner of an object that knows its owners (enable_shared_from_this).
    template <class U> void __enable_weak(const enable_shared_from_this<U>* base) noexcept {
        if (base != 0 && base->__weak_this.expired())
            base->__weak_this = shared_ptr<U>(*this, const_cast<U*>(static_cast<const U*>(base)));
    }
    void __enable_weak(const volatile void*) noexcept {}

    constexpr shared_ptr() noexcept : __pointer(0), __count(0) {}
    constexpr shared_ptr(nullptr_t) noexcept : __pointer(0), __count(0) {}
    template <class U, class = typename enable_if<is_convertible<U*, element_type*>::value>::type>
    explicit shared_ptr(U* p) : __pointer(p), __count(0) {
        try {
            if constexpr (is_array<T>::value)
                __count = new __shared_count_pointer<U*, default_delete<U[]>>(p, default_delete<U[]>());
            else
                __count = new __shared_count_pointer<U*, default_delete<U>>(p, default_delete<U>());
        } catch (...) {
            delete p;
            throw;
        }
        __enable_weak(p);
    }
    template <class U, class D> shared_ptr(U* p, D d) : __pointer(p), __count(0) {
        try {
            __count = new __shared_count_pointer<U*, D>(p, std::move(d));
        } catch (...) {
            d(p);
            throw;
        }
        __enable_weak(p);
    }
    template <class D>
    shared_ptr(nullptr_t, D d)
        : __pointer(0), __count(new __shared_count_pointer<nullptr_t, D>(nullptr, std::move(d))) {}
    template <class U> shared_ptr(const shared_ptr<U>& other, element_type* p) noexcept
        : __pointer(p), __count(other.__count) {
        if (__count != 0)
            __count->__add_shared();
    }
    shared_ptr(const shared_ptr& other) noexcept : __pointer(other.__pointer), __count(other.__count) {
        if (__count != 0)
            __count->__add_shared();
    }
    template <class U, class = typename enable_if<is_convertible<U*, element_type*>::value>::type>
    shared_ptr(const shared_ptr<U>& other) noexcept : __pointer(other.__pointer), __count(other.__count) {
        if (__count != 0)
            __count->__add_shared();
    }
    shared_ptr(shared_ptr&& other) noexcept : __pointer(other.__pointer), __count(other.__count) {
        other.__pointer = 0;
        other.__count = 0;
    }
    template <class U, class = typename enable_if<is_convertible<U*, element_type*>::value>::type>
    shared_ptr(shared_ptr<U>&& other) noexcept : __pointer(other.__pointer), __count(other.__count) {
        other.__pointer = 0;
        other.__count = 0;
    }
    template <class U>
    explicit shared_ptr(const weak_ptr<U>& other) : __pointer(other.__pointer), __count(other.__count) {
        if (__count == 0 || __count->__shared == 0)
            throw bad_weak_ptr();
        __count->__add_shared();
    }
    template <class U, class D, class = typename enable_if<is_convertible<U*, element_type*>::value>::type>
    shared_ptr(unique_ptr<U, D>&& other) : __pointer(other.get()), __count(0) {
        if (__pointer != 0) {
            __count = new __shared_count_pointer<U*, D>(other.get(), std::move(other.get_deleter()));
            other.release();
            __enable_weak(__pointer);
        }
    }
    ~shared_ptr() {
        if (__count != 0)
            __count->__release_shared();
    }
    shared_ptr& operator=(const shared_ptr& other) noexcept {
        shared_ptr(other).swap(*this);
        return *this;
    }
    template <class U> shared_ptr& operator=(const shared_ptr<U>& other) noexcept {
        shared_ptr(other).swap(*this);
        return *this;
    }
    shared_ptr& operator=(shared_ptr&& other) noexcept {
        shared_ptr(std::move(other)).swap(*this);
        return *this;
    }
    template <class U> shared_ptr& operator=(shared_ptr<U>&& other) noexcept {
        shared_ptr(std::move(other)).swap(*this);
        return *this;
    }
    template <class U, class D> shared_ptr& operator=(unique_ptr<U, D>&& other) {
        shared_ptr(std::move(other)).swap(*this);
        return *this;
    }
    void reset() noexcept { shared_ptr().swap(*this); }
    template <class U> void reset(U* p) { shared_ptr(p).swap(*this); }
    template <class U, class D> void reset(U* p, D d) { shared_ptr(p, std::move(d)).swap(*this); }
    void swap(shared_ptr& other) noexcept {
        std::swap(__pointer, other.__pointer);
        std::swap(__count, other.__count);
    }
    element_type* get() const noexcept { return __pointer; }
    typename add_lvalue_reference<element_type>::type operator*() const noexcept { return *__pointer; }
    element_type* operator->() const noexcept { return __pointer; }
    element_type& operator[](ptrdiff_t i) const { return __pointer[i]; }
    long use_count() const noexcept { return __count == 0 ? 0 : __count->__shared; }
    bool unique() const noexcept { return use_count() == 1; }
    explicit operator bool() const noexcept { return __pointer != 0; }
    template <class U> bool owner_before(const shared_ptr<U>& other) const noexcept { return __count < other.__count; }
    template <class U> bool owner_before(const weak_ptr<U>& other) const noexcept { return __count < other.__count; }
};
template <class T, class... A> shared_ptr<T> make_shared(A&&... args) {
    __shared_count_inplace<T>* block = new __shared_count_inplace<T>(std::forward<A>(args)...);
    shared_ptr<T> result;
    result.__pointer = &block->__object;
    result.__count = block;
    result.__enable_weak(result.__pointer);
    return result;
}
template <class T, class U> bool operator==(const shared_ptr<T>& a, const shared_ptr<U>& b) noexcept {
    return a.get() == b.get();
}
template <class T, class U> bool operator!=(const shared_ptr<T>& a, const shared_ptr<U>& b) noexcept {
    return a.get() != b.get();
}
template <class T, class U> bool operator<(const shared_ptr<T>& a, const shared_ptr<U>& b) noexcept {
    return a.get() < b.get();
}
template <class T> bool operator==(const shared_ptr<T>& a, nullptr_t) noexcept { return !a; }
template <class T> bool operator==(nullptr_t, const shared_ptr<T>& a) noexcept { return !a; }
template <class T> bool operator!=(const shared_ptr<T>& a, nullptr_t) noexcept { return (bool)a; }
template <class T> bool operator!=(nullptr_t, const shared_ptr<T>& a) noexcept { return (bool)a; }
template <class T> void swap(shared_ptr<T>& a, shared_ptr<T>& b) noexcept { a.swap(b); }
template <class T, class U> shared_ptr<T> static_pointer_cast(const shared_ptr<U>& p) noexcept {
    return shared_ptr<T>(p, static_cast<T*>(p.get()));
}
template <class T, class U> shared_ptr<T> const_pointer_cast(const shared_ptr<U>& p) noexcept {
    return shared_ptr<T>(p, const_cast<T*>(p.get()));
}
template <class T, class U> shared_ptr<T> dynamic_pointer_cast(const shared_ptr<U>& p) noexcept {
    T* cast = dynamic_cast<T*>(p.get());
    return cast == 0 ? shared_ptr<T>() : shared_ptr<T>(p, cast);
}
template <class T, class U> shared_ptr<T> reinterpret_pointer_cast(const shared_ptr<U>& p) noexcept {
    return shared_ptr<T>(p, reinterpret_cast<T*>(p.get()));
}
template <class D, class T> D* get_deleter(const shared_ptr<T>& p) noexcept {
    return p.__count == 0 ? 0 : static_cast<D*>(p.__count->__deleter_address());
}
template <class T> struct hash<shared_ptr<T>> {
    size_t operator()(const shared_ptr<T>& p) const noexcept { return (size_t)p.get(); }
};

template <class T> class weak_ptr {
public:
    typedef typename remove_extent<T>::type element_type;
    element_type* __pointer;
    __shared_count* __count;

    constexpr weak_ptr() noexcept : __pointer(0), __count(0) {}
    weak_ptr(const weak_ptr& other) noexcept : __pointer(other.__pointer), __count(other.__count) {
        if (__count != 0)
            __count->__add_weak();
    }
    template <class U>
    weak_ptr(const weak_ptr<U>& other) noexcept : __pointer(other.__pointer), __count(other.__count) {
        if (__count != 0)
            __count->__add_weak();
    }
    template <class U>
    weak_ptr(const shared_ptr<U>& other) noexcept : __pointer(other.__pointer), __count(other.__count) {
        if (__count != 0)
            __count->__add_weak();
    }
    weak_ptr(weak_ptr&& other) noexcept : __pointer(other.__pointer), __count(other.__count) {
        other.__pointer = 0;
        other.__count = 0;
    }
    ~weak_ptr() {
        if (__count != 0)
            __count->__release_weak();
    }
    weak_ptr& operator=(const weak_ptr& other) noexcept {
        weak_ptr(other).swap(*this);
        return *this;
    }
    template <class U> weak_ptr& operator=(const shared_ptr<U>& other) noexcept {
        weak_ptr(other).swap(*this);
        return *this;
    }
    weak_ptr& operator=(weak_ptr&& other) noexcept {
        weak_ptr(std::move(other)).swap(*this);
        return *this;
    }
    void reset() noexcept { weak_ptr().swap(*this); }
    void swap(weak_ptr& other) noexcept {
        std::swap(__pointer, other.__pointer);
        std::swap(__count, other.__count);
    }
    long use_count() const noexcept { return __count == 0 ? 0 : __count->__shared; }
    bool expired() const noexcept { return use_count() == 0; }
    shared_ptr<T> lock() const noexcept {
        if (expired())
            return shared_ptr<T>();
        shared_ptr<T> result;
        result.__pointer = __pointer;
        result.__count = __count;
        __count->__add_shared();
        return result;
    }
    template <class U> bool owner_before(const shared_ptr<U>& other) const noexcept { return __count < other.__count; }
    template <class U> bool owner_before(const weak_ptr<U>& other) const noexcept { return __count < other.__count; }
};
template <class T> void swap(weak_ptr<T>& a, weak_ptr<T>& b) noexcept { a.swap(b); }

template <class T> class enable_shared_from_this {
protected:
    constexpr enable_shared_from_this() noexcept {}
    enable_shared_from_this(const enable_shared_from_this&) noexcept {}
    enable_shared_from_this& operator=(const enable_shared_from_this&) noexcept { return *this; }
    ~enable_shared_from_this() {}
public:
    mutable weak_ptr<T> __weak_this;
    shared_ptr<T> shared_from_this() { return shared_ptr<T>(__weak_this); }
    shared_ptr<const T> shared_from_this() const { return shared_ptr<const T>(__weak_this); }
    weak_ptr<T> weak_from_this() noexcept { return __weak_this; }
    weak_ptr<const T> weak_from_this() const noexcept { return __weak_this; }
};
template <class T> struct owner_less;
template <class T> struct owner_less<shared_ptr<T>> {
    bool operator()(const shared_ptr<T>& a, const shared_ptr<T>& b) const noexcept { return a.owner_before(b); }
};
template <class T> struct owner_less<weak_ptr<T>> {
    bool operator()(const weak_ptr<T>& a, const weak_ptr<T>& b) const noexcept { return a.owner_before(b); }
};
}
`);

    X.addHeader('v4script/optional', [
        ['std', 3, 5, 'nullopt_t'],
        ['std', 6, 6, 'nullopt'],
        ['std', 7, 9, 'in_place_t'],
        ['std', 10, 10, 'in_place'],
        ['std', 11, 14, 'bad_optional_access'],
        ['std', 15, 139, 'optional'],
        ['std', 140, 142, 'make_optional'],
        ['std', 143, 145, 'make_optional'],
        ['std', 146, 148, 'operator=='],
        ['std', 149, 151, 'operator!='],
        ['std', 152, 154, 'operator<'],
        ['std', 155, 155, 'operator>'],
        ['std', 156, 156, 'operator<='],
        ['std', 157, 157, 'operator>='],
        ['std', 158, 158, 'operator=='],
        ['std', 159, 159, 'operator=='],
        ['std', 160, 160, 'operator!='],
        ['std', 161, 161, 'operator!='],
        ['std', 162, 162, 'operator=='],
        ['std', 163, 163, 'operator!='],
        ['std', 164, 164, 'operator<'],
        ['std', 165, 165, 'swap'],
        ['std', 166, 168, 'hash']
    ], String.raw`
namespace std {
struct nullopt_t {
    explicit constexpr nullopt_t(int) {}
};
inline constexpr nullopt_t nullopt(0);
struct in_place_t {
    explicit in_place_t() = default;
};
inline constexpr in_place_t in_place = in_place_t();
class bad_optional_access : public exception {
public:
    const char* what() const noexcept override { return "bad optional access"; }
};
template <class T> class optional {
    union {
        char __none;
        T __value;
    };
    bool __engaged;

    template <class... A> void __construct(A&&... args) {
        ::new (static_cast<void*>(&__value)) T(std::forward<A>(args)...);
        __engaged = true;
    }
public:
    typedef T value_type;
    constexpr optional() noexcept : __none(0), __engaged(false) {}
    constexpr optional(nullopt_t) noexcept : __none(0), __engaged(false) {}
    optional(const optional& other) : __none(0), __engaged(false) {
        if (other.__engaged)
            __construct(other.__value);
    }
    optional(optional&& other) : __none(0), __engaged(false) {
        if (other.__engaged)
            __construct(std::move(other.__value));
    }
    template <class... A> constexpr explicit optional(in_place_t, A&&... args) : __none(0), __engaged(false) {
        __construct(std::forward<A>(args)...);
    }
    template <class U = T, class = typename enable_if<is_constructible<T, U&&>::value &&
                                                      !is_same<typename decay<U>::type, optional>::value &&
                                                      !is_same<typename decay<U>::type, in_place_t>::value>::type>
    constexpr optional(U&& value) : __none(0), __engaged(false) {
        __construct(std::forward<U>(value));
    }
    template <class U, class = typename enable_if<!is_same<T, U>::value>::type>
    optional(const optional<U>& other) : __none(0), __engaged(false) {
        if (other)
            __construct(*other);
    }
    ~optional() { reset(); }
    optional& operator=(nullopt_t) noexcept {
        reset();
        return *this;
    }
    optional& operator=(const optional& other) {
        if (other.__engaged) {
            if (__engaged)
                __value = other.__value;
            else
                __construct(other.__value);
        } else {
            reset();
        }
        return *this;
    }
    optional& operator=(optional&& other) {
        if (other.__engaged) {
            if (__engaged)
                __value = std::move(other.__value);
            else
                __construct(std::move(other.__value));
        } else {
            reset();
        }
        return *this;
    }
    template <class U = T, class = typename enable_if<!is_same<typename decay<U>::type, optional>::value &&
                                                      is_constructible<T, U&&>::value>::type>
    optional& operator=(U&& value) {
        if (__engaged)
            __value = std::forward<U>(value);
        else
            __construct(std::forward<U>(value));
        return *this;
    }
    template <class... A> T& emplace(A&&... args) {
        reset();
        __construct(std::forward<A>(args)...);
        return __value;
    }
    void reset() noexcept {
        if (__engaged) {
            __value.~T();
            __engaged = false;
        }
    }
    void swap(optional& other) {
        if (__engaged && other.__engaged) {
            using std::swap;
            swap(__value, other.__value);
        } else if (__engaged) {
            other.__construct(std::move(__value));
            reset();
        } else if (other.__engaged) {
            __construct(std::move(other.__value));
            other.reset();
        }
    }
    constexpr bool has_value() const noexcept { return __engaged; }
    constexpr explicit operator bool() const noexcept { return __engaged; }
    constexpr T& operator*() & noexcept { return __value; }
    constexpr const T& operator*() const& noexcept { return __value; }
    constexpr T&& operator*() && noexcept { return std::move(__value); }
    constexpr T* operator->() noexcept { return &__value; }
    constexpr const T* operator->() const noexcept { return &__value; }
    constexpr T& value() & {
        if (!__engaged)
            throw bad_optional_access();
        return __value;
    }
    constexpr const T& value() const& {
        if (!__engaged)
            throw bad_optional_access();
        return __value;
    }
    constexpr T&& value() && {
        if (!__engaged)
            throw bad_optional_access();
        return std::move(__value);
    }
    template <class U> constexpr T value_or(U&& fallback) const& {
        return __engaged ? __value : static_cast<T>(std::forward<U>(fallback));
    }
    template <class U> constexpr T value_or(U&& fallback) && {
        return __engaged ? std::move(__value) : static_cast<T>(std::forward<U>(fallback));
    }
};
template <class T> constexpr optional<typename decay<T>::type> make_optional(T&& value) {
    return optional<typename decay<T>::type>(std::forward<T>(value));
}
template <class T, class... A> constexpr optional<T> make_optional(A&&... args) {
    return optional<T>(in_place, std::forward<A>(args)...);
}
template <class T, class U> constexpr bool operator==(const optional<T>& a, const optional<U>& b) {
    return bool(a) == bool(b) && (!a || *a == *b);
}
template <class T, class U> constexpr bool operator!=(const optional<T>& a, const optional<U>& b) {
    return !(a == b);
}
template <class T, class U> constexpr bool operator<(const optional<T>& a, const optional<U>& b) {
    return bool(b) && (!a || *a < *b);
}
template <class T, class U> constexpr bool operator>(const optional<T>& a, const optional<U>& b) { return b < a; }
template <class T, class U> constexpr bool operator<=(const optional<T>& a, const optional<U>& b) { return !(b < a); }
template <class T, class U> constexpr bool operator>=(const optional<T>& a, const optional<U>& b) { return !(a < b); }
template <class T> constexpr bool operator==(const optional<T>& a, nullopt_t) noexcept { return !a; }
template <class T> constexpr bool operator==(nullopt_t, const optional<T>& a) noexcept { return !a; }
template <class T> constexpr bool operator!=(const optional<T>& a, nullopt_t) noexcept { return bool(a); }
template <class T> constexpr bool operator!=(nullopt_t, const optional<T>& a) noexcept { return bool(a); }
template <class T, class U> constexpr bool operator==(const optional<T>& a, const U& b) { return bool(a) && *a == b; }
template <class T, class U> constexpr bool operator!=(const optional<T>& a, const U& b) { return !bool(a) || *a != b; }
template <class T, class U> constexpr bool operator<(const optional<T>& a, const U& b) { return !bool(a) || *a < b; }
template <class T> void swap(optional<T>& a, optional<T>& b) { a.swap(b); }
template <class T> struct hash<optional<T>> {
    size_t operator()(const optional<T>& o) const { return o ? hash<typename remove_const<T>::type>()(*o) : 0; }
};
}
`);
})(globalThis);
