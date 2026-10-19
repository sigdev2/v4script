# The most frequent words of a text: re, collections.Counter, sorted.
import re
from collections import Counter

text = """
The playground runs every language in the browser. Every program runs in
a worker, and the worker runs the interpreter of the language: the same
interpreter that runs in the Qt engine of the application.
"""

words = re.findall(r"[a-z]+", text.lower())
counts = Counter(words)
print(len(words), "words,", len(counts), "different")
for word, count in counts.most_common(6):
    print(f"{word:<12} {'*' * count} {count}")

longest = max(words, key=len)
print("The longest word:", longest)
