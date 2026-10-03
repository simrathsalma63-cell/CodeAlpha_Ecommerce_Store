const state = {
  products: [],
  cart: JSON.parse(localStorage.getItem("luma_cart") || "[]"),
  token: localStorage.getItem("luma_token") || "",
  user: JSON.parse(localStorage.getItem("luma_user") || "null"),
  category: "All"
};

const $ = (selector) => document.querySelector(selector);

function money(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function toast(message, error = false) {
  const el = document.createElement("div");
  el.className = `toast ${error ? "error" : ""}`;
  el.textContent = message;
  $("#toast-container").appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

async function api(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong.");
  return data;
}

async function loadProducts() {
  try {
    state.products = await api("/api/products");
    renderProducts();
  } catch (err) {
    toast("Could not load products. Check your database setup.", true);
  }
}

function renderProducts() {
  const list = state.category === "All" ? state.products : state.products.filter(p => p.category === state.category);
  $("#products").innerHTML = list.map(p => `
    <article class="product-card">
      <div class="product-img"><img src="${p.image}" alt="${p.name}" loading="lazy"></div>
      <div class="product-info">
        <span class="category">${p.category}</span>
        <h3>${p.name}</h3>
        <p class="description">${p.description}</p>
        <div class="product-bottom">
          <span class="price">${money(p.price)}</span>
          <button class="add-btn" onclick="addToCart(${p.id})">Add to bag</button>
        </div>
        <button class="text-link" onclick="showProduct(${p.id})" style="background:none;color:#62766e;font-size:12px;margin-top:10px">View details →</button>
      </div>
    </article>
  `).join("");
}

window.addToCart = function(id) {
  const product = state.products.find(p => p.id === id);
  if (!product) return;
  const found = state.cart.find(item => item.productId === id);
  if (found) found.quantity++;
  else state.cart.push({ productId: id, quantity: 1 });
  saveCart();
  toast(`${product.name} added to your bag.`);
  openCart();
};

function saveCart() {
  localStorage.setItem("luma_cart", JSON.stringify(state.cart));
  renderCart();
}

function renderCart() {
  const items = state.cart.map(item => {
    const product = state.products.find(p => p.id === item.productId);
    return product ? { ...item, product } : null;
  }).filter(Boolean);

  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  $("#cart-count").textContent = count;

  if (!items.length) {
    $("#cart-items").innerHTML = `<div class="empty">Your bag is empty.<br><br>Explore our collection and add something you love.</div>`;
    $("#cart-total").textContent = money(0);
    return;
  }

  let total = 0;
  $("#cart-items").innerHTML = items.map(item => {
    total += item.product.price * item.quantity;
    return `
      <div class="cart-item">
        <img src="${item.product.image}" alt="${item.product.name}">
        <div>
          <h4>${item.product.name}</h4>
          <p>${money(item.product.price)}</p>
          <div class="qty">
            <button onclick="changeQty(${item.productId}, -1)">−</button>
            <span>${item.quantity}</span>
            <button onclick="changeQty(${item.productId}, 1)">+</button>
          </div>
          <button class="remove" onclick="removeFromCart(${item.productId})">Remove</button>
        </div>
        <strong>${money(item.product.price * item.quantity)}</strong>
      </div>
    `;
  }).join("");

  $("#cart-total").textContent = money(total);
}

window.changeQty = function(id, amount) {
  const item = state.cart.find(x => x.productId === id);
  if (!item) return;
  item.quantity += amount;
  if (item.quantity <= 0) state.cart = state.cart.filter(x => x.productId !== id);
  saveCart();
};

window.removeFromCart = function(id) {
  state.cart = state.cart.filter(x => x.productId !== id);
  saveCart();
};

function openCart() {
  $("#cart-drawer").classList.add("open");
  $("#drawer-overlay").classList.add("open");
}
function closeCart() {
  $("#cart-drawer").classList.remove("open");
  $("#drawer-overlay").classList.remove("open");
}

window.showProduct = function(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  $("#modal").innerHTML = `
    <button class="modal-close" onclick="closeModal()">×</button>
    <div class="detail">
      <img src="${p.image}" alt="${p.name}">
      <div class="detail-info">
        <span class="category">${p.category}</span>
        <h2>${p.name}</h2>
        <p>${p.description}</p>
        <div class="detail-price">${money(p.price)}</div>
        <div class="stock">${p.stock > 0 ? `${p.stock} items available` : "Out of stock"}</div>
        <button class="primary-btn" ${p.stock === 0 ? "disabled" : ""} onclick="addToCart(${p.id}); closeModal();">Add to bag →</button>
      </div>
    </div>`;
  $("#modal-backdrop").classList.add("open");
};

function closeModal() { $("#modal-backdrop").classList.remove("open"); }
window.closeModal = closeModal;

function showAuth(mode = "login") {
  $("#modal").innerHTML = `
    <div class="auth-tabs">
      <button class="auth-tab ${mode === "login" ? "active" : ""}" id="login-tab">Login</button>
      <button class="auth-tab ${mode === "register" ? "active" : ""}" id="register-tab">Create account</button>
    </div>
    <div class="modal-body">
      <button class="modal-close" onclick="closeModal()">×</button>
      <div id="auth-content"></div>
    </div>`;
  $("#modal-backdrop").classList.add("open");
  $("#login-tab").onclick = () => showAuth("login");
  $("#register-tab").onclick = () => showAuth("register");

  $("#auth-content").innerHTML = mode === "login" ? `
    <span class="eyebrow">WELCOME BACK</span><h2 style="margin:8px 0 24px">Sign in</h2>
    <form class="form" id="login-form">
      <label>Email<input type="email" id="login-email" required></label>
      <label>Password<input type="password" id="login-password" required></label>
      <button class="primary-btn full">Login to LumaStore</button>
    </form>` : `
    <span class="eyebrow">JOIN LUMASTORE</span><h2 style="margin:8px 0 24px">Create account</h2>
    <form class="form" id="register-form">
      <label>Full name<input type="text" id="register-name" required></label>
      <label>Email<input type="email" id="register-email" required></label>
      <label>Password<input type="password" id="register-password" minlength="6" required></label>
      <button class="primary-btn full">Create account</button>
    </form>`;

  const loginForm = $("#login-form");
  if (loginForm) loginForm.onsubmit = handleLogin;
  const registerForm = $("#register-form");
  if (registerForm) registerForm.onsubmit = handleRegister;
}

async function handleLogin(e) {
  e.preventDefault();
  try {
    const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({
      email: $("#login-email").value, password: $("#login-password").value
    })});
    setUser(data);
    closeModal(); toast("Welcome back!");
  } catch (err) { toast(err.message, true); }
}

async function handleRegister(e) {
  e.preventDefault();
  try {
    const data = await api("/api/auth/register", { method: "POST", body: JSON.stringify({
      name: $("#register-name").value, email: $("#register-email").value, password: $("#register-password").value
    })});
    setUser(data);
    closeModal(); toast("Account created successfully!");
  } catch (err) { toast(err.message, true); }
}

function setUser(data) {
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem("luma_token", state.token);
  localStorage.setItem("luma_user", JSON.stringify(state.user));
  updateAuthButton();
}

function logout() {
  state.token = ""; state.user = null;
  localStorage.removeItem("luma_token"); localStorage.removeItem("luma_user");
  updateAuthButton(); toast("You have been logged out.");
}

function updateAuthButton() {
  $("#auth-btn").textContent = state.user ? `Hi, ${state.user.name.split(" ")[0]}` : "Login";
}

function showCheckout() {
  if (!state.cart.length) return toast("Your bag is empty.", true);
  if (!state.token) {
    toast("Please log in before checkout.", true);
    showAuth("login");
    return;
  }

  $("#modal").innerHTML = `
    <div class="modal-body">
      <button class="modal-close" onclick="closeModal()">×</button>
      <span class="eyebrow">SECURE CHECKOUT</span><h2 style="margin:8px 0 24px">Complete your order</h2>
      <form class="form" id="checkout-form">
        <label>Full name<input id="customer-name" value="${state.user.name}" required></label>
        <label>Email<input type="email" id="customer-email" value="${state.user.email}" required></label>
        <label>Address<textarea id="customer-address" required placeholder="House no., street, area"></textarea></label>
        <label>City<input id="customer-city" required></label>
        <label>Pincode<input id="customer-pincode" required></label>
        <button class="primary-btn full">Place order →</button>
      </form>
    </div>`;
  $("#modal-backdrop").classList.add("open");
  $("#checkout-form").onsubmit = placeOrder;
}

async function placeOrder(e) {
  e.preventDefault();
  const items = state.cart.map(x => ({ productId: x.productId, quantity: x.quantity }));
  try {
    const data = await api("/api/orders", { method: "POST", body: JSON.stringify({
      customerName: $("#customer-name").value,
      email: $("#customer-email").value,
      address: $("#customer-address").value,
      city: $("#customer-city").value,
      pincode: $("#customer-pincode").value,
      items
    })});
    state.cart = [];
    saveCart();
    closeModal();
    closeCart();
    await loadProducts();
    toast(`Order #${data.orderId} placed successfully!`);
    location.hash = "orders";
    showOrders();
  } catch (err) { toast(err.message, true); }
}

async function showOrders() {
  if (!state.token) {
    toast("Please log in to view orders.", true);
    return showAuth("login");
  }
  try {
    const orders = await api("/api/orders");
    $("#products").innerHTML = `
      <div style="grid-column:1/-1;background:white;border:1px solid var(--line);border-radius:15px;padding:25px">
        <span class="eyebrow">ACCOUNT</span><h2 style="margin:8px 0 20px">Your orders</h2>
        ${orders.length ? orders.map(o => `<div class="order-row"><div><strong>Order #${o.id}</strong><br><small>${new Date(o.created_at).toLocaleString("en-IN")} · ${o.status}</small></div><strong>${money(o.total)}</strong></div>`).join("") : `<p style="color:var(--muted)">No orders yet. Your purchases will appear here.</p>`}
      </div>`;
  } catch (err) { toast(err.message, true); }
}

document.querySelectorAll(".filter").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".filter").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.category = btn.dataset.category;
    renderProducts();
  };
});

$("#cart-btn").onclick = openCart;
$("#close-cart").onclick = closeCart;
$("#drawer-overlay").onclick = closeCart;
$("#checkout-btn").onclick = showCheckout;
$("#auth-btn").onclick = () => state.user ? logout() : showAuth("login");
$("#orders-link").onclick = (e) => { e.preventDefault(); location.hash = "orders"; showOrders(); };
$("#search-btn").onclick = () => {
  const q = prompt("Search products");
  if (!q) return;
  const found = state.products.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || p.category.toLowerCase().includes(q.toLowerCase()));
  $("#products").innerHTML = found.length ? found.map(p => `
    <article class="product-card"><div class="product-img"><img src="${p.image}" alt="${p.name}"></div>
    <div class="product-info"><span class="category">${p.category}</span><h3>${p.name}</h3><p class="description">${p.description}</p>
    <div class="product-bottom"><span class="price">${money(p.price)}</span><button class="add-btn" onclick="addToCart(${p.id})">Add to bag</button></div></div></article>`).join("") : `<div class="empty" style="grid-column:1/-1">No products found for “${q}”.</div>`;
  location.hash = "shop";
};
$("#newsletter-form").onsubmit = e => { e.preventDefault(); e.target.reset(); toast("Thanks for subscribing!"); };

updateAuthButton();
loadProducts().then(renderCart);
