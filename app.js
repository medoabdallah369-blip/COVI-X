import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ضع إعدادات مشروع Firebase هنا بعد إنشائه. لا تضع مفاتيح خاصة أو كلمات مرور في هذا الملف. */
  const firebaseConfig = {
  apiKey: "AIzaSyB9Lq_LhCYezEb_JiVPDHXmyZZvQ_jOdWo",
  authDomain: "covi-x.firebaseapp.com",
  projectId: "covi-x",
  storageBucket: "covi-x.firebasestorage.app",
  messagingSenderId: "347535108348",
  appId: "1:347535108348:web:083a472b12e7b827c44f79",
  measurementId: "G-R78D64XJM0"
};
const configured = !Object.values(firebaseConfig).some(v => String(v).startsWith("ADD_"));
let auth, db, currentUser;
let products=[], sales=[], expenses=[], unsub=[];
const $ = id => document.getElementById(id);
const money = n => (Number(n)||0).toLocaleString("ar-EG",{maximumFractionDigits:2})+" ج";
const safe = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2600)}
function showApp(yes){$("login").classList.toggle("hidden",yes);$("app").classList.toggle("hidden",!yes)}
function coll(name){return collection(db,"workspaces","COVIX",name)}
function subscribe(){
  unsub.forEach(fn=>fn());unsub=[];
  for(const name of ["products","sales","expenses"]){
    const fn=onSnapshot(query(coll(name),orderBy("createdAt","desc")),snap=>{
      const data=snap.docs.map(d=>({id:d.id,...d.data()}));
      if(name==="products")products=data;
      if(name==="sales")sales=data;
      if(name==="expenses")expenses=data;
      render();
    },err=>toast("تعذر تحميل البيانات: "+err.message));
    unsub.push(fn);
  }
}
function render(){
  const delivered=sales.filter(s=>s.status==="تم التسليم");
  const revenue=delivered.reduce((a,s)=>a+Number(s.total||0),0);
  const cogs=delivered.reduce((a,s)=>a+Number(s.costTotal||0),0);
  const exp=expenses.reduce((a,e)=>a+Number(e.amount||0),0);
  $("totalSales").textContent=money(revenue);
  $("netProfit").textContent=money(revenue-cogs-exp);
  $("ordersCount").textContent=delivered.length;
  $("stockValue").textContent=money(products.reduce((a,p)=>a+Math.max(0,Number(p.stock||0))*Number(p.cost||0),0));
  $("quickSummary").textContent=`لديك ${products.length} منتج مسجل، و${sales.filter(s=>s.status!=="تم التسليم"&&s.status!=="ملغي"&&s.status!=="مرتجع").length} طلب قيد التنفيذ.`;
  const low=products.filter(p=>Number(p.stock||0)<=3);
  $("lowStock").innerHTML=low.length?low.map(p=>`<div>${safe(p.name)} — المتبقي ${Number(p.stock||0)}</div>`).join(""):"كل المنتجات أعلى من حد التنبيه (3 قطع).";
  $("productsList").innerHTML=products.map(p=>`<div class="item"><div><strong>${safe(p.name)}</strong><small>${safe(p.code||"بدون كود")} · تكلفة ${money(p.cost)} · بيع ${money(p.price)}</small></div><div class="item-actions"><span class="pill">المخزون ${Number(p.stock||0)}</span><button class="danger" data-del="products" data-id="${p.id}">حذف</button></div></div>`).join("")||'<div class="panel muted">لا توجد منتجات بعد. اضغط «إضافة» للبدء.</div>';
  $("salesList").innerHTML=sales.map(s=>`<div class="item"><div><strong>${safe(s.customer)} · ${money(s.total)}</strong><small>${safe(s.productName)} × ${s.qty} · ${safe(s.phone||"")} </small></div><div class="item-actions"><span class="pill">${safe(s.status)}</span><button class="danger" data-del="sales" data-id="${s.id}">حذف</button></div></div>`).join("")||'<div class="panel muted">لا توجد طلبات مسجلة.</div>';
  $("expensesList").innerHTML=expenses.map(e=>`<div class="item"><div><strong>${safe(e.type)}</strong><small>${safe(e.note||"")} · ${e.date||""}</small></div><div class="item-actions"><b>${money(e.amount)}</b><button class="danger" data-del="expenses" data-id="${e.id}">حذف</button></div></div>`).join("")||'<div class="panel muted">لا توجد مصروفات مسجلة.</div>';
}
function openModal(title,html,onSubmit){
  $("modalTitle").textContent=title;$("modalForm").innerHTML=html;$("modal").classList.remove("hidden");
  $("modalForm").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);try{await onSubmit(Object.fromEntries(fd.entries()));$("modal").classList.add("hidden");toast("تم الحفظ بنجاح");}catch(err){toast("لم يتم الحفظ: "+err.message)}};
}
$("closeModal").onclick=()=>$("modal").classList.add("hidden");
$("addProductBtn").onclick=()=>openModal("إضافة منتج",`
<label>اسم المنتج<input name="name" required></label><label>كود المنتج<input name="code"></label>
<label>التصنيف<input name="category"></label><label>تكلفة الوحدة بالجنيه<input name="cost" type="number" min="0" step=".01" required></label>
<label>سعر البيع بالجنيه<input name="price" type="number" min="0" step=".01" required></label><label>الكمية الحالية<input name="stock" type="number" min="0" required></label>
<button class="primary">حفظ المنتج</button>`,d=>addDoc(coll("products"),{...d,cost:Number(d.cost),price:Number(d.price),stock:Number(d.stock),createdAt:serverTimestamp(),createdBy:currentUser.uid}));
$("addSaleBtn").onclick=()=>{
 if(!products.length){toast("أضف منتجًا أولاً");return}
 const opts=products.map(p=>`<option value="${p.id}">${safe(p.name)} — ${money(p.price)} (متاح ${p.stock})</option>`).join("");
 openModal("تسجيل طلب جديد",`<label>اسم العميل<input name="customer" required></label><label>رقم الهاتف<input name="phone"></label><label>المنتج<select name="productId">${opts}</select></label><label>الكمية<input name="qty" type="number" min="1" value="1" required></label><label>حالة الطلب<select name="status"><option>جديد</option><option>تم التأكيد</option><option>تم الشحن</option><option>تم التسليم</option><option>ملغي</option><option>مرتجع</option></select></label><button class="primary">حفظ الطلب</button>`,async d=>{
  const p=products.find(x=>x.id===d.productId);const qty=Number(d.qty);
  if(!p||qty<1)throw Error("بيانات المنتج أو الكمية غير صحيحة");
  if(qty>Number(p.stock))throw Error("الكمية المطلوبة أكبر من المخزون المتاح");
  await addDoc(coll("sales"),{customer:d.customer,phone:d.phone,productId:p.id,productName:p.name,qty,unitPrice:Number(p.price),unitCost:Number(p.cost),total:qty*Number(p.price),costTotal:qty*Number(p.cost),status:d.status,createdAt:serverTimestamp(),createdBy:currentUser.uid});
  if(d.status==="تم التسليم") await updateStock(p,qty);
 });
};
async function updateStock(p,qty){
  // MVP: تحديث مباشر للمخزون؛ يوصى بإضافة معاملات Firestore في مرحلة الإنتاج لمنع تعارض البيع المتزامن.
  const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
  await updateDoc(doc(db,"workspaces","COVIX","products",p.id),{stock:Number(p.stock)-qty});
}
$("addExpenseBtn").onclick=()=>openModal("إضافة مصروف",`<label>نوع المصروف<input name="type" placeholder="إعلان / تغليف / شحن" required></label><label>المبلغ بالجنيه<input name="amount" type="number" min="0" step=".01" required></label><label>التاريخ<input name="date" type="date" required></label><label>ملاحظات<input name="note"></label><button class="primary">حفظ المصروف</button>`,d=>addDoc(coll("expenses"),{...d,amount:Number(d.amount),createdAt:serverTimestamp(),createdBy:currentUser.uid}));
document.addEventListener("click",async e=>{
 const b=e.target.closest("[data-del]");if(!b)return;
 if(!confirm("هل تريد حذف هذا السجل؟"))return;
 try{await deleteDoc(doc(db,"workspaces","COVIX",b.dataset.del,b.dataset.id));toast("تم الحذف")}catch(err){toast("تعذر الحذف: "+err.message)}
});
document.querySelectorAll(".navbtn").forEach(b=>b.onclick=()=>{
 document.querySelectorAll(".navbtn").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");
 document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$(b.dataset.page).classList.add("active");
});
$("loginBtn").onclick=async()=>{
 if(!configured){$("loginMsg").textContent="لم يتم إعداد Firebase بعد. راجع ملف README داخل حزمة التطبيق.";return}
 try{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value)}catch(e){$("loginMsg").textContent="تعذر تسجيل الدخول. راجع البريد وكلمة المرور."}
};
$("logoutBtn").onclick=()=>signOut(auth);
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js"));
if(configured){
 const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
 onAuthStateChanged(auth,user=>{currentUser=user;showApp(!!user);if(user)subscribe();else{unsub.forEach(fn=>fn());products=[];sales=[];expenses=[]}});
}else{$("loginMsg").textContent="نسخة تجهيز: اربط التطبيق بقاعدة بيانات Firebase حسب دليل README لتفعيل الدخول والمزامنة."}
