// Script để kiểm tra file .env
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(
    import.meta.url);
const __dirname = dirname(__filename);

const envPath = join(__dirname, '.env');

console.log('🔍 Checking .env file...\n');

if (!existsSync(envPath)) {
    console.error('❌ File .env does not exist!');
    console.error(`📝 Please create .env file at: ${envPath}`);
    process.exit(1);
}

console.log('✅ File .env exists\n');

// Load .env
dotenv.config({ path: envPath });

// Check required variables
const requiredVars = [
    'MONGODB_URI',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'PORT',
    'NODE_ENV',
    'FRONTEND_URL'
];

console.log('📋 Checking required environment variables:\n');

let hasErrors = false;

requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (!value) {
        console.error(`❌ ${varName}: NOT SET`);
        hasErrors = true;
    } else {
        // Mask sensitive values
        let displayValue = value;
        if (varName.includes('SECRET') || varName.includes('PASSWORD')) {
            displayValue = value.substring(0, 10) + '...' + (value.length > 20 ? '(hidden)' : '');
        } else if (varName === 'MONGODB_URI') {
            // Mask password in MongoDB URI
            displayValue = value.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@');
        }
        console.log(`✅ ${varName}: ${displayValue}`);
    }
});

console.log('\n');

if (hasErrors) {
    console.error('❌ Some required environment variables are missing!');
    console.error('📖 Please check MONGODB_SETUP.md for instructions');
    process.exit(1);
} else {
    console.log('✅ All required environment variables are set!');
    console.log('🚀 You can now run: npm start');
}
