import com.xrpllabs.xumm.WindowBackground;

public class WindowBackgroundProbe {
    public static void main(String[] args) {
        System.out.println(WindowBackground.changed(0xff112233, 0xff112233));
        System.out.println(WindowBackground.changed(0xff112233, 0));
    }
}
