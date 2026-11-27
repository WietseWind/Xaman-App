#!/usr/bin/env python3
"""Run the native fold model and tab-column contract on the host JVM.

Run from any directory: python3 scripts/test-android-window-layout.py
Requirements: Python 3 and a JDK (JAVA_HOME is honored, otherwise java/javac on PATH).

The model/tab-row helpers and AdaptiveBlurView are compiled whole. LaunchActivity
fields/methods and DeviceUtils/blur bridge methods are extracted verbatim; only
Android public APIs, React's UI queue, and the native view hierarchy are doubled.
This is a deterministic logic/ownership check, not an Android rendering test.
The sibling Jest test runs it in the normal full suite without Gradle or a device.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT / 'android/app/src/main/java/com/xrpllabs/xumm'
launch = (NATIVE / 'LaunchActivity.java').read_text()
bridge = (ROOT / 'android/app/src/main/java/libs/utils/DeviceUtilsModule.java').read_text()
blur_manager = (ROOT / 'android/app/src/main/java/libs/ui/BlurViewModule.java').read_text()
rnn_tabs = (ROOT / 'node_modules/react-native-navigation/lib/android/app/src/main/java/com/reactnativenavigation/views/bottomtabs/BottomTabs.java').read_text()


def method(text, name):
    match = re.search(r'    (?:public|private) (?:static )?[^\n]+ ' + name + r'\(', text)
    if not match:
        raise RuntimeError('Missing actual production method: ' + name)
    start = text.index('{', match.start())
    depth, end = 1, start + 1
    while depth:
        depth += (text[end] == '{') - (text[end] == '}')
        end += 1
    return text[match.start():end]


def field(text, name):
    match = re.search(r'    private (?:static )?[^\n;]+\b' + name + r'(?: = [^;]+)?;', text)
    if not match:
        raise RuntimeError('Missing actual production state field: ' + name)
    return match.group()


def run_checked(command):
    try:
        return subprocess.run(command, check=True, text=True, capture_output=True, timeout=30)
    except subprocess.CalledProcessError as error:
        raise RuntimeError('Host Java contract failed:\n' + error.stdout + error.stderr) from error


stubs = {
    'android/os/Build.java': '''package android.os; public class Build {
      public static String BRAND="fixture", MODEL="fixture";
      public static class VERSION { public static int SDK_INT=36; public static String RELEASE="16"; }
      public static class VERSION_CODES { public static final int N=24,P=28,R=30; }
    }''',
    'android/app/Activity.java': '''package android.app; public class Activity extends android.content.Context {
      public boolean multiWindow,finishing,destroyed;
      public boolean isInMultiWindowMode(){return multiWindow;}
      public boolean isFinishing(){return finishing;} public boolean isDestroyed(){return destroyed;}
    }''',
    'android/content/pm/PackageManager.java': '''package android.content.pm; public class PackageManager {
      public static final String FEATURE_SENSOR_HINGE_ANGLE="android.hardware.sensor.hinge_angle";
      public boolean feature; public boolean hasSystemFeature(String name) { return feature; }
    }''',
    'android/hardware/Sensor.java': '''package android.hardware; public class Sensor {
      public static final int TYPE_HINGE_ANGLE=36;
    }''',
    'android/hardware/SensorManager.java': '''package android.hardware; public class SensorManager {
      public boolean hinge; public Sensor getDefaultSensor(int type) {
        return hinge && type==36 ? new Sensor() : null;
      }
    }''',
    'android/view/Display.java': '''package android.view; public class Display {
      public static final int DEFAULT_DISPLAY=0; private Mode mode;
      public Display(int width,int height) { setMode(width,height); }
      public void setMode(int width,int height) { mode=new Mode(width,height); }
      public Mode getMode() { return mode; }
      public static class Mode { private final int width,height;
        public Mode(int width,int height) { this.width=width; this.height=height; }
        public int getPhysicalWidth(){return width;} public int getPhysicalHeight(){return height;}
      }
    }''',
    'android/hardware/display/DisplayManager.java': '''package android.hardware.display;
      import android.view.Display; public class DisplayManager {
      public Display display; public Display getDisplay(int id) { return display; }
    }''',
    'android/util/DisplayMetrics.java': '''package android.util; public class DisplayMetrics {
      public float density=2.625f;
    }''',
    'android/content/res/Resources.java': '''package android.content.res;
      import android.util.DisplayMetrics; public class Resources {
      public final DisplayMetrics metrics=new DisplayMetrics();
      public DisplayMetrics getDisplayMetrics(){return metrics;}
      public int getIdentifier(String name,String type,String owner){return name.equals("bottomTabs")?42:0;}
      public float getDimension(int id){return (id==1?64:80)*metrics.density;}
    }''',
    'android/content/Context.java': '''package android.content;
      import android.content.pm.PackageManager; import android.content.res.Resources;
      import android.hardware.SensorManager; import android.hardware.display.DisplayManager;
      public class Context { public static final String SENSOR_SERVICE="sensor", DISPLAY_SERVICE="display";
      public final PackageManager packages=new PackageManager(); public final Resources resources=new Resources();
      public final SensorManager sensors=new SensorManager(); public final DisplayManager displays=new DisplayManager();
      public PackageManager getPackageManager(){return packages;} public Resources getResources(){return resources;}
      public Object getSystemService(String name){return name.equals(SENSOR_SERVICE)?sensors:displays;}
    }''',
}



stubs.update({
    'android/graphics/Color.java': '''package android.graphics; public class Color {
      public static final int TRANSPARENT=0,WHITE=0xffffffff,BLACK=0xff000000;
      public static int alpha(int color){return color>>>24;}
    }''',
    'android/graphics/drawable/Drawable.java': '''package android.graphics.drawable; public class Drawable {}''',
    'android/graphics/drawable/ColorDrawable.java': '''package android.graphics.drawable;
      public class ColorDrawable extends Drawable {private final int color;
        public ColorDrawable(int value){color=value;} public int getColor(){return color;}}
    ''',
    'android/view/View.java': '''package android.view; public class View {
      public int left,top,right,bottom,layoutCalls,layoutRequests,paramUpdates,pivotResets,backgroundChanges;
      public android.graphics.drawable.Drawable background;
      public android.graphics.drawable.Drawable getBackground(){return background;}
      public void setBackgroundColor(int color){background=new android.graphics.drawable.ColorDrawable(color);backgroundChanges++;}
      public float scaleX=1,scaleY=1,pivotX,pivotY; public boolean pivotExplicit;
      public android.view.ViewGroup.LayoutParams params;
      public android.content.res.Resources resources=new android.content.res.Resources();
      public android.view.ViewGroup.LayoutParams getLayoutParams(){return params;}
      public void setLayoutParams(android.view.ViewGroup.LayoutParams value){params=value;paramUpdates++;}
      public int getWidth(){return right-left;} public int getHeight(){return bottom-top;}
      public android.content.res.Resources getResources(){return resources;}
      public float getScaleX(){return scaleX;} public float getScaleY(){return scaleY;}
      public void setScaleX(float value){scaleX=value;} public void setScaleY(float value){scaleY=value;}
      public float getPivotX(){return pivotExplicit?pivotX:getWidth()/2f;}
      public float getPivotY(){return pivotExplicit?pivotY:getHeight()/2f;}
      public void setPivotX(float value){pivotX=value;pivotExplicit=true;}
      public void setPivotY(float value){pivotY=value;pivotExplicit=true;}
      public boolean isPivotSet(){if(android.os.Build.VERSION.SDK_INT<28)throw new AssertionError("API28 pivot call");return pivotExplicit;}
      public void resetPivot(){if(android.os.Build.VERSION.SDK_INT<28)throw new AssertionError("API28 reset call");pivotExplicit=false;pivotResets++;}
      public void layout(int l,int t,int r,int b) {int oldWidth=right-left,oldHeight=bottom-top;
        boolean changed=left!=l||top!=t||right!=r||bottom!=b;
        left=l;top=t;right=r;bottom=b;layoutCalls++;
        if(oldWidth!=r-l||oldHeight!=b-t)onSizeChanged(r-l,b-t,oldWidth,oldHeight);
        onLayout(changed,l,t,r,b);}
      public void requestLayout(){layoutRequests++;}
      protected void onLayout(boolean changed,int l,int t,int r,int b){}
      protected void onSizeChanged(int w,int h,int oldw,int oldh){}
    }''',
    'android/view/ViewGroup.java': '''package android.view;
      public class ViewGroup extends View {
        public View child; public void addView(View value){child=value;}
        public static class LayoutParams {public int width,height; public LayoutParams(int w,int h){width=w;height=h;}}
      }''',
    'android/widget/FrameLayout.java': '''package android.widget;
      public class FrameLayout extends android.view.ViewGroup {
        public int nativeChildLayouts; public FrameLayout(android.content.Context context){}
        protected void onLayout(boolean changed,int l,int t,int r,int b){nativeChildLayouts++;
          if(child!=null){int w=child.right-child.left,h=child.bottom-child.top;child.layout(0,0,w,h);}}
      }''',
    'eightbitlab/com/blurview/BlurView.java': '''package eightbitlab.com.blurview;
      public class BlurView extends android.widget.FrameLayout {
        public int sizeUpdates; public BlurView(android.content.Context context){super(context);}
        protected void onSizeChanged(int w,int h,int oldw,int oldh){sizeUpdates++;}
      }''',
})


stubs.update({
    'android/view/Gravity.java': '''package android.view; public class Gravity {
      public static final int RIGHT=5,HORIZONTAL_GRAVITY_MASK=7,RELATIVE_LAYOUT_DIRECTION=0x800000;
    }''',
    'android/widget/LinearLayout.java': '''package android.widget;
      public class LinearLayout extends android.view.ViewGroup {
        public static class LayoutParams extends android.view.ViewGroup.LayoutParams {
          public int gravity=-1; public LayoutParams(int w,int h){super(w,h);}
        }
      }''',
    'com/aurelhubert/ahbottomnavigation/AHBottomNavigation.java': '''package com.aurelhubert.ahbottomnavigation;
      public class AHBottomNavigation extends android.view.ViewGroup {
        public enum TitleState {ALWAYS_SHOW,AUTO}
        public int count=5,defaultBackgroundColor=0,refreshes; public TitleState titleState=TitleState.ALWAYS_SHOW;
        public int getDefaultBackgroundColor(){return defaultBackgroundColor;}
        public void setDefaultBackgroundColor(int color){defaultBackgroundColor=color;refreshes++;}
        public int getItemsCount(){return count;} public TitleState getTitleState(){return titleState;}
      }''',
    'com/aurelhubert/ahbottomnavigation/R.java': '''package com.aurelhubert.ahbottomnavigation;
      public class R {public static class dimen {public static final int bottom_navigation_small_inactive_min_width=1,bottom_navigation_min_width=2;}}
    ''',
    'com/reactnativenavigation/views/bottomtabs/BottomTabs.java': '''package com.reactnativenavigation.views.bottomtabs;
      public class BottomTabs extends com.aurelhubert.ahbottomnavigation.AHBottomNavigation {
        /* ACTUAL PINNED RNN BACKGROUND SETTER */
      }''',
    'com/reactnativenavigation/views/bottomtabs/BottomTabsContainer.java': '''package com.reactnativenavigation.views.bottomtabs;
      public class BottomTabsContainer extends android.view.ViewGroup {
        public final BottomTabs tabs=new BottomTabs();public BottomTabs getBottomTabs(){return tabs;}
      }''',
})


key = 'com/reactnativenavigation/views/bottomtabs/BottomTabs.java'
stubs[key] = stubs[key].replace('/* ACTUAL PINNED RNN BACKGROUND SETTER */', method(rnn_tabs, 'setBackgroundColor'))

tab_probe = r'''
package com.xrpllabs.xumm;
import android.os.Build; import android.widget.LinearLayout;
import android.graphics.drawable.ColorDrawable; import android.graphics.drawable.Drawable;
import com.reactnativenavigation.views.bottomtabs.BottomTabs;
import com.reactnativenavigation.views.bottomtabs.BottomTabsContainer;
public class BottomTabLayoutProbe {
  static void check(String name,boolean value){if(!value)throw new AssertionError(name);System.out.println(name+":true");}
  static boolean close(double a,double b){return Math.abs(a-b)<0.001;}
  static BottomTabsContainer row(int width){BottomTabsContainer c=new BottomTabsContainer();
    c.tabs.params=new LinearLayout.LayoutParams(-1,147);c.tabs.layout(0,0,width,147);return c;}
  public static void main(String[] args){
    AndroidBottomTabLayout fit=new AndroidBottomTabLayout();BottomTabsContainer normal=row(1080);BottomTabs n=normal.tabs;
    fit.apply(normal,1080);
    check("tab-row-normal-phone-is-noop",n.paramUpdates==0&&!n.pivotExplicit&&n.scaleX==1&&n.scaleY==1&&n.backgroundChanges==0);
    BottomTabsContainer small=row(353);BottomTabs t=small.tabs;LinearLayout.LayoutParams p=(LinearLayout.LayoutParams)t.params;
    fit.apply(small,353);
    check("tab-row-all-five-use-ah-minimum-width",p.width==840&&t.getItemsCount()==5);
    check("tab-row-anchors-right-bottom",p.gravity==5&&t.getPivotX()==840&&t.getPivotY()==147);
    check("tab-row-uniform-scale-fits-column",close(t.scaleX,353f/840)&&t.scaleX==t.scaleY);
    check("tab-row-native-height-unchanged",p.height==147&&t.getHeight()==147);
    t.layout(353-840,0,353,147);fit.apply(small,353);
    check("tab-row-transformed-bounds-fit",close(t.left+t.getPivotX()*(1-t.scaleX),0)&&close(t.getWidth()*t.scaleX,353));
    check("tab-row-five-transformed-targets-inside",close(5*168*t.scaleX,353));
    check("tab-row-no-layout-loop",t.paramUpdates==1);
    fit.apply(small,840);
    check("tab-row-restores-original-params-scales",p.width==-1&&p.gravity==-1&&t.scaleX==1&&t.scaleY==1);
    t.layout(0,0,1080,147);
    check("tab-row-restores-implicit-centre-pivot",!t.pivotExplicit&&t.pivotResets==1&&t.getPivotX()==540);
    int updates=t.paramUpdates;fit.apply(small,1080);
    check("tab-row-restored-normal-is-noop",t.paramUpdates==updates&&t.pivotResets==1);
    BottomTabsContainer custom=row(486);BottomTabs x=custom.tabs;
    x.setScaleX(1.1f);x.setScaleY(.9f);x.setPivotX(13);x.setPivotY(17);
    fit.apply(custom,486);fit.apply(custom,1080);
    check("tab-row-restores-explicit-native-transform",x.scaleX==1.1f&&x.scaleY==.9f&&x.getPivotX()==13&&x.getPivotY()==17);
    fit.apply(custom,486);BottomTabsContainer replacement=row(1080);fit.apply(replacement,1080);
    check("tab-row-new-root-keeps-own-layout",replacement.tabs.paramUpdates==0&&!replacement.tabs.pivotExplicit);
    Build.VERSION.SDK_INT=26;BottomTabsContainer legacy=row(486);fit.apply(legacy,486);fit.apply(legacy,1080);
    check("tab-row-old-api-restores-without-new-pivot-api",legacy.tabs.scaleX==1&&legacy.tabs.scaleY==1&&legacy.tabs.pivotResets==0);
    BottomTabsContainer unready=row(0);unready.tabs.layout(0,0,0,0);fit.apply(unready,353);
    check("tab-row-unmeasured-native-height-defers",unready.tabs.paramUpdates==0);
    int dark=0xff171924,white=0xffffffff;
    BottomTabsContainer theme=row(1080);theme.background=new ColorDrawable(dark);
    theme.tabs.background=new ColorDrawable(white);theme.tabs.defaultBackgroundColor=white;
    fit.apply(theme,1080);
    check("tab-theme-opaque-stale-child-follows-dark-parent",((ColorDrawable)theme.tabs.background).getColor()==dark);
    check("tab-theme-syncs-ah-default-through-actual-rnn-setter",theme.tabs.defaultBackgroundColor==dark&&theme.tabs.backgroundChanges==1&&theme.tabs.refreshes==1);
    fit.apply(theme,1080);fit.apply(theme,1080);
    check("tab-theme-repeat-has-no-refresh-or-layout",theme.tabs.backgroundChanges==1&&theme.tabs.refreshes==1&&theme.tabs.paramUpdates==0);
    theme.background=new ColorDrawable(white);fit.apply(theme,1080);
    check("tab-theme-also-restores-light-color-once",theme.tabs.defaultBackgroundColor==white&&theme.tabs.backgroundChanges==2&&theme.tabs.refreshes==2);
    BottomTabsContainer transparent=row(1080);transparent.background=new ColorDrawable(dark);
    transparent.tabs.background=new ColorDrawable(0);fit.apply(transparent,1080);
    check("tab-theme-transparent-ah-default-untouched",transparent.tabs.backgroundChanges==0&&transparent.tabs.defaultBackgroundColor==0);
    BottomTabsContainer translucent=row(1080);translucent.background=new ColorDrawable(0x7f171924);
    translucent.tabs.background=new ColorDrawable(white);translucent.tabs.defaultBackgroundColor=white;fit.apply(translucent,1080);
    check("tab-theme-translucent-parent-untouched",translucent.tabs.backgroundChanges==0&&translucent.tabs.defaultBackgroundColor==white);
    BottomTabsContainer startup=row(1080);startup.background=new ColorDrawable(dark);fit.apply(startup,1080);
    check("tab-theme-null-default-startup-untouched",startup.tabs.background==null&&startup.tabs.backgroundChanges==0&&startup.tabs.paramUpdates==0);
    BottomTabsContainer drawable=row(1080);drawable.background=new Drawable();drawable.tabs.background=new ColorDrawable(white);fit.apply(drawable,1080);
    check("tab-theme-noncolor-parent-untouched",drawable.tabs.backgroundChanges==0);
    BottomTabsContainer defaultOnly=row(1080);defaultOnly.background=new ColorDrawable(dark);
    defaultOnly.tabs.background=new ColorDrawable(dark);defaultOnly.tabs.defaultBackgroundColor=white;fit.apply(defaultOnly,1080);fit.apply(defaultOnly,1080);
    check("tab-theme-default-only-mismatch-syncs-once",defaultOnly.tabs.defaultBackgroundColor==dark&&defaultOnly.tabs.backgroundChanges==1&&defaultOnly.tabs.refreshes==1);
    BottomTabsContainer ownOnly=row(1080);ownOnly.background=new ColorDrawable(dark);
    ownOnly.tabs.background=new ColorDrawable(white);ownOnly.tabs.defaultBackgroundColor=dark;fit.apply(ownOnly,1080);fit.apply(ownOnly,1080);
    check("tab-theme-own-only-mismatch-does-not-refresh-items",((ColorDrawable)ownOnly.tabs.background).getColor()==dark&&ownOnly.tabs.backgroundChanges==1&&ownOnly.tabs.refreshes==0);

    BottomTabsContainer early=row(0);early.tabs.layout(0,0,0,0);early.background=new ColorDrawable(dark);
    early.tabs.background=new ColorDrawable(white);early.tabs.defaultBackgroundColor=white;fit.apply(early,0);
    check("tab-theme-reconciles-before-size-return",early.tabs.defaultBackgroundColor==dark&&early.tabs.backgroundChanges==1&&early.tabs.paramUpdates==0);

  }
}
'''

blur_probe = r'''
package libs.ui;
import android.content.Context; import android.view.View;
public class BlurLayoutProbe {
  /* ACTUAL BLUR MANAGER SETTER */
  static void check(String name,boolean value){if(!value)throw new AssertionError(name);System.out.println(name+":true");}
  static void yoga(View child){child.layout(5250,5250,6134,7458);}
  public static void main(String[] args){
    AdaptiveBlurView view=new AdaptiveBlurView(new Context());View child=new View();yoga(child);view.addView(child);
    view.layout(0,0,1768,2208);
    check("blur-default-delegates-existing-framelayout",view.nativeChildLayouts==1&&child.left==0&&child.top==0);
    check("blur-default-has-no-extra-layout-request",view.layoutRequests==0);
    yoga(child);int before=child.layoutCalls;
    BlurLayoutProbe manager=new BlurLayoutProbe();manager.setPreserveReactChildLayout(view,true);
    check("blur-adaptive-toggle-requests-layout-once",view.layoutRequests==1);
    view.layout(0,0,1768,2208);
    check("blur-adaptive-preserves-yoga-child-frame",child.left==5250&&child.top==5250&&child.right==6134&&child.bottom==7458);
    check("blur-adaptive-does-not-relayout-children",child.layoutCalls==before&&view.nativeChildLayouts==1);
    manager.setPreserveReactChildLayout(view,true);
    check("blur-repeated-prop-does-not-request-layout",view.layoutRequests==1);
    view.layout(0,0,884,2208);
    check("blur-size-notification-remains-inherited",view.sizeUpdates==2);
    check("blur-native-bounds-unchanged",view.right-view.left==884&&view.bottom-view.top==2208);
    manager.setPreserveReactChildLayout(view,false);view.layout(0,0,884,2208);
    check("blur-false-restores-native-child-layout",child.left==0&&child.top==0&&view.nativeChildLayouts==2);
    check("blur-restore-requests-layout-once",view.layoutRequests==2);
  }
}
'''
blur_probe = blur_probe.replace('/* ACTUAL BLUR MANAGER SETTER */', method(blur_manager, 'setPreserveReactChildLayout'))

host_launch = r'''
package com.xrpllabs.xumm;
import java.lang.ref.WeakReference;
import android.content.res.Resources;
interface ViewParent {}
class View implements ViewParent {
  ViewParent parent; int width; ViewGroup.LayoutParams params; int mutations;
  ViewParent getParent(){return parent;} int getWidth(){return width;}
  ViewGroup.LayoutParams getLayoutParams(){return params;}
  void setLayoutParams(ViewGroup.LayoutParams value){params=value;mutations++;}
}
class ViewGroup extends View {
  static class LayoutParams { static final int MATCH_PARENT=-1; int width,height;
    LayoutParams(int width,int height){this.width=width;this.height=height;}
  }
}
class CoordinatorLayout extends ViewGroup {
  static class LayoutParams extends ViewGroup.LayoutParams {
    int leftMargin,rightMargin,topMargin,bottomMargin,gravity;
    LayoutParams(int width,int height){super(width,height);}
  }
}
class BottomTabsContainer extends ViewGroup {}
class Gravity { static final int RIGHT=5,BOTTOM=80,HORIZONTAL_GRAVITY_MASK=7,RELATIVE_LAYOUT_DIRECTION=0x800000; }
public class LaunchActivity {
  /* ACTUAL LAUNCH STATE */
  View innerTabs; boolean finishing; final Resources resources=new Resources();
  Resources getResources(){return resources;} String getPackageName(){return "fixture";}
  View findViewById(int id){return id==42?innerTabs:null;} boolean isFinishing(){return finishing;}
  static void current(LaunchActivity activity){currentLaunch=activity==null?null:new WeakReference<>(activity);}
  void layout(){applyAndroidWindowColumn();}
  private void applyAndroidBottomTabRow(){}
  /* ACTUAL LAUNCH METHODS */
}
'''
host_launch = host_launch.replace('/* ACTUAL LAUNCH STATE */', '\n'.join(
    field(launch, name) for name in ['currentLaunch', 'desiredWindowColumnWidthDp', 'columnTabs',
                                  'tabsColumnConstrained', 'originalTabsLeftMargin', 'originalTabsGravity']))
host_launch = host_launch.replace('/* ACTUAL LAUNCH METHODS */', '\n'.join(
    method(launch, name) for name in [
        'setAndroidWindowColumnWidth', 'applyAndroidWindowColumn', 'findNativeBottomTabsContainer']))

host_bridge = r'''
package com.xrpllabs.xumm;
import java.util.*; import android.content.Context; import android.os.Build;
class SafeAreaInsets { static int getSafeAreaBottom(){return 0;} }
class PixelUtil { static float toDIPFromPixel(float px){return px/2.625f;} }
class UiThreadUtil { static final List<Runnable> queued=new ArrayList<>();
  static void runOnUiThread(Runnable work){queued.add(work);}
  static void drain(){for(Runnable work:new ArrayList<>(queued))work.run();queued.clear();}
}
class BridgeProbe {
  final Context reactContext; BridgeProbe(Context context){reactContext=context;}
  int statusBarTopDp(){return 24;}
  /* ACTUAL DEVICEUTILS METHODS */
}
'''
host_bridge = host_bridge.replace('/* ACTUAL DEVICEUTILS METHODS */', '\n'.join(
    method(bridge, name) for name in ['getConstants', 'setAndroidWindowColumnWidth']))

probe = r'''
package com.xrpllabs.xumm;
import android.app.Activity; import android.content.Context; import android.os.Build; import android.view.Display;
import java.util.*;
public class WindowLayoutProbe {
  static void check(String name, boolean value){if(!value)throw new AssertionError(name);System.out.println(name+":true");}
  static boolean close(double a,double b){return Math.abs(a-b)<1e-10;}
  static Context fixture(boolean feature,boolean sensor,int width,int height){
    Context c=new Context();c.packages.feature=feature;c.sensors.hinge=sensor;c.displays.display=new Display(width,height);return c;
  }
  static Activity ordinaryActivity(boolean multiWindow,int width,int height){
    Activity activity=new Activity();activity.multiWindow=multiWindow;activity.displays.display=new Display(width,height);
    AndroidWindowLayout.initialize(activity);return activity;
  }
  static Map<String,Object> exported(Context c){return new BridgeProbe(c).getConstants();}
  static void windowExport(Activity activity){
    Context reactContext=new Context();reactContext.displays.display=activity.displays.display;
    reactContext.resources.metrics.density=activity.resources.metrics.density;
    Map<String,Object> values=exported(reactContext);Map<?,?> box=(Map<?,?>)values.get("androidWindowLayout");
    check("ordinary-multiwindow-full-model",box!=null&&box.get("width") instanceof Double&&box.get("height") instanceof Double
      &&close((Double)box.get("width"),411.42857142857144)&&close((Double)box.get("height"),914.2857142857143));
    check("ordinary-multiwindow-keeps-nonfold-identity",!values.containsKey("androidFoldLayout"));
  }
  static void phoneExport(Context c){
    Map<String,Object> values=exported(c);Map<?,?> box=(Map<?,?>)values.get("androidFoldLayout");
    check("new-android-capability",Boolean.TRUE.equals(values.get("supportsAndroidWindowLayout")));
    check("exact-double-phone-model",box!=null && box.get("width") instanceof Double && box.get("height") instanceof Double
      && close((Double)box.get("width"),336.76190476190476) && close((Double)box.get("height"),841.1428571428571));
    check("native-bar-height-unchanged",((Map<?,?>)values.get("tabBarMetrics")).get("itemHeight").equals(56));
  }
  static class Tabs {
    final LaunchActivity activity=new LaunchActivity(); final BottomTabsContainer container=new BottomTabsContainer();
    final CoordinatorLayout parent=new CoordinatorLayout(); final View inner=new View();
    final CoordinatorLayout.LayoutParams params=new CoordinatorLayout.LayoutParams(-1,147);
    Tabs(int width,int left){parent.width=width;container.parent=parent;inner.parent=container;params.leftMargin=left;
      params.gravity=Gravity.BOTTOM;params.rightMargin=0;params.bottomMargin=11;container.params=params;activity.innerTabs=inner;
      LaunchActivity.current(activity);}
    void width(double value){LaunchActivity.setAndroidWindowColumnWidth(value);}
  }
  static void geometry(){
    AndroidWindowLayoutMath.PhoneBox cover=AndroidWindowLayoutMath.phoneBox(884,2208,2.625);
    AndroidWindowLayoutMath.PhoneBox open=AndroidWindowLayoutMath.phoneBox(1768,2208,2.625);
    check("cover-cold-inner-same-model",close(cover.widthDp,open.widthDp)&&close(cover.heightDp,open.heightDp));
    check("physical-double-precision",close(open.widthDp,336.76190476190476)&&close(open.heightDp,841.1428571428571));
    check("ordinary-full-model-never-halves",close(AndroidWindowLayoutMath.windowBox(2400,1080,2.625).widthDp,411.42857142857144)
      &&close(AndroidWindowLayoutMath.windowBox(2400,1080,2.625).heightDp,914.2857142857143));
    check("ordinary-invalid-model-rejected",AndroidWindowLayoutMath.windowBox(0,2400,2.625)==null
      &&AndroidWindowLayoutMath.windowBox(1080,2400,Double.NaN)==null);
    check("600dp-is-expanded",close(AndroidWindowLayoutMath.phoneBox(1200,2000,2).widthDp,300));
    check("below600dp-is-phone",close(AndroidWindowLayoutMath.phoneBox(1198,2000,2).widthDp,599));
    check("invalid-model-rejected",AndroidWindowLayoutMath.phoneBox(0,2208,2.625)==null
      &&AndroidWindowLayoutMath.phoneBox(884,0,2.625)==null&&AndroidWindowLayoutMath.phoneBox(884,2208,0)==null
      &&AndroidWindowLayoutMath.phoneBox(884,2208,Double.NaN)==null);
    for(double value:new double[]{Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY,0,-1,10001})
      check("reject-invalid-width-"+Double.toString(value),!AndroidWindowLayoutMath.validColumnWidth(value)
        &&AndroidWindowLayoutMath.columnWidthPx(value,2.625,1768)==0);
    check("scaled-physical-column",AndroidWindowLayoutMath.columnWidthPx(open.widthDp*.8,2.625,1768)==707);
    check("missing-parent-defers",AndroidWindowLayoutMath.columnWidthPx(open.widthDp,2.625,0)==0);
    check("full-width-rounding-no-gap",AndroidWindowLayoutMath.columnWidthPx((1768-.4)/2.625,2.625,1768)==-1);
    check("oversized-request-restores",AndroidWindowLayoutMath.columnWidthPx(10000,2.625,1768)==-1);
  }
  static void tabs(){
    double phone=336.76190476190476;Tabs f=new Tabs(1768,7);f.activity.layout();
    check("no-request-no-mutation",f.container.mutations==0);
    f.width(1768/2.625);check("normal-full-width-is-noop",f.container.mutations==0&&f.params.width==-1&&f.params.leftMargin==7);
    f.width(phone);check("right-aligned-native-container",f.params.width==884&&f.params.leftMargin==884&&f.params.gravity==(80|5));
    check("height-and-other-margins-preserved",f.params.height==147&&f.params.bottomMargin==11&&f.params.rightMargin==0);
    check("only-native-tab-container-mutated",f.parent.mutations==0&&f.inner.mutations==0&&f.container.mutations==1);
    f.activity.layout();f.width(phone);check("no-global-layout-loop",f.container.mutations==1);
    f.width(10000);check("restore-native-layout",f.params.width==-1&&f.params.leftMargin==7&&f.params.gravity==80&&f.params.height==147);
    f.activity.layout();check("restored-full-width-noop",f.container.mutations==2);
    f.width(phone);Tabs replacement=new Tabs(884,3);replacement.activity.layout();
    check("new-root-full-width-never-restores-old-params",replacement.container.mutations==0&&replacement.params.leftMargin==3);
    replacement.parent.width=1768;replacement.activity.layout();replacement.width(10000);
    check("new-root-restores-own-gravity-margin",replacement.params.width==-1&&replacement.params.leftMargin==3&&replacement.params.gravity==80);
    Tabs waiting=new Tabs(0,0);waiting.width(phone);check("unmeasured-parent-defers",waiting.container.mutations==0);
    waiting.parent.width=1768;waiting.activity.layout();check("first-measure-applies-pending-width",waiting.params.width==884);
    Tabs wrongType=new Tabs(1768,0);wrongType.container.params=new ViewGroup.LayoutParams(-1,147);wrongType.width(phone);
    check("foreign-layout-params-untouched",wrongType.container.mutations==0);
    Tabs noContainer=new Tabs(1768,0);noContainer.inner.parent=noContainer.parent;noContainer.width(phone);
    check("coordinator-is-never-resized",noContainer.parent.mutations==0&&noContainer.container.mutations==0);
    LaunchActivity.current(null);BridgeProbe b=new BridgeProbe(fixture(false,false,1080,2400));b.setAndroidWindowColumnWidth(phone);
    check("bridge-queues-on-ui-thread",UiThreadUtil.queued.size()==1);UiThreadUtil.drain();
    Tabs late=new Tabs(1768,0);late.activity.layout();check("width-survives-before-activity",late.params.width==884);
    for(double value:new double[]{Double.NaN,0,-2,10001})b.setAndroidWindowColumnWidth(value);
    check("invalid-bridge-input-does-not-queue",UiThreadUtil.queued.isEmpty());
    late.activity.finishing=true;b.setAndroidWindowColumnWidth(10000);UiThreadUtil.drain();
    check("finishing-window-not-mutated",late.params.width==884);
    Tabs recreated=new Tabs(1768,0);recreated.activity.layout();check("new-activity-uses-latest-width",recreated.container.mutations==0);
  }
  public static void main(String[] args){
    String scenario=args[0];Context c;
    switch(scenario){
      case "ordinary-cold-split":windowExport(ordinaryActivity(true,1080,2400));return;
      case "ordinary-fullscreen":
        check("ordinary-fullscreen-has-no-window-hint",!exported(ordinaryActivity(false,1080,2400)).containsKey("androidWindowLayout"));return;
      case "ordinary-recreate":{
        Activity first=ordinaryActivity(false,1080,2400);
        check("ordinary-before-split-has-no-hint",!exported(first).containsKey("androidWindowLayout"));
        first.multiWindow=true;windowExport(first);
        AndroidWindowLayoutMath.PhoneBox model=AndroidWindowLayout.windowBox(first);first.destroyed=true;
        Activity replacement=ordinaryActivity(true,2400,1080);windowExport(replacement);
        check("ordinary-recreated-activity-refreshes-before-cache-guard",AndroidWindowLayout.windowBox(replacement)==model);
        replacement.multiWindow=false;
        check("ordinary-return-fullscreen-omits-hint",!exported(replacement).containsKey("androidWindowLayout"));
        replacement.multiWindow=true;replacement.finishing=true;
        check("ordinary-finishing-activity-omits-hint",!exported(replacement).containsKey("androidWindowLayout"));return;}
      case "fold-multiwindow":{
        Activity fold=new Activity();fold.multiWindow=true;fold.packages.feature=true;fold.displays.display=new Display(1768,2208);
        AndroidWindowLayout.initialize(fold);phoneExport(fold);
        check("fold-never-exports-ordinary-model",!exported(fold).containsKey("androidWindowLayout"));return;}
      case "ordinary-no-activity":
        check("ordinary-missing-activity-omits-hint",!exported(fixture(false,false,1080,2400)).containsKey("androidWindowLayout"));return;
      case "ordinary-late-mode":{
        Activity late=ordinaryActivity(true,0,2400);
        check("ordinary-unready-mode-safe",!exported(late).containsKey("androidWindowLayout"));
        late.displays.display.setMode(1080,2400);windowExport(late);return;}
      case "ordinary-pre24":Build.VERSION.SDK_INT=23;
        check("pre24-multiwindow-api-not-called",!exported(ordinaryActivity(true,1080,2400)).containsKey("androidWindowLayout"));return;
      case "math":geometry();return;
      case "tabs":tabs();return;
      case "normal-phone":case "tablet":
        c=fixture(false,false,scenario.equals("tablet")?3200:1080,2400);
        check("ordinary-new-android-capability",Boolean.TRUE.equals(exported(c).get("supportsAndroidWindowLayout")));
        check("ordinary-device-no-fold-model",!exported(c).containsKey("androidFoldLayout"));return;
      case "feature":phoneExport(fixture(true,false,884,2208));return;
      case "sensor":phoneExport(fixture(false,true,884,2208));return;
      case "cold-inner":phoneExport(fixture(true,true,1768,2208));return;
      case "old-api":Build.VERSION.SDK_INT=29;c=fixture(true,true,1768,2208);
        check("pre30-no-hinge-api",!AndroidWindowLayout.isFoldCapable(c)&&!exported(c).containsKey("androidFoldLayout"));return;
      case "stable-runtime":c=fixture(true,false,884,2208);
        AndroidWindowLayoutMath.PhoneBox first=AndroidWindowLayout.phoneBox(c);c.displays.display.setMode(2208,1768);
        check("unfold-rotation-jsreload-keep-model",first==AndroidWindowLayout.phoneBox(c));phoneExport(c);return;
      case "late-display":c=fixture(true,false,0,0);c.displays.display=null;
        check("missing-display-safe",AndroidWindowLayout.phoneBox(c)==null);c.displays.display=new Display(1768,2208);phoneExport(c);return;
      case "late-mode":c=fixture(false,true,0,2208);check("unready-mode-safe",AndroidWindowLayout.phoneBox(c)==null);
        c.displays.display.setMode(1768,2208);phoneExport(c);return;
      default:throw new AssertionError(scenario);
    }
  }
}
'''

with tempfile.TemporaryDirectory(prefix='xaman-android-window-') as directory:
    work = Path(directory)
    files = []
    for name, value in stubs.items():
        target = work / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value)
        files.append(str(target))
    for name, value in [('LaunchActivity.java', host_launch), ('BridgeProbe.java', host_bridge),
                        ('WindowLayoutProbe.java', probe), ('BlurLayoutProbe.java', blur_probe),
                        ('BottomTabLayoutProbe.java', tab_probe)]:
        target = work / name
        target.write_text(value)
        files.append(str(target))
    production = [NATIVE / 'AndroidWindowLayoutMath.java', NATIVE / 'AndroidWindowLayout.java',
                  ROOT / 'android/app/src/main/java/libs/ui/AdaptiveBlurView.java', NATIVE / 'AndroidBottomTabLayout.java']
    java_home = Path(os.environ.get('JAVA_HOME', '')) / 'bin'
    javac = str(java_home / 'javac') if (java_home / 'javac').is_file() else 'javac'
    java = str(java_home / 'java') if (java_home / 'java').is_file() else 'java'
    run_checked([javac, '-encoding', 'UTF-8', '-d', str(work), *map(str, production), *files])
    results = []
    for scenario in ['math', 'tabs', 'normal-phone', 'tablet', 'feature', 'sensor', 'cold-inner',
                     'old-api', 'stable-runtime', 'late-display', 'late-mode',
                     'ordinary-cold-split', 'ordinary-fullscreen', 'ordinary-recreate', 'fold-multiwindow',
                     'ordinary-no-activity', 'ordinary-late-mode', 'ordinary-pre24']:
        run = run_checked([java, '-cp', str(work), 'com.xrpllabs.xumm.WindowLayoutProbe', scenario])
        results.extend(line for line in run.stdout.splitlines() if line)
    run = run_checked([java, '-cp', str(work), 'libs.ui.BlurLayoutProbe'])
    results.extend(line for line in run.stdout.splitlines() if line)
    run = run_checked([java, '-cp', str(work), 'com.xrpllabs.xumm.BottomTabLayoutProbe'])
    results.extend(line for line in run.stdout.splitlines() if line)
    failed = [line for line in results if not line.endswith(':true')]
    print(json.dumps({'cases': len(results), 'passed': len(results) - len(failed), 'failures': failed,
                      'actual_production_methods_compiled': True, 'actual_production_state_compiled': True,
                      'actual_production_blur_class_and_setter_compiled': True,
                      'actual_pinned_rnn_background_setter_compiled': True,
                      'assertions': [line[:-5] for line in results if line.endswith(':true')],
                      'native_source_sha256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                                               for p in [*production, NATIVE / 'LaunchActivity.java',
                                                         ROOT / 'android/app/src/main/java/libs/utils/DeviceUtilsModule.java',
                                                         ROOT / 'android/app/src/main/java/libs/ui/BlurViewModule.java']},
                      'scope': 'Host Java public-API/view doubles, not native device rendering'}))
