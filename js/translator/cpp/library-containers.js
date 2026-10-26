// C++ library: the sequence containers - <vector>, <array>, <deque>, <list>,
// <forward_list>, <stack>, <queue> - and the insert iterators.
// vector grows as libstdc++ does (capacity() and the order of copies and
// moves match); its iterators are pointers.
// The tables of declarations are written by tools/build-cpp-library.mjs.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    if (X.headers['v4script/insert-iterators'])
        return;

    X.addHeader('v4script/insert-iterators', [
        ['std', 3, 25, 'back_insert_iterator'],
        ['std', 26, 26, 'back_inserter'],
        ['std', 27, 49, 'front_insert_iterator'],
        ['std', 50, 50, 'front_inserter'],
        ['std', 51, 76, 'insert_iterator'],
        ['std', 77, 77, 'inserter'],
        ['std', 80, 81, '__relocate_by_move'],
        ['std', 82, 89, '__relocate'],
        ['std', 90, 93, '__destroy'],
        ['std', 94, 98, '__uninitialized_copy']
    ], String.raw`
namespace std {
template <class C> class back_insert_iterator {
protected:
    C* container;
public:
    typedef output_iterator_tag iterator_category;
    typedef void value_type;
    typedef ptrdiff_t difference_type;
    typedef void pointer;
    typedef void reference;
    typedef C container_type;
    explicit back_insert_iterator(C& c) : container(&c) {}
    back_insert_iterator& operator=(const typename C::value_type& value) {
        container->push_back(value);
        return *this;
    }
    back_insert_iterator& operator=(typename C::value_type&& value) {
        container->push_back(std::move(value));
        return *this;
    }
    back_insert_iterator& operator*() { return *this; }
    back_insert_iterator& operator++() { return *this; }
    back_insert_iterator operator++(int) { return *this; }
};
template <class C> back_insert_iterator<C> back_inserter(C& c) { return back_insert_iterator<C>(c); }
template <class C> class front_insert_iterator {
protected:
    C* container;
public:
    typedef output_iterator_tag iterator_category;
    typedef void value_type;
    typedef ptrdiff_t difference_type;
    typedef void pointer;
    typedef void reference;
    typedef C container_type;
    explicit front_insert_iterator(C& c) : container(&c) {}
    front_insert_iterator& operator=(const typename C::value_type& value) {
        container->push_front(value);
        return *this;
    }
    front_insert_iterator& operator=(typename C::value_type&& value) {
        container->push_front(std::move(value));
        return *this;
    }
    front_insert_iterator& operator*() { return *this; }
    front_insert_iterator& operator++() { return *this; }
    front_insert_iterator operator++(int) { return *this; }
};
template <class C> front_insert_iterator<C> front_inserter(C& c) { return front_insert_iterator<C>(c); }
template <class C> class insert_iterator {
protected:
    C* container;
    typename C::iterator iter;
public:
    typedef output_iterator_tag iterator_category;
    typedef void value_type;
    typedef ptrdiff_t difference_type;
    typedef void pointer;
    typedef void reference;
    typedef C container_type;
    insert_iterator(C& c, typename C::iterator it) : container(&c), iter(it) {}
    insert_iterator& operator=(const typename C::value_type& value) {
        iter = container->insert(iter, value);
        ++iter;
        return *this;
    }
    insert_iterator& operator=(typename C::value_type&& value) {
        iter = container->insert(iter, std::move(value));
        ++iter;
        return *this;
    }
    insert_iterator& operator*() { return *this; }
    insert_iterator& operator++() { return *this; }
    insert_iterator& operator++(int) { return *this; }
};
template <class C> insert_iterator<C> inserter(C& c, typename C::iterator it) { return insert_iterator<C>(c, it); }

// Relocation moves when the move cannot throw (or there is no copy).
template <class T> struct __relocate_by_move
    : bool_constant<is_nothrow_move_constructible<T>::value || !is_copy_constructible<T>::value> {};
template <class T> void __relocate(T* target, T* first, T* last) {
    for (; first != last; ++first, ++target) {
        if constexpr (__relocate_by_move<T>::value)
            ::new (static_cast<void*>(target)) T(std::move(*first));
        else
            ::new (static_cast<void*>(target)) T(*first);
    }
}
template <class T> void __destroy(T* first, T* last) {
    for (; first != last; ++first)
        first->~T();
}
template <class I, class T> T* __uninitialized_copy(I first, I last, T* target) {
    for (; first != last; ++first, ++target)
        ::new (static_cast<void*>(target)) T(*first);
    return target;
}
}
`);

    X.addHeader('v4script/vector', [
        ['std', 3, 416, 'vector'],
        ['std', 417, 417, 'vector'],
        ['std', 418, 420, 'operator=='],
        ['std', 421, 421, 'operator!='],
        ['std', 422, 424, 'operator<'],
        ['std', 425, 425, 'operator>'],
        ['std', 426, 426, 'operator<='],
        ['std', 427, 427, 'operator>='],
        ['std', 428, 428, 'swap']
    ], String.raw`
namespace std {
template <class T, class A = allocator<T>> class vector {
    T* __begin;
    T* __end;
    T* __end_of_storage;

    static T* __new(size_t n) { return n == 0 ? 0 : static_cast<T*>(__allocate(n * sizeof(T))); }
    // The capacity after adding n elements: libstdc++ doubles.
    size_t __grow(size_t n, const char* where) const {
        size_t size = __end - __begin;
        if (max_size() - size < n)
            throw length_error(where);
        size_t length = size + (size > n ? size : n);
        return length < size || length > max_size() ? max_size() : length;
    }
    void __release() {
        __destroy(__begin, __end);
        __deallocate(__begin);
    }
    void __adopt(T* storage, size_t size, size_t capacity) {
        __release();
        __begin = storage;
        __end = storage + size;
        __end_of_storage = storage + capacity;
    }
    template <class I> void __init_range(I first, I last, input_iterator_tag) {
        for (; first != last; ++first)
            emplace_back(*first);
    }
    template <class I> void __init_range(I first, I last, forward_iterator_tag) {
        size_t n = std::distance(first, last);
        __begin = __new(n);
        __end_of_storage = __begin + n;
        __end = __uninitialized_copy(first, last, __begin);
    }
    // Moves [pos, end) n places to the right over raw memory past end.
    void __open(T* pos, size_t n) {
        T* old_end = __end;
        size_t after = old_end - pos;
        if (after > n) {
            for (T* it = old_end - n; it != old_end; ++it, ++__end)
                ::new (static_cast<void*>(__end)) T(std::move(*it));
            std::move_backward(pos, old_end - n, old_end);
        } else {
            for (T* it = pos; it != old_end; ++it)
                ::new (static_cast<void*>(it + n)) T(std::move(*it));
            __end = old_end + n;
        }
    }

public:
    typedef T value_type;
    typedef A allocator_type;
    typedef size_t size_type;
    typedef ptrdiff_t difference_type;
    typedef T& reference;
    typedef const T& const_reference;
    typedef T* pointer;
    typedef const T* const_pointer;
    typedef T* iterator;
    typedef const T* const_iterator;
    typedef std::reverse_iterator<iterator> reverse_iterator;
    typedef std::reverse_iterator<const_iterator> const_reverse_iterator;

    vector() noexcept : __begin(0), __end(0), __end_of_storage(0) {}
    explicit vector(const A&) noexcept : __begin(0), __end(0), __end_of_storage(0) {}
    explicit vector(size_t n, const A& = A()) : __begin(__new(n)), __end(__begin), __end_of_storage(__begin + n) {
        for (; n > 0; --n, ++__end)
            ::new (static_cast<void*>(__end)) T();
    }
    vector(size_t n, const T& value, const A& = A())
        : __begin(__new(n)), __end(__begin), __end_of_storage(__begin + n) {
        for (; n > 0; --n, ++__end)
            ::new (static_cast<void*>(__end)) T(value);
    }
    template <class I, class = typename enable_if<!is_integral<I>::value>::type>
    vector(I first, I last, const A& = A()) : __begin(0), __end(0), __end_of_storage(0) {
        __init_range(first, last, typename iterator_traits<I>::iterator_category());
    }
    vector(const vector& other)
        : __begin(__new(other.size())), __end(__begin), __end_of_storage(__begin + other.size()) {
        __end = __uninitialized_copy(other.__begin, other.__end, __begin);
    }
    vector(const vector& other, const A&) : vector(other) {}
    vector(vector&& other) noexcept
        : __begin(other.__begin), __end(other.__end), __end_of_storage(other.__end_of_storage) {
        other.__begin = other.__end = other.__end_of_storage = 0;
    }
    vector(vector&& other, const A&) noexcept : vector(std::move(other)) {}
    vector(initializer_list<T> list, const A& = A())
        : __begin(__new(list.size())), __end(__begin), __end_of_storage(__begin + list.size()) {
        __end = __uninitialized_copy(list.begin(), list.end(), __begin);
    }
    ~vector() { __release(); }

    vector& operator=(const vector& other) {
        if (&other != this)
            assign(other.__begin, other.__end);
        return *this;
    }
    vector& operator=(vector&& other) noexcept {
        if (&other != this) {
            __release();
            __begin = other.__begin;
            __end = other.__end;
            __end_of_storage = other.__end_of_storage;
            other.__begin = other.__end = other.__end_of_storage = 0;
        }
        return *this;
    }
    vector& operator=(initializer_list<T> list) {
        assign(list.begin(), list.end());
        return *this;
    }
    void assign(size_t n, const T& value) {
        if (n > capacity()) {
            vector tmp(n, value);
            swap(tmp);
        } else if (n > size()) {
            std::fill(__begin, __end, value);
            for (size_t extra = n - size(); extra > 0; --extra, ++__end)
                ::new (static_cast<void*>(__end)) T(value);
        } else {
            std::fill_n(__begin, n, value);
            __destroy(__begin + n, __end);
            __end = __begin + n;
        }
    }
    template <class I, class = typename enable_if<!is_integral<I>::value>::type> void assign(I first, I last) {
        __assign_range(first, last, typename iterator_traits<I>::iterator_category());
    }
    template <class I> void __assign_range(I first, I last, input_iterator_tag) {
        clear();
        for (; first != last; ++first)
            emplace_back(*first);
    }
    template <class I> void __assign_range(I first, I last, forward_iterator_tag) {
        size_t n = std::distance(first, last);
        if (n > capacity()) {
            T* storage = __new(n);
            __uninitialized_copy(first, last, storage);
            __adopt(storage, n, n);
        } else if (n <= size()) {
            T* new_end = std::copy(first, last, __begin);
            __destroy(new_end, __end);
            __end = new_end;
        } else {
            I middle = first;
            std::advance(middle, size());
            std::copy(first, middle, __begin);
            __end = __uninitialized_copy(middle, last, __end);
        }
    }
    void assign(initializer_list<T> list) { assign(list.begin(), list.end()); }
    allocator_type get_allocator() const noexcept { return A(); }

    iterator begin() noexcept { return __begin; }
    const_iterator begin() const noexcept { return __begin; }
    iterator end() noexcept { return __end; }
    const_iterator end() const noexcept { return __end; }
    const_iterator cbegin() const noexcept { return __begin; }
    const_iterator cend() const noexcept { return __end; }
    reverse_iterator rbegin() noexcept { return reverse_iterator(__end); }
    const_reverse_iterator rbegin() const noexcept { return const_reverse_iterator(__end); }
    reverse_iterator rend() noexcept { return reverse_iterator(__begin); }
    const_reverse_iterator rend() const noexcept { return const_reverse_iterator(__begin); }
    const_reverse_iterator crbegin() const noexcept { return const_reverse_iterator(__end); }
    const_reverse_iterator crend() const noexcept { return const_reverse_iterator(__begin); }

    size_t size() const noexcept { return __end - __begin; }
    size_t max_size() const noexcept { return 9223372036854775807UL / sizeof(T); }
    size_t capacity() const noexcept { return __end_of_storage - __begin; }
    bool empty() const noexcept { return __begin == __end; }
    void reserve(size_t n) {
        if (n > max_size())
            throw length_error("vector::reserve");
        if (n <= capacity())
            return;
        T* storage = __new(n);
        size_t count = size();
        __relocate(storage, __begin, __end);
        __adopt(storage, count, n);
    }
    void shrink_to_fit() {
        if (capacity() == size())
            return;
        size_t count = size();
        T* storage = __new(count);
        __relocate(storage, __begin, __end);
        __adopt(storage, count, count);
    }
    void resize(size_t n) {
        if (n < size()) {
            __destroy(__begin + n, __end);
            __end = __begin + n;
            return;
        }
        size_t extra = n - size();
        if (extra == 0)
            return;
        if (extra > size_t(__end_of_storage - __end)) {
            size_t length = __grow(extra, "vector::_M_default_append");
            size_t count = size();
            T* storage = __new(length);
            for (size_t index = 0; index < extra; ++index)
                ::new (static_cast<void*>(storage + count + index)) T();
            __relocate(storage, __begin, __end);
            __adopt(storage, n, length);
            return;
        }
        for (; extra > 0; --extra, ++__end)
            ::new (static_cast<void*>(__end)) T();
    }
    void resize(size_t n, const T& value) {
        if (n < size()) {
            __destroy(__begin + n, __end);
            __end = __begin + n;
            return;
        }
        insert(__end, n - size(), value);
    }

    T& operator[](size_t i) noexcept { return __begin[i]; }
    const T& operator[](size_t i) const noexcept { return __begin[i]; }
    void __range_check(size_t i) const {
        if (i >= size()) {
            char text[128];
            snprintf(text, sizeof text, "vector::_M_range_check: __n (which is %zu) >= this->size() (which is %zu)",
                     i, size());
            throw out_of_range(text);
        }
    }
    T& at(size_t i) {
        __range_check(i);
        return __begin[i];
    }
    const T& at(size_t i) const {
        __range_check(i);
        return __begin[i];
    }
    T& front() noexcept { return *__begin; }
    const T& front() const noexcept { return *__begin; }
    T& back() noexcept { return *(__end - 1); }
    const T& back() const noexcept { return *(__end - 1); }
    T* data() noexcept { return __begin; }
    const T* data() const noexcept { return __begin; }

    template <class... Args> T& emplace_back(Args&&... args) {
        if (__end != __end_of_storage) {
            ::new (static_cast<void*>(__end)) T(std::forward<Args>(args)...);
            ++__end;
        } else {
            __realloc_insert(__end, std::forward<Args>(args)...);
        }
        return *(__end - 1);
    }
    void push_back(const T& value) {
        if (__end != __end_of_storage) {
            ::new (static_cast<void*>(__end)) T(value);
            ++__end;
        } else {
            __realloc_insert(__end, value);
        }
    }
    void push_back(T&& value) { emplace_back(std::move(value)); }
    void pop_back() noexcept {
        --__end;
        __end->~T();
    }
    // The new element first, then the old ones around it (libstdc++ order).
    template <class... Args> T* __realloc_insert(T* pos, Args&&... args) {
        size_t length = __grow(1, "vector::_M_realloc_insert");
        size_t before = pos - __begin;
        size_t count = size();
        T* storage = __new(length);
        ::new (static_cast<void*>(storage + before)) T(std::forward<Args>(args)...);
        __relocate(storage, __begin, pos);
        __relocate(storage + before + 1, pos, __end);
        __adopt(storage, count + 1, length);
        return storage + before;
    }
    template <class... Args> iterator emplace(const_iterator position, Args&&... args) {
        T* pos = const_cast<T*>(position);
        if (__end == __end_of_storage)
            return __realloc_insert(pos, std::forward<Args>(args)...);
        if (pos == __end) {
            ::new (static_cast<void*>(__end)) T(std::forward<Args>(args)...);
            ++__end;
            return pos;
        }
        T value(std::forward<Args>(args)...);
        ::new (static_cast<void*>(__end)) T(std::move(*(__end - 1)));
        ++__end;
        std::move_backward(pos, __end - 2, __end - 1);
        *pos = std::move(value);
        return pos;
    }
    iterator insert(const_iterator position, const T& value) {
        T* pos = const_cast<T*>(position);
        if (__end == __end_of_storage)
            return __realloc_insert(pos, value);
        if (pos == __end) {
            ::new (static_cast<void*>(__end)) T(value);
            ++__end;
            return pos;
        }
        T copy(value);
        ::new (static_cast<void*>(__end)) T(std::move(*(__end - 1)));
        ++__end;
        std::move_backward(pos, __end - 2, __end - 1);
        *pos = std::move(copy);
        return pos;
    }
    iterator insert(const_iterator position, T&& value) { return emplace(position, std::move(value)); }
    iterator insert(const_iterator position, size_t n, const T& value) {
        T* pos = const_cast<T*>(position);
        size_t offset = pos - __begin;
        if (n == 0)
            return pos;
        if (n <= size_t(__end_of_storage - __end)) {
            T copy(value);
            T* old_end = __end;
            size_t after = old_end - pos;
            __open(pos, n);
            if (after >= n) {
                std::fill(pos, pos + n, copy);
            } else {
                std::fill(pos, old_end, copy);
                for (T* it = old_end; it != pos + n; ++it)
                    ::new (static_cast<void*>(it)) T(copy);
            }
            return __begin + offset;
        }
        size_t length = __grow(n, "vector::_M_fill_insert");
        size_t count = size();
        T* storage = __new(length);
        for (size_t index = 0; index < n; ++index)
            ::new (static_cast<void*>(storage + offset + index)) T(value);
        __relocate(storage, __begin, pos);
        __relocate(storage + offset + n, pos, __end);
        __adopt(storage, count + n, length);
        return __begin + offset;
    }
    template <class I, class = typename enable_if<!is_integral<I>::value>::type>
    iterator insert(const_iterator position, I first, I last) {
        size_t offset = position - __begin;
        __insert_range(const_cast<T*>(position), first, last, typename iterator_traits<I>::iterator_category());
        return __begin + offset;
    }
    template <class I> void __insert_range(T* pos, I first, I last, input_iterator_tag) {
        for (; first != last; ++first, ++pos)
            pos = insert(pos, *first);
    }
    template <class I> void __insert_range(T* pos, I first, I last, forward_iterator_tag) {
        size_t n = std::distance(first, last);
        if (n == 0)
            return;
        if (n <= size_t(__end_of_storage - __end)) {
            T* old_end = __end;
            size_t after = old_end - pos;
            __open(pos, n);
            if (after >= n) {
                std::copy(first, last, pos);
            } else {
                I middle = first;
                std::advance(middle, after);
                std::copy(first, middle, pos);
                __uninitialized_copy(middle, last, old_end);
            }
            return;
        }
        size_t length = __grow(n, "vector::_M_range_insert");
        size_t offset = pos - __begin;
        size_t count = size();
        T* storage = __new(length);
        __relocate(storage, __begin, pos);
        __uninitialized_copy(first, last, storage + offset);
        __relocate(storage + offset + n, pos, __end);
        __adopt(storage, count + n, length);
    }
    iterator insert(const_iterator position, initializer_list<T> list) {
        return insert(position, list.begin(), list.end());
    }
    iterator erase(const_iterator position) {
        T* pos = const_cast<T*>(position);
        if (pos + 1 != __end)
            std::move(pos + 1, __end, pos);
        pop_back();
        return pos;
    }
    iterator erase(const_iterator first, const_iterator last) {
        T* from = const_cast<T*>(first);
        T* to = const_cast<T*>(last);
        if (from != to) {
            T* new_end = std::move(to, __end, from);
            __destroy(new_end, __end);
            __end = new_end;
        }
        return from;
    }
    void clear() noexcept {
        __destroy(__begin, __end);
        __end = __begin;
    }
    void swap(vector& other) noexcept {
        std::swap(__begin, other.__begin);
        std::swap(__end, other.__end);
        std::swap(__end_of_storage, other.__end_of_storage);
    }
    // vector<bool>::flip (vector<bool> is not a specialization here).
    void flip() noexcept {
        for (T* p = __begin; p != __end; ++p)
            *p = !*p;
    }
};
template <class I> vector(I, I) -> vector<typename iterator_traits<I>::value_type>;
template <class T, class A> bool operator==(const vector<T, A>& a, const vector<T, A>& b) {
    return a.size() == b.size() && std::equal(a.begin(), a.end(), b.begin());
}
template <class T, class A> bool operator!=(const vector<T, A>& a, const vector<T, A>& b) { return !(a == b); }
template <class T, class A> bool operator<(const vector<T, A>& a, const vector<T, A>& b) {
    return std::lexicographical_compare(a.begin(), a.end(), b.begin(), b.end());
}
template <class T, class A> bool operator>(const vector<T, A>& a, const vector<T, A>& b) { return b < a; }
template <class T, class A> bool operator<=(const vector<T, A>& a, const vector<T, A>& b) { return !(b < a); }
template <class T, class A> bool operator>=(const vector<T, A>& a, const vector<T, A>& b) { return !(a < b); }
template <class T, class A> void swap(vector<T, A>& a, vector<T, A>& b) noexcept { a.swap(b); }
}
`);

    X.addHeader('v4script/array', [
        ['std', 3, 58, 'array'],
        ['std', 59, 59, 'array'],
        ['std', 60, 62, 'operator=='],
        ['std', 63, 63, 'operator!='],
        ['std', 64, 66, 'operator<'],
        ['std', 67, 67, 'operator>'],
        ['std', 68, 68, 'operator<='],
        ['std', 69, 69, 'operator>='],
        ['std', 70, 70, 'swap'],
        ['std', 71, 71, 'tuple_size'],
        ['std', 72, 72, 'tuple_element'],
        ['std', 73, 73, 'get'],
        ['std', 74, 74, 'get'],
        ['std', 75, 75, 'get']
    ], String.raw`
namespace std {
template <class T, size_t N> struct array {
    T __elements[N == 0 ? 1 : N];

    typedef T value_type;
    typedef size_t size_type;
    typedef ptrdiff_t difference_type;
    typedef T& reference;
    typedef const T& const_reference;
    typedef T* pointer;
    typedef const T* const_pointer;
    typedef T* iterator;
    typedef const T* const_iterator;
    typedef std::reverse_iterator<iterator> reverse_iterator;
    typedef std::reverse_iterator<const_iterator> const_reverse_iterator;

    void fill(const T& value) { std::fill_n(__elements, N, value); }
    void swap(array& other) { std::swap_ranges(__elements, __elements + N, other.__elements); }
    iterator begin() noexcept { return __elements; }
    const_iterator begin() const noexcept { return __elements; }
    iterator end() noexcept { return __elements + N; }
    const_iterator end() const noexcept { return __elements + N; }
    const_iterator cbegin() const noexcept { return __elements; }
    const_iterator cend() const noexcept { return __elements + N; }
    reverse_iterator rbegin() noexcept { return reverse_iterator(end()); }
    const_reverse_iterator rbegin() const noexcept { return const_reverse_iterator(end()); }
    reverse_iterator rend() noexcept { return reverse_iterator(begin()); }
    const_reverse_iterator rend() const noexcept { return const_reverse_iterator(begin()); }
    const_reverse_iterator crbegin() const noexcept { return const_reverse_iterator(end()); }
    const_reverse_iterator crend() const noexcept { return const_reverse_iterator(begin()); }
    constexpr size_t size() const noexcept { return N; }
    constexpr size_t max_size() const noexcept { return N; }
    constexpr bool empty() const noexcept { return N == 0; }
    T& operator[](size_t i) noexcept { return __elements[i]; }
    const T& operator[](size_t i) const noexcept { return __elements[i]; }
    void __range_check(size_t i) const {
        if (i >= N) {
            char text[128];
            snprintf(text, sizeof text, "array::at: __n (which is %zu) >= _Nm (which is %zu)", i, N);
            throw out_of_range(text);
        }
    }
    T& at(size_t i) {
        __range_check(i);
        return __elements[i];
    }
    const T& at(size_t i) const {
        __range_check(i);
        return __elements[i];
    }
    T& front() noexcept { return __elements[0]; }
    const T& front() const noexcept { return __elements[0]; }
    T& back() noexcept { return __elements[N - 1]; }
    const T& back() const noexcept { return __elements[N - 1]; }
    T* data() noexcept { return __elements; }
    const T* data() const noexcept { return __elements; }
};
template <class T, class... U> array(T, U...) -> array<T, 1 + sizeof...(U)>;
template <class T, size_t N> bool operator==(const array<T, N>& a, const array<T, N>& b) {
    return std::equal(a.begin(), a.end(), b.begin());
}
template <class T, size_t N> bool operator!=(const array<T, N>& a, const array<T, N>& b) { return !(a == b); }
template <class T, size_t N> bool operator<(const array<T, N>& a, const array<T, N>& b) {
    return std::lexicographical_compare(a.begin(), a.end(), b.begin(), b.end());
}
template <class T, size_t N> bool operator>(const array<T, N>& a, const array<T, N>& b) { return b < a; }
template <class T, size_t N> bool operator<=(const array<T, N>& a, const array<T, N>& b) { return !(b < a); }
template <class T, size_t N> bool operator>=(const array<T, N>& a, const array<T, N>& b) { return !(a < b); }
template <class T, size_t N> void swap(array<T, N>& a, array<T, N>& b) { a.swap(b); }
template <class T, size_t N> struct tuple_size<array<T, N>> : integral_constant<size_t, N> {};
template <size_t I, class T, size_t N> struct tuple_element<I, array<T, N>> { typedef T type; };
template <size_t I, class T, size_t N> T& get(array<T, N>& a) noexcept { return a.__elements[I]; }
template <size_t I, class T, size_t N> const T& get(const array<T, N>& a) noexcept { return a.__elements[I]; }
template <size_t I, class T, size_t N> T&& get(array<T, N>&& a) noexcept { return std::move(a.__elements[I]); }
}
`);

    X.addHeader('v4script/deque', [
        ['std', 7, 7, '__deque_node'],
        ['std', 9, 99, '__deque_iterator'],
        ['std', 100, 102, 'operator+'],
        ['std', 104, 433, 'deque'],
        ['std', 434, 434, 'deque'],
        ['std', 435, 437, 'operator=='],
        ['std', 438, 438, 'operator!='],
        ['std', 439, 441, 'operator<'],
        ['std', 442, 442, 'operator>'],
        ['std', 443, 443, 'operator<='],
        ['std', 444, 444, 'operator>='],
        ['std', 445, 445, 'swap']
    ], String.raw`
namespace std {
// Blocks of 512 bytes (at least one element) as in libstdc++; a map of
// block pointers that is recentred or grown when an end runs out.
// The nodes of an iterator (T**) and a const_iterator (const T**) as one
// type: their difference and order.
template <class T> inline const void* const* __deque_node(T** node) noexcept { return (const void* const*)node; }

template <class T> struct __deque_iterator {
    typedef random_access_iterator_tag iterator_category;
    typedef T value_type;
    typedef ptrdiff_t difference_type;
    typedef T* pointer;
    typedef T& reference;
    static constexpr ptrdiff_t __block = sizeof(T) < 512 ? ptrdiff_t(512 / sizeof(T)) : ptrdiff_t(1);
    T* __current;
    T* __first;
    T* __last;
    T** __node;

    __deque_iterator() noexcept : __current(0), __first(0), __last(0), __node(0) {}
    __deque_iterator(T* current, T** node) noexcept
        : __current(current), __first(*node), __last(*node + __block), __node(node) {}
    template <class U, class = typename enable_if<is_same<const U, T>::value>::type>
    __deque_iterator(const __deque_iterator<U>& other) noexcept
        : __current(other.__current), __first(other.__first), __last(other.__last),
          __node(const_cast<T**>(other.__node)) {}
    void __set_node(T** node) noexcept {
        __node = node;
        __first = *node;
        __last = __first + __block;
    }
    T& operator*() const noexcept { return *__current; }
    T* operator->() const noexcept { return __current; }
    __deque_iterator& operator++() noexcept {
        ++__current;
        if (__current == __last) {
            __set_node(__node + 1);
            __current = __first;
        }
        return *this;
    }
    __deque_iterator operator++(int) noexcept {
        __deque_iterator tmp = *this;
        ++*this;
        return tmp;
    }
    __deque_iterator& operator--() noexcept {
        if (__current == __first) {
            __set_node(__node - 1);
            __current = __last;
        }
        --__current;
        return *this;
    }
    __deque_iterator operator--(int) noexcept {
        __deque_iterator tmp = *this;
        --*this;
        return tmp;
    }
    __deque_iterator& operator+=(ptrdiff_t n) noexcept {
        ptrdiff_t offset = n + (__current - __first);
        if (offset >= 0 && offset < __block) {
            __current += n;
        } else {
            ptrdiff_t node_offset = offset > 0 ? offset / __block : -((-offset - 1) / __block) - 1;
            __set_node(__node + node_offset);
            __current = __first + (offset - node_offset * __block);
        }
        return *this;
    }
    __deque_iterator& operator-=(ptrdiff_t n) noexcept { return *this += -n; }
    __deque_iterator operator+(ptrdiff_t n) const noexcept {
        __deque_iterator tmp = *this;
        return tmp += n;
    }
    __deque_iterator operator-(ptrdiff_t n) const noexcept {
        __deque_iterator tmp = *this;
        return tmp -= n;
    }
    T& operator[](ptrdiff_t n) const noexcept { return *(*this + n); }
    template <class U> ptrdiff_t operator-(const __deque_iterator<U>& other) const noexcept {
        return __block * (__deque_node(__node) - __deque_node(other.__node) - 1) + (__current - __first) +
            (other.__last - other.__current);
    }
    template <class U> bool operator==(const __deque_iterator<U>& other) const noexcept {
        return __current == other.__current;
    }
    template <class U> bool operator!=(const __deque_iterator<U>& other) const noexcept {
        return __current != other.__current;
    }
    template <class U> bool operator<(const __deque_iterator<U>& other) const noexcept {
        return __deque_node(__node) == __deque_node(other.__node) ? __current < other.__current
                                                                  : __deque_node(__node) < __deque_node(other.__node);
    }
    template <class U> bool operator>(const __deque_iterator<U>& other) const noexcept { return other < *this; }
    template <class U> bool operator<=(const __deque_iterator<U>& other) const noexcept { return !(other < *this); }
    template <class U> bool operator>=(const __deque_iterator<U>& other) const noexcept { return !(*this < other); }
};
template <class T> __deque_iterator<T> operator+(ptrdiff_t n, const __deque_iterator<T>& it) noexcept {
    return it + n;
}

template <class T, class A = allocator<T>> class deque {
public:
    typedef T value_type;
    typedef A allocator_type;
    typedef size_t size_type;
    typedef ptrdiff_t difference_type;
    typedef T& reference;
    typedef const T& const_reference;
    typedef T* pointer;
    typedef const T* const_pointer;
    typedef __deque_iterator<T> iterator;
    typedef __deque_iterator<const T> const_iterator;
    typedef std::reverse_iterator<iterator> reverse_iterator;
    typedef std::reverse_iterator<const_iterator> const_reverse_iterator;

private:
    static constexpr ptrdiff_t __block = iterator::__block;
    T** __map;
    size_t __map_size;
    iterator __start;
    iterator __finish;

    static T* __new_block() { return static_cast<T*>(__allocate(__block * sizeof(T))); }
    void __initialize(size_t n) {
        size_t nodes = n / __block + 1;
        __map_size = nodes + 2 > 8 ? nodes + 2 : 8;
        __map = static_cast<T**>(__allocate(__map_size * sizeof(T*)));
        T** start = __map + (__map_size - nodes) / 2;
        T** finish = start + nodes - 1;
        for (T** node = start; node <= finish; ++node)
            *node = __new_block();
        __start = iterator(*start, start);
        __finish = iterator(*finish + n % __block, finish);
    }
    // Room for extra block pointers at one end of the map.
    void __reserve_map(size_t extra, bool at_front) {
        size_t old_nodes = __finish.__node - __start.__node + 1;
        size_t new_nodes = old_nodes + extra;
        T** start;
        if (__map_size > 2 * new_nodes) {
            start = __map + (__map_size - new_nodes) / 2 + (at_front ? extra : 0);
            if (start < __start.__node)
                std::copy(__start.__node, __finish.__node + 1, start);
            else
                std::copy_backward(__start.__node, __finish.__node + 1, start + old_nodes);
        } else {
            size_t new_size = __map_size + (__map_size > extra ? __map_size : extra) + 2;
            T** new_map = static_cast<T**>(__allocate(new_size * sizeof(T*)));
            start = new_map + (new_size - new_nodes) / 2 + (at_front ? extra : 0);
            std::copy(__start.__node, __finish.__node + 1, start);
            __deallocate(__map);
            __map = new_map;
            __map_size = new_size;
        }
        T* start_current = __start.__current;
        T* finish_current = __finish.__current;
        __start.__set_node(start);
        __start.__current = start_current;
        __finish.__set_node(start + old_nodes - 1);
        __finish.__current = finish_current;
    }
    void __destroy_all() {
        for (iterator it = __start; it != __finish; ++it)
            (*it).~T();
    }
    void __free_blocks() {
        if (__map == 0)
            return;
        for (T** node = __start.__node; node <= __finish.__node; ++node)
            __deallocate(*node);
        __deallocate(__map);
        __map = 0;
    }
    void __range_check(size_t i) const {
        if (i >= size()) {
            char text[128];
            snprintf(text, sizeof text, "deque::_M_range_check: __n (which is %zu)>= this->size() (which is %zu)", i,
                     size());
            throw out_of_range(text);
        }
    }

public:
    deque() : __map(0), __map_size(0) { __initialize(0); }
    explicit deque(const A&) : deque() {}
    explicit deque(size_t n, const A& = A()) : __map(0), __map_size(0) {
        __initialize(0);
        for (; n > 0; --n)
            emplace_back();
    }
    deque(size_t n, const T& value, const A& = A()) : __map(0), __map_size(0) {
        __initialize(0);
        for (; n > 0; --n)
            push_back(value);
    }
    template <class I, class = typename enable_if<!is_integral<I>::value>::type>
    deque(I first, I last, const A& = A()) : __map(0), __map_size(0) {
        __initialize(0);
        for (; first != last; ++first)
            emplace_back(*first);
    }
    deque(const deque& other) : __map(0), __map_size(0) {
        __initialize(0);
        for (const_iterator it = other.begin(); it != other.end(); ++it)
            push_back(*it);
    }
    deque(deque&& other) : __map(0), __map_size(0) {
        __initialize(0);
        swap(other);
    }
    deque(initializer_list<T> list, const A& = A()) : deque(list.begin(), list.end()) {}
    ~deque() {
        __destroy_all();
        __free_blocks();
    }
    deque& operator=(const deque& other) {
        if (&other != this)
            assign(other.begin(), other.end());
        return *this;
    }
    deque& operator=(deque&& other) {
        swap(other);
        return *this;
    }
    deque& operator=(initializer_list<T> list) {
        assign(list.begin(), list.end());
        return *this;
    }
    template <class I, class = typename enable_if<!is_integral<I>::value>::type> void assign(I first, I last) {
        clear();
        for (; first != last; ++first)
            emplace_back(*first);
    }
    void assign(size_t n, const T& value) {
        clear();
        for (; n > 0; --n)
            push_back(value);
    }
    void assign(initializer_list<T> list) { assign(list.begin(), list.end()); }
    allocator_type get_allocator() const noexcept { return A(); }

    iterator begin() noexcept { return __start; }
    const_iterator begin() const noexcept { return __start; }
    iterator end() noexcept { return __finish; }
    const_iterator end() const noexcept { return __finish; }
    const_iterator cbegin() const noexcept { return __start; }
    const_iterator cend() const noexcept { return __finish; }
    reverse_iterator rbegin() noexcept { return reverse_iterator(__finish); }
    const_reverse_iterator rbegin() const noexcept { return const_reverse_iterator(end()); }
    reverse_iterator rend() noexcept { return reverse_iterator(__start); }
    const_reverse_iterator rend() const noexcept { return const_reverse_iterator(begin()); }
    const_reverse_iterator crbegin() const noexcept { return const_reverse_iterator(end()); }
    const_reverse_iterator crend() const noexcept { return const_reverse_iterator(begin()); }

    size_t size() const noexcept { return __finish - __start; }
    size_t max_size() const noexcept { return 9223372036854775807UL / sizeof(T); }
    bool empty() const noexcept { return __finish == __start; }
    void resize(size_t n) {
        while (size() > n)
            pop_back();
        while (size() < n)
            emplace_back();
    }
    void resize(size_t n, const T& value) {
        while (size() > n)
            pop_back();
        while (size() < n)
            push_back(value);
    }
    void shrink_to_fit() {}

    T& operator[](size_t i) noexcept { return __start[ptrdiff_t(i)]; }
    const T& operator[](size_t i) const noexcept { return begin()[ptrdiff_t(i)]; }
    T& at(size_t i) {
        __range_check(i);
        return __start[ptrdiff_t(i)];
    }
    const T& at(size_t i) const {
        __range_check(i);
        return begin()[ptrdiff_t(i)];
    }
    T& front() noexcept { return *__start; }
    const T& front() const noexcept { return *__start; }
    T& back() noexcept {
        iterator tmp = __finish;
        --tmp;
        return *tmp;
    }
    const T& back() const noexcept {
        const_iterator tmp = end();
        --tmp;
        return *tmp;
    }

    template <class... Args> T& emplace_back(Args&&... args) {
        if (__finish.__current != __finish.__last - 1) {
            ::new (static_cast<void*>(__finish.__current)) T(std::forward<Args>(args)...);
            ++__finish.__current;
        } else {
            if (size_t(__finish.__node - __map) + 2 > __map_size)
                __reserve_map(1, false);
            *(__finish.__node + 1) = __new_block();
            ::new (static_cast<void*>(__finish.__current)) T(std::forward<Args>(args)...);
            __finish.__set_node(__finish.__node + 1);
            __finish.__current = __finish.__first;
        }
        return back();
    }
    template <class... Args> T& emplace_front(Args&&... args) {
        if (__start.__current != __start.__first) {
            ::new (static_cast<void*>(__start.__current - 1)) T(std::forward<Args>(args)...);
            --__start.__current;
        } else {
            if (__start.__node == __map)
                __reserve_map(1, true);
            *(__start.__node - 1) = __new_block();
            __start.__set_node(__start.__node - 1);
            __start.__current = __start.__last - 1;
            ::new (static_cast<void*>(__start.__current)) T(std::forward<Args>(args)...);
        }
        return front();
    }
    void push_back(const T& value) { emplace_back(value); }
    void push_back(T&& value) { emplace_back(std::move(value)); }
    void push_front(const T& value) { emplace_front(value); }
    void push_front(T&& value) { emplace_front(std::move(value)); }
    void pop_back() noexcept {
        if (__finish.__current != __finish.__first) {
            --__finish.__current;
            __finish.__current->~T();
        } else {
            __deallocate(__finish.__first);
            __finish.__set_node(__finish.__node - 1);
            __finish.__current = __finish.__last - 1;
            __finish.__current->~T();
        }
    }
    void pop_front() noexcept {
        if (__start.__current != __start.__last - 1) {
            __start.__current->~T();
            ++__start.__current;
        } else {
            __start.__current->~T();
            __deallocate(__start.__first);
            __start.__set_node(__start.__node + 1);
            __start.__current = __start.__first;
        }
    }
    template <class... Args> iterator emplace(const_iterator position, Args&&... args) {
        ptrdiff_t index = position - begin();
        if (index == 0) {
            emplace_front(std::forward<Args>(args)...);
            return __start;
        }
        if (size_t(index) == size()) {
            emplace_back(std::forward<Args>(args)...);
            return __finish - 1;
        }
        T value(std::forward<Args>(args)...);
        if (size_t(index) < size() / 2) {
            emplace_front(std::move(front()));
            iterator pos = __start + index;
            std::move(__start + 2, pos + 1, __start + 1);
            *pos = std::move(value);
            return pos;
        }
        emplace_back(std::move(back()));
        iterator pos = __start + index;
        std::move_backward(pos, __finish - 2, __finish - 1);
        *pos = std::move(value);
        return pos;
    }
    iterator insert(const_iterator position, const T& value) { return emplace(position, value); }
    iterator insert(const_iterator position, T&& value) { return emplace(position, std::move(value)); }
    iterator insert(const_iterator position, size_t n, const T& value) {
        ptrdiff_t index = position - begin();
        for (size_t count = 0; count < n; ++count)
            emplace(begin() + (index + ptrdiff_t(count)), value);
        return begin() + index;
    }
    template <class I, class = typename enable_if<!is_integral<I>::value>::type>
    iterator insert(const_iterator position, I first, I last) {
        ptrdiff_t index = position - begin();
        ptrdiff_t at = index;
        for (; first != last; ++first, ++at)
            emplace(begin() + at, *first);
        return begin() + index;
    }
    iterator insert(const_iterator position, initializer_list<T> list) {
        return insert(position, list.begin(), list.end());
    }
    iterator erase(const_iterator position) {
        ptrdiff_t index = position - begin();
        iterator pos = __start + index;
        if (size_t(index) < size() / 2) {
            std::move_backward(__start, pos, pos + 1);
            pop_front();
        } else {
            std::move(pos + 1, __finish, pos);
            pop_back();
        }
        return __start + index;
    }
    iterator erase(const_iterator first, const_iterator last) {
        ptrdiff_t index = first - begin();
        ptrdiff_t n = last - first;
        if (n == 0)
            return __start + index;
        if (size_t(index) < (size() - n) / 2) {
            std::move_backward(__start, __start + index, __start + (index + n));
            for (ptrdiff_t count = 0; count < n; ++count)
                pop_front();
        } else {
            std::move(__start + (index + n), __finish, __start + index);
            for (ptrdiff_t count = 0; count < n; ++count)
                pop_back();
        }
        return __start + index;
    }
    void clear() noexcept {
        while (!empty())
            pop_back();
    }
    void swap(deque& other) noexcept {
        std::swap(__map, other.__map);
        std::swap(__map_size, other.__map_size);
        std::swap(__start, other.__start);
        std::swap(__finish, other.__finish);
    }
};
template <class I> deque(I, I) -> deque<typename iterator_traits<I>::value_type>;
template <class T, class A> bool operator==(const deque<T, A>& a, const deque<T, A>& b) {
    return a.size() == b.size() && std::equal(a.begin(), a.end(), b.begin());
}
template <class T, class A> bool operator!=(const deque<T, A>& a, const deque<T, A>& b) { return !(a == b); }
template <class T, class A> bool operator<(const deque<T, A>& a, const deque<T, A>& b) {
    return std::lexicographical_compare(a.begin(), a.end(), b.begin(), b.end());
}
template <class T, class A> bool operator>(const deque<T, A>& a, const deque<T, A>& b) { return b < a; }
template <class T, class A> bool operator<=(const deque<T, A>& a, const deque<T, A>& b) { return !(b < a); }
template <class T, class A> bool operator>=(const deque<T, A>& a, const deque<T, A>& b) { return !(a < b); }
template <class T, class A> void swap(deque<T, A>& a, deque<T, A>& b) noexcept { a.swap(b); }
}
`);

    X.addHeader('v4script/list', [
        ['std', 3, 6, '__list_links'],
        ['std', 7, 9, '__list_node'],
        ['std', 10, 41, '__list_iterator'],
        ['std', 42, 75, '__list_const_iterator'],
        ['std', 76, 78, 'operator=='],
        ['std', 79, 81, 'operator!='],
        ['std', 84, 89, '__list_hook'],
        ['std', 90, 93, '__list_unhook'],
        ['std', 95, 105, '__list_transfer'],
        ['std', 107, 452, 'list'],
        ['std', 453, 453, 'list'],
        ['std', 454, 456, 'operator=='],
        ['std', 457, 457, 'operator!='],
        ['std', 458, 460, 'operator<'],
        ['std', 461, 461, 'operator>'],
        ['std', 462, 462, 'operator<='],
        ['std', 463, 463, 'operator>='],
        ['std', 464, 464, 'swap']
    ], String.raw`
namespace std {
struct __list_links {
    __list_links* __next;
    __list_links* __prev;
};
template <class T> struct __list_node : __list_links {
    T __value;
};
template <class T> struct __list_iterator {
    typedef bidirectional_iterator_tag iterator_category;
    typedef T value_type;
    typedef ptrdiff_t difference_type;
    typedef T* pointer;
    typedef T& reference;
    __list_links* __node;
    __list_iterator() noexcept : __node(0) {}
    explicit __list_iterator(__list_links* node) noexcept : __node(node) {}
    T& operator*() const noexcept { return static_cast<__list_node<T>*>(__node)->__value; }
    T* operator->() const noexcept { return &static_cast<__list_node<T>*>(__node)->__value; }
    __list_iterator& operator++() noexcept {
        __node = __node->__next;
        return *this;
    }
    __list_iterator operator++(int) noexcept {
        __list_iterator tmp = *this;
        __node = __node->__next;
        return tmp;
    }
    __list_iterator& operator--() noexcept {
        __node = __node->__prev;
        return *this;
    }
    __list_iterator operator--(int) noexcept {
        __list_iterator tmp = *this;
        __node = __node->__prev;
        return tmp;
    }
    bool operator==(const __list_iterator& other) const noexcept { return __node == other.__node; }
    bool operator!=(const __list_iterator& other) const noexcept { return __node != other.__node; }
};
template <class T> struct __list_const_iterator {
    typedef bidirectional_iterator_tag iterator_category;
    typedef T value_type;
    typedef ptrdiff_t difference_type;
    typedef const T* pointer;
    typedef const T& reference;
    const __list_links* __node;
    __list_const_iterator() noexcept : __node(0) {}
    explicit __list_const_iterator(const __list_links* node) noexcept : __node(node) {}
    __list_const_iterator(const __list_iterator<T>& other) noexcept : __node(other.__node) {}
    __list_iterator<T> __const_cast() const noexcept { return __list_iterator<T>(const_cast<__list_links*>(__node)); }
    const T& operator*() const noexcept { return static_cast<const __list_node<T>*>(__node)->__value; }
    const T* operator->() const noexcept { return &static_cast<const __list_node<T>*>(__node)->__value; }
    __list_const_iterator& operator++() noexcept {
        __node = __node->__next;
        return *this;
    }
    __list_const_iterator operator++(int) noexcept {
        __list_const_iterator tmp = *this;
        __node = __node->__next;
        return tmp;
    }
    __list_const_iterator& operator--() noexcept {
        __node = __node->__prev;
        return *this;
    }
    __list_const_iterator operator--(int) noexcept {
        __list_const_iterator tmp = *this;
        __node = __node->__prev;
        return tmp;
    }
    bool operator==(const __list_const_iterator& other) const noexcept { return __node == other.__node; }
    bool operator!=(const __list_const_iterator& other) const noexcept { return __node != other.__node; }
};
template <class T> bool operator==(const __list_iterator<T>& a, const __list_const_iterator<T>& b) noexcept {
    return a.__node == b.__node;
}
template <class T> bool operator!=(const __list_iterator<T>& a, const __list_const_iterator<T>& b) noexcept {
    return a.__node != b.__node;
}

// Links a node in before position.
inline void __list_hook(__list_links* node, __list_links* position) noexcept {
    node->__next = position;
    node->__prev = position->__prev;
    position->__prev->__next = node;
    position->__prev = node;
}
inline void __list_unhook(__list_links* node) noexcept {
    node->__prev->__next = node->__next;
    node->__next->__prev = node->__prev;
}
// Moves [first, last) before position.
inline void __list_transfer(__list_links* position, __list_links* first, __list_links* last) noexcept {
    if (position == last || first == last)
        return;
    last->__prev->__next = position;
    first->__prev->__next = last;
    position->__prev->__next = first;
    __list_links* tmp = position->__prev;
    position->__prev = last->__prev;
    last->__prev = first->__prev;
    first->__prev = tmp;
}

template <class T, class A = allocator<T>> class list {
    __list_links __head;
    size_t __size;

    typedef __list_node<T> __node_type;
    template <class... Args> __list_links* __make(Args&&... args) {
        __node_type* node = static_cast<__node_type*>(__allocate(sizeof(__node_type)));
        try {
            ::new (static_cast<void*>(&node->__value)) T(std::forward<Args>(args)...);
        } catch (...) {
            __deallocate(node);
            throw;
        }
        return node;
    }
    void __drop(__list_links* link) noexcept {
        __node_type* node = static_cast<__node_type*>(link);
        node->__value.~T();
        __deallocate(node);
    }
    void __reset() noexcept {
        __head.__next = &__head;
        __head.__prev = &__head;
        __size = 0;
    }
    void __steal(list& other) noexcept {
        if (other.__size == 0) {
            __reset();
            return;
        }
        __head.__next = other.__head.__next;
        __head.__prev = other.__head.__prev;
        __head.__next->__prev = &__head;
        __head.__prev->__next = &__head;
        __size = other.__size;
        other.__reset();
    }

public:
    typedef T value_type;
    typedef A allocator_type;
    typedef size_t size_type;
    typedef ptrdiff_t difference_type;
    typedef T& reference;
    typedef const T& const_reference;
    typedef T* pointer;
    typedef const T* const_pointer;
    typedef __list_iterator<T> iterator;
    typedef __list_const_iterator<T> const_iterator;
    typedef std::reverse_iterator<iterator> reverse_iterator;
    typedef std::reverse_iterator<const_iterator> const_reverse_iterator;

    list() noexcept { __reset(); }
    explicit list(const A&) noexcept { __reset(); }
    explicit list(size_t n, const A& = A()) {
        __reset();
        for (; n > 0; --n)
            emplace_back();
    }
    list(size_t n, const T& value, const A& = A()) {
        __reset();
        for (; n > 0; --n)
            push_back(value);
    }
    template <class I, class = typename enable_if<!is_integral<I>::value>::type> list(I first, I last, const A& = A()) {
        __reset();
        for (; first != last; ++first)
            emplace_back(*first);
    }
    list(const list& other) {
        __reset();
        for (const_iterator it = other.begin(); it != other.end(); ++it)
            push_back(*it);
    }
    list(list&& other) noexcept { __steal(other); }
    list(initializer_list<T> list_, const A& = A()) {
        __reset();
        for (const T* it = list_.begin(); it != list_.end(); ++it)
            push_back(*it);
    }
    ~list() { clear(); }
    list& operator=(const list& other) {
        if (&other != this)
            assign(other.begin(), other.end());
        return *this;
    }
    list& operator=(list&& other) noexcept {
        clear();
        __steal(other);
        return *this;
    }
    list& operator=(initializer_list<T> list_) {
        assign(list_.begin(), list_.end());
        return *this;
    }
    template <class I, class = typename enable_if<!is_integral<I>::value>::type> void assign(I first, I last) {
        iterator it = begin();
        for (; it != end() && first != last; ++it, ++first)
            *it = *first;
        if (first == last)
            erase(it, end());
        else
            insert(end(), first, last);
    }
    void assign(size_t n, const T& value) {
        iterator it = begin();
        for (; it != end() && n > 0; ++it, --n)
            *it = value;
        if (n == 0)
            erase(it, end());
        else
            insert(end(), n, value);
    }
    void assign(initializer_list<T> list_) { assign(list_.begin(), list_.end()); }
    allocator_type get_allocator() const noexcept { return A(); }

    iterator begin() noexcept { return iterator(__head.__next); }
    const_iterator begin() const noexcept { return const_iterator(__head.__next); }
    iterator end() noexcept { return iterator(&__head); }
    const_iterator end() const noexcept { return const_iterator(&__head); }
    const_iterator cbegin() const noexcept { return begin(); }
    const_iterator cend() const noexcept { return end(); }
    reverse_iterator rbegin() noexcept { return reverse_iterator(end()); }
    const_reverse_iterator rbegin() const noexcept { return const_reverse_iterator(end()); }
    reverse_iterator rend() noexcept { return reverse_iterator(begin()); }
    const_reverse_iterator rend() const noexcept { return const_reverse_iterator(begin()); }
    const_reverse_iterator crbegin() const noexcept { return const_reverse_iterator(end()); }
    const_reverse_iterator crend() const noexcept { return const_reverse_iterator(begin()); }

    bool empty() const noexcept { return __size == 0; }
    size_t size() const noexcept { return __size; }
    size_t max_size() const noexcept { return 9223372036854775807UL / sizeof(__node_type); }
    void resize(size_t n) {
        while (__size > n)
            pop_back();
        while (__size < n)
            emplace_back();
    }
    void resize(size_t n, const T& value) {
        while (__size > n)
            pop_back();
        while (__size < n)
            push_back(value);
    }
    T& front() noexcept { return *begin(); }
    const T& front() const noexcept { return *begin(); }
    T& back() noexcept { return *--end(); }
    const T& back() const noexcept { return *--end(); }

    template <class... Args> iterator emplace(const_iterator position, Args&&... args) {
        __list_links* node = __make(std::forward<Args>(args)...);
        __list_hook(node, const_cast<__list_links*>(position.__node));
        ++__size;
        return iterator(node);
    }
    template <class... Args> T& emplace_front(Args&&... args) {
        return *emplace(begin(), std::forward<Args>(args)...);
    }
    template <class... Args> T& emplace_back(Args&&... args) { return *emplace(end(), std::forward<Args>(args)...); }
    void push_front(const T& value) { emplace(begin(), value); }
    void push_front(T&& value) { emplace(begin(), std::move(value)); }
    void push_back(const T& value) { emplace(end(), value); }
    void push_back(T&& value) { emplace(end(), std::move(value)); }
    void pop_front() noexcept { erase(begin()); }
    void pop_back() noexcept { erase(--end()); }
    iterator insert(const_iterator position, const T& value) { return emplace(position, value); }
    iterator insert(const_iterator position, T&& value) { return emplace(position, std::move(value)); }
    iterator insert(const_iterator position, size_t n, const T& value) {
        list tmp(n, value);
        iterator result = position.__const_cast();
        if (n > 0) {
            result = tmp.begin();
            splice(position, tmp);
        }
        return result;
    }
    template <class I, class = typename enable_if<!is_integral<I>::value>::type>
    iterator insert(const_iterator position, I first, I last) {
        list tmp(first, last);
        iterator result = position.__const_cast();
        if (!tmp.empty()) {
            result = tmp.begin();
            splice(position, tmp);
        }
        return result;
    }
    iterator insert(const_iterator position, initializer_list<T> list_) {
        return insert(position, list_.begin(), list_.end());
    }
    iterator erase(const_iterator position) noexcept {
        __list_links* node = const_cast<__list_links*>(position.__node);
        __list_links* next = node->__next;
        __list_unhook(node);
        __drop(node);
        --__size;
        return iterator(next);
    }
    iterator erase(const_iterator first, const_iterator last) noexcept {
        while (first != last)
            first = erase(first);
        return last.__const_cast();
    }
    void clear() noexcept {
        __list_links* node = __head.__next;
        while (node != &__head) {
            __list_links* next = node->__next;
            __drop(node);
            node = next;
        }
        __reset();
    }
    void swap(list& other) noexcept {
        list tmp(std::move(other));
        other.__steal(*this);
        __steal(tmp);
    }

    void splice(const_iterator position, list& other) noexcept {
        if (other.empty())
            return;
        __list_transfer(const_cast<__list_links*>(position.__node), other.__head.__next, &other.__head);
        __size += other.__size;
        other.__size = 0;
    }
    void splice(const_iterator position, list&& other) noexcept { splice(position, other); }
    void splice(const_iterator position, list& other, const_iterator it) noexcept {
        __list_links* node = const_cast<__list_links*>(it.__node);
        __list_links* target = const_cast<__list_links*>(position.__node);
        if (target == node || target == node->__next)
            return;
        __list_transfer(target, node, node->__next);
        ++__size;
        --other.__size;
    }
    void splice(const_iterator position, list&& other, const_iterator it) noexcept { splice(position, other, it); }
    void splice(const_iterator position, list& other, const_iterator first, const_iterator last) noexcept {
        if (first == last)
            return;
        if (&other != this) {
            size_t n = std::distance(first, last);
            __size += n;
            other.__size -= n;
        }
        __list_transfer(const_cast<__list_links*>(position.__node), const_cast<__list_links*>(first.__node),
                        const_cast<__list_links*>(last.__node));
    }
    void splice(const_iterator position, list&& other, const_iterator first, const_iterator last) noexcept {
        splice(position, other, first, last);
    }
    size_t remove(const T& value) {
        list removed;
        for (iterator it = begin(); it != end();) {
            iterator next = it;
            ++next;
            if (*it == value)
                removed.splice(removed.begin(), *this, it);
            it = next;
        }
        return removed.size();
    }
    template <class P> size_t remove_if(P p) {
        list removed;
        for (iterator it = begin(); it != end();) {
            iterator next = it;
            ++next;
            if (p(*it))
                removed.splice(removed.begin(), *this, it);
            it = next;
        }
        return removed.size();
    }
    template <class P> size_t unique(P p) {
        size_t count = 0;
        iterator first = begin();
        if (first == end())
            return 0;
        iterator next = first;
        while (++next != end()) {
            if (p(*first, *next)) {
                erase(next);
                ++count;
            } else {
                first = next;
            }
            next = first;
        }
        return count;
    }
    size_t unique() { return unique(__equal_iterators()); }
    template <class C> void merge(list& other, C comp) {
        if (&other == this)
            return;
        iterator first1 = begin(), last1 = end();
        iterator first2 = other.begin(), last2 = other.end();
        size_t moved = other.__size;
        while (first1 != last1 && first2 != last2) {
            if (comp(*first2, *first1)) {
                iterator next = first2;
                ++next;
                __list_transfer(first1.__node, first2.__node, next.__node);
                first2 = next;
            } else {
                ++first1;
            }
        }
        if (first2 != last2)
            __list_transfer(last1.__node, first2.__node, last2.__node);
        __size += moved;
        other.__size = 0;
    }
    template <class C> void merge(list&& other, C comp) { merge(other, comp); }
    void merge(list& other) { merge(other, __less_iterators()); }
    void merge(list&& other) { merge(other, __less_iterators()); }
    // A stable merge sort of the nodes.
    template <class C> void sort(C comp) {
        if (__size < 2)
            return;
        list carry;
        list buckets[64];
        int filled = 0;
        while (!empty()) {
            carry.splice(carry.begin(), *this, begin());
            int index = 0;
            for (; index < filled && !buckets[index].empty(); ++index) {
                buckets[index].merge(carry, comp);
                carry.swap(buckets[index]);
            }
            carry.swap(buckets[index]);
            if (index == filled)
                ++filled;
        }
        for (int index = 1; index < filled; ++index)
            buckets[index].merge(buckets[index - 1], comp);
        swap(buckets[filled - 1]);
    }
    void sort() { sort(__less_iterators()); }
    void reverse() noexcept {
        __list_links* node = &__head;
        do {
            __list_links* tmp = node->__next;
            node->__next = node->__prev;
            node->__prev = tmp;
            node = tmp;
        } while (node != &__head);
    }
};
template <class I> list(I, I) -> list<typename iterator_traits<I>::value_type>;
template <class T, class A> bool operator==(const list<T, A>& a, const list<T, A>& b) {
    return a.size() == b.size() && std::equal(a.begin(), a.end(), b.begin());
}
template <class T, class A> bool operator!=(const list<T, A>& a, const list<T, A>& b) { return !(a == b); }
template <class T, class A> bool operator<(const list<T, A>& a, const list<T, A>& b) {
    return std::lexicographical_compare(a.begin(), a.end(), b.begin(), b.end());
}
template <class T, class A> bool operator>(const list<T, A>& a, const list<T, A>& b) { return b < a; }
template <class T, class A> bool operator<=(const list<T, A>& a, const list<T, A>& b) { return !(b < a); }
template <class T, class A> bool operator>=(const list<T, A>& a, const list<T, A>& b) { return !(a < b); }
template <class T, class A> void swap(list<T, A>& a, list<T, A>& b) noexcept { a.swap(b); }
}
`);

    X.addHeader('v4script/forward_list', [
        ['std', 3, 5, '__slist_links'],
        ['std', 6, 8, '__slist_node'],
        ['std', 9, 31, '__slist_iterator'],
        ['std', 32, 58, '__slist_const_iterator'],
        ['std', 60, 345, 'forward_list'],
        ['std', 346, 346, 'forward_list'],
        ['std', 347, 349, 'operator=='],
        ['std', 350, 352, 'operator!='],
        ['std', 353, 355, 'operator<'],
        ['std', 356, 356, 'swap']
    ], String.raw`
namespace std {
struct __slist_links {
    __slist_links* __next;
};
template <class T> struct __slist_node : __slist_links {
    T __value;
};
template <class T> struct __slist_iterator {
    typedef forward_iterator_tag iterator_category;
    typedef T value_type;
    typedef ptrdiff_t difference_type;
    typedef T* pointer;
    typedef T& reference;
    __slist_links* __node;
    __slist_iterator() noexcept : __node(0) {}
    explicit __slist_iterator(__slist_links* node) noexcept : __node(node) {}
    T& operator*() const noexcept { return static_cast<__slist_node<T>*>(__node)->__value; }
    T* operator->() const noexcept { return &static_cast<__slist_node<T>*>(__node)->__value; }
    __slist_iterator& operator++() noexcept {
        __node = __node->__next;
        return *this;
    }
    __slist_iterator operator++(int) noexcept {
        __slist_iterator tmp = *this;
        __node = __node->__next;
        return tmp;
    }
    bool operator==(const __slist_iterator& other) const noexcept { return __node == other.__node; }
    bool operator!=(const __slist_iterator& other) const noexcept { return __node != other.__node; }
};
template <class T> struct __slist_const_iterator {
    typedef forward_iterator_tag iterator_category;
    typedef T value_type;
    typedef ptrdiff_t difference_type;
    typedef const T* pointer;
    typedef const T& reference;
    const __slist_links* __node;
    __slist_const_iterator() noexcept : __node(0) {}
    explicit __slist_const_iterator(const __slist_links* node) noexcept : __node(node) {}
    __slist_const_iterator(const __slist_iterator<T>& other) noexcept : __node(other.__node) {}
    __slist_iterator<T> __const_cast() const noexcept {
        return __slist_iterator<T>(const_cast<__slist_links*>(__node));
    }
    const T& operator*() const noexcept { return static_cast<const __slist_node<T>*>(__node)->__value; }
    const T* operator->() const noexcept { return &static_cast<const __slist_node<T>*>(__node)->__value; }
    __slist_const_iterator& operator++() noexcept {
        __node = __node->__next;
        return *this;
    }
    __slist_const_iterator operator++(int) noexcept {
        __slist_const_iterator tmp = *this;
        __node = __node->__next;
        return tmp;
    }
    bool operator==(const __slist_const_iterator& other) const noexcept { return __node == other.__node; }
    bool operator!=(const __slist_const_iterator& other) const noexcept { return __node != other.__node; }
};

template <class T, class A = allocator<T>> class forward_list {
    __slist_links __head;

    typedef __slist_node<T> __node_type;
    template <class... Args> __slist_links* __make(Args&&... args) {
        __node_type* node = static_cast<__node_type*>(__allocate(sizeof(__node_type)));
        try {
            ::new (static_cast<void*>(&node->__value)) T(std::forward<Args>(args)...);
        } catch (...) {
            __deallocate(node);
            throw;
        }
        return node;
    }
    void __drop(__slist_links* link) noexcept {
        __node_type* node = static_cast<__node_type*>(link);
        node->__value.~T();
        __deallocate(node);
    }

public:
    typedef T value_type;
    typedef A allocator_type;
    typedef size_t size_type;
    typedef ptrdiff_t difference_type;
    typedef T& reference;
    typedef const T& const_reference;
    typedef T* pointer;
    typedef const T* const_pointer;
    typedef __slist_iterator<T> iterator;
    typedef __slist_const_iterator<T> const_iterator;

    forward_list() noexcept { __head.__next = 0; }
    explicit forward_list(const A&) noexcept { __head.__next = 0; }
    explicit forward_list(size_t n, const A& = A()) {
        __head.__next = 0;
        for (; n > 0; --n)
            emplace_front();
    }
    forward_list(size_t n, const T& value, const A& = A()) {
        __head.__next = 0;
        for (; n > 0; --n)
            push_front(value);
    }
    template <class I, class = typename enable_if<!is_integral<I>::value>::type>
    forward_list(I first, I last, const A& = A()) {
        __head.__next = 0;
        insert_after(before_begin(), first, last);
    }
    forward_list(const forward_list& other) {
        __head.__next = 0;
        insert_after(before_begin(), other.begin(), other.end());
    }
    forward_list(forward_list&& other) noexcept {
        __head.__next = other.__head.__next;
        other.__head.__next = 0;
    }
    forward_list(initializer_list<T> list, const A& = A()) {
        __head.__next = 0;
        insert_after(before_begin(), list.begin(), list.end());
    }
    ~forward_list() { clear(); }
    forward_list& operator=(const forward_list& other) {
        if (&other != this)
            assign(other.begin(), other.end());
        return *this;
    }
    forward_list& operator=(forward_list&& other) noexcept {
        clear();
        __head.__next = other.__head.__next;
        other.__head.__next = 0;
        return *this;
    }
    forward_list& operator=(initializer_list<T> list) {
        assign(list.begin(), list.end());
        return *this;
    }
    template <class I, class = typename enable_if<!is_integral<I>::value>::type> void assign(I first, I last) {
        clear();
        insert_after(before_begin(), first, last);
    }
    void assign(size_t n, const T& value) {
        clear();
        insert_after(before_begin(), n, value);
    }
    void assign(initializer_list<T> list) { assign(list.begin(), list.end()); }
    allocator_type get_allocator() const noexcept { return A(); }

    iterator before_begin() noexcept { return iterator(&__head); }
    const_iterator before_begin() const noexcept { return const_iterator(&__head); }
    const_iterator cbefore_begin() const noexcept { return const_iterator(&__head); }
    iterator begin() noexcept { return iterator(__head.__next); }
    const_iterator begin() const noexcept { return const_iterator(__head.__next); }
    iterator end() noexcept { return iterator(0); }
    const_iterator end() const noexcept { return const_iterator(0); }
    const_iterator cbegin() const noexcept { return begin(); }
    const_iterator cend() const noexcept { return end(); }
    bool empty() const noexcept { return __head.__next == 0; }
    size_t max_size() const noexcept { return 9223372036854775807UL / sizeof(__node_type); }
    T& front() noexcept { return *begin(); }
    const T& front() const noexcept { return *begin(); }

    template <class... Args> iterator emplace_after(const_iterator position, Args&&... args) {
        __slist_links* node = __make(std::forward<Args>(args)...);
        __slist_links* previous = const_cast<__slist_links*>(position.__node);
        node->__next = previous->__next;
        previous->__next = node;
        return iterator(node);
    }
    template <class... Args> T& emplace_front(Args&&... args) {
        return *emplace_after(before_begin(), std::forward<Args>(args)...);
    }
    void push_front(const T& value) { emplace_after(before_begin(), value); }
    void push_front(T&& value) { emplace_after(before_begin(), std::move(value)); }
    void pop_front() noexcept { erase_after(before_begin()); }
    iterator insert_after(const_iterator position, const T& value) { return emplace_after(position, value); }
    iterator insert_after(const_iterator position, T&& value) { return emplace_after(position, std::move(value)); }
    iterator insert_after(const_iterator position, size_t n, const T& value) {
        iterator it = position.__const_cast();
        for (; n > 0; --n)
            it = emplace_after(it, value);
        return it;
    }
    template <class I, class = typename enable_if<!is_integral<I>::value>::type>
    iterator insert_after(const_iterator position, I first, I last) {
        iterator it = position.__const_cast();
        for (; first != last; ++first)
            it = emplace_after(it, *first);
        return it;
    }
    iterator insert_after(const_iterator position, initializer_list<T> list) {
        return insert_after(position, list.begin(), list.end());
    }
    iterator erase_after(const_iterator position) noexcept {
        __slist_links* previous = const_cast<__slist_links*>(position.__node);
        __slist_links* node = previous->__next;
        previous->__next = node->__next;
        __drop(node);
        return iterator(previous->__next);
    }
    iterator erase_after(const_iterator position, const_iterator last) noexcept {
        __slist_links* previous = const_cast<__slist_links*>(position.__node);
        while (previous->__next != last.__node)
            erase_after(position);
        return last.__const_cast();
    }
    void clear() noexcept {
        __slist_links* node = __head.__next;
        while (node != 0) {
            __slist_links* next = node->__next;
            __drop(node);
            node = next;
        }
        __head.__next = 0;
    }
    void swap(forward_list& other) noexcept { std::swap(__head.__next, other.__head.__next); }
    void resize(size_t n) {
        iterator it = before_begin();
        size_t count = 0;
        while (it.__node->__next != 0 && count < n) {
            ++it;
            ++count;
        }
        if (count == n)
            erase_after(it, end());
        for (; count < n; ++count)
            it = emplace_after(it);
    }
    void resize(size_t n, const T& value) {
        iterator it = before_begin();
        size_t count = 0;
        while (it.__node->__next != 0 && count < n) {
            ++it;
            ++count;
        }
        if (count == n)
            erase_after(it, end());
        for (; count < n; ++count)
            it = emplace_after(it, value);
    }
    void splice_after(const_iterator position, forward_list& other) noexcept {
        if (other.empty())
            return;
        __slist_links* target = const_cast<__slist_links*>(position.__node);
        __slist_links* last = &other.__head;
        while (last->__next != 0)
            last = last->__next;
        last->__next = target->__next;
        target->__next = other.__head.__next;
        other.__head.__next = 0;
    }
    void splice_after(const_iterator position, forward_list&& other) noexcept { splice_after(position, other); }
    void splice_after(const_iterator position, forward_list&, const_iterator it) noexcept {
        __slist_links* target = const_cast<__slist_links*>(position.__node);
        __slist_links* before = const_cast<__slist_links*>(it.__node);
        __slist_links* node = before->__next;
        if (target == before || target == node)
            return;
        before->__next = node->__next;
        node->__next = target->__next;
        target->__next = node;
    }
    template <class P> size_t remove_if(P p) {
        size_t count = 0;
        __slist_links* previous = &__head;
        while (previous->__next != 0) {
            if (p(static_cast<__node_type*>(previous->__next)->__value)) {
                erase_after(const_iterator(previous));
                ++count;
            } else {
                previous = previous->__next;
            }
        }
        return count;
    }
    size_t remove(const T& value) {
        size_t count = 0;
        __slist_links* previous = &__head;
        while (previous->__next != 0) {
            if (static_cast<__node_type*>(previous->__next)->__value == value) {
                erase_after(const_iterator(previous));
                ++count;
            } else {
                previous = previous->__next;
            }
        }
        return count;
    }
    template <class P> size_t unique(P p) {
        size_t count = 0;
        __slist_links* node = __head.__next;
        while (node != 0 && node->__next != 0) {
            if (p(static_cast<__node_type*>(node)->__value, static_cast<__node_type*>(node->__next)->__value)) {
                erase_after(const_iterator(node));
                ++count;
            } else {
                node = node->__next;
            }
        }
        return count;
    }
    size_t unique() { return unique(__equal_iterators()); }
    template <class C> void merge(forward_list& other, C comp) {
        if (&other == this)
            return;
        __slist_links* tail = &__head;
        while (tail->__next != 0 && other.__head.__next != 0) {
            if (comp(static_cast<__node_type*>(other.__head.__next)->__value,
                     static_cast<__node_type*>(tail->__next)->__value)) {
                __slist_links* node = other.__head.__next;
                other.__head.__next = node->__next;
                node->__next = tail->__next;
                tail->__next = node;
            }
            tail = tail->__next;
        }
        if (other.__head.__next != 0) {
            tail->__next = other.__head.__next;
            other.__head.__next = 0;
        }
    }
    template <class C> void merge(forward_list&& other, C comp) { merge(other, comp); }
    void merge(forward_list& other) { merge(other, __less_iterators()); }
    void merge(forward_list&& other) { merge(other, __less_iterators()); }
    template <class C> void sort(C comp) {
        list<T> nodes;
        while (!empty()) {
            nodes.push_back(std::move(front()));
            pop_front();
        }
        nodes.sort(comp);
        insert_after(before_begin(), std::make_move_iterator(nodes.begin()), std::make_move_iterator(nodes.end()));
    }
    void sort() { sort(__less_iterators()); }
    void reverse() noexcept {
        __slist_links* node = __head.__next;
        __slist_links* reversed = 0;
        while (node != 0) {
            __slist_links* next = node->__next;
            node->__next = reversed;
            reversed = node;
            node = next;
        }
        __head.__next = reversed;
    }
};
template <class I> forward_list(I, I) -> forward_list<typename iterator_traits<I>::value_type>;
template <class T, class A> bool operator==(const forward_list<T, A>& a, const forward_list<T, A>& b) {
    return std::equal(a.begin(), a.end(), b.begin(), b.end());
}
template <class T, class A> bool operator!=(const forward_list<T, A>& a, const forward_list<T, A>& b) {
    return !(a == b);
}
template <class T, class A> bool operator<(const forward_list<T, A>& a, const forward_list<T, A>& b) {
    return std::lexicographical_compare(a.begin(), a.end(), b.begin(), b.end());
}
template <class T, class A> void swap(forward_list<T, A>& a, forward_list<T, A>& b) noexcept { a.swap(b); }
}
`);

    X.addHeader('v4script/stack', [
        ['std', 3, 35, 'stack'],
        ['std', 36, 36, 'stack'],
        ['std', 37, 37, 'swap']
    ], String.raw`
namespace std {
template <class T, class C = deque<T>> class stack {
protected:
    C c;
public:
    typedef C container_type;
    typedef typename C::value_type value_type;
    typedef typename C::size_type size_type;
    typedef typename C::reference reference;
    typedef typename C::const_reference const_reference;
    stack() : c() {}
    explicit stack(const C& container) : c(container) {}
    explicit stack(C&& container) : c(std::move(container)) {}
    bool empty() const { return c.empty(); }
    size_type size() const { return c.size(); }
    reference top() { return c.back(); }
    const_reference top() const { return c.back(); }
    void push(const value_type& value) { c.push_back(value); }
    void push(value_type&& value) { c.push_back(std::move(value)); }
    template <class... Args> decltype(auto) emplace(Args&&... args) {
        return c.emplace_back(std::forward<Args>(args)...);
    }
    void pop() { c.pop_back(); }
    void swap(stack& other) noexcept {
        using std::swap;
        swap(c, other.c);
    }
    bool operator==(const stack& other) const { return c == other.c; }
    bool operator!=(const stack& other) const { return c != other.c; }
    bool operator<(const stack& other) const { return c < other.c; }
    bool operator>(const stack& other) const { return c > other.c; }
    bool operator<=(const stack& other) const { return c <= other.c; }
    bool operator>=(const stack& other) const { return c >= other.c; }
};
template <class C> stack(C) -> stack<typename C::value_type, C>;
template <class T, class C> void swap(stack<T, C>& a, stack<T, C>& b) noexcept { a.swap(b); }
}
`);

    X.addHeader('v4script/queue', [
        ['std', 3, 34, 'queue'],
        ['std', 35, 35, 'queue'],
        ['std', 36, 36, 'swap'],
        ['std', 38, 90, 'priority_queue'],
        ['std', 91, 93, 'swap']
    ], String.raw`
namespace std {
template <class T, class C = deque<T>> class queue {
protected:
    C c;
public:
    typedef C container_type;
    typedef typename C::value_type value_type;
    typedef typename C::size_type size_type;
    typedef typename C::reference reference;
    typedef typename C::const_reference const_reference;
    queue() : c() {}
    explicit queue(const C& container) : c(container) {}
    explicit queue(C&& container) : c(std::move(container)) {}
    bool empty() const { return c.empty(); }
    size_type size() const { return c.size(); }
    reference front() { return c.front(); }
    const_reference front() const { return c.front(); }
    reference back() { return c.back(); }
    const_reference back() const { return c.back(); }
    void push(const value_type& value) { c.push_back(value); }
    void push(value_type&& value) { c.push_back(std::move(value)); }
    template <class... Args> decltype(auto) emplace(Args&&... args) {
        return c.emplace_back(std::forward<Args>(args)...);
    }
    void pop() { c.pop_front(); }
    void swap(queue& other) noexcept {
        using std::swap;
        swap(c, other.c);
    }
    bool operator==(const queue& other) const { return c == other.c; }
    bool operator!=(const queue& other) const { return c != other.c; }
    bool operator<(const queue& other) const { return c < other.c; }
};
template <class C> queue(C) -> queue<typename C::value_type, C>;
template <class T, class C> void swap(queue<T, C>& a, queue<T, C>& b) noexcept { a.swap(b); }

template <class T, class C = vector<T>, class P = less<typename C::value_type>> class priority_queue {
protected:
    C c;
    P comp;
public:
    typedef C container_type;
    typedef P value_compare;
    typedef typename C::value_type value_type;
    typedef typename C::size_type size_type;
    typedef typename C::reference reference;
    typedef typename C::const_reference const_reference;
    priority_queue() : c(), comp() {}
    explicit priority_queue(const P& compare) : c(), comp(compare) {}
    priority_queue(const P& compare, const C& container) : c(container), comp(compare) {
        std::make_heap(c.begin(), c.end(), comp);
    }
    priority_queue(const P& compare, C&& container) : c(std::move(container)), comp(compare) {
        std::make_heap(c.begin(), c.end(), comp);
    }
    template <class I, class = typename enable_if<!is_integral<I>::value>::type>
    priority_queue(I first, I last, const P& compare = P()) : c(first, last), comp(compare) {
        std::make_heap(c.begin(), c.end(), comp);
    }
    template <class I> priority_queue(I first, I last, const P& compare, const C& container)
        : c(container), comp(compare) {
        c.insert(c.end(), first, last);
        std::make_heap(c.begin(), c.end(), comp);
    }
    bool empty() const { return c.empty(); }
    size_type size() const { return c.size(); }
    const_reference top() const { return c.front(); }
    void push(const value_type& value) {
        c.push_back(value);
        std::push_heap(c.begin(), c.end(), comp);
    }
    void push(value_type&& value) {
        c.push_back(std::move(value));
        std::push_heap(c.begin(), c.end(), comp);
    }
    template <class... Args> void emplace(Args&&... args) {
        c.emplace_back(std::forward<Args>(args)...);
        std::push_heap(c.begin(), c.end(), comp);
    }
    void pop() {
        std::pop_heap(c.begin(), c.end(), comp);
        c.pop_back();
    }
    void swap(priority_queue& other) noexcept {
        using std::swap;
        swap(c, other.c);
        swap(comp, other.comp);
    }
};
template <class T, class C, class P> void swap(priority_queue<T, C, P>& a, priority_queue<T, C, P>& b) noexcept {
    a.swap(b);
}
}
`);
})(globalThis);
