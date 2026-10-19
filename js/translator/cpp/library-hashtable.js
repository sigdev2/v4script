// C++ library: <unordered_map> and <unordered_set>. The table behaves as
// libstdc++ does (observed from its output): one list of all nodes, a
// bucket points to the node before its first node, a new key goes to the
// front of its bucket or of the list; the bucket counts come from the same
// table of primes and grow at the same sizes, so the iteration order is
// the one of g++.
// The tables of declarations are written by tools/build-cpp-library.mjs.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    if (X.headers['v4script/hashtable'])
        return;

    X.addHeader('v4script/hashtable', [
        ['std', 3, 5, '__hash_links'],
        ['std', 6, 9, '__hash_node'],
        ['std', 12, 43, '__hash_primes'],
        ['std', 47, 87, '__hash_policy'],
        ['std', 89, 111, '__hash_iterator'],
        ['std', 112, 135, '__hash_const_iterator'],
        ['std', 136, 138, 'operator=='],
        ['std', 139, 141, 'operator!='],
        ['std', 143, 170, '__hash_local_iterator'],
        ['std', 174, 636, '__hashtable'],
        ['std', 637, 639, '__hash_set_key'],
        ['std', 640, 642, '__hash_map_key']
    ], String.raw`
namespace std {
struct __hash_links {
    __hash_links* __next;
};
template <class V> struct __hash_node : __hash_links {
    V __value;
    size_t __hash;
};

// The bucket counts libstdc++ chooses (observed with g++ 13).
inline const unsigned long* __hash_primes(size_t& count) noexcept {
    static const unsigned long primes[] = {
    17UL, 19UL, 23UL, 29UL, 31UL, 37UL, 41UL, 43UL, 47UL, 53UL, 59UL, 61UL, 67UL, 71UL, 73UL, 79UL,
    83UL, 89UL, 97UL, 103UL, 109UL, 113UL, 127UL, 137UL, 139UL, 149UL, 157UL, 167UL, 179UL, 193UL,
    199UL, 211UL, 227UL, 241UL, 257UL, 277UL, 293UL, 313UL, 337UL, 359UL, 383UL, 409UL, 439UL, 467UL,
    503UL, 541UL, 577UL, 619UL, 661UL, 709UL, 761UL, 823UL, 887UL, 953UL, 1031UL, 1109UL, 1193UL,
    1289UL, 1381UL, 1493UL, 1613UL, 1741UL, 1879UL, 2029UL, 2179UL, 2357UL, 2549UL, 2753UL, 2971UL,
    3209UL, 3469UL, 3739UL, 4027UL, 4349UL, 4703UL, 5087UL, 5503UL, 5953UL, 6427UL, 6949UL, 7517UL,
    8123UL, 8783UL, 9497UL, 10273UL, 11113UL, 12011UL, 12983UL, 14033UL, 15173UL, 16411UL, 17749UL,
    19183UL, 20753UL, 22447UL, 24281UL, 26267UL, 28411UL, 30727UL, 33223UL, 35933UL, 38873UL, 42043UL,
    45481UL, 49201UL, 53201UL, 57557UL, 62233UL, 67307UL, 72817UL, 78779UL, 85229UL, 92203UL, 99733UL,
    107897UL, 116731UL, 126271UL, 136607UL, 147793UL, 159871UL, 172933UL, 187091UL, 202409UL, 218971UL,
    236897UL, 256279UL, 277261UL, 299951UL, 324503UL, 351061UL, 379787UL, 410857UL, 444487UL, 480881UL,
    520241UL, 562841UL, 608903UL, 658753UL, 712697UL, 771049UL, 834181UL, 902483UL, 976369UL, 1056323UL,
    1142821UL, 1236397UL, 1337629UL, 1447153UL, 1565659UL, 1693859UL, 1832561UL, 1982627UL, 2144977UL,
    2320627UL, 2510653UL, 2716249UL, 2938679UL, 3179303UL, 3439651UL, 3721303UL, 4026031UL, 4355707UL,
    4712381UL, 5098259UL, 5515729UL, 5967347UL, 6456007UL, 6984629UL, 7556579UL, 8175383UL, 8844859UL,
    9569143UL, 10352717UL, 11200489UL, 12117689UL, 13109983UL, 14183539UL, 15345007UL, 16601593UL,
    17961079UL, 19431899UL, 21023161UL, 22744717UL, 24607243UL, 26622317UL, 28802401UL, 31160981UL,
    33712729UL, 36473443UL, 39460231UL, 42691603UL, 46187573UL, 49969847UL, 54061849UL, 58488943UL,
    63278561UL, 68460391UL, 74066549UL, 80131819UL, 86693767UL, 93793069UL, 101473717UL, 109783337UL,
    118773397UL, 128499677UL, 139022417UL, 150406843UL, 162723577UL, 176048909UL, 190465427UL,
    206062531UL, 222936881UL, 241193053UL, 260944219UL, 282312799UL, 305431229UL, 330442829UL,
    357502601UL, 386778277UL, 418451333UL, 452718089UL, 489790921UL, 529899637UL, 573292817UL,
    620239453UL, 671030513UL, 725980837UL, 785430967UL, 849749479UL, 919334987UL, 994618837UL,
    1076067617UL, 1164186217UL, 1259520799UL, 1362662261UL, 1474249943UL, 1594975441UL, 1725587117UL,
    1866894511UL, 2019773507UL, 2185171673UL, 2364114217UL, 2557710269UL, 2767159799UL, 2993761039UL,
    3238918481UL, 3504151727UL, 3791104843UL, 4101556399UL, 4294967291UL
    };
    count = sizeof primes / sizeof primes[0];
    return primes;
}

// The load policy: the bucket count for a request and the size that
// triggers the next growth.
struct __hash_policy {
    float __max_load;
    size_t __next_resize;
    explicit __hash_policy(float max_load = 1.0f) noexcept : __max_load(max_load), __next_resize(0) {}
    size_t __next_bucket(size_t n) noexcept {
        static const unsigned char small[14] = {2, 2, 2, 3, 5, 5, 7, 7, 11, 11, 11, 11, 13, 13};
        if (n < 14) {
            if (n == 0)
                return 1;
            __next_resize = (size_t)::floor(small[n] * (double)__max_load);
            return small[n];
        }
        size_t count = 0;
        const unsigned long* primes = __hash_primes(count);
        const unsigned long* found = std::lower_bound(primes, primes + count, n);
        if (found == primes + count) {
            __next_resize = size_t(-1);
            return n;
        }
        __next_resize = (size_t)::floor(*found * (double)__max_load);
        return *found;
    }
    size_t __buckets_for(size_t elements) const noexcept {
        return (size_t)::ceil(elements / (double)__max_load);
    }
    // 0 when no rehash is needed, else the new bucket count.
    size_t __need_rehash(size_t buckets, size_t elements, size_t added) noexcept {
        if (elements + added <= __next_resize)
            return 0;
        size_t wanted = elements + added;
        if (__next_resize == 0 && wanted < 11)
            wanted = 11;
        double minimum = wanted / (double)__max_load;
        if (minimum >= buckets) {
            size_t grown = (size_t)::floor(minimum) + 1;
            return __next_bucket(grown > buckets * 2 ? grown : buckets * 2);
        }
        __next_resize = (size_t)::floor(buckets * (double)__max_load);
        return 0;
    }
};

template <class V> struct __hash_iterator {
    typedef forward_iterator_tag iterator_category;
    typedef V value_type;
    typedef ptrdiff_t difference_type;
    typedef V* pointer;
    typedef V& reference;
    __hash_links* __node;
    __hash_iterator() noexcept : __node(0) {}
    explicit __hash_iterator(__hash_links* node) noexcept : __node(node) {}
    V& operator*() const noexcept { return static_cast<__hash_node<V>*>(__node)->__value; }
    V* operator->() const noexcept { return &static_cast<__hash_node<V>*>(__node)->__value; }
    __hash_iterator& operator++() noexcept {
        __node = __node->__next;
        return *this;
    }
    __hash_iterator operator++(int) noexcept {
        __hash_iterator tmp = *this;
        __node = __node->__next;
        return tmp;
    }
    bool operator==(const __hash_iterator& other) const noexcept { return __node == other.__node; }
    bool operator!=(const __hash_iterator& other) const noexcept { return __node != other.__node; }
};
template <class V> struct __hash_const_iterator {
    typedef forward_iterator_tag iterator_category;
    typedef V value_type;
    typedef ptrdiff_t difference_type;
    typedef const V* pointer;
    typedef const V& reference;
    __hash_links* __node;
    __hash_const_iterator() noexcept : __node(0) {}
    explicit __hash_const_iterator(const __hash_links* node) noexcept : __node(const_cast<__hash_links*>(node)) {}
    __hash_const_iterator(const __hash_iterator<V>& other) noexcept : __node(other.__node) {}
    const V& operator*() const noexcept { return static_cast<__hash_node<V>*>(__node)->__value; }
    const V* operator->() const noexcept { return &static_cast<__hash_node<V>*>(__node)->__value; }
    __hash_const_iterator& operator++() noexcept {
        __node = __node->__next;
        return *this;
    }
    __hash_const_iterator operator++(int) noexcept {
        __hash_const_iterator tmp = *this;
        __node = __node->__next;
        return tmp;
    }
    bool operator==(const __hash_const_iterator& other) const noexcept { return __node == other.__node; }
    bool operator!=(const __hash_const_iterator& other) const noexcept { return __node != other.__node; }
};
template <class V> bool operator==(const __hash_iterator<V>& a, const __hash_const_iterator<V>& b) noexcept {
    return a.__node == b.__node;
}
template <class V> bool operator!=(const __hash_iterator<V>& a, const __hash_const_iterator<V>& b) noexcept {
    return a.__node != b.__node;
}
// The nodes of one bucket.
template <class V> struct __hash_local_iterator {
    typedef forward_iterator_tag iterator_category;
    typedef V value_type;
    typedef ptrdiff_t difference_type;
    typedef const V* pointer;
    typedef const V& reference;
    __hash_links* __node;
    size_t __bucket;
    size_t __count;
    __hash_local_iterator() noexcept : __node(0), __bucket(0), __count(1) {}
    __hash_local_iterator(__hash_links* node, size_t bucket, size_t count) noexcept
        : __node(node), __bucket(bucket), __count(count) {}
    const V& operator*() const noexcept { return static_cast<__hash_node<V>*>(__node)->__value; }
    const V* operator->() const noexcept { return &static_cast<__hash_node<V>*>(__node)->__value; }
    __hash_local_iterator& operator++() noexcept {
        __node = __node->__next;
        if (__node != 0 && static_cast<__hash_node<V>*>(__node)->__hash % __count != __bucket)
            __node = 0;
        return *this;
    }
    __hash_local_iterator operator++(int) noexcept {
        __hash_local_iterator tmp = *this;
        ++*this;
        return tmp;
    }
    bool operator==(const __hash_local_iterator& other) const noexcept { return __node == other.__node; }
    bool operator!=(const __hash_local_iterator& other) const noexcept { return __node != other.__node; }
};

// K the key, V the value, X the key of a value (X::key(v)), H the hash, E
// the equality; U - unique keys.
template <class K, class V, class X, class H, class E, bool U> class __hashtable {
public:
    typedef __hash_node<V> __node_type;
    typedef __hash_iterator<V> iterator;
    typedef __hash_const_iterator<V> const_iterator;
    typedef __hash_local_iterator<V> local_iterator;

    __hash_links** __buckets;
    size_t __bucket_count;
    __hash_links __before_begin;
    size_t __element_count;
    __hash_policy __policy;
    __hash_links* __single_bucket;
    H __hasher;
    E __equal;

    explicit __hashtable(size_t hint = 0, const H& hasher = H(), const E& equal = E())
        : __buckets(&__single_bucket), __bucket_count(1), __element_count(0), __policy(), __single_bucket(0),
          __hasher(hasher), __equal(equal) {
        __before_begin.__next = 0;
        size_t n = __policy.__next_bucket(hint);
        if (n > __bucket_count) {
            __buckets = __new_buckets(n);
            __bucket_count = n;
        }
    }
    __hashtable(const __hashtable& other)
        : __buckets(&__single_bucket), __bucket_count(1), __element_count(0), __policy(other.__policy),
          __single_bucket(0), __hasher(other.__hasher), __equal(other.__equal) {
        __before_begin.__next = 0;
        __assign(other);
    }
    __hashtable(__hashtable&& other) noexcept
        : __buckets(&__single_bucket), __bucket_count(1), __element_count(0), __policy(other.__policy),
          __single_bucket(0), __hasher(other.__hasher), __equal(other.__equal) {
        __before_begin.__next = 0;
        __steal(other);
    }
    ~__hashtable() {
        clear();
        __free_buckets();
    }
    __hashtable& operator=(const __hashtable& other) {
        if (&other != this) {
            clear();
            __hasher = other.__hasher;
            __equal = other.__equal;
            __policy = other.__policy;
            __assign(other);
        }
        return *this;
    }
    __hashtable& operator=(__hashtable&& other) noexcept {
        if (&other != this) {
            clear();
            __free_buckets();
            __buckets = &__single_bucket;
            __bucket_count = 1;
            __hasher = other.__hasher;
            __equal = other.__equal;
            __policy = other.__policy;
            __steal(other);
        }
        return *this;
    }
    void swap(__hashtable& other) noexcept {
        __hashtable tmp(std::move(other));
        other.__free_buckets();
        other.__buckets = &other.__single_bucket;
        other.__bucket_count = 1;
        other.__policy = __policy;
        other.__steal(*this);
        __free_buckets();
        __buckets = &__single_bucket;
        __bucket_count = 1;
        __policy = tmp.__policy;
        __steal(tmp);
        std::swap(__hasher, other.__hasher);
        std::swap(__equal, other.__equal);
    }

    static __hash_links** __new_buckets(size_t n) {
        __hash_links** buckets = static_cast<__hash_links**>(__allocate(n * sizeof(__hash_links*)));
        memset(buckets, 0, n * sizeof(__hash_links*));
        return buckets;
    }
    void __free_buckets() noexcept {
        if (__buckets != &__single_bucket)
            __deallocate(__buckets);
    }
    // Takes the nodes of other (this has no nodes and one bucket); other
    // is left empty with one bucket.
    void __steal(__hashtable& other) noexcept {
        if (other.__buckets == &other.__single_bucket) {
            __single_bucket = other.__single_bucket;
            __buckets = &__single_bucket;
        } else {
            __buckets = other.__buckets;
        }
        __bucket_count = other.__bucket_count;
        __before_begin.__next = other.__before_begin.__next;
        __element_count = other.__element_count;
        if (__before_begin.__next != 0)
            __buckets[__index_of(__before_begin.__next)] = &__before_begin;
        other.__buckets = &other.__single_bucket;
        other.__single_bucket = 0;
        other.__bucket_count = 1;
        other.__before_begin.__next = 0;
        other.__element_count = 0;
        other.__policy.__next_resize = 0;
    }
    // A copy of the nodes of other in their order, with its bucket count.
    void __assign(const __hashtable& other) {
        if (other.__bucket_count != __bucket_count) {
            __free_buckets();
            if (other.__bucket_count == 1) {
                __single_bucket = 0;
                __buckets = &__single_bucket;
            } else {
                __buckets = __new_buckets(other.__bucket_count);
            }
            __bucket_count = other.__bucket_count;
        }
        __hash_links* previous = &__before_begin;
        for (const __hash_links* node = other.__before_begin.__next; node != 0; node = node->__next) {
            const __node_type* source = static_cast<const __node_type*>(node);
            __hash_links* copy = __make(source->__value);
            static_cast<__node_type*>(copy)->__hash = source->__hash;
            previous->__next = copy;
            size_t bucket = __index_of(copy);
            if (__buckets[bucket] == 0)
                __buckets[bucket] = previous;
            previous = copy;
            ++__element_count;
        }
        previous->__next = 0;
    }

    size_t __index_of(const __hash_links* node) const noexcept {
        return static_cast<const __node_type*>(node)->__hash % __bucket_count;
    }
    static const K& __key(const __hash_links* node) noexcept {
        return X::key(static_cast<const __node_type*>(node)->__value);
    }
    template <class... Args> __hash_links* __make(Args&&... args) {
        __node_type* node = static_cast<__node_type*>(__allocate(sizeof(__node_type)));
        try {
            ::new (static_cast<void*>(&node->__value)) V(std::forward<Args>(args)...);
        } catch (...) {
            __deallocate(node);
            throw;
        }
        node->__next = 0;
        return node;
    }
    void __drop(__hash_links* link) noexcept {
        __node_type* node = static_cast<__node_type*>(link);
        node->__value.~V();
        __deallocate(node);
    }
    void clear() noexcept {
        __hash_links* node = __before_begin.__next;
        while (node != 0) {
            __hash_links* next = node->__next;
            __drop(node);
            node = next;
        }
        memset(__buckets, 0, __bucket_count * sizeof(__hash_links*));
        __before_begin.__next = 0;
        __element_count = 0;
    }

    iterator begin() noexcept { return iterator(__before_begin.__next); }
    const_iterator begin() const noexcept { return const_iterator(__before_begin.__next); }
    iterator end() noexcept { return iterator(0); }
    const_iterator end() const noexcept { return const_iterator(0); }
    size_t size() const noexcept { return __element_count; }
    bool empty() const noexcept { return __element_count == 0; }

    // The node before the first node of the key in its bucket, or null.
    template <class Key> __hash_links* __find_before(size_t bucket, const Key& key, size_t hash) const {
        __hash_links* previous = __buckets[bucket];
        if (previous == 0)
            return 0;
        for (__hash_links* node = previous->__next;; previous = node, node = node->__next) {
            if (static_cast<__node_type*>(node)->__hash == hash && __equal(key, __key(node)))
                return previous;
            if (node->__next == 0 || __index_of(node->__next) != bucket)
                return 0;
        }
    }
    template <class Key> __hash_links* __find(const Key& key) const {
        size_t hash = __hasher(key);
        __hash_links* previous = __find_before(hash % __bucket_count, key, hash);
        return previous == 0 ? 0 : previous->__next;
    }
    template <class Key> size_t __count_of(const Key& key) const {
        __hash_links* node = __find(key);
        if (node == 0)
            return 0;
        size_t n = 1;
        if (!U) {
            for (node = node->__next; node != 0 && __equal(key, __key(node)); node = node->__next)
                ++n;
        }
        return n;
    }
    template <class Key> pair<__hash_links*, __hash_links*> __range(const Key& key) const {
        __hash_links* first = __find(key);
        if (first == 0)
            return pair<__hash_links*, __hash_links*>(0, 0);
        __hash_links* last = first->__next;
        if (!U) {
            while (last != 0 && __equal(key, __key(last)))
                last = last->__next;
        }
        return pair<__hash_links*, __hash_links*>(first, last);
    }

    void __link_at_bucket_begin(size_t bucket, __hash_links* node) noexcept {
        if (__buckets[bucket] != 0) {
            node->__next = __buckets[bucket]->__next;
            __buckets[bucket]->__next = node;
        } else {
            node->__next = __before_begin.__next;
            __before_begin.__next = node;
            if (node->__next != 0)
                __buckets[__index_of(node->__next)] = node;
            __buckets[bucket] = &__before_begin;
        }
    }
    void __rehash_to(size_t n) {
        __hash_links** fresh;
        if (n == 1) {
            __single_bucket = 0;
            fresh = &__single_bucket;
        } else {
            fresh = __new_buckets(n);
        }
        __hash_links* node = __before_begin.__next;
        __before_begin.__next = 0;
        size_t begin_bucket = 0;
        __hash_links* previous = 0;
        size_t previous_bucket = 0;
        while (node != 0) {
            __hash_links* next = node->__next;
            size_t bucket = static_cast<__node_type*>(node)->__hash % n;
            if (!U && previous != 0 && previous_bucket == bucket) {
                // Equal keys stay together and in order.
                node->__next = previous->__next;
                previous->__next = node;
                if (node->__next != 0) {
                    size_t following = static_cast<__node_type*>(node->__next)->__hash % n;
                    if (following != bucket)
                        fresh[following] = node;
                }
            } else if (fresh[bucket] == 0) {
                node->__next = __before_begin.__next;
                __before_begin.__next = node;
                fresh[bucket] = &__before_begin;
                if (node->__next != 0)
                    fresh[begin_bucket] = node;
                begin_bucket = bucket;
            } else {
                node->__next = fresh[bucket]->__next;
                fresh[bucket]->__next = node;
            }
            previous = node;
            previous_bucket = bucket;
            node = next;
        }
        if (__buckets != &__single_bucket && __buckets != fresh)
            __deallocate(__buckets);
        __buckets = fresh;
        __bucket_count = n;
    }
    // A new node (its key absent for unique tables).
    __hash_links* __insert_node(size_t hash, __hash_links* node, __hash_links* hint) {
        static_cast<__node_type*>(node)->__hash = hash;
        size_t grow = __policy.__need_rehash(__bucket_count, __element_count, 1);
        if (grow != 0)
            __rehash_to(grow);
        size_t bucket = hash % __bucket_count;
        if (U) {
            __link_at_bucket_begin(bucket, node);
        } else {
            // Next to an equal node: after the hint or before the first one.
            const K& key = __key(node);
            __hash_links* previous = 0;
            if (hint != 0 && static_cast<__node_type*>(hint)->__hash == hash && __equal(key, __key(hint)))
                previous = hint;
            else
                previous = __find_before(bucket, key, hash);
            if (previous != 0) {
                node->__next = previous->__next;
                previous->__next = node;
                if (previous == hint && node->__next != 0 && !__equal(key, __key(node->__next))) {
                    size_t following = __index_of(node->__next);
                    if (following != bucket)
                        __buckets[following] = node;
                }
            } else {
                __link_at_bucket_begin(bucket, node);
            }
        }
        ++__element_count;
        return node;
    }
    template <class... Args> pair<iterator, bool> __emplace(Args&&... args) {
        __hash_links* node = __make(std::forward<Args>(args)...);
        const K& key = __key(node);
        size_t hash;
        try {
            hash = __hasher(key);
        } catch (...) {
            __drop(node);
            throw;
        }
        if (U) {
            __hash_links* previous = __find_before(hash % __bucket_count, key, hash);
            if (previous != 0) {
                __drop(node);
                return pair<iterator, bool>(iterator(previous->__next), false);
            }
        }
        return pair<iterator, bool>(iterator(__insert_node(hash, node, 0)), true);
    }
    template <class... Args> iterator __emplace_hint(const_iterator hint, Args&&... args) {
        if (U)
            return __emplace(std::forward<Args>(args)...).first;
        __hash_links* node = __make(std::forward<Args>(args)...);
        size_t hash = __hasher(__key(node));
        return iterator(__insert_node(hash, node, hint.__node));
    }
    template <class Value> pair<iterator, bool> __insert(Value&& value) {
        if (U) {
            const K& key = X::key(value);
            size_t hash = __hasher(key);
            __hash_links* previous = __find_before(hash % __bucket_count, key, hash);
            if (previous != 0)
                return pair<iterator, bool>(iterator(previous->__next), false);
            __hash_links* node = __make(std::forward<Value>(value));
            return pair<iterator, bool>(iterator(__insert_node(hash, node, 0)), true);
        }
        return __emplace(std::forward<Value>(value));
    }
    template <class I> void __insert_range(I first, I last, input_iterator_tag) {
        for (; first != last; ++first)
            __insert(*first);
    }
    template <class I> void __insert_range(I first, I last, forward_iterator_tag) {
        if (!U) {
            size_t grow = __policy.__need_rehash(__bucket_count, __element_count, std::distance(first, last));
            if (grow != 0)
                __rehash_to(grow);
        }
        for (; first != last; ++first)
            __insert(*first);
    }
    // The bucket count for n elements before inserting them (multi tables).
    void __presize(size_t n, size_t hint) {
        size_t wanted = __policy.__buckets_for(n);
        size_t buckets = __policy.__next_bucket(wanted > hint ? wanted : hint);
        if (buckets > __bucket_count) {
            __free_buckets();
            __buckets = __new_buckets(buckets);
            __bucket_count = buckets;
        }
    }

    iterator __erase_node(size_t bucket, __hash_links* previous, __hash_links* node) noexcept {
        __hash_links* next = node->__next;
        if (previous == __buckets[bucket]) {
            if (next == 0 || __index_of(next) != bucket) {
                if (next != 0)
                    __buckets[__index_of(next)] = previous;
                __buckets[bucket] = 0;
            }
        } else if (next != 0) {
            size_t following = __index_of(next);
            if (following != bucket)
                __buckets[following] = previous;
        }
        previous->__next = next;
        __drop(node);
        --__element_count;
        return iterator(next);
    }
    iterator __erase(const_iterator position) noexcept {
        __hash_links* node = position.__node;
        size_t bucket = __index_of(node);
        __hash_links* previous = __buckets[bucket];
        while (previous->__next != node)
            previous = previous->__next;
        return __erase_node(bucket, previous, node);
    }
    iterator __erase(const_iterator first, const_iterator last) noexcept {
        while (first != last)
            first = __erase(first);
        return iterator(last.__node);
    }
    template <class Key> size_t __erase_key(const Key& key) {
        size_t hash = __hasher(key);
        size_t bucket = hash % __bucket_count;
        __hash_links* previous = __find_before(bucket, key, hash);
        if (previous == 0)
            return 0;
        size_t n = 0;
        do {
            __erase_node(bucket, previous, previous->__next);
            ++n;
        } while (!U && previous->__next != 0 && __equal(key, __key(previous->__next)));
        return n;
    }

    void rehash(size_t n) {
        size_t saved = __policy.__next_resize;
        size_t wanted = __policy.__buckets_for(__element_count + 1);
        size_t buckets = __policy.__next_bucket(wanted > n ? wanted : n);
        if (buckets != __bucket_count)
            __rehash_to(buckets);
        else
            __policy.__next_resize = saved;
    }
    void reserve(size_t n) { rehash(__policy.__buckets_for(n)); }
    float load_factor() const noexcept { return (float)__element_count / (float)__bucket_count; }
    float max_load_factor() const noexcept { return __policy.__max_load; }
    void max_load_factor(float z) noexcept { __policy = __hash_policy(z); }
    template <class Key> size_t bucket(const Key& key) const { return __hasher(key) % __bucket_count; }
    size_t bucket_size(size_t n) const noexcept {
        size_t count = 0;
        for (local_iterator it = begin(n); it != end(n); ++it)
            ++count;
        return count;
    }
    local_iterator begin(size_t n) const noexcept {
        __hash_links* before = __buckets[n];
        return local_iterator(before == 0 ? 0 : before->__next, n, __bucket_count);
    }
    local_iterator end(size_t n) const noexcept { return local_iterator(0, n, __bucket_count); }
    bool __equals(const __hashtable& other) const {
        if (__element_count != other.__element_count)
            return false;
        for (const __hash_links* node = __before_begin.__next; node != 0;) {
            const K& key = __key(node);
            size_t own = 0;
            const __hash_links* run = node;
            while (run != 0 && __equal(key, __key(run))) {
                ++own;
                run = run->__next;
            }
            pair<__hash_links*, __hash_links*> found = other.__range(key);
            size_t theirs = 0;
            for (const __hash_links* it = found.first; it != found.second; it = it->__next)
                ++theirs;
            if (own != theirs || !std::is_permutation(const_iterator(node), const_iterator(run),
                                                      const_iterator(found.first)))
                return false;
            node = run;
        }
        return true;
    }
};
template <class K> struct __hash_set_key {
    static const K& key(const K& value) noexcept { return value; }
};
template <class K, class T> struct __hash_map_key {
    static const K& key(const pair<const K, T>& value) noexcept { return value.first; }
};
}
`);

    X.addHeader('v4script/unordered_map', [
        ['std', 3, 177, 'unordered_map'],
        ['std', 178, 181, 'operator=='],
        ['std', 182, 185, 'operator!='],
        ['std', 186, 189, 'swap'],
        ['std', 191, 296, 'unordered_multimap'],
        ['std', 297, 300, 'operator=='],
        ['std', 301, 304, 'operator!='],
        ['std', 305, 308, 'swap']
    ], String.raw`
namespace std {
template <class K, class T, class H = hash<K>, class E = equal_to<K>, class A = allocator<pair<const K, T>>>
class unordered_map {
public:
    typedef K key_type;
    typedef T mapped_type;
    typedef pair<const K, T> value_type;
    typedef size_t size_type;
    typedef ptrdiff_t difference_type;
    typedef H hasher;
    typedef E key_equal;
    typedef A allocator_type;
    typedef value_type& reference;
    typedef const value_type& const_reference;
    typedef value_type* pointer;
    typedef const value_type* const_pointer;
    typedef __hashtable<K, value_type, __hash_map_key<K, T>, H, E, true> __table_type;
    typedef typename __table_type::iterator iterator;
    typedef typename __table_type::const_iterator const_iterator;
    typedef typename __table_type::local_iterator local_iterator;
    typedef typename __table_type::local_iterator const_local_iterator;

    __table_type __table;

    unordered_map() : __table() {}
    explicit unordered_map(size_t buckets, const H& hasher = H(), const E& equal = E(), const A& = A())
        : __table(buckets, hasher, equal) {}
    template <class I>
    unordered_map(I first, I last, size_t buckets = 0, const H& hasher = H(), const E& equal = E(), const A& = A())
        : __table(buckets, hasher, equal) {
        insert(first, last);
    }
    unordered_map(initializer_list<value_type> list, size_t buckets = 0, const H& hasher = H(), const E& equal = E(),
                  const A& = A())
        : __table(buckets, hasher, equal) {
        insert(list.begin(), list.end());
    }
    unordered_map& operator=(initializer_list<value_type> list) {
        clear();
        insert(list.begin(), list.end());
        return *this;
    }
    allocator_type get_allocator() const noexcept { return A(); }

    iterator begin() noexcept { return __table.begin(); }
    const_iterator begin() const noexcept { return __table.begin(); }
    iterator end() noexcept { return __table.end(); }
    const_iterator end() const noexcept { return __table.end(); }
    const_iterator cbegin() const noexcept { return __table.begin(); }
    const_iterator cend() const noexcept { return __table.end(); }
    bool empty() const noexcept { return __table.empty(); }
    size_t size() const noexcept { return __table.size(); }
    size_t max_size() const noexcept { return 9223372036854775807UL / sizeof(typename __table_type::__node_type); }

    // A node with the key and the mapped value made from args.
    template <class Key, class... Args> iterator __emplace_key(size_t hash, Key&& key, Args&&... args) {
        typedef typename __table_type::__node_type N;
        N* node = static_cast<N*>(__allocate(sizeof(N)));
        K* first = const_cast<K*>(&node->__value.first);
        try {
            ::new (static_cast<void*>(first)) K(std::forward<Key>(key));
        } catch (...) {
            __deallocate(node);
            throw;
        }
        try {
            ::new (static_cast<void*>(&node->__value.second)) T(std::forward<Args>(args)...);
        } catch (...) {
            first->~K();
            __deallocate(node);
            throw;
        }
        return iterator(__table.__insert_node(hash, node, 0));
    }
    T& operator[](const K& key) {
        size_t hash = __table.__hasher(key);
        __hash_links* previous = __table.__find_before(hash % __table.__bucket_count, key, hash);
        if (previous != 0)
            return static_cast<typename __table_type::__node_type*>(previous->__next)->__value.second;
        return __emplace_key(hash, key)->second;
    }
    T& operator[](K&& key) {
        size_t hash = __table.__hasher(key);
        __hash_links* previous = __table.__find_before(hash % __table.__bucket_count, key, hash);
        if (previous != 0)
            return static_cast<typename __table_type::__node_type*>(previous->__next)->__value.second;
        return __emplace_key(hash, std::move(key))->second;
    }
    T& at(const K& key) {
        iterator it = find(key);
        if (it == end())
            throw out_of_range("unordered_map::at");
        return it->second;
    }
    const T& at(const K& key) const {
        const_iterator it = find(key);
        if (it == end())
            throw out_of_range("unordered_map::at");
        return it->second;
    }

    pair<iterator, bool> insert(const value_type& value) { return __table.__insert(value); }
    pair<iterator, bool> insert(value_type&& value) { return __table.__insert(std::move(value)); }
    template <class P, class = typename enable_if<!is_same<typename decay<P>::type, value_type>::value>::type>
    pair<iterator, bool> insert(P&& value) {
        return __table.__emplace(std::forward<P>(value));
    }
    iterator insert(const_iterator, const value_type& value) { return __table.__insert(value).first; }
    iterator insert(const_iterator, value_type&& value) { return __table.__insert(std::move(value)).first; }
    template <class I> void insert(I first, I last) {
        __table.__insert_range(first, last, typename iterator_traits<I>::iterator_category());
    }
    void insert(initializer_list<value_type> list) { insert(list.begin(), list.end()); }
    template <class... Args> pair<iterator, bool> emplace(Args&&... args) {
        return __table.__emplace(std::forward<Args>(args)...);
    }
    template <class... Args> iterator emplace_hint(const_iterator hint, Args&&... args) {
        return __table.__emplace_hint(hint, std::forward<Args>(args)...);
    }
    template <class... Args> pair<iterator, bool> try_emplace(const K& key, Args&&... args) {
        size_t hash = __table.__hasher(key);
        __hash_links* previous = __table.__find_before(hash % __table.__bucket_count, key, hash);
        if (previous != 0)
            return pair<iterator, bool>(iterator(previous->__next), false);
        return pair<iterator, bool>(__emplace_key(hash, key, std::forward<Args>(args)...), true);
    }
    template <class... Args> pair<iterator, bool> try_emplace(K&& key, Args&&... args) {
        size_t hash = __table.__hasher(key);
        __hash_links* previous = __table.__find_before(hash % __table.__bucket_count, key, hash);
        if (previous != 0)
            return pair<iterator, bool>(iterator(previous->__next), false);
        return pair<iterator, bool>(__emplace_key(hash, std::move(key), std::forward<Args>(args)...), true);
    }
    template <class M> pair<iterator, bool> insert_or_assign(const K& key, M&& value) {
        iterator it = find(key);
        if (it != end()) {
            it->second = std::forward<M>(value);
            return pair<iterator, bool>(it, false);
        }
        return pair<iterator, bool>(__emplace_key(__table.__hasher(key), key, std::forward<M>(value)), true);
    }
    iterator erase(const_iterator position) { return __table.__erase(position); }
    iterator erase(iterator position) { return __table.__erase(position); }
    iterator erase(const_iterator first, const_iterator last) { return __table.__erase(first, last); }
    size_t erase(const K& key) { return __table.__erase_key(key); }
    void clear() noexcept { __table.clear(); }
    void swap(unordered_map& other) noexcept { __table.swap(other.__table); }

    hasher hash_function() const { return __table.__hasher; }
    key_equal key_eq() const { return __table.__equal; }
    iterator find(const K& key) { return iterator(__table.__find(key)); }
    const_iterator find(const K& key) const { return const_iterator(__table.__find(key)); }
    size_t count(const K& key) const { return __table.__count_of(key); }
    pair<iterator, iterator> equal_range(const K& key) {
        pair<__hash_links*, __hash_links*> range = __table.__range(key);
        return pair<iterator, iterator>(iterator(range.first), iterator(range.second));
    }
    pair<const_iterator, const_iterator> equal_range(const K& key) const {
        pair<__hash_links*, __hash_links*> range = __table.__range(key);
        return pair<const_iterator, const_iterator>(const_iterator(range.first), const_iterator(range.second));
    }

    size_t bucket_count() const noexcept { return __table.__bucket_count; }
    size_t max_bucket_count() const noexcept { return 4294967291UL; }
    size_t bucket_size(size_t n) const { return __table.bucket_size(n); }
    size_t bucket(const K& key) const { return __table.bucket(key); }
    local_iterator begin(size_t n) { return __table.begin(n); }
    const_local_iterator begin(size_t n) const { return __table.begin(n); }
    local_iterator end(size_t n) { return __table.end(n); }
    const_local_iterator end(size_t n) const { return __table.end(n); }
    float load_factor() const noexcept { return __table.load_factor(); }
    float max_load_factor() const noexcept { return __table.max_load_factor(); }
    void max_load_factor(float z) { __table.max_load_factor(z); }
    void rehash(size_t n) { __table.rehash(n); }
    void reserve(size_t n) { __table.reserve(n); }
};
template <class K, class T, class H, class E, class A>
bool operator==(const unordered_map<K, T, H, E, A>& a, const unordered_map<K, T, H, E, A>& b) {
    return a.__table.__equals(b.__table);
}
template <class K, class T, class H, class E, class A>
bool operator!=(const unordered_map<K, T, H, E, A>& a, const unordered_map<K, T, H, E, A>& b) {
    return !(a == b);
}
template <class K, class T, class H, class E, class A>
void swap(unordered_map<K, T, H, E, A>& a, unordered_map<K, T, H, E, A>& b) noexcept {
    a.swap(b);
}

template <class K, class T, class H = hash<K>, class E = equal_to<K>, class A = allocator<pair<const K, T>>>
class unordered_multimap {
public:
    typedef K key_type;
    typedef T mapped_type;
    typedef pair<const K, T> value_type;
    typedef size_t size_type;
    typedef ptrdiff_t difference_type;
    typedef H hasher;
    typedef E key_equal;
    typedef A allocator_type;
    typedef value_type& reference;
    typedef const value_type& const_reference;
    typedef value_type* pointer;
    typedef const value_type* const_pointer;
    typedef __hashtable<K, value_type, __hash_map_key<K, T>, H, E, false> __table_type;
    typedef typename __table_type::iterator iterator;
    typedef typename __table_type::const_iterator const_iterator;
    typedef typename __table_type::local_iterator local_iterator;
    typedef typename __table_type::local_iterator const_local_iterator;

    __table_type __table;

    unordered_multimap() : __table() {}
    explicit unordered_multimap(size_t buckets, const H& hasher = H(), const E& equal = E(), const A& = A())
        : __table(buckets, hasher, equal) {}
    template <class I>
    unordered_multimap(I first, I last, size_t buckets = 0, const H& hasher = H(), const E& equal = E(),
                       const A& = A())
        : __table(0, hasher, equal) {
        __table.__presize(std::distance(first, last), buckets);
        for (; first != last; ++first)
            __table.__insert(*first);
    }
    unordered_multimap(initializer_list<value_type> list, size_t buckets = 0, const H& hasher = H(),
                       const E& equal = E(), const A& = A())
        : unordered_multimap(list.begin(), list.end(), buckets, hasher, equal) {}
    unordered_multimap& operator=(initializer_list<value_type> list) {
        clear();
        insert(list.begin(), list.end());
        return *this;
    }
    allocator_type get_allocator() const noexcept { return A(); }

    iterator begin() noexcept { return __table.begin(); }
    const_iterator begin() const noexcept { return __table.begin(); }
    iterator end() noexcept { return __table.end(); }
    const_iterator end() const noexcept { return __table.end(); }
    const_iterator cbegin() const noexcept { return __table.begin(); }
    const_iterator cend() const noexcept { return __table.end(); }
    bool empty() const noexcept { return __table.empty(); }
    size_t size() const noexcept { return __table.size(); }
    size_t max_size() const noexcept { return 9223372036854775807UL / sizeof(typename __table_type::__node_type); }

    iterator insert(const value_type& value) { return __table.__insert(value).first; }
    iterator insert(value_type&& value) { return __table.__insert(std::move(value)).first; }
    template <class P, class = typename enable_if<!is_same<typename decay<P>::type, value_type>::value>::type>
    iterator insert(P&& value) {
        return __table.__emplace(std::forward<P>(value)).first;
    }
    iterator insert(const_iterator hint, const value_type& value) { return __table.__emplace_hint(hint, value); }
    template <class I> void insert(I first, I last) {
        __table.__insert_range(first, last, typename iterator_traits<I>::iterator_category());
    }
    void insert(initializer_list<value_type> list) { insert(list.begin(), list.end()); }
    template <class... Args> iterator emplace(Args&&... args) {
        return __table.__emplace(std::forward<Args>(args)...).first;
    }
    template <class... Args> iterator emplace_hint(const_iterator hint, Args&&... args) {
        return __table.__emplace_hint(hint, std::forward<Args>(args)...);
    }
    iterator erase(const_iterator position) { return __table.__erase(position); }
    iterator erase(iterator position) { return __table.__erase(position); }
    iterator erase(const_iterator first, const_iterator last) { return __table.__erase(first, last); }
    size_t erase(const K& key) { return __table.__erase_key(key); }
    void clear() noexcept { __table.clear(); }
    void swap(unordered_multimap& other) noexcept { __table.swap(other.__table); }

    hasher hash_function() const { return __table.__hasher; }
    key_equal key_eq() const { return __table.__equal; }
    iterator find(const K& key) { return iterator(__table.__find(key)); }
    const_iterator find(const K& key) const { return const_iterator(__table.__find(key)); }
    size_t count(const K& key) const { return __table.__count_of(key); }
    pair<iterator, iterator> equal_range(const K& key) {
        pair<__hash_links*, __hash_links*> range = __table.__range(key);
        return pair<iterator, iterator>(iterator(range.first), iterator(range.second));
    }
    pair<const_iterator, const_iterator> equal_range(const K& key) const {
        pair<__hash_links*, __hash_links*> range = __table.__range(key);
        return pair<const_iterator, const_iterator>(const_iterator(range.first), const_iterator(range.second));
    }

    size_t bucket_count() const noexcept { return __table.__bucket_count; }
    size_t max_bucket_count() const noexcept { return 4294967291UL; }
    size_t bucket_size(size_t n) const { return __table.bucket_size(n); }
    size_t bucket(const K& key) const { return __table.bucket(key); }
    local_iterator begin(size_t n) { return __table.begin(n); }
    const_local_iterator begin(size_t n) const { return __table.begin(n); }
    local_iterator end(size_t n) { return __table.end(n); }
    const_local_iterator end(size_t n) const { return __table.end(n); }
    float load_factor() const noexcept { return __table.load_factor(); }
    float max_load_factor() const noexcept { return __table.max_load_factor(); }
    void max_load_factor(float z) { __table.max_load_factor(z); }
    void rehash(size_t n) { __table.rehash(n); }
    void reserve(size_t n) { __table.reserve(n); }
};
template <class K, class T, class H, class E, class A>
bool operator==(const unordered_multimap<K, T, H, E, A>& a, const unordered_multimap<K, T, H, E, A>& b) {
    return a.__table.__equals(b.__table);
}
template <class K, class T, class H, class E, class A>
bool operator!=(const unordered_multimap<K, T, H, E, A>& a, const unordered_multimap<K, T, H, E, A>& b) {
    return !(a == b);
}
template <class K, class T, class H, class E, class A>
void swap(unordered_multimap<K, T, H, E, A>& a, unordered_multimap<K, T, H, E, A>& b) noexcept {
    a.swap(b);
}
}
`);

    X.addHeader('v4script/unordered_set', [
        ['std', 3, 99, 'unordered_set'],
        ['std', 100, 103, 'operator=='],
        ['std', 104, 107, 'operator!='],
        ['std', 108, 110, 'swap'],
        ['std', 112, 201, 'unordered_multiset'],
        ['std', 202, 205, 'operator=='],
        ['std', 206, 209, 'operator!='],
        ['std', 210, 213, 'swap']
    ], String.raw`
namespace std {
template <class K, class H = hash<K>, class E = equal_to<K>, class A = allocator<K>> class unordered_set {
public:
    typedef K key_type;
    typedef K value_type;
    typedef size_t size_type;
    typedef ptrdiff_t difference_type;
    typedef H hasher;
    typedef E key_equal;
    typedef A allocator_type;
    typedef K& reference;
    typedef const K& const_reference;
    typedef K* pointer;
    typedef const K* const_pointer;
    typedef __hashtable<K, K, __hash_set_key<K>, H, E, true> __table_type;
    typedef typename __table_type::const_iterator iterator;
    typedef typename __table_type::const_iterator const_iterator;
    typedef typename __table_type::local_iterator local_iterator;
    typedef typename __table_type::local_iterator const_local_iterator;

    __table_type __table;

    unordered_set() : __table() {}
    explicit unordered_set(size_t buckets, const H& hasher = H(), const E& equal = E(), const A& = A())
        : __table(buckets, hasher, equal) {}
    template <class I>
    unordered_set(I first, I last, size_t buckets = 0, const H& hasher = H(), const E& equal = E(), const A& = A())
        : __table(buckets, hasher, equal) {
        insert(first, last);
    }
    unordered_set(initializer_list<K> list, size_t buckets = 0, const H& hasher = H(), const E& equal = E(),
                  const A& = A())
        : __table(buckets, hasher, equal) {
        insert(list.begin(), list.end());
    }
    unordered_set& operator=(initializer_list<K> list) {
        clear();
        insert(list.begin(), list.end());
        return *this;
    }
    allocator_type get_allocator() const noexcept { return A(); }

    iterator begin() const noexcept { return __table.begin(); }
    iterator end() const noexcept { return __table.end(); }
    iterator cbegin() const noexcept { return __table.begin(); }
    iterator cend() const noexcept { return __table.end(); }
    bool empty() const noexcept { return __table.empty(); }
    size_t size() const noexcept { return __table.size(); }
    size_t max_size() const noexcept { return 9223372036854775807UL / sizeof(typename __table_type::__node_type); }

    pair<iterator, bool> insert(const K& value) {
        pair<typename __table_type::iterator, bool> result = __table.__insert(value);
        return pair<iterator, bool>(result.first, result.second);
    }
    pair<iterator, bool> insert(K&& value) {
        pair<typename __table_type::iterator, bool> result = __table.__insert(std::move(value));
        return pair<iterator, bool>(result.first, result.second);
    }
    iterator insert(const_iterator, const K& value) { return __table.__insert(value).first; }
    iterator insert(const_iterator, K&& value) { return __table.__insert(std::move(value)).first; }
    template <class I> void insert(I first, I last) {
        __table.__insert_range(first, last, typename iterator_traits<I>::iterator_category());
    }
    void insert(initializer_list<K> list) { insert(list.begin(), list.end()); }
    template <class... Args> pair<iterator, bool> emplace(Args&&... args) {
        pair<typename __table_type::iterator, bool> result = __table.__emplace(std::forward<Args>(args)...);
        return pair<iterator, bool>(result.first, result.second);
    }
    template <class... Args> iterator emplace_hint(const_iterator hint, Args&&... args) {
        return __table.__emplace_hint(hint, std::forward<Args>(args)...);
    }
    iterator erase(const_iterator position) { return __table.__erase(position); }
    iterator erase(const_iterator first, const_iterator last) { return __table.__erase(first, last); }
    size_t erase(const K& key) { return __table.__erase_key(key); }
    void clear() noexcept { __table.clear(); }
    void swap(unordered_set& other) noexcept { __table.swap(other.__table); }

    hasher hash_function() const { return __table.__hasher; }
    key_equal key_eq() const { return __table.__equal; }
    iterator find(const K& key) const { return const_iterator(__table.__find(key)); }
    size_t count(const K& key) const { return __table.__count_of(key); }
    pair<iterator, iterator> equal_range(const K& key) const {
        pair<__hash_links*, __hash_links*> range = __table.__range(key);
        return pair<iterator, iterator>(iterator(range.first), iterator(range.second));
    }

    size_t bucket_count() const noexcept { return __table.__bucket_count; }
    size_t max_bucket_count() const noexcept { return 4294967291UL; }
    size_t bucket_size(size_t n) const { return __table.bucket_size(n); }
    size_t bucket(const K& key) const { return __table.bucket(key); }
    local_iterator begin(size_t n) const { return __table.begin(n); }
    local_iterator end(size_t n) const { return __table.end(n); }
    float load_factor() const noexcept { return __table.load_factor(); }
    float max_load_factor() const noexcept { return __table.max_load_factor(); }
    void max_load_factor(float z) { __table.max_load_factor(z); }
    void rehash(size_t n) { __table.rehash(n); }
    void reserve(size_t n) { __table.reserve(n); }
};
template <class K, class H, class E, class A>
bool operator==(const unordered_set<K, H, E, A>& a, const unordered_set<K, H, E, A>& b) {
    return a.__table.__equals(b.__table);
}
template <class K, class H, class E, class A>
bool operator!=(const unordered_set<K, H, E, A>& a, const unordered_set<K, H, E, A>& b) {
    return !(a == b);
}
template <class K, class H, class E, class A> void swap(unordered_set<K, H, E, A>& a, unordered_set<K, H, E, A>& b) {
    a.swap(b);
}

template <class K, class H = hash<K>, class E = equal_to<K>, class A = allocator<K>> class unordered_multiset {
public:
    typedef K key_type;
    typedef K value_type;
    typedef size_t size_type;
    typedef ptrdiff_t difference_type;
    typedef H hasher;
    typedef E key_equal;
    typedef A allocator_type;
    typedef K& reference;
    typedef const K& const_reference;
    typedef K* pointer;
    typedef const K* const_pointer;
    typedef __hashtable<K, K, __hash_set_key<K>, H, E, false> __table_type;
    typedef typename __table_type::const_iterator iterator;
    typedef typename __table_type::const_iterator const_iterator;
    typedef typename __table_type::local_iterator local_iterator;
    typedef typename __table_type::local_iterator const_local_iterator;

    __table_type __table;

    unordered_multiset() : __table() {}
    explicit unordered_multiset(size_t buckets, const H& hasher = H(), const E& equal = E(), const A& = A())
        : __table(buckets, hasher, equal) {}
    template <class I>
    unordered_multiset(I first, I last, size_t buckets = 0, const H& hasher = H(), const E& equal = E(),
                       const A& = A())
        : __table(0, hasher, equal) {
        __table.__presize(std::distance(first, last), buckets);
        for (; first != last; ++first)
            __table.__insert(*first);
    }
    unordered_multiset(initializer_list<K> list, size_t buckets = 0, const H& hasher = H(), const E& equal = E(),
                       const A& = A())
        : unordered_multiset(list.begin(), list.end(), buckets, hasher, equal) {}
    unordered_multiset& operator=(initializer_list<K> list) {
        clear();
        insert(list.begin(), list.end());
        return *this;
    }
    allocator_type get_allocator() const noexcept { return A(); }

    iterator begin() const noexcept { return __table.begin(); }
    iterator end() const noexcept { return __table.end(); }
    iterator cbegin() const noexcept { return __table.begin(); }
    iterator cend() const noexcept { return __table.end(); }
    bool empty() const noexcept { return __table.empty(); }
    size_t size() const noexcept { return __table.size(); }
    size_t max_size() const noexcept { return 9223372036854775807UL / sizeof(typename __table_type::__node_type); }

    iterator insert(const K& value) { return __table.__insert(value).first; }
    iterator insert(K&& value) { return __table.__insert(std::move(value)).first; }
    iterator insert(const_iterator hint, const K& value) { return __table.__emplace_hint(hint, value); }
    template <class I> void insert(I first, I last) {
        __table.__insert_range(first, last, typename iterator_traits<I>::iterator_category());
    }
    void insert(initializer_list<K> list) { insert(list.begin(), list.end()); }
    template <class... Args> iterator emplace(Args&&... args) {
        return __table.__emplace(std::forward<Args>(args)...).first;
    }
    template <class... Args> iterator emplace_hint(const_iterator hint, Args&&... args) {
        return __table.__emplace_hint(hint, std::forward<Args>(args)...);
    }
    iterator erase(const_iterator position) { return __table.__erase(position); }
    iterator erase(const_iterator first, const_iterator last) { return __table.__erase(first, last); }
    size_t erase(const K& key) { return __table.__erase_key(key); }
    void clear() noexcept { __table.clear(); }
    void swap(unordered_multiset& other) noexcept { __table.swap(other.__table); }

    hasher hash_function() const { return __table.__hasher; }
    key_equal key_eq() const { return __table.__equal; }
    iterator find(const K& key) const { return const_iterator(__table.__find(key)); }
    size_t count(const K& key) const { return __table.__count_of(key); }
    pair<iterator, iterator> equal_range(const K& key) const {
        pair<__hash_links*, __hash_links*> range = __table.__range(key);
        return pair<iterator, iterator>(iterator(range.first), iterator(range.second));
    }

    size_t bucket_count() const noexcept { return __table.__bucket_count; }
    size_t max_bucket_count() const noexcept { return 4294967291UL; }
    size_t bucket_size(size_t n) const { return __table.bucket_size(n); }
    size_t bucket(const K& key) const { return __table.bucket(key); }
    local_iterator begin(size_t n) const { return __table.begin(n); }
    local_iterator end(size_t n) const { return __table.end(n); }
    float load_factor() const noexcept { return __table.load_factor(); }
    float max_load_factor() const noexcept { return __table.max_load_factor(); }
    void max_load_factor(float z) { __table.max_load_factor(z); }
    void rehash(size_t n) { __table.rehash(n); }
    void reserve(size_t n) { __table.reserve(n); }
};
template <class K, class H, class E, class A>
bool operator==(const unordered_multiset<K, H, E, A>& a, const unordered_multiset<K, H, E, A>& b) {
    return a.__table.__equals(b.__table);
}
template <class K, class H, class E, class A>
bool operator!=(const unordered_multiset<K, H, E, A>& a, const unordered_multiset<K, H, E, A>& b) {
    return !(a == b);
}
template <class K, class H, class E, class A>
void swap(unordered_multiset<K, H, E, A>& a, unordered_multiset<K, H, E, A>& b) {
    a.swap(b);
}
}
`);
})(globalThis);
