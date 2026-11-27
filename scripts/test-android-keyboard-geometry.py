#!/usr/bin/env python3
"""Compile the production keyboard geometry and verbatim bridge/provider methods.

Only public Android/React APIs and the UI queue are doubled. This verifies native
coordinate, fallback and Promise contracts; it does not replace device IME tests.
Run with Python 3 and a JDK. JAVA_HOME is honored, otherwise PATH is used.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT / 'android/app/src/main/java/libs/ui'
SOURCES = [NATIVE / name for name in [
    'KeyboardWindowGeometry.java', 'KeyboardProvider.java', 'KeyboardModule.java',
]]


def method(source, name):
    match = re.search(r'^    (?:public |private |protected )?(?:static )?[^\n]+ ' + name + r'\(', source, re.M)
    if not match:
        raise RuntimeError('Missing actual production method: ' + name)
    start = source.index('{', match.start())
    depth, end = 1, start + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[match.start():end]


def checked(command):
    result = subprocess.run(command, text=True, capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError('Native keyboard contract failed:\n' + result.stdout + result.stderr)
    return result.stdout


provider_method = method(SOURCES[1].read_text(), 'getVisibleWindowFrame')
bridge_method = method(SOURCES[2].read_text(), 'getWindowGeometry')
stubs = {
    'android/os/Build.java': '''package android.os; public class Build {
      public static class VERSION {public static int SDK_INT=36;}
      public static class VERSION_CODES {public static final int R=30;}
    }''',
    'android/graphics/Rect.java': '''package android.graphics; public class Rect {
      public int left,top,right,bottom;
      public Rect(){} public Rect(int l,int t,int r,int b){set(l,t,r,b);}
      public void set(int l,int t,int r,int b){left=l;top=t;right=r;bottom=b;}
      public int height(){return bottom-top;}
    }''',
    'android/util/DisplayMetrics.java': '''package android.util;
      public class DisplayMetrics {public float density=3f;}''',
    'android/content/res/Resources.java': '''package android.content.res;
      public class Resources {public final android.util.DisplayMetrics metrics=new android.util.DisplayMetrics();
        public android.util.DisplayMetrics getDisplayMetrics(){return metrics;}}
    ''',
    'android/view/View.java': '''package android.view;
      public class View {
        public boolean attached=true,throwFrame; public int height=2400,screenY,reads;
        public final android.graphics.Rect frame=new android.graphics.Rect(0,80,1080,1500);
        public final android.content.res.Resources resources=new android.content.res.Resources();
        public androidx.core.view.WindowInsetsCompat insets;
        public boolean isAttachedToWindow(){return attached;}
        public int getHeight(){reads++;return height;}
        public android.content.res.Resources getResources(){return resources;}
        public void getLocationOnScreen(int[] value){value[0]=0;value[1]=screenY;}
        public void getWindowVisibleDisplayFrame(android.graphics.Rect out){
          if(throwFrame)throw new IllegalStateException("window disappeared");
          out.set(frame.left,frame.top,frame.right,frame.bottom);}
      }''',
    'android/view/Window.java': '''package android.view;
      public class Window {public View decor=new View();public View getDecorView(){return decor;}}''',
    'android/app/Activity.java': '''package android.app;
      public class Activity {public boolean finishing,destroyed;public int windowReads;
        public android.view.Window window=new android.view.Window();
        public boolean isFinishing(){return finishing;}public boolean isDestroyed(){return destroyed;}
        public android.view.Window getWindow(){windowReads++;return window;}}
    ''',
    'androidx/core/graphics/Insets.java': '''package androidx.core.graphics;
      public class Insets {public final int bottom;public Insets(int value){bottom=value;}}''',
    'androidx/core/view/WindowInsetsCompat.java': '''package androidx.core.view;
      public class WindowInsetsCompat {public int bottom;public boolean visible;
        public WindowInsetsCompat(int b,boolean v){bottom=b;visible=v;}
        public static class Type {public static int ime(){return 8;}}
        public androidx.core.graphics.Insets getInsets(int type){
          if(type!=8)throw new AssertionError("Only IME insets are expected");
          return new androidx.core.graphics.Insets(bottom);}
        public boolean isVisible(int type){return visible;}}
    ''',
    'androidx/core/view/ViewCompat.java': '''package androidx.core.view;
      public class ViewCompat {public static WindowInsetsCompat getRootWindowInsets(android.view.View view){
        if(android.os.Build.VERSION.SDK_INT<30)throw new AssertionError("Do not use the API30 path on API29");
        return view.insets;}}
    ''',
    'com/facebook/react/bridge/Promise.java': '''package com.facebook.react.bridge;
      public interface Promise {void resolve(Object value);}''',
    'com/facebook/react/bridge/WritableMap.java': '''package com.facebook.react.bridge;
      public class WritableMap extends java.util.LinkedHashMap<String,Object> {
        public void putDouble(String key,double value){put(key,value);}
        public void putBoolean(String key,boolean value){put(key,value);}}
    ''',
    'com/facebook/react/bridge/Arguments.java': '''package com.facebook.react.bridge;
      public class Arguments {public static WritableMap createMap(){return new WritableMap();}}''',
    'com/facebook/react/bridge/UiThreadUtil.java': '''package com.facebook.react.bridge;
      public class UiThreadUtil {public static final java.util.List<Runnable> queue=new java.util.ArrayList<>();
        public static void runOnUiThread(Runnable task){queue.add(task);}
        public static void flush(){while(!queue.isEmpty())queue.remove(0).run();}}
    ''',
    'libs/ui/KeyboardProvider.java': '''package libs.ui;
      import android.graphics.Rect; import android.view.View;
      public class KeyboardProvider {public final View rootView=new View();
        public boolean showing=true;public int heightMax=999999;
        public boolean isShowing(){return showing;}
        /* ACTUAL_PROVIDER_METHOD */
      }'''.replace('/* ACTUAL_PROVIDER_METHOD */', provider_method),
    'libs/ui/KeyboardModule.java': '''package libs.ui;
      import android.app.Activity; import com.facebook.react.bridge.*;
      public class KeyboardModule {public Activity activity;public KeyboardProvider keyboardProvider;
        public Activity getCurrentActivity(){return activity;}
        /* ACTUAL_BRIDGE_METHOD */
      }'''.replace('/* ACTUAL_BRIDGE_METHOD */', bridge_method),
}

probe = r'''
package libs.ui;
import android.app.Activity; import android.view.View; import android.os.Build;
import android.graphics.Rect; import androidx.core.view.WindowInsetsCompat;
import com.facebook.react.bridge.*;

public class KeyboardGeometryProbe {
  static void check(String name,boolean value){System.out.println(name+":"+value);}
  static boolean near(double actual,double expected){return Math.abs(actual-expected)<0.000001;}
  static Activity fixture(){Build.VERSION.SDK_INT=36;Activity a=new Activity();
    a.window.decor.insets=new WindowInsetsCompat(900,true);return a;}
  static KeyboardWindowGeometry.Result read(Activity a,KeyboardProvider p){return KeyboardWindowGeometry.read(a,p);}
  static class Capture implements Promise {boolean resolved;Object value;
    public void resolve(Object next){resolved=true;value=next;}}
  static void invalid(String name,Activity a){check(name,read(a,null)==null);}

  public static void main(String[] args){
    Activity a=fixture();KeyboardProvider p=new KeyboardProvider();
    KeyboardWindowGeometry.Result r=read(a,p);
    check("api30-current-ime-top",r!=null&&near(r.keyboardTop,473.3333333333333));
    check("api30-visible-true-explicit",r!=null&&Boolean.TRUE.equals(r.visible));
    p.heightMax=-40000;
    check("current-ime-ignores-cached-heightmax",near(read(a,p).keyboardTop,473.3333333333333));
    a.window.decor.screenY=500;a.window.decor.height=1400;
    a.window.decor.frame.set(0,560,1080,1300);a.window.decor.insets.bottom=600;
    check("split-status-offset-same-rn-origin",near(read(a,p).keyboardTop,246.66666666666666));
    a.window.decor.resources.metrics.density=2;
    check("current-density-not-stale-display-cache",near(read(a,p).keyboardTop,370));
    a.window.decor.height=1800;
    check("current-decor-height-after-resize",near(read(a,p).keyboardTop,570));
    a=fixture();a.window.decor.insets=new WindowInsetsCompat(0,false);r=read(a,p);
    check("api30-hidden-keeps-explicit-false",r!=null&&Boolean.FALSE.equals(r.visible));
    check("hidden-window-current-bottom",r!=null&&near(r.keyboardTop,773.3333333333334));

    invalid("missing-activity-is-null",null);
    a=fixture();a.finishing=true;invalid("finishing-activity-is-null",a);
    a=fixture();a.destroyed=true;invalid("destroyed-activity-is-null",a);
    a=fixture();a.window=null;invalid("missing-window-is-null",a);
    a=fixture();a.window.decor=null;invalid("missing-decor-is-null",a);
    a=fixture();a.window.decor.attached=false;invalid("detached-decor-is-null",a);
    a=fixture();a.window.decor.height=0;invalid("zero-decor-height-is-null",a);
    for(float density:new float[]{0,-2,Float.NaN,Float.POSITIVE_INFINITY}){
      a=fixture();a.window.decor.resources.metrics.density=density;
      invalid("invalid-current-density-"+Float.toString(density),a);
    }
    a=fixture();a.window.decor.frame.set(0,50,1000,50);invalid("empty-visible-frame-without-fallback-is-null",a);
    a=fixture();a.window.decor.insets.bottom=-1;invalid("negative-ime-inset-without-fallback-is-null",a);
    a=fixture();a.window.decor.insets.bottom=3000;invalid("nonpositive-visible-bottom-is-null",a);
    a=fixture();a.window.decor.throwFrame=true;invalid("disappearing-window-is-null",a);

    a=fixture();Build.VERSION.SDK_INT=29;p=new KeyboardProvider();
    p.rootView.frame.set(20,100,900,1120);p.heightMax=888888;r=read(a,p);
    check("api29-attached-showing-popup-fallback",r!=null&&near(r.keyboardTop,340));
    check("fallback-visibility-is-unknown",r!=null&&r.visible==null);
    p.heightMax=-42;
    check("popup-fallback-ignores-heightmax",near(read(a,p).keyboardTop,340));
    p.showing=false;check("hidden-popup-is-null",read(a,p)==null);p.showing=true;
    p.rootView.attached=false;check("detached-popup-is-null",read(a,p)==null);p.rootView.attached=true;
    p.rootView.frame.bottom=p.rootView.frame.top;
    check("empty-popup-frame-is-null",read(a,p)==null);
    check("missing-popup-is-null",read(a,null)==null);
    p.rootView.frame.set(0,100,900,1120);Rect copy=p.getVisibleWindowFrame();copy.bottom=3;
    check("popup-reads-fresh-frame-copy",p.getVisibleWindowFrame().height()==1020);
    a.window.decor.resources.metrics.density=2;
    check("popup-fallback-uses-current-density",near(read(a,p).keyboardTop,510));
    Build.VERSION.SDK_INT=36;a.window.decor.insets=null;
    check("unavailable-insets-uses-attached-popup",near(read(a,p).keyboardTop,510));
    check("unavailable-insets-without-popup-is-null",read(a,null)==null);

    KeyboardModule bridge=new KeyboardModule();bridge.activity=fixture();
    Capture capture=new Capture();bridge.getWindowGeometry(capture);
    check("bridge-promise-waits-for-ui-queue",!capture.resolved&&UiThreadUtil.queue.size()==1);
    check("bridge-does-not-read-views-before-ui",bridge.activity.windowReads==0);
    UiThreadUtil.flush();WritableMap map=(WritableMap)capture.value;
    check("bridge-resolves-precise-double",capture.resolved&&map.get("keyboardTop") instanceof Double&&near((Double)map.get("keyboardTop"),473.3333333333333));
    check("bridge-map-includes-visible-true",Boolean.TRUE.equals(map.get("visible")));
    bridge.activity.window.decor.insets.visible=false;capture=new Capture();bridge.getWindowGeometry(capture);UiThreadUtil.flush();
    map=(WritableMap)capture.value;check("bridge-map-includes-visible-false",map.containsKey("visible")&&Boolean.FALSE.equals(map.get("visible")));
    bridge.activity=fixture();bridge.keyboardProvider=new KeyboardProvider();Build.VERSION.SDK_INT=29;
    capture=new Capture();bridge.getWindowGeometry(capture);UiThreadUtil.flush();map=(WritableMap)capture.value;
    check("bridge-fallback-omits-visibility",map.containsKey("keyboardTop")&&!map.containsKey("visible"));
    bridge.activity=null;capture=new Capture();bridge.getWindowGeometry(capture);UiThreadUtil.flush();
    check("bridge-null-snapshot-resolves-null",capture.resolved&&capture.value==null);
    bridge.activity=fixture();capture=new Capture();bridge.getWindowGeometry(capture);bridge.activity.destroyed=true;UiThreadUtil.flush();
    check("bridge-uses-current-activity-on-ui-flush",capture.resolved&&capture.value==null);
  }
}
'''

with tempfile.TemporaryDirectory(prefix='xaman-android-keyboard-') as directory:
    work = Path(directory)
    files = []
    for name, source in stubs.items():
        target = work / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(source)
        files.append(str(target))
    target = work / 'KeyboardGeometryProbe.java'
    target.write_text(probe)
    java_home = Path(os.environ.get('JAVA_HOME', '')) / 'bin'
    javac = str(java_home / 'javac') if (java_home / 'javac').is_file() else 'javac'
    java = str(java_home / 'java') if (java_home / 'java').is_file() else 'java'
    checked([javac, '-encoding', 'UTF-8', '-d', str(work), *files, str(SOURCES[0]), str(target)])
    results = [line for line in checked([java, '-cp', str(work), 'libs.ui.KeyboardGeometryProbe']).splitlines() if line]
    failures = [line for line in results if not line.endswith(':true')]
    print(json.dumps({
        'cases': len(results), 'passed': len(results) - len(failures), 'failures': failures,
        'actual_production_geometry_class_compiled': True,
        'actual_production_provider_method_compiled': True,
        'actual_production_bridge_method_compiled': True,
        'assertions': [line[:-5] for line in results if line.endswith(':true')],
        'native_source_sha256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in SOURCES},
        'scope': 'Host JVM with public Android/React API doubles; actual IME rendering requires native device proof',
    }))
    if failures:
        raise SystemExit(1)
