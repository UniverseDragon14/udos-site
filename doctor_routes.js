import express from "express";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const router = express.Router();
const ROOT = process.cwd();
const STATE_FILE = path.join(ROOT, "doctor_state.json");

const BLOCKED = [
  "malware",
  "account breaking",
  "steal data",
  "silent tracking",
  "bypass real systems",
  "damage systems"
];

const ALLOWED = [
  "defensive diagnostics",
  "safe patching",
  "rollback",
  "learning from crash logs",
  "approval based code changes",
  "hardware actions only with yes/no approval"
];

function requireDoctorToken(req, res, next) {
  const expected = process.env.DOCTOR_TOKEN || "";
  const given =
    req.headers["x-doctor-token"] ||
    req.query.token ||
    "";

  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "DOCTOR_TOKEN missing on server"
    });
  }

  if (given !== expected) {
    return res.status(401).json({
      ok: false,
      error: "Doctor token required"
    });
  }

  next();
}

function safeExec(cmd, args = []) {
  try {
    return execFileSync(cmd, args, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 200000
    }).trim();
  } catch (e) {
    return String(e.stdout || e.stderr || e.message || e).trim();
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function redact(text) {
  return String(text)
    .replace(/ghp_[A-Za-z0-9_]+/g, "REDACTED_GITHUB_TOKEN")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "REDACTED_GITHUB_TOKEN")
    .replace(/sk-[A-Za-z0-9_-]+/g, "REDACTED_OPENAI_KEY")
    .replace(/gsk_[A-Za-z0-9_-]+/g, "REDACTED_GROQ_KEY")
    .replace(/AIza[A-Za-z0-9_-]+/g, "REDACTED_GOOGLE_KEY");
}

function safeFileList() {
  const skipDirs = new Set(["node_modules", ".git", "android", "dist", ".next"]);
  const skipFiles = new Set([".env", "doctor_state.json"]);
  const out = [];

  function walk(dir, depth = 0) {
    if (depth > 2 || out.length > 120) return;

    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipDirs.has(item.name) || skipFiles.has(item.name)) continue;

      const full = path.join(dir, item.name);
      const rel = path.relative(ROOT, full);

      if (item.isDirectory()) {
        walk(full, depth + 1);
      } else {
        out.push(rel);
      }
    }
  }

  walk(ROOT);
  return out;
}

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "NOVA Dev Doctor V2",
    mode: "read-only",
    safety: "approval-first"
  });
});

router.get("/rules", (req, res) => {
  res.json({
    blocked: BLOCKED,
    allowed: ALLOWED,
    rule: "No risky action without explicit yes/no approval."
  });
});

router.get("/devscan", requireDoctorToken, (req, res) => {
  const pkg = readJson(path.join(ROOT, "package.json"), { scripts: {} });

  res.json({
    ok: true,
    service: "NOVA Dev Doctor V2",
    mode: "read-only scan",
    root: ROOT,
    branch: safeExec("git", ["branch", "--show-current"]),
    git_status: redact(safeExec("git", ["status", "--short"])),
    recent_commits: redact(safeExec("git", ["log", "--oneline", "-5"])),
    package_scripts: pkg.scripts || {},
    files: safeFileList(),
    safety: {
      blocked: BLOCKED,
      allowed: ALLOWED
    },
    next: [
      "Use /api/doctor/fixplan for plan only.",
      "Use /api/doctor/approve only after human yes.",
      "No file write happens from devscan."
    ]
  });
});

router.post("/fixplan", requireDoctorToken, (req, res) => {
  const errorText = redact(req.body?.error || req.body?.log || "");
  const target = req.body?.target || "unknown";

  res.json({
    ok: true,
    mode: "plan-only",
    target,
    received_error_preview: errorText.slice(0, 1500),
    plan: [
      "1. Identify exact failing file or command.",
      "2. Backup before change.",
      "3. Prepare patch only.",
      "4. Ask approval.",
      "5. Apply only after yes.",
      "6. Test build.",
      "7. Rollback if failed."
    ],
    writes_files: false,
    requires_approval_for_patch: true
  });
});

router.post("/approve", requireDoctorToken, (req, res) => {
  const approve = req.body?.approve === true || req.body?.approve === "yes";

  const state = {
    approved: approve,
    note: req.body?.note || "",
    time: new Date().toISOString(),
    mode: "approval record only"
  };

  writeJson(STATE_FILE, state);

  res.json({
    ok: true,
    saved: state,
    message: approve
      ? "Approval recorded. No patch applied by this endpoint."
      : "Approval rejected/cancelled."
  });
});

export default router;
