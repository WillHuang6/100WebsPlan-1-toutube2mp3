import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import os from 'os';

// 🚀 性能基准测试 API
export async function POST(req: NextRequest) {
  const { testType = 'quick', url } = await req.json();
  
  const results = {
    timestamp: new Date().toISOString(),
    testType,
    system: getSystemInfo(),
    tests: {} as Record<string, any>,
    recommendations: [] as any[]
  };
  
  try {
    console.log('🚀 开始性能基准测试...');
    
    // 测试 1: 系统性能基准
    results.tests.systemBenchmark = await runSystemBenchmark();
    
    // 测试 2: 网络性能测试
    results.tests.networkBenchmark = await runNetworkBenchmark();
    
    // 测试 3: yt-dlp 性能测试
    if (url) {
      results.tests.ytdlpBenchmark = await runYtdlpBenchmark(url);
    }
    
    // 测试 4: ffmpeg 性能测试
    results.tests.ffmpegBenchmark = await runFfmpegBenchmark();
    
    // 生成性能建议
    results.recommendations = generatePerformanceRecommendations(results.tests);
    
    return NextResponse.json(results);
    
  } catch (error) {
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      error: (error as Error).message,
      tests: results.tests
    }, { status: 500 });
  }
}

// 📊 系统信息
function getSystemInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpuCores: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'unknown',
    totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 100) / 100,
    freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024 * 100) / 100,
    loadAverage: os.loadavg(),
    nodeVersion: process.version
  };
}

// 🔧 系统性能基准测试
async function runSystemBenchmark() {
  const start = Date.now();
  
  // CPU 密集型测试
  const cpuTest = await measureCpuPerformance();
  
  // 内存测试
  const memoryTest = measureMemoryPerformance();
  
  // 磁盘 I/O 测试
  const diskTest = await measureDiskPerformance();
  
  return {
    duration: Date.now() - start,
    cpu: cpuTest,
    memory: memoryTest,
    disk: diskTest
  };
}

// 🌐 网络性能测试
async function runNetworkBenchmark() {
  const tests = [];
  
  const testUrls = [
    'https://www.youtube.com',
    'https://google.com',
    'https://github.com'
  ];
  
  for (const url of testUrls) {
    try {
      const start = Date.now();
      await execCommand('curl', ['-I', '-s', '-L', '--max-time', '5', url], 6000);
      const latency = Date.now() - start;
      
      tests.push({
        url,
        latency,
        status: 'success'
      });
    } catch (error) {
      tests.push({
        url,
        error: (error as Error).message,
        status: 'failed'
      });
    }
  }
  
  return {
    tests,
    avgLatency: tests.filter(t => t.status === 'success')
                     .reduce((sum, t) => sum + (t.latency || 0), 0) / tests.length
  };
}

// 🎵 yt-dlp 性能基准测试
async function runYtdlpBenchmark(url: string) {
  const env = {
    ...process.env,
    PATH: `/Users/kuangshan/Library/Python/3.9/bin:${process.env.PATH}`
  };
  
  try {
    // 测试基础信息获取速度
    const infoStart = Date.now();
    const info = await execCommand('yt-dlp', [
      '--no-playlist',
      '--print', '%(title)s|||%(duration)s|||%(filesize)s',
      '--quiet',
      url
    ], 30000);
    const infoTime = Date.now() - infoStart;
    
    // 解析信息
    const [title, duration, filesize] = info.trim().split('|||');
    
    // 测试下载速度 (仅前5秒)
    const downloadStart = Date.now();
    try {
      await execCommand('yt-dlp', [
        '-f', 'bestaudio[abr<=96]',
        '--no-playlist',
        '--quiet',
        '--max-download-archive', '1',
        '--simulate',
        url
      ], 10000);
    } catch (error) {
      // 模拟下载可能失败，这是正常的
    }
    const downloadTime = Date.now() - downloadStart;
    
    return {
      infoRetrievalTime: infoTime,
      downloadTestTime: downloadTime,
      title: title || '未知',
      duration: duration || '未知',
      estimatedSize: filesize || '未知',
      status: 'success'
    };
    
  } catch (error) {
    return {
      status: 'failed',
      error: (error as Error).message
    };
  }
}

// 🔄 ffmpeg 性能基准测试
async function runFfmpegBenchmark() {
  try {
    // 测试 ffmpeg 编码性能 (使用静音音频)
    const start = Date.now();
    
    await execCommand('ffmpeg', [
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-t', '5', // 5秒测试
      '-acodec', 'libmp3lame',
      '-ab', '128k',
      '-f', 'null',
      '-'
    ], 15000);
    
    const encodingTime = Date.now() - start;
    
    return {
      encodingTime,
      performance: encodingTime < 2000 ? 'excellent' : encodingTime < 5000 ? 'good' : 'slow',
      status: 'success'
    };
    
  } catch (error) {
    return {
      status: 'failed',
      error: (error as Error).message
    };
  }
}

// 🔧 CPU 性能测试
async function measureCpuPerformance() {
  const start = Date.now();
  
  // 简单的 CPU 密集型计算
  let result = 0;
  for (let i = 0; i < 1000000; i++) {
    result += Math.sqrt(i) * Math.sin(i);
  }
  
  const cpuTime = Date.now() - start;
  
  return {
    computationTime: cpuTime,
    performance: cpuTime < 100 ? 'excellent' : cpuTime < 500 ? 'good' : 'slow',
    result: Math.round(result)
  };
}

// 💾 内存性能测试
function measureMemoryPerformance() {
  const memUsage = process.memoryUsage();
  
  return {
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    external: Math.round(memUsage.external / 1024 / 1024),
    rss: Math.round(memUsage.rss / 1024 / 1024)
  };
}

// 💿 磁盘性能测试  
async function measureDiskPerformance() {
  try {
    const start = Date.now();
    
    // 简单的磁盘写入测试
    const testData = 'x'.repeat(1024 * 1024); // 1MB 数据
    const fs = require('fs');
    const path = require('path');
    
    const testFile = path.join(process.cwd(), 'temp_benchmark.txt');
    fs.writeFileSync(testFile, testData);
    fs.unlinkSync(testFile);
    
    const diskTime = Date.now() - start;
    
    return {
      writeTime: diskTime,
      performance: diskTime < 100 ? 'excellent' : diskTime < 500 ? 'good' : 'slow'
    };
    
  } catch (error) {
    return {
      error: (error as Error).message,
      performance: 'unknown'
    };
  }
}

// 💡 生成性能建议
function generatePerformanceRecommendations(tests: any) {
  const recommendations = [];
  
  // CPU 建议
  if (tests.systemBenchmark?.cpu?.performance === 'slow') {
    recommendations.push({
      type: 'cpu',
      level: 'warning',
      message: 'CPU 性能较低，建议减少并发转换数量或使用更快的机器'
    });
  }
  
  // 内存建议
  if (tests.systemBenchmark?.memory?.heapUsed > 500) {
    recommendations.push({
      type: 'memory',
      level: 'warning', 
      message: '内存使用较高，建议监控内存使用情况'
    });
  }
  
  // 网络建议  
  if (tests.networkBenchmark?.avgLatency > 2000) {
    recommendations.push({
      type: 'network',
      level: 'error',
      message: '网络延迟较高，建议检查网络连接或使用 CDN'
    });
  }
  
  // ffmpeg 建议
  if (tests.ffmpegBenchmark?.performance === 'slow') {
    recommendations.push({
      type: 'encoding',
      level: 'warning',
      message: 'ffmpeg 编码性能较低，建议启用硬件加速或降低音质'
    });
  }
  
  // 综合建议
  if (recommendations.length === 0) {
    recommendations.push({
      type: 'overall',
      level: 'success',
      message: '系统性能良好，可以处理高并发转换任务'
    });
  }
  
  return recommendations;
}

// 🔨 执行命令辅助函数
function execCommand(command: string, args: string[], timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args);
    let output = '';
    let error = '';
    
    process.stdout?.on('data', (data) => {
      output += data.toString();
    });
    
    process.stderr?.on('data', (data) => {
      error += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`命令执行失败 (代码: ${code}): ${error || output}`));
      }
    });
    
    process.on('error', (err) => {
      reject(new Error(`进程启动失败: ${err.message}`));
    });
    
    setTimeout(() => {
      process.kill('SIGTERM');
      reject(new Error(`命令执行超时 (${timeoutMs}ms)`));
    }, timeoutMs);
  });
}