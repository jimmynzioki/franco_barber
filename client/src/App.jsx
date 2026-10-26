import { useEffect, useState } from 'react'
import './App.css'

const currency = (amount) => `KSh ${Number(amount).toLocaleString('en-KE')}`
const whatsappLink = (number) => `https://wa.me/${number.replace(/\D/g, '')}`
const apiUrl = (path) => `${import.meta.env.VITE_API_URL || ''}${path}`
const request = (path, options) => globalThis.fetch(apiUrl(path), options)

function App() {
  const [site, setSite] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [selectedService, setSelectedService] = useState(null)
  const [selectedImage, setSelectedImage] = useState(null)
  const [booking, setBooking] = useState({ name: '', phone: '', date: '', time: '', paymentMethod: 'queue' })
  const [bookingMessage, setBookingMessage] = useState('')
  const [paymentCheckoutId, setPaymentCheckoutId] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [paymentReceipt, setPaymentReceipt] = useState('')
  const [isBookingSubmitting, setIsBookingSubmitting] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [admin, setAdmin] = useState({ username: '', password: '' })
  const [adminToken, setAdminToken] = useState('')
  const [adminData, setAdminData] = useState(null)
  const [adminMessage, setAdminMessage] = useState('')
  const [newBooking, setNewBooking] = useState({ name: '', phone: '', service: '', date: '', time: '' })

  useEffect(() => {
    request('/api/site')
      .then((response) => { if (!response.ok) throw new Error('Unable to load the shop'); return response.json() })
      .then(setSite)
      .catch((error) => setLoadError(error.message))
  }, [])

  useEffect(() => {
    if (!selectedImage) return undefined

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedImage(null)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [selectedImage])

  useEffect(() => {
    if (!paymentCheckoutId) return undefined

    let cancelled = false
    let timer
    let attempts = 0
    const checkPayment = async () => {
      try {
        const response = await request(`/api/payments/daraja/${encodeURIComponent(paymentCheckoutId)}`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to check M-Pesa payment status')
        if (cancelled) return
        if (data.paymentStatus === 'paid') {
          setPaymentStatus('paid')
          setPaymentReceipt(data.mpesaReceiptNumber || '')
          setBookingMessage('Payment confirmed. Send your booking details to the shop on WhatsApp.')
          return
        }
        if (data.paymentStatus === 'failed') {
          setPaymentStatus('failed')
          setBookingMessage('M-Pesa payment was not completed. You can try again or choose to queue and pay at the shop.')
          return
        }
      } catch (error) {
        if (cancelled) return
        setBookingMessage(error.message)
      }
      attempts += 1
      if (attempts >= 24) {
        setBookingMessage('Payment is still pending. Do not try to pay again until you confirm whether M-Pesa charged you.')
        return
      }
      timer = setTimeout(checkPayment, 5000)
    }

    checkPayment()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [paymentCheckoutId])

  const openBooking = (service) => {
    setSelectedService(service)
    setBookingMessage('')
    setPaymentCheckoutId('')
    setPaymentStatus('')
    setPaymentReceipt('')
    setBooking((current) => ({ ...current, paymentMethod: 'queue' }))
  }

  const chooseBookingMethod = (paymentMethod) => {
    if (paymentStatus === 'pending' || paymentStatus === 'paid') return
    setBooking((current) => ({ ...current, paymentMethod }))
    setPaymentStatus('')
    setPaymentCheckoutId('')
    setBookingMessage('')
  }

  const openDateTimePicker = (event) => {
    const input = event.target.closest?.('input[type="date"], input[type="time"]')
    if (typeof input?.showPicker === 'function') input.showPicker()
  }

  const submitBooking = async (event) => {
    event.preventDefault()
    setIsBookingSubmitting(true)
    setBookingMessage(booking.paymentMethod === 'queue' ? 'Sending your booking...' : 'Starting your M-Pesa payment...')
    try {
      if (booking.paymentMethod === 'queue') {
        const response = await request('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...booking, service: selectedService.name }) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to prepare your booking')
        const text = `Hi TOP RANKING BARBERS! I would like to join the queue for the ${selectedService.name} on ${booking.date} at ${booking.time}. Name: ${booking.name}. Phone: ${booking.phone}.`
        window.open(`${whatsappLink(site.whatsapp)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
        setBookingMessage('Booking prepared. WhatsApp is opening now.')
        return
      }

      const response = await request('/api/payments/daraja/stk-push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...booking, service: selectedService.name }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to start M-Pesa payment')
      setPaymentStatus('pending')
      setPaymentCheckoutId(data.checkoutRequestId)
      setBookingMessage(data.message)
    } catch (error) {
      setBookingMessage(error.message)
    } finally {
      setIsBookingSubmitting(false)
    }
  }

  const loadAdmin = async (token) => {
    const response = await request('/api/admin/bookings', { headers: { Authorization: `Bearer ${token}` } })
    if (response.ok) setAdminData({ bookings: await response.json(), services: site.services })
  }

  const loginAdmin = async (event) => {
    event.preventDefault()
    const response = await request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(admin) })
    const data = await response.json()
    if (!response.ok) return setAdminMessage(data.error)
    setAdminToken(data.token); setAdminMessage(''); loadAdmin(data.token)
  }

  const saveImages = async (event) => {
    event.preventDefault()
    const images = event.target.urls.value.split('\n').map((url) => ({ url: url.trim() })).filter((image) => image.url)
    const response = await request('/api/admin/images', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ images }) })
    const data = await response.json()
    if (response.ok) { setSite((current) => ({ ...current, images: data.images })); setAdminMessage('Gallery updated.') }
  }

  const addAdminBooking = async (event) => {
    event.preventDefault()
    const response = await request('/api/admin/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify(newBooking) })
    const data = await response.json()
    if (!response.ok) return setAdminMessage(data.error)
    setAdminData((current) => ({ ...current, bookings: [data.booking, ...current.bookings] }))
    setNewBooking({ name: '', phone: '', service: '', date: '', time: '' })
    setAdminMessage('Booking added to the schedule.')
  }

  const markBookingDone = async (item) => {
    const response = await request(`/api/admin/bookings/${encodeURIComponent(item.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ done: !item.done }) })
    const data = await response.json()
    if (!response.ok) return setAdminMessage(data.error)
    setAdminData((current) => ({ ...current, bookings: current.bookings.map((booking) => booking.id === item.id ? { ...booking, done: data.done } : booking) }))
  }

  const deleteBooking = async (item) => {
    const response = await request(`/api/admin/bookings/${encodeURIComponent(item.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } })
    if (!response.ok) {
      const data = await response.json()
      return setAdminMessage(data.error)
    }
    setAdminData((current) => ({ ...current, bookings: current.bookings.filter((booking) => booking.id !== item.id) }))
  }

  const updateMenuItem = (index, field, value) => setAdminData((current) => ({ ...current, services: current.services.map((service, itemIndex) => itemIndex === index ? { ...service, [field]: value } : service) }))

  const saveServices = async (event) => {
    event.preventDefault()
    const response = await request('/api/admin/services', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ services: adminData.services }) })
    const data = await response.json()
    if (response.ok) { setSite((current) => ({ ...current, services: data.services })); setAdminData((current) => ({ ...current, services: data.services })); setAdminMessage('Customer menu updated.') }
    else setAdminMessage(data.error)
  }

  const addMenuItem = () => setAdminData((current) => ({ ...current, services: [...current.services, { id: `service-${Date.now()}`, name: '', description: '', price: 0, image: '' }] }))

  if (loadError) return <main className="state-screen"><strong>TOP RANKING BARBERS</strong><p>{loadError}. Please start the backend and refresh.</p></main>
  if (!site) return <main className="state-screen"><span className="loader" /><p>Opening the shop...</p></main>

  return (
    <div className="app-shell" onClick={openDateTimePicker}>
      <header className="nav wrap"><a className="brand" href="#top"><span className="brand-mark">T</span><span>TOP RANKING <em>BARBERS</em></span></a><nav><a href="#services">Menu</a><a href="#gallery">Gallery</a><a href="#visit">Visit us</a></nav><button className="admin-link" onClick={() => setAdminOpen(true)}>Admin <span>↗</span></button></header>
      <main id="top">
        <section className="hero wrap"><div className="hero-copy"><p className="eyebrow">Est. 2024 · {site.location}</p><h1>Your next<br /><i>great</i> cut.</h1><p className="hero-text">A modern barbershop for people who know that details make the difference.</p><a className="button button-dark" href="#services">Explore services <span>↓</span></a></div><button type="button" className="hero-image image-view-button" aria-label={`View ${site.images[0]?.alt || 'barbershop'} image full size`} onClick={() => setSelectedImage(site.images[0])}><img src={site.images[0]?.url} alt={site.images[0]?.alt} /><span className="image-note">01 / the chair</span></button><div className="hero-stamp">S<br /><small>since<br />2024</small></div></section>
        <section className="marquee"><div>precision <span>✦</span> personality <span>✦</span> good energy <span>✦</span> precision <span>✦</span> personality <span>✦</span> good energy <span>✦</span> precision <span>✦</span> personality <span>✦</span> good energy <span>✦</span> precision <span>✦</span> personality <span>✦</span> good energy <span>✦</span></div></section>
        <section id="services" className="section wrap"><div className="section-heading"><div><p className="eyebrow">01 / Customer menu</p><h2>Keep it <i>fresh.</i></h2></div><p>Current prices and styles.<br />Pick your finish.</p></div><div className="service-grid">{site.services.map((service, index) => <article className={`service-card ${index === 0 ? 'featured' : ''}`} key={service.id}><button type="button" className="service-image-button image-view-button" aria-label={`View ${service.name} style full size`} onClick={() => setSelectedImage({ url: service.image || site.images[index % site.images.length]?.url, alt: `${service.name} style` })}><img className="service-image" src={service.image || site.images[index % site.images.length]?.url} alt={`${service.name} style`} /></button><span className="service-number">0{index + 1}</span><h3>{service.name}</h3><p>{service.description}</p><div className="service-bottom"><strong>{currency(service.price)}</strong><button onClick={() => openBooking(service)}>Book now <span>↗</span></button></div></article>)}</div></section>
        <section id="gallery" className="gallery-section"><div className="wrap section-heading"><div><p className="eyebrow">02 / The look</p><h2>Made to be <i>seen.</i></h2></div><p>Every cut leaves the chair<br />with its own signature.</p></div><div className="gallery wrap">{site.images.map((image) => <button key={image.id} type="button" className="gallery-image-button image-view-button" aria-label={`View ${image.alt || 'gallery'} image full size`} onClick={() => setSelectedImage(image)}><img src={image.url} alt={image.alt} /></button>)}</div></section>
        <section id="visit" className="visit wrap"><div><p className="eyebrow">03 / Find us</p><h2>Come through.<br /><i>Leave sharper.</i></h2></div><div className="visit-details"><p>We are ready when you are.<br />Walk-ins welcome, bookings preferred.</p><a className="button button-dark" href={whatsappLink(site.whatsapp)} target="_blank" rel="noreferrer">WhatsApp us <span>↗</span></a><p className="contact">0701 060503<br />{site.location}</p></div></section>
      </main>
      <footer className="footer wrap"><span>TOP RANKING BARBERS</span><span>Sharp minds. Sharper cuts.</span><button onClick={() => setAdminOpen(true)}>Staff access</button></footer>
      {selectedImage && <div className="image-viewer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedImage(null)}><div className="image-viewer" role="dialog" aria-modal="true" aria-label="Full-size image"><button type="button" className="image-viewer-close" aria-label="Close full-size image" onClick={() => setSelectedImage(null)}>×</button><img src={selectedImage.url} alt={selectedImage.alt || 'Full-size barbershop design'} /></div></div>}
      {selectedService && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedService(null)}><form className="modal booking-modal" onSubmit={submitBooking}><button type="button" className="close" onClick={() => setSelectedService(null)}>×</button><p className="eyebrow">Book your chair</p><h2>{selectedService.name}</h2><p className="modal-price">{currency(selectedService.price)}</p><label>Name<input required value={booking.name} onChange={(event) => setBooking({ ...booking, name: event.target.value })} /></label><label>Phone number<input required type="tel" value={booking.phone} onChange={(event) => setBooking({ ...booking, phone: event.target.value })} /></label><div className="form-row"><label>Date<input required type="date" value={booking.date} onChange={(event) => setBooking({ ...booking, date: event.target.value })} /></label><label>Time<input required type="time" value={booking.time} onChange={(event) => setBooking({ ...booking, time: event.target.value })} /></label></div><fieldset className="booking-choice-group" disabled={paymentStatus === 'pending' || paymentStatus === 'paid'}><legend>Choose how to book</legend><button type="button" className={`booking-choice ${booking.paymentMethod === 'queue' ? 'selected' : ''}`} onClick={() => chooseBookingMethod('queue')}><strong>Join the queue</strong><span>Book now and pay at the shop</span></button><button type="button" className={`booking-choice ${booking.paymentMethod === 'mpesa' ? 'selected' : ''}`} onClick={() => chooseBookingMethod('mpesa')}><strong>Pay now with M-Pesa</strong><span>Pay {currency(selectedService.price)} by STK Push</span></button></fieldset>{paymentStatus === 'paid' ? <a className="button button-dark submit" href={`${whatsappLink(site.whatsapp)}?text=${encodeURIComponent(`Hi TOP RANKING BARBERS! My M-Pesa payment for ${selectedService.name} is confirmed${paymentReceipt ? ` (receipt ${paymentReceipt})` : ''}. Booking: ${booking.date} at ${booking.time}. Name: ${booking.name}. Phone: ${booking.phone}.`)}`} target="_blank" rel="noreferrer">Send booking on WhatsApp <span>↗</span></a> : <button className="button button-dark submit" type="submit" disabled={isBookingSubmitting || paymentStatus === 'pending'}>{isBookingSubmitting ? 'Please wait…' : paymentStatus === 'pending' ? 'Waiting for M-Pesa confirmation…' : booking.paymentMethod === 'queue' ? 'Continue to WhatsApp' : `Pay ${currency(selectedService.price)} with M-Pesa`} <span>↗</span></button>}{paymentStatus === 'failed' && <button type="button" className="payment-retry" onClick={() => chooseBookingMethod(booking.paymentMethod)}>Try M-Pesa again</button>}{bookingMessage && <p className="form-message" role="status">{bookingMessage}</p>}</form></div>}
      {adminOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setAdminOpen(false)}><div className={`modal admin-modal ${adminToken ? 'dashboard-modal' : ''}`}><button type="button" className="close" onClick={() => setAdminOpen(false)}>×</button>{!adminToken ? <><p className="eyebrow">Staff only</p><h2>Admin access</h2><form onSubmit={loginAdmin}><label>Username<input required value={admin.username} onChange={(event) => setAdmin({ ...admin, username: event.target.value })} /></label><label>Password<input required type="password" value={admin.password} onChange={(event) => setAdmin({ ...admin, password: event.target.value })} /></label><button className="button button-dark submit">Sign in <span>↗</span></button>{adminMessage && <p className="form-message">{adminMessage}</p>}</form></> : <><div className="dashboard-head"><div><p className="eyebrow">Control room</p><h2>Welcome to Top Ranking.</h2></div><span className="live-badge">Live menu</span></div><div className="dashboard-grid"><section className="dashboard-panel"><div className="panel-heading"><h3>Bookings</h3><span>{adminData?.bookings.length || 0} total</span></div><form className="admin-booking-form" onSubmit={addAdminBooking}><p className="panel-label">Add a booking</p><div className="form-row"><input required placeholder="Client name" value={newBooking.name} onChange={(event) => setNewBooking({ ...newBooking, name: event.target.value })} /><input required placeholder="Phone number" value={newBooking.phone} onChange={(event) => setNewBooking({ ...newBooking, phone: event.target.value })} /></div><div className="form-row"><select required value={newBooking.service} onChange={(event) => setNewBooking({ ...newBooking, service: event.target.value })}><option value="">Choose service</option>{adminData?.services.map((service) => <option key={service.id} value={service.name}>{service.name}</option>)}</select><input required type="date" value={newBooking.date} onChange={(event) => setNewBooking({ ...newBooking, date: event.target.value })} /><input required type="time" value={newBooking.time} onChange={(event) => setNewBooking({ ...newBooking, time: event.target.value })} /></div><button className="button button-dark submit">Add booking <span>+</span></button></form><div className="admin-bookings">{adminData?.bookings.length ? adminData.bookings.map((item) => <div className={`admin-booking ${item.done ? 'is-done' : ''}`} key={item.id}><p><strong>{item.name}</strong>{item.done && <span className="booking-status">Done</span>} · {item.service}<br />{item.date} at {item.time} · {item.phone}</p><div className="booking-actions"><button type="button" onClick={() => markBookingDone(item)}>{item.done ? 'Restore' : 'Mark done'}</button><button type="button" onClick={() => deleteBooking(item)}>Delete</button></div></div>) : <p>No bookings yet.</p>}</div></section><section className="dashboard-panel"><div className="panel-heading"><h3>Customer menu</h3><button type="button" className="add-menu" onClick={addMenuItem}>+ Add item</button></div><p className="panel-help">Edit prices, descriptions, and images customers see on the website.</p><form onSubmit={saveServices}>{adminData?.services.map((service, index) => <div className="menu-editor" key={service.id}><div className="menu-editor-top"><strong>0{index + 1}</strong><button type="button" onClick={() => setAdminData((current) => ({ ...current, services: current.services.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button></div><input required placeholder="Service name" value={service.name} onChange={(event) => updateMenuItem(index, 'name', event.target.value)} /><textarea required placeholder="Description" rows="2" value={service.description} onChange={(event) => updateMenuItem(index, 'description', event.target.value)} /><input required type="number" min="0" placeholder="Price in R" value={service.price} onChange={(event) => updateMenuItem(index, 'price', event.target.value)} /><input placeholder="Menu image URL" value={service.image || ''} onChange={(event) => updateMenuItem(index, 'image', event.target.value)} /></div>)}<button className="button button-dark submit">Save customer menu <span>↗</span></button></form></section></div><form className="gallery-editor" onSubmit={saveImages}><div className="panel-heading"><h3>Gallery images</h3><span>Admin only</span></div><textarea name="urls" defaultValue={site.images.map((image) => image.url).join('\n')} rows="3" /><button className="button button-dark submit">Save gallery <span>↗</span></button></form>{adminMessage && <p className="form-message">{adminMessage}</p>}</>}</div></div>}
    </div>
  )
}

export default App
