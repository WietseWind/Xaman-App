#!/usr/bin/env python3
"""Compile the whole production KeyboardProvider against public Android doubles.

The PopupWindow double models its documented touchable=true default. Native
InputDispatcher/window evidence remains the separate platform proof.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'android/app/src/main/java/libs/ui/KeyboardProvider.java'
sources = {
    'android/content/Context.java': 'package android.content; public class Context {}',
    'android/app/Activity.java': """package android.app;
      public class Activity extends android.content.Context {
        private final android.view.Window window=new android.view.Window(this);
        public android.view.Window getWindow(){return window;}}
    """,
    'android/view/Window.java': """package android.view;
      public class Window {private final View decor;
        public Window(android.app.Activity activity){decor=new View(activity);}
        public View getDecorView(){return decor;}}
    """,
    'android/graphics/Rect.java': """package android.graphics;
      public class Rect {public int left,top,right,bottom;
        public void set(Rect r){left=r.left;top=r.top;right=r.right;bottom=r.bottom;}
        public int height(){return bottom-top;}}
    """,
    'android/graphics/drawable/Drawable.java': 'package android.graphics.drawable; public class Drawable {}',
    'android/graphics/drawable/ColorDrawable.java': """package android.graphics.drawable;
      public class ColorDrawable extends Drawable {private final int color;
        public ColorDrawable(int value){color=value;}public int getColor(){return color;}}
    """,
    'android/view/ViewTreeObserver.java': """package android.view;
      public class ViewTreeObserver {public OnGlobalLayoutListener listener;public int registrations;
        public interface OnGlobalLayoutListener {void onGlobalLayout();}
        public void addOnGlobalLayoutListener(OnGlobalLayoutListener value){listener=value;registrations++;}}
    """,
    'android/view/View.java': """package android.view;
      public class View {public final android.app.Activity activity;public boolean attached;
        public final android.graphics.Rect frame=new android.graphics.Rect();
        private final ViewTreeObserver observer=new ViewTreeObserver();
        public View(android.app.Activity value){activity=value;}
        public ViewTreeObserver getViewTreeObserver(){return observer;}
        public boolean isAttachedToWindow(){return attached;}
        public void getWindowVisibleDisplayFrame(android.graphics.Rect out){out.set(frame);}}
    """,
    'android/view/Gravity.java': 'package android.view; public class Gravity {public static final int NO_GRAVITY=0;}',
    'android/view/WindowManager.java': """package android.view;
      public interface WindowManager {class LayoutParams {
        public static final int MATCH_PARENT=-1,SOFT_INPUT_ADJUST_RESIZE=16;}}
    """,
    'android/widget/PopupWindow.java': """package android.widget;
      import android.app.Activity;import android.view.View;import android.graphics.drawable.Drawable;
      public class PopupWindow {public static final int INPUT_METHOD_NEEDED=1;
        private boolean touchable=true,focusable=false,touchModal=true,outsideTouchable=false,showing;
        private int width,height,softInputMode,inputMethodMode;private View content;private Drawable background;
        public int touchableCalls,focusableCalls,touchModalCalls,outsideTouchableCalls,showCalls,dismissCalls;
        public boolean touchableAtShow;public View showAnchor;public int showGravity,showX,showY;
        public PopupWindow(Activity activity){}
        public void setContentView(View v){content=v;}public View getContentView(){return content;}
        public void setBackgroundDrawable(Drawable v){background=v;}public Drawable getBackground(){return background;}
        public void setWidth(int v){width=v;}public int getWidth(){return width;}
        public void setHeight(int v){height=v;}public int getHeight(){return height;}
        public void setSoftInputMode(int v){softInputMode=v;}public int getSoftInputMode(){return softInputMode;}
        public void setInputMethodMode(int v){inputMethodMode=v;}public int getInputMethodMode(){return inputMethodMode;}
        public void setTouchable(boolean v){touchable=v;touchableCalls++;}public boolean isTouchable(){return touchable;}
        public void setFocusable(boolean v){focusable=v;focusableCalls++;}public boolean isFocusable(){return focusable;}
        public void setTouchModal(boolean v){touchModal=v;touchModalCalls++;}public boolean isTouchModal(){return touchModal;}
        public void setOutsideTouchable(boolean v){outsideTouchable=v;outsideTouchableCalls++;}
        public boolean isOutsideTouchable(){return outsideTouchable;}
        public boolean isShowing(){return showing;}
        public void showAtLocation(View anchor,int gravity,int x,int y){showCalls++;showing=true;
          touchableAtShow=touchable;showAnchor=anchor;showGravity=gravity;showX=x;showY=y;content.attached=true;}
        public void dismiss(){dismissCalls++;showing=false;if(content!=null)content.attached=false;}}
    """,
    'libs/ui/KeyboardProvider.java': SOURCE.read_text(),
    'libs/ui/KeyboardObserverTouchProbe.java': """package libs.ui;
      import android.app.Activity;import android.widget.PopupWindow;import android.view.View;
      import android.view.WindowManager.LayoutParams;import android.graphics.Rect;
      import android.graphics.drawable.ColorDrawable;
      public class KeyboardObserverTouchProbe {
        static void check(String name,boolean value){System.out.println(name+":"+value);}
        public static void main(String[] args){
          Activity activity=new Activity();PopupWindow defaultPopup=new PopupWindow(activity);
          check("platform-default-control-is-touchable",defaultPopup.isTouchable());
          KeyboardProvider provider=new KeyboardProvider(activity);View root=provider.getContentView();
          check("invisible-keyboard-observer-never-owns-touch",!provider.isTouchable());
          check("observer-root-retains-activity",root!=null&&root.activity==activity);
          check("observer-width-remains-zero",provider.getWidth()==0);
          check("observer-height-remains-match-parent",provider.getHeight()==LayoutParams.MATCH_PARENT);
          check("observer-background-remains-transparent",((ColorDrawable)provider.getBackground()).getColor()==0);
          check("legacy-adjust-resize-retained",provider.getSoftInputMode()==LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
          check("legacy-input-method-needed-retained",provider.getInputMethodMode()==PopupWindow.INPUT_METHOD_NEEDED);
          check("legacy-layout-listener-retained",root.getViewTreeObserver().listener==provider&&root.getViewTreeObserver().registrations==1);
          check("constructor-does-not-show-window",!provider.isShowing()&&provider.showCalls==0);
          check("default-focusable-policy-unchanged",!provider.isFocusable()&&provider.focusableCalls==0);
          check("default-modal-policy-unchanged",provider.isTouchModal()&&provider.touchModalCalls==0);
          check("default-outside-touch-policy-unchanged",!provider.isOutsideTouchable()&&provider.outsideTouchableCalls==0);
          check("hidden-observer-has-no-visible-frame",provider.getVisibleWindowFrame()==null);
          check("init-retains-instance",provider.init()==provider);
          check("first-show-is-non-touchable",provider.showCalls==1&&!provider.touchableAtShow);
          check("show-retains-decor-anchor",provider.showAnchor==activity.getWindow().getDecorView());
          check("show-retains-zero-origin-gravity",provider.showGravity==0&&provider.showX==0&&provider.showY==0);
          provider.init();check("repeated-init-does-not-reshow",provider.showCalls==1);
          root.frame.top=74;root.frame.bottom=1017;root.frame.right=1080;
          Rect frame=provider.getVisibleWindowFrame();
          check("attached-observer-geometry-still-readable",frame!=null&&frame.top==74&&frame.bottom==1017&&frame.right==1080);
          check("geometry-copy-does-not-expose-observer-frame",frame!=root.frame);
          root.attached=false;check("detached-observer-frame-remains-unavailable",provider.getVisibleWindowFrame()==null);
          root.attached=true;root.frame.bottom=root.frame.top;
          check("empty-observer-frame-remains-unavailable",provider.getVisibleWindowFrame()==null);
          provider.onDestroy();check("destroy-still-dismisses-observer",provider.dismissCalls==1&&!provider.isShowing());
          check("destroyed-observer-never-becomes-touchable",!provider.isTouchable());
        }
      }
    """,
}
java_home = os.environ.get('JAVA_HOME')
def executable(name):
    return str(Path(java_home) / 'bin' / name) if java_home else name

with tempfile.TemporaryDirectory(prefix='xaman-keyboard-observer-touch-') as directory:
    target = Path(directory)
    for name, source in sources.items():
        file = target / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(source)
    completed = subprocess.run([executable('javac'), '-d', str(target),
        *[str(target / name) for name in sources]], capture_output=True, text=True, timeout=30)
    if completed.returncode:
        raise RuntimeError(completed.stdout + completed.stderr)
    completed = subprocess.run([executable('java'), '-cp', str(target),
        'libs.ui.KeyboardObserverTouchProbe'], capture_output=True, text=True, timeout=30)
    if completed.returncode:
        raise RuntimeError(completed.stdout + completed.stderr)
assertions = dict(line.split(':', 1) for line in completed.stdout.splitlines() if ':' in line)
failures = [name for name, value in assertions.items() if value != 'true']
report = {'actual_full_keyboard_provider_compiled': True,
    'cases': len(assertions), 'passed': len(assertions) - len(failures),
    'assertions': list(assertions), 'failures': failures,
    'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'scope': 'Actual production class with public Android API doubles; native input/window proof is separate'}
print(json.dumps(report))
raise SystemExit(1 if failures else 0)
