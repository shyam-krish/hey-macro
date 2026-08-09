import Foundation

/// A local-timezone calendar day stored as `"YYYY-MM-DD"`.
///
/// The RN app deliberately used local (never UTC) day strings for every `date` column, and every
/// range query relies on lexicographic ordering of the zero-padded format. All date math in the
/// native app goes through this type — never format a `Date` for storage anywhere else.
struct LocalDate: Hashable, Comparable, Sendable, CustomStringConvertible {
    /// `"YYYY-MM-DD"`, zero-padded, local timezone.
    let value: String

    init(year: Int, month: Int, day: Int) {
        self.value = String(format: "%04d-%02d-%02d", year, month, day)
    }

    init(_ date: Date, calendar: Calendar = .current) {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        self.init(year: c.year!, month: c.month!, day: c.day!)
    }

    /// Validating init for strings read back from the database.
    init?(validating value: String) {
        let parts = value.split(separator: "-")
        guard parts.count == 3,
              value.count == 10,
              parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
              parts.allSatisfy({ $0.allSatisfy(\.isNumber) })
        else { return nil }
        self.value = value
    }

    static func today(calendar: Calendar = .current) -> LocalDate {
        LocalDate(Date(), calendar: calendar)
    }

    /// DST-safe day arithmetic via the calendar (mirrors the RN `getOffsetDateString`).
    func adding(days: Int, calendar: Calendar = .current) -> LocalDate {
        let base = calendar.date(from: components)!
        let shifted = calendar.date(byAdding: .day, value: days, to: base)!
        return LocalDate(shifted, calendar: calendar)
    }

    /// Local midnight of this day.
    func startOfDay(calendar: Calendar = .current) -> Date {
        calendar.date(from: components)!
    }

    var components: DateComponents {
        let parts = value.split(separator: "-").map { Int($0)! }
        return DateComponents(year: parts[0], month: parts[1], day: parts[2])
    }

    var year: Int { Int(value.prefix(4))! }
    var month: Int { Int(value.dropFirst(5).prefix(2))! }
    var day: Int { Int(value.suffix(2))! }

    static func < (lhs: LocalDate, rhs: LocalDate) -> Bool { lhs.value < rhs.value }

    var description: String { value }

    /// First and last day of a month (1-indexed month, unlike the RN 0-indexed helpers).
    static func monthRange(year: Int, month: Int, calendar: Calendar = .current) -> (start: LocalDate, end: LocalDate) {
        let start = LocalDate(year: year, month: month, day: 1)
        let startDate = calendar.date(from: DateComponents(year: year, month: month, day: 1))!
        let dayCount = calendar.range(of: .day, in: .month, for: startDate)!.count
        return (start, LocalDate(year: year, month: month, day: dayCount))
    }
}

extension LocalDate: Codable {
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        guard let date = LocalDate(validating: raw) else {
            throw DecodingError.dataCorrupted(.init(
                codingPath: decoder.codingPath,
                debugDescription: "Invalid LocalDate string: \(raw)"
            ))
        }
        self = date
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(value)
    }
}
