#!/usr/bin/env python3
"""Compile the actual window state class/module and verbatim Activity callbacks.

Android/React public APIs are deterministic host doubles, not an emulator proof.
The existing model harness supplies only its initial public-API doubles; it is
parsed as data and never executed. No Gradle, network, wallet data or device used.
"""
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT / 'android/app/src/main/java'
layout = NATIVE / 'com/xrpllabs/xumm/AndroidWindowLayout.java'
launch = NATIVE / 'com/xrpllabs/xumm/LaunchActivity.java'
module = NATIVE / 'libs/utils/DeviceUtilsModule.java'
source = launch.read_text()


def methods(name):
    found = []
    pattern = r'    (?:public|protected) [^\n]+ ' + name + r'\('
    for match in re.finditer(pattern, source):
        start = source.index('{', match.start())
        end, depth = start + 1, 1
        while depth:
            depth += (source[end] == '{') - (source[end] == '}')
            end += 1
        found.append(source[match.start():end])
    return '\n'.join(found)


def field(name):
    match = re.search(r'    private [^;]+\b' + name + r'\b[^;]*;', source)
    if not match:
        raise RuntimeError('Missing actual field: ' + name)
    return match.group()


tree = ast.parse((ROOT / 'scripts/test-android-window-layout.py').read_text())
stubs = next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign)
             and any(isinstance(target, ast.Name) and target.id == 'stubs' for target in node.targets))
stubs.update({
    'android/graphics/Rect.java': '''package android.graphics; public class Rect {
      public int w,h; public Rect(int w,int h){this.w=w;this.h=h;}
      public int width(){return w;} public int height(){return h;}
    }''',
    'android/view/WindowMetrics.java': '''package android.view; public class WindowMetrics {
      public final android.graphics.Rect bounds=new android.graphics.Rect(1080,2400);
      public android.graphics.Rect getBounds(){return bounds;}
    }''',
    'android/view/WindowManager.java': '''package android.view; public class WindowManager {
      public final WindowMetrics metrics=new WindowMetrics(); public boolean fail;
      public WindowMetrics getCurrentWindowMetrics(){if(fail)throw new IllegalStateException();return metrics;}
    }''',
    'android/view/Window.java': '''package android.view; public class Window {
      public final View decor=new View(); public View getDecorView(){return decor;}
    }''',
    'android/view/View.java': '''package android.view; import java.util.*; public class View {
      public int width=1080,height=2400; public boolean attached=true;
      public interface OnLayoutChangeListener {void onLayoutChange(View v,int l,int t,int r,int b,int ol,int ot,int or,int ob);}
      public final List<OnLayoutChangeListener> listeners=new ArrayList<>();
      public void addOnLayoutChangeListener(OnLayoutChangeListener l){listeners.add(l);}
      public void removeOnLayoutChangeListener(OnLayoutChangeListener l){listeners.remove(l);}
      public void layout(int w,int h){int ow=width,oh=height;width=w;height=h;
        for(OnLayoutChangeListener l:new ArrayList<>(listeners))l.onLayoutChange(this,0,0,w,h,0,0,ow,oh);}
      public int getWidth(){return width;} public int getHeight(){return height;}
      public boolean isAttachedToWindow(){return attached;}
    }''',
    'android/app/Activity.java': '''package android.app; public class Activity extends android.content.Context {
      public boolean multiWindow,finishing,destroyed,seededBeforeSuper; public int requestedOrientation=-1,superResumes,superConfigs,superMulti;
      public final android.view.Window window=new android.view.Window();
      public final android.view.WindowManager manager=new android.view.WindowManager();
      public boolean isInMultiWindowMode(){if(android.os.Build.VERSION.SDK_INT<24)throw new AssertionError("pre24");return multiWindow;}
      public boolean isFinishing(){return finishing;} public boolean isDestroyed(){return destroyed;}
      public android.view.Window getWindow(){return window;} public android.view.WindowManager getWindowManager(){return manager;}
      protected void onCreate(android.os.Bundle b){seededBeforeSuper=com.xrpllabs.xumm.AndroidWindowLayout.currentWindowState()!=null;}
      protected void onDestroy(){destroyed=true;} protected void onResume(){superResumes++;}
      public void onConfigurationChanged(android.content.res.Configuration c){superConfigs++;}
      public void onMultiWindowModeChanged(boolean m){superMulti++;}
      public void onMultiWindowModeChanged(boolean m,android.content.res.Configuration c){superMulti++;}
      public boolean isTaskRoot(){return true;} public void finish(){finishing=true;}
      public void setRequestedOrientation(int value){requestedOrientation=value;}
    }''',
    'android/content/res/Resources.java': '''package android.content.res; public class Resources {
      public final android.util.DisplayMetrics metrics=new android.util.DisplayMetrics();
      public android.util.DisplayMetrics getDisplayMetrics(){return metrics;}
      public int getIdentifier(String a,String b,String c){return 1;}
      public int getDimensionPixelSize(int id){return 63;}
      public Configuration getConfiguration(){return new Configuration();}
    }''',
    'android/content/res/Configuration.java': '''package android.content.res; public class Configuration {
      public android.os.LocaleList getLocales(){return new android.os.LocaleList();}
    }''',
    'android/os/LocaleList.java': '''package android.os; public class LocaleList {
      public java.util.Locale get(int i){return java.util.Locale.ENGLISH;}
    }''',
    'android/os/Bundle.java': 'package android.os; public class Bundle {}',
    'android/os/SystemClock.java': 'package android.os; public class SystemClock {public static long elapsedRealtime(){return 1;}}',
    'androidx/annotation/Nullable.java': 'package androidx.annotation; public @interface Nullable {}',
    'androidx/annotation/NonNull.java': 'package androidx.annotation; public @interface NonNull {}',
    'com/facebook/react/module/annotations/ReactModule.java': 'package com.facebook.react.module.annotations; public @interface ReactModule {String name();}',
    'com/facebook/react/bridge/ReactMethod.java': 'package com.facebook.react.bridge; public @interface ReactMethod {}',
    'com/facebook/react/bridge/Promise.java': '''package com.facebook.react.bridge; public interface Promise {
      void resolve(Object value); default void reject(Throwable t){throw new AssertionError(t);}
    }''',
    'com/facebook/react/bridge/WritableMap.java': '''package com.facebook.react.bridge;
      public class WritableMap extends java.util.HashMap<String,Object> {
        public void putString(String k,String v){put(k,v);}
      }''',
    'com/facebook/react/bridge/Arguments.java': '''package com.facebook.react.bridge; public class Arguments {
      public static WritableMap createMap(){return new WritableMap();}
      public static WritableMap makeNativeMap(java.util.Map<String,Object> input){WritableMap m=createMap();m.putAll(input);return m;}
    }''',
    'com/facebook/react/bridge/UiThreadUtil.java': '''package com.facebook.react.bridge; import java.util.*;
      public class UiThreadUtil {public static final List<Runnable> queue=new ArrayList<>();
        public static void runOnUiThread(Runnable r){queue.add(r);}
        public static void drain(){while(!queue.isEmpty())queue.remove(0).run();}}
    ''',
    'com/facebook/react/modules/core/DeviceEventManagerModule.java': '''package com.facebook.react.modules.core;
      public class DeviceEventManagerModule {public interface RCTDeviceEventEmitter {void emit(String name,Object value);}}
    ''',
    'com/facebook/react/bridge/ReactApplicationContext.java': '''package com.facebook.react.bridge;
      import com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter; import java.util.*;
      public class ReactApplicationContext extends android.content.Context {
        public android.app.Activity activity; public boolean active=true;
        public final List<Object> events=new ArrayList<>(); public final List<String> names=new ArrayList<>();
        public boolean hasActiveReactInstance(){return active;}
        public <T>T getJSModule(Class<T> type){return type.cast((RCTDeviceEventEmitter)(name,value)->{names.add(name);events.add(value);});}
      }''',
    'com/facebook/react/bridge/ReactContextBaseJavaModule.java': '''package com.facebook.react.bridge;
      public class ReactContextBaseJavaModule {final ReactApplicationContext context;
        public ReactContextBaseJavaModule(ReactApplicationContext c){context=c;}
        public String getName(){return "";} public java.util.Map<String,Object> getConstants(){return null;}
        public void initialize(){} public void invalidate(){}
        public ReactApplicationContext getReactApplicationContext(){return context;}
        public android.app.Activity getCurrentActivity(){return context.activity;}
      }''',
    'com/facebook/react/uimanager/PixelUtil.java': '''package com.facebook.react.uimanager;
      public class PixelUtil {public static float toDIPFromPixel(float value){return value/2.625f;}}
    ''',
    'com/xrpllabs/xumm/SafeAreaInsets.java': '''package com.xrpllabs.xumm;
      public class SafeAreaInsets {public static int getSafeAreaTop(){return 63;} public static int getSafeAreaBottom(){return 0;}}
    ''',
    'libs/security/authentication/Biometric/BiometricModule.java': '''package libs.security.authentication.Biometric;
      public class BiometricModule {public static void initialise(){}}
    ''',
})
stubs['android/os/Build.java'] = stubs['android/os/Build.java'].replace(
    'public static String BRAND="fixture", MODEL="fixture";',
    'public static String BRAND="fixture", MODEL="fixture",FINGERPRINT="fixture",HARDWARE="fixture",PRODUCT="fixture";')
stubs['android/content/pm/PackageManager.java'] += '\n'
stubs['android/content/pm/ActivityInfo.java'] = 'package android.content.pm; public class ActivityInfo {public static int SCREEN_ORIENTATION_PORTRAIT=1;}'

activity = '''package com.xrpllabs.xumm;
import android.content.pm.ActivityInfo; import android.content.res.Configuration; import android.os.Bundle; import android.view.View;
import androidx.annotation.Nullable; import java.lang.ref.WeakReference; import libs.security.authentication.Biometric.BiometricModule;
public class LaunchActivity extends android.app.Activity {
  FIELDS
  public static double column;public static void setAndroidWindowColumnWidth(double width){column=width;}
  public static void hideLaunchSplashIfPresent(){}
  private void seedInsetsFromResources(){} private void finishOtherXamanTasks(){} private void setSplashLayout(){}
  public void create(){onCreate(null);} public void destroy(){onDestroy();} public void resume(){onResume();}
  METHODS
}
'''.replace('FIELDS', '\n'.join(field(name) for name in ['currentLaunch', 'windowStateDecor', 'windowStateLayoutListener']))
activity = activity.replace('METHODS', '\n'.join(methods(name) for name in [
    'onCreate', 'onDestroy', 'onResume', 'onConfigurationChanged', 'onMultiWindowModeChanged']))

probe = r'''
package com.xrpllabs.xumm;
import android.app.Activity; import android.os.Build; import android.content.res.Configuration;
import com.facebook.react.bridge.*; import libs.utils.DeviceUtilsModule; import java.util.*;
public class MultiWindowProbe {
  static int assertions;static void check(String name,boolean value){assertions++;if(!value)throw new AssertionError(name);System.out.println(name+":true");}
  static boolean near(double a,double b){return Math.abs(a-b)<1e-8;}
  static LaunchActivity activity(boolean split,int w,int h){LaunchActivity a=new LaunchActivity();a.multiWindow=split;
    bounds(a,w,h);a.displays.display=new android.view.Display(1768,2208);return a;}
  static void bounds(Activity a,int w,int h){a.manager.metrics.bounds.w=w;a.manager.metrics.bounds.h=h;a.window.decor.width=w;a.window.decor.height=h;}
  static Map<?,?> value(Object x){return (Map<?,?>)x;}
  static double number(Object x,String key){return ((Number)value(x).get(key)).doubleValue();}
  static class Result implements Promise {Object result;boolean resolved;public void resolve(Object x){result=x;resolved=true;}}
  public static void main(String[] args){
    LaunchActivity a=activity(true,1069,1080);a.create();
    AndroidWindowLayout.WindowState cold=AndroidWindowLayout.currentWindowState();
    check("cold-state-before-react-super",a.seededBeforeSuper);
    check("cold-real-split-atomic-dimensions",cold.isInMultiWindowMode&&near(cold.width,1069/2.625)&&near(cold.height,1080/2.625));
    check("cold-listener-owned-once",a.window.decor.listeners.size()==1);
    ReactApplicationContext react=new ReactApplicationContext();react.activity=a;DeviceUtilsModule module=new DeviceUtilsModule(react);
    Map<String,Object> constants=module.getConstants();
    check("native-capability-exported",Boolean.TRUE.equals(constants.get("supportsAndroidMultiWindowLayout")));
    check("cold-state-exported",number(constants.get("androidWindowState"),"revision")==cold.revision);
    module.initialize();UiThreadUtil.drain();
    Result p=new Result();module.getAndroidWindowState(p);check("getter-queues-ui",!p.resolved);UiThreadUtil.drain();
    check("getter-current-atomic-map",Boolean.TRUE.equals(value(p.result).get("isInMultiWindowMode"))&&near(number(p.result,"width"),cold.width));
    long before=cold.revision;bounds(a,900,1080);a.onMultiWindowModeChanged(true,new Configuration());
    check("live-resize-event",react.events.size()==1&&near(number(react.events.get(0),"width"),900/2.625));
    check("event-name-stable",react.names.get(0).equals("androidWindowStateChanged"));
    check("revision-monotonic",number(react.events.get(0),"revision")>before);
    a.window.decor.layout(900,1080);a.onConfigurationChanged(new Configuration());
    check("duplicate-layout-config-deduped",react.events.size()==1);
    a.multiWindow=false;bounds(a,1768,2208);a.onMultiWindowModeChanged(false);
    check("full-return-real-boolean",react.events.size()==2&&Boolean.FALSE.equals(value(react.events.get(1)).get("isInMultiWindowMode")));
    check("full-window-not-phonebox",near(number(react.events.get(1),"width"),1768/2.625));
    a.multiWindow=true;a.onMultiWindowModeChanged(true);
    check("same-shape-boolean-transition-emits",react.events.size()==3&&Boolean.TRUE.equals(value(react.events.get(2)).get("isInMultiWindowMode")));
    int external[]={0};a.window.decor.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->external[0]++);
    bounds(a,1000,1000);a.window.decor.layout(1000,1000);
    check("final-layout-publishes-current-bounds",react.events.size()==4&&near(number(react.events.get(3),"height"),1000/2.625));
    check("existing-decor-listener-preserved",external[0]==1);
    before=AndroidWindowLayout.currentWindowState().revision;
    LaunchActivity next=activity(true,700,1200);next.create();react.activity=next;
    check("new-activity-generation-revision",AndroidWindowLayout.currentWindowState().revision>before);
    int count=react.events.size();bounds(a,300,300);a.onConfigurationChanged(new Configuration());a.window.decor.layout(300,300);
    check("old-activity-callback-rejected",react.events.size()==count);
    a.destroy();check("old-destroy-keeps-new-state",AndroidWindowLayout.currentWindowState()!=null);
    check("old-owned-listener-removed-only",a.window.decor.listeners.size()==1);
    Result deferred=new Result();module.getAndroidWindowState(deferred);bounds(next,600,1100);UiThreadUtil.drain();
    check("getter-reads-after-ui-queue",near(number(deferred.result,"width"),600/2.625));
    next.manager.metrics.bounds.h=0;count=react.events.size();
    check("unready-bounds-not-published",AndroidWindowLayout.refreshWindowState(next)==null&&react.events.size()==count);
    next.manager.metrics.bounds.h=1100;next.resources.metrics.density=Float.NaN;
    check("invalid-density-not-published",AndroidWindowLayout.refreshWindowState(next)==null);
    next.resources.metrics.density=2.625f;next.manager.fail=true;
    check("window-api-exception-safe",AndroidWindowLayout.refreshWindowState(next)==null);next.manager.fail=false;
    react.active=false;bounds(next,500,1000);next.resume();
    check("inactive-react-no-event",react.events.size()==count);react.active=true;
    Result latest=new Result();module.getAndroidWindowState(latest);UiThreadUtil.drain();
    check("getter-recovers-missed-react-event",near(number(latest.result,"width"),500/2.625));
    module.invalidate();bounds(next,550,1000);next.resume();
    check("invalidate-blocks-before-ui-unregister",react.events.size()==count);
    Result invalidated=new Result();module.getAndroidWindowState(invalidated);UiThreadUtil.drain();
    check("invalidated-getter-null",invalidated.resolved&&invalidated.result==null);
    bounds(next,600,1000);next.resume();check("invalidated-listener-removed",react.events.size()==count);
    next.destroy();check("current-destroy-clears-snapshot",AndroidWindowLayout.currentWindowState()==null);
    check("current-destroy-removes-listener",next.window.decor.listeners.isEmpty());
    ReactApplicationContext lateReact=new ReactApplicationContext();DeviceUtilsModule late=new DeviceUtilsModule(lateReact);
    late.initialize();late.invalidate();UiThreadUtil.drain();LaunchActivity fresh=activity(false,1080,2400);fresh.create();
    check("queued-initialize-after-invalidate-no-subscribe",lateReact.events.isEmpty());
    fresh.finishing=true;check("finishing-activity-snapshot-null",AndroidWindowLayout.currentWindowState()==null);fresh.finishing=false;
    fresh.destroy();Build.VERSION.SDK_INT=29;LaunchActivity old=activity(true,800,1200);old.window.decor.attached=false;old.create();
    check("pre30-detached-no-fake-dimensions",AndroidWindowLayout.currentWindowState()==null);
    old.window.decor.attached=true;old.window.decor.layout(800,1200);
    check("pre30-attached-decor-snapshot",AndroidWindowLayout.currentWindowState().isInMultiWindowMode&&near(AndroidWindowLayout.currentWindowState().height,1200/2.625));
    old.destroy();Build.VERSION.SDK_INT=23;LaunchActivity pre24=activity(true,1080,2400);pre24.create();
    check("pre24-does-not-call-multiwindow-api",!AndroidWindowLayout.currentWindowState().isInMultiWindowMode);
    pre24.destroy();Build.VERSION.SDK_INT=36;LaunchActivity fold=activity(false,1768,2208);fold.packages.feature=true;fold.create();
    check("fold-portrait-request-retained",fold.requestedOrientation==1);
    check("wide-fold-is-not-multiwindow-guess",!AndroidWindowLayout.currentWindowState().isInMultiWindowMode);
    check("resume-and-super-config-preserved",next.superResumes==3&&a.superConfigs==2);
    System.out.println("assertions="+assertions);
  }
}
'''

with tempfile.TemporaryDirectory(prefix='xaman-multi-window-') as tmp:
    work = Path(tmp)
    files = []
    for name, text in {**stubs, 'com/xrpllabs/xumm/LaunchActivity.java': activity,
                       'com/xrpllabs/xumm/MultiWindowProbe.java': probe}.items():
        target = work / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
        files.append(str(target))
    production = [layout, NATIVE / 'com/xrpllabs/xumm/AndroidWindowLayoutMath.java', module]
    java_home = Path(os.environ.get('JAVA_HOME', '')) / 'bin'
    javac = str(java_home / 'javac') if (java_home / 'javac').is_file() else 'javac'
    java = str(java_home / 'java') if (java_home / 'java').is_file() else 'java'
    for command in [[javac, '-encoding', 'UTF-8', '-d', str(work), *map(str, production), *files],
                    [java, '-cp', str(work), 'com.xrpllabs.xumm.MultiWindowProbe']]:
        run = subprocess.run(command, text=True, capture_output=True, timeout=30)
        if run.returncode:
            raise RuntimeError(run.stdout + run.stderr)
    assertions = [line[:-5] for line in run.stdout.splitlines() if line.endswith(':true')]
    print(json.dumps({'passed': len(assertions), 'cases': len(assertions), 'failures': [],
                      'actual_window_state_class_and_deviceutils_module_compiled_whole': True,
                      'actual_activity_create_destroy_resume_config_multiwindow_callbacks_compiled': True,
                      'assertions': assertions,
                      'source_sha256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                                        for p in [*production, launch]},
                      'scope': 'Actual production Java with public Android/React host doubles, not native rendering'}))
