export async function onRequestPost({ request, env }) {
  const GAS_WEBAPP_URL = (env.GAS_WEBAPP_URL || "").trim();
  if (!GAS_WEBAPP_URL) return json({ ok:false, code:"NO_GAS_URL", message:"未設定 GAS_WEBAPP_URL" }, 500);

  const body = await request.json().catch(() => null);
  if (!body) return json({ ok:false, code:"BAD_JSON", message:"請求格式錯誤" }, 400);

  // 轉發到 GAS
  const res = await fetch(GAS_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let out;
  try { out = JSON.parse(text); }
  catch {
    out = { ok:false, code:"BAD_GAS_RESPONSE", message:"GAS 回應非 JSON", raw_head: text.slice(0,500) };
  }

  // ✅ 成功就補上「保證合法」的 Flex（不再依賴 GAS 回 flex）
  if (out && out.ok) {
    const liffId = String(body.liffId || env.LIFF_ID || "2008810311-jmqyUaTN").trim();
    out.flex = buildPunchFlex({ liffId, body, out, env });
  }

  return json(out, 200);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function json(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() }
  });
}

function corsHeaders(){
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

/* ================= Flex Builder（精緻外觀＋LIFF深連結按鈕） ================= */

function buildPunchFlex({ liffId, body, out, env }) {
  const action = String(body.action || out.action || "").toUpperCase() === "OUT" ? "OUT" : "IN";

  const dt = pickDate(out) || new Date();
  const dateStr = fmtDateTW(dt); // YYYY/MM/DD
  const timeStr = fmtTimeTW(dt); // HH:mm

  const locationName = String(out.locationName || out.location_name || env.LOCATION_NAME || "H.R燈藝");

  const distanceM = toNum(out.distance_m ?? out.distanceM ?? out.fence?.distanceM ?? out.fence?.distance_m ?? null);
  const fenceM    = toNum(out.fence_m    ?? out.fenceM    ?? out.fence?.fenceM    ?? out.fence?.fence_m    ?? null);

  const showFence = Number.isFinite(distanceM) && Number.isFinite(fenceM);
  const lateMins  = toNum(out.mins_late ?? out.late_mins ?? out.lateMins ?? out.shift?.minsLate ?? 0);
  const showLate  = Number.isFinite(lateMins) && lateMins > 0;

  const note = String(body.note || out.note || "").trim();
  const showNote = note.length > 0;

  const empName = String(out.employee?.display_name || out.employee?.name || out.name || "").trim();

  // ✅ 正確 LIFF deep link（一定進 LIFF）
  const urlClock = `https://liff.line.me/${liffId}?liff.state=clock`;
  const urlLogs  = `https://liff.line.me/${liffId}?liff.state=/logs`;
  const urlSched = `https://liff.line.me/${liffId}?liff.state=schedule`;

  const kvRow = (label, value, valueColor) => ({
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      { type: "text", text: label, size: "sm", color: "#6B7280", flex: 3 },
      { type: "text", text: value, size: "sm", color: valueColor || "#111827", flex: 7, wrap: true, align: "end" }
    ]
  });

  const chip = (text, bg, color) => ({
    type: "box",
    layout: "vertical",
    paddingAll: "4px",
    backgroundColor: bg,
    cornerRadius: "999px",
    contents: [{ type: "text", text, size: "xs", weight: "bold", color }],
    paddingStart: "10px",
    paddingEnd: "10px"
  });

  const titleLeft = (action === "IN") ? "上班打卡" : "下班打卡";

  const bodyContents = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "你已打卡成功", size: "md", weight: "bold", color: "#065F46", flex: 6 },
        chip(action, action === "IN" ? "#DCFCE7" : "#E5E7EB", action === "IN" ? "#166534" : "#111827")
      ],
      alignItems: "center"
    },
    {
      type: "box",
      layout: "horizontal",
      margin: "lg",
      contents: [
        { type: "text", text: titleLeft, size: "lg", weight: "bold", color: "#374151", flex: 5 },
        { type: "text", text: timeStr, size: "xxl", weight: "bold", color: "#111827", flex: 5, align: "end" }
      ],
      alignItems: "baseline"
    },
    {
      type: "box",
      layout: "horizontal",
      margin: "md",
      contents: [
        { type: "text", text: "日期", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: dateStr, size: "sm", color: "#111827", flex: 7, align: "end" }
      ]
    },

    { type: "separator", margin: "lg", color: "#E5E7EB" },

    kvRow("打卡地點", locationName),

    ...(showFence
      ? [kvRow("距離店面", `${Math.round(distanceM)}m / ${Math.round(fenceM)}m`, (distanceM <= fenceM ? "#166534" : "#B91C1C"))]
      : []),

    ...(showLate
      ? [{
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [
            { type: "text", text: "異常紀錄", size: "sm", color: "#6B7280", flex: 3 },
            { type: "box", layout: "horizontal", flex: 7, contents: [{ type: "filler" }, chip(`遲到 ${lateMins} 分鐘`, "#FEE2E2", "#B91C1C")] }
          ],
          alignItems: "center"
        }]
      : [kvRow("異常紀錄", "無", "#166534")]),

    ...(showNote ? [kvRow("事由備註", note)] : []),
    ...(empName ? [kvRow("打卡人員", empName)] : []),

    { type: "separator", margin: "lg", color: "#E5E7EB" }
  ];

  const bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#0F172A",
      paddingAll: "14px",
      contents: [
        { type: "text", text: "H.R燈藝｜員工打卡", size: "sm", weight: "bold", color: "#F5D34D" }
      ]
    },
    body: { type: "box", layout: "vertical", paddingAll: "16px", spacing: "md", contents: bodyContents },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "14px",
      spacing: "sm",
      contents: [
        { type: "button", style: "primary", action: { type: "uri", label: "開啟打卡頁面", uri: urlClock } },
        { type: "button", style: "secondary", action: { type: "uri", label: "查看出勤紀錄", uri: urlLogs } },
        { type: "button", style: "secondary", action: { type: "uri", label: "查看班表", uri: urlSched } }
      ]
    }
  };

  // ✅ 這個才是 sendMessages 要的「完整 message object」
  return { type: "flex", altText: `${titleLeft} ${timeStr}`, contents: bubble };
}

function toNum(v){
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickDate(out){
  const keys = ["tsIso","nowIso","timestampIso","timestamp","ts","timeIso","createdAt"];
  for (const k of keys){
    const v = out && out[k];
    if (!v) continue;
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function fmtDateTW(d){
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(d);
  const y = parts.find(p=>p.type==="year")?.value || "0000";
  const m = parts.find(p=>p.type==="month")?.value || "00";
  const da = parts.find(p=>p.type==="day")?.value || "00";
  return `${y}/${m}/${da}`;
}

function fmtTimeTW(d){
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).formatToParts(d);
  const hh = parts.find(p=>p.type==="hour")?.value || "00";
  const mm = parts.find(p=>p.type==="minute")?.value || "00";
  return `${hh}:${mm}`;
}
