import { neon } from '@neondatabase/serverless'

let sql

export function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL || ''
}

export function getSql() {
  const url = getDatabaseUrl()
  if (!url) {
    const error = new Error('DATABASE_URL missing')
    error.code = 'NO_DATABASE'
    throw error
  }
  if (!sql) sql = neon(url)
  return sql
}

export async function ensureSchema() {
  const db = getSql()
  await db`
    CREATE TABLE IF NOT EXISTS stockly_users (
      id UUID PRIMARY KEY,
      email TEXT DEFAULT '',
      name TEXT DEFAULT '',
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      picture TEXT DEFAULT '',
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      password_hash TEXT,
      email_verified BOOLEAN DEFAULT true,
      verify_code_hash TEXT,
      verify_code_expires TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (provider, provider_id)
    )
  `
  await db`ALTER TABLE stockly_users ADD COLUMN IF NOT EXISTS first_name TEXT DEFAULT ''`
  await db`ALTER TABLE stockly_users ADD COLUMN IF NOT EXISTS last_name TEXT DEFAULT ''`
  await db`ALTER TABLE stockly_users ADD COLUMN IF NOT EXISTS password_hash TEXT`
  await db`ALTER TABLE stockly_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT true`
  await db`ALTER TABLE stockly_users ADD COLUMN IF NOT EXISTS verify_code_hash TEXT`
  await db`ALTER TABLE stockly_users ADD COLUMN IF NOT EXISTS verify_code_expires TIMESTAMPTZ`
  await db`CREATE UNIQUE INDEX IF NOT EXISTS stockly_users_email_lower_idx ON stockly_users ((lower(email))) WHERE email <> ''`
  await db`
    CREATE TABLE IF NOT EXISTS stockly_items (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      barcode TEXT DEFAULT '',
      category TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 0,
      price NUMERIC NOT NULL DEFAULT 0,
      price_source TEXT DEFAULT '',
      price_coto NUMERIC DEFAULT 0,
      price_carrefour NUMERIC DEFAULT 0,
      url_coto TEXT DEFAULT '',
      url_carrefour TEXT DEFAULT '',
      image TEXT DEFAULT '',
      image_coto TEXT DEFAULT '',
      image_carrefour TEXT DEFAULT '',
      user_id UUID,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `
  await db`ALTER TABLE stockly_items ADD COLUMN IF NOT EXISTS user_id UUID`
  await db`CREATE INDEX IF NOT EXISTS stockly_items_user_id_idx ON stockly_items (user_id)`
}

function num(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function rowToItem(row) {
  return {
    id: row.id,
    name: row.name,
    barcode: row.barcode || '',
    category: row.category,
    quantity: num(row.quantity),
    minStock: num(row.min_stock),
    price: num(row.price),
    priceSource: row.price_source || '',
    priceCoto: num(row.price_coto),
    priceCarrefour: num(row.price_carrefour),
    urlCoto: row.url_coto || '',
    urlCarrefour: row.url_carrefour || '',
    image: row.image || '',
    imageCoto: row.image_coto || '',
    imageCarrefour: row.image_carrefour || '',
  }
}

function displayName(row) {
  const full = [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim()
  return full || row?.name || row?.email || ''
}

export function rowToUser(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email || '',
    name: displayName(row),
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    picture: row.picture || '',
    provider: row.provider || '',
    emailVerified: row.email_verified !== false,
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export async function getUserRowById(id) {
  if (!id) return null
  await ensureSchema()
  const rows = await getSql()`SELECT * FROM stockly_users WHERE id = ${id}::uuid LIMIT 1`
  return rows[0] || null
}

export async function getUserRowByEmail(email) {
  const normalized = normalizeEmail(email)
  if (!normalized) return null
  await ensureSchema()
  const rows = await getSql()`SELECT * FROM stockly_users WHERE lower(email) = ${normalized} LIMIT 1`
  return rows[0] || null
}

export async function getUserById(id) {
  const row = await getUserRowById(id)
  const user = rowToUser(row)
  if (!user) return null
  if (user.provider === 'email' && !user.emailVerified) return null
  return user
}

export async function upsertUser(profile) {
  await ensureSchema()
  const email = normalizeEmail(profile.email)
  const firstName = String(profile.firstName || '').trim()
  const lastName = String(profile.lastName || '').trim()
  const name = [firstName, lastName].filter(Boolean).join(' ') || profile.name || email || 'Cuenta'
  const picture = profile.picture || ''

  const existing = await getSql()`
    SELECT * FROM stockly_users
    WHERE provider = ${profile.provider} AND provider_id = ${profile.providerId}
    LIMIT 1
  `
  if (existing[0]) {
    const nextName = name || existing[0].name || ''
    const nextEmail = email || existing[0].email || ''
    const nextPicture = picture || existing[0].picture || ''
    const nextFirst = firstName || existing[0].first_name || ''
    const nextLast = lastName || existing[0].last_name || ''
    await getSql()`
      UPDATE stockly_users
      SET email = ${nextEmail},
          name = ${nextName},
          first_name = ${nextFirst},
          last_name = ${nextLast},
          picture = ${nextPicture},
          email_verified = true
      WHERE id = ${existing[0].id}::uuid
    `
    return rowToUser({
      ...existing[0],
      email: nextEmail,
      name: nextName,
      first_name: nextFirst,
      last_name: nextLast,
      picture: nextPicture,
      email_verified: true,
    })
  }

  const byEmail = email ? await getUserRowByEmail(email) : null
  if (byEmail) {
    if (byEmail.provider === 'email') {
      throw new Error('Ya hay una cuenta con ese correo. Entrá con tu contraseña')
    }
    throw new Error('Ya hay una cuenta con ese correo')
  }

  const id = crypto.randomUUID()
  await getSql()`
    INSERT INTO stockly_users (
      id, email, name, first_name, last_name, picture, provider, provider_id, email_verified
    )
    VALUES (
      ${id}::uuid,
      ${email},
      ${name},
      ${firstName},
      ${lastName},
      ${picture},
      ${profile.provider},
      ${profile.providerId},
      true
    )
  `
  return rowToUser({
    id,
    email,
    name,
    first_name: firstName,
    last_name: lastName,
    picture,
    provider: profile.provider,
    email_verified: true,
  })
}

export async function registerEmailUser({ email, passwordHash, firstName, lastName, codeHash, expiresAt }) {
  await ensureSchema()
  const normalized = normalizeEmail(email)
  const first = String(firstName || '').trim()
  const last = String(lastName || '').trim()
  const name = [first, last].filter(Boolean).join(' ')
  const existing = await getUserRowByEmail(normalized)

  if (existing && (existing.provider !== 'email' || existing.email_verified)) {
    throw new Error('Ya hay una cuenta con ese correo')
  }

  if (existing) {
    await getSql()`
      UPDATE stockly_users
      SET name = ${name},
          first_name = ${first},
          last_name = ${last},
          password_hash = ${passwordHash},
          verify_code_hash = ${codeHash},
          verify_code_expires = ${expiresAt},
          email_verified = false
      WHERE id = ${existing.id}::uuid
    `
    return rowToUser({
      ...existing,
      name,
      first_name: first,
      last_name: last,
      email_verified: false,
    })
  }

  const id = crypto.randomUUID()
  await getSql()`
    INSERT INTO stockly_users (
      id, email, name, first_name, last_name, picture, provider, provider_id,
      password_hash, email_verified, verify_code_hash, verify_code_expires
    )
    VALUES (
      ${id}::uuid,
      ${normalized},
      ${name},
      ${first},
      ${last},
      '',
      'email',
      ${normalized},
      ${passwordHash},
      false,
      ${codeHash},
      ${expiresAt}
    )
  `
  return rowToUser({
    id,
    email: normalized,
    name,
    first_name: first,
    last_name: last,
    picture: '',
    provider: 'email',
    email_verified: false,
  })
}

export async function saveEmailCode(userId, codeHash, expiresAt) {
  await ensureSchema()
  await getSql()`
    UPDATE stockly_users
    SET verify_code_hash = ${codeHash}, verify_code_expires = ${expiresAt}
    WHERE id = ${userId}::uuid
  `
}

export async function markEmailVerified(userId) {
  await ensureSchema()
  const rows = await getSql()`
    UPDATE stockly_users
    SET email_verified = true, verify_code_hash = NULL, verify_code_expires = NULL
    WHERE id = ${userId}::uuid
    RETURNING *
  `
  return rowToUser(rows[0])
}

export async function listItems(userId) {
  await ensureSchema()
  const rows = await getSql()`
    SELECT * FROM stockly_items
    WHERE user_id = ${userId}::uuid
    ORDER BY updated_at DESC
  `
  return rows.map(rowToItem)
}

export async function upsertItem(item, userId) {
  await ensureSchema()
  await getSql()`
    INSERT INTO stockly_items (
      id, name, barcode, category, quantity, min_stock, price, price_source,
      price_coto, price_carrefour, url_coto, url_carrefour, image, image_coto, image_carrefour, user_id, updated_at
    )
    VALUES (
      ${item.id}::uuid,
      ${item.name},
      ${item.barcode || ''},
      ${item.category},
      ${num(item.quantity)},
      ${num(item.minStock)},
      ${num(item.price)},
      ${item.priceSource || ''},
      ${num(item.priceCoto)},
      ${num(item.priceCarrefour)},
      ${item.urlCoto || ''},
      ${item.urlCarrefour || ''},
      ${item.image || ''},
      ${item.imageCoto || ''},
      ${item.imageCarrefour || ''},
      ${userId}::uuid,
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      barcode = EXCLUDED.barcode,
      category = EXCLUDED.category,
      quantity = EXCLUDED.quantity,
      min_stock = EXCLUDED.min_stock,
      price = EXCLUDED.price,
      price_source = EXCLUDED.price_source,
      price_coto = EXCLUDED.price_coto,
      price_carrefour = EXCLUDED.price_carrefour,
      url_coto = EXCLUDED.url_coto,
      url_carrefour = EXCLUDED.url_carrefour,
      image = EXCLUDED.image,
      image_coto = EXCLUDED.image_coto,
      image_carrefour = EXCLUDED.image_carrefour,
      updated_at = now()
    WHERE stockly_items.user_id = EXCLUDED.user_id
  `
  return item
}

export async function deleteItem(id, userId) {
  await ensureSchema()
  await getSql()`DELETE FROM stockly_items WHERE id = ${id}::uuid AND user_id = ${userId}::uuid`
}
