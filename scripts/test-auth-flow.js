// scripts/test-auth-flow.js
const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");

const baseURL = "http://localhost:3000";

// ✅ Node 端模擬瀏覽器：自動保存 cookie（refresh_token）
const jar = new tough.CookieJar();
const client = wrapper(
  axios.create({
    baseURL,
    withCredentials: true,
    jar,
    validateStatus: () => true, // 讓我們自己判斷 status
  })
);

let accessToken = null;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function login() {
  const r = await client.post("/api/auth/login", {
    email: process.env.TEST_EMAIL || "test1@example.com",
    password: process.env.TEST_PASSWORD || "123456",
  });
  console.log("\n[login]", r.status, r.data);
  accessToken = r.data?.accessToken || null;
  if (!accessToken) throw new Error("Login failed: no accessToken");
}

async function planner(tag) {
  const r = await client.get("/api/planner", {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  console.log(`\n[planner ${tag}]`, r.status, r.data);
  return r;
}

async function refresh() {
  const r = await client.post("/api/auth/refresh");
  console.log("\n[refresh]", r.status, r.data);
  const newToken = r.data?.accessToken;
  if (!newToken) throw new Error("Refresh failed: no accessToken");
  accessToken = newToken;
}

async function logout() {
  const r = await client.post("/api/auth/logout");
  console.log("\n[logout]", r.status, r.data);
}

async function main() {
  console.log("BaseURL =", baseURL);

  await login();
  await planner("A (should be 200)");

  console.log("\nWait 6 seconds...（建議把 ACCESS_TOKEN_TTL 設 5s 來測過期）");
  await sleep(6000);

  const p = await planner("B (may be 401 if expired)");

  if (p.status === 401) {
    await refresh();
    await planner("C (after refresh, should be 200)");
  } else {
    console.log("\n⚠️ 你的 access token 可能還沒過期。把 ACCESS_TOKEN_TTL 調成 5s 再測。");
  }

  await logout();

  // 登出後 refresh 應該失敗（驗證 revoke + 清 cookie）
  const r2 = await client.post("/api/auth/refresh");
  console.log("\n[refresh after logout] (should be 401)", r2.status, r2.data);
}

main().catch((e) => {
  console.error("\n❌ TEST FAILED:", e.message);
  process.exit(1);
});
