#!/usr/bin/env python3
"""Update the shared PSL snapshot and native copies. Apply npm patches first.
Run with --download to fetch the official list; then run patch-package react-native-webview.
The native regression probe verifies that all copies contain identical rules.
"""
from pathlib import Path
import argparse
import json
import re
import subprocess
import urllib.request

root = Path(__file__).resolve().parents[1]
snapshot = root / 'src/common/libs/xapp/publicSuffixRules.json'
parser = argparse.ArgumentParser()
parser.add_argument('--download', action='store_true')
args = parser.parse_args()
if args.download:
    source = 'https://publicsuffix.org/list/public_suffix_list.dat'
    text = urllib.request.urlopen(source, timeout=30).read().decode()
    raw = [line.strip().lower() for line in text.splitlines()
           if line.strip() and not line.strip().startswith('//')]
    # Use Node's UTS46 conversion, matching browser URL hosts, and retain the
    # Unicode spellings returned by some native URL parsers.
    js = """const {domainToASCII}=require('url');let input='';
process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>{
 const out=JSON.parse(input).map(rule=>{
  const prefix=rule.startsWith('!')?'!':rule.startsWith('*.')?'*.':'';
  return prefix+domainToASCII(rule.slice(prefix.length));
 });process.stdout.write(JSON.stringify(out));});"""
    ascii_rules = json.loads(subprocess.check_output(['node', '-e', js], input=json.dumps(raw), text=True))
    rules = list(dict.fromkeys(value for pair in zip(ascii_rules, raw) for value in pair))
    snapshot.write_text(json.dumps({
        'source': source, 'license': 'MPL-2.0',
        'version': re.search(r'// VERSION: (.*)', text).group(1), 'rules': rules,
    }, indent=2, ensure_ascii=True) + '\n')

data = json.loads(snapshot.read_text())
# ASCII escapes let both language compilers use the same Unicode rule values.
text = '\n'.join(data['rules']) + '\n'
chunks = [text[i:i+4000] for i in range(0, len(text), 4000)]
native = root / 'node_modules/react-native-webview'
java = native / 'android/src/main/java/com/reactnativecommunity/webview/XamanOttScope.java'
s = java.read_text()
start = s.index('    // Generated from src/common/libs/xapp/publicSuffixRules.json;')
end = s.index('    private static final Pattern OTT', start)
table = '    // Generated from src/common/libs/xapp/publicSuffixRules.json; MPL-2.0.\n'
table += '    private static final Set<String> PUBLIC_SUFFIX_RULES = new java.util.HashSet<>(java.util.Arrays.asList(\n'
table += '        String.join("", new String[] {\n'
table += ',\n'.join('            ' + json.dumps(chunk) for chunk in chunks)
table += '\n        }).split("\\\\n")));\n'
java.write_text(s[:start] + table + s[end:])

objc = native / 'apple/XamanOttSchemeHandler.m'
s = objc.read_text()
start = s.index('  // Generated from src/common/libs/xapp/publicSuffixRules.json;')
end = s.index('  NSArray<NSString *> *labels', start)
table = '  // Generated from src/common/libs/xapp/publicSuffixRules.json; MPL-2.0.\n'
table += '  static NSSet<NSString *> *rules;\n  static dispatch_once_t once;\n  dispatch_once(&once, ^{\n'
table += '    NSString *text = [@[\n'
# Objective-C accepts universal character names in string literals.
table += ',\n'.join('      @' + json.dumps(chunk) for chunk in chunks)
table += '\n    ] componentsJoinedByString:@""];\n'
table += '    rules = [NSSet setWithArray:[text componentsSeparatedByString:@"\\n"]];\n  });\n'
objc.write_text(s[:start] + table + s[end:])
print('PSL ' + data['version'] + ': ' + str(len(data['rules'])) + ' shared rules')
