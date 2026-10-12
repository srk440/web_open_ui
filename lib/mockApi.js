// Mock API backed by data/db.json.
// There is no server: the JSON file is the seed, every write is saved to the
// browser's localStorage, and each call waits a little to feel like a network
// request. Swap these functions for real fetch() calls when a backend exists.
import seed from '@/data/db.json'

const STORAGE_KEY = 'gocart_db'
const LATENCY_MS = 250

let db = null

const clone = (value) => JSON.parse(JSON.stringify(value))
const wait = () => new Promise(resolve => setTimeout(resolve, LATENCY_MS))
const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const now = () => new Date().toISOString()

function load() {
    if (db) return db
    db = clone(seed)
    if (typeof window !== 'undefined') {
        try {
            const saved = window.localStorage.getItem(STORAGE_KEY)
            if (saved) db = JSON.parse(saved)
        } catch { /* storage unavailable or corrupt: fall back to the seed */ }
    }
    return db
}

function save() {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
    } catch { /* quota exceeded or storage blocked: keep the in-memory copy */ }
}

// Runs a read or write against the db and returns a detached copy of the result.
async function request(handler) {
    await wait()
    const result = handler(load())
    return result === undefined ? undefined : clone(result)
}

function fail(message) {
    throw new Error(message)
}

const currentUser = (d) => d.users.find(u => u.id === d.currentUserId)
const myStore = (d) => d.stores.find(s => s.userId === d.currentUserId)

// ---- joins: rebuild the nested shapes the UI components expect ----

const userPublic = (d, userId) => {
    const user = d.users.find(u => u.id === userId)
    return user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null
}

const storeWithUser = (d, store) => ({ ...store, user: userPublic(d, store.userId) })

const ratingWithJoins = (d, rating) => {
    const product = d.products.find(p => p.id === rating.productId)
    return {
        ...rating,
        user: userPublic(d, rating.userId),
        product: product ? { id: product.id, name: product.name, category: product.category } : null,
    }
}

const productWithJoins = (d, product) => ({
    ...product,
    store: d.stores.find(s => s.id === product.storeId) || null,
    rating: d.ratings.filter(r => r.productId === product.id).map(r => ratingWithJoins(d, r)),
})

const orderWithJoins = (d, order) => ({
    ...order,
    user: userPublic(d, order.userId),
    address: d.addresses.find(a => a.id === order.addressId) || null,
    orderItems: order.orderItems.map(item => ({
        ...item,
        orderId: order.id,
        product: d.products.find(p => p.id === item.productId) || { id: item.productId, name: 'Deleted product', images: [] },
    })),
})

const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt)

// Products are only listed publicly when their store is approved and active.
const isStoreLive = (d, storeId) => {
    const store = d.stores.find(s => s.id === storeId)
    return !!store && store.status === 'approved' && store.isActive
}

// ---- dev helper ----

export function resetDatabase() {
    db = clone(seed)
    save()
}

// ---- user ----

export const getCurrentUser = () => request(d => userPublic(d, d.currentUserId))

export const getCart = () => request(d => currentUser(d)?.cart || {})

// Called on every cart change; skip the artificial delay.
export function saveCart(cart) {
    const d = load()
    const user = currentUser(d)
    if (!user) return
    user.cart = cart
    save()
}

// ---- products ----

export const getProducts = () => request(d =>
    d.products.filter(p => isStoreLive(d, p.storeId)).map(p => productWithJoins(d, p))
)

export const getStoreByUsername = (username) => request(d => {
    const store = d.stores.find(s => s.username === username && s.status === 'approved' && s.isActive)
    if (!store) fail('Store not found')
    return {
        store,
        products: d.products.filter(p => p.storeId === store.id).map(p => productWithJoins(d, p)),
    }
})

// ---- addresses ----

export const getAddresses = () => request(d => d.addresses.filter(a => a.userId === d.currentUserId))

export const addAddress = (address) => request(d => {
    const created = { ...address, id: newId('addr'), userId: d.currentUserId, createdAt: now() }
    d.addresses.push(created)
    save()
    return created
})

// ---- coupons ----

export const verifyCoupon = (code) => request(d => {
    const coupon = d.coupons.find(c => c.code === code.trim().toUpperCase())
    if (!coupon) fail('Coupon not found')
    if (new Date(coupon.expiresAt) < new Date()) fail('Coupon has expired')
    if (coupon.forNewUser && d.orders.some(o => o.userId === d.currentUserId)) fail('Coupon is for new users only')
    return coupon
})

export const getCoupons = () => request(d => d.coupons.slice().sort(byNewest))

export const addCoupon = (coupon) => request(d => {
    const code = coupon.code.trim().toUpperCase()
    if (d.coupons.some(c => c.code === code)) fail('Coupon code already exists')
    const created = {
        ...coupon,
        code,
        discount: Number(coupon.discount),
        expiresAt: new Date(coupon.expiresAt).toISOString(),
        createdAt: now(),
    }
    d.coupons.push(created)
    save()
    return created
})

export const deleteCoupon = (code) => request(d => {
    d.coupons = d.coupons.filter(c => c.code !== code)
    save()
})

// ---- orders ----

export const getMyOrders = () => request(d =>
    d.orders.filter(o => o.userId === d.currentUserId).sort(byNewest).map(o => orderWithJoins(d, o))
)

// One order is created per store, as a marketplace would split a mixed cart.
export const placeOrder = ({ cart, addressId, paymentMethod, couponCode }) => request(d => {
    if (!addressId) fail('Please select an address')
    const lines = Object.entries(cart)
        .map(([productId, quantity]) => ({ product: d.products.find(p => p.id === productId), quantity }))
        .filter(line => line.product)
    if (lines.length === 0) fail('Your cart is empty')
    const outOfStock = lines.find(line => !line.product.inStock)
    if (outOfStock) fail(`${outOfStock.product.name} is out of stock`)

    const coupon = couponCode ? d.coupons.find(c => c.code === couponCode) : null
    const byStore = {}
    for (const line of lines) (byStore[line.product.storeId] ||= []).push(line)

    const created = Object.entries(byStore).map(([storeId, storeLines]) => {
        const subtotal = storeLines.reduce((sum, l) => sum + l.product.price * l.quantity, 0)
        const total = coupon ? subtotal - subtotal * coupon.discount / 100 : subtotal
        const order = {
            id: newId('order'),
            total: +total.toFixed(2),
            status: 'ORDER_PLACED',
            userId: d.currentUserId,
            storeId,
            addressId,
            isPaid: false,
            paymentMethod,
            isCouponUsed: !!coupon,
            coupon: coupon ? { code: coupon.code, discount: coupon.discount, description: coupon.description } : null,
            orderItems: storeLines.map(l => ({ productId: l.product.id, quantity: l.quantity, price: l.product.price })),
            createdAt: now(),
            updatedAt: now(),
        }
        d.orders.push(order)
        return order
    })
    currentUser(d).cart = {}
    save()
    return created
})

// ---- ratings ----

export const getMyRatings = () => request(d => d.ratings.filter(r => r.userId === d.currentUserId))

export const addRating = ({ orderId, productId, rating, review }) => request(d => {
    if (d.ratings.some(r => r.userId === d.currentUserId && r.orderId === orderId && r.productId === productId)) {
        fail('You have already rated this product')
    }
    const created = { id: newId('rat'), rating, review, userId: d.currentUserId, productId, orderId, createdAt: now() }
    d.ratings.push(created)
    save()
    return created
})

// ---- seller ----

// Returns the current user's store (any status) or null.
export const getMyStore = () => request(d => myStore(d) || null)

export const createStore = (info) => request(d => {
    if (myStore(d)) fail('You have already applied for a store')
    const username = info.username.trim().toLowerCase()
    if (d.stores.some(s => s.username === username)) fail('Username is already taken')
    const created = {
        id: newId('store'),
        userId: d.currentUserId,
        name: info.name,
        username,
        description: info.description,
        email: info.email,
        contact: info.contact,
        address: info.address,
        logo: info.logo,
        status: 'pending',
        isActive: false,
        createdAt: now(),
        updatedAt: now(),
    }
    d.stores.push(created)
    save()
    return created
})

const requireApprovedStore = (d) => {
    const store = myStore(d)
    if (!store || store.status !== 'approved') fail('You are not an approved seller')
    return store
}

export const getStoreDashboard = () => request(d => {
    const store = requireApprovedStore(d)
    const productIds = new Set(d.products.filter(p => p.storeId === store.id).map(p => p.id))
    const orders = d.orders.filter(o => o.storeId === store.id)
    return {
        totalProducts: productIds.size,
        totalOrders: orders.length,
        totalEarnings: +orders.reduce((sum, o) => sum + o.total, 0).toFixed(2),
        ratings: d.ratings.filter(r => productIds.has(r.productId)).sort(byNewest).map(r => ratingWithJoins(d, r)),
    }
})

export const getStoreProducts = () => request(d => {
    const store = requireApprovedStore(d)
    return d.products.filter(p => p.storeId === store.id).sort(byNewest)
})

export const addProduct = (product) => request(d => {
    const store = requireApprovedStore(d)
    const created = {
        id: newId('prod'),
        name: product.name,
        description: product.description,
        mrp: Number(product.mrp),
        price: Number(product.price),
        category: product.category,
        images: product.images,
        storeId: store.id,
        inStock: true,
        createdAt: now(),
    }
    d.products.push(created)
    save()
    return created
})

export const toggleStock = (productId) => request(d => {
    const store = requireApprovedStore(d)
    const product = d.products.find(p => p.id === productId && p.storeId === store.id)
    if (!product) fail('Product not found')
    product.inStock = !product.inStock
    save()
    return product
})

export const getStoreOrders = () => request(d => {
    const store = requireApprovedStore(d)
    return d.orders.filter(o => o.storeId === store.id).sort(byNewest).map(o => orderWithJoins(d, o))
})

export const updateOrderStatus = (orderId, status) => request(d => {
    const store = requireApprovedStore(d)
    const order = d.orders.find(o => o.id === orderId && o.storeId === store.id)
    if (!order) fail('Order not found')
    order.status = status
    if (status === 'DELIVERED' && order.paymentMethod === 'COD') order.isPaid = true
    order.updatedAt = now()
    save()
    return orderWithJoins(d, order)
})

// ---- admin ----

export const getIsAdmin = () => request(d => !!currentUser(d)?.isAdmin)

const requireAdmin = (d) => {
    if (!currentUser(d)?.isAdmin) fail('Not authorized')
}

export const getAdminDashboard = () => request(d => {
    requireAdmin(d)
    return {
        products: d.products.length,
        stores: d.stores.filter(s => s.status === 'approved').length,
        orders: d.orders.length,
        revenue: d.orders.reduce((sum, o) => sum + o.total, 0).toFixed(2),
        allOrders: d.orders.map(o => ({ createdAt: o.createdAt, total: o.total })),
    }
})

export const getApprovedStores = () => request(d => {
    requireAdmin(d)
    return d.stores.filter(s => s.status === 'approved').map(s => storeWithUser(d, s))
})

export const getPendingStores = () => request(d => {
    requireAdmin(d)
    return d.stores.filter(s => s.status === 'pending').map(s => storeWithUser(d, s))
})

export const setStoreStatus = (storeId, status) => request(d => {
    requireAdmin(d)
    const store = d.stores.find(s => s.id === storeId)
    if (!store) fail('Store not found')
    store.status = status
    store.isActive = status === 'approved'
    store.updatedAt = now()
    save()
})

export const toggleStoreActive = (storeId) => request(d => {
    requireAdmin(d)
    const store = d.stores.find(s => s.id === storeId)
    if (!store) fail('Store not found')
    store.isActive = !store.isActive
    store.updatedAt = now()
    save()
    return storeWithUser(d, store)
})

// ---- uploads ----

// Turns an uploaded image File into a small JPEG data URL so it fits in
// localStorage (there is no file server to upload to).
export function imageFileToDataUrl(file, maxSize = 600) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('Could not read image'))
        reader.onload = () => {
            const img = new window.Image()
            img.onerror = () => reject(new Error('Could not load image'))
            img.onload = () => {
                const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
                const canvas = document.createElement('canvas')
                canvas.width = Math.round(img.width * scale)
                canvas.height = Math.round(img.height * scale)
                const ctx = canvas.getContext('2d')
                // JPEG has no alpha channel; paint white so transparent PNGs don't turn black.
                ctx.fillStyle = '#ffffff'
                ctx.fillRect(0, 0, canvas.width, canvas.height)
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                resolve(canvas.toDataURL('image/jpeg', 0.8))
            }
            img.src = reader.result
        }
        reader.readAsDataURL(file)
    })
}
