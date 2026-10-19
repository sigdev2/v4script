# Generators: an endless sequence of primes, taken as much as needed.
from itertools import islice, count


def primes():
    found = []
    for n in count(2):
        if all(n % p for p in found if p * p <= n):
            found.append(n)
            yield n


print("The first 20 primes:", list(islice(primes(), 20)))

# Twin primes: p and p + 2 are both prime.
def twins(limit):
    previous = None
    for p in primes():
        if p > limit:
            return
        if previous is not None and p - previous == 2:
            yield previous, p
        previous = p


print("Twin primes below 200:", list(twins(200)))
