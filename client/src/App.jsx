import { useEffect, useState } from 'react'
import './App.css'

const currency = (amount) => `KSh ${Number(amount).toLocaleString('en-KE')}`
const whatsappLink = (number) => `https://wa.me/${number.replace(/\D/g, '')}`
const normalizeKenyanPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '')
  const nationalNumber = /^0[17]\d{8}$/.test(digits)
    ? digits.slice(1)
    : /^254[17]\d{8}$/.test(digits)
      ? digits.slice(3)
      : null
  if (!nationalNumber) throw new Error('Enter a valid Kenyan mobile number, for example 0712345678 or +254712345678')
  return `254${nationalNumber}`
}
const logoUrl = 'https://www.image2url.com/r2/default/images/1793018506322-62966fb6-804e-4d52-95c7-998659b7405e.jpg'
const apiUrl = (path) => `${import.meta.env.VITE_API_URL || ''}${path}`
const request = (path, options) => globalThis.fetch(apiUrl(path), options)

function App() {
  const [site, setSite] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [selectedService, setSelectedService] = useState(null)
  const [selectedImage, setSelectedImage] = useState(null)
  const [booking, setBooking] = useState({ name: '', phone: '', date: '', time: '', paymentMethod: 'mpesa' })
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
  const [bookingFilter, setBookingFilter] = useState('all')
  const [receiptBooking, setReceiptBooking] = useState(null)
  const [adminNavOpen, setAdminNavOpen] = useState(false)
  const [newBooking, setNewBooking] = useState({ name: '', phone: '', service: '', date: '', time: '' })
  const [isGalleryUploading, setIsGalleryUploading] = useState(false)
  const [uploadingMenuImageIndex, setUploadingMenuImageIndex] = useState(null)
  const visibleBookings = (adminData?.bookings || []).filter((item) => {
    const paid = item.paymentMethod === 'mpesa' && item.paymentStatus === 'paid'
    const payAtShop = item.paymentMethod === 'pay_at_shop' || item.paymentMethod === 'queue' || !item.paymentMethod
    return bookingFilter === 'all' || (bookingFilter === 'paid' && paid) || (bookingFilter === 'shop' && payAtShop)
  })
  const allAdminBookings = adminData?.bookings || []
  const paidBookings = allAdminBookings.filter((item) => item.paymentMethod === 'mpesa' && item.paymentStatus === 'paid')
  const shopBookings = allAdminBookings.filter((item) => item.paymentMethod === 'pay_at_shop' || item.paymentMethod === 'queue' || !item.paymentMethod)
  const completedBookings = allAdminBookings.filter((item) => item.done)
  const paidRevenue = paidBookings.reduce((total, item) => total + (Number(item.paidAmount ?? item.amount) || 0), 0)

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
          setBookingMessage(data.paymentError
            ? `M-Pesa payment was not completed: ${data.paymentError}`
            : 'M-Pesa payment was not completed. You can try again or choose to queue and pay at the shop.')
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
    setBooking((current) => ({ ...current, paymentMethod: 'mpesa' }))
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
    let customerPhone
    try {
      customerPhone = normalizeKenyanPhone(booking.phone)
    } catch (error) {
      setBookingMessage(error.message)
      return
    }
    setIsBookingSubmitting(true)
    setBookingMessage(booking.paymentMethod === 'queue' ? 'Sending your booking...' : 'Starting your M-Pesa payment...')
    try {
      if (booking.paymentMethod === 'queue') {
        const nationalPhone = `0${customerPhone.slice(3)}`
        const response = await request('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...booking, phone: nationalPhone, service: selectedService.name }) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to prepare your booking')
        const text = `Hi TOP RANKING BARBERS! I would like to join the queue for the ${selectedService.name} on ${booking.date} at ${booking.time}. Name: ${booking.name}. Phone: ${booking.phone}.`
        window.open(`${whatsappLink(site.whatsapp)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
        setBookingMessage('Booking prepared. WhatsApp is opening now.')
        return
      }

      const response = await request('/api/payments/daraja/stk-push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...booking, phone: customerPhone, serviceId: selectedService.id, amount: Number(selectedService.price) }) })
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

  const uploadGalleryImage = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    if (site.images.length + files.length > 6) {
      setAdminMessage('The gallery can contain up to 6 images.')
      event.target.value = ''
      return
    }

    setIsGalleryUploading(true)
    try {
      const uploadedUrls = []
      for (const file of files) {
        const formData = new FormData()
        formData.append('image', file)
        const response = await request('/api/admin/images/upload', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: formData })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to upload image')
        uploadedUrls.push(data.url)
      }
      const urlsTextarea = document.querySelector('[name="urls"]')
      if (urlsTextarea) {
        urlsTextarea.value = [...site.images.map((image) => image.url), ...uploadedUrls].join('\n')
      }
      setAdminMessage(`${uploadedUrls.length} image${uploadedUrls.length === 1 ? '' : 's'} uploaded to Cloudinary. Save gallery to publish.`)
    } catch (error) {
      setAdminMessage(error.message)
    } finally {
      setIsGalleryUploading(false)
      event.target.value = ''
    }
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

  const uploadMenuImage = async (index, event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadingMenuImageIndex(index)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const response = await request('/api/admin/images/upload', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: formData })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to upload menu image')
      updateMenuItem(index, 'image', data.url)
      setAdminMessage('Menu image uploaded to Cloudinary. Save customer menu to publish.')
    } catch (error) {
      setAdminMessage(error.message)
    } finally {
      setUploadingMenuImageIndex(null)
      event.target.value = ''
    }
  }

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
      <header className="nav wrap"><a className="brand" href="#top"><span className="brand-mark"><img src={logoUrl} alt="Top Ranking Barbers logo" /></span><span>TOP RANKING <em>BARBERS</em></span></a><nav><a href="#services">Menu</a><a href="#gallery">Gallery</a><a href="#visit">Visit us</a></nav><button className="admin-link" onClick={() => setAdminOpen(true)}>Admin <span>↗</span></button></header>
      <main id="top">
        <section className="hero wrap"><div className="hero-copy"><p className="eyebrow">Est. 2024 · {site.location}</p><h1>Your next<br /><i>great</i> cut.</h1><p className="hero-text">A modern barbershop for people who know that details make the difference.</p><a className="button button-dark" href="#services">Explore services <span>↓</span></a></div><button type="button" className="hero-image image-view-button" aria-label={`View ${site.images[0]?.alt || 'barbershop'} image full size`} onClick={() => setSelectedImage(site.images[0])}><img src={site.images[0]?.url} alt={site.images[0]?.alt} /><span className="image-note">01 / the chair</span></button><div className="hero-stamp">S<br /><small>since<br />2024</small></div></section>
        <section className="marquee"><div>precision <span>✦</span> personality <span>✦</span> good energy <span>✦</span> precision <span>✦</span> personality <span>✦</span> good energy <span>✦</span> precision <span>✦</span> personality <span>✦</span> good energy <span>✦</span> precision <span>✦</span> personality <span>✦</span> good energy <span>✦</span></div></section>
        <section id="services" className="section wrap"><div className="section-heading"><div><p className="eyebrow">01 / Customer menu</p><h2>Keep it <i>fresh.</i></h2></div><p>Current prices and styles.<br />Pick your finish.</p></div><div className="service-grid">{site.services.map((service, index) => <article className={`service-card ${index === 0 ? 'featured' : ''}`} key={service.id}><button type="button" className="service-image-button image-view-button" aria-label={`View ${service.name} style full size`} onClick={() => setSelectedImage({ url: service.image || site.images[index % site.images.length]?.url, alt: `${service.name} style` })}><img className="service-image" src={service.image || site.images[index % site.images.length]?.url} alt={`${service.name} style`} /></button><span className="service-number">0{index + 1}</span><h3>{service.name}</h3><p>{service.description}</p><div className="service-bottom"><strong>{currency(service.price)}</strong><button onClick={() => openBooking(service)}>Book now <span>↗</span></button></div></article>)}</div></section>
        <section id="gallery" className="gallery-section"><div className="wrap section-heading"><div><p className="eyebrow">02 / The look</p><h2>Made to be <i>seen.</i></h2></div><p>Every cut leaves the chair<br />with its own signature.</p></div><div className="gallery wrap">{site.images.map((image) => <button key={image.id} type="button" className="gallery-image-button image-view-button" aria-label={`View ${image.alt || 'gallery'} image full size`} onClick={() => setSelectedImage(image)}><img src={image.url} alt={image.alt} /></button>)}</div></section>
        <section id="visit" className="visit wrap"><div><p className="eyebrow">03 / Find us</p><h2>Come through.<br /><i>Leave sharper.</i></h2></div><div className="visit-details"><p>We are ready when you are.<br />Walk-ins welcome, bookings preferred.</p><a className="button button-dark" href={whatsappLink(site.whatsapp)} target="_blank" rel="noreferrer">WhatsApp us <span>↗</span></a><p className="contact">0701 060503<br />{site.location}</p></div></section>
      </main>
      <footer className="footer wrap"><span>TOP RANKING BARBERS<br /><small>© <a href="https://wa.me/254710865376" target="_blank" rel="noreferrer">Ezra</a> 2026</small></span><span>Sharp minds. Sharper cuts.</span><button onClick={() => setAdminOpen(true)}>Staff access</button></footer>
      {selectedImage && <div className="image-viewer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedImage(null)}><div className="image-viewer" role="dialog" aria-modal="true" aria-label="Full-size image"><button type="button" className="image-viewer-close" aria-label="Close full-size image" onClick={() => setSelectedImage(null)}>×</button><img src={selectedImage.url} alt={selectedImage.alt || 'Full-size barbershop design'} /></div></div>}
      {selectedService && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedService(null)}><form className="modal booking-modal" onSubmit={submitBooking}><button type="button" className="close" onClick={() => setSelectedService(null)}>×</button><p className="eyebrow">Book your chair</p><h2>{selectedService.name}</h2><p className="modal-price">{currency(selectedService.price)}</p><label>Name<input required value={booking.name} onChange={(event) => setBooking({ ...booking, name: event.target.value })} /></label><label>Phone number<input required type="tel" inputMode="tel" maxLength={16} value={booking.phone} onChange={(event) => setBooking({ ...booking, phone: event.target.value.slice(0, 16) })} /></label><div className="form-row"><label>Date<input required type="date" value={booking.date} onChange={(event) => setBooking({ ...booking, date: event.target.value })} /></label><label>Time<input required type="time" value={booking.time} onChange={(event) => setBooking({ ...booking, time: event.target.value })} /></label></div><fieldset className="booking-choice-group" disabled={paymentStatus === 'pending' || paymentStatus === 'paid'}><legend>Choose how to book</legend><button type="button" className={`booking-choice ${booking.paymentMethod === 'queue' ? 'selected' : ''}`} onClick={() => chooseBookingMethod('queue')}><strong>Join the queue</strong><span>Book now and pay at the shop</span></button><button type="button" className={`booking-choice ${booking.paymentMethod === 'mpesa' ? 'selected' : ''}`} onClick={() => chooseBookingMethod('mpesa')}><strong>Pay now with M-Pesa</strong><span>Pay {currency(selectedService.price)} by STK Push</span></button></fieldset>{paymentStatus === 'paid' ? <a className="button button-dark submit" href={`${whatsappLink(site.whatsapp)}?text=${encodeURIComponent(`Hi TOP RANKING BARBERS! My M-Pesa payment for ${selectedService.name} is confirmed${paymentReceipt ? ` (receipt ${paymentReceipt})` : ''}. Booking: ${booking.date} at ${booking.time}. Name: ${booking.name}. Phone: ${booking.phone}.`)}`} target="_blank" rel="noreferrer">Send booking on WhatsApp <span>↗</span></a> : <button className="button button-dark submit" type="submit" disabled={isBookingSubmitting || paymentStatus === 'pending'}>{isBookingSubmitting ? 'Please wait…' : paymentStatus === 'pending' ? 'Waiting for M-Pesa confirmation…' : booking.paymentMethod === 'queue' ? 'Continue to WhatsApp' : `SEND M-PESA PROMPT · ${currency(selectedService.price)}`} <span>↗</span></button>}{paymentStatus === 'failed' && <button type="button" className="payment-retry" onClick={() => chooseBookingMethod(booking.paymentMethod)}>Try M-Pesa again</button>}{bookingMessage && <p className="form-message" role="status">{bookingMessage}</p>}</form></div>}
      {adminOpen && (
        <div className={`modal-backdrop admin-backdrop ${adminToken ? 'is-dashboard' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && setAdminOpen(false)}>
          <div className={`modal admin-modal ${adminToken ? 'dashboard-modal' : ''}`}>
            {!adminToken ? <>
              <button type="button" className="close" onClick={() => setAdminOpen(false)}>×</button>
              <p className="eyebrow">Staff only</p>
              <h2>Admin access</h2>
              <form onSubmit={loginAdmin}>
                <label>Username<input required value={admin.username} onChange={(event) => setAdmin({ ...admin, username: event.target.value })} /></label>
                <label>Password<input required type="password" value={admin.password} onChange={(event) => setAdmin({ ...admin, password: event.target.value })} /></label>
                <button className="button button-dark submit">Sign in <span>↗</span></button>
                {adminMessage && <p className="form-message">{adminMessage}</p>}
              </form>
            </> : <>
              <div className="admin-workspace">
                <aside className={`admin-sidebar ${adminNavOpen ? 'is-open' : ''}`}>
                  <a className="admin-brand" href="#admin-overview"><span className="brand-mark"><img src={logoUrl} alt="" /></span><span>TOP RANKING<small>BARBERS · ADMIN</small></span></a>
                  <p className="admin-nav-label">Workspace</p>
                  <nav className="admin-nav" aria-label="Admin navigation">
                    <a href="#admin-overview" onClick={() => { setBookingFilter('all'); setAdminNavOpen(false) }}>Overview / Bookings</a>
                    <a href="#admin-bookings" onClick={() => { setBookingFilter('paid'); setAdminNavOpen(false) }}>Paid (M-Pesa)</a>
                    <a href="#admin-bookings" onClick={() => { setBookingFilter('shop'); setAdminNavOpen(false) }}>Pay in Shop</a>
                    <a href="#admin-add-booking" onClick={() => setAdminNavOpen(false)}>Add Booking</a>
                    <a href="#admin-customer-menu" onClick={() => setAdminNavOpen(false)}>Customer Menu</a>
                  </nav>
                  <a className="admin-live-link" href="#services" onClick={() => setAdminOpen(false)}>↗ View Live Menu</a>
                  <div className="admin-sidebar-foot"><span className="admin-online-dot" />Connected to shop dashboard</div>
                </aside>
                <main className="admin-main">
                  <header className="admin-topbar">
                    <button type="button" className="admin-menu-toggle" aria-label="Toggle admin navigation" aria-expanded={adminNavOpen} onClick={() => setAdminNavOpen((open) => !open)}>☰</button>
                    <span className="admin-topbar-label">Management workspace</span>
                    <button type="button" className="admin-close" onClick={() => setAdminOpen(false)} aria-label="Close admin dashboard">×</button>
                  </header>
                  <div className="admin-content">
                    <section className="admin-overview" id="admin-overview">
                      <div className="dashboard-head"><div><p className="eyebrow">Control room</p><h2>Welcome back.</h2><p className="admin-intro">Here’s what’s happening at your shop today.</p></div><span className="live-badge"><span className="admin-online-dot" /> Live menu</span></div>
                      <div className="admin-stats" aria-label="Booking summary">
                        <article className="admin-stat"><span>Total bookings</span><strong>{allAdminBookings.length}</strong><small>Across all payment types</small></article>
                        <article className="admin-stat"><span>Paid via M-Pesa</span><strong>{paidBookings.length}</strong><small className="stat-accent">{currency(paidRevenue)} collected</small></article>
                        <article className="admin-stat"><span>Coming to pay in shop</span><strong>{shopBookings.length}</strong><small>Pay at the shop</small></article>
                        <article className="admin-stat"><span>Revenue / completed</span><strong>{currency(paidRevenue)}</strong><small>{completedBookings.length} booking{completedBookings.length === 1 ? '' : 's'} completed</small></article>
                      </div>
                    </section>
                    <section className="admin-card bookings-card" id="admin-bookings">
                      <div className="admin-card-heading"><div><p className="eyebrow">Schedule</p><h3>Bookings &amp; queue</h3></div><span className="admin-count">{allAdminBookings.length} total</span></div>
                      <div className="booking-filters" aria-label="Filter bookings">
                        <button type="button" className={bookingFilter === 'all' ? 'selected' : ''} onClick={() => setBookingFilter('all')}>All</button>
                        <button type="button" className={bookingFilter === 'paid' ? 'selected' : ''} onClick={() => setBookingFilter('paid')}>Paid M-Pesa</button>
                        <button type="button" className={bookingFilter === 'shop' ? 'selected' : ''} onClick={() => setBookingFilter('shop')}>Coming to pay in shop</button>
                      </div>
                      <div className="admin-bookings">
                        {visibleBookings.length ? visibleBookings.map((item) => {
                          const paid = item.paymentMethod === 'mpesa' && item.paymentStatus === 'paid'
                          const paymentLabel = item.paymentMethod === 'mpesa'
                            ? `M-Pesa · ${item.paymentStatus || 'pending'}`
                            : 'Pay at shop'
                          return <article className={`admin-booking ${item.done ? 'is-done' : ''}`} key={item.id}>
                            <div className="booking-info">
                              <div className="booking-client"><strong>{item.name}</strong>{item.done && <span className="booking-status">Done</span>}<span className={`booking-payment-status ${paid ? 'is-paid' : ''}`}>{paymentLabel}</span></div>
                              <span className="booking-service">{item.service}</span>
                              <span className="booking-datetime">{item.date} · {item.time}</span>
                              <span className="booking-phone">{item.customerPhone || item.phone}</span>
                            </div>
                            <div className="booking-actions">
                              {paid && <button type="button" onClick={() => setReceiptBooking(item)}>Receipt</button>}
                              <button type="button" onClick={() => markBookingDone(item)}>{item.done ? 'Restore' : 'Mark done'}</button>
                              <button type="button" onClick={() => deleteBooking(item)}>Delete</button>
                            </div>
                          </article>
                        }) : <p className="admin-empty">No bookings in this view.</p>}
                      </div>
                    </section>
                    <section className="admin-card admin-add-card" id="admin-add-booking">
                      <div className="admin-card-heading"><div><p className="eyebrow">Schedule</p><h3>Add a booking</h3></div><span className="admin-card-icon">+</span></div>
                      <form className="admin-booking-form" onSubmit={addAdminBooking}>
                        <div className="admin-form-fields">
                          <label>Client name<input required placeholder="e.g. Alex Mwangi" value={newBooking.name} onChange={(event) => setNewBooking({ ...newBooking, name: event.target.value })} /></label>
                          <label>Phone number<input required type="tel" placeholder="e.g. 0712 345 678" value={newBooking.phone} onChange={(event) => setNewBooking({ ...newBooking, phone: event.target.value })} /></label>
                          <label>Choose service<select required value={newBooking.service} onChange={(event) => setNewBooking({ ...newBooking, service: event.target.value })}><option value="">Choose service</option>{adminData?.services.map((service) => <option key={service.id} value={service.name}>{service.name}</option>)}</select></label>
                          <label>Date<input required type="date" value={newBooking.date} onChange={(event) => setNewBooking({ ...newBooking, date: event.target.value })} /></label>
                          <label>Time<input required type="time" value={newBooking.time} onChange={(event) => setNewBooking({ ...newBooking, time: event.target.value })} /></label>
                        </div>
                        <button className="button button-dark submit">Add booking <span>+</span></button>
                      </form>
                    </section>
                    <section className="admin-card admin-menu-card" id="admin-customer-menu">
                      <div className="admin-card-heading"><div><p className="eyebrow">Website</p><h3>Customer menu</h3></div><button type="button" className="add-menu" onClick={addMenuItem}>+ Add item</button></div>
                      <p className="panel-help">Edit the services, prices, descriptions, and images shown to customers.</p>
                      <form onSubmit={saveServices}>
                        <div className="admin-menu-grid">
                          {adminData?.services.map((service, index) => <div className="menu-editor" key={service.id}>
                            <div className="menu-editor-top"><strong>MENU ITEM 0{index + 1}</strong><button type="button" onClick={() => setAdminData((current) => ({ ...current, services: current.services.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button></div>
                            <label>Service name<input required placeholder="Service name" value={service.name} onChange={(event) => updateMenuItem(index, 'name', event.target.value)} /></label>
                            <label>Description<textarea required placeholder="Description" rows="2" value={service.description} onChange={(event) => updateMenuItem(index, 'description', event.target.value)} /></label>
                            <label>Price<input required type="number" min="0" placeholder="Price in KSh" value={service.price} onChange={(event) => updateMenuItem(index, 'price', event.target.value)} /></label>
                            <label>Image URL<input placeholder="Menu image URL" value={service.image || ''} onChange={(event) => updateMenuItem(index, 'image', event.target.value)} /></label>
                            <label className="menu-image-upload" htmlFor={`menu-image-${index}`}>{uploadingMenuImageIndex === index ? 'Uploading image...' : 'Choose menu image'}<input id={`menu-image-${index}`} type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploadingMenuImageIndex === index} onChange={(event) => uploadMenuImage(index, event)} /></label>
                            {service.image && <img className="menu-image-preview" src={service.image} alt={`${service.name || 'Menu item'} preview`} />}
                          </div>)}
                        </div>
                        <button className="button button-dark submit">Save customer menu <span>↗</span></button>
                      </form>
                    </section>
                    <form className="admin-card gallery-editor" onSubmit={saveImages}>
                      <div className="admin-card-heading"><div><p className="eyebrow">Website</p><h3>Gallery images</h3></div><span className="admin-count">Admin only</span></div>
                      <p className="panel-help">Manage the images displayed in the public shop gallery.</p>
                      <textarea name="urls" aria-label="Gallery image URLs" defaultValue={site.images.map((image) => image.url).join('\n')} rows="3" />
                      <label className="gallery-upload-label" htmlFor="gallery-upload">{isGalleryUploading ? 'Uploading to Cloudinary...' : 'Choose images'}<input id="gallery-upload" className="gallery-upload-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple disabled={isGalleryUploading} onChange={uploadGalleryImage} /></label>
                      <button className="button button-dark submit" disabled={isGalleryUploading}>{isGalleryUploading ? 'Uploading...' : 'Save gallery'} <span>↗</span></button>
                    </form>
                    {adminMessage && <p className="form-message admin-message" role="status">{adminMessage}</p>}
                  </div>
                </main>
              </div>
            </>}
          </div>
        </div>
      )}
      {receiptBooking && <div className="modal-backdrop receipt-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setReceiptBooking(null)}>
        <section className="modal receipt-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
          <button type="button" className="close" onClick={() => setReceiptBooking(null)}>×</button>
          <p className="eyebrow">Payment details</p>
          <h2 id="receipt-title">M-Pesa receipt</h2>
          <dl>
            <dt>Customer</dt><dd>{receiptBooking.name}</dd>
            <dt>Receipt number</dt><dd>{receiptBooking.mpesaReceiptNumber || 'Not provided'}</dd>
            <dt>Message / status</dt><dd>{receiptBooking.resultDescription || receiptBooking.paymentError || receiptBooking.paymentStatus}</dd>
            <dt>Amount</dt><dd>{currency(receiptBooking.paidAmount ?? receiptBooking.amount ?? 0)}</dd>
            <dt>Phone</dt><dd>{receiptBooking.customerPhone || receiptBooking.phone || 'Not provided'}</dd>
            <dt>Time</dt><dd>{receiptBooking.paymentTimestamp || receiptBooking.paidAt || receiptBooking.createdAt ? new Date(receiptBooking.paymentTimestamp || receiptBooking.paidAt || receiptBooking.createdAt).toLocaleString('en-KE') : 'Not provided'}</dd>
          </dl>
        </section>
      </div>}
    </div>
  )
}

export default App
