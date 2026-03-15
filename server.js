const express = require("express")
const session = require("express-session")
const multer = require("multer")
const fs = require("fs")
const path = require("path")

const app = express()
const PORT = process.env.PORT || 3000

const ADMIN = "Sunandfriend2296"

app.set("trust proxy",1)

app.use(express.json())
app.use(express.urlencoded({extended:true}))

app.use(session({
secret:"dasanrp-secret",
resave:false,
saveUninitialized:false,
cookie:{maxAge:1000*60*60}
}))

app.use(express.static("public"))
app.use("/uploads",express.static("uploads"))

if(!fs.existsSync("data")) fs.mkdirSync("data")
if(!fs.existsSync("uploads")) fs.mkdirSync("uploads")

if(!fs.existsSync("data/reports.json")){
fs.writeFileSync("data/reports.json","[]")
}

if(!fs.existsSync("data/users.json")){
fs.writeFileSync("data/users.json",JSON.stringify([
{username:"Sunandfriend2296",password:"1234"}
],null,2))
}

const storage = multer.diskStorage({
destination:(req,file,cb)=>{
cb(null,"uploads/")
},
filename:(req,file,cb)=>{
cb(null,Date.now()+"-"+file.originalname)
}
})

const upload = multer({storage})

function getUsers(){
return JSON.parse(fs.readFileSync("data/users.json"))
}

function getReports(){
return JSON.parse(fs.readFileSync("data/reports.json"))
}

function saveReports(data){
fs.writeFileSync("data/reports.json",JSON.stringify(data,null,2))
}

app.get("/",(req,res)=>{
res.redirect("/login.html")
})

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

app.post("/report",upload.single("image"),(req,res)=>{

if(!req.session.user){
return res.status(403).send("login required")
}

let reports=getReports()

reports.push({
id:Date.now(),
user:req.session.user,
description:req.body.description,
image:req.file ? "/uploads/"+req.file.filename : null,
time:new Date().toLocaleString()
})

saveReports(reports)

res.redirect("/report.html")

})

app.get("/admin/reports",(req,res)=>{

if(req.session.user !== ADMIN){
return res.status(403).send("admin only")
}

res.json(getReports())

})

app.delete("/admin/delete/:id",(req,res)=>{

if(req.session.user !== ADMIN){
return res.status(403).send("admin only")
}

let reports=getReports()

reports=reports.filter(r=>r.id != req.params.id)

saveReports(reports)

res.json({success:true})

})

app.listen(PORT,()=>{
console.log("server running")
})