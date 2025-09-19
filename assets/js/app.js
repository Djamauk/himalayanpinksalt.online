/* Utility helpers */
const qs = (sel, el = document) => el.querySelector(sel);
const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const formatCurrency = (cents) => (cents/100).toLocaleString(undefined, {style:'currency', currency:'USD'});

/* Luhn check for card numbers */
const luhnCheck = (num) => {
  const s = (num || "").replace(/\D/g, "");
  let sum = 0, dbl = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = parseInt(s[i], 10);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return s.length >= 12 && (sum % 10 === 0);
};
const brandFromIIN = (num) => {
  const s = (num || "").replace(/\D/g, "");
  if (/^4\d{12,18}$/.test(s)) return "Visa";
  if (/^5[1-5]\d{14}$/.test(s) || /^2(2[2-9]\d|[3-6]\d{2}|7[01]\d|720)\d{12}$/.test(s)) return "Mastercard";
  if (/^3[47]\d{13}$/.test(s)) return "AmEx";
  if (/^(6011|65|64[4-9])\d{12,15}$/.test(s)) return "Discover";
  return "Card";
};
const maskCard = (num) => `•••• •••• •••• ${num.replace(/\D/g,'').slice(-4)}`;

/* Local storage */
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  remove(key) { localStorage.removeItem(key); }
};

/* === Checkout === */
(function initCheckout(){
  const form = document.getElementById("checkoutForm");
  if (!form) return;

  // Stepper logic
  const stepper = document.getElementById("stepper");
  const steps = qsa(".step", stepper);
  const panels = qsa("[data-step-panel]");

  const gotoStep = (n) => {
    steps.forEach((s) => {
      const idx = parseInt(s.dataset.step, 10);
      s.classList.toggle("is-active", idx === n);
      s.classList.toggle("is-complete", idx < n);
    });
    panels.forEach(p => p.classList.toggle("is-hidden", parseInt(p.dataset.stepPanel,10) !== n));
    window.scrollTo({top: 0, behavior: "smooth"});
  };

  qsa(".next").forEach(btn => btn.addEventListener("click", () => {
    const next = parseInt(btn.dataset.next, 10);
    if (validateCurrentStep(next - 1)) gotoStep(next);
  }));
  qsa(".prev").forEach(btn => btn.addEventListener("click", () => gotoStep(parseInt(btn.dataset.prev, 10))));

  // Currency rendering
  const updateSummary = () => {
    const itemNodes = qsa(".item-price");
    const subtotal = itemNodes.reduce((acc, el) => acc + (+el.dataset.price||0), 0);
    const shippingSel = qs('input[name="shippingMethod"]:checked');
    const shipping = shippingSel ? (+shippingSel.dataset.price || 0) : 0;
    const tax = Math.round(subtotal * 0.08);
    const coupon = (form.dataset.coupon === "SAVE10") ? Math.round(subtotal * 0.10) : 0;
    const total = subtotal + shipping + tax - coupon;

    qs("#subtotal").textContent = formatCurrency(subtotal);
    qs("#shipping").textContent = shipping ? formatCurrency(shipping) : "Free";
    qs("#tax").textContent = formatCurrency(tax);
    qs("#total").textContent = formatCurrency(total);
  };
  qsa("[data-currency]").forEach(el => {
    const cents = parseInt(el.dataset.price || "0", 10);
    if (!isNaN(cents)) el.textContent = formatCurrency(cents);
  });
  updateSummary();
  qsa('input[name="shippingMethod"]').forEach(r => r.addEventListener("change", updateSummary));

  // Coupon
  const applyBtn = document.getElementById("applyCoupon");
  applyBtn?.addEventListener("click", () => {
    const code = (qs("#coupon").value || "").trim().toUpperCase();
    form.dataset.coupon = code;
    applyBtn.textContent = code === "SAVE10" ? "Applied ✓" : "Apply";
    updateSummary();
  });

  // Payment method switching
  const payRadios = qsa('input[name="payMethod"]');
  const cardFields = document.getElementById("cardFields");
  payRadios.forEach(r => r.addEventListener("change", () => {
    cardFields.style.display = r.value === "card" && r.checked ? "grid" : "none";
  }));

  // Basic input masks
  const exp = document.getElementById("exp");
  const number = document.getElementById("cardNumber");
  const cvc = document.getElementById("cvc");
  number?.addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g,"").replace(/(.{4})/g,"$1 ").trim(); });
  exp?.addEventListener("input", e => {
    const v = e.target.value.replace(/\D/g,"").slice(0,4);
    e.target.value = v.length > 2 ? `${v.slice(0,2)}/${v.slice(2)}` : v;
  });
  cvc?.addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g,"").slice(0,4); });

  // Validation helpers
  const setErr = (id, msg) => { const el = qs(`[data-error-for="${id}"]`); if (el) el.textContent = msg || ""; };
  const required = (id, msg = "This field is required") => {
    const el = document.getElementById(id);
    const ok = !!(el && el.value.trim());
    setErr(id, ok ? "" : msg);
    return ok;
  };
  const validateEmail = () => {
    const el = document.getElementById("email");
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value);
    setErr("email", ok ? "" : "Enter a valid email");
    return ok;
  };
  const validateZip = () => required("zip", "Enter a postal code");
  const validateCard = () => {
    const num = number?.value || "";
    const ok = luhnCheck(num);
    setErr("cardNumber", ok ? "" : "Invalid card number");
    // Expiry check
    const [mm, yy] = (exp?.value || "").split("/");
    const now = new Date();
    let goodExp = false;
    if (mm && yy) {
      const month = parseInt(mm, 10);
      const year = 2000 + parseInt(yy, 10);
      const lastDay = new Date(year, month, 0);
      goodExp = month >= 1 && month <= 12 && lastDay >= new Date(now.getFullYear(), now.getMonth(), 1);
    }
    setErr("exp", goodExp ? "" : "Invalid expiry");
    const goodCvc = (cvc?.value || "").replace(/\D/g,"").length >= 3;
    setErr("cvc", goodCvc ? "" : "Invalid CVC");
    const goodName = required("cardName");
    return ok && goodExp && goodCvc && goodName;
  };

  function validateCurrentStep(stepIndex) {
    if (stepIndex === 1) { // Contact -> Delivery
      return required("firstName") & required("lastName") & validateEmail();
    }
    if (stepIndex === 2) { // Delivery -> Payment
      return required("address1") & required("city") & required("state") & validateZip() & required("country");
    }
    return true;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const payMethod = qs('input[name="payMethod"]:checked')?.value || "card";
    if (payMethod === "card" && !validateCard()) {
      gotoStep(3);
      return;
    }
    // Simulate tokenization: store masked details only if opted in
    if (payMethod === "card" && qs("#saveCard").checked) {
      const brand = brandFromIIN(number.value);
      const token = { id: crypto.randomUUID(), brand, last4: number.value.replace(/\D/g,"").slice(-4), display: `${brand} ${maskCard(number.value)}`, exp: exp.value };
      const cards = store.get("paymentMethods", []);
      cards.push(token);
      store.set("paymentMethods", cards);
    }
    alert("✅ Order placed! (Integrate your gateway on the server for production.)");
    // Clear demo cart coupon
    delete form.dataset.coupon;
  });

  // Pull address from account if exists
  const addresses = store.get("addresses", []);
  if (addresses.length) {
    const a = addresses.find(x => x.isDefault) || addresses[0];
    if (a) {
      qs("#address1").value = a.addr1 || "";
      qs("#address2").value = a.addr2 || "";
      qs("#city").value = a.city || "";
      qs("#state").value = a.state || "";
      qs("#zip").value = a.zip || "";
      qs("#country").value = a.country || "";
    }
  }

})();

/* === Account === */
(function initAccount(){
  // Tabs
  const tablist = document.getElementById("accountTabs");
  if (!tablist) return;
  const tabs = qsa('[role="tab"]', tablist);
  const panels = qsa('[role="tabpanel"]', tablist.parentElement);
  const selectTab = (id) => {
    tabs.forEach(t => t.setAttribute("aria-selected", t.id === id ? "true" : "false"));
    panels.forEach(p => p.classList.toggle("is-hidden", p.id !== ("panel-" + id.split("-")[1])));
  };
  tabs.forEach(t => t.addEventListener("click", () => selectTab(t.id)));
  tablist.addEventListener("keydown", (e) => {
    const i = tabs.findIndex(t => t.getAttribute("aria-selected") === "true");
    if (["ArrowRight","ArrowLeft"].includes(e.key)) {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const next = (i + dir + tabs.length) % tabs.length;
      tabs[next].focus(); selectTab(tabs[next].id);
    }
  });

  // Profile
  const profileForm = document.getElementById("profileForm");
  const savedProfile = store.get("profile", {});
  ["firstName","lastName","email","phone"].forEach(k => {
    const el = qs(`#profileForm [name="${k}"]`);
    if (el && savedProfile[k]) el.value = savedProfile[k];
  });
  profileForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(profileForm).entries());
    store.set("profile", data);
    alert("Profile saved");
  });

  // Addresses
  const addrList = document.getElementById("addressList");
  const addrModal = document.getElementById("addressModal");
  const addrForm = document.getElementById("addressForm");
  const addAddrBtn = document.getElementById("addAddress");

  const renderAddresses = () => {
    const addresses = store.get("addresses", []);
    addrList.innerHTML = "";
    if (!addresses.length) {
      addrList.innerHTML = `<li class="card-item muted">No addresses yet.</li>`;
      return;
    }
    addresses.forEach((a) => {
      const li = document.createElement("li");
      li.className = "card-item";
      li.innerHTML = `
        <div><strong>${a.addr1}</strong>${a.addr2 ? `, ${a.addr2}` : ""}</div>
        <div>${a.city}, ${a.state} ${a.zip}</div>
        <div>${a.country}</div>
        <div class="card-actions">
          <button class="btn btn-outline" data-action="edit" data-id="${a.id}">Edit</button>
          <button class="btn btn-outline" data-action="delete" data-id="${a.id}">Delete</button>
          <span class="badge">${a.isDefault ? "Default" : ""}</span>
          ${!a.isDefault ? `<button class="btn btn-ghost" data-action="makeDefault" data-id="${a.id}">Make default</button>` : ""}
        </div>`;
      addrList.appendChild(li);
    });
  };
  renderAddresses();

  addAddrBtn?.addEventListener("click", () => {
    addrForm.reset(); qs("#addr-id").value = "";
    addrModal.showModal();
  });
  addrList?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]"); if (!btn) return;
    const id = btn.dataset.id;
    const addresses = store.get("addresses", []);
    if (btn.dataset.action === "edit") {
      const a = addresses.find(x => x.id === id);
      if (!a) return;
      qs("#addr-id").value = a.id;
      qs("#addr1").value = a.addr1; qs("#addr2").value = a.addr2;
      qs("#addr-city").value = a.city; qs("#addr-state").value = a.state; qs("#addr-zip").value = a.zip; qs("#addr-country").value = a.country;
      addrModal.showModal();
    } else if (btn.dataset.action === "delete") {
      const next = addresses.filter(x => x.id !== id);
      store.set("addresses", next); renderAddresses();
    } else if (btn.dataset.action === "makeDefault") {
      addresses.forEach(x => x.isDefault = (x.id === id)); store.set("addresses", addresses); renderAddresses();
    }
  });
  addrForm?.addEventListener("close", () => {
    if (addrForm.returnValue !== "save") return;
    const id = qs("#addr-id").value || crypto.randomUUID();
    const a = {
      id,
      addr1: qs("#addr1").value.trim(),
      addr2: qs("#addr2").value.trim(),
      city: qs("#addr-city").value.trim(),
      state: qs("#addr-state").value.trim(),
      zip: qs("#addr-zip").value.trim(),
      country: qs("#addr-country").value.trim(),
    };
    let addresses = store.get("addresses", []);
    const idx = addresses.findIndex(x => x.id === id);
    if (idx >= 0) { addresses[idx] = {...addresses[idx], ...a}; }
    else { a.isDefault = addresses.length === 0; addresses.push(a); }
    store.set("addresses", addresses); renderAddresses();
  });

  // Payment methods
  const cardList = document.getElementById("cardList");
  const cardModal = document.getElementById("cardModal");
  const cardForm = document.getElementById("cardForm");
  const addCardBtn = document.getElementById("addCard");

  const renderCards = () => {
    const cards = store.get("paymentMethods", []);
    cardList.innerHTML = "";
    if (!cards.length) {
      cardList.innerHTML = `<li class="card-item muted">No saved payment methods.</li>`;
      return;
    }
    cards.forEach(c => {
      const li = document.createElement("li");
      li.className = "card-item";
      li.innerHTML = `
        <div><strong>${c.brand}</strong> — ${c.display} <span class="badge">exp ${c.exp || ""}</span></div>
        <div class="card-actions">
          <button class="btn btn-outline" data-action="delete-card" data-id="${c.id}">Delete</button>
        </div>`;
      cardList.appendChild(li);
    });
  };
  renderCards();

  addCardBtn?.addEventListener("click", () => { cardForm.reset(); cardModal.showModal(); });
  cardList?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='delete-card']"); if (!btn) return;
    const cards = store.get("paymentMethods", []);
    store.set("paymentMethods", cards.filter(c => c.id !== btn.dataset.id)); renderCards();
  });
  // Masking
  const pmNum = document.getElementById("pm-number");
  const pmExp = document.getElementById("pm-exp");
  const pmCvc = document.getElementById("pm-cvc");
  pmNum?.addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g,"").replace(/(.{4})/g,"$1 ").trim(); });
  pmExp?.addEventListener("input", e => {
    const v = e.target.value.replace(/\D/g,"").slice(0,4);
    e.target.value = v.length > 2 ? `${v.slice(0,2)}/${v.slice(2)}` : v;
  });
  pmCvc?.addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g,"").slice(0,4); });

  cardForm?.addEventListener("close", () => {
    if (cardForm.returnValue !== "save") return;
    const number = pmNum.value;
    if (!luhnCheck(number)) { alert("Invalid card number"); return; }
    const token = { id: crypto.randomUUID(), brand: brandFromIIN(number), last4: number.replace(/\D/g,"").slice(-4), display: maskCard(number), exp: pmExp.value };
    const cards = store.get("paymentMethods", []);
    cards.push(token); store.set("paymentMethods", cards); renderCards();
  });

  // Preferences
  const prefsForm = document.getElementById("prefsForm");
  const prefs = store.get("preferences", { news: false, deals: false, sms: false });
  qs("#pref-news").checked = !!prefs.news;
  qs("#pref-deals").checked = !!prefs.deals;
  qs("#pref-sms").checked = !!prefs.sms;
  prefsForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    store.set("preferences", {
      news: qs("#pref-news").checked,
      deals: qs("#pref-deals").checked,
      sms: qs("#pref-sms").checked,
    });
    alert("Preferences saved");
  });
})();
