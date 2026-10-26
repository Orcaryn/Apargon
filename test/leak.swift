// Asks a system service to fetch a URL for this process: a background download goes
// through nsurlsessiond, a WKWebView through WebKit's network process. launchd starts
// both, outside the sandbox. Prints "answered" if the server replied, else "blocked".
import AppKit
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

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let page = Page() // WKWebView holds its delegate weakly; a URLSession holds its own
let webView = WKWebView(frame: .zero)

if CommandLine.arguments[1] == "download" {
  URLSession(configuration: .background(withIdentifier: "papp.leak.\(getpid())"), delegate: Download(), delegateQueue: nil).downloadTask(with: url).resume()
} else {
  webView.navigationDelegate = page
  webView.load(URLRequest(url: url))
}

DispatchQueue.main.asyncAfter(deadline: .now() + 8) { done(false) }
app.run()
