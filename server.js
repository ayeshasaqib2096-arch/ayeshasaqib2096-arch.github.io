// Secure proxy: API keys stay on the server, never in the browser.
const express = require("express");
const rateLimit = require("express-rate-limit");
const path = require("path");

const UPSTREAM = {
  groq: { url: "https://api.groq.com/openai/v1", key: process.env.GROQ_API_KEY },
  // Gemini free tier lets Google use prompts to improve its products, so it is OFF unless you enable billing and set GEMINI_PAID=true
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai", key: process.env.GEMINI_PAID === "true" ? process.env.GEMINI_API_KEY : undefined },
  openrouter: { url: "https://openrouter.ai/api/v1", key: process.env.OPENROUTER_API_KEY },
};
const ALLOWED = new Set(["models", "chat/completions"]); // nothing else is forwarded
const DAILY_CAP = +process.env.DAILY_REQUEST_CAP || 2000; // total requests/day (protects free quota)

let day = new Date().toDateString(), used = 0;
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  });
  next();
});
// 1) per-IP limiter (also slows code guessing)
app.use("/api", rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests." } }));
// 2) access-code login: ACCESS_CODES="ali-9fK2,sara-Xp81" (one code per customer; remove a code to cancel access)
const CODES = new Map((process.env.ACCESS_CODES || "").split(",").map(s => s.trim()).filter(Boolean).map(c => [c, { day: "", n: 0 }]));
const USER_DAILY = +process.env.USER_DAILY_REQUESTS || 100;
app.use("/api", (req, res, next) => {
  if (!CODES.size) return res.status(503).json({ error: "App not configured" });
  const u = CODES.get(req.get("x-access-code") || "");
  if (!u) return res.status(401).json({ error: "Invalid access code" });
  const d = new Date().toDateString();
  if (u.day !== d) { u.day = d; u.n = 0; }
  if (req.path.endsWith("chat/completions") && ++u.n > USER_DAILY) return res.status(429).json({ error: "Your daily limit is reached." });
  next();
});
// 3) per-customer limiter
app.use("/api", rateLimit({ windowMs: 60_000, limit: +process.env.PER_USER_PER_MIN || 15, keyGenerator: req => req.get("x-access-code") || "none", validate: false,
  message: { error: "Too many requests. Please wait a minute." } }));

app.all("/api/:prov/*", async (req, res) => {
  const p = UPSTREAM[req.params.prov], sub = req.params[0];
  if (!p || !p.key) return res.status(404).json({ error: "Provider not available" });
  if (!ALLOWED.has(sub)) return res.status(403).json({ error: "Not allowed" });
  if (new Date().toDateString() !== day) { day = new Date().toDateString(); used = 0; }
  if (sub === "chat/completions" && ++used > DAILY_CAP) return res.status(429).json({ error: "Daily limit reached. Try tomorrow." });
  try {
    const r = await fetch(`${p.url}/${sub}`, {
      method: req.method,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + p.key },
      body: req.method === "POST" ? JSON.stringify(req.body) : undefined,
    });
    res.status(r.status).set("Content-Type", r.headers.get("content-type") || "application/json");
    if (!r.body) return res.end();
    for await (const chunk of r.body) res.write(chunk); // streams the reply
    res.end();
  } catch (e) {
    res.status(502).json({ error: "Upstream error" });
  }
});

app.get("/health", (req, res) => res.send("ok"));
app.get("/legal", (req, res) => res.sendFile(path.join(__dirname, "legal.html")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html"))); // only the page is public
app.listen(process.env.PORT || 3000, () => console.log("Running on port " + (process.env.PORT || 3000)));
