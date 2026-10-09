import SwiftUI
import SafariServices

@main
struct TriangleApp: App {
    var body: some Scene {
        WindowGroup {
            VStack(alignment: .leading, spacing: 16) {
                Text("Triangle Transcript").font(.title)
                Text("Включите расширение в Safari и разрешите доступ к www.youtube.com. Затем перезагрузите страницу видео.")
                Text("Нажмите «Скопировать транскрипцию» на панели управления плеером: текст без таймкодов и переносов строк окажется в буфере обмена. На одну секунду появится галочка.")
                Button("Открыть настройки расширения в Safari") {
                    SFSafariApplication.showPreferencesForExtension(withIdentifier: "com.fskir.TriangleTranscriptSafari.Extension") { error in
                        if let error { NSLog("Safari preferences: %@", String(describing: error)) }
                    }
                }
                Text("Использует доступную расшифровку YouTube. GPLv3.").font(.caption)
            }.padding(28).frame(width: 520)
        }
    }
}
