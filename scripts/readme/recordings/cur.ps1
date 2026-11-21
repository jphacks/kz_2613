Add-Type @"
using System; using System.Runtime.InteropServices;
public class C { [StructLayout(LayoutKind.Sequential)] public struct P { public int X; public int Y; }
[DllImport("user32.dll")] public static extern bool GetCursorPos(out P p);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
[DllImport("user32.dll")] public static extern IntPtr FindWindow(string c,string t);
[StructLayout(LayoutKind.Sequential)] public struct R { public int L,T,Rt,B; }
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out R r); }
"@
[C]::SetProcessDPIAware() | Out-Null
if ($args.Count -ge 2) { [C]::SetCursorPos([int]$args[0],[int]$args[1]) | Out-Null }
$p = New-Object C+P; [C]::GetCursorPos([ref]$p) | Out-Null; "cursor $($p.X) $($p.Y)"
$h=(Get-Process recooplay-desktop).MainWindowHandle; $r=New-Object C+R; [C]::GetWindowRect($h,[ref]$r)|Out-Null; "win $($r.L) $($r.T) $($r.Rt) $($r.B)"
