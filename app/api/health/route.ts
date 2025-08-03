import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';

// 🩺 系统健康检查 API
export async function GET(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const healthData = {
      timestamp: new Date().toISOString(),
      system: await getSystemInfo(),
      tools: await checkToolsAvailability(),
      performance: await getPerformanceMetrics(),
      storage: await getStorageInfo(),
      status: 'healthy'
    };
    
    const totalTime = Date.now() - startTime;
    healthData.performance.healthCheckTime = totalTime;
    
    return NextResponse.json(healthData);
  } catch (error) {
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'unhealthy',
      error: (error as Error).message,
      healthCheckTime: Date.now() - startTime
    }, { status: 500 });
  }
}

// 📊 系统信息
async function getSystemInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    cpuCores: os.cpus().length,
    totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 100) / 100, // GB
    freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024 * 100) / 100, // GB
    loadAverage: os.loadavg(),
    uptime: os.uptime()
  };
}

// 🔧 工具可用性检查
async function checkToolsAvailability() {
  const tools = {
    ytdlp: false,
    ffmpeg: false,
    versions: {} as Record<string, string>
  };
  
  // 检查 yt-dlp
  try {
    const ytdlpVersion = await execCommand('yt-dlp', ['--version']);
    tools.ytdlp = true;
    tools.versions.ytdlp = ytdlpVersion.trim();
  } catch (error) {
    console.error('yt-dlp 不可用:', error);
  }
  
  // 检查 ffmpeg
  try {
    const ffmpegVersion = await execCommand('ffmpeg', ['-version']);
    tools.ffmpeg = true;
    const versionMatch = ffmpegVersion.match(/ffmpeg version (\S+)/);
    tools.versions.ffmpeg = versionMatch ? versionMatch[1] : 'unknown';
  } catch (error) {
    console.error('ffmpeg 不可用:', error);
  }
  
  return tools;
}

// 📈 性能指标
async function getPerformanceMetrics() {
  const metrics = {
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage(),
    eventLoopDelay: 0,
    processUptime: process.uptime()
  };
  
  // 简单的事件循环延迟测试
  const start = Date.now();
  await new Promise(resolve => setImmediate(resolve));
  metrics.eventLoopDelay = Date.now() - start;
  
  return metrics;
}

// 💾 存储信息
async function getStorageInfo() {
  const tempPath = path.join(process.cwd(), 'public', 'temp');
  
  let fileCount = 0;
  let totalSize = 0;
  
  try {
    if (fs.existsSync(tempPath)) {
      const files = fs.readdirSync(tempPath);
      fileCount = files.length;
      
      for (const file of files) {
        const filePath = path.join(tempPath, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      }
    }
  } catch (error) {
    console.error('读取存储信息失败:', error);
  }
  
  return {
    tempPath,
    fileCount,
    totalSize: Math.round(totalSize / 1024 / 1024 * 100) / 100, // MB
    diskSpace: await getDiskSpace()
  };
}

// 💽 磁盘空间检查
async function getDiskSpace() {
  try {
    if (os.platform() === 'darwin' || os.platform() === 'linux') {
      const output = await execCommand('df', ['-h', '.']);
      const lines = output.split('\n');
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        return {
          total: parts[1],
          used: parts[2],
          available: parts[3],
          usePercent: parts[4]
        };
      }
    }
  } catch (error) {
    console.error('获取磁盘空间失败:', error);
  }
  
  return null;
}

// 🔨 执行命令辅助函数
function execCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args);
    let output = '';
    let error = '';
    
    process.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`命令执行失败: ${command} ${args.join(' ')}\n${error}`));
      }
    });
    
    process.on('error', (err) => {
      reject(err);
    });
    
    // 5秒超时
    setTimeout(() => {
      process.kill('SIGTERM');
      reject(new Error('命令执行超时'));
    }, 5000);
  });
}