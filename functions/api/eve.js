const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

const SYSTEM_PROMPT = `You are EVE, the Universal Dragon assistant created by Aslam. Reply as a practical mission-control assistant for Universal Dragon OS. Use natural Tamil-English mix. Keep replies short, direct, safe, and useful. Never reveal secrets, API keys, private IPs, or internal credentials. For risky actions, ask for approval first. Format replies as plain text.`;

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost({ request, env }) {
  try {
    const key = env.GROQ_API_KEY;
    const model = env.GROQ_MODEL || "openai/gpt-oss-120b";

    if (!key) {
      return json({
        reply: "EVE: Groq key missing. Add GROQ_API_KEY as a secret/env variable in the hosting dashboard. Do not put the key in frontend code."
      });
    }

    const body = await request.json().catch(() => ({}));
    const message = String(body?.message || "").trim();

    if (!message) {
      return json({ reply: "EVE: Command empty bro." });
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message }
        ],
        temperature: 0.6,
        max_completion_tokens: 700
      })
    });

    const data = await groqRes.json().catch(() => ({}));

    if (!groqRes.ok) {
      return json({
        reply: "EVE Groq error: " + (data?.error?.message || `HTTP ${groqRes.status}`)
      });
    }

    const reply = data?.choices?.[0]?.message?.content || "EVE: No text output.";
    return json({ reply });
  } catch (err) {
    return json({ reply: "EVE connection error: " + (err?.message || "unknown error") }, 500);
  }
}

export async function onRequestGet() {
  return json({ status: "ok", service: "UDOS EVE Groq API" });
}
