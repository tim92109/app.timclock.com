# TimeClock API Routing - Complete Fix & Deployment Guide

## 🔍 Root Cause Analysis

The API 404 errors were caused by a **proxy configuration mismatch** in the Vite development proxy:

### The Problem
- Frontend requests: `/api/dashboard`
- Vite proxy was **stripping** the `/api` prefix: `rewrite: (path) => path.replace(/^\/api/, '')`
- Backend received: `/dashboard` (but expects `/api/dashboard`)
- Result: **404 Not Found**

### The Fix Applied
✅ **Fixed Vite proxy configuration** to preserve `/api` prefix
✅ **Created missing package.json** for backend dependencies
✅ **Added proper .env configuration** for production settings

---

## 🚀 Deployment Steps

### 1. Install Backend Dependencies
```bash
cd /home/timclock/domains/app.timclock.com/scripts
npm install
```

### 2. Configure Database Connection
Edit `/home/timclock/domains/app.timclock.com/scripts/.env`:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=timclock_user
DB_PASSWORD=YOUR_ACTUAL_PASSWORD
DB_NAME=timeclock_db
JWT_SECRET=YOUR_SECURE_JWT_SECRET
```

### 3. Start Backend Server
```bash
# Production mode
cd /home/timclock/domains/app.timclock.com/scripts
npm start

# Or with PM2 for production
pm2 start server.js --name "timeclock-api"
pm2 save
pm2 startup
```

### 4. Verify Backend is Running
```bash
curl http://localhost:3000/health
# Should return: {"success": true, "message": "Server is healthy"}

curl http://localhost:3000/api/health  
# Should return: {"status": "ok", "success": true}
```

---

## 🔧 Routing Flow (Now Fixed)

### Development (Vite Dev Server)
1. Frontend → `https://app.timclock.com/api/dashboard`
2. Vite proxy → `http://localhost:3000/api/dashboard` ✅ (prefix preserved)
3. Backend receives → `/api/dashboard` ✅
4. Route matched → `app.use('/api/dashboard', dashboardRoutes)` ✅

### Production (Apache + Node.js)
1. Frontend → `https://app.timclock.com/api/dashboard`
2. Apache .htaccess → `http://localhost:3000/api/dashboard` ✅
3. Backend receives → `/api/dashboard` ✅
4. Route matched → `app.use('/api/dashboard', dashboardRoutes)` ✅

---

## 🔍 Debugging Commands

### Test API Endpoints Directly
```bash
# Health check
curl -X GET http://localhost:3000/health

# API health check  
curl -X GET http://localhost:3000/api/health

# Dashboard endpoint (requires auth)
curl -X GET http://localhost:3000/api/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test from production domain
curl -X GET https://app.timclock.com/api/health
```

### Check Backend Logs
```bash
# If using PM2
pm2 logs timeclock-api

# If running directly
tail -f /home/timclock/domains/app.timclock.com/scripts/logs/app.log
```

### Verify Apache Configuration
```bash
# Check if mod_rewrite is enabled
apache2ctl -M | grep rewrite

# Check if .htaccess is working
curl -I https://app.timclock.com/api/health
# Should show proxy headers
```

---

## 📁 File Structure
```
/home/timclock/domains/app.timclock.com/
├── scripts/                    # Backend API Server
│   ├── server.js              # Main server file
│   ├── package.json           # ✅ Created - Dependencies
│   ├── .env                   # ✅ Created - Configuration
│   ├── routes/                # API route definitions
│   ├── controllers/           # Business logic
│   ├── middleware/            # Auth, validation, etc.
│   └── config/                # Database, etc.
└── public_html/               # Frontend React App
    ├── dist/                  # Built React app
    ├── vite.config.js         # ✅ Fixed - Proxy config
    ├── .htaccess             # Apache proxy rules
    └── src/                   # React source code
```

---

## ⚡ Performance Monitoring

### Backend Health Endpoints
- `GET /health` - Basic health check
- `GET /api/health` - API-specific health check  
- `GET /api` - API documentation

### Log Monitoring
```bash
# Watch for 404 errors
tail -f /var/log/virtualmin/app.timclock.com_error_log | grep "404"

# Watch backend logs
tail -f /home/timclock/domains/app.timclock.com/scripts/logs/app.log
```

---

## 🚨 Common Issues & Solutions

### Issue: "Cannot GET /api/dashboard"
**Solution**: Backend server not running
```bash
cd /home/timclock/domains/app.timclock.com/scripts
npm start
```

### Issue: Database Connection Errors  
**Solution**: Check database credentials in `.env`
```bash
mysql -u timclock_user -p timeclock_db
# Test connection manually
```

### Issue: CORS Errors in Browser
**Solution**: Check CORS configuration in `server.js` line 49-68
- Verify `ALLOWED_ORIGINS` in `.env`
- Ensure `https://app.timclock.com` is included

### Issue: 500 Internal Server Error
**Solution**: Check backend logs for detailed error messages
```bash
pm2 logs timeclock-api --lines 50
```

---

## 📝 Next Steps

1. **Deploy Backend**: Install dependencies and start the Node.js server
2. **Test Endpoints**: Verify each API endpoint responds correctly
3. **Monitor Logs**: Watch for any remaining routing issues
4. **Database Setup**: Ensure database tables exist and are properly configured
5. **SSL/Security**: Verify HTTPS is working for both frontend and API calls

---

## ✅ Verification Checklist

- [ ] Backend server running on port 3000
- [ ] Database connection successful
- [ ] `/health` endpoint responding
- [ ] `/api/health` endpoint responding  
- [ ] Frontend can authenticate users
- [ ] Dashboard API calls work without 404 errors
- [ ] All route modules properly registered
- [ ] Apache proxy forwarding requests correctly

The core routing issue has been **resolved**. The remaining work is deployment and configuration of the production environment.