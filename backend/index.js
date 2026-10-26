require('dotenv').config()

const express = require('express')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { MongoClient } = require('mongodb')

const app = express()
const port = process.env.PORT || 4000
const adminUsername = process.env.ADMIN_USERNAME || 'franco'
const adminPassword = process.env.ADMIN_PASSWORD
const whatsappNumber = '+254701060503'
const mongoUri = process.env.MONGODB_URI
const mongoDbName = process.env.MONGODB_DB_NAME || 'sheevybarbers'
const darajaEnvironment = process.env.DARAJA_ENVIRONMENT || 'sandbox'
const darajaBaseUrl = darajaEnvironment === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke'
const sessions = new Set()
let darajaAccessToken
let darajaTokenExpiresAt = 0

if (!mongoUri) {
	console.error('MONGODB_URI is required. Copy backend/.env.example to backend/.env and set it.')
	process.exit(1)
}

if (!adminPassword) {
	console.error('ADMIN_PASSWORD is required. Set it in backend/.env.')
	process.exit(1)
}

app.use(express.json({ limit: '1mb' }))
app.use((request, response, next) => {
	response.setHeader('Access-Control-Allow-Origin', '*')
	response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
	response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
	if (request.method === 'OPTIONS') return response.sendStatus(204)
	next()
})

const defaultSite = {
	name: 'TOP RANKING BARBERS',
	tagline: 'Sharp cuts. Smooth finishes. Your chair awaits.',
	whatsapp: whatsappNumber,
	location: 'Kasarani, Mwiki, Mlima Stage',
	images: [
		{ id: 1, url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1200&q=85', alt: 'Barber shaping a sharp fade' },
		{ id: 2, url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=900&q=85', alt: 'Fresh men haircut detail' },
		{ id: 3, url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=900&q=85', alt: 'Top Ranking Barbers chair' },
	],
	services: [
		{ id: 'cut', name: 'The Top Ranking Cut', description: 'A tailored cut, clean lines and a finish that holds.', price: 300, image: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=700&q=85' },
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
	const rebrand = (value) => typeof value === 'string' ? value.replace(/sheevy/gi, 'Top Ranking') : value
	return {
		name: defaultSite.name,
		tagline: rebrand(site.tagline || defaultSite.tagline),
		whatsapp: site.whatsapp || whatsappNumber,
		location: site.location || defaultSite.location,
		images: (Array.isArray(site.images) ? site.images : defaultSite.images).map((image) => ({ ...image, alt: rebrand(image.alt) })),
		services: (Array.isArray(site.services) && site.services.length ? site.services : defaultSite.services).map((service) => ({ ...service, name: rebrand(service.name), description: rebrand(service.description) })),
	}
}

function readSeedSite() {
	const dataPath = path.join(__dirname, 'site-data.json')
	if (!fs.existsSync(dataPath)) return defaultSite
	try { return normalizeSite(JSON.parse(fs.readFileSync(dataPath, 'utf8'))) } catch { return defaultSite }
}

function getDarajaConfigurationError() {
	if (!['sandbox', 'production'].includes(darajaEnvironment)) return 'DARAJA_ENVIRONMENT must be sandbox or production'
	if (!process.env.DARAJA_CONSUMER_KEY || !process.env.DARAJA_CONSUMER_SECRET || !process.env.DARAJA_PASSKEY || !process.env.DARAJA_SHORTCODE || !process.env.DARAJA_TRANSACTION_TYPE || !process.env.DARAJA_CALLBACK_URL) {
		return 'M-Pesa pay-now is not configured. Set the Daraja credentials, shortcode, transaction type, and public HTTPS callback URL in the backend environment.'
	}
	if (!['CustomerPayBillOnline', 'CustomerBuyGoodsOnline'].includes(process.env.DARAJA_TRANSACTION_TYPE)) return 'DARAJA_TRANSACTION_TYPE must be CustomerPayBillOnline or CustomerBuyGoodsOnline'
	if (!/^https:\/\/.+/.test(process.env.DARAJA_CALLBACK_URL)) return 'DARAJA_CALLBACK_URL must be a public HTTPS URL'
	return null
}

async function getDarajaAccessToken() {
	if (darajaAccessToken && Date.now() < darajaTokenExpiresAt) return darajaAccessToken

	const credentials = Buffer.from(`${process.env.DARAJA_CONSUMER_KEY}:${process.env.DARAJA_CONSUMER_SECRET}`).toString('base64')
	const response = await fetch(`${darajaBaseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
		headers: { Authorization: `Basic ${credentials}` },
		signal: AbortSignal.timeout(15000),
	})
	const data = await response.json()
	if (!response.ok || !data.access_token) throw new Error('Unable to authenticate with Daraja')
	darajaAccessToken = data.access_token
	darajaTokenExpiresAt = Date.now() + Math.max(0, Number(data.expires_in || 0) - 60) * 1000
	return darajaAccessToken
}

function darajaTimestamp() {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Africa/Nairobi',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
	}).format(new Date()).replace(/\D/g, '')
}

function normalizeKenyanPhone(phone) {
	const digits = String(phone || '').replace(/\D/g, '')
	if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`
	if (/^254[17]\d{8}$/.test(digits)) return digits
	throw new Error('Enter a valid Kenyan mobile number, for example 0712345678')
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

	app.post('/api/payments/daraja/stk-push', async (request, response) => {
		const configurationError = getDarajaConfigurationError()
		if (configurationError) return response.status(503).json({ error: configurationError })

		const { name, phone, service, date, time } = request.body
		if (!name || !phone || !service || !date || !time) return response.status(400).json({ error: 'Please complete every booking field' })

		let customerPhone
		try { customerPhone = normalizeKenyanPhone(phone) } catch (error) { return response.status(400).json({ error: error.message }) }

		const site = await siteCollection.findOne({ _id: 'main' }, { projection: { _id: 0 } })
		const selectedService = normalizeSite(site || defaultSite).services.find((item) => item.name === service)
		if (!selectedService) return response.status(400).json({ error: 'That service is no longer available. Please refresh and choose it again.' })
		const amount = Number(selectedService.price)
		if (!Number.isSafeInteger(amount) || amount < 1) return response.status(400).json({ error: 'This service does not have a valid payment amount' })

		const booking = {
			id: crypto.randomUUID(),
			name: String(name).trim(),
			phone: customerPhone,
			service: selectedService.name,
			date,
			time,
			amount,
			paymentMethod: 'mpesa',
			paymentStatus: 'pending',
			createdAt: new Date().toISOString(),
			source: 'customer',
		}
		await bookingsCollection.insertOne(booking)

		let stkPushStarted = false
		let checkoutRequestId
		try {
			const accessToken = await getDarajaAccessToken()
			const timestamp = darajaTimestamp()
			const shortcode = process.env.DARAJA_SHORTCODE
			const password = Buffer.from(`${shortcode}${process.env.DARAJA_PASSKEY}${timestamp}`).toString('base64')
			stkPushStarted = true
			const darajaResponse = await fetch(`${darajaBaseUrl}/mpesa/stkpush/v1/processrequest`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					BusinessShortCode: shortcode,
					Password: password,
					Timestamp: timestamp,
					TransactionType: process.env.DARAJA_TRANSACTION_TYPE,
					Amount: amount,
					PartyA: customerPhone,
					PartyB: shortcode,
					PhoneNumber: customerPhone,
					CallBackURL: process.env.DARAJA_CALLBACK_URL,
					AccountReference: 'TopRanking',
					TransactionDesc: selectedService.name.slice(0, 13),
				}),
				signal: AbortSignal.timeout(20000),
			})
			const data = await darajaResponse.json()
			if (!darajaResponse.ok || String(data.ResponseCode) !== '0' || !data.CheckoutRequestID) {
				await bookingsCollection.updateOne({ id: booking.id }, { $set: { paymentStatus: 'failed', paymentError: data.errorMessage || data.ResponseDescription || 'Daraja rejected the payment request' } })
				return response.status(502).json({ error: data.errorMessage || data.ResponseDescription || 'Daraja could not start the M-Pesa payment. Please try again.' })
			}

			checkoutRequestId = data.CheckoutRequestID
			await bookingsCollection.updateOne({ id: booking.id }, {
				$set: { checkoutRequestId, merchantRequestId: data.MerchantRequestID },
			})
			response.status(202).json({ checkoutRequestId, message: 'Check your phone and enter your M-Pesa PIN to complete payment.' })
		} catch (error) {
			console.error('Daraja STK Push failed:', error.message)
			if (stkPushStarted) {
				await bookingsCollection.updateOne({ id: booking.id }, { $set: { paymentError: 'Daraja request outcome is unknown; verify before retrying' } })
				return response.status(202).json({
					checkoutRequestId,
					message: checkoutRequestId
						? 'Payment request sent. Waiting for M-Pesa confirmation.'
						: 'Payment status is unclear. Check your phone and do not retry yet; contact the shop if no M-Pesa prompt arrives.',
				})
			}
			await bookingsCollection.updateOne({ id: booking.id }, { $set: { paymentStatus: 'failed', paymentError: 'Daraja authentication failed' } })
			response.status(502).json({ error: 'Unable to start the M-Pesa payment. Please try again.' })
		}
	})

	app.post('/api/payments/daraja/callback', async (request, response) => {
		const callback = request.body?.Body?.stkCallback
		if (!callback?.CheckoutRequestID || callback.ResultCode === undefined || callback.ResultCode === null || !Number.isInteger(Number(callback.ResultCode))) return response.status(400).json({ ResultCode: 1, ResultDesc: 'Invalid callback payload' })

		const resultCode = Number(callback.ResultCode)
		const items = callback.CallbackMetadata?.Item || []
		const receiptNumber = items.find((item) => item.Name === 'MpesaReceiptNumber')?.Value
		const update = resultCode === 0
			? { paymentStatus: 'paid', paidAt: new Date().toISOString(), ...(receiptNumber ? { mpesaReceiptNumber: String(receiptNumber) } : {}) }
			: { paymentStatus: 'failed', paymentError: String(callback.ResultDesc || 'M-Pesa payment was not completed').slice(0, 200) }
		const result = await bookingsCollection.updateOne(
			{ checkoutRequestId: callback.CheckoutRequestID, paymentMethod: 'mpesa', paymentStatus: 'pending' },
			{ $set: update },
		)
		if (!result.matchedCount) console.warn('Daraja callback did not match a pending booking')
		response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
	})

	app.get('/api/payments/daraja/:checkoutRequestId', async (request, response) => {
		const booking = await bookingsCollection.findOne(
			{ checkoutRequestId: request.params.checkoutRequestId, paymentMethod: 'mpesa', source: 'customer' },
			{ projection: { _id: 0, paymentStatus: 1, mpesaReceiptNumber: 1 } },
		)
		if (!booking) return response.status(404).json({ error: 'Payment request not found' })
		response.json(booking)
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
		const booking = { id: crypto.randomUUID(), name, phone, service, date, time, done: false, createdAt: new Date().toISOString(), source: 'admin' }
		await bookingsCollection.insertOne(booking)
		response.status(201).json({ booking })
	})

	app.put('/api/admin/bookings/:id', requireAdmin, async (request, response) => {
		if (request.body.done !== true && request.body.done !== false) return response.status(400).json({ error: 'Booking status is required' })
		const result = await bookingsCollection.updateOne({ id: request.params.id }, { $set: { done: request.body.done, updatedAt: new Date().toISOString() } })
		if (!result.matchedCount) return response.status(404).json({ error: 'Booking not found' })
		response.json({ id: request.params.id, done: request.body.done })
	})

	app.delete('/api/admin/bookings/:id', requireAdmin, async (request, response) => {
		const result = await bookingsCollection.deleteOne({ id: request.params.id })
		if (!result.deletedCount) return response.status(404).json({ error: 'Booking not found' })
		response.status(204).send()
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
		const images = request.body.images.filter((image) => image?.url).slice(0, 6).map((image, index) => ({ id: index + 1, url: image.url, alt: image.alt || 'Top Ranking Barbers' }))
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

	app.listen(port, () => console.log(`TOP RANKING BARBERS backend ready on http://localhost:${port} with MongoDB`))
}

start().catch((error) => {
	console.error('MongoDB connection failed:', error.message)
	process.exit(1)
})
