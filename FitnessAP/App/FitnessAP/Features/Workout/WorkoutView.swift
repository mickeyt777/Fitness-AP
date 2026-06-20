// WorkoutView.swift
// Tab 2 — Log workouts by speaking or typing naturally.
// Flow: user sends message → backend parses with Claude → app shows
// what was understood → one tap confirms and logs the sets.

import SwiftUI
import Speech
import AVFoundation

struct WorkoutView: View {
    @EnvironmentObject var appState: AppState

    @State private var messages: [BubbleMessage] = []
    @State private var inputText: String = ""
    @State private var isRecording  = false
    @State private var isParsing    = false
    @State private var pendingParse: AiParseResponse? = nil
    @State private var pendingRaw:   String = ""

    // Speech
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    @State private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    @State private var recognitionTask:    SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                messageList
                Divider()
                inputBar
            }
            .navigationTitle("Log Workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    if isParsing {
                        ProgressView().scaleEffect(0.8)
                    }
                }
            }
        }
        .task { await loadHistory() }
    }

    // MARK: - Message list

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    if messages.isEmpty && !isParsing {
                        promptHint
                    }
                    ForEach(messages) { msg in
                        ChatBubble(message: msg)
                            .id(msg.id)
                    }
                    if isParsing {
                        typingIndicator
                            .id("typing")
                    }
                    if let parse = pendingParse,
                       let sets  = parse.parsed.sets, !sets.isEmpty {
                        ConfirmCard(sets: sets) {
                            Task { await confirmLog(parse: parse) }
                        } onDiscard: {
                            pendingParse = nil
                            pendingRaw   = ""
                            appendAssistant("No problem — what would you like to log?")
                        }
                        .id("confirm")
                    }
                }
                .padding(.horizontal)
                .padding(.top, 12)
                .padding(.bottom, 16)
            }
            .contentMargins(.bottom, 110, for: .scrollContent)
            .onChange(of: messages.count) { _, _ in scrollToBottom(proxy: proxy) }
            .onChange(of: isParsing)      { _, _ in scrollToBottom(proxy: proxy) }
            .onChange(of: pendingParse != nil) { _, _ in scrollToBottom(proxy: proxy) }
        }
    }

    private var promptHint: some View {
        VStack(spacing: 12) {
            Image(systemName: "mic.circle.fill")
                .font(.system(size: 52))
                .foregroundColor(.blue.opacity(0.7))
            Text("Log your workout by speaking or typing")
                .font(.headline)
                .multilineTextAlignment(.center)
            Text("Try: \"3 sets of goblet squats, 16kg, RPE 7\"")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    private var typingIndicator: some View {
        HStack(alignment: .bottom, spacing: 6) {
            Image(systemName: "sparkles")
                .foregroundColor(.blue)
                .font(.caption)
            Text("Parsing…")
                .font(.caption)
                .foregroundColor(.secondary)
            Spacer()
        }
    }

    // MARK: - Input bar

    private var inputBar: some View {
        HStack(spacing: 10) {
            Button {
                isRecording ? stopRecording() : startRecording()
            } label: {
                Image(systemName: isRecording ? "stop.circle.fill" : "mic.circle.fill")
                    .font(.system(size: 30))
                    .foregroundColor(isRecording ? .red : .blue)
                    .symbolEffect(.pulse, isActive: isRecording)
            }

            TextField("Describe your sets…", text: $inputText, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(1...4)
                .submitLabel(.send)
                .onSubmit { Task { await send() } }

            Button {
                Task { await send() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 30))
                    .foregroundColor(inputText.trimmingCharacters(in: .whitespaces).isEmpty ? .secondary : .blue)
            }
            .disabled(inputText.trimmingCharacters(in: .whitespaces).isEmpty || isParsing)
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .padding(.bottom, 8)
    }

    // MARK: - Actions

    private func send() async {
        let text = inputText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        inputText = ""
        appendUser(text)
        await parse(rawText: text)
    }

    private func parse(rawText: String) async {
        isParsing    = true
        pendingParse = nil
        pendingRaw   = rawText
        do {
            let result = try await WorkoutParser.parse(userId: appState.userId, rawText: rawText)
            if result.parsed.type == "workout_log",
               let sets = result.parsed.sets, !sets.isEmpty {
                // Best-effort: resolve each set's spoken name to a canonical
                // movement id/name before confirming, so the logged set carries
                // movement_id. Never throws — unresolved sets pass through with
                // movement_id nil. Spinner stays up through resolution.
                let resolved = await WorkoutParser.resolve(userId: appState.userId, response: result)
                isParsing    = false
                pendingParse = resolved
            } else {
                isParsing = false
                appendAssistant("I couldn't find any sets in that. Try: \"3 sets goblet squat 16kg RPE 7\"")
            }
        } catch {
            isParsing = false
            appendAssistant("Couldn't reach the server — check your connection and try again.")
        }
    }

    private func confirmLog(parse: AiParseResponse) async {
        pendingParse = nil
        isParsing    = true
        let body = SendChatBody(
            raw_text:          pendingRaw,
            parsed_payload:    parse.parsed,
            parser_source:     "cloud",
            parser_confidence: parse.parsed.confidence
        )
        do {
            let response = try await APIClient.shared.sendChat(userId: appState.userId, body: body)
            isParsing = false
            let n = response.action?.sets_logged ?? 0
            appendAssistant("✅ Logged \(n) set\(n == 1 ? "" : "s"). Keep it up!")
        } catch {
            isParsing = false
            appendAssistant("Sets parsed but failed to save — try again.")
        }
    }

    // MARK: - Speech recognition

    private func startRecording() {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else { return }
            DispatchQueue.main.async { self.beginAudioSession() }
        }
    }

    private func beginAudioSession() {
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let request = recognitionRequest else { return }
        request.shouldReportPartialResults = true

        // Must configure AVAudioSession before accessing inputNode format
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            print("[Speech] AVAudioSession setup failed: \(error)")
            return
        }

        let node = audioEngine.inputNode
        let fmt  = node.inputFormat(forBus: 0)
        node.installTap(onBus: 0, bufferSize: 1024, format: fmt) { buf, _ in
            request.append(buf)
        }

        do {
            try audioEngine.start()
        } catch {
            print("[Speech] audioEngine.start() failed: \(error)")
            return
        }
        isRecording = true

        recognitionTask = speechRecognizer?.recognitionTask(with: request) { result, error in
            if let result {
                DispatchQueue.main.async {
                    self.inputText = result.bestTranscription.formattedString
                }
            }
            if error != nil || (result?.isFinal ?? false) {
                DispatchQueue.main.async { self.stopRecording() }
            }
        }
    }

    private func stopRecording() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask?.cancel()
        recognitionTask = nil
        isRecording = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // MARK: - History

    private func loadHistory() async {
        guard let history = try? await APIClient.shared.getChatHistory(userId: appState.userId) else { return }
        messages = history.map {
            BubbleMessage(id: $0.id,
                          role: $0.role == "user" ? .user : .assistant,
                          text: $0.raw_text)
        }
    }

    // MARK: - Helpers

    private func appendUser(_ text: String) {
        messages.append(BubbleMessage(role: .user, text: text))
    }
    private func appendAssistant(_ text: String) {
        messages.append(BubbleMessage(role: .assistant, text: text))
    }
    private func scrollToBottom(proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.2)) {
            if pendingParse != nil      { proxy.scrollTo("confirm", anchor: .bottom) }
            else if isParsing           { proxy.scrollTo("typing",  anchor: .bottom) }
            else if let last = messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
        }
    }
}

// MARK: - BubbleMessage

struct BubbleMessage: Identifiable {
    let id: String
    let role: Role
    let text: String
    enum Role { case user, assistant }
    init(id: String = UUID().uuidString, role: Role, text: String) {
        self.id = id; self.role = role; self.text = text
    }
}

// MARK: - ChatBubble

struct ChatBubble: View {
    let message: BubbleMessage
    var body: some View {
        HStack {
            if message.role == .user { Spacer(minLength: 48) }
            Text(message.text)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(message.role == .user
                    ? Color.blue
                    : Color(.secondarySystemBackground))
                .foregroundColor(message.role == .user ? .white : .primary)
                .cornerRadius(18)
            if message.role == .assistant { Spacer(minLength: 48) }
        }
    }
}

// MARK: - ConfirmCard

struct ConfirmCard: View {
    let sets: [ParsedWorkoutSet]
    let onConfirm: () -> Void
    let onDiscard: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "checkmark.seal.fill").foregroundColor(.green)
                Text("Got it — confirm these sets?").font(.subheadline).bold()
            }
            ForEach(Array(sets.enumerated()), id: \.offset) { _, set in
                HStack {
                    // Show the resolved canonical name when alias resolution
                    // matched a movement; otherwise the name as spoken/typed.
                    Text(set.canonical_name ?? set.exercise_name).font(.subheadline)
                    Spacer()
                    Text(detail(set)).font(.subheadline).foregroundColor(.secondary)
                }
            }
            HStack(spacing: 12) {
                Button("Discard", action: onDiscard)
                    .buttonStyle(.bordered).foregroundColor(.red)
                Button("Log it", action: onConfirm)
                    .buttonStyle(.borderedProminent).frame(maxWidth: .infinity)
            }
            .padding(.top, 4)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(16)
    }

    private func detail(_ set: ParsedWorkoutSet) -> String {
        var p: [String] = []
        if let r = set.reps      { p.append("\(r) reps") }
        if let w = set.weight_kg { p.append("\(w) kg") }
        if let e = set.rpe       { p.append("RPE \(e)") }
        return p.joined(separator: " · ")
    }
}

#Preview {
    WorkoutView()
        .environmentObject({
            let s = AppState()
            s.signIn(userId: "test-user-001")
            return s
        }())
}
