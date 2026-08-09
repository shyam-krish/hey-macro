import Foundation
import GRDB
import OSLog

/// One-time adoption of the RN app's expo-sqlite database.
///
/// The RN app (same bundle ID, so same sandbox) kept its WAL-mode database at
/// `Documents/SQLite/heymacro.db`. On first native launch we checkpoint the WAL into the main
/// file, then atomically move it to `Application Support/Database/heymacro.db` — the
/// conventional home for app-internal data.
///
/// Crash safety: the old file is never modified destructively before the checkpoint succeeds;
/// a crash between checkpoint and move just re-runs adoption next launch; a crash after the
/// move leaves only stale `-wal`/`-shm` orphans, which are cleaned up on the next launch.
enum DatabaseAdoption {
    private static let log = Logger(subsystem: "com.anonymous.hey-macro", category: "DatabaseAdoption")

    /// Returns the URL to open, performing adoption if the RN database is present
    /// and the native one doesn't exist yet.
    static func prepareDatabaseFile(fileManager: FileManager = .default) throws -> URL {
        try adopt(
            oldURL: oldDatabaseURL(fileManager: fileManager),
            newURL: newDatabaseURL(fileManager: fileManager),
            fileManager: fileManager
        )
    }

    /// Core adoption logic with explicit locations (unit-testable with temp directories).
    static func adopt(oldURL: URL, newURL: URL, fileManager: FileManager = .default) throws -> URL {
        // The queue that opens this path won't create intermediate directories —
        // ensure the destination's parent exists in every branch, including fresh installs.
        try fileManager.createDirectory(
            at: newURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        let oldExists = fileManager.fileExists(atPath: oldURL.path)

        if fileManager.fileExists(atPath: newURL.path) {
            // Already adopted (or fresh native install). Clean up -wal/-shm orphans from a
            // crash-after-move — but only when the old main file is gone; never pull the WAL
            // out from under an intact database.
            if !oldExists {
                removeSiblings(of: oldURL, fileManager: fileManager)
            }
            return newURL
        }

        guard oldExists else {
            log.info("No RN database found — starting fresh")
            return newURL
        }

        log.info("Adopting RN database from \(oldURL.path, privacy: .public)")

        // Fold -wal into the main file so the move captures every committed write.
        let checkpointQueue = try DatabaseQueue(path: oldURL.path)
        try checkpointQueue.writeWithoutTransaction { db in
            _ = try db.checkpoint(.truncate)
        }
        try checkpointQueue.close()

        try fileManager.moveItem(at: oldURL, to: newURL)
        removeSiblings(of: oldURL, fileManager: fileManager)

        log.info("Adoption complete → \(newURL.path, privacy: .public)")
        return newURL
    }

    /// `Application Support/Database/heymacro.db`
    static func newDatabaseURL(fileManager: FileManager = .default) throws -> URL {
        try fileManager
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("Database", isDirectory: true)
            .appendingPathComponent("heymacro.db")
    }

    /// `Documents/SQLite/heymacro.db` — where expo-sqlite kept it.
    static func oldDatabaseURL(fileManager: FileManager = .default) -> URL {
        fileManager
            .urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("SQLite", isDirectory: true)
            .appendingPathComponent("heymacro.db")
    }

    /// After a successful checkpoint the -wal/-shm contents are already in the main file;
    /// stale siblings must not survive next to a moved/absent database.
    private static func removeSiblings(of url: URL, fileManager: FileManager) {
        for suffix in ["-wal", "-shm"] {
            let sibling = URL(fileURLWithPath: url.path + suffix)
            if fileManager.fileExists(atPath: sibling.path) {
                try? fileManager.removeItem(at: sibling)
            }
        }
    }
}
