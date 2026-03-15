const express = require("express")
const session = require("express-session")
const multer = require("multer")
const fs = require("fs")
const path = require("path")

const app = express()
const PORT = process.env.PORT || 3000

const DATA_DIR = path.join(__dirname,"data")
const UPLOAD_DIR = path.join(__dirname,"uploads")

if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR)
if(!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR)

const USERS_FILE = path.join(DATA_DIR,"users.json")
const REPORT_FILE = path.join(DATA_DIR,"reports.json")

if(!fs.existsSync(REPORT_FILE)) fs.writeFileSync(REPORT_FILE,"[]")

const ADMIN_USER = "Sunandfriend2296"

app.use(express.json())
app.use(express.urlencoded({extended:true}))

app.use(session({
secret:"report-secret",
resave:false,
saveUninitialized:false
}))

app.use(express.static("public"))
app.use("/uploads",express.static("uploads"))

const storage = multer.diskStorage({
destination:(req,file,cb)=>{
cb(null,UPLOAD_DIR)
},
filename:(req,file,cb)=>{
cb(null,Date.now()+"-"+file.originalname)
}
})

const upload = multer({storage})

function getUsers(){
return JSON.parse(fs.readFileSync(USERS_FILE))
}

function getReports(){
return JSON.parse(fs.readFileSync(REPORT_FILE))
}

function saveReports(data){
fs.writeFileSync(REPORT_FILE,JSON.stringify(data,null,2))
}

function checkAdmin(req,res,next){
if(req.session.user !== ADMIN_USER){
return res.status(403).send("관리자만 접근 가능")
}
next()
}

app.post("/login",(req,res)=>{

const {username,password}=req.body
const users=getUsers()

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

app.get("/generate-code",(req,res)=>{

if(!req.session.user){
return res.status(401).json({error:"login"})
}

const code=Math.floor(100000+Math.random()*900000)

req.session.code=code

res.json({code})

})

app.post("/report",upload.single("image"),(req,res)=>{

if(!req.session.user){
return res.status(401).send("login required")
}

const reports=getReports()

const newReport={
id:Date.now(),
user:req.session.user,
description:req.body.description,
image:req.file ? "/uploads/"+req.file.filename : null,
time:new Date().toISOString()
}

reports.push(newReport)

saveReports(reports)

res.redirect("/report.html")

})

app.get("/admin/reports",checkAdmin,(req,res)=>{
res.json(getReports())
})

app.delete("/admin/delete/:id",checkAdmin,(req,res)=>{

const id=parseInt(req.params.id)

let reports=getReports()

reports=reports.filter(r=>r.id!==id)

saveReports(reports)

res.json({success:true})

})

app.listen(PORT,()=>{
console.log("Server running")
})