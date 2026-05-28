import doctorRoutes from "./doctor_routes.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8088;
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));
app.use("/api/doctor", doctorRoutes);

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

app.post("/api/eve", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();

    if (!message) {
      return res.json({ reply: "EVE: Command empty bro." });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.json({ reply: "EVE: GROQ_API_KEY missing. Add it in .env first." });
    }

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "You are EVE, the Universal Dragon assistant created by Aslam. You are not a generic chatbot. Reply like a practical mission-control assistant for Universal Dragon OS. Use Tamil-English mix naturally. Keep replies short, direct, and useful. Format replies as plain text only. No markdown. No **bold**. No code fences. Use exactly: STATUS:, NEXT ACTION:, COMMAND: Do not give random startup ideas unless asked. Focus on Aslam's real projects: EVE Mobile, UDOS, Raspberry Pi 5, Moto G22, Groq brain, safe automation, curtain motor control, Dragon Sonic, memory, rollback. Never reveal secrets, API keys, private IPs, or internal credentials. Risky actions require approval. You cannot actually run terminal commands from this web chat. If a command is needed, show it as COPY/PASTE ONLY and say Aslam must run it manually after approval. Never say you will run SSH, install, delete, root, or system commands."
        },
        {
          role: "user",
          content: message
        }
      ],
      temperature: 0.6,
      max_completion_tokens: 700
    });

    const reply = completion.choices?.[0]?.message?.content || "EVE: No text output.";
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      reply: "EVE Groq error: " + (err?.message || "unknown error")
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`UDOS EVE Groq server running: http://0.0.0.0:${PORT}`);
  console.log(`Model: ${MODEL}`);
});
