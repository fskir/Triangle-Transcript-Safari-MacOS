#!/usr/bin/env python3
"""Create the small editable macOS-only wrapper. Compilation needs full Xcode."""
from pathlib import Path
import hashlib, json, plistlib
from xml.sax.saxutils import escape
root = Path(__file__).resolve().parents[1] / 'xcode'
project = root / 'Triangle Transcript.xcodeproj'
objects = {}
def ident(name): return hashlib.sha256(name.encode()).hexdigest()[:24].upper()
def obj(keyname, **fields):
    key = ident(keyname); objects[key] = fields; return key

def resource(path, folder=False):
    ref = obj('res:' + path, isa='PBXFileReference', lastKnownFileType='folder' if folder else ('text.json' if path.endswith('.json') else 'text' if path.endswith('.md') else 'sourcecode.javascript' if path.endswith('.js') else 'text.html' if path.endswith('.html') else 'text.css' if path.endswith('.css') else 'text'), path='../extension/' + path, sourceTree='SOURCE_ROOT')
    build = obj('res-build:' + path, isa='PBXBuildFile', fileRef=ref)
    return ref, build
resources = [resource(p.name,p.is_dir()) for p in sorted((root.parent/'extension').iterdir()) if p.name != '.DS_Store']
appSource = obj('AppSwift',isa='PBXFileReference',lastKnownFileType='sourcecode.swift',path='Native/TriangleApp.swift',sourceTree='SOURCE_ROOT')
extSource = obj('ExtensionSwift',isa='PBXFileReference',lastKnownFileType='sourcecode.swift',path='Native/SafariWebExtensionHandler.swift',sourceTree='SOURCE_ROOT')
appProduct = obj('AppProduct',isa='PBXFileReference',explicitFileType='wrapper.application',includeInIndex=0,path='Triangle Transcript.app',sourceTree='BUILT_PRODUCTS_DIR')
extProduct = obj('ExtProduct',isa='PBXFileReference',explicitFileType='wrapper.app-extension',includeInIndex=0,path='Triangle Transcript Extension.appex',sourceTree='BUILT_PRODUCTS_DIR')
appSourceBuild = obj('AppSourceBuild',isa='PBXBuildFile',fileRef=appSource)
extSourceBuild = obj('ExtSourceBuild',isa='PBXBuildFile',fileRef=extSource)
embedBuild = obj('EmbedBuild',isa='PBXBuildFile',fileRef=extProduct,settings={'ATTRIBUTES':['RemoveHeadersOnCopy','CodeSignOnCopy']})
def phase(keyname, isa, files, **fields): return obj(keyname,isa=isa,buildActionMask=2147483647,files=files,runOnlyForDeploymentPostprocessing=0,**fields)
appSources = phase('AppSources','PBXSourcesBuildPhase',[appSourceBuild])
extSources = phase('ExtSources','PBXSourcesBuildPhase',[extSourceBuild])
appResources = phase('AppResources','PBXResourcesBuildPhase',[])
extResources = phase('ExtResources','PBXResourcesBuildPhase',[r[1] for r in resources])
appFrameworks = phase('AppFrameworks','PBXFrameworksBuildPhase',[])
extFrameworks = phase('ExtFrameworks','PBXFrameworksBuildPhase',[])
embed = phase('Embed','PBXCopyFilesBuildPhase',[embedBuild],dstPath='',dstSubfolderSpec=13,name='Embed App Extensions')
def configs(name, scope):
    ids=[]
    for config in ['Debug','Release']:
        settings = {'SDKROOT':'macosx','MACOSX_DEPLOYMENT_TARGET':'26.0','SWIFT_VERSION':'5.0','CLANG_ENABLE_MODULES':'YES'}
        if scope:
            settings.update({'PRODUCT_NAME':'$(TARGET_NAME)','PRODUCT_BUNDLE_IDENTIFIER':'com.fskir.TriangleTranscriptSafari' + ('.Extension' if scope=='extension' else ''),'CODE_SIGN_STYLE':'Manual','CODE_SIGN_IDENTITY':'-','DEVELOPMENT_TEAM':'','GENERATE_INFOPLIST_FILE':'NO','INFOPLIST_FILE':'Native/ExtensionInfo.plist' if scope=='extension' else 'Native/AppInfo.plist','CODE_SIGN_ENTITLEMENTS':'Native/Sandbox.entitlements','SWIFT_OPTIMIZATION_LEVEL':'-Onone' if config=='Debug' else '-O','LD_RUNPATH_SEARCH_PATHS':['$(inherited)','@executable_path/../Frameworks','@executable_path/../../../../Frameworks']})
            if scope=='extension': settings.update({'APPLICATION_EXTENSION_API_ONLY':'YES','SKIP_INSTALL':'YES'})
        ids.append(obj(name+config,isa='XCBuildConfiguration',buildSettings=settings,name=config))
    return obj(name,isa='XCConfigurationList',buildConfigurations=ids,defaultConfigurationIsVisible=0,defaultConfigurationName='Release')
projectConfig = configs('ProjectConfig',None)
appConfig = configs('AppConfig','app'); extConfig = configs('ExtConfig','extension')
projectId = ident('Project')
extTarget = obj('ExtTarget',isa='PBXNativeTarget',buildConfigurationList=extConfig,buildPhases=[extSources,extFrameworks,extResources],buildRules=[],dependencies=[],name='Triangle Transcript Extension',productName='Triangle Transcript Extension',productReference=extProduct,productType='com.apple.product-type.app-extension')
proxy = obj('Proxy',isa='PBXContainerItemProxy',containerPortal=projectId,proxyType=1,remoteGlobalIDString=extTarget,remoteInfo='Triangle Transcript Extension')
dependency = obj('Dependency',isa='PBXTargetDependency',target=extTarget,targetProxy=proxy)
appTarget = obj('AppTarget',isa='PBXNativeTarget',buildConfigurationList=appConfig,buildPhases=[appSources,appFrameworks,appResources,embed],buildRules=[],dependencies=[dependency],name='Triangle Transcript',productName='Triangle Transcript',productReference=appProduct,productType='com.apple.product-type.application')
products = obj('Products',isa='PBXGroup',children=[appProduct,extProduct],name='Products',sourceTree='<group>')
mainGroup = obj('MainGroup',isa='PBXGroup',children=[appSource,extSource,*[r[0] for r in resources],products],sourceTree='<group>')
obj('Project',isa='PBXProject',attributes={'LastUpgradeCheck':'1600','LastSwiftUpdateCheck':'1600'},buildConfigurationList=projectConfig,compatibilityVersion='Xcode 14.0',developmentRegion='ru',hasScannedForEncodings=0,knownRegions=['ru','en','Base'],mainGroup=mainGroup,productRefGroup=products,projectDirPath='',projectRoot='',targets=[appTarget,extTarget])
def openstep(value,level=0):
    indent='\t'*level
    if isinstance(value,dict): return '{\n'+'\n'.join('\t'*(level+1)+json.dumps(str(k))+' = '+openstep(v,level+1)+';' for k,v in value.items())+'\n'+indent+'}'
    if isinstance(value,list): return '('+','.join(openstep(v,level) for v in value)+')'
    if isinstance(value,int): return str(value)
    return json.dumps(value,ensure_ascii=False)
project.mkdir(parents=True,exist_ok=True)
(project/'project.pbxproj').write_text('// !$*UTF8*$!\n'+openstep({'archiveVersion':1,'classes':{},'objectVersion':56,'objects':objects,'rootObject':projectId})+'\n')
schemes=project/'xcshareddata/xcschemes';schemes.mkdir(parents=True,exist_ok=True)
(schemes/'Triangle Transcript.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{appTarget}" BuildableName="Triangle Transcript.app" BlueprintName="Triangle Transcript" ReferencedContainer="container:Triangle Transcript.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{appTarget}" BuildableName="Triangle Transcript.app" BlueprintName="Triangle Transcript" ReferencedContainer="container:Triangle Transcript.xcodeproj"/></BuildableProductRunnable></LaunchAction><ProfileAction buildConfiguration="Release"/><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>
''')
base={'CFBundleDevelopmentRegion':'$(DEVELOPMENT_LANGUAGE)','CFBundleExecutable':'$(EXECUTABLE_NAME)','CFBundleIdentifier':'$(PRODUCT_BUNDLE_IDENTIFIER)','CFBundleInfoDictionaryVersion':'6.0','CFBundleName':'$(PRODUCT_NAME)','CFBundleShortVersionString':'1.1.3','CFBundleVersion':'5','LSMinimumSystemVersion':'$(MACOSX_DEPLOYMENT_TARGET)'}
(root/'Native').mkdir(exist_ok=True)
for filename,extra in [('AppInfo.plist',{'CFBundlePackageType':'APPL','NSPrincipalClass':'NSApplication','NSHighResolutionCapable':True}),('ExtensionInfo.plist',{'CFBundlePackageType':'XPC!','NSExtension':{'NSExtensionPointIdentifier':'com.apple.Safari.web-extension','NSExtensionPrincipalClass':'$(PRODUCT_MODULE_NAME).SafariWebExtensionHandler'}}),('Sandbox.entitlements',{'com.apple.security.app-sandbox':True})]:
    (root/'Native'/filename).write_bytes(plistlib.dumps(extra if filename.endswith('.entitlements') else {**base,**extra}))
print(project)
