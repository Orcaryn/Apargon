import AppKit
import Security
import WebKit

let url = URL(string: CommandLine.arguments[2])!

func done(_ answered: Bool) -> Never {
  print(answered ? "answered" : "blocked")
  exit(0)
}

final class Download: NSObject, URLSessionDownloadDelegate {
  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {}
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) { done(task.response != nil) }
}

final class Page: NSObject, WKNavigationDelegate {
  func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) { done(true) }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { done(false) }
}

if CommandLine.arguments[1] == "trust" {
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

if CommandLine.arguments[1] == "download" {
  URLSession(configuration: .background(withIdentifier: "apargon.leak.\(getpid())"), delegate: Download(), delegateQueue: nil).downloadTask(with: url).resume()
} else {
  webView.navigationDelegate = page
  webView.load(URLRequest(url: url))
}

DispatchQueue.main.asyncAfter(deadline: .now() + 8) { done(false) }
app.run()
