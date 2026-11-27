#!/usr/bin/env python3
"""Compile and execute LaunchActivity.attachBaseContext verbatim on a host JVM.

The public Android Configuration delta/merge contract is doubled; this is not a
native Resources test. Actual native controls are required for platform proof.
Python 3 and a JDK are required. JAVA_HOME is honored when set.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'android/app/src/main/java/com/xrpllabs/xumm/LaunchActivity.java'
text = SOURCE.read_text()
match = re.search(r'^    protected void attachBaseContext\(Context newBase\)\s*\{', text, re.M)
if not match:
    raise RuntimeError('Actual LaunchActivity.attachBaseContext method was not found')
start = text.index('{', match.start())
depth, end = 1, start + 1
while depth:
    depth += (text[end] == '{') - (text[end] == '}')
    end += 1
actual = text[match.start():end]

sources = {
    'android/content/res/Configuration.java': '''package android.content.res;
      import java.util.Locale;
      public class Configuration {
        public float fontScale; public Locale locale;
        public int orientation,screenWidthDp,screenHeightDp,smallestScreenWidthDp,densityDpi,uiMode,screenLayout;
        // Model the unset/live nested window-bounds contract; production never reads these double fields.
        public int windowWidthPx,windowHeightPx;
        public Configuration(){}
        public Configuration(Configuration c){
          fontScale=c.fontScale;locale=c.locale;orientation=c.orientation;
          screenWidthDp=c.screenWidthDp;screenHeightDp=c.screenHeightDp;
          smallestScreenWidthDp=c.smallestScreenWidthDp;densityDpi=c.densityDpi;
          uiMode=c.uiMode;screenLayout=c.screenLayout;windowWidthPx=c.windowWidthPx;windowHeightPx=c.windowHeightPx;
        }
        public void setLocale(Locale value){locale=value;screenLayout=(screenLayout&~0xC0)|0x40;}
        public static Configuration merge(Configuration base,Configuration delta){
          Configuration c=new Configuration(base);
          if(delta.fontScale>0)c.fontScale=delta.fontScale;
          if(delta.locale!=null)c.locale=delta.locale;
          if(delta.orientation!=0)c.orientation=delta.orientation;
          if(delta.screenWidthDp!=0)c.screenWidthDp=delta.screenWidthDp;
          if(delta.screenHeightDp!=0)c.screenHeightDp=delta.screenHeightDp;
          if(delta.smallestScreenWidthDp!=0)c.smallestScreenWidthDp=delta.smallestScreenWidthDp;
          if(delta.densityDpi!=0)c.densityDpi=delta.densityDpi;
          if(delta.uiMode!=0)c.uiMode=delta.uiMode;
          for(int mask:new int[]{0x0F,0x30,0xC0,0x300})
            if((delta.screenLayout&mask)!=0)c.screenLayout=(c.screenLayout&~mask)|(delta.screenLayout&mask);
          if(delta.windowWidthPx!=0)c.windowWidthPx=delta.windowWidthPx;
          if(delta.windowHeightPx!=0)c.windowHeightPx=delta.windowHeightPx;
          return c;
        }
      }''',
    'android/content/res/Resources.java': '''package android.content.res;
      public class Resources {public Configuration current;
        public Resources(Configuration c){current=c;}
        public Configuration getConfiguration(){return current;}}
    ''',
    'android/content/Context.java': '''package android.content;
      import android.content.res.*; public class Context {
        public final Resources resources;
        public Context(Configuration c){resources=new Resources(c);}
        public Resources getResources(){return resources;}}
    ''',
    'com/xrpllabs/xumm/FixtureActivityBase.java': '''package com.xrpllabs.xumm;
      import android.content.Context;import android.content.res.Configuration;
      public class FixtureActivityBase {
        public Context base;public Configuration override;
        public final java.util.List<String> calls=new java.util.ArrayList<>();
        protected void applyOverrideConfiguration(Configuration value){
          calls.add("override");override=new Configuration(value);}
        protected void attachBaseContext(Context value){calls.add("attach");base=value;}
        public Configuration effective(){return Configuration.merge(base.getResources().getConfiguration(),override);}
      }''',
    'com/xrpllabs/xumm/ActualActivity.java': '''package com.xrpllabs.xumm;
      import android.content.Context;import android.content.res.Configuration;import java.util.Locale;
      public class ActualActivity extends FixtureActivityBase {
        @Override
        /* ACTUAL_METHOD */
      }'''.replace('/* ACTUAL_METHOD */', actual),
    'com/xrpllabs/xumm/ConfigurationProbe.java': '''package com.xrpllabs.xumm;
      import android.content.Context;import android.content.res.Configuration;import java.util.Locale;
      public class ConfigurationProbe {
        static void check(String name,boolean value){System.out.println(name+":"+value);}
        static Configuration landscape(){Configuration c=new Configuration();
          c.fontScale=1.7f;c.locale=new Locale("ar");c.orientation=2;
          c.screenWidthDp=841;c.screenHeightDp=337;c.smallestScreenWidthDp=337;c.densityDpi=420;
          c.uiMode=0x11;c.screenLayout=2|0x20|0x80|0x100;c.windowWidthPx=2208;c.windowHeightPx=884;return c;}
        static void live(ActualActivity a,Context base,Configuration parent,String prefix){
          base.resources.current=parent;Configuration c=a.effective();
          check(prefix+"-orientation-live",c.orientation==parent.orientation);
          check(prefix+"-width-dp-live",c.screenWidthDp==parent.screenWidthDp);
          check(prefix+"-height-dp-live",c.screenHeightDp==parent.screenHeightDp);
          check(prefix+"-smallest-width-live",c.smallestScreenWidthDp==parent.smallestScreenWidthDp);
          check(prefix+"-density-live",c.densityDpi==parent.densityDpi);
          check(prefix+"-window-bounds-live",c.windowWidthPx==parent.windowWidthPx&&c.windowHeightPx==parent.windowHeightPx);
          check(prefix+"-night-mode-live",c.uiMode==parent.uiMode);
          check(prefix+"-screen-layout-geometry-live",(c.screenLayout&0x33F)==(parent.screenLayout&0x33F));
          check(prefix+"-font-remains-one",c.fontScale==1.0f);
          check(prefix+"-locale-remains-english",Locale.ENGLISH.equals(c.locale));
          check(prefix+"-direction-remains-ltr",(c.screenLayout&0xC0)==0x40);
        }
        public static void main(String[] args){
          Configuration initial=landscape();Context base=new Context(initial);ActualActivity a=new ActualActivity();
          a.attachBaseContext(base);
          check("same-base-context-retained",a.base==base);
          check("override-before-super-attach",a.calls.toString().equals("[override, attach]"));
          check("font-scale-only-explicit-one",a.override.fontScale==1.0f);
          check("locale-explicit-english",Locale.ENGLISH.equals(a.override.locale));
          check("override-orientation-undefined",a.override.orientation==0);
          check("override-sizes-undefined",a.override.screenWidthDp==0&&a.override.screenHeightDp==0&&a.override.smallestScreenWidthDp==0);
          check("override-density-undefined",a.override.densityDpi==0);
          check("override-window-bounds-undefined",a.override.windowWidthPx==0&&a.override.windowHeightPx==0);
          check("override-night-mode-undefined",a.override.uiMode==0);
          check("override-layout-geometry-undefined",(a.override.screenLayout&0x33F)==0);
          check("base-configuration-not-mutated",initial.fontScale==1.7f&&initial.locale.getLanguage().equals("ar")&&initial.orientation==2);
          live(a,base,initial,"cold-landscape");
          Configuration portrait=new Configuration(initial);portrait.orientation=1;portrait.screenWidthDp=337;
          portrait.screenHeightDp=841;portrait.uiMode=0x21;portrait.screenLayout=3|0x10|0x80|0x200;
          portrait.windowWidthPx=884;portrait.windowHeightPx=2208;portrait.fontScale=2.2f;portrait.locale=Locale.FRENCH;
          live(a,base,portrait,"cover-portrait");
          Configuration inner=new Configuration(portrait);inner.screenWidthDp=673;inner.smallestScreenWidthDp=673;
          inner.windowWidthPx=1768;inner.densityDpi=440;
          live(a,base,inner,"unfolded-inner");
        }
      }''',
}

java_home = os.environ.get('JAVA_HOME')
def executable(name):
    return str(Path(java_home) / 'bin' / name) if java_home else name

with tempfile.TemporaryDirectory(prefix='xaman-activity-configuration-') as directory:
    target = Path(directory)
    for name, content in sources.items():
        path = target / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    commands = [
        [executable('javac'), '-d', str(target), *[str(target / name) for name in sources]],
        [executable('java'), '-cp', str(target), 'com.xrpllabs/xumm/ConfigurationProbe'],
    ]
    outputs = []
    for command in commands:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=30)
        if completed.returncode:
            raise RuntimeError('Actual activity configuration contract failed:\n' + completed.stdout + completed.stderr)
        outputs.append(completed.stdout)

assertions = dict(line.split(':', 1) for line in outputs[-1].splitlines() if ':' in line)
failures = [name for name, value in assertions.items() if value != 'true']
report = {
    'actual_production_attach_base_context_compiled': True,
    'cases': len(assertions), 'passed': len(assertions) - len(failures),
    'assertions': list(assertions), 'failures': failures,
    'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'actual_method_sha256': hashlib.sha256(actual.encode()).hexdigest(),
    'scope': 'Host public Configuration delta/merge doubles; native Resources controls are separate evidence',
}
print(json.dumps(report))
raise SystemExit(1 if failures else 0)
