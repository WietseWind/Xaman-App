import libs.security.authentication.Biometric.BiometricModule;
import com.facebook.react.bridge.*;
import androidx.biometric.*;
import androidx.fragment.app.FragmentActivity;
import androidx.lifecycle.Lifecycle;

public class Probe {
    static int cases;
    static class P implements Promise {
        String state="pending";
        int settlements;
        public void resolve(Object value) { state="resolved"; settlements++; }
        public void reject(String code,String message) { state="rejected:"+code; settlements++; }
    }
    static class Env {
        final ReactApplicationContext context = new ReactApplicationContext();
        final BiometricModule module;
        Env() {
            BiometricManager.strong=true; BiometricManager.weak=true;
            BiometricPrompt.failure=0; BiometricPrompt.autoSucceed=true; BiometricPrompt.instances.clear();
            context.activity=new FragmentActivity();
            module=new BiometricModule(context);
        }
        P authenticate() { P promise=new P(); module.authenticate("fixture",promise); return promise; }
        BiometricPrompt prompt() { return BiometricPrompt.instances.get(BiometricPrompt.instances.size()-1); }
    }
    static void check(boolean okay) { if(!okay)throw new AssertionError("assertion "+(cases+1)); cases++; }
    static void settled(P promise,String state) { check(promise.settlements==1 && promise.state.equals(state)); }
    public static void main(String[]args) {
        Env available = new Env();
        for(boolean strong:new boolean[]{true,false}) for(boolean weak:new boolean[]{true,false}) {
            BiometricManager.strong=strong; BiometricManager.weak=weak;
            P sensor=new P(); available.module.isSensorAvailable(sensor);
            settled(sensor,strong?"resolved":"rejected:NOT_ENROLLED");
            int before=BiometricPrompt.count;
            P promise=available.authenticate();
            check(BiometricManager.requested==BiometricManager.Authenticators.BIOMETRIC_STRONG);
            settled(promise,strong?"resolved":"rejected:NOT_ENROLLED");
            check(BiometricPrompt.count==before+(strong?1:0));
            if(strong)check(BiometricPrompt.shown.allowed==BiometricManager.Authenticators.BIOMETRIC_STRONG);
        }

        // Host loss and all states where AndroidX can silently decline to show a prompt.
        for(int state=0;state<8;state++) {
            Env e=new Env(); FragmentActivity host=(FragmentActivity)e.context.activity;
            if(state==0)e.context.activity=null;
            if(state==1)e.context.activity=new android.app.Activity();
            if(state==2)host.finishing=true;
            if(state==3)host.destroyed=true;
            if(state==4)host.lifecycle.state=Lifecycle.State.STARTED;
            if(state==5)host.lifecycle.state=Lifecycle.State.DESTROYED;
            if(state==6)host.manager.saved=true;
            if(state==7)e.module.onHostPause();
            settled(e.authenticate(),"rejected:NOT_AVAILABLE");
            check(BiometricPrompt.instances.isEmpty());
            e.context.activity=new FragmentActivity(); e.module.onHostResume();
            settled(e.authenticate(),"resolved");
        }

        // Setup exceptions settle the request and release the active-request latch.
        for(int failure=1;failure<=3;failure++) {
            Env e=new Env(); BiometricPrompt.failure=failure;
            settled(e.authenticate(),"rejected:BIOMETRIC_ERROR");
            BiometricPrompt.failure=0;
            settled(e.authenticate(),"resolved");
        }

        Env overlap=new Env(); BiometricPrompt.autoSucceed=false;
        P first=overlap.authenticate(); BiometricPrompt old=overlap.prompt();
        settled(overlap.authenticate(),"rejected:NOT_AVAILABLE");
        check(BiometricPrompt.instances.size()==1 && first.settlements==0);
        old.fail(); check(first.settlements==0);
        old.error(); old.error(); old.succeed();
        settled(first,"rejected:USER_CANCEL");
        P next=overlap.authenticate(); old.succeed(); check(next.settlements==0);
        overlap.prompt().succeed(); overlap.prompt().succeed(); overlap.prompt().error();
        settled(next,"resolved");

        for(int transition=0;transition<3;transition++) {
            Env e=new Env(); BiometricPrompt.autoSucceed=false;
            P pending=e.authenticate(); BiometricPrompt prompt=e.prompt();
            if(transition==0)e.module.onHostPause();
            if(transition==1)e.module.onHostDestroy();
            if(transition==2)e.module.invalidate();
            prompt.succeed(); prompt.error();
            settled(pending,"rejected:NOT_AVAILABLE");
            check(prompt.cancellations==1);
            if(transition==2) {
                check(e.context.listeners.isEmpty());
                settled(e.authenticate(),"rejected:NOT_AVAILABLE");
            } else {
                e.context.activity=new FragmentActivity(); e.module.onHostResume();
                BiometricPrompt.autoSucceed=true;
                settled(e.authenticate(),"resolved");
            }
        }

        Env cancelFailure=new Env(); BiometricPrompt.autoSucceed=false;
        P cancelled=cancelFailure.authenticate(); BiometricPrompt.failure=4;
        cancelFailure.module.onHostDestroy();
        settled(cancelled,"rejected:NOT_AVAILABLE");

        for(int transition=0;transition<4;transition++) {
            Env e=new Env(); UiThreadUtil.defer=true;
            P queued=e.authenticate();
            if(transition==0)e.context.activity=null;
            if(transition==1) { e.module.onHostPause(); e.module.onHostResume(); }
            if(transition==2) { e.module.onHostDestroy(); e.context.activity=new FragmentActivity(); e.module.onHostResume(); }
            if(transition==3)e.module.invalidate();
            UiThreadUtil.flush();
            settled(queued,"rejected:NOT_AVAILABLE");
            check(BiometricPrompt.instances.isEmpty());
        }
        System.out.println("Android production biometric strength/lifecycle: "+cases+" assertions passed (explicit host API doubles)");
    }
}
