param([Parameter(Mandatory)][int]$ProcessId)
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class ReCooplayWindowProbe {
    public delegate bool EnumProc(IntPtr window, IntPtr param);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr param);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr window, StringBuilder text, int limit);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    public static bool Close(uint processId) {
        IntPtr mainWindow = IntPtr.Zero;
        EnumWindows((window, ignored) => {
            GetWindowThreadProcessId(window, out uint owner);
            if (owner != processId) return true;
            var text = new StringBuilder(128);
            GetWindowText(window, text, text.Capacity);
            if (text.ToString() != "Re:Cooplay") return true;
            mainWindow = window;
            return false;
        }, IntPtr.Zero);
        return mainWindow != IntPtr.Zero && PostMessage(mainWindow, 0x0010, IntPtr.Zero, IntPtr.Zero);
    }
}
'@
if (-not [ReCooplayWindowProbe]::Close([uint32]$ProcessId)) {
    throw '試験用アプリのメインウィンドウへ終了要求を送れません'
}
