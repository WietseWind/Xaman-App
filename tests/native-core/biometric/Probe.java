import libs.security.authentication.Biometric.BiometricModule;import com.facebook.react.bridge.*;import androidx.biometric.*;
public class Probe {
 static int cases;
 static class P implements Promise {String state="pending";int settlements;public void resolve(Object x){state="resolved";settlements++;}public void reject(String c,String m){state="rejected:"+c;settlements++;}}
 static void check(boolean ok){if(!ok)throw new AssertionError();cases++;}
 public static void main(String[]a){
  ReactApplicationContext c=new ReactApplicationContext();c.activity=new androidx.fragment.app.FragmentActivity();BiometricModule m=new BiometricModule(c);
  for(boolean strong:new boolean[]{true,false})for(boolean weak:new boolean[]{true,false}){
   BiometricManager.strong=strong;BiometricManager.weak=weak;P available=new P();m.isSensorAvailable(available);
   check(available.state.equals(strong?"resolved":"rejected:NOT_ENROLLED"));
   int before=BiometricPrompt.count;P p=new P();m.authenticate("fixture",p);
   check(BiometricManager.requested==BiometricManager.Authenticators.BIOMETRIC_STRONG);
   check(p.settlements==1 && p.state.equals(strong?"resolved":"rejected:NOT_ENROLLED"));
   check(BiometricPrompt.count==before+(strong?1:0));
   if(strong)check(BiometricPrompt.shown.allowed==BiometricManager.Authenticators.BIOMETRIC_STRONG);
  }
  System.out.println("Android production biometric strength: "+cases+" assertions passed (host API doubles; mixed/strong-only/weak-only/unenrolled)");
 }
}
