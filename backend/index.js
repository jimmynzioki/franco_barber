require('dotenv').config()

const express = require('express')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { MongoClient } = require('mongodb')

const app = express()
const port = process.env.PORT || 4000
const adminUsername = process.env.ADMIN_USERNAME || 'sheevy'
const adminPassword = process.env.ADMIN_PASSWORD || 'sheevy123'
const whatsappNumber = process.env.WHATSAPP_NUMBER || '+254710865376'
const mongoUri = process.env.MONGODB_URI
const mongoDbName = process.env.MONGODB_DB_NAME || 'sheevybarbers'
const sessions = new Set()

if (!mongoUri) {
	console.error('MONGODB_URI is required. Copy backend/.env.example to backend/.env and set it.')
	process.exit(1)
}

app.use(express.json({ limit: '1mb' }))
app.use((request, response, next) => {
	response.setHeader('Access-Control-Allow-Origin', '*')
	response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
	response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
	if (request.method === 'OPTIONS') return response.sendStatus(204)
	next()
})

const defaultSite = {
	name: 'Sheevy Barbers',
	tagline: 'Sharp cuts. Smooth finishes. Your chair awaits.',
	whatsapp: whatsappNumber,
	location: 'Kasarani, Mwiki, Mlima Stage',
	images: [
		{ id: 1, url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1200&q=85', alt: 'Barber shaping a sharp fade' },
		{ id: 2, url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=900&q=85', alt: 'Fresh men haircut detail' },
		{ id: 3, url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=900&q=85', alt: 'Sheevy Barbers chair' },
	],
	services: [
		{ id: 'cut', name: 'The Sheevy Cut', description: 'A tailored cut, clean lines and a finish that holds.', price: 300, image: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=700&q=85' },
		{ id: 'shave', name: 'Hot Towel Shave', description: 'Classic straight-razor shave with a warm towel ritual.', price: 500, image: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=700&q=85' },
		{ id: 'braid', name: 'Braiding', description: 'Neat, creative braids built to match your style.', price: 500, image: 'https://images.unsplash.com/photo-1605497788044-5a32c7078486?auto=format&fit=crop&w=700&q=85' },
		{ id: 'cut-shave', name: 'Cut + Shave', description: 'The full reset: precision cut with a smooth finish.', price: 400, image: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=700&q=85' },
	],
}

let database
let siteCollection
let bookingsCollection

function requireAdmin(request, response, next) {
	const token = request.get('Authorization')?.replace('Bearer ', '')
	if (!token || !sessions.has(token)) return response.status(401).json({ error: 'Admin access required' })
	next()
}

function normalizeSite(site) {
	return {
		name: site.name || defaultSite.name,
		tagline: site.tagline || defaultSite.tagline,
		whatsapp: site.whatsapp || whatsappNumber,
		location: site.location || defaultSite.location,
		images: Array.isArray(site.images) ? site.images : defaultSite.images,
		services: Array.isArray(site.services) && site.services.length ? site.services : defaultSite.services,
	}
}

function readSeedSite() {
	const dataPath = path.join(__dirname, 'site-data.json')
	if (!fs.existsSync(dataPath)) return defaultSite
	try { return normalizeSite(JSON.parse(fs.readFileSync(dataPath, 'utf8'))) } catch { return defaultSite }
}

async function start() {
	const mongoClient = new MongoClient(mongoUri)
	await mongoClient.connect()
	database = mongoClient.db(mongoDbName)
	siteCollection = database.collection('site')
	bookingsCollection = database.collection('bookings')

	const existingSite = await siteCollection.findOne({ _id: 'main' })
	if (!existingSite) await siteCollection.insertOne({ _id: 'main', ...readSeedSite(), updatedAt: new Date() })

	app.get('/api/health', async (request, response) => {
		try { await database.command({ ping: 1 }); response.json({ status: 'ready', database: 'mongodb' }) } catch { response.status(503).json({ status: 'database unavailable' }) }
	})

	app.get('/api/site', async (request, response) => {
		const site = await siteCollection.findOne({ _id: 'main' }, { projection: { _id: 0, updatedAt: 0 } })
		response.json(normalizeSite(site || defaultSite))
	})

	app.post('/api/admin/login', (request, response) => {
		const { username, password } = request.body
		if (username !== adminUsername || password !== adminPassword) return response.status(401).json({ error: 'Incorrect username or password' })
		const token = crypto.randomBytes(24).toString('hex')
		sessions.add(token)
		response.json({ token, username: adminUsername })
	})

	app.get('/api/admin/bookings', requireAdmin, async (request, response) => {
		const bookings = await bookingsCollection.find().sort({ createdAt: -1 }).toArray()
		response.json(bookings.map(({ _id, ...booking }) => booking))
	})

	app.post('/api/admin/bookings', requireAdmin, async (request, response) => {
		const { name, phone, service, date, time } = request.body
		if (!name || !phone || !service || !date || !time) return response.status(400).json({ error: 'Please complete every booking field' })
		const booking = { id: crypto.randomUUID(), name, phone, service, date, time, createdAt: new Date().toISOString(), source: 'admin' }
		await bookingsCollection.insertOne(booking)
		response.status(201).json({ booking })
	})

	app.put('/api/admin/services', requireAdmin, async (request, response) => {
		if (!Array.isArray(request.body.services) || !request.body.services.length) return response.status(400).json({ error: 'Add at least one menu item' })
		if (request.body.services.some((service) => !service?.name || !service?.description || !Number.isFinite(Number(service.price)))) return response.status(400).json({ error: 'Every menu item needs a name, description, and price' })
		const services = request.body.services.slice(0, 12).map((service, index) => ({ id: service.id || `service-${index + 1}`, name: service.name, description: service.description, price: Number(service.price), image: service.image || service.imageUrl || service.image_url || defaultSite.services[index % defaultSite.services.length].image }))
		await siteCollection.updateOne({ _id: 'main' }, { $set: { services, updatedAt: new Date() } }, { upsert: true })
		response.json({ services })
	})

	app.put('/api/admin/images', requireAdmin, async (request, response) => {
		if (!Array.isArray(request.body.images)) return response.status(400).json({ error: 'Images must be an array' })
		const images = request.body.images.filter((image) => image?.url).slice(0, 6).map((image, index) => ({ id: index + 1, url: image.url, alt: image.alt || 'Sheevy Barbers' }))
		await siteCollection.updateOne({ _id: 'main' }, { $set: { images, updatedAt: new Date() } }, { upsert: true })
		response.json({ images })
	})

	app.post('/api/bookings', async (request, response) => {
		const { name, phone, service, date, time } = request.body
		if (!name || !phone || !service || !date || !time) return response.status(400).json({ error: 'Please complete every booking field' })
		const booking = { id: crypto.randomUUID(), name, phone, service, date, time, createdAt: new Date().toISOString(), source: 'customer' }
		await bookingsCollection.insertOne(booking)
		response.status(201).json({ booking })
	})

	app.listen(port, () => console.log(`Sheevy Barbers backend ready on http://localhost:${port} with MongoDB`))
}

start().catch((error) => {
	console.error('MongoDB connection failed:', error.message)
	process.exit(1)
})
