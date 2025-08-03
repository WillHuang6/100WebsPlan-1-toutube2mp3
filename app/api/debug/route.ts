import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

// 🔧 调试和诊断工具 API
export async function POST(req: NextRequest) {
  const { url, testParams = false } = await req.json();
  
  if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
    return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
  }
  
  const results = {
    timestamp: new Date().toISOString(),
    url,
    tests: {} as Record<string, any>
  };
  
  try {
    // 测试 1: 检查工具可用性
    results.tests.toolsAvailable = await testToolsAvailability();
    
    // 测试 2: 基础 URL 信息获取
    results.tests.videoInfo = await testVideoInfo(url);
    
    // 测试 3: 参数兼容性测试 (可选)
    if (testParams) {
      results.tests.parameterTests = await testParameterCompatibility(url);
    }
    
    // 测试 4: 网络连接测试
    results.tests.networkTest = await testNetworkConnectivity(url);
    
    return NextResponse.json(results);
    
  } catch (error) {
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      url,
      error: (error as Error).message,
      tests: results.tests
    }, { status: 500 });
  }
}

// 🔧 测试工具可用性
async function testToolsAvailability() {
  const tools = { 
    ytdlp: false, 
    ffmpeg: false, 
    versions: {} as Record<string, string>,
    capabilities: {} as Record<string, boolean>
  };
  
  const env = {
    ...process.env,
    PATH: `/Users/kuangshan/Library/Python/3.9/bin:${process.env.PATH}`
  };
  
  try {
    const ytdlpVersion = await execCommand('yt-dlp', ['--version'], 3000);
    tools.ytdlp = true;
    tools.versions.ytdlp = ytdlpVersion.trim();
    
    // 检查参数支持
    try {
      const helpOutput = await execCommand('yt-dlp', ['--help'], 5000);
      tools.capabilities.supportsFragmentRetries = helpOutput.includes('--fragment-retries');
      tools.capabilities.supportsConcurrentFragments = helpOutput.includes('--concurrent-fragments');
      tools.capabilities.supportsHttpChunkSize = helpOutput.includes('--http-chunk-size');
      tools.capabilities.supportsExtractFlat = helpOutput.includes('--extract-flat');
      tools.capabilities.supportsPreferFreeFormats = helpOutput.includes('--prefer-free-formats');
    } catch (error) {
      console.warn('无法检查 yt-dlp 参数支持');
    }
    
  } catch (error) {
    tools.versions.ytdlp = `错误: ${(error as Error).message}`;
  }
  
  try {
    const ffmpegVersion = await execCommand('ffmpeg', ['-version'], 3000);
    tools.ffmpeg = true;
    const versionMatch = ffmpegVersion.match(/ffmpeg version (\S+)/);
    tools.versions.ffmpeg = versionMatch ? versionMatch[1] : '版本解析失败';
  } catch (error) {
    tools.versions.ffmpeg = `错误: ${(error as Error).message}`;
  }
  
  return tools;
}

// 🔍 测试视频信息获取
async function testVideoInfo(url: string) {
  try {
    const info = await execCommand('yt-dlp', [
      '--no-playlist',
      '--print', '%(title)s|||%(duration)s|||%(filesize)s|||%(format_id)s',
      '--quiet',
      url
    ], 10000);
    
    const [title, duration, filesize, formatId] = info.trim().split('|||');
    
    return {
      success: true,
      title: title || '未知标题',
      duration: duration || '未知时长',
      filesize: filesize || '未知大小',
      formatId: formatId || '未知格式',
      raw: info.trim()
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

// 🧪 测试参数兼容性
async function testParameterCompatibility(url: string) {
  const parameterSets = [
    {
      name: '基础参数',
      args: ['-f', 'bestaudio', '--no-playlist', '--quiet', '--simulate', url]
    },
    {
      name: '优化参数',
      args: ['-f', 'bestaudio', '--no-playlist', '--concurrent-fragments', '4', '--quiet', '--simulate', url]
    },
    {
      name: '浏览器cookies',
      args: ['-f', 'bestaudio', '--no-playlist', '--cookies-from-browser', 'chrome', '--quiet', '--simulate', url]
    }
  ];
  
  const results = [];
  
  for (const paramSet of parameterSets) {
    try {
      await execCommand('yt-dlp', paramSet.args, 5000);
      results.push({
        name: paramSet.name,
        success: true,
        message: '参数兼容'
      });
    } catch (error) {
      results.push({
        name: paramSet.name,
        success: false,
        error: (error as Error).message
      });
    }
  }
  
  return results;
}

// 🌐 测试网络连接
async function testNetworkConnectivity(url: string) {
  const tests = [];
  
  // 测试 1: 基础连通性
  try {
    await execCommand('curl', ['-I', '-s', '-L', '--max-time', '5', url], 6000);
    tests.push({ name: '基础连通性', success: true });
  } catch (error) {
    tests.push({ 
      name: '基础连通性', 
      success: false, 
      error: (error as Error).message 
    });
  }
  
  // 测试 2: YouTube API 连通性
  try {
    await execCommand('curl', ['-I', '-s', '--max-time', '3', 'https://www.youtube.com'], 4000);
    tests.push({ name: 'YouTube连通性', success: true });
  } catch (error) {
    tests.push({ 
      name: 'YouTube连通性', 
      success: false, 
      error: (error as Error).message 
    });
  }
  
  return tests;
}

// 🔨 执行命令辅助函数
function execCommand(command: string, args: string[], timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {
      env: {
        ...process.env,
        PATH: `/Users/kuangshan/Library/Python/3.9/bin:${process.env.PATH}`
      }
    });
    
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
        reject(new Error(`命令执行失败 (代码: ${code}): ${error || output}`));
      }
    });
    
    process.on('error', (err) => {
      reject(new Error(`进程启动失败: ${err.message}`));
    });
    
    // 超时处理
    const timeout = setTimeout(() => {
      process.kill('SIGTERM');
      reject(new Error(`命令执行超时 (${timeoutMs}ms)`));
    }, timeoutMs);
    
    process.on('close', () => {
      clearTimeout(timeout);
    });
  });
}