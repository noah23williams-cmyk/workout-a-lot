# Packs the exported web build (dist/) into one self-contained HTML page for
# publishing as a Claude artifact. Usage: python3 scripts/build-artifact.py dist out.html
import glob, re, sys
dist, out = sys.argv[1], sys.argv[2]
entry = glob.glob(f'{dist}/_expo/static/js/web/entry-*.js')
assert len(entry) == 1, entry
js = open(entry[0], encoding='utf-8').read()
print('</script occurrences:', len(re.findall(r'</script', js, re.I)), ' <!-- occurrences:', js.count('<!--'))
js = re.sub(r'</(script)', r'<\\/\1', js, flags=re.I).replace('<!--', '<\\!--')
html = f'''<title>Workout-a-lot</title>
<style>
  /* Single light look, matching the app's own theme. */
  :root {{ --bg: #F4F5F7; --fg: #16181D; color-scheme: light; }}
  html, body {{ height: 100%; }}
  body {{ overflow: hidden; background: var(--bg); color: var(--fg); }}
  #root {{ display: flex; height: 100%; flex: 1; }}
</style>
<div id="root"></div>
<script>
  // Expo Router reads the URL path; start every load on the home screen.
  try {{ history.replaceState(null, '', '/'); }} catch (e) {{}}
</script>
<script>
{js}
</script>
'''
open(out, 'w', encoding='utf-8').write(html)
print('wrote', out, len(html.encode()) // 1024, 'KiB')
