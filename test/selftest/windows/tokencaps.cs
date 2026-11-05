// Prints the capability SIDs in this process's token, and the SIDs Windows derives from each name given.
using System;
using System.Runtime.InteropServices;
using System.Security.Principal;

class TokenCaps {
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr info, int length, out int needed);
  [DllImport("kernelbase.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool DeriveCapabilitySidsFromName(string name, out IntPtr groupSids, out int groupCount, out IntPtr capabilitySids, out int capabilityCount);

  static int Main(string[] names) {
    foreach (string name in names) {
      IntPtr groups, capabilities; int groupCount, capabilityCount;
      if (DeriveCapabilitySidsFromName(name, out groups, out groupCount, out capabilities, out capabilityCount) && capabilityCount > 0) {
        Console.WriteLine("derived " + name + " " + new SecurityIdentifier(Marshal.ReadIntPtr(capabilities)).Value);
      } else {
        Console.WriteLine("derive failed " + name + " " + Marshal.GetLastWin32Error());
      }
    }

    IntPtr token;
    if (!OpenProcessToken(GetCurrentProcess(), 8, out token)) { Console.WriteLine("open failed " + Marshal.GetLastWin32Error()); return 1; }
    int needed;
    IntPtr isContainer = Marshal.AllocHGlobal(4);
    GetTokenInformation(token, 29, isContainer, 4, out needed);
    Console.WriteLine("appcontainer " + Marshal.ReadInt32(isContainer));

    GetTokenInformation(token, 30, IntPtr.Zero, 0, out needed);
    IntPtr list = Marshal.AllocHGlobal(Math.Max(needed, 8));
    if (!GetTokenInformation(token, 30, list, needed, out needed)) { Console.WriteLine("capabilities failed " + Marshal.GetLastWin32Error()); return 1; }
    int count = Marshal.ReadInt32(list);
    for (int i = 0; i < count; i++) {
      Console.WriteLine("capability " + new SecurityIdentifier(Marshal.ReadIntPtr(list, IntPtr.Size + i * IntPtr.Size * 2)).Value);
    }
    return 0;
  }
}
