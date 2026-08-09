import Foundation
import Testing
import GRDB
@testable import HeyMacro

/// The adoption path is the one shot we get at the user's real data — these tests rehearse it
/// including the dirty-WAL case (writes still sitting in `-wal`, not yet in the main file).
struct DatabaseAdoptionTests {
    private func makeTempDir() throws -> URL {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("adoption-test-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// Wraps a step so failures name exactly where they happened.
    private func step<T>(_ name: String, _ body: () throws -> T) throws -> T {
        do {
            return try body()
        } catch {
            throw NSError(domain: "AdoptionTest", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "step '\(name)' failed: \(error)",
            ])
        }
    }

    /// Builds a WAL-mode fixture like expo-sqlite's, with committed rows still in the -wal file.
    /// Copies the live db+wal mid-session so the copy is genuinely un-checkpointed.
    private func plantDirtyWALFixture(at oldURL: URL) throws {
        let fm = FileManager.default
        let stagingURL = oldURL.deletingLastPathComponent()
            .appendingPathComponent("staging-\(UUID().uuidString).db")

        try step("create staging parent dir") {
            try fm.createDirectory(at: stagingURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        }
        let staging = try step("open staging queue") { try DatabaseQueue(path: stagingURL.path) }
        try staging.writeWithoutTransaction { db in
            try db.execute(sql: "PRAGMA journal_mode = WAL")
            try db.execute(sql: "PRAGMA wal_autocheckpoint = 0")
            try db.execute(sql: """
                CREATE TABLE users (
                  userID TEXT PRIMARY KEY, firstName TEXT NOT NULL, lastName TEXT NOT NULL,
                  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
                );
                """)
            try db.execute(
                sql: "INSERT INTO users VALUES ('default-user', 'Shyam', 'K', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z')"
            )
        }

        // Copy db + wal while the connection is still open — the row above lives in -wal.
        // Deliberately skip -shm: it's transient shared-memory state that SQLite regenerates,
        // and a copied one can make the database unopenable.
        try fm.createDirectory(at: oldURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try fm.copyItem(at: stagingURL, to: oldURL)
        let walSource = URL(fileURLWithPath: stagingURL.path + "-wal")
        if fm.fileExists(atPath: walSource.path) {
            try fm.copyItem(at: walSource, to: URL(fileURLWithPath: oldURL.path + "-wal"))
        }
        try staging.close()
    }

    @Test func adoptsDirtyWALDatabaseWithoutLosingRows() async throws {
        let fm = FileManager.default
        let dir = try makeTempDir()
        defer { try? fm.removeItem(at: dir) }

        let oldURL = dir.appendingPathComponent("Documents/SQLite/heymacro.db")
        let newURL = dir.appendingPathComponent("AppSupport/Database/heymacro.db")
        try plantDirtyWALFixture(at: oldURL)
        #expect(fm.fileExists(atPath: oldURL.path + "-wal"), "fixture must have a live WAL file")

        let resultURL = try DatabaseAdoption.adopt(oldURL: oldURL, newURL: newURL)
        #expect(resultURL == newURL)
        #expect(!fm.fileExists(atPath: oldURL.path), "old main file moved away")
        #expect(!fm.fileExists(atPath: oldURL.path + "-wal"), "stale WAL removed after checkpoint")
        #expect(!fm.fileExists(atPath: oldURL.path + "-shm"))

        let adopted = try DatabaseQueue(path: newURL.path)
        let firstName = try await adopted.read { db in
            try String.fetchOne(db, sql: "SELECT firstName FROM users WHERE userID = 'default-user'")
        }
        #expect(firstName == "Shyam", "row that lived in the WAL survived adoption")
    }

    @Test func adoptedDatabaseAcceptsV1MigrationAndDataStore() async throws {
        let fm = FileManager.default
        let dir = try makeTempDir()
        defer { try? fm.removeItem(at: dir) }

        let oldURL = dir.appendingPathComponent("Documents/SQLite/heymacro.db")
        let newURL = dir.appendingPathComponent("AppSupport/Database/heymacro.db")
        try plantDirtyWALFixture(at: oldURL)

        let url = try DatabaseAdoption.adopt(oldURL: oldURL, newURL: newURL)
        let database = try AppDatabase(DatabaseQueue(path: url.path))
        let store = DataStore(database)

        // Migration must be a no-op on existing tables and create the missing ones;
        // the adopted user row must be readable through the normal path.
        let user = try await store.getOrCreateDefaultUser()
        #expect(user.firstName == "Shyam")

        let targets = try await store.getOrCreateMacroTargets(userID: user.userID)
        #expect(targets.calories == 2690, "targets table created fresh with defaults")
    }

    @Test func freshInstallSkipsAdoptionButIsOpenable() async throws {
        let fm = FileManager.default
        let dir = try makeTempDir()
        defer { try? fm.removeItem(at: dir) }

        let oldURL = dir.appendingPathComponent("Documents/SQLite/heymacro.db")
        let newURL = dir.appendingPathComponent("AppSupport/Database/heymacro.db")

        let resultURL = try DatabaseAdoption.adopt(oldURL: oldURL, newURL: newURL)
        #expect(resultURL == newURL)

        // The regression that shipped once: the fresh-install branch returned a path whose
        // parent directory didn't exist, so the very first open failed with SQLite error 14.
        let database = try AppDatabase(DatabaseQueue(path: resultURL.path))
        let store = DataStore(database)
        let user = try await store.getOrCreateDefaultUser()
        #expect(user.userID == "default-user")
    }

    @Test func secondLaunchLeavesAdoptedDatabaseAlone() throws {
        let fm = FileManager.default
        let dir = try makeTempDir()
        defer { try? fm.removeItem(at: dir) }

        let oldURL = dir.appendingPathComponent("Documents/SQLite/heymacro.db")
        let newURL = dir.appendingPathComponent("AppSupport/Database/heymacro.db")
        try plantDirtyWALFixture(at: oldURL)

        _ = try DatabaseAdoption.adopt(oldURL: oldURL, newURL: newURL)
        let sizeAfterFirst = try fm.attributesOfItem(atPath: newURL.path)[.size] as? Int64

        // Second run: new exists, old gone — must return immediately without touching anything.
        let resultURL = try DatabaseAdoption.adopt(oldURL: oldURL, newURL: newURL)
        #expect(resultURL == newURL)
        let sizeAfterSecond = try fm.attributesOfItem(atPath: newURL.path)[.size] as? Int64
        #expect(sizeAfterFirst == sizeAfterSecond)
    }
}
