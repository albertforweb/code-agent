import Foundation
import UIKit

struct RemoteDevice: Codable, Identifiable {
    let id: String
    let name: String
    let createdAt: Double
    let lastSeenAt: Double?
}

struct RemoteControlState: Decodable {
    let enabled: Bool
    let mode: String
    let serverUrl: String?
    let localNetworkUrls: [String]?
    let relay: RemoteRelayConfig?
    let approvedDevices: [RemoteDevice]
    let pendingActions: [ApprovalRequest]?
    let auditLog: [RemoteAuditEvent]?
}

struct RemoteRelayConfig: Decodable {
    let enrollmentStatus: String
    let brokerUrl: String?
    let accountId: String?
    let deviceId: String?
    let enrolledAt: Double?
    let disabledAt: Double?
    let lastConnectedAt: Double?
    let tokenRotatesAt: Double?
}

struct RemoteStatusResponse: Decodable {
    let workspacePath: String
    let remoteControl: RemoteControlState
}

struct PairRequest: Encodable {
    let code: String
    let deviceName: String
}

struct PairResponse: Decodable {
    let token: String
    let device: RemoteDevice
    let remoteControl: RemoteControlState
}

struct DeviceListResponse: Decodable {
    let devices: [RemoteDevice]
    let currentDeviceId: String
    let auditLog: [RemoteAuditEvent]
}

struct ApprovalDecision: Encodable {
    let approved: Bool
    let reason: String?
}

struct ApprovalDecisionResponse: Decodable {
    let ok: Bool
}

struct ApprovalRequest: Decodable, Identifiable {
    let id: String
    let type: String
    let title: String
    let summary: String
    let status: String
    let createdAt: Double
    let expiresAt: Double
}

struct RemoteAuditEvent: Decodable, Identifiable {
    let id: String
    let type: String
    let message: String
    let createdAt: Double
    let deviceName: String?
    let approvalId: String?
}

enum RemoteControlError: LocalizedError {
    case invalidServerURL
    case missingToken
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .invalidServerURL:
            return "Invalid server URL."
        case .missingToken:
            return "Pair this device first."
        case .serverError(let message):
            return message
        }
    }
}

@MainActor
final class RemoteControlViewModel: ObservableObject {
    @Published var serverURL: String {
        didSet { UserDefaults.standard.set(serverURL, forKey: Self.serverURLKey) }
    }

    @Published var deviceName: String {
        didSet { UserDefaults.standard.set(deviceName, forKey: Self.deviceNameKey) }
    }

    @Published var pairingCode = ""
    @Published var workspacePath = ""
    @Published var approvals: [ApprovalRequest] = []
    @Published var devices: [RemoteDevice] = []
    @Published var currentDeviceId: String?
    @Published var auditLog: [RemoteAuditEvent] = []
    @Published var relay: RemoteRelayConfig?
    @Published var status = "Disconnected"
    @Published var isLoading = false
    @Published var lastRefreshedAt: Date?
    @Published var errorMessage: String?

    private var token: String? {
        didSet { saveToken(token) }
    }

    var isPaired: Bool {
        token?.isEmpty == false
    }

    private static let serverURLKey = "codeAgentCompanion.serverURL"
    private static let deviceNameKey = "codeAgentCompanion.deviceName"
    private static let currentDeviceIdKey = "codeAgentCompanion.currentDeviceId"
    private static let keychainService = "com.albertforweb.codeagent.companion"
    private static let tokenKey = "codeAgentCompanion.token"
    private static let simulatorTokenFallbackKey = "codeAgentCompanion.simulatorToken"

    init() {
        self.serverURL = UserDefaults.standard.string(forKey: Self.serverURLKey) ?? "http://127.0.0.1:32888"
        self.deviceName = UserDefaults.standard.string(forKey: Self.deviceNameKey) ?? UIDevice.current.name
        self.currentDeviceId = UserDefaults.standard.string(forKey: Self.currentDeviceIdKey)
        self.token = Self.readStoredToken()
    }

    func pair() async {
        await run {
            let request = PairRequest(code: self.pairingCode, deviceName: self.deviceName)
            let response: PairResponse = try await self.request("/api/pair", method: "POST", body: request, requiresAuth: false)
            self.token = response.token
            self.currentDeviceId = response.device.id
            UserDefaults.standard.set(response.device.id, forKey: Self.currentDeviceIdKey)
            self.pairingCode = ""
            self.status = "Paired as \(response.device.name)"
            try await self.refreshWithoutLoadingState()
        }
    }

    func refresh() async {
        await run {
            try await self.refreshWithoutLoadingState()
        }
    }

    func refreshQuietly() async {
        do {
            try await refreshWithoutLoadingState()
        } catch {
            status = "Error"
            errorMessage = error.localizedDescription
        }
    }

    func approve(_ approval: ApprovalRequest) async {
        await resolve(approval, approved: true)
    }

    func reject(_ approval: ApprovalRequest) async {
        await resolve(approval, approved: false)
    }

    func forgetDevice() {
        token = nil
        currentDeviceId = nil
        UserDefaults.standard.removeObject(forKey: Self.currentDeviceIdKey)
        approvals = []
        devices = []
        auditLog = []
        relay = nil
        workspacePath = ""
        status = "Disconnected"
    }

    func revoke(_ device: RemoteDevice) async {
        await run {
            let _: RemoteControlState = try await self.request(
                "/api/devices/\(device.id)",
                method: "DELETE",
                body: Optional<String>.none,
                requiresAuth: true
            )

            if device.id == self.currentDeviceId {
                self.forgetDevice()
            } else {
                try await self.refreshWithoutLoadingState()
            }
        }
    }

    private func resolve(_ approval: ApprovalRequest, approved: Bool) async {
        await run {
            let body = ApprovalDecision(approved: approved, reason: nil)
            let _: ApprovalDecisionResponse = try await self.request(
                "/api/approvals/\(approval.id)",
                method: "POST",
                body: body,
                requiresAuth: true
            )
            try await self.refreshWithoutLoadingState()
        }
    }

    private func refreshWithoutLoadingState() async throws {
        let statusResponse: RemoteStatusResponse = try await request("/api/status", method: "GET", body: Optional<String>.none, requiresAuth: false)
        workspacePath = statusResponse.workspacePath
        relay = statusResponse.remoteControl.relay
        lastRefreshedAt = Date()

        if isPaired {
            struct ApprovalsResponse: Decodable {
                let approvals: [ApprovalRequest]
            }
            let response: ApprovalsResponse = try await request("/api/approvals", method: "GET", body: Optional<String>.none, requiresAuth: true)
            let deviceResponse: DeviceListResponse = try await request("/api/devices", method: "GET", body: Optional<String>.none, requiresAuth: true)
            approvals = response.approvals
            devices = deviceResponse.devices
            currentDeviceId = deviceResponse.currentDeviceId
            UserDefaults.standard.set(deviceResponse.currentDeviceId, forKey: Self.currentDeviceIdKey)
            auditLog = deviceResponse.auditLog
            status = "Connected"
        } else {
            approvals = statusResponse.remoteControl.pendingActions ?? []
            devices = statusResponse.remoteControl.approvedDevices
            auditLog = statusResponse.remoteControl.auditLog ?? []
            status = statusResponse.remoteControl.enabled ? "Ready to pair" : "Remote control disabled"
        }
    }

    private func run(_ operation: @escaping () async throws -> Void) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await operation()
        } catch {
            errorMessage = error.localizedDescription
            status = "Error"
        }
    }

    private func request<Response: Decodable, Body: Encodable>(
        _ path: String,
        method: String,
        body: Body?,
        requiresAuth: Bool
    ) async throws -> Response {
        guard let baseURL = URL(string: serverURL.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            throw RemoteControlError.invalidServerURL
        }

        let endpoint = baseURL.appendingPathComponent(path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        var request = URLRequest(url: endpoint)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "content-type")

        if requiresAuth {
            guard let token, !token.isEmpty else {
                throw RemoteControlError.missingToken
            }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        }

        if let body {
            request.httpBody = try JSONEncoder().encode(body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw RemoteControlError.serverError("No HTTP response.")
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let serverError = try? JSONDecoder().decode(ServerErrorResponse.self, from: data)
            throw RemoteControlError.serverError(serverError?.error ?? "Request failed with HTTP \(httpResponse.statusCode).")
        }

        return try JSONDecoder().decode(Response.self, from: data)
    }

    private func saveToken(_ token: String?) {
        do {
            if let token, !token.isEmpty {
                try KeychainStore.save(token, service: Self.keychainService, account: Self.tokenKey)
                Self.clearSimulatorTokenFallback()
            } else {
                try KeychainStore.delete(service: Self.keychainService, account: Self.tokenKey)
                Self.clearSimulatorTokenFallback()
            }
        } catch {
            #if targetEnvironment(simulator)
            if let token, !token.isEmpty {
                UserDefaults.standard.set(token, forKey: Self.simulatorTokenFallbackKey)
                return
            }
            UserDefaults.standard.removeObject(forKey: Self.simulatorTokenFallbackKey)
            #else
            errorMessage = "Unable to update Keychain token: \(error.localizedDescription)"
            #endif
        }
    }

    private static func readStoredToken() -> String? {
        do {
            let token = try KeychainStore.read(service: keychainService, account: tokenKey)
            if let token, !token.isEmpty {
                clearSimulatorTokenFallback()
                return token
            }
        } catch {
            #if !targetEnvironment(simulator)
            return nil
            #endif
        }

        #if targetEnvironment(simulator)
        return UserDefaults.standard.string(forKey: simulatorTokenFallbackKey)
        #else
        return nil
        #endif
    }

    private static func clearSimulatorTokenFallback() {
        #if targetEnvironment(simulator)
        UserDefaults.standard.removeObject(forKey: simulatorTokenFallbackKey)
        #endif
    }
}

private struct ServerErrorResponse: Decodable {
    let error: String
}
