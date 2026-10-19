# Hello: input(), f-strings and the value of the run.
name = input("What is your name? ").strip() or "stranger"
print(f"Hello, {name}! Your name has {len(name)} letters.")
vowels = sum(1 for letter in name.lower() if letter in "aeiouy")
print(f"{vowels} of them are vowels.")

# Like an interactive session, the last expression is the value of the run.
name.upper()
