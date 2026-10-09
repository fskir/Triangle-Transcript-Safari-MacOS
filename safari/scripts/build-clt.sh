#!/bin/bash
# Measured alternative for this Mac's CLT Swift 6.4 / macOS SDK 27. No Xcode output is simulated.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SDK="$(xcrun --sdk macosx --show-sdk-path)"
VERSION="$(xcrun --sdk macosx --show-sdk-version)"
[[ "${VERSION%%.*}" -ge 26 ]] || { echo 'macOS SDK 26+ required' >&2; exit 2; }
ARCH="${TRIANGLE_BUILD_ARCH:-$(uname -m)}"
[[ "$ARCH" == arm64 || "$ARCH" == x86_64 ]] || { echo "Unsupported Mac architecture: $ARCH" >&2; exit 3; }
STAGE="$ROOT/.qa-work/clt-build"
APP="$STAGE/Triangle Transcript.app"
APPEX="$APP/Contents/PlugIns/Triangle Transcript Extension.appex"
mkdir -p "$APP/Contents/MacOS" "$APPEX/Contents/MacOS" "$APPEX/Contents/Resources" "$ROOT/.qa-work/swift-module-cache"
xcrun swiftc -sdk "$SDK" -target "$ARCH-apple-macosx26.0" -parse-as-library -module-name TriangleTranscriptSafari -module-cache-path "$ROOT/.qa-work/swift-module-cache" "$ROOT/safari/xcode/Native/TriangleApp.swift" -o "$APP/Contents/MacOS/Triangle Transcript"
# Foundation exports the normal macOS app-extension entry point. This creates an
# executable, not a dylib renamed to .appex. Deployment/registration must be tested.
xcrun swiftc -sdk "$SDK" -target "$ARCH-apple-macosx26.0" -parse-as-library -application-extension -module-name TriangleTranscriptSafari_Extension -module-cache-path "$ROOT/.qa-work/swift-module-cache" -Xlinker -e -Xlinker _NSExtensionMain "$ROOT/safari/xcode/Native/SafariWebExtensionHandler.swift" -o "$APPEX/Contents/MacOS/Triangle Transcript Extension"
python3 - "$ROOT" "$APP" "$APPEX" <<'PY'
import pathlib, plistlib, sys
root, app, appex = map(pathlib.Path, sys.argv[1:])
for bundle, source, name, identifier, module in [
    (app, 'AppInfo.plist', 'Triangle Transcript', 'com.fskir.TriangleTranscriptSafari', 'TriangleTranscriptSafari'),
    (appex, 'ExtensionInfo.plist', 'Triangle Transcript Extension', 'com.fskir.TriangleTranscriptSafari.Extension', 'TriangleTranscriptSafari_Extension')]:
    info=plistlib.loads((root/'safari/xcode/Native'/source).read_bytes())
    variables={'DEVELOPMENT_LANGUAGE':'ru','EXECUTABLE_NAME':name,'PRODUCT_NAME':name,'PRODUCT_BUNDLE_IDENTIFIER':identifier,'MACOSX_DEPLOYMENT_TARGET':'26.0','PRODUCT_MODULE_NAME':module}
    def expand(value):
        if isinstance(value,dict): return {key:expand(v) for key,v in value.items()}
        if isinstance(value,list): return [expand(v) for v in value]
        if isinstance(value,str):
            for key,v in variables.items(): value=value.replace('$('+key+')',v)
        return value
    info=expand(info);info['CFBundleSupportedPlatforms']=['MacOSX'];info['CFBundleDisplayName']=name
    (bundle/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
PY
ditto "$ROOT/safari/extension" "$APPEX/Contents/Resources"
codesign --force --sign - --entitlements "$ROOT/safari/xcode/Native/Sandbox.entitlements" "$APPEX"
codesign --force --sign - --entitlements "$ROOT/safari/xcode/Native/Sandbox.entitlements" "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

mkdir -p "$ROOT/dist"
ditto "$APP" "$ROOT/dist/Triangle Transcript.app"
echo "CLT build: $ROOT/dist/Triangle Transcript.app ($ARCH, SDK $VERSION, ad-hoc signing)"
echo 'No Xcode/packager was run. This app must be launched and its embedded extension verified in Safari.'
