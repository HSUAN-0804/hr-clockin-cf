export async function onRequestPost({ request, env }) {
  try {
    const GAS_WEBAPP_URL = (env.GAS_WEBAPP_URL || "").trim();
    if (!GAS_WEBAPP_URL) {
      return json({ ok: false, code: "NO_GAS_URL", message: "未設定 GAS_WEBAPP_URL" }, 500);
    }

    const body = await request.json().catch(() => null);
    if (!body) return json({ ok:false, code:"BAD_JSON", message:"請求格式錯誤" }, 400);

    // 轉送到 GAS（server-to-server，不會被 CORS 擋）
    const res = await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    // GAS 會回 JSON（字串），這裡盡量 parse，失敗就回 raw
    let out;
    try { out = JSON.parse(text); }
    catch { out = { ok:false, code:"BAD_GAS_RESPONSE", message:"GAS 回應非 JSON", raw_head: text.slice(0,500) }; }

    return json(out, 200);
  } catch (e) {
    return json({ ok:false, code:"CF_ERROR", message:"系統忙碌，請稍後再試", detail:String(e) }, 500);
  }
}

function json(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // 讓 LIFF/瀏覽器都好用
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    }
  });
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
