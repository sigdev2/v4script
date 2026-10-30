// An exception class of the program that nothing catches.
Withdraw(50);
Withdraw(500);

void Withdraw(decimal amount)
{
    if (amount > 100)
        throw new LimitException($"Limit exceeded: {amount}");
    Console.WriteLine("withdrew " + amount);
}

class LimitException : Exception
{
    public LimitException(string message) : base(message) { }
}

// Output:
// withdrew 50
// Error: Unhandled exception. LimitException: Limit exceeded: 500
// Line: 8
