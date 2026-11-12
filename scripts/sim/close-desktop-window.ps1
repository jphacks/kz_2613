param([Parameter(Mandatory)][ValidateRange(1,2147483647)][int]$ProcessId, [switch]$MinimumSize)
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

    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int cx, int cy, uint flags);

    private static IntPtr FindMain(uint processId) {
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
        return mainWindow;
    }

    public static bool Close(uint processId) {
        var window = FindMain(processId);
        return window != IntPtr.Zero && PostMessage(window, 0x0010, IntPtr.Zero, IntPtr.Zero);
    }

    public static bool ResizeToMinimum(uint processId) {
        var window = FindMain(processId);
        if (window == IntPtr.Zero) return false;
        uint dpi = GetDpiForWindow(window);
        if (dpi == 0) return false;
        int width = (int)Math.Ceiling(800 * dpi / 96.0);
        int height = (int)Math.Ceiling(560 * dpi / 96.0);
        const uint noMoveNoZOrderNoActivate = 0x0002 | 0x0004 | 0x0010;
        return SetWindowPos(window, IntPtr.Zero, 0, 0, width, height, noMoveNoZOrderNoActivate);
    }
}
'@
if ($MinimumSize) {
    if (-not [ReCooplayWindowProbe]::ResizeToMinimum([uint32]$ProcessId)) {
        throw '試験用アプリのメインウィンドウを最小サイズに変更できません'
    }
    exit
}
if (-not [ReCooplayWindowProbe]::Close([uint32]$ProcessId)) {
    throw '試験用アプリのメインウィンドウへ終了要求を送れません'
}
