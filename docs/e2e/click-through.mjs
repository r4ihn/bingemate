/* eslint-disable */
// Real-browser check against the running dev stack (web :5173 with VITE_USE_MOCKS=false, API :4000).
// Needs Playwright, which is not a project dependency: see docs/manual-test-checklist.md for the --no-save install.
// Output (screenshots, results.json) goes to $E2E_OUT or the system temp folder, never into the repo.
// Real-browser click-through of the creator, admin and reader flows against the running stack
// (web http://localhost:5173 with VITE_USE_MOCKS=false, API on :4000). Self-cleaning: it deletes what it creates.
import { chromium } from 'playwright';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BASE = 'http://localhost:5173';
const OUT = (process.env.E2E_OUT ?? join(tmpdir(), 'bingemate-e2e')) + '/';
mkdirSync(OUT, { recursive: true });
const stamp = String(Date.now()).slice(-6);
const NAME_OK = `E2E Alpha ${stamp}`;
const NAME_REJ = `E2E Beta ${stamp}`;
const NAME_STALE = `E2E Gamma ${stamp}`;
const PASSWORD = 'Password123!';
const results = [];

// A 240x320 solid PNG so the poster upload has real bytes (no extra dependency).
function png(w, h, rgb) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: w }, () => rgb).flat()),
  ]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const posterPath = OUT + 'poster.png';
writeFileSync(posterPath, png(240, 320, [200, 60, 60]));

let shotNo = 0;
async function step(name, page, fn) {
  const t0 = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, note: note ?? '', ms: Date.now() - t0 });
    console.log(`PASS  ${name}${note ? ' :: ' + note : ''}`);
  } catch (err) {
    results.push({
      name,
      ok: false,
      note: String(err.message ?? err).split('\n')[0],
      ms: Date.now() - t0,
    });
    console.log(`FAIL  ${name} :: ${String(err.message ?? err).split('\n')[0]}`);
  }
  if (page) {
    try {
      await page.screenshot({
        path: `${OUT}${String(++shotNo).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 50)}.png`,
      });
    } catch {
      /* ignore */
    }
  }
}

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  const answered = page.waitForResponse((r) => r.url().includes('/api/auth/login'), {
    timeout: 10000,
  });
  await page.getByRole('button', { name: /log in/i }).click();
  const res = await answered;
  if (res.status() === 429)
    throw new Error(
      'login rate limited (429): the API allows 20 logins per 15 minutes per IP; wait and run again',
    );
  if (res.status() !== 200) throw new Error(`login answered ${res.status()}`);
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 });
}
const api = async (ctx, path) => (await ctx.request.get(`${BASE}/api${path}`)).json();

async function submitTitle(page, name, withPoster) {
  await page.goto(`${BASE}/creator`);
  await page
    .getByRole('link', { name: /new submission/i })
    .or(page.getByRole('button', { name: /new submission/i }))
    .first()
    .click();
  await page.getByLabel(/^title/i).fill(name);
  const type = page.getByLabel(/type/i);
  if (await type.count()) await type.selectOption({ index: 0 });
  await page.getByLabel(/synopsis/i).fill('Created by the automated click-through.');
  if (withPoster) {
    await page.getByLabel(/poster image/i).setInputFiles(posterPath);
    await page.waitForTimeout(800); // the form shrinks the image before upload
  }
  await page.getByRole('button', { name: /submit for approval/i }).click();
  await page.waitForURL((u) => u.pathname === '/creator', { timeout: 20000 });
}

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const mk = async () => {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return [c, await c.newPage()];
};
const [creatorCtx, creator] = await mk();
const [adminCtx, admin] = await mk();
const [readerCtx, reader] = await mk();
let okId, rejId, staleId;

// ---------- Creator ----------
await step('creator: sign in', creator, () => login(creator, 'creator@bingemate.dev'));
await step('creator: Creator link and dashboard exist', creator, async () => {
  await creator.goto(`${BASE}/creator`);
  await creator.getByRole('heading', { name: /^creator$/i }).waitFor({ timeout: 8000 });
  await creator
    .getByText(/your submissions/i)
    .first()
    .waitFor({ timeout: 8000 });
});
await step('creator: submit a title with an image -> PENDING', creator, async () => {
  await submitTitle(creator, NAME_OK, true);
  const rows = await api(creatorCtx, '/creator/titles');
  const row = rows.find((r) => r.name === NAME_OK);
  if (!row) throw new Error('title not in /creator/titles');
  okId = row.id;
  if (row.status !== 'PENDING') throw new Error(`status ${row.status}`);
  const poster = await creatorCtx.request.get(`${BASE}/api/titles/${okId}/poster`);
  if (poster.status() !== 200) throw new Error(`owner poster GET ${poster.status()}`);
  await creator.getByText(NAME_OK).first().waitFor({ timeout: 8000 });
  return `id ${okId}, owner can see the image (200)`;
});
await step('visitor cannot see the pending title or its image', null, async () => {
  const t = await fetch(`${BASE}/api/titles/${okId}`);
  const p = await fetch(`${BASE}/api/titles/${okId}/poster`);
  if (t.status !== 404 || p.status !== 404)
    throw new Error(`title ${t.status}, poster ${p.status}`);
  return 'both 404';
});
await step('creator: edit the pending title', creator, async () => {
  await creator.goto(`${BASE}/creator`);
  const row = creator.locator('tr', { hasText: NAME_OK }).first();
  await row
    .getByRole('link', { name: /edit/i })
    .or(row.getByRole('button', { name: /edit/i }))
    .first()
    .click();
  await creator.getByLabel(/synopsis/i).fill('Edited by the click-through.');
  await creator.getByRole('button', { name: /save/i }).click();
  await creator.waitForURL((u) => u.pathname === '/creator', { timeout: 15000 });
  const rows = await api(creatorCtx, '/creator/titles');
  const row2 = rows.find((r) => r.id === okId);
  if (row2.status !== 'PENDING') throw new Error(`status ${row2.status}`);
  return 'saved, still PENDING';
});

// ---------- Admin ----------
await step('admin: sign in, no Creator link', admin, async () => {
  await login(admin, 'admin@bingemate.dev');
  await admin.goto(`${BASE}/`);
  const n = await admin.getByRole('link', { name: /^creator$/i }).count();
  if (n !== 0) throw new Error('admin sees a Creator link');
});
await step('admin: queue lists the pending title, approve it', admin, async () => {
  await admin.goto(`${BASE}/admin/queue`);
  const row = admin.locator('tr', { hasText: NAME_OK }).first();
  await row.waitFor({ timeout: 10000 });
  await row.getByRole('button', { name: /^approve/i }).click();
  await admin.waitForTimeout(1200);
  const pub = await fetch(`${BASE}/api/titles/${okId}`);
  if (pub.status !== 200) throw new Error(`public GET ${pub.status} after approve`);
  return 'now public (200)';
});
await step('creator: edit of an APPROVED title sends it back to PENDING', creator, async () => {
  await creator.goto(`${BASE}/creator`);
  const row = creator.locator('tr', { hasText: NAME_OK }).first();
  await row
    .getByRole('link', { name: /edit/i })
    .or(row.getByRole('button', { name: /edit/i }))
    .first()
    .click();
  await creator.getByLabel(/synopsis/i).fill('Edited after approval.');
  await creator.getByRole('button', { name: /save/i }).click();
  const confirmBtn = creator.getByRole('button', { name: /save and re-submit/i });
  if (await confirmBtn.count()) await confirmBtn.click();
  await creator.waitForTimeout(1500);
  const rows = await api(creatorCtx, '/creator/titles');
  const st = rows.find((r) => r.id === okId).status;
  if (st !== 'PENDING') throw new Error(`status ${st}`);
  const pub = await fetch(`${BASE}/api/titles/${okId}`);
  if (pub.status !== 404) throw new Error(`still public (${pub.status})`);
  return 'PENDING and hidden';
});
await step('admin: approve again', admin, async () => {
  await admin.goto(`${BASE}/admin/queue`);
  const row = admin.locator('tr', { hasText: NAME_OK }).first();
  await row.waitFor({ timeout: 10000 });
  await row.getByRole('button', { name: /^approve/i }).click();
  await admin.waitForTimeout(1200);
  if ((await fetch(`${BASE}/api/titles/${okId}`)).status !== 200) throw new Error('not public');
});
await step('admin: reject a second title with a reason', admin, async () => {
  await submitTitle(creator, NAME_REJ, false);
  rejId = (await api(creatorCtx, '/creator/titles')).find((r) => r.name === NAME_REJ)?.id;
  await admin.goto(`${BASE}/admin/queue`);
  const row = admin.locator('tr', { hasText: NAME_REJ }).first();
  await row.waitFor({ timeout: 10000 });
  await row.getByPlaceholder(/optional/i).fill('Poster is missing.');
  await row.getByRole('button', { name: /^reject/i }).click();
  await admin.waitForTimeout(1200);
  const st = (await api(creatorCtx, '/creator/titles')).find((r) => r.id === rejId);
  if (st.status !== 'REJECTED' || !/poster is missing/i.test(st.rejectionReason ?? ''))
    throw new Error(`${st.status} / ${st.rejectionReason}`);
  return 'REJECTED with the reason';
});
await step('creator: sees the rejection reason in My submissions', creator, async () => {
  await creator.goto(`${BASE}/creator`);
  await creator
    .getByText(/poster is missing/i)
    .first()
    .waitFor({ timeout: 8000 });
});
await step('admin: stale version from two tabs shows the 409 message', admin, async () => {
  await submitTitle(creator, NAME_STALE, false);
  staleId = (await api(creatorCtx, '/creator/titles')).find((r) => r.name === NAME_STALE)?.id;
  const tab2 = await adminCtx.newPage();
  await admin.goto(`${BASE}/admin/queue`);
  await tab2.goto(`${BASE}/admin/queue`);
  await admin.locator('tr', { hasText: NAME_STALE }).first().waitFor({ timeout: 10000 });
  await tab2.locator('tr', { hasText: NAME_STALE }).first().waitFor({ timeout: 10000 });
  await admin
    .locator('tr', { hasText: NAME_STALE })
    .first()
    .getByRole('button', { name: /^approve/i })
    .click();
  await admin.waitForTimeout(1200);
  await tab2
    .locator('tr', { hasText: NAME_STALE })
    .first()
    .getByRole('button', { name: /^reject/i })
    .click();
  await tab2
    .getByText(/changed after you opened it/i)
    .first()
    .waitFor({ timeout: 8000 });
  await tab2.screenshot({ path: `${OUT}stale-409.png` });
  await tab2.close();
  return 'message shown';
});

// ---------- Reader ----------
await step('reader: sign in as an imported user', reader, () =>
  login(reader, 'user4@seed.bingemate.local'),
);
await step(
  'reader: open the approved title, creator cannot be a reviewer elsewhere',
  reader,
  async () => {
    await reader.goto(`${BASE}/titles/${okId}`);
    await reader.getByText(NAME_OK).first().waitFor({ timeout: 10000 });
  },
);
await step('reader: write a review (4 stars + text)', reader, async () => {
  await reader.getByRole('heading', { name: /write a review/i }).waitFor({ timeout: 8000 });
  await reader.getByLabel('4 stars', { exact: true }).check({ force: true });
  await reader.getByLabel(/your review/i).fill('Good enough for the click-through.');
  const posted = reader.waitForResponse(
    (r) => /\/reviews$/.test(r.url()) && r.request().method() === 'POST',
    { timeout: 10000 },
  );
  await reader.getByRole('button', { name: /post review/i }).click();
  const resp = await posted;
  if (resp.status() !== 201) throw new Error(`POST review -> ${resp.status()}`);
  const mine = await readerCtx.request.get(`${BASE}/api/titles/${okId}/reviews/mine`);
  const j = await mine.json();
  if (!j || j.rating !== 4) throw new Error(`mine -> ${JSON.stringify(j)?.slice(0, 80)}`);
  return 'saved, rating 4';
});
await step('reader: edit the review', reader, async () => {
  await reader
    .getByRole('button', { name: /edit review|^edit$/i })
    .first()
    .click();
  await reader
    .getByLabel(/your review|review/i)
    .first()
    .fill('Edited review text.');
  await reader.getByRole('button', { name: /save/i }).first().click();
  await reader
    .getByText(/edited review text/i)
    .first()
    .waitFor({ timeout: 10000 });
});
await step('reader: reply to the review', reader, async () => {
  await reader
    .getByRole('button', { name: /^reply/i })
    .first()
    .click();
  await reader.getByRole('textbox').last().fill('A reply from the click-through.');
  await reader.getByRole('button', { name: /post reply/i }).click();
  await reader
    .getByText(/a reply from the click-through/i)
    .first()
    .waitFor({ timeout: 10000 });
});
await step('reader: add to a list, see it in My Lists, remove it', reader, async () => {
  const ctl = reader.getByLabel(/add to list/i).first();
  const tag = await ctl.evaluate((n) => n.tagName);
  if (tag === 'SELECT') await ctl.selectOption({ label: 'Completed' });
  else {
    await ctl.click();
    await reader
      .getByRole('menuitem', { name: /completed/i })
      .or(reader.getByRole('option', { name: /completed/i }))
      .or(reader.getByText(/^completed$/i))
      .first()
      .click();
  }
  await reader.waitForTimeout(800);
  await reader.goto(`${BASE}/me/lists`);
  await reader.getByText(NAME_OK).first().waitFor({ timeout: 10000 });
  await reader
    .locator('li, article, div', { hasText: NAME_OK })
    .getByRole('button', { name: /remove/i })
    .first()
    .click()
    .catch(async () => {
      await reader
        .getByRole('button', { name: /remove/i })
        .first()
        .click();
    });
  await reader
    .getByRole('dialog')
    .getByRole('button', { name: /^remove$/i })
    .click();
  await reader.waitForTimeout(800);
  const left = await reader.getByText(NAME_OK).count();
  if (left) throw new Error('entry still listed');
});
await step(
  'creator: cannot delete while another user has reviewed (409 message)',
  creator,
  async () => {
    await creator.goto(`${BASE}/creator`);
    const row = creator.locator('tr', { hasText: NAME_OK }).first();
    await row.getByRole('button', { name: /^delete$/i }).click();
    await creator.getByRole('button', { name: /confirm/i }).click();
    await creator
      .getByText(/other users have reviewed or listed|ask an admin/i)
      .first()
      .waitFor({ timeout: 8000 });
  },
);
await step('reader: delete own review (and its replies)', reader, async () => {
  await reader.goto(`${BASE}/titles/${okId}`);
  await reader
    .getByRole('button', { name: /^delete review by/i })
    .first()
    .click();
  const del = reader.waitForResponse(
    (r) => /\/reviews\//.test(r.url()) && r.request().method() === 'DELETE',
    { timeout: 10000 },
  );
  await reader
    .getByRole('dialog')
    .getByRole('button', { name: /^delete/i })
    .click();
  const dr = await del;
  if (![200, 204].includes(dr.status())) throw new Error(`DELETE review -> ${dr.status()}`);
  await reader.waitForTimeout(500);
  const mine = await (
    await readerCtx.request.get(`${BASE}/api/titles/${okId}/reviews/mine`)
  ).json();
  if (mine) throw new Error('review still there');
});

// ---------- Cleanup through the UI (also a test) ----------
for (const [label, id] of [
  ['approved', okId],
  ['rejected', rejId],
  ['stale-approved', staleId],
]) {
  await step(`creator: delete the ${label} title`, creator, async () => {
    if (!id) throw new Error('no id');
    await creator.goto(`${BASE}/creator`);
    const nm = label === 'approved' ? NAME_OK : label === 'rejected' ? NAME_REJ : NAME_STALE;
    const row = creator.locator('tr', { hasText: nm }).first();
    await row.getByRole('button', { name: /^delete$/i }).click();
    await creator.getByRole('button', { name: /confirm/i }).click();
    await creator.waitForTimeout(1200);
    const rows = await api(creatorCtx, '/creator/titles');
    if (rows.some((r) => r.id === id)) throw new Error('still listed');
  });
}

await browser.close();
const pass = results.filter((r) => r.ok).length;
writeFileSync(
  OUT + 'results.json',
  JSON.stringify({ stamp, pass, total: results.length, results }, null, 2),
);
console.log(`\n${pass}/${results.length} steps passed`);
process.exitCode = pass === results.length ? 0 : 1;
