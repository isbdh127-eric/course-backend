/**
 * Course Backend API - Integration Test
 * Run: node test-api.js
 */

const BASE = "https://course-backend-api-pfyj.onrender.com";

// Node 18+ 有內建 fetch
let accessToken = "";

async function request(method, path, body, auth = false) {
  const headers = { "Content-Type": "application/json" };
  if (auth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  console.log(`\n[${method}] ${path}`);
  console.log("Status:", res.status);
  console.log("Response:", json);

  return json;
}

async function run() {
  console.log("🚀 API 測試開始");

  // 1️⃣ Health check
  await request("GET", "/");

  // 2️⃣ Register（重複註冊失敗是正常的）
  await request("POST", "/api/auth/register", {
    email: "apitest@example.com",
    password: "123456",
  });

  // 3️⃣ Login
  const login = await request("POST", "/api/auth/login", {
    email: "apitest@example.com",
    password: "123456",
  });

  accessToken = login?.accessToken;
  if (!accessToken) {
    console.error("❌ 沒拿到 accessToken，測試中止");
    return;
  }

  console.log("✅ accessToken OK");

  // 4️⃣ Courses list
  await request("GET", "/api/courses");

  // 5️⃣ Course search
  await request("GET", "/api/courses/search?q=英文&page=1&pageSize=5");

  // 6️⃣ Planner list（需要登入）
  await request("GET", "/api/planner", null, true);

  // 7️⃣ 嘗試加入課表（sectionId 請依你資料庫調整）
  await request(
    "POST",
    "/api/planner",
    { sectionId: 1 },
    true
  );

  // 8️⃣ 再看一次 planner
  await request("GET", "/api/planner", null, true);

  console.log("\n🎉 API 測試結束");
}

run().catch(err => {
  console.error("🔥 測試過程發生錯誤", err);
});


