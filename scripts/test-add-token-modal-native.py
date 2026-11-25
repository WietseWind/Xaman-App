#!/usr/bin/env python3
"""Exercise the installed Android modal lifecycle Java without a device.

Compile the actual react-native-navigation ModalPresenter and ModalStack against
small Android/animation doubles. This checks callback ordering and ownership,
not Android rendering. Requires javac/java; run after applying package patches.
Use --presenter/--stack to prove the same assertions fail an older source copy.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = 'com/reactnativenavigation/viewcontrollers/modal'
NATIVE = ROOT / 'node_modules/react-native-navigation/lib/android/app/src/main/java'

STUBS = {
    'android/content/Context.java': 'package android.content; public class Context {}',
    'android/content/res/Configuration.java': 'package android.content.res; public class Configuration {}',
    'android/view/View.java': '''package android.view;
public class View {
 public static final int VISIBLE=0,GONE=8; public int visibility=VISIBLE,alphaWrites; public float alpha;
 public ViewGroup parent; public void setVisibility(int value){visibility=value;}
 public void setAlpha(float value){alpha=value;alphaWrites++;}
}''',
    'android/view/ViewGroup.java': '''package android.view;
public class ViewGroup extends View {
 public final java.util.List<View> children=new java.util.ArrayList<>();
 public void addView(View view,Object params){addView(view);}
 public void addView(View view){if(view.parent!=null)view.parent.removeView(view);children.add(view);view.parent=this;}
 public void removeView(View view){children.remove(view);view.parent=null;}
 public int getChildCount(){return children.size();}
}''',
    'androidx/coordinatorlayout/widget/CoordinatorLayout.java': '''package androidx.coordinatorlayout.widget;
public class CoordinatorLayout extends android.view.ViewGroup {}''',
    'androidx/annotation/Nullable.java': 'package androidx.annotation; public @interface Nullable {}',
    'androidx/annotation/RestrictTo.java': '''package androidx.annotation;
public @interface RestrictTo {Scope[] value(); enum Scope {TESTS}}''',
    'org/jetbrains/annotations/NotNull.java': 'package org.jetbrains.annotations; public @interface NotNull {}',
    'com/reactnativenavigation/options/params/Bool.java': '''package com.reactnativenavigation.options.params;
public class Bool {public Boolean value; public Bool(){} public Bool(boolean v){value=v;}
 public boolean isTrue(){return Boolean.TRUE.equals(value);}
 public boolean isTrueOrUndefined(){return value==null||value;}
 public boolean get(boolean fallback){return value==null?fallback:value;}}''',
    'com/reactnativenavigation/options/AnimationOptions.java': '''package com.reactnativenavigation.options;
public class AnimationOptions {
 public com.reactnativenavigation.options.params.Bool enabled=new com.reactnativenavigation.options.params.Bool();
 public com.reactnativenavigation.options.params.Bool waitForRender=new com.reactnativenavigation.options.params.Bool(false);
 public com.reactnativenavigation.options.params.Bool shouldWaitForRender(){return waitForRender;}
}''',
    'com/reactnativenavigation/options/TransitionAnimationOptions.java': '''package com.reactnativenavigation.options;
public class TransitionAnimationOptions {
 public AnimationOptions enter=new AnimationOptions(),exit=new AnimationOptions();
 public AnimationOptions getEnter(){return enter;} public AnimationOptions getExit(){return exit;}}
''',
    'com/reactnativenavigation/options/ModalPresentationStyle.java': '''package com.reactnativenavigation.options;
public enum ModalPresentationStyle {FullScreen,OverCurrentContext}''',
    'com/reactnativenavigation/options/Options.java': '''package com.reactnativenavigation.options;
public class Options {
 public final Animations animations=new Animations(); public final Modal modal=new Modal();
 public final HardwareBack hardwareBack=new HardwareBack();
 public static class Animations {public final TransitionAnimationOptions showModal=new TransitionAnimationOptions(),dismissModal=new TransitionAnimationOptions();}
 public static class Modal {public ModalPresentationStyle presentationStyle=ModalPresentationStyle.FullScreen;}
 public static class HardwareBack {public final com.reactnativenavigation.options.params.Bool dismissModalOnPress=new com.reactnativenavigation.options.params.Bool();}
}''',
    'com/reactnativenavigation/react/CommandListener.java': '''package com.reactnativenavigation.react;
public interface CommandListener {void onSuccess(String childId);void onError(String message);}''',
    'com/reactnativenavigation/react/CommandListenerAdapter.java': '''package com.reactnativenavigation.react;
public class CommandListenerAdapter implements CommandListener {
 private final CommandListener listener;public CommandListenerAdapter(CommandListener value){listener=value;}
 public void onSuccess(String id){listener.onSuccess(id);}public void onError(String message){listener.onError(message);}}
''',
    'com/reactnativenavigation/react/Constants.java': '''package com.reactnativenavigation.react;
public class Constants {public static final String HARDWARE_BACK_BUTTON_ID="back";}''',
    'com/reactnativenavigation/react/events/EventEmitter.java': '''package com.reactnativenavigation.react.events;
public class EventEmitter {public int dismissed;public void emitModalDismissed(String id,String name,int count){dismissed++;}}''',
    'com/reactnativenavigation/utils/Functions.java': '''package com.reactnativenavigation.utils;
public class Functions {public interface FuncR<T>{T run();}}''',
    'com/reactnativenavigation/utils/ScreenAnimationListener.java': '''package com.reactnativenavigation.utils;
public class ScreenAnimationListener {public void onStart(){}public void onEnd(){}public void onCancel(){}}''',
    'com/reactnativenavigation/utils/CoordinatorLayoutUtils.java': '''package com.reactnativenavigation.utils;
public class CoordinatorLayoutUtils {public static Object matchParentLP(){return new Object();}}''',
    'com/reactnativenavigation/utils/ObjectUtils.java': '''package com.reactnativenavigation.utils;
public class ObjectUtils {public static <T,R> R perform(T value,R fallback,java.util.function.Function<T,R> block){return value==null?fallback:block.apply(value);}}''',
    'com/reactnativenavigation/viewcontrollers/viewcontroller/overlay/ModalOverlay.java': '''package com.reactnativenavigation.viewcontrollers.viewcontroller.overlay;
public class ModalOverlay {public ModalOverlay(android.content.Context context){}
 public void setModalsLayout(androidx.coordinatorlayout.widget.CoordinatorLayout layout){}}''',
    'com/reactnativenavigation/viewcontrollers/viewcontroller/ViewController.java': '''package com.reactnativenavigation.viewcontrollers.viewcontroller;
import android.view.*;import com.reactnativenavigation.options.*;import com.reactnativenavigation.react.*;
public class ViewController<T extends View> {
 public static final java.util.List<String> EVENTS=new java.util.ArrayList<>();
 public final String id; public final View view=new View();public final Options options=new Options();
 public int getViewCalls,appearances,detaches,destroys;public boolean destroyed;public Runnable beforeDestroy;
 public final java.util.List<Runnable> ready=new java.util.ArrayList<>();
 public ViewController(String value){id=value;}
 public String getId(){return id;}public String getCurrentComponentName(){return id;}
 public Options resolveCurrentOptions(Options defaults){return options;}
 public View getView(){getViewCalls++;if(destroyed)throw new AssertionError("getView after destroy: "+id);return view;}
 public boolean isDestroyed(){return destroyed;}
 public void setWaitForRender(com.reactnativenavigation.options.params.Bool value){}
 public void addOnAppearedListener(Runnable callback){ready.add(callback);}
 public void fireReady(){for(Runnable callback:new java.util.ArrayList<>(ready))callback.run();}
 public void onViewDidAppear(){if(destroyed)throw new AssertionError("appear after destroy: "+id);appearances++;EVENTS.add("appear:"+id);}
 public void onViewDisappear(){}public void onConfigurationChanged(android.content.res.Configuration c){}
 public void detachView(){detaches++;EVENTS.add("detach:"+id);if(view.parent!=null)view.parent.removeView(view);}
 public void attachView(ViewGroup parent,int index){if(parent!=null)parent.addView(view);}
 public void destroy(){destroys++;if(beforeDestroy!=null)beforeDestroy.run();destroyed=true;if(view.parent!=null)view.parent.removeView(view);}
 public void setOverlay(Object value){}public void mergeOptions(Options value){}
 public ViewController<?> findController(String value){return id.equals(value)?this:null;}
 public boolean handleBack(CommandListener listener){return false;}public void sendOnNavigationButtonPressed(String value){}
}''',
    PACKAGE + '/ModalAnimator.java': '''package com.reactnativenavigation.viewcontrollers.modal;
import com.reactnativenavigation.utils.ScreenAnimationListener;
import com.reactnativenavigation.viewcontrollers.viewcontroller.ViewController;
import com.reactnativenavigation.options.TransitionAnimationOptions;
public class ModalAnimator {
 public int shows,dismisses;public Runnable beforeDismiss;
 public final java.util.List<ScreenAnimationListener> shown=new java.util.ArrayList<>();
 public ModalAnimator(){}public ModalAnimator(android.content.Context context){}
 public void show(ViewController<?> add,ViewController<?> remove,TransitionAnimationOptions options,ScreenAnimationListener listener){shows++;shown.add(listener);}
 public void dismiss(ViewController<?> add,ViewController<?> remove,TransitionAnimationOptions options,ScreenAnimationListener listener){dismisses++;if(beforeDismiss!=null)beforeDismiss.run();listener.onEnd();}
 public ScreenAnimationListener last(){return shown.get(shown.size()-1);}
}''',
}

HARNESS = r'''package com.reactnativenavigation.viewcontrollers.modal;
import java.lang.reflect.*;import java.util.*;
import android.content.Context;import android.view.ViewGroup;
import androidx.coordinatorlayout.widget.CoordinatorLayout;
import com.reactnativenavigation.options.*;import com.reactnativenavigation.options.params.Bool;
import com.reactnativenavigation.react.*;import com.reactnativenavigation.react.events.EventEmitter;
import com.reactnativenavigation.utils.*;import com.reactnativenavigation.viewcontrollers.viewcontroller.ViewController;
public class ModalProtocolProbe {
 static int failures,checks;static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
 static void run(String name,Runnable test){checks++;ViewController.EVENTS.clear();try{test.run();System.out.println("PASS\t"+name);}catch(Throwable error){failures++;System.out.println("FAIL\t"+name+"\t"+error);}}
 static class Reply implements CommandListener {
  int success,errors;String message;public void onSuccess(String id){success++;ViewController.EVENTS.add("success:"+id);}
  public void onError(String value){errors++;message=value;ViewController.EVENTS.add("error:"+value);}
  void ok(){check(success==1&&errors==0,"one success expected, got "+success+"/"+errors);}
  void cancelled(){check(success==0&&errors==1,"one cancellation expected, got "+success+"/"+errors);check("Modal presentation cancelled".equals(message),"explicit cancellation message required: "+message);}
 }
 static class Fixture {
  final ModalAnimator animator=new ModalAnimator();final ModalPresenter presenter=new ModalPresenter(animator);
  final ViewController<?> modal=new ViewController<>("modal"),root=new ViewController<>("root");final Reply reply=new Reply();
  boolean active=true;
  Fixture(){presenter.setRootLayout(new ViewGroup());presenter.setModalsLayout(new CoordinatorLayout());}
  void show(){try{
   Method method=ModalPresenter.class.getDeclaredMethod("showModal",ViewController.class,ViewController.class,CommandListener.class,Functions.FuncR.class);
   method.setAccessible(true);method.invoke(presenter,modal,root,reply,(Functions.FuncR<Boolean>)()->active);
  }catch(NoSuchMethodException oldApi){presenter.showModal(modal,root,reply);}
   catch(InvocationTargetException error){throw new RuntimeException(error.getCause());}
   catch(ReflectiveOperationException error){throw new RuntimeException(error);}}
  void noChanges(int reads){check(modal.getViewCalls==reads,"callback accessed removed/destroyed view");check(modal.appearances==0&&root.detaches==0,"stale lifecycle/detach");}
 }
 static void normal(boolean wait,boolean animate){Fixture f=new Fixture();f.modal.options.animations.showModal.enter.enabled=new Bool(animate);f.modal.options.animations.showModal.enter.waitForRender=new Bool(wait);f.show();
  if(wait){check(f.reply.success==0,"settled before render");f.modal.fireReady();}
  if(animate){f.animator.last().onStart();f.animator.last().onEnd();}
  f.reply.ok();check(f.modal.appearances==1&&f.root.detaches==1,"normal lifecycle missing");}
 static void stale(String callback,boolean destroyed){Fixture f=new Fixture();f.show();int reads=f.modal.getViewCalls;f.active=false;f.modal.destroyed=destroyed;
  ScreenAnimationListener listener=f.animator.last();if(callback.equals("start"))listener.onStart();else if(callback.equals("end"))listener.onEnd();else listener.onCancel();
  listener.onStart();listener.onCancel();listener.onEnd();f.reply.cancelled();f.noChanges(reads);}
 static ModalStack stack(Fixture f){ModalStack stack=new ModalStack(new Context(),f.presenter);stack.setEventEmitter(new EventEmitter());return stack;}
 public static void main(String[] args){
  run("normal_animated",()->normal(false,true));run("normal_wait_for_render",()->normal(true,true));
  run("no_animation",()->normal(false,false));run("no_animation_wait_for_render",()->normal(true,false));
  run("legacy_three_arg_overload",()->{Fixture f=new Fixture();f.presenter.showModal(f.modal,f.root,f.reply);f.animator.last().onEnd();f.reply.ok();});
  run("legacy_three_arg_cancel_finishes_once",()->{Fixture f=new Fixture();f.presenter.showModal(f.modal,f.root,f.reply);ScreenAnimationListener l=f.animator.last();l.onCancel();l.onEnd();f.reply.ok();check(f.modal.appearances==1&&f.root.detaches==1,"legacy cancel lifecycle missing");});
  run("active_cancel_finishes_lifecycle_before_success",()->{Fixture f=new Fixture();f.show();f.animator.last().onCancel();f.reply.ok();check(ViewController.EVENTS.equals(Arrays.asList("appear:modal","detach:root","success:modal")),"cancel lifecycle/order: "+ViewController.EVENTS);});
  run("active_cancel_then_duplicate_callbacks",()->{Fixture f=new Fixture();f.show();ScreenAnimationListener l=f.animator.last();l.onCancel();int reads=f.modal.getViewCalls;l.onCancel();l.onEnd();l.onStart();f.reply.ok();check(f.modal.appearances==1&&f.root.detaches==1&&f.modal.getViewCalls==reads,"duplicate callback mutated lifecycle/view");});
  run("end_then_duplicate_callbacks",()->{Fixture f=new Fixture();f.show();ScreenAnimationListener l=f.animator.last();l.onStart();l.onEnd();int reads=f.modal.getViewCalls;l.onCancel();l.onEnd();l.onStart();f.reply.ok();check(f.modal.appearances==1&&f.root.detaches==1&&f.modal.getViewCalls==reads,"duplicate completion");});
  for(String callback:Arrays.asList("start","end","cancel")){final String event=callback;run("removed_"+event,()->stale(event,false));run("destroyed_"+event,()->stale(event,true));}
  for(boolean animate:new boolean[]{true,false}){final boolean animation=animate;run("removed_before_render_"+animation,()->{Fixture f=new Fixture();f.modal.options.animations.showModal.enter.enabled=new Bool(animation);f.modal.options.animations.showModal.enter.waitForRender=new Bool(true);f.show();int reads=f.modal.getViewCalls;f.active=false;f.modal.destroyed=true;f.modal.fireReady();f.modal.fireReady();f.reply.cancelled();f.noChanges(reads);check(f.animator.shows==0,"animator started after removal");});}
  run("over_current_context_preserves_prior_view",()->{Fixture f=new Fixture();f.modal.options.modal.presentationStyle=ModalPresentationStyle.OverCurrentContext;f.show();f.animator.last().onCancel();f.reply.ok();check(f.modal.appearances==1&&f.root.detaches==0,"over-current-context lifecycle/prior-view mismatch");});
  run("null_prior_view",()->{Fixture f=new Fixture();f.presenter.showModal(f.modal,null,f.reply);f.animator.last().onEnd();f.reply.ok();check(f.modal.appearances==1,"null prior omitted appearance");});
  run("missing_layout_errors_without_view_access",()->{ModalAnimator a=new ModalAnimator();ModalPresenter p=new ModalPresenter(a);ViewController<?> v=new ViewController<>("modal");Reply r=new Reply();p.showModal(v,null,r);check(r.errors==1&&r.success==0&&r.message.contains("before activity"),"missing layout error");check(v.getViewCalls==0&&a.shows==0,"missing layout accessed view/animator");});
  run("stack_dismiss_removes_membership_before_cancel",()->{Fixture f=new Fixture();ModalStack s=stack(f);s.showModal(f.modal,f.root,f.reply);int reads=f.modal.getViewCalls;f.animator.beforeDismiss=()->f.animator.last().onCancel();Reply dismissed=new Reply();check(s.dismissModal("modal",f.root,dismissed),"dismiss missing");f.reply.cancelled();dismissed.ok();check(s.isEmpty(),"removed modal retained");check(f.modal.appearances==0&&f.modal.getViewCalls==reads,"removed modal appeared/read view");});
  for(String callback:Arrays.asList("start","end","cancel")){final String event=callback;run("stack_destroy_clears_membership_before_"+event,()->{Fixture f=new Fixture();ModalStack s=stack(f);s.showModal(f.modal,f.root,f.reply);int reads=f.modal.getViewCalls;ScreenAnimationListener l=f.animator.last();f.modal.beforeDestroy=()->{if(event.equals("start"))l.onStart();else if(event.equals("end"))l.onEnd();else l.onCancel();};s.destroy();f.reply.cancelled();f.noChanges(reads);check(s.isEmpty()&&f.modal.destroys==1,"stack not destroyed once");});}
  run("stale_callback_preserves_same_id_replacement",()->{Fixture f=new Fixture();ModalStack s=stack(f);s.showModal(f.modal,f.root,f.reply);ScreenAnimationListener old=f.animator.last();Reply removed=new Reply();s.dismissModal("modal",f.root,removed);int reads=f.modal.getViewCalls;ViewController<?> replacement=new ViewController<>("modal");Reply fresh=new Reply();s.showModal(replacement,f.root,fresh);old.onStart();old.onCancel();old.onEnd();f.reply.cancelled();check(f.modal.appearances==0&&f.modal.getViewCalls==reads,"old callback read/appeared");check(s.size()==1&&s.get(0)==replacement&&!replacement.isDestroyed(),"old callback removed replacement");f.animator.last().onEnd();fresh.ok();check(replacement.appearances==1,"replacement did not appear");});
  run("stack_dismiss_all_removes_lower_before_destroy",()->{Fixture f=new Fixture();ModalStack s=stack(f);s.showModal(f.modal,f.root,f.reply);ScreenAnimationListener first=f.animator.last();ViewController<?> upper=new ViewController<>("upper");Reply upperReply=new Reply();s.showModal(upper,f.root,upperReply);int reads=f.modal.getViewCalls;f.modal.beforeDestroy=first::onCancel;f.animator.beforeDismiss=()->f.animator.last().onCancel();Reply dismissed=new Reply();s.dismissAllModals(f.root,new Options(),dismissed);f.reply.cancelled();upperReply.cancelled();dismissed.ok();f.noChanges(reads);check(s.isEmpty(),"dismiss-all retained modal");});
  System.out.println("TOTAL\t"+checks+"\t"+failures);if(failures>0)System.exit(1);
 }
}'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--presenter', type=Path, default=NATIVE / PACKAGE / 'ModalPresenter.java')
    parser.add_argument('--stack', type=Path, default=NATIVE / PACKAGE / 'ModalStack.java')
    args = parser.parse_args()
    if not shutil.which('javac') or not shutil.which('java'):
        parser.error('javac and java are required (JDK 11 or newer)')
    sources = {'ModalPresenter.java': args.presenter, 'ModalStack.java': args.stack}
    for source in sources.values():
        if not source.is_file():
            parser.error('Native source not found: ' + str(source))
    with tempfile.TemporaryDirectory(prefix='xaman-modal-native-') as temporary:
        directory = Path(temporary)
        for name, content in STUBS.items():
            target = directory / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
        for name, source in sources.items():
            shutil.copyfile(source, directory / PACKAGE / name)
        (directory / PACKAGE / 'ModalProtocolProbe.java').write_text(HARNESS)
        classes = directory / 'classes'
        compiled = subprocess.run(['javac', '-d', str(classes)] + [str(path) for path in sorted(directory.rglob('*.java'))], text=True, capture_output=True)
        if compiled.returncode:
            print(compiled.stdout + compiled.stderr, end='')
            return compiled.returncode
        result = subprocess.run(['java', '-cp', str(classes), 'com.reactnativenavigation.viewcontrollers.modal.ModalProtocolProbe'], text=True, capture_output=True)
        checks = []
        for line in result.stdout.splitlines():
            parts = line.split('\t', 2)
            if parts[0] in ('PASS', 'FAIL'):
                check = {'name': parts[1], 'pass': parts[0] == 'PASS'}
                if len(parts) > 2:
                    check['error'] = parts[2]
                checks.append(check)
        print(json.dumps({'pass': result.returncode == 0, 'checks': len(checks), 'failures': sum(not item['pass'] for item in checks),
            'sources': {name: {'path': str(source), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()} for name, source in sources.items()},
            'results': checks}, indent=2))
        if result.stderr:
            print(result.stderr, end='')
        return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
