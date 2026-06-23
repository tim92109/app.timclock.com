#!/bin/bash

# TimeClock Setup Script
echo "🚀 Setting up TimeClock Application..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "server.js" ]; then
    print_error "Please run this script from the scripts directory"
    exit 1
fi

# Step 1: Install dependencies
print_status "Installing Node.js dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
    if [ $? -eq 0 ]; then
        print_status "Dependencies installed successfully"
    else
        print_error "Failed to install dependencies"
        exit 1
    fi
else
    print_status "Dependencies already installed"
fi

# Step 2: Check environment file
if [ ! -f ".env" ]; then
    print_error ".env file not found. Please create it with your database credentials."
    exit 1
else
    print_status "Environment file found"
fi

# Step 3: Database setup
print_warning "Database Setup Required:"
echo "1. Make sure MySQL is running"
echo "2. Create a database user 'timclock' with appropriate permissions"
echo "3. Run the database setup script:"
echo "   mysql -u root -p < setup-database.sql"
echo ""
echo "Or manually create the database and run:"
echo "   mysql -u timclock -p timeclock_db < setup-database.sql"
echo ""

# Step 4: Create logs directory
mkdir -p logs
print_status "Logs directory created"

# Step 5: Test database connection
print_status "Testing database connection..."
node -e "
const db = require('./config/database');
db.testConnection().then(success => {
    if (success) {
        console.log('✅ Database connection successful');
        process.exit(0);
    } else {
        console.log('❌ Database connection failed');
        process.exit(1);
    }
}).catch(err => {
    console.log('❌ Database connection error:', err.message);
    process.exit(1);
});
" 2>/dev/null

if [ $? -eq 0 ]; then
    print_status "Database connection test passed"
else
    print_error "Database connection test failed"
    print_warning "Please check your database configuration in .env file"
    echo ""
    echo "Required database setup:"
    echo "1. Create MySQL database: timeclock_db"
    echo "2. Create MySQL user: timclock"
    echo "3. Grant permissions to timclock user"
    echo "4. Run: mysql -u timclock -p timeclock_db < setup-database.sql"
    echo ""
    exit 1
fi

# Step 6: Start the application
print_status "Setup completed successfully!"
echo ""
echo "🎉 TimeClock API is ready to start!"
echo ""
echo "To start the application:"
echo "  Development: npm run dev"
echo "  Production:  ./start-production.sh"
echo ""
echo "Default admin credentials:"
echo "  Username: admin"
echo "  Password: admin123"
echo ""
echo "API will be available at: http://localhost:3000"
echo "Health check: http://localhost:3000/health"
echo ""