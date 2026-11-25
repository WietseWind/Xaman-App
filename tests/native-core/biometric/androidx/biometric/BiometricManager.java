package androidx.biometric; public class BiometricManager {
 public static final int BIOMETRIC_SUCCESS=0,BIOMETRIC_ERROR_NO_HARDWARE=1,BIOMETRIC_ERROR_NONE_ENROLLED=2,BIOMETRIC_ERROR_HW_UNAVAILABLE=3;
 public static boolean strong=true,weak=true; public static int requested;
 public static class Authenticators {public static final int BIOMETRIC_STRONG=15,BIOMETRIC_WEAK=255;}
 public static BiometricManager from(Object c){return new BiometricManager();}
 public int canAuthenticate(int a){requested=a;return (a==Authenticators.BIOMETRIC_STRONG?strong:weak)?BIOMETRIC_SUCCESS:BIOMETRIC_ERROR_NONE_ENROLLED;}
}
