# TOP RANKING BARBERS

## Run locally

Start the backend first so the client can load the shop content and images before rendering. The backend now stores shop content and bookings in MongoDB.

```bash
cd backend
npm install
# Copy .env.example to .env and set MONGODB_URI before starting
npm run dev
```

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Open the Vite URL shown in the terminal. TOP RANKING BARBERS is located at `Kasarani, Mwiki, Mlima Stage`. Clients can browse services, submit a booking, and continue directly to WhatsApp at `+254710865376`. Bookings are stored by the backend for the current server session.

Admin access is available from the `Admin` link. Configure credentials with `ADMIN_USERNAME` and `ADMIN_PASSWORD` in the private `backend/.env` file.

Prices are displayed in Kenyan shillings (`KSh`). Only authenticated admin requests can read or add bookings, update the gallery, or edit the customer menu. The dashboard can add, rename, describe, price, and remove shave, braiding, haircut, or other service items. Once saved, the public service cards use the updated menu immediately. Set `MONGODB_URI`, `MONGODB_DB_NAME`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `WHATSAPP_NUMBER`, and `PORT` environment variables to change the defaults.

The first MongoDB startup imports existing local `site-data.json` content when the `site` collection is empty. Keep `backend/.env` private and rotate the MongoDB password if the connection string has been shared publicly.