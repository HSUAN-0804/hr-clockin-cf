export async function onRequestPost({ request, env }) {
  const GAS_WEBAPP_URL = (env.GAS_WEBAPP_URL || "").trim();
  if (!GAS_WEBAPP_URL) return json({ ok:false, code:"NO_GAS_URL", message:"未設定 GAS_WEBAPP_URL" }, 500);

  const body = await request.json().catch(() => null);
  if (!body) return json({ ok:false, code:"BAD_JSON", message:"請求格式錯誤" }, 400);

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
