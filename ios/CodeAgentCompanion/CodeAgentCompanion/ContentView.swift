import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = RemoteControlViewModel()

    var body: some View {
        NavigationStack {
            List {
                Section("Session") {
                    TextField("Server URL", text: $viewModel.serverURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    LabeledContent("Status", value: viewModel.status)

                    if let lastRefreshedAt = viewModel.lastRefreshedAt {
                        LabeledContent("Updated", value: lastRefreshedAt.formatted(date: .omitted, time: .shortened))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    if !viewModel.workspacePath.isEmpty {
                        Text(viewModel.workspacePath)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }

                if viewModel.isPaired {
                    Section("Device") {
                        LabeledContent("Name", value: viewModel.deviceName)
                        if let currentDevice = viewModel.currentDevice {
                            Button("Revoke This Device", role: .destructive) {
                                Task { await viewModel.revoke(currentDevice) }
                            }
                        }
                        Button("Forget Local Token", role: .destructive) {
                            viewModel.forgetDevice()
                        }
                    }
                } else {
                    Section("Pairing") {
                        TextField("Device name", text: $viewModel.deviceName)
                        TextField("Pairing code", text: $viewModel.pairingCode)
                            .keyboardType(.numberPad)
                        Button("Pair") {
                            Task { await viewModel.pair() }
                        }
                        .disabled(viewModel.pairingCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }

                Section("Pending Approvals") {
                    if viewModel.approvals.isEmpty {
                        Text("None")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(viewModel.approvals) { approval in
                            ApprovalRow(
                                approval: approval,
                                approve: { Task { await viewModel.approve(approval) } },
                                reject: { Task { await viewModel.reject(approval) } }
                            )
                        }
                    }
                }

                Section("Managed Relay") {
                    LabeledContent("Status", value: viewModel.relay?.enrollmentStatus ?? "not-configured")
                    if let brokerUrl = viewModel.relay?.brokerUrl {
                        LabeledContent("Broker", value: brokerUrl)
                    }
                    if let accountId = viewModel.relay?.accountId {
                        LabeledContent("Account", value: accountId)
                    }
                    Text("Off-network relay control is unavailable until managed relay identity, encryption, token rotation, audit propagation, and emergency revocation are implemented.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                if viewModel.isPaired {
                    Section("Trusted Devices") {
                        if viewModel.devices.isEmpty {
                            Text("None")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(viewModel.devices) { device in
                                DeviceRow(
                                    device: device,
                                    isCurrent: device.id == viewModel.currentDeviceId,
                                    revoke: { Task { await viewModel.revoke(device) } }
                                )
                            }
                        }
                    }

                    Section("Audit") {
                        if viewModel.auditLog.isEmpty {
                            Text("None")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(viewModel.auditLog.prefix(25)) { event in
                                AuditRow(event: event)
                            }
                        }
                    }
                }
            }
            .navigationTitle("CodeAgent")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Refresh") {
                        Task { await viewModel.refresh() }
                    }
                    .disabled(viewModel.isLoading)
                }
            }
            .overlay {
                if viewModel.isLoading {
                    ProgressView()
                        .padding()
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
                }
            }
            .alert("CodeAgent", isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
            .task {
                await viewModel.refresh()
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(3))
                    if Task.isCancelled {
                        break
                    }
                    await viewModel.refreshQuietly()
                }
            }
        }
    }
}

private extension RemoteControlViewModel {
    var currentDevice: RemoteDevice? {
        devices.first { $0.id == currentDeviceId }
    }
}

private struct ApprovalRow: View {
    let approval: ApprovalRequest
    let approve: () -> Void
    let reject: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(approval.title)
                .font(.headline)

            if !approval.summary.isEmpty {
                Text(approval.summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            HStack {
                Button("Approve", action: approve)
                    .buttonStyle(.borderedProminent)

                Button("Reject", role: .destructive, action: reject)
                    .buttonStyle(.bordered)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct DeviceRow: View {
    let device: RemoteDevice
    let isCurrent: Bool
    let revoke: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(device.name)
                    .font(.headline)
                if isCurrent {
                    Text("This device")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if let lastSeenAt = device.lastSeenAt {
                Text("Last seen \(formatTimestamp(lastSeenAt))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Button("Revoke", role: .destructive, action: revoke)
                .buttonStyle(.bordered)
        }
        .padding(.vertical, 4)
    }
}

private struct AuditRow: View {
    let event: RemoteAuditEvent

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(event.message)
                .font(.subheadline)
            Text(formatTimestamp(event.createdAt))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

private func formatTimestamp(_ value: Double) -> String {
    let date = Date(timeIntervalSince1970: value / 1000)
    return date.formatted(date: .abbreviated, time: .shortened)
}

#Preview {
    ContentView()
}
