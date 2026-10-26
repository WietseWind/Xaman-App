package androidx.biometric; public class BiometricPrompt {
 public static final int ERROR_USER_CANCELED=1,ERROR_NEGATIVE_BUTTON=2,ERROR_HW_NOT_PRESENT=3,ERROR_HW_UNAVAILABLE=4,ERROR_NO_BIOMETRICS=5;
 public static PromptInfo shown; public static int count;
 public static class AuthenticationResult {}
 public static class AuthenticationCallback {public void onAuthenticationError(int c,CharSequence s){} public void onAuthenticationSucceeded(AuthenticationResult r){} public void onAuthenticationFailed(){}}
 public static class PromptInfo {public int allowed=BiometricManager.Authenticators.BIOMETRIC_WEAK;
 public static class Builder {PromptInfo p=new PromptInfo();public Builder setAllowedAuthenticators(int a){p.allowed=a;return this;}public Builder setConfirmationRequired(boolean b){return this;}public Builder setNegativeButtonText(String s){return this;}public Builder setTitle(String s){return this;}public PromptInfo build(){return p;}}}
 AuthenticationCallback cb;public BiometricPrompt(Object a,java.util.concurrent.Executor e,AuthenticationCallback c){cb=c;}
 public void authenticate(PromptInfo p){shown=p;count++;cb.onAuthenticationSucceeded(new AuthenticationResult());}
}
