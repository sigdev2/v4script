// LINQ: queries over a list of records - filters, grouping, joins and
// aggregates in the method and the query syntax.
var cities = new List<City>
{
    new("Lisbon", "Portugal", 545_000),
    new("Porto", "Portugal", 232_000),
    new("Madrid", "Spain", 3_305_000),
    new("Seville", "Spain", 684_000),
    new("Valencia", "Spain", 792_000),
    new("Lyon", "France", 522_000),
    new("Paris", "France", 2_102_000),
};
var capitals = new Dictionary<string, string> { ["Portugal"] = "Lisbon", ["Spain"] = "Madrid", ["France"] = "Paris" };

var big = cities.Where(c => c.Population > 600_000).OrderByDescending(c => c.Population).Select(c => c.Name);
Console.WriteLine("Over 600 000: " + string.Join(", ", big));

var byCountry = from city in cities
                group city by city.Country into country
                orderby country.Sum(c => c.Population) descending
                select new { Country = country.Key, Cities = country.Count(), Total = country.Sum(c => c.Population) };
foreach (var row in byCountry)
    Console.WriteLine($"{row.Country,-9} {row.Cities} cities {row.Total,10:N0}");

var notCapitals = from city in cities
                  join capital in capitals on city.Country equals capital.Key
                  where city.Name != capital.Value
                  select $"{city.Name} ({capital.Value} is the capital)";
Console.WriteLine(string.Join("; ", notCapitals));

var letters = cities.SelectMany(c => c.Name.ToLowerInvariant()).GroupBy(ch => ch)
    .OrderByDescending(g => g.Count()).ThenBy(g => g.Key).Take(3);
Console.WriteLine("Common letters: " + string.Join(" ", letters.Select(g => $"{g.Key}={g.Count()}")));
Console.WriteLine($"Average {cities.Average(c => c.Population):N0}, the smallest {cities.MinBy(c => c.Population)}");

record City(string Name, string Country, int Population);
