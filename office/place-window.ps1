# Opens Claude's studio as an app window and puts it in the top-right quarter (or the right half) of the screen the
# person is working on, then gives the keyboard back to the window they were using (their terminal).
#
#   place-window.ps1 -Url <page> [-Browser <msedge.exe>] [-Place top-right|right] [-Title <window title>] [-Launch]
#
# -Launch always opens a new window (a new session). Without it, a window that already has -Title is moved and
# raised instead of opening another one (the /office command).

param(
  [Parameter(Mandatory = $true)][string]$Url,
  [string]$Browser = '',
  [ValidateSet('top-right', 'right')][string]$Place = 'top-right',
  [string]$Title = "Claude's studio",
  [switch]$Launch
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

namespace ClaudeStudio {
  public static class Win {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public int dwFlags; }
    public delegate bool EnumProc(IntPtr h, IntPtr l);

    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, int flags);
    [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint flags);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);

    // Visible top-level windows whose title is `title` (exact) or starts with it.
    public static List<IntPtr> Find(string title, bool exact) {
      List<IntPtr> found = new List<IntPtr>();
      EnumWindows(delegate (IntPtr h, IntPtr l) {
        if (!IsWindowVisible(h)) return true;
        StringBuilder sb = new StringBuilder(512);
        GetWindowText(h, sb, 512);
        string t = sb.ToString();
        if (exact ? t == title : t.StartsWith(title)) found.Add(h);
        return true;
      }, IntPtr.Zero);
      return found;
    }

    // The work area (the screen minus the taskbar) of the monitor nearest to a window.
    public static RECT WorkArea(IntPtr near) {
      MONITORINFO mi = new MONITORINFO();
      mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
      GetMonitorInfo(MonitorFromWindow(near, 2), ref mi);
      return mi.rcWork;
    }

    // Puts a window exactly on (x, y, w, h), allowing for the invisible resize borders Windows adds around it.
    public static void Place(IntPtr h, int x, int y, int w, int hh) {
      ShowWindow(h, 9); // restore, in case it opened maximised
      SetWindowPos(h, IntPtr.Zero, x, y, w, hh, 0x0014); // no z-order change, no activation
      RECT outer;
      RECT frame;
      if (GetWindowRect(h, out outer) && DwmGetWindowAttribute(h, 9, out frame, Marshal.SizeOf(typeof(RECT))) == 0) {
        int l = frame.Left - outer.Left, t = frame.Top - outer.Top, r = outer.Right - frame.Right, b = outer.Bottom - frame.Bottom;
        SetWindowPos(h, IntPtr.Zero, x - l, y - t, w + l + r, hh + t + b, 0x0014);
      }
    }

    // Whether a window's visible frame is already on (x, y, w, h), give or take a few pixels.
    public static bool IsAt(IntPtr h, int x, int y, int w, int hh) {
      RECT f;
      if (DwmGetWindowAttribute(h, 9, out f, Marshal.SizeOf(typeof(RECT))) != 0) return false;
      return Math.Abs(f.Left - x) <= 3 && Math.Abs(f.Top - y) <= 3 && Math.Abs(f.Right - (x + w)) <= 3 && Math.Abs(f.Bottom - (y + hh)) <= 3;
    }

    public static string TitleOf(IntPtr h) {
      StringBuilder sb = new StringBuilder(512);
      GetWindowText(h, sb, 512);
      return sb.ToString();
    }

    // Gives the keyboard back to a window, borrowing the current foreground thread's right to do so.
    public static void Focus(IntPtr h) {
      uint fg = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
      uint me = GetCurrentThreadId();
      AttachThreadInput(me, fg, true);
      SetForegroundWindow(h);
      AttachThreadInput(me, fg, false);
    }
  }
}
'@

# what happened on the last run, for when the window does not land where it should
$logFile = Join-Path $env:TEMP 'claude-studio-window.log'
function Log([string]$text) { Add-Content -Path $logFile -Value ((Get-Date).ToString('HH:mm:ss.fff') + ' ' + $text) -Encoding UTF8 }
Set-Content -Path $logFile -Value "place-window: Place=$Place Launch=$Launch Title=$Title" -Encoding UTF8
trap { Log ("error: " + $_); exit 1 }

[void][ClaudeStudio.Win]::SetProcessDPIAware()
$prefix = "Claude's studio"
$before = [ClaudeStudio.Win]::GetForegroundWindow()
$area = [ClaudeStudio.Win]::WorkArea($before)
$width = [int][Math]::Floor(($area.Right - $area.Left) / 2)
$height = if ($Place -eq 'right') { $area.Bottom - $area.Top } else { [int][Math]::Floor(($area.Bottom - $area.Top) / 2) }
$x = $area.Right - $width
$y = $area.Top
Log ("foreground '" + [ClaudeStudio.Win]::TitleOf($before) + "'; target x=$x y=$y w=$width h=$height")

$window = [IntPtr]::Zero
if (-not $Launch) {
  $existing = [ClaudeStudio.Win]::Find($Title, $true)
  if ($existing.Count -gt 0) { $window = $existing[0] }
}

if ($window -eq [IntPtr]::Zero) {
  $old = [ClaudeStudio.Win]::Find($prefix, $false)
  if (-not $Browser) {
    Start-Process $Url
    exit 0
  }
  Start-Process -FilePath $Browser -ArgumentList "--app=$Url"
  # wait for the new window: it takes the page's title once the page has loaded
  $deadline = (Get-Date).AddSeconds(25)
  while ($window -eq [IntPtr]::Zero -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 150
    foreach ($h in [ClaudeStudio.Win]::Find($prefix, $false)) {
      if (-not $old.Contains($h)) { $window = $h; break }
    }
  }
  if ($window -eq [IntPtr]::Zero) {
    Log 'no new window appeared'
    exit 0
  }
  Log ("new window '" + [ClaudeStudio.Win]::TitleOf($window) + "'")
  # the page sets the full title once its script runs; the browser applies its own size around then
  while ([ClaudeStudio.Win]::TitleOf($window) -ne $Title -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 150 }
  Log ("title now '" + [ClaudeStudio.Win]::TitleOf($window) + "'")
}

# The browser may still move, resize or activate the window just after it opens: keep putting it back (and the
# keyboard back to the terminal) for at least six seconds and until it has stayed put for two, at most twelve.
$giveBack = $before -ne [IntPtr]::Zero -and $before -ne $window
$watchAtLeast = (Get-Date).AddSeconds(6)
$settle = (Get-Date).AddSeconds(12)
$still = 0
while (($still -lt 10 -or (Get-Date) -lt $watchAtLeast) -and (Get-Date) -lt $settle) {
  if ([ClaudeStudio.Win]::IsAt($window, $x, $y, $width, $height)) { $still++ }
  else {
    Log 'placing'
    [ClaudeStudio.Win]::Place($window, $x, $y, $width, $height)
    $still = 0
  }
  if ($giveBack -and [ClaudeStudio.Win]::GetForegroundWindow() -eq $window) {
    Log 'giving the keyboard back'
    [ClaudeStudio.Win]::Focus($before)
  }
  Start-Sleep -Milliseconds 200
}
Log ("done; in place: " + [ClaudeStudio.Win]::IsAt($window, $x, $y, $width, $height))
