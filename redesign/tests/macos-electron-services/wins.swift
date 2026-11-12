import CoreGraphics
let pid = Int32(CommandLine.arguments[1])!
let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as! [[String: Any]]
var shown = false
for w in list where (w["kCGWindowOwnerPID"] as? Int32) == pid && (w["kCGWindowLayer"] as? Int) == 0 {
  let b = w["kCGWindowBounds"] as! [String: Any]
  if (w["kCGWindowIsOnscreen"] as? Bool) == true && (b["Width"] as! Double) >= 300 { shown = true }
}
print(shown ? "onscreen" : "NOT-onscreen")
