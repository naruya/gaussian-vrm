# Capture one desktop window (matched by a substring of its title) to a PNG, without bringing it
# to the front. Unlike a CDP page screenshot this includes Chrome's own UI (infobars, dialogs).
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File grab.ps1 -Match "Google Chrome" -Out "C:\...\a.png" [-Index 0]
# Chrome has no single MainWindowHandle (multi-process), so all top-level windows are enumerated.
param([string]$Match, [string]$Out, [int]$Index = 0)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;using System.Text;using System.Collections.Generic;using System.Runtime.InteropServices;
public class Win {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc e, IntPtr p);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint f);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public static string[] Find(string m) {
    var found = new List<string>();
    EnumWindows((h, p) => {
      if (!IsWindowVisible(h)) return true;
      int n = GetWindowTextLength(h);
      if (n == 0) return true;
      var sb = new StringBuilder(n + 1);
      GetWindowText(h, sb, sb.Capacity);
      string t = sb.ToString();
      if (t.IndexOf(m, StringComparison.OrdinalIgnoreCase) >= 0) found.Add(h.ToInt64() + "|" + t);
      return true;
    }, IntPtr.Zero);
    return found.ToArray();
  }
}
"@
$hits = [Win]::Find($Match)
if ($hits.Length -eq 0) { Write-Output "NOTFOUND $Match"; exit 1 }
if ($Index -ge $hits.Length) { Write-Output "NOINDEX $Index / $($hits.Length)"; exit 1 }
$parts = $hits[$Index].Split('|', 2)
$h = [IntPtr][int64]$parts[0]; $title = $parts[1]
$r = New-Object 'Win+RECT'
[Win]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
if ($w -le 0 -or $ht -le 0) { Write-Output "BADRECT ${w}x${ht}"; exit 1 }
$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$dc = $g.GetHdc()
[Win]::PrintWindow($h, $dc, 2) | Out-Null
$g.ReleaseHdc($dc); $g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
Write-Output "OK ${w}x${ht} hits=$($hits.Length) :: $title"
