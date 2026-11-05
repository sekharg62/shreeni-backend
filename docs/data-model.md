# Shreeni — Data Model

Scalable e-commerce data model. Starts with sarees; designed to extend to other
clothing types and gender-based catalogs without reshaping the core.

**Assumptions used below** (change if needed):

- Size variants + product-level colors (primary/secondary).
- Cart & Wishlist persisted in DB.
- All fields `NOT NULL` unless marked optional `?`.
- **Every table** — including join tables — has `id` (UUID), `createdAt`,
  `updatedAt`. These are omitted from the field tables below to reduce noise but
  are always present.

### Admin / storefront conventions (applied across the catalog)

Instead of two booleans, catalog records (Category, Product) carry a single
**`status`** enum that controls what the admin and storefront see:

| Status | Meaning | Storefront | Admin |
|---|---|---|---|
| `DRAFT` | Being prepared, not launched | hidden | visible |
| `PUBLISHED` | Live and selling | **shown** | visible |
| `UNPUBLISHED` | Temporarily taken off (out of season) | hidden | visible |
| `DISCONTINUED` | Retired / no longer sold (kept for order history) | hidden | filtered out by default |

- **"Show on front or not"** = `status = PUBLISHED` vs anything else.
- Storefront queries filter **`where: { status: 'PUBLISHED' }`**.

Also applied across catalog rows:

- **`sortOrder`** (Int, default `0`) — manual display ordering (categories,
  images, etc.); lower = shown first.
- **`publishedAt`** (DateTime?) — set when first moved to `PUBLISHED`; powers
  "New Arrivals" sorting and audit.

---

## Enums

| Enum | Values |
|---|---|
| `Role` | `CUSTOMER`, `ADMIN` |
| `CatalogStatus` | `DRAFT`, `PUBLISHED`, `UNPUBLISHED`, `DISCONTINUED` (shared by Category, Product & Banner) |
| `Gender` | `WOMEN`, `MEN`, `UNISEX`, `GIRLS`, `BOYS` |
| `AddressLabel` | `HOME`, `WORK`, `OTHER` |
| `ColorType` | `PRIMARY`, `SECONDARY` |
| `SpecGroup` | `DETAILS`, `MANUFACTURING` |
| `ReviewStatus` | `PENDING`, `APPROVED`, `REJECTED` |
| `OrderStatus` | `PENDING`, `CONFIRMED`, `PACKED`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `RETURNED` |
| `DiscountType` | `PERCENTAGE`, `FLAT` |
| `PaymentMethod` | `PREPAID`, `COD` |
| `PaymentStatus` | `CREATED`, `PAID`, `FAILED`, `REFUNDED` |
| `ShipmentStatus` | `PENDING`, `SHIPPED`, `IN_TRANSIT`, `DELIVERED`, `RETURNED`, `CANCELLED` |

---

## 1. Catalog

### Category  (self-referencing tree)
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| name | String | e.g. "Sarees", "Jamdani" |
| slug | String | unique |
| description | String? | |
| parentId | UUID? (FK → Category) | null = top level; children = sub-categories |
| gender | Gender? | optional category-level gender |
| bannerUrl | String? | category banner image (admin upload) |
| posterUrl | String? | category poster image (admin upload) |
| sortOrder | Int | default 0 — display order |
| status | CatalogStatus | default `DRAFT` — `PUBLISHED` = shown on storefront |
| publishedAt | DateTime? | when first moved to `PUBLISHED` |
| createdAt / updatedAt | DateTime | |

Relations: `parent`, `children[]`, `products[]`.

### Collection  (marketing groups, e.g. "Zari")
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| name | String | |
| slug | String | unique |
| description | String? | |
| isActive | Boolean | default true |

Relations: `products[]` (many-to-many via `ProductCollection`).

### Product
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| name | String | e.g. "Glitter Gulkand" |
| slug | String | unique |
| shortDescription | String? | one-liner |
| description | String | main description |
| story | String? | long narrative "Story" block |
| categoryId | UUID (FK → Category) | primary category |
| gender | Gender | default `WOMEN` |
| fabric | String? | e.g. "Mul Cotton" |
| collectionName | String? | free-text (or use Collection relation) |
| originalPrice | Int | **in paise** (₹1 = 100) |
| discountPrice | Int? | in paise; null = no discount |
| hsnCode | String? | GST HSN code (e.g. "5208") |
| gstRate | Int | GST % (e.g. 5 or 12); default 5 |
| lengthCm | Decimal? | e.g. 550.00 |
| widthCm | Decimal? | e.g. 115.00 |
| blousePiece | Boolean | default false |
| blousePieceInfo | String? | e.g. "60 cm additional fabric" |
| washCare | String? | e.g. "Dry Wash" |
| countryOfOrigin | String? | e.g. "India" |
| manufacturedBy | String? | manufacturer / packer |
| manufacturerAddress | String? | registered address |
| status | CatalogStatus | default `DRAFT` — `PUBLISHED` = shown on storefront |
| isFeatured | Boolean | default false — highlight on home |
| sortOrder | Int | default 0 — manual ordering within a category |
| publishedAt | DateTime? | when first moved to `PUBLISHED` (New Arrivals) |
| createdAt / updatedAt | DateTime | |

Relations: `category`, `images[]`, `variants[]`, `specifications[]`, `tags[]`
(m2m), `colors[]` (ProductColor), `collections[]` (m2m), `reviews[]`,
`relatedProducts[]`, `orderItems[]`, `cartItems[]`, `wishlistItems[]`.

### ProductImage
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| productId | UUID (FK → Product) | cascade delete |
| url | String | admin upload |
| **sortOrder** | Int | default 0 — **display order** (lower shown first); admin drag-to-reorder |
| isPrimary | Boolean | default false — the main/thumbnail image |
| createdAt / updatedAt | DateTime | |

> Images render ordered by `sortOrder`. The one flagged `isPrimary` is used as
> the card thumbnail; the rest form the gallery in `sortOrder`.

### ProductVariant  (size + stock)
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| productId | UUID (FK → Product) | cascade delete |
| size | String | e.g. "Free Size", "XS", "M" |
| sku | String | **unique, required** — the real sellable unit code (e.g. "SUTAMIH618-XS"; for Free Size, just "SUTAMIH618") |
| stock | Int | default 0 — total on hand |
| reservedStock | Int | default 0 — held during checkout; available = stock − reservedStock |
| priceOverride | Int? | in paise; overrides product price if set |
| isActive | Boolean | default true |

Unique: (`productId`, `size`).

### ProductSpecification  (flexible key/value details)
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| productId | UUID (FK → Product) | cascade delete |
| group | SpecGroup | `DETAILS` / `MANUFACTURING` |
| label | String | e.g. "Collection", "Wash Care" |
| value | String | e.g. "Zari", "Dry Wash" |
| sortOrder | Int | default 0 — display order |

### Tag
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| name | String | e.g. "Saree with blouse piece" |
| slug | String | unique |
| color | String? | hex, e.g. "#b88646" |

Relations: `products[]` (m2m via `ProductTag`).

### Color
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| name | String | e.g. "Light Pink" |
| hexCode | String? | e.g. "#f8c8d8" |

### ProductColor  (product ↔ color with color type)
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| productId | UUID (FK → Product) | cascade delete |
| colorId | UUID (FK → Color) | |
| colorType | ColorType | `PRIMARY` / `SECONDARY` |

Unique: (`productId`, `colorType`).

### ProductTag  (join: Product ↔ Tag)
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| productId | UUID (FK → Product) | cascade delete |
| tagId | UUID (FK → Tag) | cascade delete |
| createdAt / updatedAt | DateTime | |

Unique: (`productId`, `tagId`).

### ProductCollection  (join: Product ↔ Collection)
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| productId | UUID (FK → Product) | cascade delete |
| collectionId | UUID (FK → Collection) | cascade delete |
| createdAt / updatedAt | DateTime | |

Unique: (`productId`, `collectionId`).

### RelatedProduct  (join: Product ↔ Product — manual "similar products")
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| productId | UUID (FK → Product) | the product being viewed |
| relatedProductId | UUID (FK → Product) | a suggested similar product |
| createdAt / updatedAt | DateTime | |

Unique: (`productId`, `relatedProductId`). If no rows exist, similar products
are derived by shared category/tags.

---

## 2. Reviews

### Review
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| productId | UUID (FK → Product) | cascade delete |
| userId | UUID? (FK → User) | null = guest review |
| rating | Int | 1–5 |
| title | String | |
| body | String | |
| reviewerName | String | |
| reviewerEmail | String | |
| images | String[] | array of image URLs uploaded by the customer |
| videos | String[] | array of video URLs uploaded by the customer |
| status | ReviewStatus | default `PENDING` |
| createdAt / updatedAt | DateTime | |

> Media is stored as two array columns (`images`, `videos`) directly on the
> review — no separate `ReviewMedia` table needed.

---

## 3. Users & Auth

### User
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| firstName | String? | |
| lastName | String? | |
| phone | String | **unique, required** |
| email | String? | unique when present |
| passwordHash | String? | only if the user sets a password |
| role | Role | default `CUSTOMER` |
| phoneVerified | Boolean | default false |
| emailVerified | Boolean | default false |
| createdAt / updatedAt | DateTime | |

Relations: `addresses[]`, `orders[]`, `reviews[]`, `cart`, `wishlist`.

> Login supported: phone-OTP, email-OTP, and email+password — all one User.

> **OTP storage:** OTP codes are short-lived, so they are **not** kept in a DB
> table. They live in a cache (e.g. Redis) keyed by `phone`/`email` + purpose,
> with a built-in TTL that auto-expires them — simpler and no cleanup needed.

### Address
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| userId | UUID (FK → User) | cascade delete |
| label | AddressLabel | `HOME` / `WORK` / `OTHER` |
| receiverName | String | recipient name |
| receiverPhone | String | defaults to user phone, editable here only — **does not update User** |
| flatHouseNo | String | flat / house no |
| apartmentSector | String? | apartment / sector (line 2) |
| landmark | String? | |
| city | String | |
| state | String | |
| pincode | String | |
| country | String | default "India" |
| isDefault | Boolean | default false |
| createdAt / updatedAt | DateTime | |

---

## 4. Commerce

### Cart  (one per user, or one per guest session)
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| userId | UUID? (FK → User) | unique when set — logged-in cart |
| sessionId | String? | unique when set — guest cart (device/browser token) |

Relations: `items[]`.

> A cart is keyed by **either** `userId` (logged in) **or** `sessionId` (guest).
> On login, the guest cart's items are merged into the user's cart.

### CartItem
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| cartId | UUID (FK → Cart) | cascade delete |
| productId | UUID (FK → Product) | |
| variantId | UUID? (FK → ProductVariant) | selected size |
| quantity | Int | default 1 |

Unique: (`cartId`, `productId`, `variantId`).

### Wishlist  (one per user)
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| userId | UUID (FK → User) | unique |

Relations: `items[]`.

### WishlistItem
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| wishlistId | UUID (FK → Wishlist) | cascade delete |
| productId | UUID (FK → Product) | |

Unique: (`wishlistId`, `productId`).

### Discount  (coupon codes, applied to the whole cart)
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| code | String | **unique**, what the customer types (e.g. "DIWALI20"); stored uppercase |
| description | String? | admin note / shown at checkout (e.g. "20% off on all sarees") |
| type | DiscountType | `PERCENTAGE` or `FLAT` |
| value | Int | `PERCENTAGE` → percent (e.g. 20); `FLAT` → amount in paise (e.g. 20000 = ₹200) |
| maxDiscountAmount | Int? | cap for percentage discounts, in paise (e.g. "20% off up to ₹500") |
| minOrderValue | Int? | cart subtotal needed to use it, in paise |
| usageLimit | Int? | total times the code can be used; null = unlimited |
| usedCount | Int | default 0 — incremented when an order using it is confirmed |
| perUserLimit | Int? | uses per customer (e.g. 1); counted from that user's orders |
| startsAt | DateTime? | not valid before this time |
| endsAt | DateTime? | not valid after this time |
| isActive | Boolean | default true — admin on/off switch |
| createdAt / updatedAt | DateTime | |

> **Valid when:** `isActive` · now is between `startsAt`/`endsAt` · cart subtotal ≥
> `minOrderValue` · `usedCount < usageLimit` · user hasn't hit `perUserLimit`.
> **Saving:** `PERCENTAGE` → `subtotal × value / 100`, capped at
> `maxDiscountAmount`; `FLAT` → `value` (never more than the subtotal).
> Per-user usage is counted from `Order` rows (`discountId` + `userId`), so no
> separate usage table is needed.

### Order
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| orderNumber | String | unique, human-readable (e.g. "SHR-10234") |
| invoiceNumber | String? | unique, **sequential** GST invoice no. (e.g. "INV-2026-000123"); set when the order is paid/confirmed |
| userId | UUID? (FK → User) | **nullable** — guest checkout (phone captured in the shipping snapshot) |
| contactEmail | String? | where order confirmation + invoice are sent (required for guests) |
| contactPhone | String | buyer's phone for order updates (logged-in user's phone, or the guest's) |
| status | OrderStatus | default `PENDING` |
| subtotal | Int | sum of item prices |
| discountId | UUID? (FK → Discount) | coupon applied to this order (if any) |
| discountCode | String? | snapshot of the code used (e.g. "DIWALI20") |
| discountTotal | Int | default 0 — amount saved, in paise |
| shippingTotal | Int | default 0 |
| taxTotal | Int | default 0 |
| grandTotal | Int | final payable |
| **Shipping address snapshot** | | copied at order time |
| shipReceiverName | String | |
| shipReceiverPhone | String | |
| shipFlatHouseNo | String | |
| shipApartmentSector | String? | |
| shipLandmark | String? | |
| shipCity | String | |
| shipState | String | |
| shipPincode | String | |
| shipCountry | String | default "India" |
| createdAt / updatedAt | DateTime | |

Relations: `items[]`, `payment`, `shipment`.

### OrderItem  (snapshot of product at purchase time)
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| orderId | UUID (FK → Order) | cascade delete |
| productId | UUID? (FK → Product) | nullable if product later deleted |
| variantId | UUID? (FK → ProductVariant) | |
| name | String | snapshot |
| sku | String? | snapshot |
| size | String? | snapshot |
| image | String? | snapshot |
| unitPrice | Int | snapshot |
| quantity | Int | |

### Payment  (one or more attempts per order)
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| orderId | UUID (FK → Order) | **not unique** — a failed attempt can be retried under the same order |
| provider | String | e.g. "Razorpay" |
| method | PaymentMethod | `PREPAID` / `COD` |
| amount | Int | in paise |
| status | PaymentStatus | default `CREATED` |
| gatewayOrderId | String? | provider order id |
| gatewayTxnId | String? | provider transaction/payment id |
| paidAt | DateTime? | |
| createdAt / updatedAt | DateTime | |

### Shipment  (one per order, single delivery partner)
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| orderId | UUID (FK → Order) | unique |
| deliveryPartner | String | e.g. "Shiprocket", "Delhivery" |
| awb | String? | tracking / air waybill number |
| status | ShipmentStatus | default `PENDING` |
| shippedAt | DateTime? | |
| deliveredAt | DateTime? | |
| createdAt / updatedAt | DateTime | |

---

## 5. Content

### Banner  (homepage hero carousel, managed from admin)
| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| title | String? | optional heading text on the slide |
| subtitle | String? | optional sub-text |
| imageUrl | String | desktop image (admin upload) |
| mobileImageUrl | String? | separate crop for mobile; falls back to `imageUrl` |
| linkUrl | String? | where the slide goes on click (e.g. `/sarees/jamdani`) |
| sortOrder | Int | default 0 — slide order in the carousel |
| status | CatalogStatus | default `DRAFT` — only `PUBLISHED` banners show on the homepage |
| createdAt / updatedAt | DateTime | |

---

## Foreign-key map (how every table connects)

Each row: the **child** table's foreign-key column → the **parent** table it
references, the relationship type, and what happens when the parent is deleted.

| Child table . column | → references | Type | On delete |
|---|---|---|---|
| **Category**.parentId | → Category.id | self-tree (parent/children) | `Restrict` (block deleting a category with children) |
| **Product**.categoryId | → Category.id | many Products → one Category | `Restrict` (can't delete a category still holding products) |
| **ProductImage**.productId | → Product.id | many → one | `Cascade` (images deleted with product) |
| **ProductVariant**.productId | → Product.id | many → one | `Cascade` |
| **ProductSpecification**.productId | → Product.id | many → one | `Cascade` |
| **ProductColor**.productId | → Product.id | many → one | `Cascade` |
| **ProductColor**.colorId | → Color.id | many → one | `Cascade` (remove the link if a color is deleted) |
| **ProductTag**.productId | → Product.id | m2m join | `Cascade` |
| **ProductTag**.tagId | → Tag.id | m2m join | `Cascade` |
| **ProductCollection**.productId | → Product.id | m2m join | `Cascade` |
| **ProductCollection**.collectionId | → Collection.id | m2m join | `Cascade` |
| **RelatedProduct**.productId | → Product.id | self m2m (source) | `Cascade` |
| **RelatedProduct**.relatedProductId | → Product.id | self m2m (target) | `Cascade` |
| **Review**.productId | → Product.id | many → one | `Cascade` |
| **Review**.userId | → User.id | many → one (nullable = guest) | `SetNull` |
| **Address**.userId | → User.id | many → one | `Cascade` |
| **Cart**.userId | → User.id | one → one (unique, nullable for guest) | `Cascade` |
| **CartItem**.cartId | → Cart.id | many → one | `Cascade` |
| **CartItem**.productId | → Product.id | many → one | `Cascade` |
| **CartItem**.variantId | → ProductVariant.id | many → one (nullable) | `SetNull` |
| **Wishlist**.userId | → User.id | one → one (unique) | `Cascade` |
| **WishlistItem**.wishlistId | → Wishlist.id | many → one | `Cascade` |
| **WishlistItem**.productId | → Product.id | many → one | `Cascade` |
| **Order**.userId | → User.id | many → one (nullable = guest) | `SetNull` (keep order history) |
| **Order**.discountId | → Discount.id | many → one (nullable) | `SetNull` (order keeps `discountCode` + `discountTotal`) |
| **OrderItem**.orderId | → Order.id | many → one | `Cascade` |
| **OrderItem**.productId | → Product.id | many → one (nullable) | `SetNull` (snapshot keeps the data) |
| **OrderItem**.variantId | → ProductVariant.id | many → one (nullable) | `SetNull` |
| **Payment**.orderId | → Order.id | many → one (retries) | `Cascade` |
| **Shipment**.orderId | → Order.id | one → one (unique) | `Cascade` |

**Standalone tables** (no foreign keys): `Tag`, `Color`, `Collection`, `Banner`, `Discount` (referenced *by* Order, has no FKs itself).

### Reading the cardinality

- **one → one**: the FK column is `@unique`, so a User has at most one Cart, an
  Order has at most one Payment/Shipment.
- **many → one**: the normal case — many ProductImages point to one Product.
- **m2m (many-to-many)**: modelled with an explicit join table (so it can carry
  `createdAt`/`updatedAt`), each join row holding two FKs. Used for
  Product↔Tag, Product↔Collection, and Product↔Product ("related").
- **self-tree / self m2m**: a table referencing itself — Category (parent/child)
  and RelatedProduct (product ↔ product).

### On-delete rationale

- `Cascade` — child rows are meaningless without the parent (a product's images,
  an order's items), so they're removed together.
- `SetNull` — the reference is optional and the row must survive (an OrderItem
  keeps its name/price snapshot even if the product is later removed; a guest
  review stays if the user is deleted).
- `Restrict` — block the delete to protect data (can't delete a Category that
  still has products, or a User who has orders). In practice you'd set
  `status = DISCONTINUED` instead of hard-deleting.

## Not modeled here (treated as content, not core tables)

- Return & Exchange policy text and sale-specific rules → app content / optional
  `Policy` table. Flag if you want these in the schema.

## Price storage note

All currency fields (prices, order totals, payment amounts) are integers **in
paise** (₹1 = 100). This avoids floating-point errors in percentage discounts
and GST splits. Divide by 100 only for display.
