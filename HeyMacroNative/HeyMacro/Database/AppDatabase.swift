import Foundation
import GRDB
import OSLog

/// Owns the GRDB connection and schema.
///
/// The schema is a verbatim port of the RN app's `initDatabase()` + `runMigrations()`
/// (services/storage.ts). Everything is `IF NOT EXISTS` so the v1 migration is a no-op on a
/// database adopted from the RN app while still being recorded in `grdb_migrations`, which lets
/// future migrations sequence identically for fresh and adopted databases.
struct AppDatabase: Sendable {
    let dbQueue: DatabaseQueue

    private static let log = Logger(subsystem: "com.anonymous.hey-macro", category: "Database")

    init(_ dbQueue: DatabaseQueue) throws {
        self.dbQueue = dbQueue
        try Self.migrator.migrate(dbQueue)
    }

    /// Production database: adopts the RN app's file on first launch, then opens from
    /// Application Support. See `DatabaseAdoption`.
    static func makeShared() throws -> AppDatabase {
        let url = try DatabaseAdoption.prepareDatabaseFile()
        var config = Configuration()
        config.foreignKeysEnabled = false // RN schema predates enforcement; adopted data must load as-is
        let dbQueue = try DatabaseQueue(path: url.path, configuration: config)
        log.info("Opened database at \(url.path, privacy: .public)")
        return try AppDatabase(dbQueue)
    }

    /// In-memory database for tests.
    static func inMemory() throws -> AppDatabase {
        try AppDatabase(DatabaseQueue())
    }

    private static var migrator: DatabaseMigrator {
        var migrator = DatabaseMigrator()

        migrator.registerMigration("v1") { db in
            // Base tables — storage.ts initDatabase(). daily_logs includes the per-day target
            // columns directly (fresh installs); the pragma check below covers ancient adopted
            // DBs that predate the RN target-snapshot migration.
            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS users (
                  userID TEXT PRIMARY KEY,
                  firstName TEXT NOT NULL,
                  lastName TEXT NOT NULL,
                  createdAt TEXT NOT NULL,
                  updatedAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS macro_targets (
                  userID TEXT PRIMARY KEY,
                  calories INTEGER NOT NULL,
                  protein INTEGER NOT NULL,
                  carbs INTEGER NOT NULL,
                  fat INTEGER NOT NULL,
                  createdAt TEXT NOT NULL,
                  updatedAt TEXT NOT NULL,
                  FOREIGN KEY (userID) REFERENCES users(userID)
                );

                CREATE TABLE IF NOT EXISTS daily_logs (
                  dailyLogID TEXT PRIMARY KEY,
                  userID TEXT NOT NULL,
                  date TEXT NOT NULL,
                  totalCalories INTEGER DEFAULT 0,
                  totalProtein INTEGER DEFAULT 0,
                  totalCarbs INTEGER DEFAULT 0,
                  totalFat INTEGER DEFAULT 0,
                  createdAt TEXT NOT NULL,
                  updatedAt TEXT NOT NULL,
                  targetCalories INTEGER DEFAULT 2690,
                  targetProtein INTEGER DEFAULT 170,
                  targetCarbs INTEGER DEFAULT 300,
                  targetFat INTEGER DEFAULT 90,
                  FOREIGN KEY (userID) REFERENCES users(userID)
                );

                CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_logs_user_date
                  ON daily_logs(userID, date);

                CREATE TABLE IF NOT EXISTS food_entries (
                  foodEntryID TEXT PRIMARY KEY,
                  userID TEXT NOT NULL,
                  dailyLogID TEXT NOT NULL,
                  mealType TEXT NOT NULL,
                  name TEXT NOT NULL,
                  quantity TEXT NOT NULL,
                  calories INTEGER NOT NULL,
                  protein INTEGER NOT NULL,
                  carbs INTEGER NOT NULL,
                  fat INTEGER NOT NULL,
                  createdAt TEXT NOT NULL,
                  updatedAt TEXT NOT NULL,
                  FOREIGN KEY (userID) REFERENCES users(userID),
                  FOREIGN KEY (dailyLogID) REFERENCES daily_logs(dailyLogID)
                );

                CREATE INDEX IF NOT EXISTS idx_food_entries_daily_log
                  ON food_entries(dailyLogID);

                CREATE TABLE IF NOT EXISTS weight_logs (
                  weightLogID TEXT PRIMARY KEY,
                  userID TEXT NOT NULL,
                  date TEXT NOT NULL,
                  weight REAL NOT NULL,
                  createdAt TEXT NOT NULL,
                  updatedAt TEXT NOT NULL,
                  FOREIGN KEY (userID) REFERENCES users(userID)
                );

                CREATE UNIQUE INDEX IF NOT EXISTS idx_weight_logs_user_date
                  ON weight_logs(userID, date);
                """)

            // storage.ts runMigrations(): add target columns if adopting a DB that predates them.
            let columns = try Row.fetchAll(db, sql: "PRAGMA table_info(daily_logs)")
                .map { $0["name"] as String }
            if !columns.contains("targetCalories") {
                try db.execute(sql: """
                    ALTER TABLE daily_logs ADD COLUMN targetCalories INTEGER DEFAULT 2690;
                    ALTER TABLE daily_logs ADD COLUMN targetProtein INTEGER DEFAULT 170;
                    ALTER TABLE daily_logs ADD COLUMN targetCarbs INTEGER DEFAULT 300;
                    ALTER TABLE daily_logs ADD COLUMN targetFat INTEGER DEFAULT 90;
                    """)
            }
        }

        return migrator
    }
}
