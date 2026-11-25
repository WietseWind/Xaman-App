#!/usr/bin/env python3
"""Compile the actual LaunchActivity color resolver with small Android view doubles."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, default=ROOT / 'android/app/src/main/java/com/xrpllabs/xumm/LaunchActivity.java')
args = parser.parse_args()
source = args.source.read_text()


def method(name, required=True):
    match = re.search(r'    private int ' + name + r'\(', source)
    if not match:
        if required:
            raise RuntimeError('Missing production resolver method: ' + name)
        return ''
    start = source.index('{', match.start())
    depth = 1
    end = start + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[match.start():end]


methods = '\n'.join([method('resolveNavigatorBackgroundColor'), method('opaqueTabsContainerColor', False), method('opaqueColorFrom')])
java = r'''
import java.util.ArrayList;
import java.util.List;
interface ViewParent {}
class Drawable {}
class ColorDrawable extends Drawable {
    final int color;
    ColorDrawable(int color) { this.color = color; }
    int getColor() { return color; }
}
class Color {
    static final int TRANSPARENT = 0, BLACK = 0xff000000, WHITE = 0xffffffff;
    static int alpha(int color) { return color >>> 24; }
}
class View implements ViewParent {
    Drawable background;
    ViewParent parent;
    Drawable getBackground() { return background; }
    ViewParent getParent() { return parent; }
    View color(int value) { background = new ColorDrawable(value); return this; }
}
class ViewGroup extends View {
    final List<View> children = new ArrayList<>();
    ViewGroup add(View child) { children.add(child); child.parent = this; return this; }
    int getChildCount() { return children.size(); }
    View getChildAt(int index) { return children.get(index); }
}
class CoordinatorLayout extends ViewGroup {}
class Configuration {
    static final int UI_MODE_NIGHT_MASK = 0x30, UI_MODE_NIGHT_YES = 0x20;
    int uiMode = 0x10;
}
class Resources {
    final Configuration config = new Configuration();
    boolean hasTabs;
    int getIdentifier(String name, String type, String owner) { return hasTabs ? 42 : 0; }
    Configuration getConfiguration() { return config; }
}
public class NavInsetBackgroundProbe {
    final Resources resources = new Resources();
    boolean splashHidden = true;
    View tabs;
    Resources getResources() { return resources; }
    String getPackageName() { return "fixture"; }
    View findViewById(int id) { return id == 42 ? tabs : null; }
    /* ACTUAL PRODUCTION METHODS */
    static NavInsetBackgroundProbe fixture(boolean night, View tabs) {
        NavInsetBackgroundProbe probe = new NavInsetBackgroundProbe();
        probe.resources.config.uiMode = night ? 0x20 : 0x10;
        probe.resources.hasTabs = tabs != null;
        probe.tabs = tabs;
        return probe;
    }
    static void check(String name, NavInsetBackgroundProbe probe, int expected) {
        int actual = probe.resolveNavigatorBackgroundColor();
        System.out.println(name + ":" + (actual == expected) + ":" + Integer.toHexString(actual));
    }
    public static void main(String[] args) {
        ViewGroup tabs = new ViewGroup();
        ViewGroup linear = new ViewGroup(); linear.add(tabs);
        ViewGroup container = new ViewGroup(); container.color(Color.BLACK); container.add(linear);
        CoordinatorLayout root = new CoordinatorLayout(); root.color(Color.WHITE); root.add(container);
        check("transparent-inner-dark-container-os-light", fixture(false, tabs), Color.BLACK);
        tabs.color(Color.WHITE);
        check("stale-inner-color-current-container-wins", fixture(false, tabs), Color.BLACK);
        container.color(Color.WHITE); tabs.color(Color.BLACK);
        check("light-container-os-dark", fixture(true, tabs), Color.WHITE);
        linear.color(0x7f000000); container.color(0xff12131b);
        check("translucent-intermediate-skipped", fixture(false, tabs), 0xff12131b);
        container.color(Color.TRANSPARENT); tabs.color(Color.BLACK);
        check("transparent-ancestors-preserve-inner-fallback", fixture(false, tabs), Color.BLACK);
        tabs.color(Color.TRANSPARENT); tabs.add(new View().color(0xff234567));
        check("inner-descendant-fallback-preserved", fixture(false, tabs), 0xff234567);
        tabs.children.clear(); root.color(Color.BLACK);
        check("cached-coordinator-color-not-reused", fixture(false, tabs), Color.WHITE);
        check("no-tabs-light-onboarding", fixture(false, null), Color.WHITE);
        check("no-tabs-dark-onboarding", fixture(true, null), Color.BLACK);
        NavInsetBackgroundProbe loading = fixture(false, null); loading.splashHidden = false;
        check("no-tabs-splash-stays-transparent", loading, Color.TRANSPARENT);
    }
}
'''.replace('    /* ACTUAL PRODUCTION METHODS */', methods)

with tempfile.TemporaryDirectory(prefix='xaman-nav-inset-') as directory:
    file = Path(directory) / 'NavInsetBackgroundProbe.java'
    file.write_text(java)
    subprocess.run(['javac', '-d', directory, str(file)], check=True, capture_output=True, text=True)
    result = subprocess.run(['java', '-cp', directory, 'NavInsetBackgroundProbe'], check=True, capture_output=True, text=True)
rows = [line.split(':', 2) for line in result.stdout.splitlines()]
failed = [name for name, passed, _ in rows if passed != 'true']
report = {'cases': len(rows), 'passed': len(rows) - len(failed), 'failures': failed,
          'actual_production_methods_compiled': True, 'source': str(args.source)}
print(json.dumps(report))
raise SystemExit(1 if failed else 0)
