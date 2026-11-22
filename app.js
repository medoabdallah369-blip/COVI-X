
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// --------------------
// Firebase
// --------------------

const firebaseConfig = {
  apiKey: "AIzaSyB9Lq_LhCYezEb_JiVPDHXmyZZvQ_jOdWo",
  authDomain: "covi-x.firebaseapp.com",
  projectId: "covi-x",
  storageBucket: "covi-x.firebasestorage.app",
  messagingSenderId: "347535108348",
  appId: "1:347535108348:web:083a472b12e7b827c44f79",
  measurementId: "G-R78D64XJM0"
};

let auth;
let db;
let currentUser = null;

let products = [];
let sales = [];
let expenses = [];
let purchases = [];

let unsubscribers = [];
let modalSubmitHandler = null;

const $ = id => document.getElementById(id);

const number = value => Number(value || 0);

const money = value =>
  number(value).toLocaleString("ar-EG", {
    maximumFractionDigits: 2
  }) + " ج.م";

const escapeHTML = value =>
  String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);

function toast(message) {
  const element = $("toast");

  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;
  element.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    element.classList.remove("show");
  }, 3000);
}

function showApp(loggedIn) {
  $("login")?.classList.toggle("hidden", loggedIn);
  $("app")?.classList.toggle("hidden", !loggedIn);
}

function getCollection(name) {
  return collection(db, "workspaces", "COVIX", name);
}

function getDocument(name, id) {
  return doc(db, "workspaces", "COVIX", name, id);
}

function formatDate(value) {
  if (!value) return "—";

  if (value.toDate) {
    return value.toDate().toLocaleDateString("ar-EG");
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("ar-EG");
}

function openModal(title, html, handler) {
  const modal = $("modal");
  const form = $("modalForm");

  if (!modal || !form) {
    toast("نافذة الإدخال غير موجودة في الصفحة");
    return;
  }

  $("modalTitle").textContent = title;
  form.innerHTML = html;
  modalSubmitHandler = handler;

  form.onsubmit = async event => {
    event.preventDefault();

    if (!modalSubmitHandler) return;

    const submitButton = form.querySelector('[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "جارٍ الحفظ...";
    }

    try {
      await modalSubmitHandler(new FormData(form));
    } catch (error) {
      console.error(error);
      toast(error.message || "حدث خطأ أثناء الحفظ");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "حفظ";
      }
    }
  };

  modal.classList.remove("hidden");
}

function closeModal() {
  $("modal")?.classList.add("hidden");

  if ($("modalForm")) {
    $("modalForm").onsubmit = null;
    $("modalForm").innerHTML = "";
  }

  modalSubmitHandler = null;
}

function field(label, name, type = "text", required = true, value = "") {
  return `
    <label class="form-label">
      ${label}
      <input
        class="form-input"
        name="${name}"
        type="${type}"
        value="${escapeHTML(value)}"
        ${required ? "required" : ""}
        ${type === "number" ? 'step="any"' : ""}
      >
    </label>
  `;
}

function selectField(label, name, options, required = true) {
  return `
    <label class="form-label">
      ${label}
      <select class="form-input" name="${name}" ${required ? "required" : ""}>
        ${options.map(option => `
          <option value="${escapeHTML(option.value)}">
            ${escapeHTML(option.label)}
          </option>
        `).join("")}
      </select>
    </label>
  `;
}

// --------------------
// Products
// --------------------

function renderProducts() {
  const container = $("productsList");
  if (!container) return;

  if (!products.length) {
    container.innerHTML = `<p class="muted">لا توجد منتجات حتى الآن</p>`;
    return;
  }

  container.innerHTML = products.map(product => `
    <div class="item">
      <div>
        <strong>${escapeHTML(product.name)}</strong>

        <div class="muted">
          الكود: ${escapeHTML(product.code || "—")}
          | ${escapeHTML(product.category || "عام")}
        </div>

        <div>
          المخزون: ${number(product.stock)}
          | سعر البيع: ${money(product.salePrice)}
        </div>

        <div class="muted">
          تكلفة الوحدة: ${money(product.purchasePrice)}
        </div>
      </div>

      <div class="item-actions">
        <button class="primary" data-edit-product="${escapeHTML(product.id)}">
          تعديل
        </button>

        <button class="danger" data-delete-product="${escapeHTML(product.id)}">
          حذف
        </button>
      </div>
    </div>
  `).join("");
}

function openProductForm(product = null) {
  const isEdit = Boolean(product);

  openModal(
    isEdit ? "تعديل المنتج" : "إضافة منتج جديد",
    `
      ${field("اسم المنتج", "name", "text", true, product?.name || "")}
      ${field("كود المنتج", "code", "text", false, product?.code || "")}
      ${field("التصنيف", "category", "text", false, product?.category || "")}
      ${field("سعر البيع", "salePrice", "number", true, product?.salePrice ?? "")}
      ${field("سعر الشراء", "purchasePrice", "number", true, product?.purchasePrice ?? 0)}
      ${field("الكمية في المخزون", "stock", "number", true, product?.stock ?? 0)}
      ${field("حد التنبيه للمخزون", "minStock", "number", false, product?.minStock ?? 5)}

      <button class="primary" type="submit">حفظ</button>
    `,
    async form => {
      const data = {
        name: String(form.get("name")).trim(),
        code: String(form.get("code") || "").trim(),
        category: String(form.get("category") || "").trim(),
        salePrice: number(form.get("salePrice")),
        purchasePrice: number(form.get("purchasePrice")),
        stock: number(form.get("stock")),
        minStock: number(form.get("minStock")),
        updatedAt: serverTimestamp()
      };

      if (!data.name) throw new Error("اكتب اسم المنتج");

      if (
        data.salePrice < 0 ||
        data.purchasePrice < 0 ||
        data.stock < 0 ||
        data.minStock < 0
      ) {
        throw new Error("لا يمكن إدخال أرقام سالبة");
      }

      if (isEdit) {
        await runTransaction(db, async transaction => {
          transaction.update(
            getDocument("products", product.id),
            data
          );
        });
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(getCollection("products"), data);
      }

      closeModal();
      toast("تم حفظ المنتج بنجاح");
    }
  );
}

async function deleteProduct(id) {
  const product = products.find(item => item.id === id);
  if (!product) return;

  if (number(product.stock) > 0) {
    toast("لا يمكن حذف منتج لديه كمية في المخزون");
    return;
  }

  if (!confirm("هل أنت متأكد من حذف المنتج؟")) return;

  await deleteDoc(getDocument("products", id));
  toast("تم حذف المنتج");
}

// --------------------
// Sales
// --------------------

function renderSales() {
  const container = $("salesList");
  if (!container) return;

  if (!sales.length) {
    container.innerHTML = `<p class="muted">لا توجد مبيعات حتى الآن</p>`;
    return;
  }

  container.innerHTML = sales.map(sale => `
    <div class="item">
      <div>
        <strong>${escapeHTML(sale.productName || "عملية بيع")}</strong>

        <div class="muted">
          العميل: ${escapeHTML(sale.customerName || "—")}
          | التاريخ: ${formatDate(sale.date)}
        </div>

        <div>
          الكمية: ${number(sale.qty)}
          | الإجمالي: ${money(sale.total)}
        </div>

        <div class="muted">
          الحالة: ${escapeHTML(sale.status || "جديد")}
        </div>
      </div>

      <div class="item-actions">
        <button class="danger" data-delete-sale="${escapeHTML(sale.id)}">
          حذف
        </button>
      </div>
    </div>
  `).join("");
}

function openSaleForm() {
  if (!products.length) {
    toast("أضف منتجًا أولًا قبل تسجيل البيع");
    return;
  }

  openModal(
    "تسجيل عملية بيع",
    `
      ${selectField("المنتج", "productId", [
        { value: "", label: "اختر المنتج" },
        ...products.map(product => ({
          value: product.id,
          label: `${product.name} - المتاح ${number(product.stock)}`
        }))
      ])}

      ${field("اسم العميل", "customerName", "text", false)}
      ${field("الكمية", "qty", "number")}
      ${field("سعر البيع للوحدة", "unitPrice", "number")}

      ${selectField("حالة الطلب", "status", [
        { value: "تم التسليم", label: "تم التسليم" },
        { value: "قيد التجهيز", label: "قيد التجهيز" },
        { value: "ملغي", label: "ملغي" }
      ])}

      ${field(
        "التاريخ",
        "date",
        "date",
        true,
        new Date().toISOString().slice(0, 10)
      )}

      <button class="primary" type="submit">حفظ</button>
    `,
    async form => {
      const productId = form.get("productId");
      const product = products.find(item => item.id === productId);

      if (!product) throw new Error("اختر منتجًا صحيحًا");

      const qty = number(form.get("qty"));
      const unitPrice = number(form.get("unitPrice"));
      const status = form.get("status");

      if (!Number.isInteger(qty) || qty <= 0 || unitPrice < 0) {
        throw new Error("راجع الكمية والسعر");
      }

      if (
        status === "تم التسليم" &&
        qty > number(product.stock)
      ) {
        throw new Error("الكمية المطلوبة أكبر من المخزون المتاح");
      }

      const saleData = {
        productId,
        productName: product.name,
        customerName: String(form.get("customerName") || "").trim(),
        qty,
        unitPrice,
        total: qty * unitPrice,
        status,
        date: form.get("date"),
        costPrice: number(product.purchasePrice),
        profit: (unitPrice - number(product.purchasePrice)) * qty,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      };

      await runTransaction(db, async transaction => {
        const productRef = getDocument("products", productId);
        const productSnapshot = await transaction.get(productRef);

        if (!productSnapshot.exists()) {
          throw new Error("المنتج لم يعد موجودًا");
        }

        const currentStock = number(productSnapshot.data().stock);

        if (status === "تم التسليم") {
          if (qty > currentStock) {
            throw new Error("المخزون غير كافٍ");
          }

          transaction.update(productRef, {
            stock: currentStock - qty,
            updatedAt: serverTimestamp()
          });
        }

        transaction.set(
          doc(getCollection("sales")),
          saleData
        );
      });

      closeModal();
      toast("تم تسجيل البيع بنجاح");
    }
  );
}

async function deleteSale(id) {
  const sale = sales.find(item => item.id === id);
  if (!sale) return;

  if (!confirm("هل تريد حذف عملية البيع؟")) return;

  await runTransaction(db, async transaction => {
    const saleRef = getDocument("sales", id);
    const saleSnapshot = await transaction.get(saleRef);

    if (!saleSnapshot.exists()) {
      throw new Error("عملية البيع غير موجودة");
    }

    const saleData = saleSnapshot.data();

    let productSnapshot = null;
    let productRef = null;

    if (
      saleData.status === "تم التسليم" &&
      saleData.productId
    ) {
      productRef = getDocument("products", saleData.productId);
      productSnapshot = await transaction.get(productRef);
    }

    if (productSnapshot?.exists()) {
      const currentStock = number(productSnapshot.data().stock);

      transaction.update(productRef, {
        stock: currentStock + number(saleData.qty),
        updatedAt: serverTimestamp()
      });
    }

    transaction.delete(saleRef);
  });

  toast("تم حذف البيع وتحديث المخزون");
}

// --------------------
// Expenses
// --------------------

function renderExpenses() {
  const container = $("expensesList");
  if (!container) return;

  if (!expenses.length) {
    container.innerHTML = `<p class="muted">لا توجد مصروفات</p>`;
    return;
  }

  container.innerHTML = expenses.map(expense => `
    <div class="item">
      <div>
        <strong>${escapeHTML(expense.title || "مصروف")}</strong>

        <div class="muted">
          ${escapeHTML(expense.category || "عام")}
          | ${formatDate(expense.date)}
        </div>

        <strong>${money(expense.amount)}</strong>
      </div>

      <div class="item-actions">
        <button class="danger" data-delete-expense="${escapeHTML(expense.id)}">
          حذف
        </button>
      </div>
    </div>
  `).join("");
}

function openExpenseForm() {
  openModal(
    "إضافة مصروف",
    `
      ${field("اسم المصروف", "title")}
      ${field("التصنيف", "category", "text", false)}
      ${field("المبلغ", "amount", "number")}
      ${field(
        "التاريخ",
        "date",
        "date",
        true,
        new Date().toISOString().slice(0, 10)
      )}

      <button class="primary" type="submit">حفظ</button>
    `,
    async form => {
      const amount = number(form.get("amount"));

      if (amount <= 0) {
        throw new Error("اكتب مبلغًا صحيحًا");
      }

      await addDoc(getCollection("expenses"), {
        title: String(form.get("title")).trim(),
        category: String(form.get("category") || "").trim(),
        amount,
        date: form.get("date"),
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      });

      closeModal();
      toast("تم تسجيل المصروف");
    }
  );
}

async function deleteExpense(id) {
  if (!confirm("هل تريد حذف هذا المصروف؟")) return;

  await deleteDoc(getDocument("expenses", id));
  toast("تم حذف المصروف");
}

// --------------------
// Purchases
// --------------------

function purchaseProductOptions() {
  return `
    <option value="">اختر المنتج</option>

    ${products.map(product => `
      <option value="${escapeHTML(product.id)}">
        ${escapeHTML(product.name)} - المخزون ${number(product.stock)}
      </option>
    `).join("")}

    <option value="__new__">+ إضافة منتج جديد</option>
  `;
}

function addPurchaseRow() {
  const container = $("purchaseRows");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "purchase-row";

  row.innerHTML = `
    <div class="purchase-fields">

      <label>
        المنتج
        <select class="form-input purchase-product" required>
          ${purchaseProductOptions()}
        </select>
      </label>

      <div class="purchase-new-product hidden">

        <label>
          اسم المنتج الجديد
          <input class="form-input new-product-name" type="text">
        </label>

        <label>
          كود المنتج
          <input class="form-input new-product-code" type="text">
        </label>

        <label>
          التصنيف
          <input class="form-input new-product-category" type="text">
        </label>

        <label>
          سعر البيع
          <input
            class="form-input new-product-sale"
            type="number"
            min="0"
            step="any"
          >
        </label>

      </div>

      <label>
        الكمية
        <input
          class="form-input purchase-qty"
          type="number"
          min="1"
          step="1"
          value="1"
          required
        >
      </label>

      <label>
        سعر الشراء للوحدة
        <input
          class="form-input purchase-cost"
          type="number"
          min="0"
          step="any"
          value="0"
          required
        >
      </label>

      <button type="button" class="danger remove-purchase-row">
        حذف الصنف
      </button>

    </div>
  `;

  container.appendChild(row);
  updatePurchaseTotal();
}

function updatePurchaseTotal() {
  const rows = document.querySelectorAll(".purchase-row");
  let total = 0;

  rows.forEach(row => {
    total +=
      number(row.querySelector(".purchase-qty")?.value) *
      number(row.querySelector(".purchase-cost")?.value);
  });

  const output = $("purchaseTotal");

  if (output) {
    output.textContent = money(total);
  }
}

function renderPurchases() {
  const container = $("purchasesList");
  if (!container) return;

  if (!purchases.length) {
    container.innerHTML = `<p class="muted">لا توجد فواتير مشتريات حتى الآن</p>`;
    return;
  }

  container.innerHTML = purchases.map(purchase => `
    <div class="item">
      <div>
        <strong>فاتورة مشتريات</strong>

        <div class="muted">
          المورد: ${escapeHTML(purchase.supplierName || "—")}
          | ${formatDate(purchase.date)}
        </div>

        <div>
          عدد الأصناف: ${(purchase.items || []).length}
          | الإجمالي: ${money(purchase.total)}
        </div>

        <div class="muted">
          الحالة: ${escapeHTML(purchase.paymentStatus || "—")}
        </div>
      </div>
    </div>
  `).join("");
}

function openPurchaseForm() {
  openModal(
    "فاتورة مشتريات جديدة",
    `
      ${field("اسم المورد", "supplierName", "text", false)}

      ${field(
        "تاريخ الفاتورة",
        "date",
        "date",
        true,
        new Date().toISOString().slice(0, 10)
      )}

      <div id="purchaseRows"></div>

      <button
        type="button"
        class="primary"
        id="addPurchaseRowBtn"
      >
        + إضافة صنف
      </button>

      <div class="purchase-total">
        إجمالي الفاتورة:
        <strong id="purchaseTotal">${money(0)}</strong>
      </div>

      <button class="primary" type="submit">
        حفظ فاتورة المشتريات
      </button>
    `,
    async form => {
      const rows = [...form.querySelectorAll(".purchase-row")];

      if (!rows.length) {
        throw new Error("أضف صنفًا واحدًا على الأقل");
      }

      const items = [];
      const existingTotals = new Map();
      const newProducts = [];

      let total = 0;

      for (const row of rows) {
        const selectedId =
          row.querySelector(".purchase-product")?.value;

        const qty =
          number(row.querySelector(".purchase-qty")?.value);

        const unitCost =
          number(row.querySelector(".purchase-cost")?.value);

        if (!selectedId) {
          throw new Error("اختر منتجًا في كل صف");
        }

        if (
          !Number.isInteger(qty) ||
          qty <= 0 ||
          unitCost < 0
        ) {
          throw new Error("راجع الكمية وسعر الشراء");
        }

        const lineTotal = qty * unitCost;

        if (selectedId === "__new__") {
          const name =
            row.querySelector(".new-product-name")?.value.trim();

          const code =
            row.querySelector(".new-product-code")?.value.trim() || "";

          const category =
            row.querySelector(".new-product-category")?.value.trim() || "";

          const salePrice =
            number(row.querySelector(".new-product-sale")?.value);

          if (!name) {
            throw new Error("اكتب اسم المنتج الجديد");
          }

          if (salePrice < 0) {
            throw new Error("سعر البيع غير صحيح");
          }

          const newProductIndex = newProducts.length;

          newProducts.push({
            name,
            code,
            category,
            salePrice,
            qty,
            unitCost,
            lineTotal
          });

          items.push({
            productId: null,
            newProductIndex,
            productName: name,
            qty,
                   unitCost,
            lineTotal
          });

          total += lineTotal;
          continue;
        }

        const product = products.find(p => p.id === selectedId);

        if (!product) {
          throw new Error("المنتج المحدد غير موجود");
        }

        const current = existingTotals.get(selectedId) || {
          qty: 0,
          totalCost: 0,
          product
        };

        current.qty += qty;
        current.totalCost += lineTotal;

        existingTotals.set(selectedId, current);

        items.push({
          productId: selectedId,
          productName: product.name,
          qty,
          unitCost,
          lineTotal
        });

        total += lineTotal;
      }

      const supplierName =
        form.querySelector('[name="supplierName"]')?.value.trim() || "";

      const date =
        form.querySelector('[name="date"]')?.value ||
        new Date().toISOString().slice(0, 10);

      await runTransaction(db, async transaction => {
        const updates = [];

        for (const [productId, data] of existingTotals) {
          const productRef = doc(
            db,
            "workspaces",
            "COVIX",
            "products",
            productId
          );

          const productSnap = await transaction.get(productRef);

          if (!productSnap.exists()) {
            throw new Error("أحد المنتجات لم يعد موجودًا");
          }

          const oldProduct = productSnap.data();
          const oldStock = number(oldProduct.stock);
          const oldCost = number(oldProduct.purchasePrice);

          const newStock = oldStock + data.qty;

          const averageCost =
            newStock > 0
              ? (
                  oldStock * oldCost +
                  data.totalCost
                ) / newStock
              : 0;

          updates.push({
            ref: productRef,
            stock: newStock,
            purchasePrice: averageCost
          });
        }

        for (const update of updates) {
          transaction.update(update.ref, {
            stock: update.stock,
            purchasePrice: update.purchasePrice,
            updatedAt: serverTimestamp()
          });
        }

        const finalItems = [...items];

        for (let i = 0; i < newProducts.length; i++) {
          const productData = newProducts[i];
          const productRef = doc(
            collection(db, "workspaces", "COVIX", "products")
          );

          transaction.set(productRef, {
            name: productData.name,
            code: productData.code,
            category: productData.category,
            salePrice: productData.salePrice,
            purchasePrice: productData.unitCost,
            stock: productData.qty,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          for (const item of finalItems) {
            if (item.newProductIndex === i) {
              item.productId = productRef.id;
              delete item.newProductIndex;
            }
          }
        }

        const purchaseRef = doc(
          collection(db, "workspaces", "COVIX", "purchases")
        );

        transaction.set(purchaseRef, {
          supplierName,
          date,
          items: finalItems,
          total,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      closeModal();
    }
  );

  const addRowBtn = document.getElementById("addPurchaseRowBtn");

  addRowBtn?.addEventListener("click", () => {
    addPurchaseRow();
  });

  addPurchaseRow();
            }
