 // ✅ 白名單：這些 LINE ID 免距離限制（只繞過 OUT_OF_RANGE，其他規則不動）
const BYPASS = new Set([
  "U04731e6b1fcc42dc33e3141c55ad6ef5"
]);

export async function onRequestPost({ request, env }) {
  try {
    const GAS_WEBAPP_URL = (env.GAS_WEBAPP_URL || "").trim();
    if (!GAS_WEBAPP_URL) return json({ ok:false, code:"NO_GAS_URL", message:"未設定 GAS_WEBAPP_URL" }, 500);

    const body = await request.json().catch(() => null);
    if (!body) return json({ ok:false, code:"BAD_JSON", message:"請求格式錯誤" }, 400);

    const action = String(body.action || "").trim().toUpperCase();
    const needFence = (action === "IN" || action === "OUT");

    // 店家座標：可用 env 覆蓋（不想動程式就改環境變數）
    const SHOP_LAT = toNum(env.SHOP_LAT, 24.9714585);
    const SHOP_LNG = toNum(env.SHOP_LNG, 121.2242778);

    // ✅ 你的需求：距離嚴格化到 100m（也可用 env 覆蓋）
    const FENCE_M  = toNum(env.FENCE_M, 100);

    // ✅ 你的需求：accuracy 上限固定 120m（更嚴格）
    const ACC_MAX = 120;

    if (needFence) {
  const lat = toNum(body.lat, null);
  const lng = toNum(body.lng, null);
  const accuracy = toNum(body.accuracy, null);

  const uid = String(body.userId || body.line_user_id || "").trim();
  const bypassFence = BYPASS.has(uid);

  if (lat === null || lng === null) {
    return json({ ok:false, code:"NO_GPS", message:"定位未取得，請允許定位後再打卡。" }, 400);
  }

  if (accuracy !== null && accuracy > 0 && accuracy > ACC_MAX) {
    return json({
      ok:false,
      code:"GPS_NOT_ACCURATE",
      message:`GPS 精準度不足（${Math.round(accuracy)}m > ${ACC_MAX}m），請走到戶外/窗邊再試一次。`
    }, 400);
  }

  const distM = haversineMeters(SHOP_LAT, SHOP_LNG, lat, lng);

  if (!bypassFence && distM > FENCE_M) {
    return json({
      ok:false,
      code:"OUT_OF_RANGE",
      message:`超出打卡範圍：${Math.round(distM)}m / ${FENCE_M}m（請靠近店面再打卡）`,
      dist_m: Math.round(distM),
      fence_m: FENCE_M
    }, 403);
  }

  // 送去 GAS 記錄用
  body._dist_m = Math.round(distM);
  body._fence_m = FENCE_M;
  body._acc_max = ACC_MAX;
  body._bypass_fence = bypassFence ? 1 : 0;
}

    // 通過圍籬才轉送 GAS
    const res = await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let out;
    try { out = JSON.parse(text); }
    catch { out = { ok:false, code:"BAD_GAS_RESPONSE", message:"GAS 回應非 JSON", raw_head: text.slice(0,500) }; }

    return json(out, 200);
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
      "Cache-Control": "no-store"
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

// Haversine distance (meters)
function haversineMeters(lat1, lng1, lat2, lng2){
  const R = 6371000;
  const toRad = (x)=>x*Math.PI/180;
  const dLat = toRad(lat2-lat1);
  const dLng = toRad(lng2-lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R*c;
}
