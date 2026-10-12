// One-line installers for OffStage Central.
// Files fetched with curl (Mac) or Invoke-WebRequest (Windows) are not quarantined / not marked as
// "downloaded from the internet", so the install runs without Gatekeeper / SmartScreen prompts.
// Access stays private: every command carries a short-lived token signed with SESSION_SECRET,
// bound to one tester, one product and one OS.
import crypto from 'node:crypto';
import { PRODUCTS } from './products.js';

const TTL_MIN = 30;
const sig = (data) => crypto.createHmac('sha256', process.env.SESSION_SECRET || '').update('install:' + data).digest('base64url').slice(0, 32);

export function makeInstallToken (email, product, os, minutes = TTL_MIN) {
  const payload = Buffer.from(JSON.stringify({ e: email, p: product, o: os, x: Date.now() + minutes * 60e3 })).toString('base64url');
  return `${payload}.${sig(payload)}`;
}

export function readInstallToken (t) {
  const [payload, s] = String(t || '').split('.');
  if (!payload || !s) return null;
  const good = sig(payload);
  if (good.length !== s.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(s))) return null;
  try {
    const { e, p, o, x } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return x > Date.now() ? { email: e, product: p, os: o } : null;
  } catch { return null; }
}

export function installCommand (site, token, os) {
  const url = `${site}/api/central/install?t=${token}`;
  return os === 'win' ? `irm '${url}' | iex` : `curl -fsSL '${url}' | bash`;
}

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;     // bash single-quote
const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;        // PowerShell single-quote

export function macScript (site, token, productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  const name = p ? p.name : 'OffStage';
  const url = `${site}/api/central/download?product=${encodeURIComponent(productId)}&os=mac&t=${token}`;
  return `#!/bin/bash
# OffStage Central — instalador para macOS de ${name}
# Todo va dentro de main() para que bash lea el script completo antes de ejecutarlo (curl | bash).
main() {
set -euo pipefail
NAME=${shq(name)}
URL=${shq(url)}
say() { printf '\\n\\033[1;31m▸\\033[0m %s\\n' "$1"; }
TMP="$(mktemp -d /tmp/offstage.XXXXXX)"
MNT=""
cleanup() { [ -n "$MNT" ] && hdiutil detach -quiet "$MNT" 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT

say "Instalando $NAME"
say "Descargando la última versión…"
curl -fL --progress-bar "$URL" -o "$TMP/dl.zip" || { echo "No se pudo descargar. El enlace caduca a los 30 minutos: genera uno nuevo en weareoffstage.pro/central"; exit 1; }
mkdir -p "$TMP/x"
ditto -x -k "$TMP/dl.zip" "$TMP/x"
for _ in 1 2 3; do
  find "$TMP/x" -name '*.zip' -not -path '*/__MACOSX/*' -print0 | while IFS= read -r -d '' z; do
    ditto -x -k "$z" "\${z%.zip}" && rm -f "$z"
  done
done

say "Para instalar, macOS te pedirá la contraseña de este Mac (no se ve al escribirla)."
sudo -v

PKG="$(find "$TMP/x" -name '*.pkg' -not -path '*/__MACOSX/*' | head -n 1)"
DMG="$(find "$TMP/x" -name '*.dmg' -not -path '*/__MACOSX/*' | head -n 1)"
if [ -n "$PKG" ]; then
  sudo installer -pkg "$PKG" -target /
elif [ -n "$DMG" ]; then
  MNT="$TMP/mnt"; mkdir -p "$MNT"
  hdiutil attach -nobrowse -quiet -mountpoint "$MNT" "$DMG"
  APP="$(find "$MNT" -maxdepth 2 -name '*.app' | head -n 1)"
  [ -n "$APP" ] || { echo "No encontré la aplicación dentro del .dmg"; exit 1; }
  DEST="/Applications/$(basename "$APP")"
  osascript -e "tell application \\"$(basename "$APP" .app)\\" to quit" >/dev/null 2>&1 || true
  sudo rm -rf "$DEST"
  sudo ditto "$APP" "$DEST"
  sudo xattr -cr "$DEST" || true
  codesign --verify --deep "$DEST" >/dev/null 2>&1 || sudo codesign --force --deep -s - "$DEST"
  echo "Instalado en $DEST"
else
  FOUND=0
  while IFS= read -r -d '' b; do
    case "$b" in
      *.vst3) D="/Library/Audio/Plug-Ins/VST3" ;;
      *.component) D="/Library/Audio/Plug-Ins/Components" ;;
      *) continue ;;
    esac
    sudo mkdir -p "$D"; sudo rm -rf "$D/$(basename "$b")"; sudo ditto "$b" "$D/$(basename "$b")"
    sudo xattr -cr "$D/$(basename "$b")" || true
    sudo codesign --force --deep -s - "$D/$(basename "$b")" >/dev/null 2>&1 || true
    echo "Instalado: $D/$(basename "$b")"; FOUND=1
  done < <(find "$TMP/x" \\( -name '*.vst3' -o -name '*.component' \\) -prune -print0)
  [ "$FOUND" = 1 ] || { echo "No encontré nada que instalar en la descarga."; exit 1; }
  killall -9 AudioComponentRegistrar >/dev/null 2>&1 || true
fi

say "Listo: $NAME instalado sin avisos de seguridad."
${productId === 'rack' ? 'open "${DEST:-/Applications/OffStage Rack.app}" >/dev/null 2>&1 || true' : 'echo "Abre tu DAW o el OffStage Rack y vuelve a escanear plugins."'}
}
main "$@"
`;
}

export function winScript (site, token, productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  const name = p ? p.name : 'OffStage';
  const url = `${site}/api/central/download?product=${encodeURIComponent(productId)}&os=win&t=${token}`;
  return `# OffStage Central — instalador para Windows de ${name}
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Name = ${psq(name)}
$Url = ${psq(url)}
function Say($m) { Write-Host ''; Write-Host ('> ' + $m) -ForegroundColor Red }
$Tmp = Join-Path $env:TEMP ('offstage-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Tmp | Out-Null
try {
  Say "Instalando $Name"
  Say 'Descargando la ultima version...'
  try { Invoke-WebRequest -Uri $Url -OutFile "$Tmp\\dl.zip" -UseBasicParsing }
  catch { Write-Host 'No se pudo descargar. El enlace caduca a los 30 minutos: genera uno nuevo en weareoffstage.pro/central'; return }
  Expand-Archive -Path "$Tmp\\dl.zip" -DestinationPath "$Tmp\\x" -Force
  $Setup = Get-ChildItem "$Tmp\\x" -Recurse -File -Filter *.exe | Where-Object { $_.Name -match 'setup|install' } | Select-Object -First 1
  if ($Setup) {
    Say 'Instalando (Windows te pedira permiso de administrador: pulsa Si)...'
    $p = Start-Process -FilePath $Setup.FullName -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-','/CLOSEAPPLICATIONS' -Verb RunAs -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "El instalador termino con codigo $($p.ExitCode)" }
  } else {
    for ($i = 0; $i -lt 3; $i++) {
      Get-ChildItem "$Tmp\\x" -Recurse -File -Filter *.zip | ForEach-Object {
        Expand-Archive -Path $_.FullName -DestinationPath ($_.FullName -replace '\\.zip$','') -Force; Remove-Item $_.FullName -Force }
    }
    $Bundles = Get-ChildItem "$Tmp\\x" -Recurse -Directory -Filter *.vst3 | Where-Object { $_.Parent.FullName -notmatch '\\.vst3' }
    if (-not $Bundles) { throw 'No encontre ningun plugin VST3 en la descarga.' }
    $Dest = Join-Path $env:CommonProgramFiles 'VST3'
    $cmds = @("New-Item -ItemType Directory -Force -Path '$Dest' | Out-Null")
    foreach ($b in $Bundles) {
      $target = Join-Path $Dest $b.Name
      $cmds += "if (Test-Path -LiteralPath '$target') { Remove-Item -LiteralPath '$target' -Recurse -Force }"
      $cmds += "Copy-Item -LiteralPath '$($b.FullName)' -Destination '$Dest' -Recurse -Force"
    }
    Say 'Copiando a la carpeta VST3 (Windows te pedira permiso de administrador: pulsa Si)...'
    $p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command', ($cmds -join '; ')
    if ($p.ExitCode -ne 0) { throw 'No se pudo copiar el plugin.' }
    $Bundles | ForEach-Object { Write-Host ('Instalado: ' + (Join-Path $Dest $_.Name)) }
  }
  Say "Listo: $Name instalado sin avisos de seguridad."
  ${productId === 'rack' ? "Write-Host 'Abrelo desde el menu Inicio: OffStage Rack.'" : "Write-Host 'Abre tu DAW o el OffStage Rack y vuelve a escanear plugins.'"}
} catch {
  Write-Host ''; Write-Host ('Error: ' + $_.Exception.Message) -ForegroundColor Yellow
  Write-Host 'Si no se soluciona, escribe a andres@weareoffstage.pro con una captura de esta ventana.'
} finally {
  Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue
}
`;
}
