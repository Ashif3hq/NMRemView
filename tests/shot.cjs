const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [w,h,scheme,name] of [[1440,900,'light','desk'],[1440,900,'dark','dark'],[400,860,'light','phone']]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
    const errs = []; p.on('console', m => m.type()==='error' && errs.push(m.text())); p.on('pageerror', e => errs.push(String(e)));
    await p.goto('http://localhost:8765/'); await p.waitForTimeout(2500);
    if (name==='desk') { await p.click('[data-tab=suggest]'); await p.waitForTimeout(200); }
    if (name==='dark') { await p.click('[data-tab=lookup]'); await p.click('[data-q=O]'); await p.click('.grp >> nth=8'); await p.waitForTimeout(300); }
    await p.screenshot({ path: `/tmp/claude-0/${name}.png`, fullPage: name==='phone' });
    console.log(name, errs, await p.evaluate(() => document.documentElement.scrollWidth));
  }
  await b.close();
})();
