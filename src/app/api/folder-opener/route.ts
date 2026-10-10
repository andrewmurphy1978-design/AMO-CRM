import { auth } from "@/lib/auth";

// GET /api/folder-opener?os=windows|linux: a tiny one-time setup that lets a click on a Folder link in the CRM open
// that folder in the computer's file manager. A web page can't open a folder by itself, so the computer is taught
// the link type amo-folder://. The handler only opens folders that exist (never a file or a program).
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const os = new URL(request.url).searchParams.get("os");

  if (os === "windows") {
    const cmd = `powershell.exe -NoProfile -WindowStyle Hidden -Command "$u='%1'; $p=[uri]::UnescapeDataString($u.Substring($u.IndexOf('path=')+5)).TrimEnd('/'); if (Test-Path -LiteralPath $p -PathType Container) { Invoke-Item -LiteralPath $p }"`;
    const reg = [
      "Windows Registry Editor Version 5.00",
      "",
      "[HKEY_CURRENT_USER\\Software\\Classes\\amo-folder]",
      '@="URL:AMO CRM folder"',
      '"URL Protocol"=""',
      "",
      "[HKEY_CURRENT_USER\\Software\\Classes\\amo-folder\\shell\\open\\command]",
      `@="${cmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
      "",
    ].join("\r\n");
    return new Response(reg, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": 'attachment; filename="amo-crm-open-folders-windows.reg"' } });
  }

  if (os === "linux") {
    const sh = `#!/bin/sh
# AMO CRM: lets a click on a Folder link open that folder in your file manager.
mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications"
cat > "$HOME/.local/bin/amo-open-folder" <<'EOS'
#!/bin/sh
p=$(printf '%s' "$1" | sed 's/^amo-folder:\\/\\/[^?]*?path=//' | python3 -c 'import sys,urllib.parse;print(urllib.parse.unquote(sys.stdin.read().strip()).rstrip("/"))')
[ -d "$p" ] && xdg-open "$p"
EOS
chmod +x "$HOME/.local/bin/amo-open-folder"
cat > "$HOME/.local/share/applications/amo-folder.desktop" <<EOS
[Desktop Entry]
Name=AMO CRM folder opener
Exec=$HOME/.local/bin/amo-open-folder %u
Type=Application
NoDisplay=true
MimeType=x-scheme-handler/amo-folder;
EOS
xdg-mime default amo-folder.desktop x-scheme-handler/amo-folder
echo "Done: Folder links in the CRM now open in your file manager."
`;
    return new Response(sh, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": 'attachment; filename="amo-crm-open-folders-linux.sh"' } });
  }
  return new Response("Use ?os=windows or ?os=linux", { status: 400 });
}
