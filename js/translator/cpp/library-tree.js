// C++ library: <map> and <set> over a red-black tree. The header node
// keeps the root (parent), the leftmost and the rightmost node; end() is
// the header. Equal keys of multimap and multiset go after the old ones.
// The tables of declarations are written by tools/build-cpp-library.mjs.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    if (X.headers['v4script/tree'])
        return;

    X.addHeader('v4script/tree', [
        ['std', 3, 8, '__tree_links'],
        ['std', 10, 14, '__tree_minimum'],
        ['std', 15, 19, '__tree_maximum'],
        ['std', 21, 23, '__tree_is_header'],
        ['std', 24, 34, '__tree_next'],
        ['std', 35, 46, '__tree_previous'],
        ['std', 47, 61, '__tree_rotate_left'],
        ['std', 62, 76, '__tree_rotate_right'],
        ['std', 78, 136, '__tree_insert'],
        ['std', 137, 144, '__tree_replace_child'],
        ['std', 146, 249, '__tree_erase'],
        ['std', 251, 253, '__tree_node'],
        ['std', 254, 285, '__tree_iterator'],
        ['std', 286, 319, '__tree_const_iterator'],
        ['std', 320, 322, 'operator=='],
        ['std', 323, 325, 'operator!='],
        ['std', 328, 649, '__tree'],
        ['std', 650, 653, '__tree_equal'],
        ['std', 654, 657, '__tree_less'],
        ['std', 658, 660, '__set_key'],
        ['std', 661, 663, '__map_key']
    ], String.raw`
namespace std {
struct __tree_links {
    int __red;
    __tree_links* __parent;
    __tree_links* __left;
    __tree_links* __right;
};

inline __tree_links* __tree_minimum(__tree_links* node) noexcept {
    while (node->__left != 0)
        node = node->__left;
    return node;
}
inline __tree_links* __tree_maximum(__tree_links* node) noexcept {
    while (node->__right != 0)
        node = node->__right;
    return node;
}
// The header is the only red node whose grandparent is itself.
inline bool __tree_is_header(const __tree_links* node) noexcept {
    return node->__red && node->__parent != 0 && node->__parent->__parent == node;
}
inline __tree_links* __tree_next(__tree_links* node) noexcept {
    if (node->__right != 0)
        return __tree_minimum(node->__right);
    __tree_links* parent = node->__parent;
    while (node == parent->__right) {
        node = parent;
        parent = parent->__parent;
    }
    // From the rightmost node the climb ends at the header.
    return node->__right == parent ? node : parent;
}
inline __tree_links* __tree_previous(__tree_links* node) noexcept {
    if (__tree_is_header(node))
        return node->__right;
    if (node->__left != 0)
        return __tree_maximum(node->__left);
    __tree_links* parent = node->__parent;
    while (node == parent->__left) {
        node = parent;
        parent = parent->__parent;
    }
    return parent;
}
inline void __tree_rotate_left(__tree_links* node, __tree_links* header) noexcept {
    __tree_links* child = node->__right;
    node->__right = child->__left;
    if (child->__left != 0)
        child->__left->__parent = node;
    child->__parent = node->__parent;
    if (node == header->__parent)
        header->__parent = child;
    else if (node == node->__parent->__left)
        node->__parent->__left = child;
    else
        node->__parent->__right = child;
    child->__left = node;
    node->__parent = child;
}
inline void __tree_rotate_right(__tree_links* node, __tree_links* header) noexcept {
    __tree_links* child = node->__left;
    node->__left = child->__right;
    if (child->__right != 0)
        child->__right->__parent = node;
    child->__parent = node->__parent;
    if (node == header->__parent)
        header->__parent = child;
    else if (node == node->__parent->__right)
        node->__parent->__right = child;
    else
        node->__parent->__left = child;
    child->__right = node;
    node->__parent = child;
}
// Links a new node as a child of parent and restores the colors.
inline void __tree_insert(bool left, __tree_links* node, __tree_links* parent, __tree_links* header) noexcept {
    node->__parent = parent;
    node->__left = 0;
    node->__right = 0;
    node->__red = 1;
    if (parent == header) {
        header->__parent = node;
        header->__left = node;
        header->__right = node;
    } else if (left) {
        parent->__left = node;
        if (parent == header->__left)
            header->__left = node;
    } else {
        parent->__right = node;
        if (parent == header->__right)
            header->__right = node;
    }
    while (node != header->__parent && node->__parent->__red) {
        __tree_links* father = node->__parent;
        __tree_links* grandfather = father->__parent;
        if (father == grandfather->__left) {
            __tree_links* uncle = grandfather->__right;
            if (uncle != 0 && uncle->__red) {
                father->__red = 0;
                uncle->__red = 0;
                grandfather->__red = 1;
                node = grandfather;
            } else {
                if (node == father->__right) {
                    node = father;
                    __tree_rotate_left(node, header);
                    father = node->__parent;
                }
                father->__red = 0;
                grandfather->__red = 1;
                __tree_rotate_right(grandfather, header);
            }
        } else {
            __tree_links* uncle = grandfather->__left;
            if (uncle != 0 && uncle->__red) {
                father->__red = 0;
                uncle->__red = 0;
                grandfather->__red = 1;
                node = grandfather;
            } else {
                if (node == father->__left) {
                    node = father;
                    __tree_rotate_right(node, header);
                    father = node->__parent;
                }
                father->__red = 0;
                grandfather->__red = 1;
                __tree_rotate_left(grandfather, header);
            }
        }
    }
    header->__parent->__red = 0;
}
inline void __tree_replace_child(__tree_links* old_child, __tree_links* new_child, __tree_links* header) noexcept {
    if (header->__parent == old_child)
        header->__parent = new_child;
    else if (old_child->__parent->__left == old_child)
        old_child->__parent->__left = new_child;
    else
        old_child->__parent->__right = new_child;
}
// Unlinks a node and restores the colors.
inline void __tree_erase(__tree_links* node, __tree_links* header) noexcept {
    __tree_links* removed = node;
    __tree_links* child;
    __tree_links* child_parent;
    if (node->__left != 0 && node->__right != 0) {
        // The successor takes the place of the node.
        removed = __tree_minimum(node->__right);
        child = removed->__right;
        node->__left->__parent = removed;
        removed->__left = node->__left;
        if (removed != node->__right) {
            child_parent = removed->__parent;
            if (child != 0)
                child->__parent = child_parent;
            child_parent->__left = child;
            removed->__right = node->__right;
            node->__right->__parent = removed;
        } else {
            child_parent = removed;
        }
        __tree_replace_child(node, removed, header);
        removed->__parent = node->__parent;
        int color = removed->__red;
        removed->__red = node->__red;
        node->__red = color;
    } else {
        child = node->__left != 0 ? node->__left : node->__right;
        child_parent = node->__parent;
        if (child != 0)
            child->__parent = child_parent;
        __tree_replace_child(node, child, header);
        if (header->__left == node)
            header->__left = node->__right == 0 ? (child_parent == header ? header : child_parent)
                                                 : __tree_minimum(child);
        if (header->__right == node)
            header->__right = node->__left == 0 ? (child_parent == header ? header : child_parent)
                                                 : __tree_maximum(child);
        if (header->__parent == 0) {
            header->__left = header;
            header->__right = header;
        }
    }
    if (node->__red)
        return;
    while (child != header->__parent && (child == 0 || !child->__red)) {
        if (child == child_parent->__left) {
            __tree_links* sibling = child_parent->__right;
            if (sibling->__red) {
                sibling->__red = 0;
                child_parent->__red = 1;
                __tree_rotate_left(child_parent, header);
                sibling = child_parent->__right;
            }
            if ((sibling->__left == 0 || !sibling->__left->__red) &&
                (sibling->__right == 0 || !sibling->__right->__red)) {
                sibling->__red = 1;
                child = child_parent;
                child_parent = child_parent->__parent;
            } else {
                if (sibling->__right == 0 || !sibling->__right->__red) {
                    sibling->__left->__red = 0;
                    sibling->__red = 1;
                    __tree_rotate_right(sibling, header);
                    sibling = child_parent->__right;
                }
                sibling->__red = child_parent->__red;
                child_parent->__red = 0;
                if (sibling->__right != 0)
                    sibling->__right->__red = 0;
                __tree_rotate_left(child_parent, header);
                break;
            }
        } else {
            __tree_links* sibling = child_parent->__left;
            if (sibling->__red) {
                sibling->__red = 0;
                child_parent->__red = 1;
                __tree_rotate_right(child_parent, header);
                sibling = child_parent->__left;
            }
            if ((sibling->__right == 0 || !sibling->__right->__red) &&
                (sibling->__left == 0 || !sibling->__left->__red)) {
                sibling->__red = 1;
                child = child_parent;
                child_parent = child_parent->__parent;
            } else {
                if (sibling->__left == 0 || !sibling->__left->__red) {
                    sibling->__right->__red = 0;
                    sibling->__red = 1;
                    __tree_rotate_left(sibling, header);
                    sibling = child_parent->__left;
                }
                sibling->__red = child_parent->__red;
                child_parent->__red = 0;
                if (sibling->__left != 0)
                    sibling->__left->__red = 0;
                __tree_rotate_right(child_parent, header);
                break;
            }
        }
    }
    if (child != 0)
        child->__red = 0;
}

template <class V> struct __tree_node : __tree_links {
    V __value;
};
template <class V> struct __tree_iterator {
    typedef bidirectional_iterator_tag iterator_category;
    typedef V value_type;
    typedef ptrdiff_t difference_type;
    typedef V* pointer;
    typedef V& reference;
    __tree_links* __node;
    __tree_iterator() noexcept : __node(0) {}
    explicit __tree_iterator(__tree_links* node) noexcept : __node(node) {}
    V& operator*() const noexcept { return static_cast<__tree_node<V>*>(__node)->__value; }
    V* operator->() const noexcept { return &static_cast<__tree_node<V>*>(__node)->__value; }
    __tree_iterator& operator++() noexcept {
        __node = __tree_next(__node);
        return *this;
    }
    __tree_iterator operator++(int) noexcept {
        __tree_iterator tmp = *this;
        __node = __tree_next(__node);
        return tmp;
    }
    __tree_iterator& operator--() noexcept {
        __node = __tree_previous(__node);
        return *this;
    }
    __tree_iterator operator--(int) noexcept {
        __tree_iterator tmp = *this;
        __node = __tree_previous(__node);
        return tmp;
    }
    bool operator==(const __tree_iterator& other) const noexcept { return __node == other.__node; }
    bool operator!=(const __tree_iterator& other) const noexcept { return __node != other.__node; }
};
template <class V> struct __tree_const_iterator {
    typedef bidirectional_iterator_tag iterator_category;
    typedef V value_type;
    typedef ptrdiff_t difference_type;
    typedef const V* pointer;
    typedef const V& reference;
    __tree_links* __node;
    __tree_const_iterator() noexcept : __node(0) {}
    explicit __tree_const_iterator(const __tree_links* node) noexcept : __node(const_cast<__tree_links*>(node)) {}
    __tree_const_iterator(const __tree_iterator<V>& other) noexcept : __node(other.__node) {}
    __tree_iterator<V> __const_cast() const noexcept { return __tree_iterator<V>(__node); }
    const V& operator*() const noexcept { return static_cast<__tree_node<V>*>(__node)->__value; }
    const V* operator->() const noexcept { return &static_cast<__tree_node<V>*>(__node)->__value; }
    __tree_const_iterator& operator++() noexcept {
        __node = __tree_next(__node);
        return *this;
    }
    __tree_const_iterator operator++(int) noexcept {
        __tree_const_iterator tmp = *this;
        __node = __tree_next(__node);
        return tmp;
    }
    __tree_const_iterator& operator--() noexcept {
        __node = __tree_previous(__node);
        return *this;
    }
    __tree_const_iterator operator--(int) noexcept {
        __tree_const_iterator tmp = *this;
        __node = __tree_previous(__node);
        return tmp;
    }
    bool operator==(const __tree_const_iterator& other) const noexcept { return __node == other.__node; }
    bool operator!=(const __tree_const_iterator& other) const noexcept { return __node != other.__node; }
};
template <class V> bool operator==(const __tree_iterator<V>& a, const __tree_const_iterator<V>& b) noexcept {
    return a.__node == b.__node;
}
template <class V> bool operator!=(const __tree_iterator<V>& a, const __tree_const_iterator<V>& b) noexcept {
    return a.__node != b.__node;
}

// K the key, V the value, X the key of a value (X::key(v)), C the order.
template <class K, class V, class X, class C> class __tree {
public:
    typedef __tree_node<V> __node_type;
    typedef __tree_iterator<V> iterator;
    typedef __tree_const_iterator<V> const_iterator;
    C __comp;
    __tree_links __header;
    size_t __count;

    void __reset() noexcept {
        __header.__red = 1;
        __header.__parent = 0;
        __header.__left = &__header;
        __header.__right = &__header;
        __count = 0;
    }
    __tree() : __comp() { __reset(); }
    explicit __tree(const C& comp) : __comp(comp) { __reset(); }
    __tree(const __tree& other) : __comp(other.__comp) {
        __reset();
        for (const_iterator it = other.begin(); it != other.end(); ++it)
            __insert_equal_hint(end(), *it);
    }
    __tree(__tree&& other) : __comp(other.__comp) {
        __reset();
        __steal(other);
    }
    ~__tree() { clear(); }
    __tree& operator=(const __tree& other) {
        if (&other != this) {
            clear();
            __comp = other.__comp;
            for (const_iterator it = other.begin(); it != other.end(); ++it)
                __insert_equal_hint(end(), *it);
        }
        return *this;
    }
    __tree& operator=(__tree&& other) {
        if (&other != this) {
            clear();
            __comp = other.__comp;
            __steal(other);
        }
        return *this;
    }
    void __steal(__tree& other) noexcept {
        if (other.__header.__parent == 0)
            return;
        __header.__parent = other.__header.__parent;
        __header.__left = other.__header.__left;
        __header.__right = other.__header.__right;
        __header.__parent->__parent = &__header;
        __count = other.__count;
        other.__reset();
    }
    void swap(__tree& other) noexcept {
        __tree tmp(std::move(other));
        other.__steal(*this);
        __steal(tmp);
        std::swap(__comp, other.__comp);
    }

    static const K& __key(const __tree_links* node) noexcept {
        return X::key(static_cast<const __node_type*>(node)->__value);
    }
    iterator begin() noexcept { return iterator(__header.__left); }
    const_iterator begin() const noexcept { return const_iterator(__header.__left); }
    iterator end() noexcept { return iterator(&__header); }
    const_iterator end() const noexcept { return const_iterator(&__header); }
    size_t size() const noexcept { return __count; }
    bool empty() const noexcept { return __count == 0; }

    template <class... Args> __tree_links* __make(Args&&... args) {
        __node_type* node = static_cast<__node_type*>(__allocate(sizeof(__node_type)));
        try {
            ::new (static_cast<void*>(&node->__value)) V(std::forward<Args>(args)...);
        } catch (...) {
            __deallocate(node);
            throw;
        }
        return node;
    }
    void __drop(__tree_links* link) noexcept {
        __node_type* node = static_cast<__node_type*>(link);
        node->__value.~V();
        __deallocate(node);
    }
    void __destroy_subtree(__tree_links* node) noexcept {
        while (node != 0) {
            __destroy_subtree(node->__right);
            __tree_links* left = node->__left;
            __drop(node);
            node = left;
        }
    }
    void clear() noexcept {
        __destroy_subtree(__header.__parent);
        __reset();
    }

    template <class Key> __tree_links* __lower(const Key& key) const {
        const __tree_links* node = __header.__parent;
        const __tree_links* result = &__header;
        while (node != 0) {
            if (!__comp(__key(node), key)) {
                result = node;
                node = node->__left;
            } else {
                node = node->__right;
            }
        }
        return const_cast<__tree_links*>(result);
    }
    template <class Key> __tree_links* __upper(const Key& key) const {
        const __tree_links* node = __header.__parent;
        const __tree_links* result = &__header;
        while (node != 0) {
            if (__comp(key, __key(node))) {
                result = node;
                node = node->__left;
            } else {
                node = node->__right;
            }
        }
        return const_cast<__tree_links*>(result);
    }
    template <class Key> __tree_links* __find(const Key& key) const {
        __tree_links* node = __lower(key);
        if (node == &__header || __comp(key, __key(node)))
            return const_cast<__tree_links*>(&__header);
        return node;
    }
    template <class Key> size_t __count_of(const Key& key) const {
        size_t n = 0;
        for (__tree_links* node = __lower(key); node != &__header && !__comp(key, __key(node));
             node = __tree_next(node))
            ++n;
        return n;
    }

    // The parent for a new key and whether it goes left; null parent when
    // the key exists (unique insertion: existing is the equal node).
    __tree_links* __unique_position(const K& key, bool& left, __tree_links*& existing) {
        __tree_links* parent = &__header;
        __tree_links* node = __header.__parent;
        bool less = true;
        while (node != 0) {
            parent = node;
            less = __comp(key, __key(node));
            node = less ? node->__left : node->__right;
        }
        __tree_links* candidate = parent;
        if (less) {
            if (candidate == __header.__left) {
                left = true;
                return parent;
            }
            candidate = __tree_previous(candidate);
        }
        if (__comp(__key(candidate), key)) {
            left = parent == &__header || __comp(key, __key(parent));
            return parent;
        }
        existing = candidate;
        return 0;
    }
    __tree_links* __equal_position(const K& key, bool& left) {
        __tree_links* parent = &__header;
        __tree_links* node = __header.__parent;
        while (node != 0) {
            parent = node;
            node = __comp(key, __key(node)) ? node->__left : node->__right;
        }
        left = parent == &__header || __comp(key, __key(parent));
        return parent;
    }
    iterator __link(__tree_links* node, __tree_links* parent, bool left) {
        __tree_insert(left, node, parent, &__header);
        ++__count;
        return iterator(node);
    }
    template <class... Args> pair<iterator, bool> __emplace_unique(Args&&... args) {
        __tree_links* node = __make(std::forward<Args>(args)...);
        bool left = false;
        __tree_links* existing = 0;
        __tree_links* parent = __unique_position(__key(node), left, existing);
        if (parent == 0) {
            __drop(node);
            return pair<iterator, bool>(iterator(existing), false);
        }
        return pair<iterator, bool>(__link(node, parent, left), true);
    }
    pair<iterator, bool> __insert_unique(const V& value) {
        bool left = false;
        __tree_links* existing = 0;
        __tree_links* parent = __unique_position(X::key(value), left, existing);
        if (parent == 0)
            return pair<iterator, bool>(iterator(existing), false);
        return pair<iterator, bool>(__link(__make(value), parent, left), true);
    }
    pair<iterator, bool> __insert_unique(V&& value) {
        bool left = false;
        __tree_links* existing = 0;
        __tree_links* parent = __unique_position(X::key(value), left, existing);
        if (parent == 0)
            return pair<iterator, bool>(iterator(existing), false);
        return pair<iterator, bool>(__link(__make(std::move(value)), parent, left), true);
    }
    template <class... Args> iterator __emplace_equal(Args&&... args) {
        __tree_links* node = __make(std::forward<Args>(args)...);
        bool left = false;
        __tree_links* parent = __equal_position(__key(node), left);
        return __link(node, parent, left);
    }
    __tree_links* __equal_lower_position(const K& key, bool& left) {
        __tree_links* parent = &__header;
        __tree_links* node = __header.__parent;
        while (node != 0) {
            parent = node;
            node = __comp(__key(node), key) ? node->__right : node->__left;
        }
        left = parent == &__header || !__comp(__key(parent), key);
        return parent;
    }
    // Next to the hint when the order allows; otherwise after the equal
    // keys (a hint after the key) or before them (a hint before the key),
    // as libstdc++ does.
    template <class... Args> iterator __emplace_equal_hint(const_iterator hint, Args&&... args) {
        __tree_links* node = __make(std::forward<Args>(args)...);
        __tree_links* position = hint.__node;
        const K& key = __key(node);
        bool left = false;
        if (position == &__header) {
            if (__count > 0 && !__comp(key, __key(__header.__right)))
                return __link(node, __header.__right, false);
            __tree_links* parent = __equal_position(key, left);
            return __link(node, parent, left);
        }
        if (!__comp(__key(position), key)) {
            if (position == __header.__left)
                return __link(node, position, true);
            __tree_links* before = __tree_previous(position);
            if (!__comp(key, __key(before)))
                return before->__right == 0 ? __link(node, before, false) : __link(node, position, true);
            __tree_links* parent = __equal_position(key, left);
            return __link(node, parent, left);
        }
        if (position == __header.__right)
            return __link(node, position, false);
        __tree_links* after = __tree_next(position);
        if (!__comp(__key(after), key))
            return position->__right == 0 ? __link(node, position, false) : __link(node, after, true);
        __tree_links* parent = __equal_lower_position(key, left);
        return __link(node, parent, left);
    }
    iterator __insert_equal_hint(const_iterator hint, const V& value) { return __emplace_equal_hint(hint, value); }
    template <class... Args> iterator __emplace_unique_hint(const_iterator hint, Args&&... args) {
        return __link_unique_hint(hint, __make(std::forward<Args>(args)...));
    }
    iterator __link_unique_hint(const_iterator hint, __tree_links* node) {
        __tree_links* position = hint.__node;
        const K& key = __key(node);
        if (position == &__header) {
            if (__count > 0 && __comp(__key(__header.__right), key))
                return __link(node, __header.__right, false);
        } else if (__comp(key, __key(position))) {
            if (position == __header.__left)
                return __link(node, position, true);
            __tree_links* before = __tree_previous(position);
            if (__comp(__key(before), key)) {
                if (before->__right == 0)
                    return __link(node, before, false);
                return __link(node, position, true);
            }
        } else if (__comp(__key(position), key)) {
            __tree_links* after = __tree_next(position);
            if (after == &__header || __comp(key, __key(after))) {
                if (position->__right == 0)
                    return __link(node, position, false);
                return __link(node, after, true);
            }
        } else {
            __drop(node);
            return iterator(position);
        }
        bool left = false;
        __tree_links* existing = 0;
        __tree_links* parent = __unique_position(key, left, existing);
        if (parent == 0) {
            __drop(node);
            return iterator(existing);
        }
        return __link(node, parent, left);
    }
    iterator __erase(const_iterator position) noexcept {
        __tree_links* node = position.__node;
        __tree_links* next = __tree_next(node);
        __tree_erase(node, &__header);
        __drop(node);
        --__count;
        return iterator(next);
    }
    iterator __erase(const_iterator first, const_iterator last) noexcept {
        if (first == begin() && last == end()) {
            clear();
            return end();
        }
        while (first != last)
            first = __erase(first);
        return last.__const_cast();
    }
    template <class Key> size_t __erase_key(const Key& key) {
        __tree_links* first = __lower(key);
        __tree_links* last = __upper(key);
        size_t n = 0;
        while (first != last) {
            first = __erase(const_iterator(first)).__node;
            ++n;
        }
        return n;
    }
};
template <class K, class V, class X, class C>
bool __tree_equal(const __tree<K, V, X, C>& a, const __tree<K, V, X, C>& b) {
    return a.size() == b.size() && std::equal(a.begin(), a.end(), b.begin());
}
template <class K, class V, class X, class C>
bool __tree_less(const __tree<K, V, X, C>& a, const __tree<K, V, X, C>& b) {
    return std::lexicographical_compare(a.begin(), a.end(), b.begin(), b.end());
}
template <class K> struct __set_key {
    static const K& key(const K& value) noexcept { return value; }
};
template <class K, class T> struct __map_key {
    static const K& key(const pair<const K, T>& value) noexcept { return value.first; }
};
}
`);

    X.addHeader('v4script/map', [
        ['std', 3, 170, 'map'],
        ['std', 171, 171, 'map'],
        ['std', 172, 172, 'map'],
        ['std', 173, 175, 'map'],
        ['std', 176, 178, 'operator=='],
        ['std', 179, 181, 'operator!='],
        ['std', 182, 184, 'operator<'],
        ['std', 185, 187, 'operator>'],
        ['std', 188, 190, 'operator<='],
        ['std', 191, 193, 'operator>='],
        ['std', 194, 194, 'swap'],
        ['std', 196, 285, 'multimap'],
        ['std', 286, 286, 'multimap'],
        ['std', 287, 290, 'operator=='],
        ['std', 291, 294, 'operator!='],
        ['std', 295, 298, 'operator<'],
        ['std', 299, 301, 'swap']
    ], String.raw`
namespace std {
template <class K, class T, class C = less<K>, class A = allocator<pair<const K, T>>> class map {
public:
    typedef K key_type;
    typedef T mapped_type;
    typedef pair<const K, T> value_type;
    typedef size_t size_type;
    typedef ptrdiff_t difference_type;
    typedef C key_compare;
    typedef A allocator_type;
    typedef value_type& reference;
    typedef const value_type& const_reference;
    typedef value_type* pointer;
    typedef const value_type* const_pointer;
    typedef __tree<K, value_type, __map_key<K, T>, C> __tree_type;
    typedef typename __tree_type::iterator iterator;
    typedef typename __tree_type::const_iterator const_iterator;
    typedef std::reverse_iterator<iterator> reverse_iterator;
    typedef std::reverse_iterator<const_iterator> const_reverse_iterator;
    class value_compare {
        friend class map;
    protected:
        C comp;
        value_compare(C c) : comp(c) {}
    public:
        bool operator()(const value_type& a, const value_type& b) const { return comp(a.first, b.first); }
    };

    __tree_type __tree_;

    map() : __tree_() {}
    explicit map(const C& comp, const A& = A()) : __tree_(comp) {}
    template <class I>
    map(I first, I last, const C& comp = C(), const A& = A()) : __tree_(comp) { insert(first, last); }
    map(initializer_list<value_type> list, const C& comp = C(), const A& = A()) : __tree_(comp) {
        insert(list.begin(), list.end());
    }
    map& operator=(initializer_list<value_type> list) {
        clear();
        insert(list.begin(), list.end());
        return *this;
    }
    allocator_type get_allocator() const noexcept { return A(); }

    iterator begin() noexcept { return __tree_.begin(); }
    const_iterator begin() const noexcept { return __tree_.begin(); }
    iterator end() noexcept { return __tree_.end(); }
    const_iterator end() const noexcept { return __tree_.end(); }
    const_iterator cbegin() const noexcept { return __tree_.begin(); }
    const_iterator cend() const noexcept { return __tree_.end(); }
    reverse_iterator rbegin() noexcept { return reverse_iterator(end()); }
    const_reverse_iterator rbegin() const noexcept { return const_reverse_iterator(end()); }
    reverse_iterator rend() noexcept { return reverse_iterator(begin()); }
    const_reverse_iterator rend() const noexcept { return const_reverse_iterator(begin()); }
    const_reverse_iterator crbegin() const noexcept { return const_reverse_iterator(end()); }
    const_reverse_iterator crend() const noexcept { return const_reverse_iterator(begin()); }
    bool empty() const noexcept { return __tree_.empty(); }
    size_t size() const noexcept { return __tree_.size(); }
    size_t max_size() const noexcept { return 9223372036854775807UL / sizeof(typename __tree_type::__node_type); }

    // A node with the key and the mapped value made from args.
    template <class Key, class... Args> iterator __emplace_key(const_iterator hint, Key&& key, Args&&... args) {
        typedef typename __tree_type::__node_type N;
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
        return __tree_.__link_unique_hint(hint, node);
    }
    T& operator[](const K& key) {
        iterator it = lower_bound(key);
        if (it == end() || __tree_.__comp(key, it->first))
            it = __emplace_key(it, key);
        return it->second;
    }
    T& operator[](K&& key) {
        iterator it = lower_bound(key);
        if (it == end() || __tree_.__comp(key, it->first))
            it = __emplace_key(it, std::move(key));
        return it->second;
    }
    T& at(const K& key) {
        iterator it = find(key);
        if (it == end())
            throw out_of_range("map::at");
        return it->second;
    }
    const T& at(const K& key) const {
        const_iterator it = find(key);
        if (it == end())
            throw out_of_range("map::at");
        return it->second;
    }

    pair<iterator, bool> insert(const value_type& value) { return __tree_.__insert_unique(value); }
    pair<iterator, bool> insert(value_type&& value) { return __tree_.__insert_unique(std::move(value)); }
    template <class P, class = typename enable_if<is_constructible<value_type, P&&>::value>::type>
    pair<iterator, bool> insert(P&& value) {
        return __tree_.__emplace_unique(std::forward<P>(value));
    }
    iterator insert(const_iterator hint, const value_type& value) { return __tree_.__emplace_unique_hint(hint, value); }
    iterator insert(const_iterator hint, value_type&& value) {
        return __tree_.__emplace_unique_hint(hint, std::move(value));
    }
    template <class I> void insert(I first, I last) {
        for (; first != last; ++first)
            __tree_.__emplace_unique_hint(end(), *first);
    }
    void insert(initializer_list<value_type> list) { insert(list.begin(), list.end()); }
    template <class... Args> pair<iterator, bool> emplace(Args&&... args) {
        return __tree_.__emplace_unique(std::forward<Args>(args)...);
    }
    template <class... Args> iterator emplace_hint(const_iterator hint, Args&&... args) {
        return __tree_.__emplace_unique_hint(hint, std::forward<Args>(args)...);
    }
    template <class... Args> pair<iterator, bool> try_emplace(const K& key, Args&&... args) {
        iterator it = lower_bound(key);
        if (it != end() && !__tree_.__comp(key, it->first))
            return pair<iterator, bool>(it, false);
        return pair<iterator, bool>(__emplace_key(it, key, std::forward<Args>(args)...), true);
    }
    template <class... Args> pair<iterator, bool> try_emplace(K&& key, Args&&... args) {
        iterator it = lower_bound(key);
        if (it != end() && !__tree_.__comp(key, it->first))
            return pair<iterator, bool>(it, false);
        return pair<iterator, bool>(__emplace_key(it, std::move(key), std::forward<Args>(args)...), true);
    }
    template <class M> pair<iterator, bool> insert_or_assign(const K& key, M&& value) {
        iterator it = lower_bound(key);
        if (it != end() && !__tree_.__comp(key, it->first)) {
            it->second = std::forward<M>(value);
            return pair<iterator, bool>(it, false);
        }
        return pair<iterator, bool>(__tree_.__emplace_unique_hint(it, key, std::forward<M>(value)), true);
    }
    iterator erase(const_iterator position) { return __tree_.__erase(position); }
    iterator erase(iterator position) { return __tree_.__erase(position); }
    iterator erase(const_iterator first, const_iterator last) { return __tree_.__erase(first, last); }
    size_t erase(const K& key) { return __tree_.__erase_key(key); }
    void clear() noexcept { __tree_.clear(); }
    void swap(map& other) noexcept { __tree_.swap(other.__tree_); }

    key_compare key_comp() const { return __tree_.__comp; }
    value_compare value_comp() const { return value_compare(__tree_.__comp); }
    iterator find(const K& key) { return iterator(__tree_.__find(key)); }
    const_iterator find(const K& key) const { return const_iterator(__tree_.__find(key)); }
    size_t count(const K& key) const { return __tree_.__find(key) == &__tree_.__header ? 0 : 1; }
    iterator lower_bound(const K& key) { return iterator(__tree_.__lower(key)); }
    const_iterator lower_bound(const K& key) const { return const_iterator(__tree_.__lower(key)); }
    iterator upper_bound(const K& key) { return iterator(__tree_.__upper(key)); }
    const_iterator upper_bound(const K& key) const { return const_iterator(__tree_.__upper(key)); }
    pair<iterator, iterator> equal_range(const K& key) {
        return pair<iterator, iterator>(lower_bound(key), upper_bound(key));
    }
    pair<const_iterator, const_iterator> equal_range(const K& key) const {
        return pair<const_iterator, const_iterator>(lower_bound(key), upper_bound(key));
    }
};
template <class K, class T> map(initializer_list<pair<K, T>>) -> map<K, T>;
template <class K, class T, class C> map(initializer_list<pair<K, T>>, C) -> map<K, T, C>;
template <class I>
map(I, I) -> map<typename remove_const<typename iterator_traits<I>::value_type::first_type>::type,
                 typename iterator_traits<I>::value_type::second_type>;
template <class K, class T, class C, class A> bool operator==(const map<K, T, C, A>& a, const map<K, T, C, A>& b) {
    return __tree_equal(a.__tree_, b.__tree_);
}
template <class K, class T, class C, class A> bool operator!=(const map<K, T, C, A>& a, const map<K, T, C, A>& b) {
    return !(a == b);
}
template <class K, class T, class C, class A> bool operator<(const map<K, T, C, A>& a, const map<K, T, C, A>& b) {
    return __tree_less(a.__tree_, b.__tree_);
}
template <class K, class T, class C, class A> bool operator>(const map<K, T, C, A>& a, const map<K, T, C, A>& b) {
    return b < a;
}
template <class K, class T, class C, class A> bool operator<=(const map<K, T, C, A>& a, const map<K, T, C, A>& b) {
    return !(b < a);
}
template <class K, class T, class C, class A> bool operator>=(const map<K, T, C, A>& a, const map<K, T, C, A>& b) {
    return !(a < b);
}
template <class K, class T, class C, class A> void swap(map<K, T, C, A>& a, map<K, T, C, A>& b) noexcept { a.swap(b); }

template <class K, class T, class C = less<K>, class A = allocator<pair<const K, T>>> class multimap {
public:
    typedef K key_type;
    typedef T mapped_type;
    typedef pair<const K, T> value_type;
    typedef size_t size_type;
    typedef ptrdiff_t difference_type;
    typedef C key_compare;
    typedef A allocator_type;
    typedef value_type& reference;
    typedef const value_type& const_reference;
    typedef value_type* pointer;
    typedef const value_type* const_pointer;
    typedef __tree<K, value_type, __map_key<K, T>, C> __tree_type;
    typedef typename __tree_type::iterator iterator;
    typedef typename __tree_type::const_iterator const_iterator;
    typedef std::reverse_iterator<iterator> reverse_iterator;
    typedef std::reverse_iterator<const_iterator> const_reverse_iterator;

    __tree_type __tree_;

    multimap() : __tree_() {}
    explicit multimap(const C& comp, const A& = A()) : __tree_(comp) {}
    template <class I> multimap(I first, I last, const C& comp = C(), const A& = A()) : __tree_(comp) {
        insert(first, last);
    }
    multimap(initializer_list<value_type> list, const C& comp = C(), const A& = A()) : __tree_(comp) {
        insert(list.begin(), list.end());
    }
    multimap& operator=(initializer_list<value_type> list) {
        clear();
        insert(list.begin(), list.end());
        return *this;
    }
    allocator_type get_allocator() const noexcept { return A(); }

    iterator begin() noexcept { return __tree_.begin(); }
    const_iterator begin() const noexcept { return __tree_.begin(); }
    iterator end() noexcept { return __tree_.end(); }
    const_iterator end() const noexcept { return __tree_.end(); }
    const_iterator cbegin() const noexcept { return __tree_.begin(); }
    const_iterator cend() const noexcept { return __tree_.end(); }
    reverse_iterator rbegin() noexcept { return reverse_iterator(end()); }
    const_reverse_iterator rbegin() const noexcept { return const_reverse_iterator(end()); }
    reverse_iterator rend() noexcept { return reverse_iterator(begin()); }
    const_reverse_iterator rend() const noexcept { return const_reverse_iterator(begin()); }
    bool empty() const noexcept { return __tree_.empty(); }
    size_t size() const noexcept { return __tree_.size(); }
    size_t max_size() const noexcept { return 9223372036854775807UL / sizeof(typename __tree_type::__node_type); }

    iterator insert(const value_type& value) { return __tree_.__emplace_equal(value); }
    iterator insert(value_type&& value) { return __tree_.__emplace_equal(std::move(value)); }
    template <class P, class = typename enable_if<is_constructible<value_type, P&&>::value>::type>
    iterator insert(P&& value) {
        return __tree_.__emplace_equal(std::forward<P>(value));
    }
    iterator insert(const_iterator hint, const value_type& value) { return __tree_.__emplace_equal_hint(hint, value); }
    template <class I> void insert(I first, I last) {
        for (; first != last; ++first)
            __tree_.__emplace_equal_hint(end(), *first);
    }
    void insert(initializer_list<value_type> list) { insert(list.begin(), list.end()); }
    template <class... Args> iterator emplace(Args&&... args) {
        return __tree_.__emplace_equal(std::forward<Args>(args)...);
    }
    template <class... Args> iterator emplace_hint(const_iterator hint, Args&&... args) {
        return __tree_.__emplace_equal_hint(hint, std::forward<Args>(args)...);
    }
    iterator erase(const_iterator position) { return __tree_.__erase(position); }
    iterator erase(iterator position) { return __tree_.__erase(position); }
    iterator erase(const_iterator first, const_iterator last) { return __tree_.__erase(first, last); }
    size_t erase(const K& key) { return __tree_.__erase_key(key); }
    void clear() noexcept { __tree_.clear(); }
    void swap(multimap& other) noexcept { __tree_.swap(other.__tree_); }

    key_compare key_comp() const { return __tree_.__comp; }
    iterator find(const K& key) { return iterator(__tree_.__find(key)); }
    const_iterator find(const K& key) const { return const_iterator(__tree_.__find(key)); }
    size_t count(const K& key) const { return __tree_.__count_of(key); }
    iterator lower_bound(const K& key) { return iterator(__tree_.__lower(key)); }
    const_iterator lower_bound(const K& key) const { return const_iterator(__tree_.__lower(key)); }
    iterator upper_bound(const K& key) { return iterator(__tree_.__upper(key)); }
    const_iterator upper_bound(const K& key) const { return const_iterator(__tree_.__upper(key)); }
    pair<iterator, iterator> equal_range(const K& key) {
        return pair<iterator, iterator>(lower_bound(key), upper_bound(key));
    }
    pair<const_iterator, const_iterator> equal_range(const K& key) const {
        return pair<const_iterator, const_iterator>(lower_bound(key), upper_bound(key));
    }
};
template <class K, class T> multimap(initializer_list<pair<K, T>>) -> multimap<K, T>;
template <class K, class T, class C, class A>
bool operator==(const multimap<K, T, C, A>& a, const multimap<K, T, C, A>& b) {
    return __tree_equal(a.__tree_, b.__tree_);
}
template <class K, class T, class C, class A>
bool operator!=(const multimap<K, T, C, A>& a, const multimap<K, T, C, A>& b) {
    return !(a == b);
}
template <class K, class T, class C, class A>
bool operator<(const multimap<K, T, C, A>& a, const multimap<K, T, C, A>& b) {
    return __tree_less(a.__tree_, b.__tree_);
}
template <class K, class T, class C, class A> void swap(multimap<K, T, C, A>& a, multimap<K, T, C, A>& b) noexcept {
    a.swap(b);
}
}
`);

    X.addHeader('v4script/set', [
        ['std', 3, 87, 'set'],
        ['std', 88, 88, 'set'],
        ['std', 89, 91, 'operator=='],
        ['std', 92, 92, 'operator!='],
        ['std', 93, 95, 'operator<'],
        ['std', 96, 96, 'operator>'],
        ['std', 97, 97, 'operator<='],
        ['std', 98, 98, 'operator>='],
        ['std', 99, 99, 'swap'],
        ['std', 101, 176, 'multiset'],
        ['std', 177, 177, 'multiset'],
        ['std', 178, 180, 'operator=='],
        ['std', 181, 183, 'operator!='],
        ['std', 184, 186, 'operator<'],
        ['std', 187, 187, 'swap']
    ], String.raw`
namespace std {
template <class K, class C = less<K>, class A = allocator<K>> class set {
public:
    typedef K key_type;
    typedef K value_type;
    typedef size_t size_type;
    typedef ptrdiff_t difference_type;
    typedef C key_compare;
    typedef C value_compare;
    typedef A allocator_type;
    typedef K& reference;
    typedef const K& const_reference;
    typedef K* pointer;
    typedef const K* const_pointer;
    typedef __tree<K, K, __set_key<K>, C> __tree_type;
    typedef typename __tree_type::const_iterator iterator;
    typedef typename __tree_type::const_iterator const_iterator;
    typedef std::reverse_iterator<iterator> reverse_iterator;
    typedef std::reverse_iterator<const_iterator> const_reverse_iterator;

    __tree_type __tree_;

    set() : __tree_() {}
    explicit set(const C& comp, const A& = A()) : __tree_(comp) {}
    template <class I>
    set(I first, I last, const C& comp = C(), const A& = A()) : __tree_(comp) { insert(first, last); }
    set(initializer_list<K> list, const C& comp = C(), const A& = A()) : __tree_(comp) {
        insert(list.begin(), list.end());
    }
    set& operator=(initializer_list<K> list) {
        clear();
        insert(list.begin(), list.end());
        return *this;
    }
    allocator_type get_allocator() const noexcept { return A(); }

    iterator begin() const noexcept { return __tree_.begin(); }
    iterator end() const noexcept { return __tree_.end(); }
    iterator cbegin() const noexcept { return __tree_.begin(); }
    iterator cend() const noexcept { return __tree_.end(); }
    reverse_iterator rbegin() const noexcept { return reverse_iterator(end()); }
    reverse_iterator rend() const noexcept { return reverse_iterator(begin()); }
    reverse_iterator crbegin() const noexcept { return reverse_iterator(end()); }
    reverse_iterator crend() const noexcept { return reverse_iterator(begin()); }
    bool empty() const noexcept { return __tree_.empty(); }
    size_t size() const noexcept { return __tree_.size(); }
    size_t max_size() const noexcept { return 9223372036854775807UL / sizeof(typename __tree_type::__node_type); }

    pair<iterator, bool> insert(const K& value) {
        pair<typename __tree_type::iterator, bool> result = __tree_.__insert_unique(value);
        return pair<iterator, bool>(result.first, result.second);
    }
    pair<iterator, bool> insert(K&& value) {
        pair<typename __tree_type::iterator, bool> result = __tree_.__insert_unique(std::move(value));
        return pair<iterator, bool>(result.first, result.second);
    }
    iterator insert(const_iterator hint, const K& value) { return __tree_.__emplace_unique_hint(hint, value); }
    iterator insert(const_iterator hint, K&& value) { return __tree_.__emplace_unique_hint(hint, std::move(value)); }
    template <class I> void insert(I first, I last) {
        for (; first != last; ++first)
            __tree_.__emplace_unique_hint(end(), *first);
    }
    void insert(initializer_list<K> list) { insert(list.begin(), list.end()); }
    template <class... Args> pair<iterator, bool> emplace(Args&&... args) {
        pair<typename __tree_type::iterator, bool> result = __tree_.__emplace_unique(std::forward<Args>(args)...);
        return pair<iterator, bool>(result.first, result.second);
    }
    template <class... Args> iterator emplace_hint(const_iterator hint, Args&&... args) {
        return __tree_.__emplace_unique_hint(hint, std::forward<Args>(args)...);
    }
    iterator erase(const_iterator position) { return __tree_.__erase(position); }
    iterator erase(const_iterator first, const_iterator last) { return __tree_.__erase(first, last); }
    size_t erase(const K& key) { return __tree_.__erase_key(key); }
    void clear() noexcept { __tree_.clear(); }
    void swap(set& other) noexcept { __tree_.swap(other.__tree_); }

    key_compare key_comp() const { return __tree_.__comp; }
    value_compare value_comp() const { return __tree_.__comp; }
    iterator find(const K& key) const { return const_iterator(__tree_.__find(key)); }
    size_t count(const K& key) const { return __tree_.__find(key) == &__tree_.__header ? 0 : 1; }
    iterator lower_bound(const K& key) const { return const_iterator(__tree_.__lower(key)); }
    iterator upper_bound(const K& key) const { return const_iterator(__tree_.__upper(key)); }
    pair<iterator, iterator> equal_range(const K& key) const {
        return pair<iterator, iterator>(lower_bound(key), upper_bound(key));
    }
};
template <class I> set(I, I) -> set<typename iterator_traits<I>::value_type>;
template <class K, class C, class A> bool operator==(const set<K, C, A>& a, const set<K, C, A>& b) {
    return __tree_equal(a.__tree_, b.__tree_);
}
template <class K, class C, class A> bool operator!=(const set<K, C, A>& a, const set<K, C, A>& b) { return !(a == b); }
template <class K, class C, class A> bool operator<(const set<K, C, A>& a, const set<K, C, A>& b) {
    return __tree_less(a.__tree_, b.__tree_);
}
template <class K, class C, class A> bool operator>(const set<K, C, A>& a, const set<K, C, A>& b) { return b < a; }
template <class K, class C, class A> bool operator<=(const set<K, C, A>& a, const set<K, C, A>& b) { return !(b < a); }
template <class K, class C, class A> bool operator>=(const set<K, C, A>& a, const set<K, C, A>& b) { return !(a < b); }
template <class K, class C, class A> void swap(set<K, C, A>& a, set<K, C, A>& b) noexcept { a.swap(b); }

template <class K, class C = less<K>, class A = allocator<K>> class multiset {
public:
    typedef K key_type;
    typedef K value_type;
    typedef size_t size_type;
    typedef ptrdiff_t difference_type;
    typedef C key_compare;
    typedef C value_compare;
    typedef A allocator_type;
    typedef K& reference;
    typedef const K& const_reference;
    typedef K* pointer;
    typedef const K* const_pointer;
    typedef __tree<K, K, __set_key<K>, C> __tree_type;
    typedef typename __tree_type::const_iterator iterator;
    typedef typename __tree_type::const_iterator const_iterator;
    typedef std::reverse_iterator<iterator> reverse_iterator;
    typedef std::reverse_iterator<const_iterator> const_reverse_iterator;

    __tree_type __tree_;

    multiset() : __tree_() {}
    explicit multiset(const C& comp, const A& = A()) : __tree_(comp) {}
    template <class I> multiset(I first, I last, const C& comp = C(), const A& = A()) : __tree_(comp) {
        insert(first, last);
    }
    multiset(initializer_list<K> list, const C& comp = C(), const A& = A()) : __tree_(comp) {
        insert(list.begin(), list.end());
    }
    multiset& operator=(initializer_list<K> list) {
        clear();
        insert(list.begin(), list.end());
        return *this;
    }
    allocator_type get_allocator() const noexcept { return A(); }

    iterator begin() const noexcept { return __tree_.begin(); }
    iterator end() const noexcept { return __tree_.end(); }
    iterator cbegin() const noexcept { return __tree_.begin(); }
    iterator cend() const noexcept { return __tree_.end(); }
    reverse_iterator rbegin() const noexcept { return reverse_iterator(end()); }
    reverse_iterator rend() const noexcept { return reverse_iterator(begin()); }
    bool empty() const noexcept { return __tree_.empty(); }
    size_t size() const noexcept { return __tree_.size(); }
    size_t max_size() const noexcept { return 9223372036854775807UL / sizeof(typename __tree_type::__node_type); }

    iterator insert(const K& value) { return __tree_.__emplace_equal(value); }
    iterator insert(K&& value) { return __tree_.__emplace_equal(std::move(value)); }
    iterator insert(const_iterator hint, const K& value) { return __tree_.__emplace_equal_hint(hint, value); }
    template <class I> void insert(I first, I last) {
        for (; first != last; ++first)
            __tree_.__emplace_equal_hint(end(), *first);
    }
    void insert(initializer_list<K> list) { insert(list.begin(), list.end()); }
    template <class... Args> iterator emplace(Args&&... args) {
        return __tree_.__emplace_equal(std::forward<Args>(args)...);
    }
    template <class... Args> iterator emplace_hint(const_iterator hint, Args&&... args) {
        return __tree_.__emplace_equal_hint(hint, std::forward<Args>(args)...);
    }
    iterator erase(const_iterator position) { return __tree_.__erase(position); }
    iterator erase(const_iterator first, const_iterator last) { return __tree_.__erase(first, last); }
    size_t erase(const K& key) { return __tree_.__erase_key(key); }
    void clear() noexcept { __tree_.clear(); }
    void swap(multiset& other) noexcept { __tree_.swap(other.__tree_); }

    key_compare key_comp() const { return __tree_.__comp; }
    value_compare value_comp() const { return __tree_.__comp; }
    iterator find(const K& key) const { return const_iterator(__tree_.__find(key)); }
    size_t count(const K& key) const { return __tree_.__count_of(key); }
    iterator lower_bound(const K& key) const { return const_iterator(__tree_.__lower(key)); }
    iterator upper_bound(const K& key) const { return const_iterator(__tree_.__upper(key)); }
    pair<iterator, iterator> equal_range(const K& key) const {
        return pair<iterator, iterator>(lower_bound(key), upper_bound(key));
    }
};
template <class I> multiset(I, I) -> multiset<typename iterator_traits<I>::value_type>;
template <class K, class C, class A> bool operator==(const multiset<K, C, A>& a, const multiset<K, C, A>& b) {
    return __tree_equal(a.__tree_, b.__tree_);
}
template <class K, class C, class A> bool operator!=(const multiset<K, C, A>& a, const multiset<K, C, A>& b) {
    return !(a == b);
}
template <class K, class C, class A> bool operator<(const multiset<K, C, A>& a, const multiset<K, C, A>& b) {
    return __tree_less(a.__tree_, b.__tree_);
}
template <class K, class C, class A> void swap(multiset<K, C, A>& a, multiset<K, C, A>& b) noexcept { a.swap(b); }
}
`);
})(globalThis);
