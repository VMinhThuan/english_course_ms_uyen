// Script để kill process đang dùng port 5000
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function killPort(port) {
  try {
    // Tìm process đang dùng port
    const { stdout } = await execAsync(`lsof -ti:${port}`);
    const pids = stdout.trim().split('\n').filter(pid => pid);
    
    if (pids.length === 0) {
      console.log(`✅ Port ${port} is not in use`);
      return;
    }
    
    console.log(`🔍 Found ${pids.length} process(es) using port ${port}:`);
    pids.forEach(pid => console.log(`   PID: ${pid}`));
    
    // Kill processes
    for (const pid of pids) {
      try {
        await execAsync(`kill -9 ${pid}`);
        console.log(`✅ Killed process ${pid}`);
      } catch (error) {
        console.error(`❌ Failed to kill process ${pid}:`, error.message);
      }
    }
    
    console.log(`\n✅ Port ${port} is now free`);
  } catch (error) {
    if (error.message.includes('lsof')) {
      console.log(`✅ Port ${port} is not in use`);
    } else {
      console.error(`❌ Error:`, error.message);
    }
  }
}

// Kill port 5000 (old port)
killPort(5000);

