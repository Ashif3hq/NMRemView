import SwiftUI
import AppKit

@main
struct NMRemViewApp: App {
    @StateObject private var store = Store()

    init() {
        // Running from `swift run` starts as a background process; make it a normal app.
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    var body: some Scene {
        WindowGroup("NMRemView") {
            ContentView()
                .environmentObject(store)
                .frame(minWidth: 1100, minHeight: 680)
        }
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("About NMRemView") {
                    let credits = NSAttributedString(
                        string: "Created by Ashif\ngithub.com/Ashif3hq/NMRemView",
                        attributes: [.font: NSFont.systemFont(ofSize: 11), .foregroundColor: NSColor.secondaryLabelColor])
                    NSApplication.shared.orderFrontStandardAboutPanel(options: [.credits: credits])
                }
            }
            CommandGroup(replacing: .newItem) {
                Button("Open NMR Data…") { store.presentOpenPanel() }
                    .keyboardShortcut("o")
            }
        }
    }
}
