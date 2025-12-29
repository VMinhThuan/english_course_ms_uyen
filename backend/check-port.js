import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function checkPort(port) {
    try {
        const { stdout } = await execAsync(`lsof -ti:${port}`);
        return stdout.trim().split('\n').filter(Boolean);
    } catch (error) {
        return [];
    }
}

async function main() {
    const port3000 = await checkPort(3000);
    const port5000 = await checkPort(5000);

    console.log('\n📊 Port Status:');
    console.log(`Port 3000: ${port3000.length > 0 ? '✅ In use (PIDs: ' + port3000.join(', ') + ')' : '❌ Not in use'}`);
    console.log(`Port 5000: ${port5000.length > 0 ? '⚠️  In use (PIDs: ' + port5000.join(', ') + ')' : '✅ Not in use'}`);

    if (port5000.length > 0 && port3000.length === 0) {
        console.log('\n⚠️  WARNING: Backend might be running on port 5000 instead of 3000!');
        console.log('💡 Please restart backend to use port 3000:');
        console.log('   cd backend && npm run dev');
    } else if (port3000.length > 0) {
        console.log('\n✅ Backend should be running on port 3000');
    } else {
        console.log('\n❌ No backend detected. Please start backend:');
        console.log('   cd backend && npm run dev');
