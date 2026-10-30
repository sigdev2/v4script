// A whole program: a namespace, a class with Main, static constructors and
// fields, nested and partial classes, a static class with constants.
using System.Text;

namespace Inventory
{
    public static class Units
    {
        public const string Piece = "pcs";
        public const int MaxStock = 1000;
    }

    public partial class Warehouse
    {
        private static readonly int startedAt;
        private readonly Dictionary<string, int> stock = new();

        static Warehouse()
        {
            startedAt = 2024;
            Console.WriteLine("static constructor");
        }

        public void Receive(string item, int count)
        {
            stock.TryGetValue(item, out var current);
            if (current + count > Units.MaxStock)
                throw new InvalidOperationException($"too many {item}");
            stock[item] = current + count;
        }
    }

    public partial class Warehouse
    {
        public sealed class Report
        {
            private readonly StringBuilder text = new();
            public Report Line(string line) { text.AppendLine(line); return this; }
            public override string ToString() => text.ToString().TrimEnd();
        }

        public Report Summary()
        {
            var report = new Report().Line($"since {startedAt}");
            foreach (var pair in stock.OrderBy(p => p.Key))
                report.Line($"{pair.Key}: {pair.Value} {Units.Piece}");
            return report;
        }
    }

    internal class Program
    {
        private static int Main(string[] args)
        {
            Console.WriteLine("arguments: " + args.Length);
            var warehouse = new Warehouse();
            warehouse.Receive("bolt", 400);
            warehouse.Receive("nut", 250);
            warehouse.Receive("bolt", 100);
            try
            {
                warehouse.Receive("nut", 900);
            }
            catch (InvalidOperationException e)
            {
                Console.WriteLine("refused: " + e.Message);
            }
            Console.WriteLine(warehouse.Summary());
            return 0;
        }
    }
}

// Output:
// arguments: 0
// static constructor
// refused: too many nut
// since 2024
// bolt: 500 pcs
// nut: 250 pcs
