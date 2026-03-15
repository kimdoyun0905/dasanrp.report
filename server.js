const express = require("express")
const session = require("express-session")
const multer = require("multer")
const fs = require("fs")
const path = require("path")

const app = express()
const PORT = process.env.PORT || 3000

const DATA = path.join(__dirname,"data")
const UPLOAD = path.join(__dirname,"uploads")

const ADMIN = "Sunandfriend2296"

app.use(express.json())
app.use(express.urlencoded({extended:true}))

app.use(session({
secret:"dasanrp-secret",
resave:false,
saveUninitialized:false
}))

app.use(express.static("public"))
app.use("/uploads",express.static("uploads"))

if(!fs.existsSync(DATA)) fs.mkdirSync(DATA)
if(!fs.existsSync(UPLOAD)) fs.mkdirSync(UPLOAD)

const USERS = path.join(DATA,"users.json")
const REPORTS = path.join(DATA,"reports.json")
const NOTICE = path.join(DATA,"notice.json")

if(!fs.existsSync(USERS)){
fs.writeFileSync(USERS,JSON.stringify([
{username:"Sunandfriend2296",password:"1234"}
],null,2))
}

if(!fs.existsSync(REPORTS)){
fs.writeFileSync(REPORTS,"[]")
}

if(!fs.existsSync(NOTICE)){
fs.writeFileSync(NOTICE,JSON.stringify([
"허위 신고 시 제재될 수 있습니다.",
"운영진 멘션은 긴급 상황에서만 사용하세요."
],null,2))
}

function read(file){
return JSON.parse(fs.readFileSync(file))
}

function write(file,data){
fs.writeFileSync(file,JSON.stringify(data,null,2))
}

app.get("/",(req,res)=>{
res.redirect("/login.html")
})

app.get("/api/notices",(req,res)=>{
res.json(read(NOTICE))
})

app.post("/login",(req,res)=>{

const {username,password}=req.body

const users=read(USERS)

const user=users.find(u=>u.username===username && u.password===password)

if(!user){
return res.json({success:false})
}

req.session.user=username

res.json({success:true})

})

app.get("/logout",(req,res)=>{
req.session.destroy(()=>{
res.json({success:true})
})
})

const storage = multer.diskStorage({
destination:(req,file,cb)=>cb(null,UPLOAD),
filename:(req,file,cb)=>cb(null,Date.now()+"-"+file.originalname)
})

const upload = multer({storage})

app.post("/report",upload.single("image"),(req,res)=>{

if(!req.session.user){
return res.status(403).send("login required")
}

let reports=read(REPORTS)

reports.push({
id:Date.now(),
user:req.session.user,
description:req.body.description,
image:req.file?"/uploads/"+req.file.filename:null,
time:new Date().toLocaleString()
})

write(REPORTS,reports)

res.redirect("/report.html")

})

app.get("/admin/reports",(req,res)=>{

if(req.session.user !== ADMIN){
return res.status(403).send("admin only")
}

res.json(read(REPORTS))

})

app.delete("/admin/delete/:id",(req,res)=>{

if(req.session.user !== ADMIN){
return res.status(403).send("admin only")
}

let reports=read(REPORTS)

reports = reports.filter(r=>r.id != req.params.id)

write(REPORTS,reports)

res.json({success:true})

})

app.listen(PORT,()=>{
console.log("server running")
})