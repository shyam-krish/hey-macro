# Hey Macro — Native iOS

Native SwiftUI rewrite of the React Native app in the repo root. The RN app stays in place as
the reference spec until this reaches parity. iOS 26+, Liquid Glass, GRDB, no backend.

## Requirements

- **Xcode 26+** (iOS 26 SDK — Liquid Glass, SpeechAnalyzer). Xcode 16 cannot build this project.
- `brew install xcodegen`
- `Config/Secrets.xcconfig` (copy from `Secrets.example.xcconfig`, fill in API keys)

## Build & run loop

```bash
cd HeyMacroNative
xcodegen generate                       # after adding/removing files or editing project.yml

xcodebuild -project HeyMacro.xcodeproj -scheme HeyMacro \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build

# Run on simulator
xcrun simctl boot 'iPhone 17 Pro' 2>/dev/null || true
APP=$(xcodebuild -project HeyMacro.xcodeproj -scheme HeyMacro \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -showBuildSettings 2>/dev/null \
  | awk '/ BUILT_PRODUCTS_DIR/{d=$3}/ FULL_PRODUCT_NAME/{n=$3}END{print d"/"n}')
xcrun simctl install booted "$APP"
xcrun simctl launch booted com.anonymous.hey-macro

# Screenshot / logs
xcrun simctl io booted screenshot /tmp/heymacro.png
xcrun simctl spawn booted log stream --predicate 'subsystem == "com.anonymous.hey-macro"'

# Tests
xcodebuild -project HeyMacro.xcodeproj -scheme HeyMacro \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test
```

## Data migration (do not break)

- Bundle ID must remain exactly `com.anonymous.hey-macro` — the app ships as an update to the
  existing App Store Connect record so the sandbox (and the user's SQLite data) persists.
- On first launch the app adopts the RN app's DB from `Documents/SQLite/heymacro.db`
  (WAL checkpoint → atomic move to `Application Support/Database/heymacro.db`).
- **Testers must not delete the app between builds** — deleting the app deletes all logged data.

## Release (replaces EAS)

1. `CFBundleVersion` in `project.yml` must exceed the last EAS build number (check App Store Connect).
2. `xcodebuild archive` → `xcodebuild -exportArchive` (method `app-store-connect`, ASC API key) → TestFlight.
