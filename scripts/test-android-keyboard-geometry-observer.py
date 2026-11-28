#!/usr/bin/env python3
"""Compile the actual IME observer/module against public Android/React API doubles.

The early-visible/zero-inset then settled-frame scenario comes from native proof
on API36. This host contract test complements, and does not replace, real IME UI.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT / 'android/app/src/main/java/libs/ui'
SOURCES = [NATIVE / name for name in [
    'KeyboardWindowGeometry.java', 'KeyboardWindowGeometryObserver.java', 'KeyboardModule.java',
]]

STUBS = {
    'androidx/annotation/NonNull.java': 'package androidx.annotation; public @interface NonNull {}',
    'com/facebook/react/bridge/ReactMethod.java': 'package com.facebook.react.bridge; public @interface ReactMethod {}',
    'com/facebook/react/module/annotations/ReactModule.java': '''package com.facebook.react.module.annotations;
      public @interface ReactModule {String name();}''',
    'android/os/Build.java': '''package android.os; public class Build {
      public static class VERSION {public static int SDK_INT=36;}
      public static class VERSION_CODES {public static final int R=30;}}''',
    'android/graphics/Rect.java': '''package android.graphics; public class Rect {
      public int left,top,right,bottom;public Rect(){}public Rect(int l,int t,int r,int b){set(l,t,r,b);}
      public void set(int l,int t,int r,int b){left=l;top=t;right=r;bottom=b;}public int height(){return bottom-top;}}''',
    'android/util/DisplayMetrics.java': '''package android.util;
      public class DisplayMetrics {public float density=2.625f;}''',
    'android/content/res/Resources.java': '''package android.content.res; public class Resources {
      public final android.util.DisplayMetrics metrics=new android.util.DisplayMetrics();
      public android.util.DisplayMetrics getDisplayMetrics(){return metrics;}}''',
    'android/view/ViewTreeObserver.java': '''package android.view; import java.util.*;
      public class ViewTreeObserver {
        public interface OnGlobalLayoutListener {void onGlobalLayout();}
        public interface OnPreDrawListener {boolean onPreDraw();}
        public boolean alive=true;public final List<OnGlobalLayoutListener> layouts=new ArrayList<>();
        public final List<OnPreDrawListener> draws=new ArrayList<>();public boolean isAlive(){return alive;}
        public void addOnGlobalLayoutListener(OnGlobalLayoutListener l){layouts.add(l);}
        public void removeOnGlobalLayoutListener(OnGlobalLayoutListener l){layouts.remove(l);}
        public void addOnPreDrawListener(OnPreDrawListener l){draws.add(l);}
        public void removeOnPreDrawListener(OnPreDrawListener l){draws.remove(l);}
        public void layout(){for(OnGlobalLayoutListener l:new ArrayList<>(layouts))l.onGlobalLayout();}
        public boolean draw(){boolean permit=true;for(OnPreDrawListener l:new ArrayList<>(draws))permit&=l.onPreDraw();return permit;}
      }''',
    'android/view/View.java': '''package android.view; import java.util.*;
      public class View {
        public interface OnAttachStateChangeListener {void onViewAttachedToWindow(View v);void onViewDetachedFromWindow(View v);}
        public boolean attached=true;public int height=1080,screenY;
        public ViewTreeObserver tree=new ViewTreeObserver();
        public final List<OnAttachStateChangeListener> attaches=new ArrayList<>();
        public final android.graphics.Rect frame=new android.graphics.Rect(93,74,1162,1080);
        public final android.content.res.Resources resources=new android.content.res.Resources();
        public androidx.core.view.WindowInsetsCompat insets=new androidx.core.view.WindowInsetsCompat(0,true);
        public boolean isAttachedToWindow(){return attached;}public int getHeight(){return height;}
        public android.content.res.Resources getResources(){return resources;}
        public void getLocationOnScreen(int[] out){out[0]=93;out[1]=screenY;}
        public void getWindowVisibleDisplayFrame(android.graphics.Rect out){out.set(frame.left,frame.top,frame.right,frame.bottom);}
        public ViewTreeObserver getViewTreeObserver(){return tree;}
        public void addOnAttachStateChangeListener(OnAttachStateChangeListener l){attaches.add(l);}
        public void removeOnAttachStateChangeListener(OnAttachStateChangeListener l){attaches.remove(l);}
        public void detach(){attached=false;for(OnAttachStateChangeListener l:new ArrayList<>(attaches))l.onViewDetachedFromWindow(this);}
        public void attach(){attached=true;for(OnAttachStateChangeListener l:new ArrayList<>(attaches))l.onViewAttachedToWindow(this);}
      }''',
    'android/view/Window.java': '''package android.view;public class Window {
      public View decor=new View();public View getDecorView(){return decor;}}''',
    'android/app/Activity.java': '''package android.app;public class Activity {
      public boolean finishing,destroyed;public android.view.Window window=new android.view.Window();
      public boolean isFinishing(){return finishing;}public boolean isDestroyed(){return destroyed;}
      public android.view.Window getWindow(){return window;}}''',
    'androidx/core/graphics/Insets.java': '''package androidx.core.graphics; public class Insets {
      public final int bottom;public Insets(int value){bottom=value;}}''',
    'androidx/core/view/WindowInsetsCompat.java': '''package androidx.core.view;public class WindowInsetsCompat {
      public int bottom;public boolean visible;public WindowInsetsCompat(int b,boolean v){bottom=b;visible=v;}
      public static class Type {public static int ime(){return 8;}}
      public androidx.core.graphics.Insets getInsets(int type){return new androidx.core.graphics.Insets(bottom);}
      public boolean isVisible(int type){return visible;}}''',
    'androidx/core/view/ViewCompat.java': '''package androidx.core.view;public class ViewCompat {
      public static WindowInsetsCompat getRootWindowInsets(android.view.View v){return v.insets;}}''',
    'com/facebook/react/bridge/Promise.java': 'package com.facebook.react.bridge;public interface Promise {void resolve(Object value);}',
    'com/facebook/react/bridge/WritableMap.java': '''package com.facebook.react.bridge; public class WritableMap extends java.util.LinkedHashMap<String,Object> {
      public void putDouble(String k,double v){put(k,v);}public void putBoolean(String k,boolean v){put(k,v);}
      public void putInt(String k,int v){put(k,v);}public void putMap(String k,WritableMap v){put(k,v);}}''',
    'com/facebook/react/bridge/Arguments.java': '''package com.facebook.react.bridge;public class Arguments {
      public static WritableMap createMap(){return new WritableMap();}}''',
    'com/facebook/react/bridge/UiThreadUtil.java': '''package com.facebook.react.bridge;public class UiThreadUtil {
      public static final java.util.List<Runnable> queue=new java.util.ArrayList<>();
      public static void runOnUiThread(Runnable r){queue.add(r);}
      public static void flush(){int limit=200;while(!queue.isEmpty()){if(--limit==0)throw new AssertionError("UI queue did not settle");queue.remove(0).run();}}}''',
    'com/facebook/react/bridge/LifecycleEventListener.java': '''package com.facebook.react.bridge;
      public interface LifecycleEventListener {void onHostResume();void onHostPause();void onHostDestroy();}''',
    'com/facebook/react/common/LifecycleState.java': '''package com.facebook.react.common;
      public enum LifecycleState {BEFORE_CREATE,BEFORE_RESUME,RESUMED}''',
    'com/facebook/react/modules/core/DeviceEventManagerModule.java': '''package com.facebook.react.modules.core;
      public class DeviceEventManagerModule {public interface RCTDeviceEventEmitter {void emit(String name,Object value);}}''',
    'com/facebook/react/bridge/ReactApplicationContext.java': '''package com.facebook.react.bridge;import java.util.*;
      import com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter;
      public class ReactApplicationContext {
        public android.app.Activity activity;public boolean active=true;public final List<LifecycleEventListener> lifecycle=new ArrayList<>();
        public com.facebook.react.common.LifecycleState state=com.facebook.react.common.LifecycleState.RESUMED;
        public com.facebook.react.common.LifecycleState getLifecycleState(){return state;}
        public final List<String> names=new ArrayList<>();public final List<Object> values=new ArrayList<>();
        public void addLifecycleEventListener(LifecycleEventListener l){lifecycle.add(l);}
        public void removeLifecycleEventListener(LifecycleEventListener l){lifecycle.remove(l);}
        public boolean hasActiveReactInstance(){return active;}
        public <T> T getJSModule(Class<T> type){RCTDeviceEventEmitter e=(name,value)->{names.add(name);values.add(value);};return type.cast(e);}
        public void resume(){state=com.facebook.react.common.LifecycleState.RESUMED;for(LifecycleEventListener l:new ArrayList<>(lifecycle))l.onHostResume();}
        public void pause(){state=com.facebook.react.common.LifecycleState.BEFORE_RESUME;for(LifecycleEventListener l:new ArrayList<>(lifecycle))l.onHostPause();}
        public void destroy(){state=com.facebook.react.common.LifecycleState.BEFORE_CREATE;for(LifecycleEventListener l:new ArrayList<>(lifecycle))l.onHostDestroy();}
      }''',
    'com/facebook/react/bridge/ReactContextBaseJavaModule.java': '''package com.facebook.react.bridge;
      public class ReactContextBaseJavaModule {private final ReactApplicationContext context;public boolean invalidated;
        public ReactContextBaseJavaModule(ReactApplicationContext c){context=c;}
        public ReactApplicationContext getReactApplicationContext(){return context;}
        public android.app.Activity getCurrentActivity(){return context.activity;}public String getName(){return "";}
        public void invalidate(){invalidated=true;}}''',
    'com/facebook/react/uimanager/DisplayMetricsHolder.java': '''package com.facebook.react.uimanager;
      public class DisplayMetricsHolder {public static void initDisplayMetricsIfNotInitialized(Object c){}
        public static android.util.DisplayMetrics getScreenDisplayMetrics(){return new android.util.DisplayMetrics();}}''',
    'libs/ui/KeyboardProvider.java': '''package libs.ui;public class KeyboardProvider {
      public interface HeightListener {void onHeightChanged(int height);}public static int created,initialized,dismissed;
      public KeyboardProvider(android.app.Activity a){created++;}public KeyboardProvider init(){initialized++;return this;}
      public void setHeightListener(HeightListener l){}public void dismiss(){dismissed++;}
      android.graphics.Rect getVisibleWindowFrame(){return null;}}''',
}

PROBE = r'''
package libs.ui;
import java.util.*;import android.app.Activity;import android.view.*;import com.facebook.react.bridge.*;
public class KeyboardObserverProbe {
  static void check(String name,boolean ok){System.out.println(name+":"+ok);}
  static boolean near(double a,double b){return Math.abs(a-b)<0.000001;}
  static class Capture implements Promise {Object value;boolean resolved;public void resolve(Object v){value=v;resolved=true;}}
  static WritableMap last(ReactApplicationContext c){return (WritableMap)c.values.get(c.values.size()-1);}
  static double top(ReactApplicationContext c){return (Double)last(c).get("keyboardTop");}
  public static void main(String[] args){
    Activity a=new Activity();View d=a.window.decor;List<KeyboardWindowGeometry.Result> events=new ArrayList<>();
    int[] sentinels={0};ViewTreeObserver.OnGlobalLayoutListener externalLayout=()->sentinels[0]++;
    ViewTreeObserver.OnPreDrawListener externalDraw=()->{sentinels[0]++;return true;};
    d.tree.addOnGlobalLayoutListener(externalLayout);d.tree.addOnPreDrawListener(externalDraw);
    KeyboardWindowGeometryObserver o=new KeyboardWindowGeometryObserver(d,()->KeyboardWindowGeometry.read(a,null),events::add);
    check("observer-does-not-subscribe-before-start",d.attaches.isEmpty()&&d.tree.layouts.size()==1);
    o.start();check("start-emits-current-early-visible-zero-inset",events.size()==1&&near(events.get(0).keyboardTop,383.23809523809524)&&Boolean.TRUE.equals(events.get(0).visible));
    check("observer-adds-only-owned-listeners",d.attaches.size()==1&&d.tree.layouts.size()==2&&d.tree.draws.size()==2);
    o.start();check("start-is-idempotent",events.size()==1&&d.attaches.size()==1&&d.tree.layouts.size()==2);
    d.insets.bottom=686;boolean draw=d.tree.draw();
    check("next-frame-corrects-383-to-121-without-visibility-toggle",events.size()==2&&near(events.get(1).keyboardTop,121.9047619047619)&&Boolean.TRUE.equals(events.get(1).visible));
    check("pre-draw-never-blocks-rendering",draw);
    d.tree.draw();d.tree.layout();check("same-geometry-layout-and-draw-deduplicate",events.size()==2);
    d.insets.visible=false;d.tree.draw();check("visibility-change-emits-even-with-same-top",events.size()==3&&Boolean.FALSE.equals(events.get(2).visible));
    d.insets.bottom=500;d.tree.layout();check("global-layout-also-observes-geometry",events.size()==4);
    check("existing-layout-and-draw-listeners-retained",sentinels[0]>=5&&d.tree.layouts.contains(externalLayout)&&d.tree.draws.contains(externalDraw));
    check("bound-decor-identity-is-explicit",o.isBoundTo(d)&&!o.isBoundTo(new View()));
    ViewTreeObserver old=d.tree;d.detach();check("detach-removes-tree-listeners",old.layouts.size()==1&&old.draws.size()==1);
    int count=events.size();d.insets.bottom=600;old.draw();old.layout();check("detached-window-emits-nothing",events.size()==count);
    d.tree=new ViewTreeObserver();d.attach();check("reattach-binds-new-tree-and-emits-current",events.size()==count+1&&d.tree.layouts.size()==1&&d.tree.draws.size()==1);
    o.stop();check("stop-removes-owned-tree-and-attach-listeners",d.attaches.isEmpty()&&d.tree.layouts.isEmpty()&&d.tree.draws.isEmpty());
    count=events.size();d.insets.bottom=700;d.tree.draw();d.tree.layout();check("no-late-event-after-stop",events.size()==count);
    o.stop();o.start();check("restart-after-stop-gets-fresh-initial-state",events.size()==count+1&&d.attaches.size()==1);o.stop();
    View detached=new View();detached.attached=false;List<KeyboardWindowGeometry.Result> waiting=new ArrayList<>();
    KeyboardWindowGeometryObserver pending=new KeyboardWindowGeometryObserver(detached,()->new KeyboardWindowGeometry.Result(50,true),waiting::add);
    pending.start();check("initially-detached-view-waits-for-attach",waiting.isEmpty()&&detached.tree.layouts.isEmpty());detached.attach();
    check("first-attach-binds-and-emits",waiting.size()==1&&detached.tree.layouts.size()==1);pending.stop();
    final KeyboardWindowGeometry.Result[] snapshot={null};List<KeyboardWindowGeometry.Result> nullable=new ArrayList<>();View n=new View();
    KeyboardWindowGeometryObserver nullSource=new KeyboardWindowGeometryObserver(n,()->snapshot[0],nullable::add);nullSource.start();
    check("unavailable-geometry-does-not-emit",nullable.isEmpty());snapshot[0]=new KeyboardWindowGeometry.Result(90,null);n.tree.draw();
    check("geometry-can-recover-and-keep-unknown-visibility",nullable.size()==1&&nullable.get(0).visible==null);nullSource.stop();
    View throwingView=new View();int[] attempts={0};List<KeyboardWindowGeometry.Result> recovered=new ArrayList<>();
    KeyboardWindowGeometryObserver throwing=new KeyboardWindowGeometryObserver(throwingView,()->{if(attempts[0]++==0)throw new IllegalStateException("transient window");return new KeyboardWindowGeometry.Result(70,true);},recovered::add);
    throwing.start();check("transient-read-error-does-not-crash-or-emit",recovered.isEmpty());throwingView.tree.draw();
    check("later-traversal-recovers-from-read-error",recovered.size()==1);throwing.stop();

    ReactApplicationContext c=new ReactApplicationContext();c.activity=new Activity();View first=c.activity.window.decor;KeyboardModule module=new KeyboardModule(c);
    check("module-ordinary-construction-has-no-observer",c.lifecycle.isEmpty()&&first.tree.layouts.isEmpty()&&KeyboardProvider.created==0);
    Capture read=new Capture();module.getWindowGeometry(read);UiThreadUtil.flush();
    check("plain-query-does-not-create-observation-lease",read.resolved&&c.lifecycle.isEmpty()&&first.tree.layouts.isEmpty());
    module.startWindowGeometryObservation();check("start-lease-waits-for-ui-queue",c.lifecycle.isEmpty()&&first.tree.layouts.isEmpty());UiThreadUtil.flush();
    check("first-lease-binds-current-decor-on-ui",c.lifecycle.size()==1&&first.tree.layouts.size()==1&&first.tree.draws.size()==1&&c.values.size()==1);
    check("module-emits-additive-event-only",c.names.get(0).equals("KeyboardWindowGeometryChanged")&&near(top(c),383.23809523809524));
    module.startWindowGeometryObservation();UiThreadUtil.flush();check("duplicate-start-does-not-duplicate-native-owner",c.lifecycle.size()==1&&first.tree.layouts.size()==1&&c.values.size()==1);
    first.insets.bottom=686;first.tree.draw();check("actual-module-forwards-settled-frame-correction",c.values.size()==2&&near(top(c),121.9047619047619));
    first.tree.draw();first.tree.layout();check("module-does-not-flood-identical-geometry",c.values.size()==2);
    check("geometry-observation-does-not-create-or-restart-legacy-popup",KeyboardProvider.created==0&&KeyboardProvider.initialized==0&&KeyboardProvider.dismissed==0);
    count=c.values.size();c.pause();first.insets.bottom=400;first.tree.draw();
    check("paused-state-blocks-frame-before-queued-clear",c.values.size()==count&&first.tree.layouts.size()==1);
    UiThreadUtil.flush();check("host-pause-clears-decor-observer-not-lease",first.tree.layouts.isEmpty()&&first.tree.draws.isEmpty()&&c.lifecycle.size()==1);
    count=c.values.size();first.insets.bottom=400;first.tree.draw();check("paused-decor-emits-no-late-events",c.values.size()==count);
    read=new Capture();module.getWindowGeometry(read);UiThreadUtil.flush();
    check("paused-query-cannot-reattach-nonnull-current-activity",read.resolved&&first.tree.layouts.isEmpty()&&first.attaches.isEmpty()&&c.values.size()==count);
    module.startWindowGeometryObservation();UiThreadUtil.flush();
    check("paused-start-cannot-reattach-nonnull-current-activity",first.tree.layouts.isEmpty()&&c.lifecycle.size()==1&&c.values.size()==count);
    c.resume();UiThreadUtil.flush();check("host-resume-rebinds-and-publishes-current-geometry",first.tree.layouts.size()==1&&c.values.size()==count+1);
    Activity second=new Activity();second.window.decor.insets.bottom=500;c.activity=second;count=c.values.size();first.tree.draw();
    check("old-activity-source-is-guarded-before-rebind",c.values.size()==count);
    read=new Capture();module.getWindowGeometry(read);UiThreadUtil.flush();
    check("query-rebinds-when-current-activity-changes",first.tree.layouts.isEmpty()&&second.window.decor.tree.layouts.size()==1&&c.lifecycle.size()==1);
    check("query-resolves-current-activity-geometry",read.resolved&&near((Double)((WritableMap)read.value).get("keyboardTop"),(1080-500-74)/2.625));
    View prior=second.window.decor;View replacement=new View();replacement.insets.bottom=600;second.window.decor=replacement;
    read=new Capture();module.getWindowGeometry(read);UiThreadUtil.flush();
    check("same-activity-new-decor-removes-old-observer",prior.tree.layouts.isEmpty()&&prior.attaches.isEmpty()&&replacement.tree.layouts.size()==1);
    c.destroy();UiThreadUtil.flush();check("host-destroy-removes-decor-listeners",replacement.tree.layouts.isEmpty()&&replacement.attaches.isEmpty());
    c.activity=null;c.resume();UiThreadUtil.flush();check("resume-without-activity-stays-unbound",replacement.tree.layouts.isEmpty());
    c.activity=new Activity();c.resume();UiThreadUtil.flush();View finalView=c.activity.window.decor;
    check("lease-recovers-after-new-host-activity",finalView.tree.layouts.size()==1&&c.lifecycle.size()==1);
    module.stopWindowGeometryObservation();UiThreadUtil.flush();check("last-stop-removes-lifecycle-and-tree-listeners",c.lifecycle.isEmpty()&&finalView.tree.layouts.isEmpty()&&finalView.attaches.isEmpty());
    count=c.values.size();finalView.insets.bottom=700;finalView.tree.draw();read=new Capture();module.getWindowGeometry(read);UiThreadUtil.flush();
    check("plain-query-after-stop-does-not-resurrect-lease",c.values.size()==count&&finalView.tree.layouts.isEmpty()&&read.resolved);
    module.startWindowGeometryObservation();UiThreadUtil.flush();LifecycleEventListener late=c.lifecycle.get(0);module.invalidate();UiThreadUtil.flush();
    check("invalidate-stops-observer-and-unregisters-lifecycle",module.invalidated&&c.lifecycle.isEmpty()&&finalView.tree.layouts.isEmpty());
    late.onHostResume();UiThreadUtil.flush();check("queued-lifecycle-cannot-revive-invalidated-observation",c.lifecycle.isEmpty()&&finalView.tree.layouts.isEmpty());
    ReactApplicationContext noHost=new ReactApplicationContext();KeyboardModule noHostModule=new KeyboardModule(noHost);noHostModule.startWindowGeometryObservation();UiThreadUtil.flush();
    check("lease-before-host-mount-is-safe",noHost.lifecycle.size()==1&&noHost.values.isEmpty());noHost.activity=new Activity();noHost.resume();UiThreadUtil.flush();
    check("pending-lease-binds-on-first-host-resume",noHost.activity.window.decor.tree.layouts.size()==1&&noHost.values.size()==1);noHostModule.stopWindowGeometryObservation();UiThreadUtil.flush();
    ReactApplicationContext lateHost=new ReactApplicationContext();KeyboardModule lateModule=new KeyboardModule(lateHost);lateModule.startWindowGeometryObservation();UiThreadUtil.flush();
    lateHost.activity=new Activity();Capture lateRead=new Capture();lateModule.getWindowGeometry(lateRead);UiThreadUtil.flush();
    check("late-activity-query-binds-only-while-resumed",lateRead.resolved&&lateHost.activity.window.decor.tree.layouts.size()==1&&lateHost.values.size()==1);
    lateHost.pause();UiThreadUtil.flush();View pausedOld=lateHost.activity.window.decor;lateHost.activity=new Activity();lateRead=new Capture();lateModule.getWindowGeometry(lateRead);UiThreadUtil.flush();
    check("late-new-activity-query-while-paused-remains-unbound",lateRead.resolved&&pausedOld.tree.layouts.isEmpty()&&lateHost.activity.window.decor.tree.layouts.isEmpty()&&lateHost.values.size()==1);
    lateHost.resume();UiThreadUtil.flush();check("late-new-activity-resume-binds-current-decor",lateHost.activity.window.decor.tree.layouts.size()==1&&lateHost.values.size()==2);lateModule.stopWindowGeometryObservation();UiThreadUtil.flush();
    check("all-test-owned-ui-work-is-drained",UiThreadUtil.queue.isEmpty());
  }
}
'''


def checked(command):
    result = subprocess.run(command, text=True, capture_output=True, timeout=45)
    if result.returncode:
        raise RuntimeError('Actual native observer contract failed:\n' + result.stdout + result.stderr)
    return result.stdout


with tempfile.TemporaryDirectory(prefix='xaman-keyboard-observer-') as directory:
    work = Path(directory)
    files = []
    for name, source in STUBS.items():
        target = work / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(source)
        files.append(str(target))
    probe = work / 'KeyboardObserverProbe.java'
    probe.write_text(PROBE)
    java_home = Path(os.environ.get('JAVA_HOME', '')) / 'bin'
    javac = str(java_home / 'javac') if (java_home / 'javac').is_file() else 'javac'
    java = str(java_home / 'java') if (java_home / 'java').is_file() else 'java'
    checked([javac, '-encoding', 'UTF-8', '-d', str(work), *files, *map(str, SOURCES), str(probe)])
    results = [line for line in checked([java, '-cp', str(work), 'libs.ui.KeyboardObserverProbe']).splitlines() if line]
    failures = [line for line in results if not line.endswith(':true')]
    print(json.dumps({
        'cases': len(results), 'passed': len(results) - len(failures), 'failures': failures,
        'actual_production_observer_class_compiled': True,
        'actual_production_geometry_class_compiled': True,
        'actual_production_module_class_compiled': True,
        'assertions': [line[:-5] for line in results if line.endswith(':true')],
        'native_source_sha256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in SOURCES},
        'scope': 'Actual Java source on a host JVM with public Android/React API doubles and a legacy popup collaborator double; actual IME rendering still needs native proof',
    }, indent=2))
    if failures:
        raise SystemExit(1)
