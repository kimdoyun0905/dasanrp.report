const express = require("express");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");

const USERS_FILE = path.join(DATA_DIR, "users.json");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(REPORTS_FILE)) fs.writeFileSync(REPORTS_FILE, "[]");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "report-secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));

/* 파일 업로드 */

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) =>
      cb(null, Date.now() + "-" + file.originalname),
  }),
});

/* 로그인 체크 */

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.json({
      success: false,
      message: "로그인이 필요합니다.",
    });
  }
  next();
}

/* 로그인 */

app.post("/api/login", (req, res) => {
  const { siteId, password } = req.body;

  const users = readJson(USERS_FILE);

  const user = users.find((u) => u.siteId === siteId);

  if (!user || user.password !== password) {
    return res.json({
      success: false,
      message: "아이디 또는 비밀번호가 틀렸습니다.",
    });
  }

  req.session.user = user;

  res.json({ success: true });
});

/* 현재 로그인 */

app.get("/api/me", (req, res) => {
  if (!req.session.user) {
    return res.json({ loggedIn: false });
  }

  res.json({
    loggedIn: true,
    user: req.session.user,
  });
});

/* 신고 */

app.post(
  "/api/reports",
  requireLogin,
  upload.single("video"),
  async (req, res) => {
    try {
      const targetUsername = req.body.targetUsername;
      const description = req.body.description;

      if (!req.file) {
        return res.json({
          success: false,
          message: "영상 또는 사진을 업로드하세요.",
        });
      }

      const reports = readJson(REPORTS_FILE);

      const newReport = {
        id: Date.now(),
        reporter: req.session.user.robloxUsername,
        target: targetUsername,
        description,
        file: req.file.filename,
        createdAt: new Date().toLocaleString("ko-KR"),
      };

      reports.push(newReport);
      writeJson(REPORTS_FILE, reports);

      /* 디스코드 웹훅 */

      try {
        const webhook = process.env.DISCORD_WEBHOOK_URL;

        if (webhook) {
          await fetch(webhook, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: `🚨 새로운 신고

신고자: ${newReport.reporter}
신고 대상: ${newReport.target}

내용:
${newReport.description}

증거:
${req.protocol}://${req.get("host")}/uploads/${newReport.file}`,
            }),
          });
        }
      } catch (err) {
        console.log("디스코드 전송 실패", err);
      }

      res.json({
        success: true,
        message: "신고가 접수되었습니다.",
      });
    } catch (err) {
      console.log(err);

      res.json({
        success: false,
        message: "신고 처리 오류",
      });
    }
  }
);

/* 페이지 */

app.get("/", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login.html");
  }

  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log("server running");
});

app.get("/api/notices", (req, res) => {

  const file = path.join(__dirname, "data", "notices.json");

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "[]");
  }

  const notices = JSON.parse(fs.readFileSync(file));

  res.json({
    success: true,
    notices
  });

});

app.post("/api/notices", (req, res) => {

  const { title, content } = req.body;

  const file = path.join(__dirname, "data", "notices.json");

  let notices = [];

  if (fs.existsSync(file)) {
    notices = JSON.parse(fs.readFileSync(file));
  }

  const newNotice = {
    id: Date.now(),
    title,
    content,
    createdAt: new Date().toLocaleString("ko-KR")
  };

  notices.push(newNotice);

  fs.writeFileSync(file, JSON.stringify(notices, null, 2));

  res.json({
    success: true
  });

});