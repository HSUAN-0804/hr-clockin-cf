export async function onRequestPost({ request, env }) {
  try {
    const GAS_WEBAPP_URL = (env.GAS_WEBAPP_URL || "").trim();
    if (!GAS_WEBAPP_URL) return json({ ok:false, code:"NO_GAS_URL", message:"未設定 GAS_WEBAPP_URL" }, 500);

    const body = await request.json().catch(() => null);
    if (!body) return json({ ok:false, code:"BAD_JSON", message:"請求格式錯誤" }, 400);

    const userId = String(body.userId || "").trim();
    const month  = String(body.month  || "").trim();
    if(!userId || !month) return json({ ok:false, code:"MISSING", message:"缺少 userId 或 month" }, 400);

    // month 格式簡單檢查：YYYY-MM
    if(!/^\d{4}-\d{2}$/.test(month)){
      return json({ ok:false, code:"BAD_MONTH", message:"month 格式需為 YYYY-MM" }, 400);
    }

    // ✅ 白名單（用 env.ALLOWED_USER_IDS 逗號分隔）
    const allowRaw = String(env.ALLOWED_USER_IDS || "").trim();
    const allowSet = new Set(allowRaw.split(",").map(s=>s.trim()).filter(Boolean));
    if (allowSet.size > 0 && !allowSet.has(userId)) {
      return json({ ok:false, code:"FORBIDDEN", message:"你沒有權限查看班表" }, 403);
    }

    // ✅ Edge Cache：同 userId+month 快取
    const cacheSec = toNum(env.SCHEDULE_CACHE_SEC, 600); // 預設 10 分鐘
    const cache = caches.default;
    const cacheKey = new Request(
      `https://cache.local/schedule?u=${encodeURIComponent(userId)}&m=${encodeURIComponent(month)}`,
      { method: "GET" }
    );

    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    // 轉送 GAS
    const url = `${GAS_WEBAPP_URL}?action=getMonthlySchedule&userId=${encodeURIComponent(userId)}&month=${encodeURIComponent(month)}`;
    const res = await fetch(url, { method: "GET" });

    const text = await res.text();
    let out;
    try { out = JSON.parse(text); }
    catch { out = { ok:false, code:"BAD_GAS_RESPONSE", message:"GAS 回應非 JSON", raw_head: text.slice(0,500) }; }

    const resp = json(out, 200);
    resp.headers.set("Cache-Control", `public, max-age=${Math.max(0, cacheSec|0)}`);

    // 只快取成功回應（避免把錯誤快取住）
    if(out && out.ok){
      await cache.put(cacheKey, resp.clone());
    }

    return resp;
  } catch (e) {
    return json({ ok:false, code:"CF_ERROR", message:"系統忙碌，請稍後再試", detail:String(e) }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    }
  });
}

function json(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    }
  });
}

function toNum(v, fallback){
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
