import AppKit
import Metal
import Security
import WebKit

let mode = CommandLine.arguments[1]

func done(_ answered: Bool) -> Never {
  print(answered ? "answered" : "blocked")
  exit(0)
}

if mode == "gpu" {
  let kernel = "#include <metal_stdlib>\nusing namespace metal;\nkernel void add_one(device uint *buf [[buffer(0)]], uint id [[thread_position_in_grid]]) { buf[id] += 1; }"
  guard let device = MTLCreateSystemDefaultDevice(),
        let library = try? device.makeLibrary(source: kernel, options: nil),
        let fn = library.makeFunction(name: "add_one"),
        let pipeline = try? device.makeComputePipelineState(function: fn),
        let queue = device.makeCommandQueue(),
        let buffer = device.makeBuffer(length: 4, options: .storageModeShared),
        let command = queue.makeCommandBuffer(),
        let encoder = command.makeComputeCommandEncoder() else {
    done(false)
  }
  buffer.contents().storeBytes(of: UInt32(41), as: UInt32.self)
  encoder.setComputePipelineState(pipeline)
  encoder.setBuffer(buffer, offset: 0, index: 0)
  encoder.dispatchThreads(MTLSize(width: 1, height: 1, depth: 1), threadsPerThreadgroup: MTLSize(width: 1, height: 1, depth: 1))
  encoder.endEncoding()
  command.commit()
  command.waitUntilCompleted()
  done(command.status == .completed && buffer.contents().load(as: UInt32.self) == 42)
} else if mode == "sysocket" {
  let fd = socket(AF_SYSTEM, SOCK_DGRAM, SYSPROTO_CONTROL)
  if fd >= 0 { close(fd) }
  done(fd >= 0)
}

let url = URL(string: CommandLine.arguments[2])!

final class Download: NSObject, URLSessionDownloadDelegate {
  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {}
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) { done(task.response != nil) }
}

final class Page: NSObject, WKNavigationDelegate {
  func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) { done(true) }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { done(false) }
}

if mode == "trust" {
  let trustdOutOfReach = -26276
  let certificate = SecCertificateCreateWithData(nil, FileManager.default.contents(atPath: CommandLine.arguments[2])! as CFData)!
  var trust: SecTrust?
  SecTrustCreateWithCertificates(certificate, SecPolicyCreateSSL(true, nil), &trust)
  var error: CFError?
  _ = SecTrustEvaluateWithError(trust!, &error)
  done(error.map { CFErrorGetCode($0) } != trustdOutOfReach)
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let page = Page()
let webView = WKWebView(frame: .zero)

if mode == "download" {
  URLSession(configuration: .background(withIdentifier: "apargon.leak.\(getpid())"), delegate: Download(), delegateQueue: nil).downloadTask(with: url).resume()
} else {
  webView.navigationDelegate = page
  webView.load(URLRequest(url: url))
}

DispatchQueue.main.asyncAfter(deadline: .now() + 8) { done(false) }
app.run()
