import AVFoundation
import SwiftUI

struct ScannerView: UIViewControllerRepresentable {
    var onDetect: (String) -> Void
    var onCancel: () -> Void
    var onUnavailable: () -> Void

    func makeUIViewController(context: Context) -> ScannerController {
        let controller = ScannerController()
        controller.onDetect = onDetect
        controller.onCancel = onCancel
        controller.onUnavailable = onUnavailable
        return controller
    }

    func updateUIViewController(_ uiViewController: ScannerController, context: Context) {}
}

final class ScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onDetect: ((String) -> Void)?
    var onCancel: (() -> Void)?
    var onUnavailable: (() -> Void)?

    private let session = AVCaptureSession()
    private let preview = AVCaptureVideoPreviewLayer()
    private let queue = DispatchQueue(label: "app.stockea.ios.scanner")
    private var finished = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        preview.videoGravity = .resizeAspectFill
        preview.session = session
        view.layer.addSublayer(preview)

        let cancel = UIButton(type: .system)
        cancel.setTitle("Cancelar", for: .normal)
        cancel.tintColor = .white
        cancel.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        cancel.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        cancel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(cancel)
        NSLayoutConstraint.activate([
            cancel.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            cancel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
        ])

        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configure()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    if granted { self.configure() }
                    else { self.onUnavailable?() }
                }
            }
        default:
            onUnavailable?()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview.frame = view.bounds
        orientPreview()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        queue.async {
            if self.session.isRunning { self.session.stopRunning() }
        }
    }

    @objc private func cancelTapped() { onCancel?() }

    private func configure() {
        session.beginConfiguration()
        session.sessionPreset = .high
        let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
            ?? AVCaptureDevice.default(for: .video)
        guard
            let device,
            let input = try? AVCaptureDeviceInput(device: device),
            session.canAddInput(input)
        else {
            session.commitConfiguration()
            onUnavailable?()
            return
        }
        session.addInput(input)
        if device.isFocusModeSupported(.continuousAutoFocus) {
            try? device.lockForConfiguration()
            device.focusMode = .continuousAutoFocus
            if device.isAutoFocusRangeRestrictionSupported {
                device.autoFocusRangeRestriction = .near
            }
            device.unlockForConfiguration()
        }
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else {
            session.commitConfiguration()
            onUnavailable?()
            return
        }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
        let wanted: [AVMetadataObject.ObjectType] = [.ean13, .ean8, .upce, .code128, .qr]
        output.metadataObjectTypes = wanted.filter { output.availableMetadataObjectTypes.contains($0) }
        session.commitConfiguration()
        queue.async { self.session.startRunning() }
    }

    private func orientPreview() {
        guard let connection = preview.connection else { return }
        if connection.isVideoRotationAngleSupported(90) {
            connection.videoRotationAngle = 90
        }
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard !finished else { return }
        guard let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let raw = object.stringValue else { return }
        let ean = extractEan13(raw)
        let value = ean.isEmpty ? raw.filter(\.isNumber) : ean
        guard value.count >= 8 else { return }
        finished = true
        queue.async {
            if self.session.isRunning { self.session.stopRunning() }
        }
        onDetect?(value)
    }
}
