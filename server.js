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
  } catch (error) {
    console.error(`JSON 읽기 실패: ${filePath}`, error);
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

const pendingCodes = new Map();
const verifiedRobloxUsers = new Map();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "roblox-report-site-secret-key-change-this",
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
      const safeOriginalName = file.originalname.replace(/[^\w.\-가-힣]/g, "_");
      const safeName = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}-${safeOriginalName}`;
      cb(null, safeName);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-matroska",
    ];

    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("영상 파일만 업로드할 수 있습니다."));
    }
  },
});

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      message: "로그인이 필요합니다.",
    });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      message: "로그인이 필요합니다.",
    });
  }

  if (req.session.user.robloxUsername !== "Sunandfriend2296") {
    return res.status(403).json({
      success: false,
      message: "관리자만 가능합니다.",
    });
  }

  next();
}

async function getRobloxUserByUsername(username) {
  const r1 = await safeFetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: false,
    }),
  });

  if (!r1.ok) {
    throw new Error("Roblox 사용자 조회 실패");
  }

  const d1 = await r1.json();

  if (!d1.data || !d1.data[0]) {
    return null;
  }

  const userId = d1.data[0].id;
  const normalizedName = d1.data[0].name;
  const displayName = d1.data[0].displayName;

  const r2 = await safeFetch(`https://users.roblox.com/v1/users/${userId}`);
  if (!r2.ok) {
    throw new Error("Roblox 프로필 조회 실패");
  }

  const d2 = await r2.json();

  return {
    userId,
    name: normalizedName,
    displayName,
    description: d2.description || "",
    profileUrl: `https://www.roblox.com/users/${userId}/profile`,
  };
}

function seedNoticesIfEmpty() {
  const notices = readJson(NOTICES_FILE);

  if (notices.length === 0) {
    const seeded = [
      {
        id: 1,
        title: "신고 시 반드시 영상 증거를 첨부해야 합니다.",
        content:
          "신고 접수 시에는 반드시 영상 증거를 첨부해 주세요.\n\n영상이 없으면 사실 확인이 어렵기 때문에 처리되지 않을 수 있습니다.",
        createdAt: nowKST(),
        author: "관리자",
      },
      {
        id: 2,
        title: "허위 신고 시 제재될 수 있습니다.",
        content:
          "허위 신고, 장난 신고, 악의적인 신고는 운영 방해로 간주될 수 있으며 제재 대상이 될 수 있습니다.",
        createdAt: nowKST(),
        author: "관리자",
      },
      {
        id: 3,
        title: "신고 결과는 디스코드를 통해 안내될 수 있습니다.",
        content:
          "신고 처리 결과는 내부 검토 후 디스코드 서버 또는 별도 공지를 통해 안내될 수 있습니다.",
        createdAt: nowKST(),
        author: "관리자",
      },
    ];

    writeJson(NOTICES_FILE, seeded);
  }
}

seedNoticesIfEmpty();

app.get("/api/me", (req, res) => {
  if (!req.session.user) {
    return res.json({ loggedIn: false });
  }

  return res.json({
    loggedIn: true,
    user: req.session.user,
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

app.post("/api/generate-verify-code", async (req, res) => {
  try {
    const robloxUsername = (req.body.robloxUsername || "").trim();

    if (!robloxUsername) {
      return res.status(400).json({
        success: false,
        message: "Roblox 닉네임을 입력하세요.",
      });
    }

    const robloxUser = await getRobloxUserByUsername(robloxUsername);

    if (!robloxUser) {
      return res.status(404).json({
        success: false,
        message: "Roblox 유저를 찾을 수 없습니다.",
      });
    }

    const code = `VERIFY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    pendingCodes.set(robloxUser.name.toLowerCase(), code);

    return res.json({
      success: true,
      code,
      profileUrl: robloxUser.profileUrl,
      normalizedUsername: robloxUser.name,
      displayName: robloxUser.displayName,
    });
  } catch (error) {
    console.error("인증 코드 생성 오류:", error);
    return res.status(500).json({
      success: false,
      message: "인증 코드 생성 중 오류가 발생했습니다.",
    });
  }
});

app.post("/api/check-verify", async (req, res) => {
  try {
    const robloxUsername = (req.body.robloxUsername || "").trim();

    if (!robloxUsername) {
      return res.status(400).json({
        success: false,
        message: "Roblox 닉네임을 입력하세요.",
      });
    }

    const robloxUser = await getRobloxUserByUsername(robloxUsername);

    if (!robloxUser) {
      return res.status(404).json({
        success: false,
        message: "Roblox 유저를 찾을 수 없습니다.",
      });
    }

    const expectedCode = pendingCodes.get(robloxUser.name.toLowerCase());

    if (!expectedCode) {
      return res.status(400).json({
        success: false,
        message: "먼저 인증 코드를 생성하세요.",
      });
    }

    const verified = robloxUser.description.includes(expectedCode);

    if (!verified) {
      return res.json({
        success: false,
        message: "프로필 설명에서 인증 코드를 찾지 못했습니다.",
      });
    }

    verifiedRobloxUsers.set(robloxUser.name.toLowerCase(), {
      verified: true,
      userId: robloxUser.userId,
      username: robloxUser.name,
      displayName: robloxUser.displayName,
      verifiedAt: Date.now(),
      profileUrl: robloxUser.profileUrl,
    });

    return res.json({
      success: true,
      message: "Roblox 인증이 완료되었습니다.",
      robloxUser: {
        userId: robloxUser.userId,
        username: robloxUser.name,
        displayName: robloxUser.displayName,
        profileUrl: robloxUser.profileUrl,
      },
    });
  } catch (error) {
    console.error("인증 확인 오류:", error);
    return res.status(500).json({
      success: false,
      message: "인증 확인 중 오류가 발생했습니다.",
    });
  }
});

app.post("/api/signup", (req, res) => {
  try {
    const siteId = (req.body.siteId || "").trim();
    const password = (req.body.password || "").trim();
    const robloxUsername = (req.body.robloxUsername || "").trim();

    if (!siteId || !password || !robloxUsername) {
      return res.status(400).json({
        success: false,
        message: "모든 항목을 입력하세요.",
      });
    }

    const verified = verifiedRobloxUsers.get(robloxUsername.toLowerCase());

    if (!verified || !verified.verified) {
      return res.status(400).json({
        success: false,
        message: "먼저 Roblox 인증을 완료하세요.",
      });
    }

    const users = readJson(USERS_FILE);

    if (users.some((u) => u.siteId.toLowerCase() === siteId.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "이미 존재하는 사이트 아이디입니다.",
      });
    }

    if (
      users.some(
        (u) => u.robloxUsername.toLowerCase() === verified.username.toLowerCase()
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "이미 연동된 Roblox 계정입니다.",
      });
    }

    const newUser = {
      id: Date.now(),
      siteId,
      password,
      robloxUsername: verified.username,
      robloxDisplayName: verified.displayName,
      robloxUserId: verified.userId,
      robloxProfileUrl: verified.profileUrl,
      createdAt: nowKST(),
    };

    users.push(newUser);
    writeJson(USERS_FILE, users);

    verifiedRobloxUsers.delete(robloxUsername.toLowerCase());
    pendingCodes.delete(robloxUsername.toLowerCase());

    return res.json({
      success: true,
      message: "회원가입이 완료되었습니다.",
    });
  } catch (error) {
    console.error("회원가입 오류:", error);
    return res.status(500).json({
      success: false,
      message: "회원가입 중 오류가 발생했습니다.",
    });
  }
});

app.post("/api/login", (req, res) => {
  try {
    const siteId = (req.body.siteId || "").trim();
    const password = (req.body.password || "").trim();

    if (!siteId || !password) {
      return res.status(400).json({
        success: false,
        message: "아이디와 비밀번호를 입력하세요.",
      });
    }

    const users = readJson(USERS_FILE);
    const user = users.find((u) => u.siteId === siteId);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "존재하지 않는 계정입니다.",
      });
    }

    if (user.password !== password) {
      return res.status(400).json({
        success: false,
        message: "비밀번호가 틀렸습니다.",
      });
    }

    req.session.user = {
      siteId: user.siteId,
      robloxUsername: user.robloxUsername,
      robloxDisplayName: user.robloxDisplayName,
      robloxUserId: user.robloxUserId,
      robloxProfileUrl: user.robloxProfileUrl,
      isAdmin: user.robloxUsername === "Sunandfriend2296",
    };

    return res.json({ success: true });
  } catch (error) {
    console.error("로그인 오류:", error);
    return res.status(500).json({
      success: false,
      message: "로그인 중 오류가 발생했습니다.",
    });
  }
});

app.get("/api/notices", requireLogin, (req, res) => {
  const notices = readJson(NOTICES_FILE).sort((a, b) => b.id - a.id);
  return res.json({ success: true, notices });
});

app.post("/api/notices", requireAdmin, (req, res) => {
  try {
    const title = (req.body.title || "").trim();
    const content = (req.body.content || "").trim();

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "제목과 내용을 입력하세요.",
      });
    }

    const notices = readJson(NOTICES_FILE);
    const newNotice = {
      id: notices.length ? Math.max(...notices.map((n) => n.id)) + 1 : 1,
      title,
      content,
      createdAt: nowKST(),
      author: req.session.user.robloxUsername,
    };

    notices.push(newNotice);
    writeJson(NOTICES_FILE, notices);

    return res.json({ success: true, notice: newNotice });
  } catch (error) {
    console.error("공지 작성 오류:", error);
    return res.status(500).json({
      success: false,
      message: "공지 작성 중 오류가 발생했습니다.",
    });
  }
});

app.post(
  "/api/reports",
  requireLogin,
  (req, res, next) => {
    upload.single("video")(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          success: false,
          message: err.message,
        });
      }

      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || "파일 업로드 중 오류가 발생했습니다.",
        });
      }

      next();
    });
  },
  async (req, res) => {
    try {
      const targetUsername = (req.body.targetUsername || "").trim();
      const description = (req.body.description || "").trim();

      if (!targetUsername || !description) {
        return res.status(400).json({
          success: false,
          message: "신고 대상과 설명을 입력하세요.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "영상 파일을 업로드하세요.",
        });
      }

      const reports = readJson(REPORTS_FILE);

      const newReport = {
        id: reports.length ? Math.max(...reports.map((r) => r.id)) + 1 : 1,
        reporterSiteId: req.session.user.siteId,
        reporterRobloxUsername: req.session.user.robloxUsername,
        targetUsername,
        description,
        videoFile: req.file.filename,
        videoUrl: `/uploads/${req.file.filename}`,
        createdAt: nowKST(),
        status: "접수됨",
      };

      reports.push(newReport);
      writeJson(REPORTS_FILE, reports);

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
                      name: "신고자 사이트 ID",
                      value: req.session.user.siteId || "없음",
                      inline: true,
                    },
                    {
                      name: "신고자 Roblox",
                      value: req.session.user.robloxUsername || "없음",
                      inline: true,
                    },
                    {
                      name: "신고 대상",
                      value: targetUsername || "없음",
                      inline: false,
                    },
                    {
                      name: "설명",
                      value: description || "없음",
                      inline: false,
                    },
                    {
                      name: "접수 시각",
                      value: nowKST(),
                      inline: false,
                    },
                  ],
                },
              ],
            })
          );

          form.append("file", fs.createReadStream(req.file.path), req.file.filename);

          const discordResponse = await safeFetch(webhook, {
            method: "POST",
            body: form,
            headers: form.getHeaders(),
          });

          if (!discordResponse.ok) {
            const errorText = await discordResponse.text();
            console.error("디스코드 전송 실패:", errorText);
          }
        }
      } catch (err) {
        console.error("디스코드 전송 실패:", err);
      }

      return res.json({ success: true, report: newReport });
    } catch (error) {
      console.error("신고 접수 오류:", error);
      return res.status(500).json({
        success: false,
        message: "신고 접수 중 오류가 발생했습니다.",
      });
    }
  }
);

app.get("/", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login.html");
  }
  return res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/index.html", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login.html");
  }
  return res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/login.html", (req, res) => {
  return res.sendFile(path.join(PUBLIC_DIR, "login.html"));
});

app.get("/signup.html", (req, res) => {
  return res.sendFile(path.join(PUBLIC_DIR, "signup.html"));
});

app.get("/notice.html", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login.html");
  }
  return res.sendFile(path.join(PUBLIC_DIR, "notice.html"));
});

app.get("/report.html", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login.html");
  }
  return res.sendFile(path.join(PUBLIC_DIR, "report.html"));
});

app.use("/api", (req, res) => {
  return res.status(404).json({
    success: false,
    message: "API를 찾을 수 없습니다.",
  });
});

app.use((req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({
      success: false,
      message: "API를 찾을 수 없습니다.",
    });
  }

  if (!req.session.user) {
    return res.redirect("/login.html");
  }

  return res.status(404).sendFile(path.join(PUBLIC_DIR, "login.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});