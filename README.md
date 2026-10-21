# Debtify

A lead management system with real-time updates, role-based access control, and analytics.

## Features

- **Role-Based Access Control** - Super Admin, Admin, Agent1, Agent2
- **Real-time Dashboard** - Live updates with Socket.IO
- **Analytics & Reports** - Lead tracking and metrics
- **Lead Assignment** - Automatic and manual lead distribution
- **Responsive Design** - Works on all devices
- **Secure** - JWT authentication, rate limiting, data sanitization
- **CSV Import/Export** - Bulk lead management
- **Multi-Organization** - Support for multiple organizations

## Tech Stack

### Frontend
- React 18, React Router v6, Tailwind CSS, Socket.IO Client, Axios, React Hot Toast, Recharts

### Backend
- Node.js with Express.js, MongoDB with Mongoose, Socket.IO, JWT, bcryptjs
- Express Rate Limiting, Helmet, CORS for security

## Setup Instructions

### 1. Install Dependencies

```bash
npm run install-all

# Or individually:
cd server && npm install
cd ../client && npm install
```

### 2. Environment Configuration

**server/.env**:
```
MONGODB_URI=mongodb://127.0.0.1:27017/debtify
JWT_SECRET=change_this_to_a_long_random_string
PORT=5000
NODE_ENV=development
```

See [server/.env.example](server/.env.example) for the full list of optional integration variables (GTI, Meta Lead Ads, webhooks, etc).

**client/.env** (optional for local dev — defaults to `http://localhost:5000`):
```
REACT_APP_API_URL=http://localhost:5000
```

### 3. Seed Demo Data

```bash
cd server
npm run seed
```

This creates a demo organization, one user per role, and sample leads.

### 4. Start Development Servers

```bash
# Start both frontend and backend
npm run dev

# Or individually:
npm run server
npm run client
```

## Development URLs

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000/api

## Demo Login Credentials

After running `npm run seed` (password `Demo@1234` for all):

- `superadmin@debtify.com`
- `admin@debtify.com`
- `agent1@debtify.com`
- `agent2@debtify.com`

## User Roles

### Agent 1 (Lead Generator)
- Adds new leads with contact information and debt details
- Leads are auto-categorized by data completeness:
  - **Hot** (80%+ fields completed)
  - **Warm** (50-79% fields completed)
  - **Cold** (<50% fields completed)

### Agent 2 (Lead Follower)
- Views all leads in real-time
- Updates lead status and qualification
- Schedules follow-ups

### Admin
- Real-time dashboard with metrics (total leads, conversion rate, etc.)

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Leads
- `GET /api/leads` - Get all leads (with pagination)
- `POST /api/leads` - Create new lead (Agent 1)
- `PUT /api/leads/:id` - Update lead status (Agent 2)
- `GET /api/leads/dashboard/stats` - Dashboard statistics (Admin)

## Security Features

- JWT token-based authentication
- Password hashing with bcrypt
- Input validation and sanitization
- Rate limiting on API endpoints
- CORS protection
- Security headers with Helmet
- Protected routes based on user roles

## Deployment (debtify.solutions)

The project ships with Dockerfiles for both `server/` and `client/`, a [deploy.sh](deploy.sh) script, and an [nginx/debtify.solutions.conf](nginx/debtify.solutions.conf) reverse-proxy config. The containers bind to `127.0.0.1` only on two internal ports (so they coexist safely with other apps on the same VPS), and Nginx exposes the whole thing under `https://debtify.solutions` on 80/443 — frontend and API share one origin, so there's no CORS to worry about.

One-time setup on a fresh VPS:

1. Point DNS: in GoDaddy, change the `debtify.solutions` (and `www`) A records from "Parked" to this VPS's public IP.
2. Verify ports 7860/7861 are free: `ss -tlnp | grep -E ':7860|:7861'` (change them in `deploy.sh` + the Nginx config together if not).
3. Install the Nginx config and get a TLS cert — see the instructions at the top of `nginx/debtify.solutions.conf`.
4. Place a real `server/.env` on the VPS (not committed to git) with a working `MONGODB_URI` and `CORS_ORIGIN=https://debtify.solutions,https://www.debtify.solutions`.
5. `git pull`, then `bash deploy.sh`.

## License

MIT
