import Testing
@testable import HeyMacro

struct SmokeTests {
    @Test func targetBuildsAndLinks() {
        #expect(Theme.Spacing.cardRadius == 12)
    }
}
