import { useEffect, useState } from 'react'
import './App.css'

const currency = (amount) => `KSh ${Number(amount).toLocaleString('en-KE')}`
const whatsappLink = (number) => `https://wa.me/${number.replace(/\D/g, '')}`

function App() {
  const [site, setSite] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [selectedService, setSelectedService] = useState(null)
  const [booking, setBooking] = useState({ name: '', phone: '', date: '', time: '' })
  const [bookingMessage, setBookingMessage] = useState('')
  const [adminOpen, setAdminOpen] = useState(false)
  const [admin, setAdmin] = useState({ username: '', password: '' })
  const [adminToken, setAdminToken] = useState('')
  const [adminData, setAdminData] = useState(null)
  const [adminMessage, setAdminMessage] = useState('')
  const [newBooking, setNewBooking] = useState({ name: '', phone: '', service: '', date: '', time: '' })

  useEffect(() => {
    fetch('/api/site')
      .then((response) => { if (!response.ok) throw new Error('Unable to load the shop'); return response.json() })
      .then(setSite)
      .catch((error) => setLoadError(error.message))
  }, [])

  const openBooking = (service) => { setSelectedService(service); setBookingMessage('') }

  const openDateTimePicker = (event) => {
    const input = event.target.closest?.('input[type="date"], input[type="time"]')
    if (typeof input?.showPicker === 'function') input.showPicker()
  }

  const submitBooking = async (event) => {
    event.preventDefault()
    setBookingMessage('Sending your booking...')
    const response = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...booking, service: selectedService.name }) })
    const data = await response.json()
    if (!response.ok) return setBookingMessage(data.error)
    const text = `Hi TOP RANKING BARBERS! I would like to book the ${selectedService.name} for ${booking.date} at ${booking.time}. Name: ${booking.name}. Phone: ${booking.phone}.`
    window.open(`${whatsappLink(site.whatsapp)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
    setBookingMessage('Booking prepared. WhatsApp is opening now.')
  }

  const loadAdmin = async (token) => {
    const response = await fetch('/api/admin/bookings', { headers: { Authorization: `Bearer ${token}` } })
    if (response.ok) setAdminData({ bookings: await response.json(), services: site.services })
  }

  const loginAdmin = async (event) => {
    event.preventDefault()
    const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(admin) })
    const data = await response.json()
    if (!response.ok) return setAdminMessage(data.error)
    setAdminToken(data.token); setAdminMessage(''); loadAdmin(data.token)
  }

  const saveImages = async (event) => {
    event.preventDefault()
    const images = event.target.urls.value.split('\n').map((url) => ({ url: url.trim() })).filter((image) => image.url)
    const response = await fetch('/api/admin/images', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ images }) })
    const data = await response.json()
    if (response.ok) { setSite((current) => ({ ...current, images: data.images })); setAdminMessage('Gallery updated.') }
  }

  const addAdminBooking = async (event) => {
    event.preventDefault()
    const response = await fetch('/api/admin/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify(newBooking) })
    const data = await response.json()
    if (!response.ok) return setAdminMessage(data.error)
    setAdminData((current) => ({ ...current, bookings: [data.booking, ...current.bookings] }))
    setNewBooking({ name: '', phone: '', service: '', date: '', time: '' })
    setAdminMessage('Booking added to the schedule.')
  }

  const updateMenuItem = (index, field, value) => setAdminData((current) => ({ ...current, services: current.services.map((service, itemIndex) => itemIndex === index ? { ...service, [field]: value } : service) }))

  const saveServices = async (event) => {
    event.preventDefault()
    const response = await fetch('/api/admin/services', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ services: adminData.services }) })
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
        <section className="hero wrap"><div className="hero-copy"><p className="eyebrow">Est. 2024 · {site.location}</p><h1>Your next<br /><i>great</i> cut.</h1><p className="hero-text">A modern barbershop for people who know that details make the difference.</p><a className="button button-dark" href="#services">Explore services <span>↓</span></a></div><div className="hero-image"><img src={site.images[0]?.url} alt={site.images[0]?.alt} /><span className="image-note">01 / the chair</span></div><div className="hero-stamp">S<br /><small>since<br />2024</small></div></section>
        <section className="marquee"><div>precision <span>✦</span> personality <span>✦</span> good energy <span>✦</span> precision <span>✦</span> personality <span>✦</span> good energy <span>✦</span></div></section>
        <section id="services" className="section wrap"><div className="section-heading"><div><p className="eyebrow">01 / Customer menu</p><h2>Keep it <i>fresh.</i></h2></div><p>Current prices and styles.<br />Pick your finish.</p></div><div className="service-grid">{site.services.map((service, index) => <article className={`service-card ${index === 0 ? 'featured' : ''}`} key={service.id}><img className="service-image" src={service.image || site.images[index % site.images.length]?.url} alt={`${service.name} style`} /><span className="service-number">0{index + 1}</span><h3>{service.name}</h3><p>{service.description}</p><div className="service-bottom"><strong>{currency(service.price)}</strong><button onClick={() => openBooking(service)}>Book now <span>↗</span></button></div></article>)}</div></section>
        <section id="gallery" className="gallery-section"><div className="wrap section-heading"><div><p className="eyebrow">02 / The look</p><h2>Made to be <i>seen.</i></h2></div><p>Every cut leaves the chair<br />with its own signature.</p></div><div className="gallery wrap">{site.images.map((image) => <img key={image.id} src={image.url} alt={image.alt} />)}</div></section>
        <section id="visit" className="visit wrap"><div><p className="eyebrow">03 / Find us</p><h2>Come through.<br /><i>Leave sharper.</i></h2></div><div className="visit-details"><p>We are ready when you are.<br />Walk-ins welcome, bookings preferred.</p><a className="button button-dark" href={whatsappLink(site.whatsapp)} target="_blank" rel="noreferrer">WhatsApp us <span>↗</span></a><p className="contact">+254 710 865 376<br />{site.location}</p></div></section>
      </main>
      <footer className="footer wrap"><span>TOP RANKING BARBERS</span><span>Sharp minds. Sharper cuts.</span><button onClick={() => setAdminOpen(true)}>Staff access</button></footer>
      {selectedService && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedService(null)}><form className="modal booking-modal" onSubmit={submitBooking}><button type="button" className="close" onClick={() => setSelectedService(null)}>×</button><p className="eyebrow">Book your chair</p><h2>{selectedService.name}</h2><p className="modal-price">{currency(selectedService.price)}</p><label>Name<input required value={booking.name} onChange={(event) => setBooking({ ...booking, name: event.target.value })} /></label><label>Phone number<input required type="tel" value={booking.phone} onChange={(event) => setBooking({ ...booking, phone: event.target.value })} /></label><div className="form-row"><label>Date<input required type="date" value={booking.date} onChange={(event) => setBooking({ ...booking, date: event.target.value })} /></label><label>Time<input required type="time" value={booking.time} onChange={(event) => setBooking({ ...booking, time: event.target.value })} /></label></div><button className="button button-dark submit" type="submit">Continue to WhatsApp <span>↗</span></button>{bookingMessage && <p className="form-message">{bookingMessage}</p>}</form></div>}
      {adminOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setAdminOpen(false)}><div className={`modal admin-modal ${adminToken ? 'dashboard-modal' : ''}`}><button type="button" className="close" onClick={() => setAdminOpen(false)}>×</button>{!adminToken ? <><p className="eyebrow">Staff only</p><h2>Admin access</h2><form onSubmit={loginAdmin}><label>Username<input required value={admin.username} onChange={(event) => setAdmin({ ...admin, username: event.target.value })} /></label><label>Password<input required type="password" value={admin.password} onChange={(event) => setAdmin({ ...admin, password: event.target.value })} /></label><button className="button button-dark submit">Sign in <span>↗</span></button>{adminMessage && <p className="form-message">{adminMessage}</p>}</form></> : <><div className="dashboard-head"><div><p className="eyebrow">Control room</p><h2>Welcome to Top Ranking.</h2></div><span className="live-badge">Live menu</span></div><div className="dashboard-grid"><section className="dashboard-panel"><div className="panel-heading"><h3>Bookings</h3><span>{adminData?.bookings.length || 0} total</span></div><form className="admin-booking-form" onSubmit={addAdminBooking}><p className="panel-label">Add a booking</p><div className="form-row"><input required placeholder="Client name" value={newBooking.name} onChange={(event) => setNewBooking({ ...newBooking, name: event.target.value })} /><input required placeholder="Phone number" value={newBooking.phone} onChange={(event) => setNewBooking({ ...newBooking, phone: event.target.value })} /></div><div className="form-row"><select required value={newBooking.service} onChange={(event) => setNewBooking({ ...newBooking, service: event.target.value })}><option value="">Choose service</option>{adminData?.services.map((service) => <option key={service.id} value={service.name}>{service.name}</option>)}</select><input required type="date" value={newBooking.date} onChange={(event) => setNewBooking({ ...newBooking, date: event.target.value })} /><input required type="time" value={newBooking.time} onChange={(event) => setNewBooking({ ...newBooking, time: event.target.value })} /></div><button className="button button-dark submit">Add booking <span>+</span></button></form><div className="admin-bookings">{adminData?.bookings.length ? adminData.bookings.map((item) => <p key={item.id}><strong>{item.name}</strong> · {item.service}<br />{item.date} at {item.time} · {item.phone}</p>) : <p>No bookings yet.</p>}</div></section><section className="dashboard-panel"><div className="panel-heading"><h3>Customer menu</h3><button type="button" className="add-menu" onClick={addMenuItem}>+ Add item</button></div><p className="panel-help">Edit prices, descriptions, and images customers see on the website.</p><form onSubmit={saveServices}>{adminData?.services.map((service, index) => <div className="menu-editor" key={service.id}><div className="menu-editor-top"><strong>0{index + 1}</strong><button type="button" onClick={() => setAdminData((current) => ({ ...current, services: current.services.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button></div><input required placeholder="Service name" value={service.name} onChange={(event) => updateMenuItem(index, 'name', event.target.value)} /><textarea required placeholder="Description" rows="2" value={service.description} onChange={(event) => updateMenuItem(index, 'description', event.target.value)} /><input required type="number" min="0" placeholder="Price in R" value={service.price} onChange={(event) => updateMenuItem(index, 'price', event.target.value)} /><input placeholder="Menu image URL" value={service.image || ''} onChange={(event) => updateMenuItem(index, 'image', event.target.value)} /></div>)}<button className="button button-dark submit">Save customer menu <span>↗</span></button></form></section></div><form className="gallery-editor" onSubmit={saveImages}><div className="panel-heading"><h3>Gallery images</h3><span>Admin only</span></div><textarea name="urls" defaultValue={site.images.map((image) => image.url).join('\n')} rows="3" /><button className="button button-dark submit">Save gallery <span>↗</span></button></form>{adminMessage && <p className="form-message">{adminMessage}</p>}</>}</div></div>}
    </div>
  )
}

export default App
