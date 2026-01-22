const fs = require("fs");
const path = require("path");

// Node 18+ 內建 fetch；你 Node v24 OK
async function postJson(url, secret, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-import-secret": secret,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) {
    throw new Error(`HTTP ${r.status} ${text}`);
  }
  return json;
}

// 你原本 importRawCourses.js 如果已經能把 xls 轉成 rawCourse items，最省就是直接 require 它的解析函式。
// 這裡我先假設你可以把「解析 xls → items」做成一個 function：parseAllRawCourses()
const { parseAllRawCourses } = require("./importRawCourses.js"); 
// ↑ 如果你目前 importRawCourses.js 沒有 export，我下面教你怎麼改

async function main() {
  const BASE = "https://course-backend-api-pfyj.onrender.com";
  const SECRET = process.env.IMPORT_SECRET;
  if (!SECRET) throw new Error("Missing IMPORT_SECRET in local env (set it temporarily in PowerShell)");

  // （可選）先清空雲端 rawCourse
  console.log("Clearing remote raw-courses...");
  await postJson(`${BASE}/api/admin/clear/raw-courses`, SECRET, {});
  console.log("Cleared.");

  console.log("Parsing XLS -> items...");
  const items = await parseAllRawCourses(); // 回傳陣列：[{...rawCourse fields...}, ...]
  console.log("Total items:", items.length);

  // 分批上傳，避免 payload 太大
  const BATCH = 400;
  let sent = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    const out = await postJson(`${BASE}/api/admin/import/raw-courses`, SECRET, { items: chunk });
    sent += out.inserted || 0;
    console.log(`Uploaded ${i + chunk.length}/${items.length} (inserted so far=${sent})`);
  }

  console.log("Triggering migrate on server...");
  await postJson(`${BASE}/api/admin/migrate`, SECRET, {});
  console.log("Done. Now check /api/courses");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
