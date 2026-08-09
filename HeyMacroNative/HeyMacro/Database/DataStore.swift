import Foundation
import GRDB

/// Method-for-method port of the RN app's `services/storage.ts`.
///
/// Semantics preserved deliberately:
/// - `daily_logs` totals are *lazily reconciled* inside `getOrCreateDailyLog`; the single-entry
///   mutations (`updateFoodEntry`, `deleteFoodEntry`) don't touch them.
/// - Macro targets are snapshotted into each day's log at creation; `updateMacroTargets`
///   rewrites *today's* snapshot only — past days keep the targets they were logged under.
/// - `replaceDailyFoodEntries` is a full replace (delete all + re-insert) in one transaction,
///   because the LLM returns the complete desired state of the day.
final class DataStore: Sendable {
    static let defaultUserID = "default-user"
    static let defaultTargets = (calories: 2690, protein: 170, carbs: 300, fat: 90)

    private let dbQueue: DatabaseQueue
    /// Injectable clock/calendar for tests.
    private let now: @Sendable () -> Date
    private let today: @Sendable () -> LocalDate

    init(
        _ database: AppDatabase,
        now: @escaping @Sendable () -> Date = { Date() },
        today: @escaping @Sendable () -> LocalDate = { .today() }
    ) {
        self.dbQueue = database.dbQueue
        self.now = now
        self.today = today
    }

    /// ISO-8601 UTC with milliseconds — same format as JS `new Date().toISOString()`.
    private func timestamp() -> String {
        Self.isoFormatter.string(from: now())
    }

    // ISO8601DateFormatter is documented thread-safe; the compiler just can't prove it.
    nonisolated(unsafe) private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static func newID() -> String {
        UUID().uuidString.lowercased()
    }

    // MARK: - User

    func getOrCreateDefaultUser() async throws -> User {
        let ts = timestamp()
        return try await dbQueue.write { db in
            if let user = try User.fetchOne(db, key: Self.defaultUserID) {
                return user
            }
            let user = User(
                userID: Self.defaultUserID, firstName: "Default", lastName: "Name",
                createdAt: ts, updatedAt: ts
            )
            try user.insert(db)
            return user
        }
    }

    func updateUser(userID: String, firstName: String, lastName: String) async throws -> User {
        let ts = timestamp()
        return try await dbQueue.write { db in
            let existing = try User.fetchOne(db, key: userID)
            try db.execute(
                sql: "UPDATE users SET firstName = ?, lastName = ?, updatedAt = ? WHERE userID = ?",
                arguments: [firstName, lastName, ts, userID]
            )
            return User(
                userID: userID, firstName: firstName, lastName: lastName,
                createdAt: existing?.createdAt ?? ts, updatedAt: ts
            )
        }
    }

    // MARK: - Macro targets

    func getOrCreateMacroTargets(userID: String) async throws -> MacroTargets {
        let ts = timestamp()
        return try await dbQueue.write { db in
            try Self.getOrCreateMacroTargets(db, userID: userID, timestamp: ts)
        }
    }

    private static func getOrCreateMacroTargets(
        _ db: Database, userID: String, timestamp: String
    ) throws -> MacroTargets {
        if let targets = try MacroTargets.fetchOne(db, key: userID) {
            return targets
        }
        let targets = MacroTargets(
            userID: userID,
            calories: defaultTargets.calories, protein: defaultTargets.protein,
            carbs: defaultTargets.carbs, fat: defaultTargets.fat,
            createdAt: timestamp, updatedAt: timestamp
        )
        try targets.insert(db)
        return targets
    }

    /// Updates the global targets AND today's per-day snapshot (if today's log exists).
    /// Past days are never rewritten.
    func updateMacroTargets(
        userID: String, calories: Int, protein: Int, carbs: Int, fat: Int
    ) async throws -> MacroTargets {
        let ts = timestamp()
        let todayValue = today().value
        return try await dbQueue.write { db in
            let existing = try MacroTargets.fetchOne(db, key: userID)
            try db.execute(
                sql: """
                    UPDATE macro_targets SET calories = ?, protein = ?, carbs = ?, fat = ?, updatedAt = ?
                    WHERE userID = ?
                    """,
                arguments: [calories, protein, carbs, fat, ts, userID]
            )
            try db.execute(
                sql: """
                    UPDATE daily_logs SET targetCalories = ?, targetProtein = ?, targetCarbs = ?, targetFat = ?, updatedAt = ?
                    WHERE userID = ? AND date = ?
                    """,
                arguments: [calories, protein, carbs, fat, ts, userID, todayValue]
            )
            return MacroTargets(
                userID: userID, calories: calories, protein: protein, carbs: carbs, fat: fat,
                createdAt: existing?.createdAt ?? ts, updatedAt: ts
            )
        }
    }

    // MARK: - Daily logs

    func getOrCreateDailyLog(userID: String, date: LocalDate) async throws -> DailyLog {
        let ts = timestamp()
        return try await dbQueue.write { db in
            try Self.getOrCreateDailyLog(db, userID: userID, date: date, timestamp: ts)
        }
    }

    private static func getOrCreateDailyLog(
        _ db: Database, userID: String, date: LocalDate, timestamp: String
    ) throws -> DailyLog {
        let existing = try DailyLogRecord
            .filter(sql: "userID = ? AND date = ?", arguments: [userID, date.value])
            .fetchOne(db)

        let record: DailyLogRecord
        if let existing {
            record = existing
        } else {
            // Snapshot current global targets into the new day.
            let targets = try getOrCreateMacroTargets(db, userID: userID, timestamp: timestamp)
            record = DailyLogRecord(
                dailyLogID: newID(), userID: userID, date: date.value,
                totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0,
                targetCalories: targets.calories, targetProtein: targets.protein,
                targetCarbs: targets.carbs, targetFat: targets.fat,
                createdAt: timestamp, updatedAt: timestamp
            )
            try record.insert(db)
        }

        let entries = try FoodEntry
            .filter(sql: "dailyLogID = ?", arguments: [record.dailyLogID])
            .order(sql: "createdAt ASC")
            .fetchAll(db)

        var meals: [MealType: [FoodEntry]] = [:]
        for entry in entries {
            meals[entry.mealType, default: []].append(entry)
        }

        let totalCalories = entries.reduce(0) { $0 + $1.calories }
        let totalProtein = entries.reduce(0) { $0 + $1.protein }
        let totalCarbs = entries.reduce(0) { $0 + $1.carbs }
        let totalFat = entries.reduce(0) { $0 + $1.fat }

        // Lazy reconcile: stored totals self-heal on read.
        if existing != nil,
           record.totalCalories != totalCalories || record.totalProtein != totalProtein
            || record.totalCarbs != totalCarbs || record.totalFat != totalFat {
            try db.execute(
                sql: """
                    UPDATE daily_logs SET totalCalories = ?, totalProtein = ?, totalCarbs = ?, totalFat = ?, updatedAt = ?
                    WHERE dailyLogID = ?
                    """,
                arguments: [totalCalories, totalProtein, totalCarbs, totalFat, timestamp, record.dailyLogID]
            )
        }

        return DailyLog(
            dailyLogID: record.dailyLogID, userID: userID, date: date,
            totalCalories: totalCalories, totalProtein: totalProtein,
            totalCarbs: totalCarbs, totalFat: totalFat,
            targetCalories: record.targetCalories, targetProtein: record.targetProtein,
            targetCarbs: record.targetCarbs, targetFat: record.targetFat,
            breakfast: meals[.breakfast] ?? [], lunch: meals[.lunch] ?? [],
            dinner: meals[.dinner] ?? [], snacks: meals[.snacks] ?? [],
            createdAt: record.createdAt, updatedAt: timestamp
        )
    }

    /// Last N days (excluding today) that actually have food entries, most recent first.
    /// Used to build the LLM "previous meals" context.
    func getPreviousDaysLogs(userID: String, days: Int = 7) async throws -> [DailyLog] {
        let ts = timestamp()
        let todayValue = today().value
        return try await dbQueue.write { db in
            let rows = try Row.fetchAll(
                db,
                sql: """
                    SELECT DISTINCT dl.dailyLogID, dl.date
                    FROM daily_logs dl
                    INNER JOIN food_entries fe ON fe.dailyLogID = dl.dailyLogID
                    WHERE dl.userID = ? AND dl.date < ?
                    ORDER BY dl.date DESC
                    LIMIT ?
                    """,
                arguments: [userID, todayValue, days]
            )
            return try rows.compactMap { row -> DailyLog? in
                guard let date = LocalDate(validating: row["date"]) else { return nil }
                return try Self.getOrCreateDailyLog(db, userID: userID, date: date, timestamp: ts)
            }
        }
    }

    func getEarliestLogDate(userID: String) async throws -> LocalDate? {
        try await dbQueue.read { db in
            let value = try String.fetchOne(
                db,
                sql: "SELECT MIN(date) FROM daily_logs WHERE userID = ?",
                arguments: [userID]
            )
            return value.flatMap { LocalDate(validating: $0) }
        }
    }

    // MARK: - Food entries

    /// Full replace of a day's entries with the LLM's returned state, in one transaction.
    func replaceDailyFoodEntries(
        userID: String, dailyLogID: String, with parsed: ParsedDay
    ) async throws {
        let ts = timestamp()
        let all = parsed.allItems
        let totals = (
            calories: all.reduce(0) { $0 + $1.calories },
            protein: all.reduce(0) { $0 + $1.protein },
            carbs: all.reduce(0) { $0 + $1.carbs },
            fat: all.reduce(0) { $0 + $1.fat }
        )
        try await dbQueue.write { db in
            try db.execute(sql: "DELETE FROM food_entries WHERE dailyLogID = ?", arguments: [dailyLogID])
            for meal in MealType.allCases {
                for item in parsed.items(for: meal) {
                    let entry = FoodEntry(
                        foodEntryID: Self.newID(), userID: userID, dailyLogID: dailyLogID,
                        mealType: meal, name: item.name, quantity: item.quantity,
                        calories: item.calories, protein: item.protein,
                        carbs: item.carbs, fat: item.fat,
                        createdAt: ts, updatedAt: ts
                    )
                    try entry.insert(db)
                }
            }
            try db.execute(
                sql: """
                    UPDATE daily_logs SET totalCalories = ?, totalProtein = ?, totalCarbs = ?, totalFat = ?, updatedAt = ?
                    WHERE dailyLogID = ?
                    """,
                arguments: [totals.calories, totals.protein, totals.carbs, totals.fat, ts, dailyLogID]
            )
        }
    }

    func addFoodEntry(
        userID: String, dailyLogID: String, mealType: MealType, item: ParsedFoodItem
    ) async throws -> FoodEntry {
        let ts = timestamp()
        let entry = FoodEntry(
            foodEntryID: Self.newID(), userID: userID, dailyLogID: dailyLogID,
            mealType: mealType, name: item.name, quantity: item.quantity,
            calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat,
            createdAt: ts, updatedAt: ts
        )
        try await dbQueue.write { db in
            try entry.insert(db)
        }
        return entry
    }

    struct FoodEntryUpdates: Sendable {
        var name: String?
        var quantity: String?
        var calories: Int?
        var protein: Int?
        var carbs: Int?
        var fat: Int?
    }

    /// Partial update; totals reconcile lazily on the next `getOrCreateDailyLog` read.
    func updateFoodEntry(foodEntryID: String, updates: FoodEntryUpdates) async throws {
        var assignments: [String] = []
        var arguments: [DatabaseValue] = []
        if let name = updates.name { assignments.append("name = ?"); arguments.append(name.databaseValue) }
        if let quantity = updates.quantity { assignments.append("quantity = ?"); arguments.append(quantity.databaseValue) }
        if let calories = updates.calories { assignments.append("calories = ?"); arguments.append(calories.databaseValue) }
        if let protein = updates.protein { assignments.append("protein = ?"); arguments.append(protein.databaseValue) }
        if let carbs = updates.carbs { assignments.append("carbs = ?"); arguments.append(carbs.databaseValue) }
        if let fat = updates.fat { assignments.append("fat = ?"); arguments.append(fat.databaseValue) }
        guard !assignments.isEmpty else { return }

        assignments.append("updatedAt = ?")
        arguments.append(timestamp().databaseValue)
        arguments.append(foodEntryID.databaseValue)

        let sql = "UPDATE food_entries SET \(assignments.joined(separator: ", ")) WHERE foodEntryID = ?"
        let statementArguments = StatementArguments(arguments)
        try await dbQueue.write { db in
            try db.execute(sql: sql, arguments: statementArguments)
        }
    }

    func deleteFoodEntry(foodEntryID: String) async throws {
        try await dbQueue.write { db in
            try db.execute(sql: "DELETE FROM food_entries WHERE foodEntryID = ?", arguments: [foodEntryID])
        }
    }

    // MARK: - Weight

    func getWeightLog(userID: String, date: LocalDate) async throws -> WeightLog? {
        try await dbQueue.read { db in
            try WeightLog
                .filter(sql: "userID = ? AND date = ?", arguments: [userID, date.value])
                .fetchOne(db)
        }
    }

    func saveWeightLog(userID: String, date: LocalDate, weight: Double) async throws -> WeightLog {
        let ts = timestamp()
        return try await dbQueue.write { db in
            if var existing = try WeightLog
                .filter(sql: "userID = ? AND date = ?", arguments: [userID, date.value])
                .fetchOne(db) {
                existing.weight = weight
                existing.updatedAt = ts
                try db.execute(
                    sql: "UPDATE weight_logs SET weight = ?, updatedAt = ? WHERE weightLogID = ?",
                    arguments: [weight, ts, existing.weightLogID]
                )
                return existing
            }
            let log = WeightLog(
                weightLogID: Self.newID(), userID: userID, date: date.value,
                weight: weight, createdAt: ts, updatedAt: ts
            )
            try log.insert(db)
            return log
        }
    }

    /// Most recent weight strictly before a date — pre-fills the weight input.
    func getPreviousWeightLog(userID: String, before date: LocalDate) async throws -> WeightLog? {
        try await dbQueue.read { db in
            try WeightLog
                .filter(sql: "userID = ? AND date < ?", arguments: [userID, date.value])
                .order(sql: "date DESC")
                .fetchOne(db)
        }
    }

    // MARK: - Calendar month data

    func getMonthCalorieData(userID: String, year: Int, month: Int) async throws -> [DayCalorieDatum] {
        let range = LocalDate.monthRange(year: year, month: month)
        return try await dbQueue.read { db in
            let rows = try Row.fetchAll(
                db,
                sql: """
                    SELECT date, totalCalories, targetCalories FROM daily_logs
                    WHERE userID = ? AND date >= ? AND date <= ? ORDER BY date ASC
                    """,
                arguments: [userID, range.start.value, range.end.value]
            )
            return rows.compactMap { row in
                guard let date = LocalDate(validating: row["date"]) else { return nil }
                return DayCalorieDatum(
                    date: date, calories: row["totalCalories"], calorieTarget: row["targetCalories"]
                )
            }
        }
    }

    func getMonthWeightData(userID: String, year: Int, month: Int) async throws -> [DayWeightDatum] {
        let range = LocalDate.monthRange(year: year, month: month)
        return try await dbQueue.read { db in
            let rows = try Row.fetchAll(
                db,
                sql: """
                    SELECT date, weight FROM weight_logs
                    WHERE userID = ? AND date >= ? AND date <= ? ORDER BY date ASC
                    """,
                arguments: [userID, range.start.value, range.end.value]
            )
            return rows.compactMap { row in
                guard let date = LocalDate(validating: row["date"]) else { return nil }
                return DayWeightDatum(date: date, weight: row["weight"])
            }
        }
    }

    // MARK: - Trends

    /// One point per date in range, merging daily_logs and weight_logs (same SQL as storage.ts).
    func getTrendData(userID: String, from startDate: LocalDate, to endDate: LocalDate) async throws -> [TrendPoint] {
        try await dbQueue.read { db in
            let rows = try Row.fetchAll(
                db,
                sql: """
                    SELECT
                      d.date,
                      dl.totalCalories AS calories,
                      dl.targetCalories AS calorieTarget,
                      wl.weight
                    FROM (
                      SELECT date FROM daily_logs WHERE userID = ? AND date >= ? AND date <= ?
                      UNION
                      SELECT date FROM weight_logs WHERE userID = ? AND date >= ? AND date <= ?
                    ) d
                    LEFT JOIN daily_logs dl ON dl.date = d.date AND dl.userID = ?
                    LEFT JOIN weight_logs wl ON wl.date = d.date AND wl.userID = ?
                    ORDER BY d.date ASC
                    """,
                arguments: [
                    userID, startDate.value, endDate.value,
                    userID, startDate.value, endDate.value,
                    userID, userID,
                ]
            )
            return rows.compactMap { row in
                guard let date = LocalDate(validating: row["date"]) else { return nil }
                return TrendPoint(
                    date: date,
                    calories: row["calories"],
                    calorieTarget: row["calorieTarget"],
                    weight: row["weight"]
                )
            }
        }
    }

    /// Per-meal averages over a range, divided by distinct days with food logged (not span).
    func getMealAverages(userID: String, from startDate: LocalDate, to endDate: LocalDate) async throws -> MealAverages {
        try await dbQueue.read { db in
            let loggedDays = try Int.fetchOne(
                db,
                sql: """
                    SELECT COUNT(DISTINCT dl.date)
                    FROM daily_logs dl
                    JOIN food_entries fe ON fe.dailyLogID = dl.dailyLogID
                    WHERE dl.userID = ? AND dl.date >= ? AND dl.date <= ?
                    """,
                arguments: [userID, startDate.value, endDate.value]
            ) ?? 0
            guard loggedDays > 0 else { return MealAverages() }

            let rows = try Row.fetchAll(
                db,
                sql: """
                    SELECT
                      fe.mealType AS mealType,
                      SUM(fe.calories) AS calories,
                      SUM(fe.protein) AS protein,
                      SUM(fe.carbs) AS carbs,
                      SUM(fe.fat) AS fat
                    FROM food_entries fe
                    JOIN daily_logs dl ON dl.dailyLogID = fe.dailyLogID
                    WHERE fe.userID = ? AND dl.date >= ? AND dl.date <= ?
                    GROUP BY fe.mealType
                    """,
                arguments: [userID, startDate.value, endDate.value]
            )

            var result = MealAverages(loggedDays: loggedDays)
            for row in rows {
                let sums: (calories: Int64?, protein: Int64?, carbs: Int64?, fat: Int64?) =
                    (row["calories"], row["protein"], row["carbs"], row["fat"])
                let avg = MealAverage(
                    calories: Int((Double(sums.calories ?? 0) / Double(loggedDays)).rounded()),
                    protein: Int((Double(sums.protein ?? 0) / Double(loggedDays)).rounded()),
                    carbs: Int((Double(sums.carbs ?? 0) / Double(loggedDays)).rounded()),
                    fat: Int((Double(sums.fat ?? 0) / Double(loggedDays)).rounded())
                )
                let mealType: String? = row["mealType"]
                switch mealType {
                case MealType.breakfast.rawValue: result.breakfast = avg
                case MealType.lunch.rawValue: result.lunch = avg
                case MealType.dinner.rawValue: result.dinner = avg
                case MealType.snacks.rawValue: result.snacks = avg
                default: break
                }
            }
            result.total = MealAverage(
                calories: result.breakfast.calories + result.lunch.calories + result.dinner.calories + result.snacks.calories,
                protein: result.breakfast.protein + result.lunch.protein + result.dinner.protein + result.snacks.protein,
                carbs: result.breakfast.carbs + result.lunch.carbs + result.dinner.carbs + result.snacks.carbs,
                fat: result.breakfast.fat + result.lunch.fat + result.dinner.fat + result.snacks.fat
            )
            return result
        }
    }

    // MARK: - Testing utilities

    func clearAllData() async throws {
        try await dbQueue.write { db in
            try db.execute(sql: """
                DELETE FROM food_entries;
                DELETE FROM daily_logs;
                DELETE FROM weight_logs;
                DELETE FROM macro_targets;
                DELETE FROM users;
                """)
        }
    }
}
