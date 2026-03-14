const express = require("express");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

app.set("trust proxy", 1);

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");

const USERS_FILE = path.join(DATA_DIR, "users.json");
const NOTICES_FILE = path.join(DATA_DIR, "notices.json");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

for (const file of [USERS_FILE, NOTICES_FILE, REPORTS_FILE]) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "[]", "utf8");
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function nowKST() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

async function safeFetch(...args) {
  if (typeof fetch !== "undefined") {
    return fetch(...args);
  }
  const nodeFetch = (...fetchArgs) =>
    import("node-fetch").then(({ default: f }) => f(...fetchArgs));
  return nodeFetch(...args);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "roblox-report-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const safeName =
        Date.now() +
        "-" +
        Math.random().toString(36).slice(2) +
        "-" +
        file.originalname.replace(/[^\w.\-가-힣]/g, "_");
      cb(null, safeName);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
});

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login.html");
  }
  next();
}

app.post(
  "/api/reports",
  requireLogin,
  upload.single("video"),
  async (req, res) => {
    try {
      const targetUsername = (req.body.targetUsername || "").trim();
      const description = (req.body.description || "").trim();

      if (!req.file) {
        return res.json({
          success: false,
          message: "영상 업로드 필요",
        });
      }

      const reports = readJson(REPORTS_FILE);

      const newReport = {
        id: Date.now(),
        reporter: req.session.user.robloxUsername,
        target: targetUsername,
        description,
        video: req.file.filename,
        createdAt: nowKST(),
      };

      reports.push(newReport);
      writeJson(REPORTS_FILE, reports);

      // 🔥 디코 전송
      try {
        const webhook = process.env.DISCORD_WEBHOOK_URL;

        if (webhook) {
          const form = new FormData();

          form.append(
            "payload_json",
            JSON.stringify({
              username: "신고봇",
              embeds: [
                {
                  title: "🚨 새로운 신고 접수",
                  color: 16711680,
                  fields: [
                    {
                      name: "신고자",
                      value: req.session.user.robloxUsername,
                      inline: true,
                    },
                    {
                      name: "신고 대상",
                      value: targetUsername || "없음",
                      inline: true,
                    },
                    {
                      name: "설명",
                      value: description || "없음",
                    },
                  ],
                  timestamp: new Date(),
                },
              ],
            })
          );

          form.append("file", fs.createReadStream(req.file.path));

          await safeFetch(webhook, {
            method: "POST",
            body: form,
          });
        }
      } catch (err) {
        console.error("디코 전송 실패:", err);
      }

      res.json({
        success: true,
        message: "신고 접수 완료",
      });
    } catch (error) {
      console.error(error);
      res.json({
        success: false,
        message: "신고 오류",
      });
    }
  }
);

app.get("/", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login.html");
  }
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});