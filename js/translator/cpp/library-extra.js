// C++ library: <ratio>, <chrono>, <thread> (waiting only), <random> and
// <bitset>. The engines and distributions give the numbers of libstdc++
// (the algorithms of the standard and the ones observed in g++).
// The tables of declarations are written by tools/build-cpp-library.mjs.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    if (X.headers['v4script/ratio'])
        return;

    X.addHeader('v4script/ratio', [
        ['std', 3, 5, '__static_gcd'],
        ['std', 6, 8, '__static_gcd'],
        ['std', 9, 13, 'ratio'],
        ['std', 14, 14, 'ratio_multiply'],
        ['std', 15, 15, 'ratio_divide'],
        ['std', 16, 16, 'ratio_add'],
        ['std', 17, 17, 'ratio_subtract'],
        ['std', 18, 18, 'ratio_equal'],
        ['std', 19, 19, 'ratio_less'],
        ['std', 20, 20, 'atto'],
        ['std', 21, 21, 'femto'],
        ['std', 22, 22, 'pico'],
        ['std', 23, 23, 'nano'],
        ['std', 24, 24, 'micro'],
        ['std', 25, 25, 'milli'],
        ['std', 26, 26, 'centi'],
        ['std', 27, 27, 'deci'],
        ['std', 28, 28, 'deca'],
        ['std', 29, 29, 'hecto'],
        ['std', 30, 30, 'kilo'],
        ['std', 31, 31, 'mega'],
        ['std', 32, 32, 'giga'],
        ['std', 33, 33, 'tera'],
        ['std', 34, 34, 'peta'],
        ['std', 35, 35, 'exa']
    ], String.raw`
namespace std {
template <long long A, long long B> struct __static_gcd {
    static constexpr long long value = __static_gcd<B, A % B>::value;
};
template <long long A> struct __static_gcd<A, 0> {
    static constexpr long long value = A < 0 ? -A : A;
};
template <long long N, long long D = 1> struct ratio {
    static constexpr long long num = (D < 0 ? -N : N) / __static_gcd<N, D>::value;
    static constexpr long long den = (D < 0 ? -D : D) / __static_gcd<N, D>::value;
    typedef ratio<num, den> type;
};
template <class R1, class R2> using ratio_multiply = ratio<R1::num * R2::num, R1::den * R2::den>;
template <class R1, class R2> using ratio_divide = ratio<R1::num * R2::den, R1::den * R2::num>;
template <class R1, class R2> using ratio_add = ratio<R1::num * R2::den + R2::num * R1::den, R1::den * R2::den>;
template <class R1, class R2> using ratio_subtract = ratio<R1::num * R2::den - R2::num * R1::den, R1::den * R2::den>;
template <class R1, class R2> struct ratio_equal : bool_constant<R1::num == R2::num && R1::den == R2::den> {};
template <class R1, class R2> struct ratio_less : bool_constant<R1::num * R2::den < R2::num * R1::den> {};
typedef ratio<1, 1000000000000000000LL> atto;
typedef ratio<1, 1000000000000000LL> femto;
typedef ratio<1, 1000000000000LL> pico;
typedef ratio<1, 1000000000> nano;
typedef ratio<1, 1000000> micro;
typedef ratio<1, 1000> milli;
typedef ratio<1, 100> centi;
typedef ratio<1, 10> deci;
typedef ratio<10, 1> deca;
typedef ratio<100, 1> hecto;
typedef ratio<1000, 1> kilo;
typedef ratio<1000000, 1> mega;
typedef ratio<1000000000, 1> giga;
typedef ratio<1000000000000LL, 1> tera;
typedef ratio<1000000000000000LL, 1> peta;
typedef ratio<1000000000000000000LL, 1> exa;
}
`);

    X.addHeader('v4script/chrono', [
        ['std::chrono', 4, 4, 'duration'],
        ['std::chrono', 5, 5, '__is_duration'],
        ['std::chrono', 6, 6, '__is_duration'],
        ['std::chrono', 7, 7, 'treat_as_floating_point'],
        ['std::chrono', 8, 12, 'duration_values'],
        ['std::chrono', 14, 26, 'duration_cast'],
        ['std::chrono', 28, 77, 'duration'],
        ['std', 80, 86, 'common_type'],
        ['std::chrono', 89, 94, 'operator+'],
        ['std::chrono', 95, 100, 'operator-'],
        ['std::chrono', 101, 105, 'operator*'],
        ['std::chrono', 106, 109, 'operator*'],
        ['std::chrono', 110, 114, 'operator/'],
        ['std::chrono', 115, 119, 'operator/'],
        ['std::chrono', 120, 124, 'operator%'],
        ['std::chrono', 125, 130, 'operator%'],
        ['std::chrono', 131, 135, 'operator=='],
        ['std::chrono', 136, 139, 'operator!='],
        ['std::chrono', 140, 144, 'operator<'],
        ['std::chrono', 145, 148, 'operator>'],
        ['std::chrono', 149, 152, 'operator<='],
        ['std::chrono', 153, 156, 'operator>='],
        ['std::chrono', 157, 160, 'floor'],
        ['std::chrono', 161, 164, 'ceil'],
        ['std::chrono', 165, 167, 'abs'],
        ['std::chrono', 169, 169, 'nanoseconds'],
        ['std::chrono', 170, 170, 'microseconds'],
        ['std::chrono', 171, 171, 'milliseconds'],
        ['std::chrono', 172, 172, 'seconds'],
        ['std::chrono', 173, 173, 'minutes'],
        ['std::chrono', 174, 174, 'hours'],
        ['std::chrono', 176, 197, 'time_point'],
        ['std::chrono', 198, 203, 'operator+'],
        ['std::chrono', 204, 209, 'operator-'],
        ['std::chrono', 210, 213, 'operator-'],
        ['std::chrono', 214, 217, 'operator=='],
        ['std::chrono', 218, 221, 'operator!='],
        ['std::chrono', 222, 225, 'operator<'],
        ['std::chrono', 226, 229, 'operator>'],
        ['std::chrono', 230, 233, 'operator<='],
        ['std::chrono', 234, 237, 'operator>='],
        ['std::chrono', 238, 240, 'time_point_cast'],
        ['std::chrono', 242, 253, 'system_clock'],
        ['std::chrono', 254, 261, 'steady_clock'],
        ['std::chrono', 262, 262, 'high_resolution_clock'],
        ['std::+literals::+chrono_literals', 267, 267, 'operator""h'],
        ['std::+literals::+chrono_literals', 268, 268, 'operator""min'],
        ['std::+literals::+chrono_literals', 269, 269, 'operator""s'],
        ['std::+literals::+chrono_literals', 270, 270, 'operator""ms'],
        ['std::+literals::+chrono_literals', 271, 271, 'operator""us'],
        ['std::+literals::+chrono_literals', 272, 272, 'operator""ns'],
        ['std::+literals::+chrono_literals', 273, 273, 'operator""s'],
        ['std::+literals::+chrono_literals', 274, 276, 'operator""ms'],
        ['std::chrono', 280, 280, '']
    ], String.raw`
namespace std {
namespace chrono {
template <class Rep, class Period = ratio<1>> class duration;
template <class T> struct __is_duration : false_type {};
template <class Rep, class Period> struct __is_duration<duration<Rep, Period>> : true_type {};
template <class Rep> struct treat_as_floating_point : is_floating_point<Rep> {};
template <class Rep> struct duration_values {
    static constexpr Rep zero() noexcept { return Rep(0); }
    static constexpr Rep min() noexcept { return numeric_limits<Rep>::lowest(); }
    static constexpr Rep max() noexcept { return numeric_limits<Rep>::max(); }
};

template <class To, class Rep, class Period> constexpr To duration_cast(const duration<Rep, Period>& d) {
    typedef ratio_divide<Period, typename To::period> factor;
    typedef typename common_type<typename To::rep, Rep, long long>::type common;
    if constexpr (factor::num == 1 && factor::den == 1)
        return To(static_cast<typename To::rep>(d.count()));
    else if constexpr (factor::den == 1)
        return To(static_cast<typename To::rep>(static_cast<common>(d.count()) * static_cast<common>(factor::num)));
    else if constexpr (factor::num == 1)
        return To(static_cast<typename To::rep>(static_cast<common>(d.count()) / static_cast<common>(factor::den)));
    else
        return To(static_cast<typename To::rep>(static_cast<common>(d.count()) * static_cast<common>(factor::num) /
                                                static_cast<common>(factor::den)));
}

template <class Rep, class Period> class duration {
    Rep __count;
public:
    typedef Rep rep;
    typedef typename Period::type period;
    constexpr duration() = default;
    duration(const duration&) = default;
    template <class Rep2, class = typename enable_if<is_convertible<const Rep2&, Rep>::value &&
                                                    (treat_as_floating_point<Rep>::value ||
                                                     !treat_as_floating_point<Rep2>::value)>::type>
    constexpr explicit duration(const Rep2& count) : __count(static_cast<Rep>(count)) {}
    template <class Rep2, class Period2,
              class = typename enable_if<treat_as_floating_point<Rep>::value ||
                                         (ratio_divide<Period2, Period>::den == 1 &&
                                          !treat_as_floating_point<Rep2>::value)>::type>
    constexpr duration(const duration<Rep2, Period2>& d) : __count(duration_cast<duration>(d).count()) {}
    duration& operator=(const duration&) = default;
    constexpr Rep count() const { return __count; }
    constexpr duration operator+() const { return *this; }
    constexpr duration operator-() const { return duration(-__count); }
    duration& operator++() {
        ++__count;
        return *this;
    }
    duration operator++(int) { return duration(__count++); }
    duration& operator--() {
        --__count;
        return *this;
    }
    duration operator--(int) { return duration(__count--); }
    duration& operator+=(const duration& d) {
        __count += d.count();
        return *this;
    }
    duration& operator-=(const duration& d) {
        __count -= d.count();
        return *this;
    }
    duration& operator*=(const Rep& r) {
        __count *= r;
        return *this;
    }
    duration& operator/=(const Rep& r) {
        __count /= r;
        return *this;
    }
    static constexpr duration zero() noexcept { return duration(duration_values<Rep>::zero()); }
    static constexpr duration min() noexcept { return duration(duration_values<Rep>::min()); }
    static constexpr duration max() noexcept { return duration(duration_values<Rep>::max()); }
};
}

template <class R1, class P1, class R2, class P2>
struct common_type<chrono::duration<R1, P1>, chrono::duration<R2, P2>> {
    typedef chrono::duration<typename common_type<R1, R2>::type,
                             ratio<__static_gcd<P1::num, P2::num>::value,
                                   (P1::den / __static_gcd<P1::den, P2::den>::value) * P2::den>>
        type;
};

namespace chrono {
template <class R1, class P1, class R2, class P2>
constexpr typename common_type<duration<R1, P1>, duration<R2, P2>>::type operator+(const duration<R1, P1>& a,
                                                                                    const duration<R2, P2>& b) {
    typedef typename common_type<duration<R1, P1>, duration<R2, P2>>::type C;
    return C(C(a).count() + C(b).count());
}
template <class R1, class P1, class R2, class P2>
constexpr typename common_type<duration<R1, P1>, duration<R2, P2>>::type operator-(const duration<R1, P1>& a,
                                                                                    const duration<R2, P2>& b) {
    typedef typename common_type<duration<R1, P1>, duration<R2, P2>>::type C;
    return C(C(a).count() - C(b).count());
}
template <class R1, class P, class R2, class = typename enable_if<!__is_duration<R2>::value>::type>
constexpr duration<typename common_type<R1, R2>::type, P> operator*(const duration<R1, P>& d, const R2& r) {
    typedef duration<typename common_type<R1, R2>::type, P> C;
    return C(C(d).count() * r);
}
template <class R1, class R2, class P, class = typename enable_if<!__is_duration<R1>::value>::type>
constexpr duration<typename common_type<R1, R2>::type, P> operator*(const R1& r, const duration<R2, P>& d) {
    return d * r;
}
template <class R1, class P, class R2, class = typename enable_if<!__is_duration<R2>::value>::type>
constexpr duration<typename common_type<R1, R2>::type, P> operator/(const duration<R1, P>& d, const R2& r) {
    typedef duration<typename common_type<R1, R2>::type, P> C;
    return C(C(d).count() / r);
}
template <class R1, class P1, class R2, class P2>
constexpr typename common_type<R1, R2>::type operator/(const duration<R1, P1>& a, const duration<R2, P2>& b) {
    typedef typename common_type<duration<R1, P1>, duration<R2, P2>>::type C;
    return C(a).count() / C(b).count();
}
template <class R1, class P, class R2, class = typename enable_if<!__is_duration<R2>::value>::type>
constexpr duration<typename common_type<R1, R2>::type, P> operator%(const duration<R1, P>& d, const R2& r) {
    typedef duration<typename common_type<R1, R2>::type, P> C;
    return C(C(d).count() % r);
}
template <class R1, class P1, class R2, class P2>
constexpr typename common_type<duration<R1, P1>, duration<R2, P2>>::type operator%(const duration<R1, P1>& a,
                                                                                    const duration<R2, P2>& b) {
    typedef typename common_type<duration<R1, P1>, duration<R2, P2>>::type C;
    return C(C(a).count() % C(b).count());
}
template <class R1, class P1, class R2, class P2>
constexpr bool operator==(const duration<R1, P1>& a, const duration<R2, P2>& b) {
    typedef typename common_type<duration<R1, P1>, duration<R2, P2>>::type C;
    return C(a).count() == C(b).count();
}
template <class R1, class P1, class R2, class P2>
constexpr bool operator!=(const duration<R1, P1>& a, const duration<R2, P2>& b) {
    return !(a == b);
}
template <class R1, class P1, class R2, class P2>
constexpr bool operator<(const duration<R1, P1>& a, const duration<R2, P2>& b) {
    typedef typename common_type<duration<R1, P1>, duration<R2, P2>>::type C;
    return C(a).count() < C(b).count();
}
template <class R1, class P1, class R2, class P2>
constexpr bool operator>(const duration<R1, P1>& a, const duration<R2, P2>& b) {
    return b < a;
}
template <class R1, class P1, class R2, class P2>
constexpr bool operator<=(const duration<R1, P1>& a, const duration<R2, P2>& b) {
    return !(b < a);
}
template <class R1, class P1, class R2, class P2>
constexpr bool operator>=(const duration<R1, P1>& a, const duration<R2, P2>& b) {
    return !(a < b);
}
template <class To, class Rep, class Period> constexpr To floor(const duration<Rep, Period>& d) {
    To t = duration_cast<To>(d);
    return t > d ? t - To(1) : t;
}
template <class To, class Rep, class Period> constexpr To ceil(const duration<Rep, Period>& d) {
    To t = duration_cast<To>(d);
    return t < d ? t + To(1) : t;
}
template <class Rep, class Period> constexpr duration<Rep, Period> abs(duration<Rep, Period> d) {
    return d >= d.zero() ? d : -d;
}

typedef duration<long long, nano> nanoseconds;
typedef duration<long long, micro> microseconds;
typedef duration<long long, milli> milliseconds;
typedef duration<long long> seconds;
typedef duration<long long, ratio<60>> minutes;
typedef duration<long long, ratio<3600>> hours;

template <class Clock, class Duration = typename Clock::duration> class time_point {
    Duration __since_epoch;
public:
    typedef Clock clock;
    typedef Duration duration;
    typedef typename Duration::rep rep;
    typedef typename Duration::period period;
    constexpr time_point() : __since_epoch(Duration::zero()) {}
    constexpr explicit time_point(const Duration& d) : __since_epoch(d) {}
    template <class D2> constexpr time_point(const time_point<Clock, D2>& t) : __since_epoch(t.time_since_epoch()) {}
    constexpr Duration time_since_epoch() const { return __since_epoch; }
    time_point& operator+=(const Duration& d) {
        __since_epoch += d;
        return *this;
    }
    time_point& operator-=(const Duration& d) {
        __since_epoch -= d;
        return *this;
    }
    static constexpr time_point min() noexcept { return time_point(Duration::min()); }
    static constexpr time_point max() noexcept { return time_point(Duration::max()); }
};
template <class C, class D1, class R2, class P2>
constexpr time_point<C, typename common_type<D1, duration<R2, P2>>::type> operator+(const time_point<C, D1>& t,
                                                                                   const duration<R2, P2>& d) {
    typedef time_point<C, typename common_type<D1, duration<R2, P2>>::type> T;
    return T(t.time_since_epoch() + d);
}
template <class C, class D1, class R2, class P2>
constexpr time_point<C, typename common_type<D1, duration<R2, P2>>::type> operator-(const time_point<C, D1>& t,
                                                                                   const duration<R2, P2>& d) {
    typedef time_point<C, typename common_type<D1, duration<R2, P2>>::type> T;
    return T(t.time_since_epoch() - d);
}
template <class C, class D1, class D2>
constexpr typename common_type<D1, D2>::type operator-(const time_point<C, D1>& a, const time_point<C, D2>& b) {
    return a.time_since_epoch() - b.time_since_epoch();
}
template <class C, class D1, class D2>
constexpr bool operator==(const time_point<C, D1>& a, const time_point<C, D2>& b) {
    return a.time_since_epoch() == b.time_since_epoch();
}
template <class C, class D1, class D2>
constexpr bool operator!=(const time_point<C, D1>& a, const time_point<C, D2>& b) {
    return !(a == b);
}
template <class C, class D1, class D2>
constexpr bool operator<(const time_point<C, D1>& a, const time_point<C, D2>& b) {
    return a.time_since_epoch() < b.time_since_epoch();
}
template <class C, class D1, class D2>
constexpr bool operator>(const time_point<C, D1>& a, const time_point<C, D2>& b) {
    return b < a;
}
template <class C, class D1, class D2>
constexpr bool operator<=(const time_point<C, D1>& a, const time_point<C, D2>& b) {
    return !(b < a);
}
template <class C, class D1, class D2>
constexpr bool operator>=(const time_point<C, D1>& a, const time_point<C, D2>& b) {
    return !(a < b);
}
template <class To, class C, class D> constexpr time_point<C, To> time_point_cast(const time_point<C, D>& t) {
    return time_point<C, To>(duration_cast<To>(t.time_since_epoch()));
}

struct system_clock {
    typedef nanoseconds duration;
    typedef duration::rep rep;
    typedef duration::period period;
    typedef chrono::time_point<system_clock, duration> time_point;
    static constexpr bool is_steady = false;
    static time_point now() noexcept { return time_point(duration(__v4_clock(0) * 1000)); }
    static time_t to_time_t(const time_point& t) noexcept {
        return (time_t)duration_cast<seconds>(t.time_since_epoch()).count();
    }
    static time_point from_time_t(time_t t) noexcept { return time_point(seconds(t)); }
};
struct steady_clock {
    typedef nanoseconds duration;
    typedef duration::rep rep;
    typedef duration::period period;
    typedef chrono::time_point<steady_clock, duration> time_point;
    static constexpr bool is_steady = true;
    static time_point now() noexcept { return time_point(duration(__v4_clock(1) * 1000)); }
};
typedef system_clock high_resolution_clock;
}

inline namespace literals {
inline namespace chrono_literals {
constexpr chrono::hours operator""h(unsigned long long n) { return chrono::hours((long long)n); }
constexpr chrono::minutes operator""min(unsigned long long n) { return chrono::minutes((long long)n); }
constexpr chrono::seconds operator""s(unsigned long long n) { return chrono::seconds((long long)n); }
constexpr chrono::milliseconds operator""ms(unsigned long long n) { return chrono::milliseconds((long long)n); }
constexpr chrono::microseconds operator""us(unsigned long long n) { return chrono::microseconds((long long)n); }
constexpr chrono::nanoseconds operator""ns(unsigned long long n) { return chrono::nanoseconds((long long)n); }
constexpr chrono::duration<long double> operator""s(long double n) { return chrono::duration<long double>(n); }
constexpr chrono::duration<long double, milli> operator""ms(long double n) {
    return chrono::duration<long double, milli>(n);
}
}
}
namespace chrono {
using namespace literals::chrono_literals;
}
}
`);

    X.addHeader('v4script/thread', [
        ['std::this_thread', 5, 13, 'sleep_for'],
        ['std::this_thread', 14, 16, 'sleep_until'],
        ['std::this_thread', 17, 17, 'yield']
    ], String.raw`
namespace std {
namespace this_thread {
// A wait lets the other work of the host go on, as sleep() in C.
template <class Rep, class Period> void sleep_for(const chrono::duration<Rep, Period>& d) {
    long long nanoseconds = chrono::duration_cast<chrono::nanoseconds>(d).count();
    if (nanoseconds <= 0)
        return;
    struct timespec request;
    request.tv_sec = nanoseconds / 1000000000;
    request.tv_nsec = nanoseconds % 1000000000;
    ::nanosleep(&request, 0);
}
template <class Clock, class Duration> void sleep_until(const chrono::time_point<Clock, Duration>& t) {
    sleep_for(t - Clock::now());
}
inline void yield() noexcept {}
}
}
`);

    X.addHeader('v4script/random', [
        ['std', 3, 28, 'linear_congruential_engine'],
        ['std', 29, 29, 'minstd_rand0'],
        ['std', 30, 30, 'minstd_rand'],
        ['std', 32, 105, 'mersenne_twister_engine'],
        ['std', 106, 108, 'mt19937'],
        ['std', 109, 111, 'mt19937_64'],
        ['std', 112, 112, 'default_random_engine'],
        ['std', 114, 125, 'random_device'],
        ['std', 127, 172, 'seed_seq'],
        ['std', 175, 195, 'generate_canonical'],
        ['std', 198, 204, '__multiply_high'],
        ['std', 206, 279, 'uniform_int_distribution'],
        ['std', 281, 307, 'uniform_real_distribution'],
        ['std', 309, 340, 'normal_distribution'],
        ['std', 342, 351, 'bernoulli_distribution'],
        ['std', 353, 363, 'exponential_distribution'],
        ['std', 365, 376, 'geometric_distribution'],
        ['std', 378, 407, 'discrete_distribution'],
        ['std', 409, 427, 'poisson_distribution'],
        ['std', 430, 433, '__two_uniform'],
        ['std', 434, 458, 'shuffle']
    ], String.raw`
namespace std {
template <class U, U A, U C, U M> class linear_congruential_engine {
    U __state;
public:
    typedef U result_type;
    static constexpr U multiplier = A;
    static constexpr U increment = C;
    static constexpr U modulus = M;
    static constexpr U default_seed = 1;
    static constexpr U min() { return C == 0 ? 1 : 0; }
    static constexpr U max() { return M - 1; }
    explicit linear_congruential_engine(U s = default_seed) { seed(s); }
    void seed(U s = default_seed) {
        U value = M == 0 ? s : s % M;
        __state = (C % M == 0 && value == 0) ? 1 : value;
    }
    U operator()() {
        __state = (U)(((unsigned long long)A * __state + C) % M);
        return __state;
    }
    void discard(unsigned long long n) {
        for (; n > 0; --n)
            (*this)();
    }
    bool operator==(const linear_congruential_engine& other) const { return __state == other.__state; }
    bool operator!=(const linear_congruential_engine& other) const { return __state != other.__state; }
};
typedef linear_congruential_engine<unsigned long, 16807UL, 0UL, 2147483647UL> minstd_rand0;
typedef linear_congruential_engine<unsigned long, 48271UL, 0UL, 2147483647UL> minstd_rand;

template <class U, size_t W, size_t N, size_t M, size_t R, U A, size_t Us, U D, size_t S, U B, size_t T, U C, size_t L,
          U F>
class mersenne_twister_engine {
    U __state[N];
    size_t __index;
    static constexpr U __mask = W == 64 ? ~(U)0 : (((U)1 << W) - 1);
    void __twist() {
        const U upper = (~(U)0 << R) & __mask;
        const U lower = ~upper & __mask;
        for (size_t k = 0; k < N; ++k) {
            U y = (__state[k] & upper) | (__state[(k + 1) % N] & lower);
            __state[k] = __state[(k + M) % N] ^ (y >> 1) ^ ((y & 1) ? A : 0);
        }
        __index = 0;
    }
public:
    typedef U result_type;
    static constexpr size_t word_size = W;
    static constexpr size_t state_size = N;
    static constexpr U default_seed = 5489u;
    static constexpr U min() { return 0; }
    static constexpr U max() { return __mask; }
    explicit mersenne_twister_engine(U value = default_seed) { seed(value); }
    template <class Q, class = typename enable_if<!is_convertible<Q&, U>::value>::type>
    explicit mersenne_twister_engine(Q& sequence) {
        seed(sequence);
    }
    void seed(U value = default_seed) {
        __state[0] = value & __mask;
        for (size_t i = 1; i < N; ++i)
            __state[i] = (F * (__state[i - 1] ^ (__state[i - 1] >> (W - 2))) + i) & __mask;
        __index = N;
    }
    template <class Q, class = typename enable_if<!is_convertible<Q&, U>::value>::type> void seed(Q& sequence) {
        const size_t k = (W + 31) / 32;
        unsigned int words[N * k];
        sequence.generate(words, words + N * k);
        bool zero = true;
        for (size_t i = 0; i < N; ++i) {
            U value = 0;
            U factor = 1;
            for (size_t j = 0; j < k; ++j) {
                value += (U)words[k * i + j] * factor;
                factor = k > 1 ? (U)(factor << 32) : 0;
            }
            __state[i] = value & __mask;
            if (zero) {
                if (i == 0) {
                    if ((__state[0] & (~(U)0 << R) & __mask) != 0)
                        zero = false;
                } else if (__state[i] != 0) {
                    zero = false;
                }
            }
        }
        if (zero)
            __state[0] = (U)1 << (W - 1);
        __index = N;
    }
    U operator()() {
        if (__index >= N)
            __twist();
        U y = __state[__index++];
        y ^= (y >> Us) & D;
        y ^= (y << S) & B;
        y ^= (y << T) & C;
        y ^= y >> L;
        return y & __mask;
    }
    void discard(unsigned long long n) {
        for (; n > 0; --n)
            (*this)();
    }
};
typedef mersenne_twister_engine<unsigned long, 32, 624, 397, 31, 0x9908b0dfUL, 11, 0xffffffffUL, 7, 0x9d2c5680UL, 15,
                                0xefc60000UL, 18, 1812433253UL>
    mt19937;
typedef mersenne_twister_engine<unsigned long, 64, 312, 156, 31, 0xb5026f5aa96619e9UL, 29, 0x5555555555555555UL, 17,
                                0x71d67fffeda60000UL, 37, 0xfff7eee000000000UL, 43, 6364136223846793005UL>
    mt19937_64;
typedef minstd_rand0 default_random_engine;

class random_device {
public:
    typedef unsigned int result_type;
    random_device() {}
    explicit random_device(const string&) {}
    random_device(const random_device&) = delete;
    random_device& operator=(const random_device&) = delete;
    static constexpr result_type min() { return 0; }
    static constexpr result_type max() { return 4294967295u; }
    double entropy() const noexcept { return 0.0; }
    result_type operator()() { return __v4_random_device(); }
};

class seed_seq {
    vector<unsigned int> __values;
public:
    typedef unsigned int result_type;
    seed_seq() {}
    template <class T> seed_seq(initializer_list<T> list) {
        for (const T* it = list.begin(); it != list.end(); ++it)
            __values.push_back((unsigned int)*it);
    }
    template <class I> seed_seq(I first, I last) {
        for (; first != last; ++first)
            __values.push_back((unsigned int)*first);
    }
    size_t size() const noexcept { return __values.size(); }
    template <class O> void param(O out) const { std::copy(__values.begin(), __values.end(), out); }
    // The algorithm of the standard ([rand.util.seedseq]).
    template <class I> void generate(I first, I last) {
        typedef unsigned int u32;
        if (first == last)
            return;
        size_t n = last - first;
        for (I it = first; it != last; ++it)
            *it = 0x8b8b8b8bu;
        size_t s = __values.size();
        size_t t = n >= 623 ? 11 : (n >= 68 ? 7 : (n >= 39 ? 5 : (n >= 7 ? 3 : (n - 1) / 2)));
        size_t p = (n - t) / 2;
        size_t q = p + t;
        size_t m = s + 1 > n ? s + 1 : n;
        for (size_t k = 0; k < m; ++k) {
            u32 arg = first[k % n] ^ first[(k + p) % n] ^ first[(k + n - 1) % n];
            u32 r1 = 1664525u * (arg ^ (arg >> 27));
            u32 r2 = r1 + (k == 0 ? (u32)s : (k <= s ? (u32)(k % n) + __values[k - 1] : (u32)(k % n)));
            first[(k + p) % n] += r1;
            first[(k + q) % n] += r2;
            first[k % n] = r2;
        }
        for (size_t k = m; k < m + n; ++k) {
            u32 arg = first[k % n] + first[(k + p) % n] + first[(k + n - 1) % n];
            u32 r3 = 1566083941u * (arg ^ (arg >> 27));
            u32 r4 = r3 - (u32)(k % n);
            first[(k + p) % n] ^= r3;
            first[(k + q) % n] ^= r4;
            first[k % n] = r4;
        }
    }
};

// A real in [0, 1) from as many numbers of the engine as the bits need.
template <class R, size_t Bits, class G> R generate_canonical(G& g) {
    const size_t digits = numeric_limits<R>::digits;
    const size_t bits = Bits < digits ? Bits : digits;
    const long double range = (long double)G::max() - (long double)G::min() + 1.0L;
    size_t log2r = 0;
    for (long double value = range; value >= 2.0L; value /= 2.0L)
        ++log2r;
    size_t k = (bits + log2r - 1) / log2r;
    if (k < 1)
        k = 1;
    R sum = R(0);
    R factor = R(1);
    for (; k != 0; --k) {
        sum += R(g() - G::min()) * factor;
        factor *= range;
    }
    R result = sum / factor;
    if (result >= R(1))
        result = ::nextafter(R(1), R(0));
    return result;
}

// The high 64 bits of a 64 x 64 bit product.
inline unsigned long __multiply_high(unsigned long a, unsigned long b, unsigned long& low) {
    unsigned long a0 = a & 0xffffffffUL, a1 = a >> 32, b0 = b & 0xffffffffUL, b1 = b >> 32;
    unsigned long p00 = a0 * b0, p01 = a0 * b1, p10 = a1 * b0, p11 = a1 * b1;
    unsigned long middle = (p00 >> 32) + (p01 & 0xffffffffUL) + (p10 & 0xffffffffUL);
    low = (middle << 32) | (p00 & 0xffffffffUL);
    return p11 + (p01 >> 32) + (p10 >> 32) + (middle >> 32);
}

template <class T = int> class uniform_int_distribution {
public:
    typedef T result_type;
    struct param_type {
        T __a, __b;
        explicit param_type(T a = 0, T b = numeric_limits<T>::max()) : __a(a), __b(b) {}
        T a() const { return __a; }
        T b() const { return __b; }
        bool operator==(const param_type& other) const { return __a == other.__a && __b == other.__b; }
    };
private:
    param_type __param;
public:
    uniform_int_distribution() : __param() {}
    explicit uniform_int_distribution(T a, T b = numeric_limits<T>::max()) : __param(a, b) {}
    explicit uniform_int_distribution(const param_type& p) : __param(p) {}
    void reset() {}
    T a() const { return __param.a(); }
    T b() const { return __param.b(); }
    param_type param() const { return __param; }
    void param(const param_type& p) { __param = p; }
    T min() const { return a(); }
    T max() const { return b(); }
    template <class G> T operator()(G& g) { return (*this)(g, __param); }
    template <class G> T operator()(G& g, const param_type& p) {
        typedef unsigned long U;
        const U engine_min = (U)G::min();
        const U engine_range = (U)G::max() - engine_min;
        const U range = (U)p.b() - (U)p.a();
        U result;
        if (engine_range > range) {
            const U extended = range + 1;
            if (engine_range == 0xffffffffUL) {
                // Lemire's multiplication for a 32-bit engine.
                unsigned long product = (unsigned long)(unsigned int)(g() - engine_min) * extended;
                unsigned int low = (unsigned int)product;
                if (low < extended) {
                    unsigned int threshold = (unsigned int)(-(unsigned int)extended) % (unsigned int)extended;
                    while (low < threshold) {
                        product = (unsigned long)(unsigned int)(g() - engine_min) * extended;
                        low = (unsigned int)product;
                    }
                }
                result = product >> 32;
            } else if (engine_range == ~0UL) {
                unsigned long low = 0;
                unsigned long high = __multiply_high((U)(g() - engine_min), extended, low);
                if (low < extended) {
                    unsigned long threshold = (-extended) % extended;
                    while (low < threshold)
                        high = __multiply_high((U)(g() - engine_min), extended, low);
                }
                result = high;
            } else {
                const U scaling = engine_range / extended;
                const U past = extended * scaling;
                do
                    result = (U)g() - engine_min;
                while (result >= past);
                result /= scaling;
            }
        } else if (engine_range < range) {
            U part;
            do {
                const U engine_extended = engine_range + 1;
                part = engine_extended * (U)(*this)(g, param_type(0, (T)(range / engine_extended)));
                result = part + ((U)g() - engine_min);
            } while (result > range || result < part);
        } else {
            result = (U)g() - engine_min;
        }
        return (T)(result + (U)p.a());
    }
};

template <class R = double> class uniform_real_distribution {
public:
    typedef R result_type;
    struct param_type {
        R __a, __b;
        explicit param_type(R a = R(0), R b = R(1)) : __a(a), __b(b) {}
        R a() const { return __a; }
        R b() const { return __b; }
    };
private:
    param_type __param;
public:
    uniform_real_distribution() : __param() {}
    explicit uniform_real_distribution(R a, R b = R(1)) : __param(a, b) {}
    explicit uniform_real_distribution(const param_type& p) : __param(p) {}
    void reset() {}
    R a() const { return __param.a(); }
    R b() const { return __param.b(); }
    param_type param() const { return __param; }
    void param(const param_type& p) { __param = p; }
    R min() const { return a(); }
    R max() const { return b(); }
    template <class G> R operator()(G& g) { return (*this)(g, __param); }
    template <class G> R operator()(G& g, const param_type& p) {
        return generate_canonical<R, numeric_limits<R>::digits>(g) * (p.b() - p.a()) + p.a();
    }
};

template <class R = double> class normal_distribution {
    R __mean, __stddev;
    R __saved;
    bool __saved_available;
public:
    typedef R result_type;
    explicit normal_distribution(R mean = R(0), R stddev = R(1))
        : __mean(mean), __stddev(stddev), __saved(0), __saved_available(false) {}
    void reset() { __saved_available = false; }
    R mean() const { return __mean; }
    R stddev() const { return __stddev; }
    // Marsaglia's polar method; the second value is kept for the next call.
    template <class G> R operator()(G& g) {
        R result;
        if (__saved_available) {
            __saved_available = false;
            result = __saved;
        } else {
            R x, y, r2;
            do {
                x = R(2) * generate_canonical<R, numeric_limits<R>::digits>(g) - R(1);
                y = R(2) * generate_canonical<R, numeric_limits<R>::digits>(g) - R(1);
                r2 = x * x + y * y;
            } while (r2 > R(1) || r2 == R(0));
            R factor = ::sqrt(R(-2) * ::log(r2) / r2);
            __saved = x * factor;
            __saved_available = true;
            result = y * factor;
        }
        return result * __stddev + __mean;
    }
};

class bernoulli_distribution {
    double __p;
public:
    typedef bool result_type;
    explicit bernoulli_distribution(double p = 0.5) : __p(p) {}
    void reset() {}
    double p() const { return __p; }
    template <class G>
    bool operator()(G& g) { return generate_canonical<double, numeric_limits<double>::digits>(g) < __p; }
};

template <class R = double> class exponential_distribution {
    R __lambda;
public:
    typedef R result_type;
    explicit exponential_distribution(R lambda = R(1)) : __lambda(lambda) {}
    void reset() {}
    R lambda() const { return __lambda; }
    template <class G> R operator()(G& g) {
        return -::log(R(1) - generate_canonical<R, numeric_limits<R>::digits>(g)) / __lambda;
    }
};

template <class T = int> class geometric_distribution {
    double __p;
public:
    typedef T result_type;
    explicit geometric_distribution(double p = 0.5) : __p(p) {}
    void reset() {}
    double p() const { return __p; }
    template <class G> T operator()(G& g) {
        double u = generate_canonical<double, numeric_limits<double>::digits>(g);
        return T(::floor(::log(1.0 - u) / ::log(1.0 - __p)));
    }
};

template <class T = int> class discrete_distribution {
    vector<double> __cumulative;
    vector<double> __probabilities;
    void __init() {
        if (__probabilities.empty()) {
            __probabilities.push_back(1.0);
        }
        double total = 0;
        for (double w : __probabilities)
            total += w;
        double sum = 0;
        for (double& w : __probabilities) {
            w /= total;
            sum += w;
            __cumulative.push_back(sum);
        }
        __cumulative.back() = 1.0;
    }
public:
    typedef T result_type;
    discrete_distribution() { __init(); }
    template <class I> discrete_distribution(I first, I last) : __probabilities(first, last) { __init(); }
    discrete_distribution(initializer_list<double> weights) : __probabilities(weights) { __init(); }
    void reset() {}
    vector<double> probabilities() const { return __probabilities; }
    template <class G> T operator()(G& g) {
        double u = generate_canonical<double, numeric_limits<double>::digits>(g);
        return T(std::upper_bound(__cumulative.begin(), __cumulative.end(), u) - __cumulative.begin());
    }
};

template <class T = int> class poisson_distribution {
    double __mean;
public:
    typedef T result_type;
    explicit poisson_distribution(double mean = 1.0) : __mean(mean) {}
    void reset() {}
    double mean() const { return __mean; }
    // The product of uniform numbers (the method of libstdc++ for small means).
    template <class G> T operator()(G& g) {
        const double limit = ::exp(-__mean);
        double product = 1.0;
        T count = 0;
        do {
            product *= generate_canonical<double, numeric_limits<double>::digits>(g);
            ++count;
        } while (product > limit);
        return count - 1;
    }
};

// Two numbers below b0 and b1 from one of [0, b0 * b1).
template <class U, class G> pair<U, U> __two_uniform(U b0, U b1, G& g) {
    U x = uniform_int_distribution<U>(0, (b0 * b1) - 1)(g);
    return pair<U, U>(x / b1, x % b1);
}
template <class I, class G> void shuffle(I first, I last, G&& g) {
    typedef typename make_unsigned<typename iterator_traits<I>::difference_type>::type D;
    typedef typename remove_reference<G>::type E;
    typedef typename common_type<typename E::result_type, D>::type U;
    if (first == last)
        return;
    const U engine_range = U(E::max()) - U(E::min());
    const U range = U(last - first);
    if (engine_range / range >= range) {
        // Two swaps for each number of the engine.
        I it = first + 1;
        if ((range % 2) == 0) {
            std::iter_swap(it++, first + uniform_int_distribution<U>(0, 1)(g));
        }
        while (it != last) {
            const U swap_range = U(it - first) + 1;
            pair<U, U> positions = std::__two_uniform<U>(swap_range, swap_range + 1, g);
            std::iter_swap(it++, first + positions.first);
            std::iter_swap(it++, first + positions.second);
        }
        return;
    }
    for (I it = first + 1; it != last; ++it)
        std::iter_swap(it, first + uniform_int_distribution<U>(0, U(it - first))(g));
}
}
`);

    X.addHeader('v4script/bitset', [
        ['std', 3, 193, 'bitset'],
        ['std', 194, 194, 'operator&'],
        ['std', 195, 195, 'operator|'],
        ['std', 196, 196, 'operator^'],
        ['std', 197, 197, 'operator<<'],
        ['std', 198, 213, 'operator>>'],
        ['std', 214, 216, 'hash']
    ], String.raw`
namespace std {
template <size_t N> class bitset {
    static constexpr size_t __words = N == 0 ? 1 : (N + 63) / 64;
    unsigned long __bits[__words];

    void __trim() noexcept {
        if (N % 64 != 0)
            __bits[__words - 1] &= (1UL << (N % 64)) - 1;
    }
    void __check(size_t position, const char* where) const {
        if (position >= N) {
            char text[128];
            snprintf(text, sizeof text, "%s: __position (which is %zu) >= _Nb (which is %zu)", where, position, N);
            throw out_of_range(text);
        }
    }
    template <class C> void __from_chars(const C* text, size_t length, C zero, C one) {
        reset();
        size_t count = length < N ? length : N;
        for (size_t i = 0; i < count; ++i) {
            C c = text[i];
            if (c == one)
                __bits[(count - 1 - i) / 64] |= 1UL << ((count - 1 - i) % 64);
            else if (c != zero)
                throw invalid_argument("bitset::_M_copy_from_ptr");
        }
    }
public:
    class reference {
        friend class bitset;
        unsigned long* __word;
        size_t __bit;
        reference(unsigned long* word, size_t bit) noexcept : __word(word), __bit(bit) {}
    public:
        reference(const reference&) = default;
        reference& operator=(bool value) noexcept {
            if (value)
                *__word |= 1UL << __bit;
            else
                *__word &= ~(1UL << __bit);
            return *this;
        }
        reference& operator=(const reference& other) noexcept { return *this = bool(other); }
        bool operator~() const noexcept { return (*__word & (1UL << __bit)) == 0; }
        operator bool() const noexcept { return (*__word & (1UL << __bit)) != 0; }
        reference& flip() noexcept {
            *__word ^= 1UL << __bit;
            return *this;
        }
    };

    constexpr bitset() noexcept : __bits() {}
    bitset(unsigned long long value) noexcept : __bits() {
        __bits[0] = value;
        __trim();
    }
    explicit bitset(const string& text, size_t position = 0, size_t n = string::npos, char zero = '0', char one = '1')
        : __bits() {
        if (position > text.size())
            throw out_of_range("bitset::bitset");
        size_t length = text.size() - position < n ? text.size() - position : n;
        __from_chars(text.data() + position, length, zero, one);
    }
    explicit bitset(const char* text, size_t n = string::npos, char zero = '0', char one = '1') : __bits() {
        size_t length = strlen(text);
        __from_chars(text, length < n ? length : n, zero, one);
    }

    bool operator[](size_t position) const { return (__bits[position / 64] >> (position % 64)) & 1; }
    reference operator[](size_t position) { return reference(&__bits[position / 64], position % 64); }
    bool test(size_t position) const {
        __check(position, "bitset::test");
        return (*this)[position];
    }
    bool all() const noexcept { return count() == N; }
    bool any() const noexcept {
        for (size_t i = 0; i < __words; ++i) {
            if (__bits[i] != 0)
                return true;
        }
        return false;
    }
    bool none() const noexcept { return !any(); }
    size_t count() const noexcept {
        size_t total = 0;
        for (size_t i = 0; i < __words; ++i) {
            for (unsigned long word = __bits[i]; word != 0; word &= word - 1)
                ++total;
        }
        return total;
    }
    constexpr size_t size() const noexcept { return N; }
    bitset& set() noexcept {
        for (size_t i = 0; i < __words; ++i)
            __bits[i] = ~0UL;
        __trim();
        return *this;
    }
    bitset& set(size_t position, bool value = true) {
        __check(position, "bitset::set");
        (*this)[position] = value;
        return *this;
    }
    bitset& reset() noexcept {
        for (size_t i = 0; i < __words; ++i)
            __bits[i] = 0;
        return *this;
    }
    bitset& reset(size_t position) {
        __check(position, "bitset::reset");
        (*this)[position] = false;
        return *this;
    }
    bitset& flip() noexcept {
        for (size_t i = 0; i < __words; ++i)
            __bits[i] = ~__bits[i];
        __trim();
        return *this;
    }
    bitset& flip(size_t position) {
        __check(position, "bitset::flip");
        __bits[position / 64] ^= 1UL << (position % 64);
        return *this;
    }
    bitset operator~() const noexcept { return bitset(*this).flip(); }
    bitset& operator&=(const bitset& other) noexcept {
        for (size_t i = 0; i < __words; ++i)
            __bits[i] &= other.__bits[i];
        return *this;
    }
    bitset& operator|=(const bitset& other) noexcept {
        for (size_t i = 0; i < __words; ++i)
            __bits[i] |= other.__bits[i];
        return *this;
    }
    bitset& operator^=(const bitset& other) noexcept {
        for (size_t i = 0; i < __words; ++i)
            __bits[i] ^= other.__bits[i];
        return *this;
    }
    bitset& operator<<=(size_t shift) noexcept {
        if (shift >= N)
            return reset();
        for (size_t i = N; i-- > shift;)
            (*this)[i] = (*this)[i - shift];
        for (size_t i = 0; i < shift; ++i)
            (*this)[i] = false;
        return *this;
    }
    bitset& operator>>=(size_t shift) noexcept {
        if (shift >= N)
            return reset();
        for (size_t i = 0; i + shift < N; ++i)
            (*this)[i] = (*this)[i + shift];
        for (size_t i = N - shift; i < N; ++i)
            (*this)[i] = false;
        return *this;
    }
    bitset operator<<(size_t shift) const noexcept { return bitset(*this) <<= shift; }
    bitset operator>>(size_t shift) const noexcept { return bitset(*this) >>= shift; }
    bool operator==(const bitset& other) const noexcept {
        for (size_t i = 0; i < __words; ++i) {
            if (__bits[i] != other.__bits[i])
                return false;
        }
        return true;
    }
    bool operator!=(const bitset& other) const noexcept { return !(*this == other); }
    unsigned long to_ulong() const {
        for (size_t i = 1; i < __words; ++i) {
            if (__bits[i] != 0)
                throw overflow_error("_Base_bitset::_M_do_to_ulong");
        }
        return __bits[0];
    }
    unsigned long long to_ullong() const {
        for (size_t i = 1; i < __words; ++i) {
            if (__bits[i] != 0)
                throw overflow_error("_Base_bitset::_M_do_to_ullong");
        }
        return __bits[0];
    }
    string to_string(char zero = '0', char one = '1') const {
        string text(N, zero);
        for (size_t i = 0; i < N; ++i) {
            if ((*this)[i])
                text[N - 1 - i] = one;
        }
        return text;
    }
    size_t __hash() const noexcept { return __v4_hash_bytes(__bits, (N + 7) / 8, 0xc70f6907UL); }
};
template <size_t N> bitset<N> operator&(const bitset<N>& a, const bitset<N>& b) noexcept { return bitset<N>(a) &= b; }
template <size_t N> bitset<N> operator|(const bitset<N>& a, const bitset<N>& b) noexcept { return bitset<N>(a) |= b; }
template <size_t N> bitset<N> operator^(const bitset<N>& a, const bitset<N>& b) noexcept { return bitset<N>(a) ^= b; }
template <size_t N> ostream& operator<<(ostream& out, const bitset<N>& b) { return out << b.to_string(); }
template <size_t N> istream& operator>>(istream& in, bitset<N>& b) {
    string text;
    char c;
    while (text.size() < N && in.get(c)) {
        if (c != '0' && c != '1') {
            in.putback(c);
            break;
        }
        text += c;
    }
    if (text.empty())
        in.setstate(ios_base::failbit);
    else
        b = bitset<N>(text);
    return in;
}
template <size_t N> struct hash<bitset<N>> {
    size_t operator()(const bitset<N>& b) const noexcept { return b.__hash(); }
};
}
`);
})(globalThis);
