Add-Type @"
using System; using System.Runtime.InteropServices;
public class C2 { [StructLayout(LayoutKind.Sequential)] public struct P { public int X; public int Y; }
[DllImport("user32.dll")] public static extern bool GetCursorPos(out P p);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
"@
[C2]::SetProcessDPIAware() | Out-Null
while ($true) { $l = [Console]::In.ReadLine(); if ($l -eq $null) { break }
  $p = New-Object C2+P; [C2]::GetCursorPos([ref]$p) | Out-Null; [Console]::Out.WriteLine("cursor $($p.X) $($p.Y)"); [Console]::Out.Flush() }
