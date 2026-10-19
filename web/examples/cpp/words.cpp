// Word frequency: reading lines until the end of input, a std::map, and
// sorting the counts with a lambda. Type a few lines, Ctrl+D ends.
#include <algorithm>
#include <cctype>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

int main()
{
    std::map<std::string, int> counts;
    std::string line;
    int lines = 0;
    std::cout << "Type some text (an empty line ends):\n";
    while (std::getline(std::cin, line) && !line.empty()) {
        ++lines;
        for (char& c : line)
            c = std::isalpha(static_cast<unsigned char>(c)) ? static_cast<char>(std::tolower(c)) : ' ';
        std::istringstream words(line);
        std::string word;
        while (words >> word)
            ++counts[word];
    }
    std::vector<std::pair<std::string, int>> sorted(counts.begin(), counts.end());
    std::stable_sort(sorted.begin(), sorted.end(),
                     [](const auto& a, const auto& b) { return a.second > b.second; });
    std::cout << lines << " lines, " << counts.size() << " different words\n";
    for (std::size_t i = 0; i < sorted.size() && i < 5; ++i)
        std::cout << sorted[i].first << ": " << sorted[i].second << "\n";
    return 0;
}
